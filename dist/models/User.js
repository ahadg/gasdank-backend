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
const UserSchema = new mongoose_1.Schema({
    created_by: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    firstName: { type: String, required: true },
    lastName: { type: String },
    userName: { type: String, required: true },
    //   PIN: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    inventory_value: { type: Number },
    //manual_balance : {type : Number},
    other_balance: { type: Object, default: {} },
    //other_munual_balance: {type : Object,default : {}},
    cash_balance: { type: Number },
    access: { type: Object },
    role: { type: String, default: "user" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: {
        type: String,
    },
    plan: {
        type: String,
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    trialEnd: { type: Date },
    paymentMethodType: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
});
UserSchema.statics.getBalanceOwner = async function (userId) {
    const user = await this.findById(userId);
    if (!user)
        return null;
    if (user.role === 'admin' || user.role === 'superadmin') {
        return user;
    }
    if (user.created_by) {
        const admin = await this.findById(user.created_by);
        if (admin)
            return admin;
    }
    return user; // fallback to self if no admin found
};
const User = mongoose_1.default.models.User || mongoose_1.default.model('User', UserSchema);
exports.default = User;
