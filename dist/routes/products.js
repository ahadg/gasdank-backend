"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Inventory_1 = __importDefault(require("../models/Inventory"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const accessMiddleware_1 = __importDefault(require("../middlewares/accessMiddleware"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateJWT);
// GET /api/products/:userid
router.get('/:userid', (0, accessMiddleware_1.default)("inventory", "read"), async (req, res) => {
    try {
        const { userid } = req.params;
        const { category, page, limit } = req.query;
        // Convert page and limit to numbers (default values: page 1, limit 10)
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;
        // Build the query: always filter by user_id, add category filter if provided.
        const query = { user_id: userid };
        if (category) {
            query.info = { $regex: category, $options: 'i' };
        }
        // Get total number of matching documents (for pagination metadata)
        const totalProducts = await Inventory_1.default.countDocuments(query);
        // Fetch paginated results
        const products = await Inventory_1.default.find(query).skip(skip).limit(limitNum).populate("category");
        res.status(200).json({
            page: pageNum,
            limit: limitNum,
            totalProducts,
            products
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/products/:userid
router.get('/:userid/:buyerid', (0, accessMiddleware_1.default)("inventory", "read"), async (req, res) => {
    try {
        const { userid, buyerid } = req.params;
        const { category, page, limit } = req.query;
        // Convert page and limit to numbers (default values: page 1, limit 10)
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;
        // Build the query: always filter by user_id, add category filter if provided.
        const query = { user_id: userid,
            // buyer_id : buyerid 
        };
        if (category) {
            query.category = category;
        }
        // Get total number of matching documents (for pagination metadata)
        const totalProducts = await Inventory_1.default.countDocuments(query);
        // Fetch paginated results
        const products = await Inventory_1.default.find(query).skip(skip).limit(limitNum).populate("category");
        res.status(200).json({
            page: pageNum,
            limit: limitNum,
            totalProducts,
            products
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/products/product/:id - Update a buyer by ID
router.get('/product/:id', 
//checkAccess("inventory","read"),
async (req, res) => {
    try {
        console.log("id", req.params);
        // const { id } = req.params;
        // const updatedProduct = await Inventory.findById(id).populate("category");
        // if (!updatedProduct) {
        //   return res.status(404).json({ message: 'Product not found' });
        // }
        res.status(200).json({ ok: "ok" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/products/:id - Update a buyer by ID
router.put('/:id', (0, accessMiddleware_1.default)("inventory", "edit"), async (req, res) => {
    try {
        const updatedProduct = await Inventory_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json(updatedProduct);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/products
router.post('/', (0, accessMiddleware_1.default)("inventory", "create"), async (req, res) => {
    try {
        console.log("req.body", req.body);
        const newProduct = new Inventory_1.default(req.body);
        await newProduct.save();
        res.status(201).json(newProduct);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// DELETE /api/products (soft delete)
router.delete('/', (0, accessMiddleware_1.default)("inventory", "delete"), async (req, res) => {
    try {
        const { id } = req.body;
        await Inventory_1.default.findByIdAndUpdate(id, { deleted_at: new Date() });
        res.status(200).json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
exports.default = router;
