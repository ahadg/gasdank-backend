"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required');
}
const redisClient = new ioredis_1.default(process.env.REDIS_URL);
redisClient.on('error', (err) => console.error('Redis error', err));
exports.default = redisClient;
