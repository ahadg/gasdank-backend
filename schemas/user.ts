import Joi from 'joi';

// Define Joi schema for user validation
const userSchema = Joi.object({
  firstName: Joi.string().required().messages({
    'string.empty': `"firstName" cannot be an empty field`,
    'any.required': `"firstName" is required`
  }),
  lastName: Joi.string().optional().allow(null).empty('').messages({
    'string.empty': `"lastName" cannot be an empty field`
  }),
  
  userName: Joi.string().required().messages({
    'string.empty': `"userName" cannot be an empty field`,
    'any.required': `"userName" is required`
  }),
  role: Joi.string().required().messages({
    'string.empty': `"role" cannot be an empty field`,
    'any.required': `"role" is required`
  }),
//   PIN: Joi.string().required().messages({
//     'string.empty': `"PIN" cannot be an empty field`,
//     'any.required': `"PIN" is required`
//   }),
  password: Joi.string().required().messages({
    'string.empty': `"password" cannot be an empty field`,
    'any.required': `"password" is required`
  }),
  access: Joi.object().required().messages({
    'any.required': `"access" is required`
  }),
  email: Joi.string().email().required().messages({
    'string.email': `"email" must be a valid email`,
    'string.empty': `"email" cannot be an empty field`,
    'any.required': `"email" is required`
  }),
  phone: Joi.string().optional().allow(null).empty('')
});

export const userSignupSchema = Joi.object({
  firstName: Joi.string().required().messages({
    'string.empty': `"firstName" cannot be an empty field`,
    'any.required': `"firstName" is required`
  }),
  lastName: Joi.string().optional().allow(null).empty('').messages({
    'string.empty': `"lastName" cannot be an empty field`
  }),
  
  userName: Joi.string().required().messages({
    'string.empty': `"userName" cannot be an empty field`,
    'any.required': `"userName" is required`
  }),
  role: Joi.string().required().messages({
    'string.empty': `"role" cannot be an empty field`,
    'any.required': `"role" is required`
  }),
//   PIN: Joi.string().required().messages({
//     'string.empty': `"PIN" cannot be an empty field`,
//     'any.required': `"PIN" is required`
//   }),
  password: Joi.string().required().messages({
    'string.empty': `"password" cannot be an empty field`,
    'any.required': `"password" is required`
  }),
  email: Joi.string().email().required().messages({
    'string.email': `"email" must be a valid email`,
    'string.empty': `"email" cannot be an empty field`,
    'any.required': `"email" is required`
  }),
  phone: Joi.string().optional().allow(null).empty(''),
  plan: Joi.string().required().messages({
    'string.empty': `"plan" cannot be an empty field`,
    'any.required': `"plan" is required`
  }),
});


export default userSchema;
