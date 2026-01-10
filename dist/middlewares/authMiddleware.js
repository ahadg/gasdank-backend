"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    try {
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET, (err, user) => {
                if (err) {
                    console.log("err", err);
                    return res.status(403).json({ error: "Your token has expired, please try signin" });
                }
                req.user = user;
                next();
            });
        }
        else {
            console.log("JWT token missing in header");
            res.status(401).json({ error: "JWT token missing in header" });
        }
    }
    catch (error) {
        console.log("error", error);
    }
};
exports.authenticateJWT = authenticateJWT;
