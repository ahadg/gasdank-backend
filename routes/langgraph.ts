import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import express, { Request, Response } from 'express';
import { createClient } from 'redis';
import { update_balance_buyer, addBuyerTool, addExpenseTool, addInventoryTool, findBuyersTool, findExpensesTool, findInventoryTool, updateBuyerTool } from "../utils/langchainTools";

const router = express.Router();

// Check if Redis should be ignored
const ignoreRedis = process.env.ignoreRedis === 'true';
console.log(`🔧 Redis Configuration: ${ignoreRedis ? 'DISABLED' : 'ENABLED'}`);

// Initialize Redis client only if not ignored
let redisClient: any = null;
let redisConnected = false;

if (!ignoreRedis) {
  redisClient = createClient({
    url: 'redis://localhost:6379'
  });

  // Connect to Redis
  redisClient.on('error', (err: any) => {
    console.error('Redis Client Error:', err);
    redisConnected = false;
  });

  redisClient.on('connect', () => {
    console.log('✅ Connected to Redis');
    redisConnected = true;
  });

  redisClient.on('disconnect', () => {
    console.log('❌ Disconnected from Redis');
    redisConnected = false;
  });

  // Connect to Redis (async)
  (async () => {
    try {
      await redisClient.connect();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      redisConnected = false;
    }
  })();
} else {
  console.log('⚠️ Redis connection skipped due to ignoreRedis=true');
}

// Initialize OpenAI Chat Model
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Define the state interface
interface AgentState {
  messages: BaseMessage[];
  userId: string;
  sessionId: string;
}

// Storage interface
interface StorageOptions {
  useRedis: boolean;
  redisExpiry?: number; // TTL in seconds (default: 1 hour)
}

// Create tools array
const tools = [
  findInventoryTool,
  findBuyersTool,
  update_balance_buyer,
  findExpensesTool,
  addBuyerTool,
  updateBuyerTool,
  addExpenseTool,
  addInventoryTool
];

// Bind tools to the LLM
const llmWithTools = llm.bindTools(tools);

// System message
const systemMessage = `You are a structured AI business assistant operating through a command-style chat interface. Users send business commands and questions in plain language. Your job is to process valid business commands, respond to FAQs, and guide users politely when input is unrecognized.

📊 DATA CONTEXT
You have access to the following MongoDB collections:
- inventories: Product/inventory management
- buyers: Client/buyer information and balances
- expenses: Business expense tracking
- categories: Product and expense categories

✅ PRIMARY FUNCTIONS
You can process the following types of inputs:

1. INVENTORY/PRODUCT MANAGEMENT
   - Add new inventory items
   - Update existing inventory
   - Check inventory status
   - Get inventory data

2. BUYER/CLIENT MANAGEMENT
   - Add new clients/buyers, if buyer has outstanding balance then convert postive number to negative
   - Update buyer
   - Check client balances
   - Manage outstanding amounts
   - Update Buyer Balance, recieved from a or give to client/buyer,

3. EXPENSE TRACKING
   - Log new expenses
   - Retrieve expense history
   - Categorize expenses

4. GENERAL QUERIES
   - Business-related FAQs
   - Data retrieval requests

🙋 RESPONSE FORMAT

SUCCESS responses examples:
✅ "Added 1 Pound Kush to inventory (ID: MANA-123456). Jack's balance updated to $1300."
✅ "Logged $500 packaging expense successfully."
✅ "Emily's current balance: $2,150.00"

ERROR responses examples:
❌ "Could not find buyer 'Emily'. Please check the name or add them as a new client."
❌ "Invalid amount format. Please specify a valid dollar amount."

🔐 VALIDATION RULES
- Always validate user_id is present
- Verify buyer exists before updating balances
- Ensure positive amounts for inventory and expenses
- Validate email format for new buyers
- Always confirm actions with specific details
- Respond with ✅ for success, ❌ for errors, ❓ for clarification needed

🚫 RESTRICTIONS
- Only process business-related commands
- Do not make up data or IDs
- Always confirm actions with specific details`;

// Helper function to check if message has tool calls
function hasToolCalls(message: BaseMessage): boolean {
  return message instanceof AIMessage &&
    'tool_calls' in message &&
    Array.isArray((message as any).tool_calls) &&
    (message as any).tool_calls.length > 0;
}

// Helper function to get tool calls from message
function getToolCalls(message: BaseMessage): any[] {
  if (hasToolCalls(message)) {
    return (message as any).tool_calls;
  }
  return [];
}

// Function to serialize messages for Redis storage
function serializeMessages(messages: BaseMessage[]): string {
  const serialized = messages.map(msg => {
    if (msg instanceof HumanMessage) {
      return {
        type: 'human',
        content: msg.content,
        id: msg.id
      };
    } else if (msg instanceof AIMessage) {
      return {
        type: 'ai',
        content: msg.content,
        id: msg.id,
        tool_calls: hasToolCalls(msg) ? getToolCalls(msg) : undefined
      };
    } else if (msg instanceof ToolMessage) {
      return {
        type: 'tool',
        content: msg.content,
        id: msg.id,
        tool_call_id: msg.tool_call_id,
        name: msg.name
      };
    }
    return {
      type: 'unknown',
      content: msg.content,
      id: msg.id
    };
  });

  return JSON.stringify(serialized);
}

// Function to deserialize messages from Redis storage
function deserializeMessages(serialized: string): BaseMessage[] {
  try {
    const parsed = JSON.parse(serialized);

    return parsed.map((msg: any) => {
      switch (msg.type) {
        case 'human':
          return new HumanMessage({
            content: msg.content,
            id: msg.id
          });
        case 'ai':
          const aiMsg = new AIMessage({
            content: msg.content,
            id: msg.id
          });
          if (msg.tool_calls) {
            (aiMsg as any).tool_calls = msg.tool_calls;
          }
          return aiMsg;
        case 'tool':
          return new ToolMessage({
            content: msg.content,
            id: msg.id,
            tool_call_id: msg.tool_call_id,
            name: msg.name
          });
        default:
          return new HumanMessage({
            content: msg.content,
            id: msg.id
          });
      }
    });
  } catch (error) {
    console.error('Error deserializing messages:', error);
    return [];
  }
}

// Storage manager class
class ConversationStorage {
  private memoryStore = new Map<string, BaseMessage[]>();

  async getMessages(
    conversationKey: string,
    options: StorageOptions
  ): Promise<BaseMessage[]> {
    // Force memory storage if Redis is ignored or not connected
    if (ignoreRedis || !redisConnected || !options.useRedis) {
      console.log(`📖 Retrieved conversation from memory: ${conversationKey}`);
      return this.memoryStore.get(conversationKey) || [];
    }

    if (options.useRedis && redisClient) {
      try {
        const serialized = await redisClient.get(`conversation:${conversationKey}`);
        if (serialized) {
          console.log(`📖 Retrieved conversation from Redis: ${conversationKey}`);
          return deserializeMessages(serialized);
        }
      } catch (error) {
        console.error('❌ Redis get error:', error);
        // Fallback to memory storage
        console.log(`📖 Retrieved conversation from memory (Redis fallback): ${conversationKey}`);
        return this.memoryStore.get(conversationKey) || [];
      }
    }

    console.log(`📖 Retrieved conversation from memory: ${conversationKey}`);
    return this.memoryStore.get(conversationKey) || [];
  }

  async saveMessages(
    conversationKey: string,
    messages: BaseMessage[],
    options: StorageOptions
  ): Promise<void> {
    // Always save to memory as backup
    this.memoryStore.set(conversationKey, messages);

    // Skip Redis if ignored or not connected
    if (ignoreRedis || !redisConnected || !options.useRedis) {
      console.log(`💾 Saved conversation to memory: ${conversationKey}`);
      return;
    }

    if (options.useRedis && redisClient) {
      try {
        const serialized = serializeMessages(messages);
        const expiry = options.redisExpiry || 3600; // Default 1 hour
        await redisClient.setEx(`conversation:${conversationKey}`, expiry, serialized);
        console.log(`💾 Saved conversation to Redis: ${conversationKey} (TTL: ${expiry}s)`);
      } catch (error) {
        console.error('❌ Redis save error:', error);
        console.log(`💾 Saved conversation to memory (Redis fallback): ${conversationKey}`);
      }
    } else {
      console.log(`💾 Saved conversation to memory: ${conversationKey}`);
    }
  }

  async clearConversation(
    conversationKey: string,
    options: StorageOptions
  ): Promise<void> {
    // Always clear from memory
    this.memoryStore.delete(conversationKey);

    // Skip Redis if ignored or not connected
    if (ignoreRedis || !redisConnected || !options.useRedis) {
      console.log(`🗑️ Cleared conversation from memory: ${conversationKey}`);
      return;
    }

    if (options.useRedis && redisClient) {
      try {
        await redisClient.del(`conversation:${conversationKey}`);
        console.log(`🗑️ Cleared conversation from Redis: ${conversationKey}`);
      } catch (error) {
        console.error('❌ Redis delete error:', error);
      }
    }

    console.log(`🗑️ Cleared conversation from memory: ${conversationKey}`);
  }
}

// Initialize storage manager
const conversationStorage = new ConversationStorage();

// FIXED: Function to deduplicate messages
function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
  const seen = new Set();
  const deduplicated: BaseMessage[] = [];

  for (const message of messages) {
    // Create a unique key for each message
    let key: string;
    if (message instanceof HumanMessage) {
      key = `human:${message.content}`;
    } else if (message instanceof AIMessage) {
      const toolCalls = hasToolCalls(message) ? JSON.stringify(getToolCalls(message)) : '';
      key = `ai:${message.content}:${toolCalls}`;
    } else if (message instanceof ToolMessage) {
      key = `tool:${message.tool_call_id}:${message.name}:${message.content}`;
    } else {
      key = `${message.constructor.name}:${message.content}`;
    }

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(message);
    }
  }

  return deduplicated;
}

// FIXED: Function to validate and clean message sequence
function validateAndCleanMessages(messages: BaseMessage[]): BaseMessage[] {
  const cleaned = deduplicateMessages(messages);
  const pendingToolCalls = new Map<string, any>();
  const validatedMessages: BaseMessage[] = [];

  for (const message of cleaned) {
    if (hasToolCalls(message)) {
      // AI message with tool calls
      validatedMessages.push(message);
      const toolCalls = getToolCalls(message);
      for (const toolCall of toolCalls) {
        pendingToolCalls.set(toolCall.id, toolCall);
      }
    } else if (message instanceof ToolMessage && message.tool_call_id) {
      // Tool response - only include if we have the corresponding tool call
      if (pendingToolCalls.has(message.tool_call_id)) {
        validatedMessages.push(message);
        pendingToolCalls.delete(message.tool_call_id);
      }
    } else {
      // Regular message
      validatedMessages.push(message);
    }
  }

  return validatedMessages;
}

// Define the agent function
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  console.log("🤖 callModel - Processing", state.messages.length, "messages");

  // FIXED: Clean and validate messages before sending to LLM
  const cleanedMessages = validateAndCleanMessages(state.messages);

  // Prepare messages for the LLM
  const messages = [
    { role: "system", content: systemMessage },
    ...cleanedMessages
  ];

  try {
    console.log("🤖 callModel - llmWithTools_invoke", "passing_userId,sessionId");
    const response = await llmWithTools.invoke(messages, {
      configurable: {
        userId: state.userId,
        sessionId: state.sessionId
      }
    });
    console.log("🤖 callModel - response received");
    console.log("✅ Model response received, has tool calls:", hasToolCalls(response));

    // FIXED: Return cleaned messages plus new response
    return { messages: [...cleanedMessages, response] };
  } catch (error) {
    console.error("❌ Error calling model:", error);
    const errorMessage = new AIMessage({
      content: "❌ Sorry, I encountered an error processing your request. Please try again."
    });
    return { messages: [...cleanedMessages, errorMessage] };
  }
}

// Define the tool execution function
async function callTools(state: AgentState): Promise<Partial<AgentState>> {
  console.log("🔧 callTools - Executing tools");

  const lastMessage = state.messages[state.messages.length - 1];

  if (!hasToolCalls(lastMessage)) {
    console.log("⚠️ No tool calls found in last message");
    return { messages: state.messages };
  }

  const toolCalls = getToolCalls(lastMessage);
  console.log("🛠️ Found", toolCalls.length, "tool calls");

  const toolMessages: BaseMessage[] = [];

  for (const toolCall of toolCalls) {
    console.log("⚙️ Executing tool:", toolCall.name);

    try {
      let result: any;
      const toolConfig = {
        configurable: {
          userId: state.userId,
          sessionId: state.sessionId
        }
      };

      // Execute the appropriate tool
      switch (toolCall.name) {
        case 'find_inventory':
          result = await findInventoryTool.invoke(toolCall.args, toolConfig);
          break;
        case 'add_inventory':
          result = await addInventoryTool.invoke(toolCall.args, toolConfig);
          break;
        case 'find_buyers':
          result = await findBuyersTool.invoke(toolCall.args, toolConfig);
          break;
        case 'update_balance_buyer':
          result = await update_balance_buyer.invoke(toolCall.args, toolConfig);
          break;
        case 'find_expenses':
          result = await findExpensesTool.invoke(toolCall.args, toolConfig);
          break;
        case 'add_buyer':
          result = await addBuyerTool.invoke(toolCall.args, toolConfig);
          break;
        case 'update_buyer':
          result = await updateBuyerTool.invoke(toolCall.args);
          break;
        case 'add_expense':
          result = await addExpenseTool.invoke(toolCall.args, toolConfig);
          break;
        default:
          result = {
            success: false,
            error: `Unknown tool: ${toolCall.name}`
          };
      }

      // FIXED: Create proper ToolMessage response with correct structure
      const toolMessage = new ToolMessage({
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(result)
      });

      toolMessages.push(toolMessage);
      console.log("✅ Tool executed successfully:", toolCall.name);

    } catch (error: unknown) {
      console.error("❌ Tool execution error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const toolMessage = new ToolMessage({
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify({
          success: false,
          error: errorMessage
        })
      });
      toolMessages.push(toolMessage);
    }
  }

  console.log("🔧 Tool execution complete, returning", toolMessages.length, "tool messages");
  return { messages: [...state.messages, ...toolMessages] };
}

// FIXED: Improved conditional edge function
function shouldContinue(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1];

  console.log("🔀 shouldContinue - Last message type:", lastMessage.constructor.name);

  // If the last message is an AI message with tool calls, go to tools
  if (hasToolCalls(lastMessage)) {
    console.log("➡️ Going to tools");
    return "tools";
  }

  // If the last message is a tool message, we need to go back to the agent
  if (lastMessage instanceof ToolMessage) {
    console.log("➡️ Tool message received, going back to agent");
    return "agent";
  }

  // If it's a regular AI message without tool calls, we're done
  if (lastMessage instanceof AIMessage) {
    console.log("🏁 Ending conversation - AI response without tool calls");
    return END;
  }

  // Default case - should not happen
  console.log("🏁 Ending conversation - default case");
  return END;
}

// FIXED: Create the state graph with proper channel definitions
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      reducer: (current: BaseMessage[], update: BaseMessage[]) => {
        // FIXED: Properly merge messages without duplication
        const combined = [...current, ...update];
        return validateAndCleanMessages(combined);
      },
      default: () => []
    },
    userId: {
      reducer: (current: string, update: string) => update || current,
      default: () => ""
    },
    sessionId: {
      reducer: (current: string, update: string) => update || current,
      default: () => ""
    }
  }
})
  .addNode("agent", callModel)
  .addNode("tools", callTools)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    [END]: END
  })
  .addEdge("tools", "agent");

// Compile the graph
const app = workflow.compile();

// Function to clean up conversation history
function cleanConversationHistory(messages: BaseMessage[]): BaseMessage[] {
  // Keep only the last 10 complete exchanges to prevent memory bloat
  const maxMessages = 20;

  if (messages.length <= maxMessages) {
    return validateAndCleanMessages(messages);
  }

  // Find a good cutoff point (after a complete exchange)
  let cutoffIndex = messages.length - maxMessages;

  // Move cutoff to after a human message to maintain conversation flow
  for (let i = cutoffIndex; i < messages.length; i++) {
    if (messages[i] instanceof HumanMessage) {
      cutoffIndex = i;
      break;
    }
  }

  return validateAndCleanMessages(messages.slice(cutoffIndex));
}

// Main chat endpoint
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      userMessage,
      userId,
      sessionID,
      useRedis = false,
      redisExpiry = 86400 // 60 seconds * 60 minutes * 24 hours = 86400 seconds
    } = req.body;

    if (!userMessage || !userId || !sessionID) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userMessage, userId, sessionID'
      });
    }

    console.log("💬 New chat request:", {
      userId,
      sessionID,
      useRedis: useRedis && !ignoreRedis && redisConnected,
      redisExpiry,
      message: userMessage.substring(0, 50) + "..."
    });

    // Storage options - force memory if Redis is ignored
    const storageOptions: StorageOptions = {
      useRedis: useRedis && !ignoreRedis && redisConnected,
      redisExpiry
    };

    // Get conversation history
    const conversationKey = `${userId}-${sessionID}`;
    let previousMessages = await conversationStorage.getMessages(conversationKey, storageOptions);

    // Clean up conversation history
    previousMessages = cleanConversationHistory(previousMessages);

    // Add user message
    const newUserMessage = new HumanMessage({ content: userMessage });
    const initialMessages = [...previousMessages, newUserMessage];

    console.log("📝 Starting with", initialMessages.length, "messages");

    // Run the graph
    const result = await app.invoke({
      messages: initialMessages,
      userId,
      sessionId: sessionID
    });

    console.log("🎯 Graph execution complete, final messages:", result.messages.length);

    // Get the final response (last AI message without tool calls)
    const finalMessages = result.messages;
    const lastAssistantMessage = finalMessages
      .filter((msg: BaseMessage) => msg instanceof AIMessage && !hasToolCalls(msg))
      .pop();

    const response = lastAssistantMessage?.content || "I couldn't process your request.";

    // Store updated conversation
    await conversationStorage.saveMessages(conversationKey, finalMessages, storageOptions);

    console.log("✅ Chat completed successfully");

    // Return response
    res.json({
      success: true,
      response,
      userId,
      sessionId: sessionID,
      storageUsed: storageOptions.useRedis ? 'redis' : 'memory'
    });

  } catch (error: any) {
    console.error('❌ AI Assistant Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Clear conversation endpoint
router.post('/chat/clear', async (req: Request, res: Response) => {
  try {
    const { userId, sessionID, useRedis = false } = req.body;

    if (!userId || !sessionID) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, sessionID'
      });
    }

    const conversationKey = `${userId}-${sessionID}`;
    const storageOptions: StorageOptions = {
      useRedis: useRedis && !ignoreRedis && redisConnected
    };

    await conversationStorage.clearConversation(conversationKey, storageOptions);

    res.json({
      success: true,
      message: 'Conversation history cleared',
      storageUsed: storageOptions.useRedis ? 'redis' : 'memory'
    });

  } catch (error: any) {
    console.error('Clear conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  try {
    let redisStatus = 'disabled';

    if (!ignoreRedis && redisClient) {
      try {
        await redisClient.ping();
        redisStatus = 'connected';
      } catch (error) {
        redisStatus = 'error';
      }
    }

    res.json({
      success: true,
      status: 'healthy',
      redis: redisStatus,
      redisIgnored: ignoreRedis,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (redisClient && !ignoreRedis) {
    await redisClient.quit();
  }
  process.exit(0);
});

export default router;