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
const TransactionPaymentSchema = new mongoose_1.Schema({
    transaction_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    buyer_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    admin_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }, // optional, only if created by an admin
    created_by_role: { type: String, enum: ['user', 'admin'], default: 'admin' }, // helps in filtering
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    amount_paid: { type: Number, required: true },
    payment_method: { type: String, required: true },
    payment_direction: { type: String, required: true },
    payment_date: { type: Date, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});
exports.default = mongoose_1.default.models.TransactionPayment || mongoose_1.default.model('TransactionPayment', TransactionPaymentSchema);
