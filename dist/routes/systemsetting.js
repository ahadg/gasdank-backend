"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const SystemSettings_1 = __importDefault(require("../models/SystemSettings"));
const accessMiddleware_1 = require("../middlewares/accessMiddleware");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
// Get current system settings (no authentication required)
router.get('/', async (req, res) => {
    try {
        const settings = await SystemSettings_1.default.findOne();
        if (!settings)
            return res.status(404).json({ message: 'Settings not found' });
        res.json(settings);
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Create or Update system settings (SuperAdmin only, authentication required)
router.post('/', authMiddleware_1.authenticateJWT, accessMiddleware_1.isSuperAdmin, async (req, res) => {
    try {
        const existing = await SystemSettings_1.default.findOne();
        if (existing) {
            Object.assign(existing, req.body);
            await existing.save();
            return res.json({ message: 'Settings updated', settings: existing });
        }
        else {
            const created = await SystemSettings_1.default.create(req.body);
            return res.status(201).json({ message: 'Settings created', settings: created });
        }
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
