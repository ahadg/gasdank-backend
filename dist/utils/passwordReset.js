"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashToken = exports.makeResetToken = void 0;
exports.setUserResetToken = setUserResetToken;
exports.verifyTokenAndUpdatePassword = verifyTokenAndUpdatePassword;
const crypto_1 = __importDefault(require("crypto"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const User_1 = __importDefault(require("../models/User"));
const makeResetToken = () => crypto_1.default.randomBytes(32).toString('hex');
exports.makeResetToken = makeResetToken;
const hashToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashToken = hashToken;
async function setUserResetToken(email) {
    const rawToken = (0, exports.makeResetToken)();
    const hashed = (0, exports.hashToken)(rawToken);
    const user = await User_1.default.findOneAndUpdate({ email }, {
        resetPasswordToken: hashed,
        resetPasswordExpires: Date.now() + 60 * 60 * 1000, // 1 h
    }, { new: true });
    return { user, rawToken };
}
async function verifyTokenAndUpdatePassword(rawToken, newPassword) {
    const hashed = (0, exports.hashToken)(rawToken);
    const user = await User_1.default.findOne({
        resetPasswordToken: hashed,
        resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user)
        return null;
    user.password = await bcrypt_1.default.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.updated_at = new Date();
    await user.save();
    return user;
}
