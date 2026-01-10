"use strict";
// First, install the required packages:
// npm install @langchain/core @langchain/openai @langchain/langgraph @langchain/community
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = require("@langchain/openai");
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const router = express_1.default.Router();
// Initialize OpenAI Chat Model
const llm = new openai_1.ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
});
// Define tools using LangChain's tool decorator
const findInventoryTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Inventory').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_inventory",
    description: "Find inventory/product items from database. Can search by product name, buyer, or other criteria.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search inventory")
    })
});
const findBuyersTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Buyer').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_buyers",
    description: "Find buyers/clients from database. Can search by name, email, or other criteria.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search buyers")
    })
});
const findExpensesTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const query = { ...input.query, user_id: userObjectId };
    try {
        const results = await mongoose_1.default.model('Expense').find(query);
        return { success: true, data: results };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "find_expenses",
    description: "Find expenses from database. Can search by date range, category, or amount.",
    schema: zod_1.z.object({
        query: zod_1.z.object({}).optional().describe("MongoDB query object to search expenses")
    })
});
const addBuyerTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    try {
        const response = await fetch('https://manapnl.com/api/buyers/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                ...input
            })
        });
        const result = await response.json();
        return { success: response.ok, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "add_buyer",
    description: "Add a new buyer/client to the system.",
    schema: zod_1.z.object({
        firstName: zod_1.z.string().describe("First name of the buyer"),
        lastName: zod_1.z.string().describe("Last name of the buyer"),
        email: zod_1.z.string().email().describe("Email address of the buyer"),
        phone: zod_1.z.string().optional().describe("Phone number of the buyer"),
        balance: zod_1.z.number().describe("Initial balance/outstanding amount for the buyer")
    })
});
const updateBuyerTool = (0, tools_1.tool)(async (input) => {
    try {
        const response = await fetch('https://manapnl.com/api/buyers/aiedit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        const result = await response.json();
        return { success: response.ok, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "update_buyer",
    description: "Update an existing buyer's information.",
    schema: zod_1.z.object({
        identifier: zod_1.z.string().describe("Identifier to find the buyer (email, firstName, or lastName)"),
        firstName: zod_1.z.string().optional().describe("Updated first name"),
        lastName: zod_1.z.string().optional().describe("Updated last name"),
        email: zod_1.z.string().email().optional().describe("Updated email address"),
        phone: zod_1.z.string().optional().describe("Updated phone number"),
        balance: zod_1.z.number().optional().describe("Updated balance amount")
    })
});
const addExpenseTool = (0, tools_1.tool)(async (input, config) => {
    const userId = config?.configurable?.userId;
    if (!userId)
        throw new Error("User ID required");
    try {
        const response = await fetch('https://manapnl.com/api/expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                ...input
            })
        });
        const result = await response.json();
        return { success: response.ok, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}, {
    name: "add_expense",
    description: "Add a new expense to the system.",
    schema: zod_1.z.object({
        category_name: zod_1.z.string().describe("Category name for the expense (e.g., Marketing, Transport, Packaging)"),
        amount: zod_1.z.number().positive().describe("Expense amount in dollars")
    })
});
// Create tools array
const tools = [
    findInventoryTool,
    findBuyersTool,
    findExpensesTool,
    addBuyerTool,
    updateBuyerTool,
    addExpenseTool
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
   - Add new clients/buyers
   - Update buyer balances
   - Check client balances
   - Manage outstanding amounts

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
function hasToolCalls(message) {
    return message instanceof messages_1.AIMessage &&
        'tool_calls' in message &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0;
}
// Helper function to get tool calls from message
function getToolCalls(message) {
    if (hasToolCalls(message)) {
        return message.tool_calls;
    }
    return [];
}
// Define the agent function
async function callModel(state) {
    // Prepare messages for the LLM (exclude system message from state)
    const messages = [
        { role: "system", content: systemMessage },
        ...state.messages
    ];
    try {
        const response = await llmWithTools.invoke(messages, {
            configurable: {
                userId: state.userId,
                sessionId: state.sessionId
            }
        });
        return { messages: [...state.messages, response] };
    }
    catch (error) {
        console.error("Error calling model:", error);
        const errorMessage = new messages_1.AIMessage({
            content: "❌ Sorry, I encountered an error processing your request. Please try again."
        });
        return { messages: [...state.messages, errorMessage] };
    }
}
// Define the tool execution function
async function callTools(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!hasToolCalls(lastMessage)) {
        return { messages: state.messages };
    }
    const toolCalls = getToolCalls(lastMessage);
    const toolMessages = [];
    for (const toolCall of toolCalls) {
        try {
            let result;
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
                case 'find_buyers':
                    result = await findBuyersTool.invoke(toolCall.args, toolConfig);
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
            // Create proper ToolMessage response
            toolMessages.push(new messages_1.ToolMessage({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                content: JSON.stringify(result)
            }));
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            toolMessages.push(new messages_1.ToolMessage({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                content: JSON.stringify({
                    success: false,
                    error: errorMessage
                })
            }));
        }
    }
    return { messages: [...state.messages, ...toolMessages] };
}
// Define the conditional edge function
function shouldContinue(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (hasToolCalls(lastMessage)) {
        return "tools";
    }
    // After tools execute, we should go back to the agent
    if (lastMessage instanceof messages_1.ToolMessage) {
        return "agent";
    }
    // End if it's a regular AI message without tool calls
    return langgraph_1.END;
}
// Create the state graph with proper channel definitions
const workflow = new langgraph_1.StateGraph({
    channels: {
        messages: {
            reducer: (current, update) => {
                return [...current, ...update];
            },
            default: () => []
        },
        userId: {
            reducer: (current, update) => update || current,
            default: () => ""
        },
        sessionId: {
            reducer: (current, update) => update || current,
            default: () => ""
        }
    }
})
    .addNode("agent", callModel)
    .addNode("tools", callTools)
    .addEdge(langgraph_1.START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    agent: "agent",
    [langgraph_1.END]: langgraph_1.END
})
    .addEdge("tools", "agent");
// Compile the graph
const app = workflow.compile();
// Memory store for conversations with proper typing
const conversationMemory = new Map();
// Function to clean up conversation history
function cleanConversationHistory(messages) {
    const cleaned = [];
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // Always keep human messages
        if (message instanceof messages_1.HumanMessage) {
            cleaned.push(message);
            continue;
        }
        // For AI messages with tool calls, ensure we have matching tool responses
        if (hasToolCalls(message)) {
            cleaned.push(message);
            const toolCalls = getToolCalls(message);
            const toolCallIds = new Set(toolCalls.map(tc => tc.id));
            // Look ahead for matching tool responses
            let j = i + 1;
            while (j < messages.length && toolCallIds.size > 0) {
                const nextMsg = messages[j];
                if (nextMsg instanceof messages_1.ToolMessage && toolCallIds.has(nextMsg.tool_call_id)) {
                    cleaned.push(nextMsg);
                    toolCallIds.delete(nextMsg.tool_call_id);
                }
                j++;
            }
            // Skip processed messages
            i = j - 1;
        }
        else if (message instanceof messages_1.AIMessage || message instanceof messages_1.ToolMessage) {
            // Only keep if it's part of a valid sequence
            cleaned.push(message);
        }
    }
    return cleaned;
}
// Main chat endpoint
router.post('/chat', async (req, res) => {
    try {
        const { userMessage, userId, sessionID } = req.body;
        if (!userMessage || !userId || !sessionID) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userMessage, userId, sessionID'
            });
        }
        // Get conversation history
        const conversationKey = `${userId}-${sessionID}`;
        let previousMessages = conversationMemory.get(conversationKey) || [];
        // Clean up any inconsistent message history
        previousMessages = cleanConversationHistory(previousMessages);
        // Add user message
        const newUserMessage = new messages_1.HumanMessage({ content: userMessage });
        const allMessages = [...previousMessages, newUserMessage];
        // Keep only last 20 messages to maintain context but avoid token limits
        const contextMessages = allMessages.slice(-20);
        // Run the graph
        const result = await app.invoke({
            messages: contextMessages,
            userId,
            sessionId: sessionID
        });
        // Get the final response
        const finalMessages = result.messages;
        const lastAssistantMessage = finalMessages
            .filter((msg) => msg instanceof messages_1.AIMessage && !hasToolCalls(msg))
            .pop();
        const response = lastAssistantMessage?.content || "I couldn't process your request.";
        // Store updated conversation (clean it first)
        const cleanedFinalMessages = cleanConversationHistory(finalMessages);
        conversationMemory.set(conversationKey, cleanedFinalMessages);
        // Return response
        res.json({
            success: true,
            response,
            userId,
            sessionId: sessionID
        });
    }
    catch (error) {
        console.error('AI Assistant Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});
// Optional: Add endpoint to clear conversation history
router.post('/chat/clear', async (req, res) => {
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
    }
    catch (error) {
        console.error('Clear conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});
exports.default = router;
// Package.json additions needed:
/*
{
  "dependencies": {
    "@langchain/core": "^0.2.0",
    "@langchain/openai": "^0.2.0",
    "@langchain/langgraph": "^0.0.20",
    "@langchain/community": "^0.2.0",
    "zod": "^3.22.0"
  }
}
*/ 
