"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Inventory_1 = __importDefault(require("../models/Inventory"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const accessMiddleware_1 = __importDefault(require("../middlewares/accessMiddleware"));
const User_1 = __importDefault(require("../models/User"));
const activity_1 = require("./activity");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateJWT);
// GET /api/inventory/next-reference-number - Get next available reference number
router.get('/next-reference-number', (0, accessMiddleware_1.default)("inventory", "read"), async (req, res) => {
    try {
        const lastProduct = await Inventory_1.default.findOne({})
            .sort({ reference_number: -1 })
            .select('reference_number');
        //***** InventorySchema.pre('save' check in inventory Model
        const lastRef = lastProduct?.reference_number;
        const nextReferenceNumber = (typeof lastRef === 'number' && !isNaN(lastRef)) ? lastRef + 1 : 1;
        res.status(200).json({ nextReferenceNumber });
    }
    catch (error) {
        console.error('Error getting next reference number:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/inventory/outOfStock
router.get('/outOfStock', (0, accessMiddleware_1.default)("reports", "read"), async (req, res) => {
    try {
        const userId = req.user?.id;
        const outOfStock = await Inventory_1.default.find({ qty: 0, user_id: userId }).populate("category");
        res.status(200).json(outOfStock);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// GET /api/inventory/lowInventory
router.get('/lowInventory', (0, accessMiddleware_1.default)("reports", "read"), async (req, res) => {
    try {
        const userId = req.user?.id;
        const lowInventory = await Inventory_1.default.find({ qty: { $gt: -1, $lt: 5 }, user_id: userId }).populate("category");
        res.status(200).json(lowInventory);
    }
    catch (error) {
        res.status(500).json({ error });
    }
});
// GET /api/inventory/:userid
router.get('/:userid', (0, accessMiddleware_1.default)("inventory", "read"), async (req, res) => {
    try {
        const { userid } = req.params;
        const { category, page, limit, qty } = req.query;
        // find user
        const user = await User_1.default.findById(userid);
        let userid_admin = user?.created_by || null;
        // pagination
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;
        // build query
        const query = {
            $or: userid_admin
                ? [{ user_id: userid }, { user_id: userid_admin }]
                : [{ user_id: userid }, { user_created_by_id: userid }],
        };
        console.log("query", query);
        if (category) {
            query.category = category;
        }
        if (qty === 'gt0') {
            query.qty = { $gt: 0 };
        }
        // fetch data
        const totalProducts = await Inventory_1.default.countDocuments(query);
        const products = await Inventory_1.default.find(query)
            .skip(skip)
            .limit(limitNum)
            .populate("category");
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
// GET /api/inventory/:userid/:buyerid
router.get('/:userid/inventory/:buyerid', (0, accessMiddleware_1.default)('inventory', 'read'), async (req, res) => {
    try {
        const { userid /*, buyerid*/ } = req.params;
        const { category, page, limit } = req.query;
        const user = await User_1.default.findById(userid).lean();
        const userid_admin = user?.created_by || null;
        // Pagination (defaults)
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (pageNum - 1) * limitNum;
        // Build query
        const query = {
            $or: userid_admin
                ? [{ user_id: userid }, { user_id: userid_admin }]
                : [{ user_id: userid }, { user_created_by_id: userid }],
            qty: { $gt: 0 },
        };
        if (category) {
            query.category = category;
        }
        const [totalProducts, products] = await Promise.all([
            Inventory_1.default.countDocuments(query),
            Inventory_1.default.find(query)
                .skip(skip)
                .limit(limitNum)
                .populate('category')
                .lean(),
        ]);
        res.status(200).json({
            page: pageNum,
            limit: limitNum,
            totalProducts,
            products,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/inventory/product/:id - Update a buyer by ID
router.get('/product/:id', (0, accessMiddleware_1.default)("inventory", "read"), async (req, res) => {
    try {
        console.log("id", req.params);
        const { id } = req.params;
        const updatedProduct = await Inventory_1.default.findById(id).populate("category").populate("buyer_id");
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(updatedProduct);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/inventory/:id - Update a Product by ID
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
// POST /api/inventory
router.post('/', (0, accessMiddleware_1.default)("inventory", "create"), async (req, res) => {
    try {
        const { reference_number } = req.body;
        // Check if inventory with same reference_number already exists
        if (reference_number) {
            const existingInventory = await Inventory_1.default.findOne({ reference_number });
            if (existingInventory) {
                return res.status(400).json({ error: 'Inventory with this reference number already exists' });
            }
        }
        const the_user = await User_1.default.findById(req.user?.id);
        const newProduct = new Inventory_1.default({ ...req.body, user_created_by_id: the_user?.created_by });
        await newProduct.save();
        (0, activity_1.createActivity)({
            user_id: req.user?.id,
            user_created_by: the_user?.created_by,
            action: 'create',
            resource_type: 'inventory',
            page: 'inventory',
            type: 'inventory_created',
            description: `create new inventory ${req.body.name}`,
        });
        res.status(201).json(newProduct);
    }
    catch (error) {
        console.log("error", error);
        res.status(500).json({ error: error.message || error });
    }
});
exports.default = router;
