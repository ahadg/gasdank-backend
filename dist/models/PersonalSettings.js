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
const PersonalSettingsSchema = new mongoose_1.Schema({
    user_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    units: {
        type: [String],
        default: ['pounds', 'kg', 'gram', 'per piece']
    },
    default_unit: {
        type: String,
        default: 'pounds'
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
PersonalSettingsSchema.pre('save', function (next) {
    this.updated_at = new Date();
    // Ensure default_unit is always in the units array
    if (this.default_unit && !this.units.includes(this.default_unit)) {
        this.units.push(this.default_unit);
    }
    // If default_unit is not set or not in units array, set it to the first unit
    if (!this.default_unit || !this.units.includes(this.default_unit)) {
        this.default_unit = this.units[0] || 'pounds';
    }
    next();
});
exports.default = mongoose_1.default.models.PersonalSettings || mongoose_1.default.model('PersonalSettings', PersonalSettingsSchema);
