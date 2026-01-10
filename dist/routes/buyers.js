"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Buyer_1 = __importDefault(require("../models/Buyer"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const accessMiddleware_1 = __importDefault(require("../middlewares/accessMiddleware"));
const activity_1 = require("./activity");
const transactionHandler_1 = require("../utils/transactionHandler");
const User_1 = __importDefault(require("../models/User"));
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
router.put('/aiedit', async (req, res) => {
    try {
        const { identifier, ...updateFields } = req.body;
        if (!identifier) {
            return res.status(400).json({ error: 'Missing identifier (email, firstName, or lastName)' });
        }
        // Determine the search field based on identifier format
        let query = {};
        if (typeof identifier === 'string') {
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
            if (isEmail) {
                query.email = identifier;
            }
            else {
                // Fallback to searching both firstName and lastName
                query = {
                    $or: [
                        { firstName: identifier },
                        { lastName: identifier }
                    ]
                };
            }
        }
        else {
            return res.status(400).json({ error: 'Identifier must be a string (email, firstName, or lastName)' });
        }
        const updatedBuyer = await Buyer_1.default.findOneAndUpdate(query, updateFields, { new: true });
        if (!updatedBuyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json(updatedBuyer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.use(authMiddleware_1.authenticateJWT);
// POST /api/buyers - Create a new buyer
router.post('/', async (req, res) => {
    try {
        const requiredFields = ['user_id', 'firstName',
            // 'lastName', 'email', 'phone'
        ];
        console.log("req.body", req.body);
        // Check if all required fields are present
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }
        const { email, user_id } = req.body;
        //Check if a buyer with the same email already exists
        if (email) {
            const existingBuyer = await Buyer_1.default.findOne({ email });
            if (existingBuyer) {
                return res.status(400).json({ error: 'A Client with this email already exists.' });
            }
        }
        //Assign currentBalance and startingBalance if balance is provided
        // Assign currentBalance and startingBalance properly (support negative numbers)
        // Assign currentBalance and startingBalance properly (support negative numbers)
        if (req.body.balance !== undefined) {
            if (req.body.currentBalance === undefined) {
                req.body.currentBalance = req.body.balance;
            }
            if (req.body.startingBalance === undefined) {
                req.body.startingBalance = req.body.balance;
                req.body.currentBalance = 0; // handled later by transactions
            }
        }
        // Final validation
        // if (!req.body.currentBalance || !req.body.startingBalance) {
        //   return res.status(400).json({ error: 'Missing required field: currentBalance or startingBalance' });
        // }
        const user = await User_1.default.findById(user_id);
        // Validate balance BEFORE creating buyer
        let c_balance = req.body.currentBalance || req.body.startingBalance || req.body?.balance;
        const final_balance = Math.abs(c_balance);
        const payment_direction = c_balance < 0 ? "given" : "received";
        const payment_method = req.body.payment_method || "Cash";
        // Now create the buyer
        let obj = { ...req.body };
        if (user.created_by) {
            obj.created_by_role = "user";
            obj.admin_id = user.created_by;
        }
        console.log("obj", obj);
        const newBuyer = new Buyer_1.default(obj);
        await newBuyer.save();
        // Process transaction if balance is provided
        // converting -ve balance to +ve balance because in transactionHandler => processPaymentTransaction => buyerBalanceChange, so we always have to convert balance base 
        // on recieved or given
        if (c_balance) {
            const transactionResult = await (0, transactionHandler_1.processTransaction)({
                user_id: user_id,
                buyer_id: newBuyer?.id,
                payment: final_balance,
                "notes": "",
                payment_direction: payment_direction,
                type: "payment",
                payment_method: payment_method,
                skip_cash_user_balance: true
            });
            // Check if transaction failed and return error
            if (!transactionResult.success) {
                return res.status(400).json({
                    success: false,
                    error: transactionResult.error
                });
            }
        }
        (0, activity_1.createActivity)({
            user_id: req.body?.user_id,
            user_created_by: user.created_by,
            action: 'create',
            resource_type: 'buyer',
            page: 'buyer',
            type: 'client_created',
            description: `${req.body.firstName} ${req.body.lastName} client created`,
        });
        res.status(201).json(newBuyer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/buyers - List all buyers or filter by "user_id"
router.get("/", (0, accessMiddleware_1.default)("wholesale", "read"), async (req, res) => {
    try {
        const { user_id } = req.query;
        let buyers;
        if (user_id) {
            const user = await User_1.default.findById(user_id).lean();
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }
            let userIds = [
                new mongoose_1.default.Types.ObjectId(user._id),
            ];
            // if the user is requesting is admin then include all users created by this admin
            if (["admin", "superadmin"].includes(user.role)) {
                const createdUsers = await User_1.default.find({ created_by: user._id }, { _id: 1 }).lean();
                userIds.push(...createdUsers.map((u) => u._id));
            }
            // if the user is normal user then include admin, so that we can admin buyers/clients as well
            if (user.created_by) {
                userIds.push(user.created_by);
            }
            buyers = await Buyer_1.default.find({
                $or: [
                    { user_id: { $in: userIds } },
                    { admin_id: { $in: userIds } }
                ],
                deleted_at: null
            });
        }
        else {
            buyers = await Buyer_1.default.find({ deleted_at: null });
        }
        res.status(200).json(buyers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/buyers/:buyerid - Get buyers by id
router.get('/:buyerid', async (req, res) => {
    try {
        const buyer = await Buyer_1.default.findById(req.params.buyerid);
        if (!buyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json(buyer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/buyers/:id - Update a buyer by ID
router.put('/:id', async (req, res) => {
    try {
        const updatedBuyer = await Buyer_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedBuyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json(updatedBuyer);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/buyers/:id - Delete a buyer by ID (optional)
router.delete('/:id', (0, accessMiddleware_1.default)("wholesale", "delete"), async (req, res) => {
    try {
        const deletedBuyer = await Buyer_1.default.findByIdAndDelete(req.params.id);
        if (!deletedBuyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json({ message: 'Buyer deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/buyers/transaction/:id - Delete a buyer by ID (optional)
router.get('/:id', async (req, res) => {
    try {
        const deletedBuyer = await Buyer_1.default.findByIdAndDelete(req.params.id);
        if (!deletedBuyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        res.status(200).json({ message: 'Buyer deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/buyers/:id - Delete a buyer by ID (optional)
router.post('/balance/:id', async (req, res) => {
    try {
        const body = req.body;
        await Buyer_1.default.findByIdAndUpdate(req.params.id, { $inc: { currentBalance: body?.currentBalance } });
        res.status(200).json({ message: 'Buyer balance updated successfully' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
