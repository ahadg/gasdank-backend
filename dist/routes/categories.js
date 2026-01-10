"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Category_1 = __importDefault(require("../models/Category"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const accessMiddleware_1 = __importDefault(require("../middlewares/accessMiddleware"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateJWT);
router.get('/:userid', (0, accessMiddleware_1.default)("config.categories", "read"), async (req, res) => {
    try {
        const { userid } = req.params;
        const user = await User_1.default.findById(userid);
        let userid_admin = user?.created_by || null;
        const query = {
            $or: userid_admin
                ? [{ user_id: userid }, { user_id: userid_admin }]
                : [{ user_id: userid }],
        };
        const categories = await Category_1.default.find(query);
        res.status(200).json(categories);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// POST /api/categories
router.post('/', (0, accessMiddleware_1.default)("config.categories", "create"), async (req, res) => {
    try {
        const newCategory = new Category_1.default(req.body);
        await newCategory.save();
        res.status(201).json(newCategory);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// PUT /api/categories
router.put('/', (0, accessMiddleware_1.default)("config.categories", "edit"), async (req, res) => {
    try {
        const { id } = req.body;
        console.log("updated Data", req.body?.formData);
        const updatedCategory = await Category_1.default.findByIdAndUpdate(id, req.body?.formData, { new: true });
        res.status(200).json(updatedCategory);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// DELETE /api/categories
router.delete('/', (0, accessMiddleware_1.default)("config.categories", "delete"), async (req, res) => {
    try {
        const { id } = req.body;
        await Category_1.default.findByIdAndDelete(id);
        res.status(200).json({ message: 'Category deleted' });
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
exports.default = router;
