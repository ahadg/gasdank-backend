"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const User_1 = __importDefault(require("../models/User"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const router = (0, express_1.Router)();
//router.use(authenticateJWT);
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { identifier, pin } = req.body;
    console.log({ identifier, pin });
    if (!identifier || !pin) {
        return res.status(400).json({ message: 'Identifier and PIN are required' });
    }
    try {
        const normalizedIdentifier = identifier.toLowerCase();
        // Case-insensitive search for email or userName
        const user = await User_1.default.findOne({
            $or: [
                { $expr: { $eq: [{ $toLower: '$email' }, normalizedIdentifier] } },
                { $expr: { $eq: [{ $toLower: '$userName' }, normalizedIdentifier] } }
            ]
        });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcrypt_1.default.compare(pin, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // if(!user.plan && user.role !== 'superadmin') {
        //   return res.status(401).json({ message: 'Please subscribe to a plan first' });
        // }
        const token = jsonwebtoken_1.default.sign({ id: user._id, email: user.email, access: user.access }, process.env.JWT_SECRET, { expiresIn: '297d' });
        res.status(200).json({ message: 'Login successful', token, user });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error', error });
    }
});
exports.default = router;
