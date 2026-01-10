"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubscription = exports.createStripeCustomer = void 0;
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
// apiVersion: '2023-08-16',
});
exports.default = stripe;
const createStripeCustomer = async (user) => {
    return stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
            userId: user._id.toString(),
        },
    });
};
exports.createStripeCustomer = createStripeCustomer;
const createSubscription = async (customerId, priceId) => {
    return stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [{
                price: priceId,
                quantity: 1,
            }],
        success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/subscription/canceled`,
    });
};
exports.createSubscription = createSubscription;
