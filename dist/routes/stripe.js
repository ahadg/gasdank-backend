"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSessionHandler = void 0;
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const stripe_1 = __importDefault(require("../utils/stripe"));
const User_1 = __importDefault(require("../models/User"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
// Cancel subscription route
router.post('/cancel-subscription', authMiddleware_1.authenticateJWT, async (req, res) => {
    try {
        const userId = req.body.user_id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const user = await User_1.default.findById(userId);
        if (!user || !user.stripeSubscriptionId) {
            return res.status(404).json({ error: 'Active subscription not found' });
        }
        // Cancel the subscription immediately or at period end
        const canceledSubscription = await stripe_1.default.subscriptions.update(user.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        user.subscriptionStatus = 'cancelled';
        user.save();
        return res.json({
            status: 'success',
            message: 'Subscription will be canceled at the end of the current period.',
            subscription: canceledSubscription,
        });
    }
    catch (error) {
        console.error('Cancel Subscription Error:', error);
        return res.status(500).json({ error: error.message });
    }
});
const createCheckoutSessionHandler = async (req, res) => {
    try {
        console.log('req.body', req.body);
        if (!req.body?.user_id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const user = await User_1.default.findById(req.body.user_id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!user.stripeCustomerId) {
            const customer = await stripe_1.default.customers.create({
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
            });
            user.stripeCustomerId = customer.id;
            const currentTrialEnd = new Date(); // Original trial end date
            currentTrialEnd.setDate(currentTrialEnd.getDate() + 60); // Add 60 days
            user.trialEnd = currentTrialEnd.toISOString();
            user.subscriptionStatus = 'trialing';
            user.currentPeriodEnd = currentTrialEnd.toISOString();
            user.currentPeriodStart = new Date().toISOString();
            await user.save();
            return res.json({ status: "success" });
        }
        const { priceId, isUpgrade, plan } = req.body;
        if (!priceId) {
            return res.status(400).json({ error: 'Missing price ID' });
        }
        console.log({ isUpgrade, stripeSubscriptionId: user.stripeSubscriptionId });
        if (isUpgrade && user.stripeSubscriptionId) {
            // 🎯 User already has a subscription -> UPDATE it
            const subscription = await stripe_1.default.subscriptions.retrieve(user.stripeSubscriptionId);
            await stripe_1.default.subscriptions.update(user.stripeSubscriptionId, {
                cancel_at_period_end: false,
                proration_behavior: 'create_prorations',
                items: [
                    {
                        id: subscription.items.data[0].id,
                        price: priceId,
                    },
                ],
            });
            user.plan = plan;
            await user.save();
            return res.json({ status: "success" });
        }
        const session = await stripe_1.default.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer: user.stripeCustomerId,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            subscription_data: {
                // trial_period_days: 60,
                metadata: {
                    plan_name: plan,
                },
            },
            metadata: {
                plan_name: plan,
            },
            success_url: `${process.env.FRONTEND_URL}/auth/login?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cancel`,
        });
        return res.json({ url: session.url });
    }
    catch (error) {
        console.error('Checkout Session Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
exports.createCheckoutSessionHandler = createCheckoutSessionHandler;
//router.post('/create-subscription', createSubscriptionHandler);
router.post('/create-checkout-session', exports.createCheckoutSessionHandler);
exports.default = router;
