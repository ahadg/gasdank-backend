"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const MONGODB_URI = process.env.MONGODB_URI;
//process.env.MONGODB_URI as string;
if (!MONGODB_URI) {
    console.log("MONGODB_URI", MONGODB_URI);
    throw new Error('Please define the MONGODB_URI environment variable');
}
// Initialize cached with a default value to avoid undefined
let cached = global.mongoose || { conn: null, promise: null };
if (!global.mongoose) {
    global.mongoose = cached;
}
async function dbConnect() {
    // Return cached connection if available
    if (cached.conn) {
        console.log('Using cached MongoDB connection.');
        return cached.conn;
    }
    // Create new connection promise if none exists
    if (!cached.promise) {
        cached.promise = mongoose_1.default.connect(MONGODB_URI, {
        // You can add options here if needed, for example:
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
        });
    }
    try {
        cached.conn = await cached.promise;
        console.log('Successfully connected to MongoDB.');
        return cached.conn;
    }
    catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}
exports.default = dbConnect;
