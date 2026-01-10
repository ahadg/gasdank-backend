"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const PersonalSettings_1 = __importDefault(require("../models/PersonalSettings"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = express_1.default.Router();
// Get current user's personal settings (authentication required)
router.get('/', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        console.log("PersonalSettings_called");
        const settings = await PersonalSettings_1.default.findOne({ user_id: req.user.id });
        if (!settings) {
            // Create default settings if none exist
            const defaultSettings = await PersonalSettings_1.default.create({
                user_id: req.user.id,
                units: ['pounds', 'kg', 'gram', 'per piece'],
                default_unit: 'pounds'
            });
            return res.json(defaultSettings);
        }
        res.json(settings);
    }
    catch (err) {
        console.log("err", err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Create or Update personal settings (authentication required)
router.post('/', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        const existing = await PersonalSettings_1.default.findOne({ user_id: req.user.id });
        if (existing) {
            Object.assign(existing, req.body);
            await existing.save();
            return res.json({ message: 'Settings updated', settings: existing });
        }
        else {
            const created = await PersonalSettings_1.default.create({
                ...req.body,
                user_id: req.user.id
            });
            return res.status(201).json({ message: 'Settings created', settings: created });
        }
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Update specific units (authentication required)
router.patch('/units', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        const { units } = req.body;
        if (!Array.isArray(units)) {
            return res.status(400).json({ error: 'Units must be an array' });
        }
        const settings = await PersonalSettings_1.default.findOneAndUpdate({ user_id: req.user.id }, { units }, { new: true, upsert: true });
        res.json({ message: 'Units updated', settings });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Update default unit (authentication required)
router.patch('/default-unit', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        const { default_unit } = req.body;
        if (!default_unit || typeof default_unit !== 'string') {
            return res.status(400).json({ error: 'Default unit must be a valid string' });
        }
        const settings = await PersonalSettings_1.default.findOne({ user_id: req.user.id });
        if (!settings) {
            return res.status(404).json({ error: 'Settings not found' });
        }
        // Check if the default_unit exists in the units array
        if (!settings.units.includes(default_unit)) {
            return res.status(400).json({ error: 'Default unit must be one of the existing units' });
        }
        settings.default_unit = default_unit;
        await settings.save();
        res.json({ message: 'Default unit updated', settings });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Delete personal settings (authentication required)
router.delete('/', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        await PersonalSettings_1.default.findOneAndDelete({ user_id: req.user.id });
        res.json({ message: 'Settings deleted' });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
