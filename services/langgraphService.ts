import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { createClient } from 'redis';
import { update_balance_buyer, addBuyerTool, addExpenseTool, addInventoryTool, findBuyersTool, findExpensesTool, findInventoryTool, updateBuyerTool } from "../utils/langchainTools";

// Check if Redis should be ignored
export const ignoreRedis = process.env.ignoreRedis === 'true';

// Initialize Redis client only if not ignored
export let redisClient: any = null;
export let redisConnected = false;

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
            if (redisClient) {
                await redisClient.connect();
            }
        } catch (error) {
            console.error('❌ Failed to connect to Redis:', error);
            redisConnected = false;
        }
    })();
}

// Initialize OpenAI Chat Model
const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

// Define the state interface
export interface AgentState {
    messages: BaseMessage[];
    userId: string;
    sessionId: string;
}

// Storage interface
export interface StorageOptions {
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
export function hasToolCalls(message: BaseMessage): boolean {
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
export class ConversationStorage {
    private memoryStore = new Map<string, BaseMessage[]>();

    async getMessages(
        conversationKey: string,
        options: StorageOptions
    ): Promise<BaseMessage[]> {
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
                return this.memoryStore.get(conversationKey) || [];
            }
        }

        return this.memoryStore.get(conversationKey) || [];
    }

    async saveMessages(
        conversationKey: string,
        messages: BaseMessage[],
        options: StorageOptions
    ): Promise<void> {
        this.memoryStore.set(conversationKey, messages);

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
            }
        }
    }

    async clearConversation(
        conversationKey: string,
        options: StorageOptions
    ): Promise<void> {
        this.memoryStore.delete(conversationKey);

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
    }
}

// Initialize storage manager
export const conversationStorage = new ConversationStorage();

// FIXED: Function to deduplicate messages
export function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
    const seen = new Set();
    const deduplicated: BaseMessage[] = [];

    for (const message of messages) {
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
export function validateAndCleanMessages(messages: BaseMessage[]): BaseMessage[] {
    const cleaned = deduplicateMessages(messages);
    const pendingToolCalls = new Map<string, any>();
    const validatedMessages: BaseMessage[] = [];

    for (const message of cleaned) {
        if (hasToolCalls(message)) {
            validatedMessages.push(message);
            const toolCalls = getToolCalls(message);
            for (const toolCall of toolCalls) {
                pendingToolCalls.set(toolCall.id, toolCall);
            }
        } else if (message instanceof ToolMessage && message.tool_call_id) {
            if (pendingToolCalls.has(message.tool_call_id)) {
                validatedMessages.push(message);
                pendingToolCalls.delete(message.tool_call_id);
            }
        } else {
            validatedMessages.push(message);
        }
    }

    return validatedMessages;
}

// Define the agent function
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
    console.log("🤖 callModel - Processing", state.messages.length, "messages");
    const cleanedMessages = validateAndCleanMessages(state.messages);
    const messages = [
        { role: "system", content: systemMessage },
        ...cleanedMessages
    ];

    try {
        const response = await llmWithTools.invoke(messages, {
            configurable: {
                userId: state.userId,
                sessionId: state.sessionId
            }
        });
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
    const lastMessage = state.messages[state.messages.length - 1];
    if (!hasToolCalls(lastMessage)) {
        return { messages: state.messages };
    }

    const toolCalls = getToolCalls(lastMessage);
    const toolMessages: BaseMessage[] = [];

    for (const toolCall of toolCalls) {
        try {
            let result: any;
            const toolConfig = {
                configurable: {
                    userId: state.userId,
                    sessionId: state.sessionId
                }
            };

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
                    result = { success: false, error: `Unknown tool: ${toolCall.name}` };
            }

            const toolMessage = new ToolMessage({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                content: JSON.stringify(result)
            });

            toolMessages.push(toolMessage);
        } catch (error: any) {
            console.error("❌ Tool execution error:", error);
            const toolMessage = new ToolMessage({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                content: JSON.stringify({
                    success: false,
                    error: error.message || 'Unknown error'
                })
            });
            toolMessages.push(toolMessage);
        }
    }

    return { messages: [...state.messages, ...toolMessages] };
}

// FIXED: Improved conditional edge function
function shouldContinue(state: AgentState): string {
    const lastMessage = state.messages[state.messages.length - 1];
    if (hasToolCalls(lastMessage)) return "tools";
    if (lastMessage instanceof ToolMessage) return "agent";
    if (lastMessage instanceof AIMessage) return END;
    return END;
}

// FIXED: Create the state graph
const workflow = new StateGraph<AgentState>({
    channels: {
        messages: {
            reducer: (current: BaseMessage[], update: BaseMessage[]) => {
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
export const app = workflow.compile();

// Function to clean up conversation history
export function cleanConversationHistory(messages: BaseMessage[]): BaseMessage[] {
    const maxMessages = 20;
    if (messages.length <= maxMessages) {
        return validateAndCleanMessages(messages);
    }

    let cutoffIndex = messages.length - maxMessages;
    for (let i = cutoffIndex; i < messages.length; i++) {
        if (messages[i] instanceof HumanMessage) {
            cutoffIndex = i;
            break;
        }
    }

    return validateAndCleanMessages(messages.slice(cutoffIndex));
}
