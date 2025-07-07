// First, install the required packages:
// npm install @langchain/core @langchain/openai @langchain/langgraph @langchain/community

import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import express, { Request, Response } from 'express';
import { update_balance_buyer, addBuyerTool, addExpenseTool, addInventoryTool, findBuyersTool, findExpensesTool, findInventoryTool, updateBuyerTool } from "../utils/langchainTools";
const router = express.Router();

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

SUCCESS responses:
✅ "Added 1 Pound Kush to inventory (ID: MANA-123456). Jack's balance updated to $1300."
✅ "Logged $500 packaging expense successfully."
✅ "Emily's current balance: $2,150.00"

ERROR responses:
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

// Memory store for conversations with proper typing
const conversationMemory = new Map<string, BaseMessage[]>();

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
    const { userMessage, userId, sessionID } = req.body;

    if (!userMessage || !userId || !sessionID) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userMessage, userId, sessionID'
      });
    }

    console.log("💬 New chat request:", { userId, sessionID, message: userMessage.substring(0, 50) + "..." });

    // Get conversation history
    const conversationKey = `${userId}-${sessionID}`;
    let previousMessages = conversationMemory.get(conversationKey) || [];

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
    conversationMemory.set(conversationKey, finalMessages);

    console.log("✅ Chat completed successfully");

    // Return response
    res.json({
      success: true,
      response,
      userId,
      sessionId: sessionID
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

// Optional: Add endpoint to clear conversation history
router.post('/chat/clear', async (req: Request, res: Response) => {
  try {
    const { userId, sessionID } = req.body;
    
    if (!userId || !sessionID) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, sessionID'
      });
    }

    const conversationKey = `${userId}-${sessionID}`;
    conversationMemory.delete(conversationKey);

    res.json({
      success: true,
      message: 'Conversation history cleared'
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

export default router;