import express, { Request, Response } from 'express';
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  app,
  conversationStorage,
  cleanConversationHistory,
  hasToolCalls,
  ignoreRedis,
  redisConnected,
  redisClient,
  StorageOptions
} from '../services/langgraphService';

const router = express.Router();

// Main chat endpoint
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      userMessage,
      userId,
      sessionID,
      useRedis = false,
      redisExpiry = 86400
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

    const storageOptions: StorageOptions = {
      useRedis: useRedis && !ignoreRedis && redisConnected,
      redisExpiry
    };

    const conversationKey = `${userId}-${sessionID}`;
    let previousMessages = await conversationStorage.getMessages(conversationKey, storageOptions);

    previousMessages = cleanConversationHistory(previousMessages);

    const newUserMessage = new HumanMessage({ content: userMessage });
    const initialMessages = [...previousMessages, newUserMessage];

    console.log("📝 Starting with", initialMessages.length, "messages");

    const result = await app.invoke({
      messages: initialMessages,
      userId,
      sessionId: sessionID
    });

    console.log("🎯 Graph execution complete, final messages:", result.messages.length);

    const finalMessages = result.messages;
    const lastAssistantMessage = finalMessages
      .filter((msg: BaseMessage) => msg instanceof AIMessage && !hasToolCalls(msg))
      .pop();

    const response = lastAssistantMessage?.content || "I couldn't process your request.";

    await conversationStorage.saveMessages(conversationKey, finalMessages, storageOptions);

    console.log("✅ Chat completed successfully");

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

// Graceful shutdown (specific to LangGraph Redis)
process.on('SIGINT', async () => {
  if (redisClient && !ignoreRedis) {
    console.log('Stopping LangGraph Redis client...');
    try {
      await redisClient.quit();
      console.log('✅ Redis client stopped.');
    } catch (err) {
      console.error('Error stopping Redis client:', err);
    }
  }
  process.exit(0);
});

export default router;