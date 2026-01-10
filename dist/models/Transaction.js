"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
// Define the schema for items within prevValues
const PrevValueItemSchema = new mongoose_1.Schema({
    transactionitem_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionItem' },
    inventory_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Inventory' },
    qty: Number,
    measurement: Number,
    sale_price: Number,
    price: Number,
    shipping: Number,
    unit: String,
    name: String
}, { _id: false });
// Define the schema for each edit entry in prevValues
const PrevValueSchema = new mongoose_1.Schema({
    updated_at: { type: Date, default: Date.now },
    original_items: [PrevValueItemSchema],
    items: [PrevValueItemSchema]
}, { _id: false });
// Transaction Schema
const TransactionSchema = new mongoose_1.Schema({
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    admin_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }, // optional, only if created by an admin
    created_by_role: { type: String, enum: ['user', 'admin'], default: "admin" }, // helps in filtering
    buyer_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Buyer' },
    sale_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Transaction' },
    worker_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    transactionpayment_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionPayment' },
    sample_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Sample' },
    payment_direction: { type: String },
    payment_method: { type: String },
    type: { type: String, default: 'sale' },
    sale_reference_id: { type: String, unique: true, sparse: true },
    notes: { type: String },
    price: { type: Number },
    sale_price: { type: Number },
    total_shipping: { type: Number },
    profit: { type: Number },
    items: [{
            transactionitem_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TransactionItem', required: true },
        }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    edited: { type: Boolean, default: false },
    prevValues: [PrevValueSchema]
});
// Helper function to generate a human-friendly unique alphanumeric ID
function generateReadableID(length = 8) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing letters/numbers like 0, O, I, 1
    return Array.from({ length }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');
}
// Pre-save hook to generate unique ID if needed
TransactionSchema.pre('save', async function (next) {
    if (this.type === 'sale' && !this.sale_reference_id) {
        let isUnique = false;
        let generatedID = '';
        while (!isUnique) {
            generatedID = generateReadableID();
            const existing = await mongoose_1.default.models.Transaction.findOne({ sale_reference_id: generatedID });
            if (!existing)
                isUnique = true;
        }
        this.sale_reference_id = generatedID;
    }
    next();
});
exports.default = mongoose_1.default.models.Transaction || mongoose_1.default.model('Transaction', TransactionSchema);
