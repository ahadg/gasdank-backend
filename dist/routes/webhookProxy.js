"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const router = express_1.default.Router();
// Proxy route for N8N webhook
router.post('/n8n-chat', async (req, res) => {
    try {
        const { sessionID, userMessage, userId } = req.body;
        // Make request to N8N webhook
        const response = await axios_1.default.post('https://n8n.manapnl.com/webhook/d92b342a-4f9a-42cf-b56c-70afa0f4821f', {
            sessionID,
            userMessage,
            userId
        }, {
            headers: {
                'Authorization': 'SMA8LwzAXiqdFhlb0wHT',
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        });
        // Return the response from N8N
        res.json(response.data);
    }
    catch (error) {
        console.error('N8N webhook proxy error:', error);
        if (axios_1.default.isAxiosError(error)) {
            if (error.response) {
                // Forward the error response from N8N
                res.status(error.response.status).json(error.response.data);
            }
            else if (error.request) {
                // Network error
                res.status(500).json({
                    error: 'Network error connecting to webhook',
                    message: error.message
                });
            }
            else {
                // Other error
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        }
        else {
            // Other error
            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
});
exports.default = router;
