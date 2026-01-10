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
exports.generateProductId = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Function to generate product ID with format MANA-YYMMDDHHMM
const generateProductId = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(2);
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const randomDigits = Math.floor(100 + Math.random() * 900); // 3-digit random number
    return `MANA-${year}${day}${hour}${randomDigits}`;
};
exports.generateProductId = generateProductId;
// Function to get next reference number
const getNextReferenceNumber = async () => {
    try {
        const lastProduct = await mongoose_1.default.models.Inventory
            .findOne({})
            .sort({ created_at: -1 }) // 🔥 latest created
            .select('reference_number created_at');
        const lastRef = lastProduct?.reference_number;
        console.log("lastRef", lastRef);
        return typeof lastRef === 'number' ? lastRef + 1 : Number(lastRef) + 1;
    }
    catch (error) {
        console.error('Error getting next reference number:', error);
        const count = await mongoose_1.default.models.Inventory.countDocuments({});
        return count + 1;
    }
};
const InventorySchema = new mongoose_1.Schema({
    product_id: {
        type: String,
        unique: true,
        default: exports.generateProductId
    },
    reference_number: {
        type: String,
        unique: true,
        //required: true
    },
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    user_created_by_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    buyer_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Buyer', },
    category: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Category', required: true },
    //info: { type: String, required: true },
    qty: { type: Number, required: true },
    unit: { type: String, required: true },
    name: { type: String },
    price: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    strain_type: { type: String },
    active: { type: Boolean, default: true },
    notes: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
// Pre-save hook to set product_id and reference_number
InventorySchema.pre('save', async function (next) {
    try {
        if (this.isNew) {
            if (!this.product_id) {
                this.product_id = (0, exports.generateProductId)();
            }
            console.log("this.reference_number", this.reference_number);
            if (!this.reference_number) {
                //console.log("this.reference_number_inside",await getNextReferenceNumber()) 
                const reference_number = await getNextReferenceNumber();
                console.log("reference_numberrr", reference_number);
                this.reference_number = reference_number;
            }
            if (!this.name) {
                this.name = `#${this.reference_number || ""}`;
            }
            console.log("this.name", this.name);
        }
        this.updated_at = new Date();
        next();
    }
    catch (error) {
        next(error);
    }
});
InventorySchema.index({ reference_number: 1 });
exports.default = mongoose_1.default.models.Inventory || mongoose_1.default.model('Inventory', InventorySchema);
