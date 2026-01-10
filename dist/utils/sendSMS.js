"use strict";
// utils/sendSMS.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPhoneNumber = exports.sendSMS = void 0;
const twilio_1 = __importDefault(require("twilio"));
const client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sendSMS = async ({ to, message, }) => {
    try {
        const formattedPhone = (0, exports.formatPhoneNumber)(to);
        const result = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone,
        });
        return {
            success: true,
            sid: result.sid,
            status: result.status,
        };
    }
    catch (err) {
        console.error("SMS sending error:", err);
        return {
            success: false,
            error: err.message,
        };
    }
};
exports.sendSMS = sendSMS;
// Format phone number for Twilio (ensure it starts with country code)
const formatPhoneNumber = (phone) => {
    if (!phone)
        return '';
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    // If it doesn't start with country code, assume US (+1)
    if (cleaned.length === 10) {
        return `+1${cleaned}`;
    }
    else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
    }
    else if (!cleaned.startsWith('+')) {
        return `+${cleaned}`;
    }
    return cleaned;
};
exports.formatPhoneNumber = formatPhoneNumber;
