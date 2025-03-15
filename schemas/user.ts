import Joi from 'joi';

// Define Joi schema for user validation
const userSchema = Joi.object({
  firstName: Joi.string().required().messages({
    'string.empty': `"firstName" cannot be an empty field`,
    'any.required': `"firstName" is required`
  }),
  lastName: Joi.string().required().messages({
    'string.empty': `"lastName" cannot be an empty field`,
    'any.required': `"lastName" is required`
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
  phone: Joi.string().optional()
});

export default userSchema;
