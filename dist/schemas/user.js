"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userSignupSchema = void 0;
const joi_1 = __importDefault(require("joi"));
// Define Joi schema for user validation
const userSchema = joi_1.default.object({
    firstName: joi_1.default.string().required().messages({
        'string.empty': `"firstName" cannot be an empty field`,
        'any.required': `"firstName" is required`
    }),
    lastName: joi_1.default.string().optional().allow(null).empty('').messages({
        'string.empty': `"lastName" cannot be an empty field`
    }),
    userName: joi_1.default.string().required().messages({
        'string.empty': `"userName" cannot be an empty field`,
        'any.required': `"userName" is required`
    }),
    role: joi_1.default.string().required().messages({
        'string.empty': `"role" cannot be an empty field`,
        'any.required': `"role" is required`
    }),
    //   PIN: Joi.string().required().messages({
    //     'string.empty': `"PIN" cannot be an empty field`,
    //     'any.required': `"PIN" is required`
    //   }),
    password: joi_1.default.string().required().messages({
        'string.empty': `"password" cannot be an empty field`,
        'any.required': `"password" is required`
    }),
    access: joi_1.default.object().required().messages({
        'any.required': `"access" is required`
    }),
    email: joi_1.default.string().email().required().messages({
        'string.email': `"email" must be a valid email`,
        'string.empty': `"email" cannot be an empty field`,
        'any.required': `"email" is required`
    }),
    phone: joi_1.default.string().optional().allow(null).empty('')
});
exports.userSignupSchema = joi_1.default.object({
    firstName: joi_1.default.string().required().messages({
        'string.empty': `"firstName" cannot be an empty field`,
        'any.required': `"firstName" is required`
    }),
    lastName: joi_1.default.string().optional().allow(null).empty('').messages({
        'string.empty': `"lastName" cannot be an empty field`
    }),
    userName: joi_1.default.string().required().messages({
        'string.empty': `"userName" cannot be an empty field`,
        'any.required': `"userName" is required`
    }),
    role: joi_1.default.string().required().messages({
        'string.empty': `"role" cannot be an empty field`,
        'any.required': `"role" is required`
    }),
    //   PIN: Joi.string().required().messages({
    //     'string.empty': `"PIN" cannot be an empty field`,
    //     'any.required': `"PIN" is required`
    //   }),
    password: joi_1.default.string().required().messages({
        'string.empty': `"password" cannot be an empty field`,
        'any.required': `"password" is required`
    }),
    email: joi_1.default.string().email().required().messages({
        'string.email': `"email" must be a valid email`,
        'string.empty': `"email" cannot be an empty field`,
        'any.required': `"email" is required`
    }),
    phone: joi_1.default.string().optional().allow(null).empty(''),
    plan: joi_1.default.string().required().messages({
        'string.empty': `"plan" cannot be an empty field`,
        'any.required': `"plan" is required`
    }),
});
exports.default = userSchema;
