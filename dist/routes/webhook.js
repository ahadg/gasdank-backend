"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = void 0;
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const stripe_1 = __importDefault(require("../utils/stripe"));
const User_1 = __importDefault(require("../models/User"));
const handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe_1.default.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    console.log("event.type", event.type);
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log("session", session);
            await handleCheckoutCompleted(session);
            break;
        case 'invoice.payment_succeeded':
            const invoice = event.data.object;
            //await handlePaymentSucceeded(invoice);
            break;
        case 'customer.subscription.updated':
            const subscription = event.data.object;
            //await handleSubscriptionUpdate(subscription);
            break;
    }
    res.json({ received: true });
};
exports.handleStripeWebhook = handleStripeWebhook;
async function handleCheckoutCompleted(session) {
    const user = await User_1.default.findOne({ stripeCustomerId: session.customer });
    if (!user)
        return;
    const subscription = await stripe_1.default.subscriptions.retrieve(session.subscription);
    console.log("subscription", subscription);
    const startDate = new Date(subscription?.items?.data[0]?.current_period_start * 1000); // when the trial starts
    const currentPeriodEnd = new Date(subscription?.items?.data[0]?.current_period_end * 1000); // end of trial or billing cycle
    console.log("subscription_items", subscription?.items?.data);
    // Determine if trial is active
    const trialEndDate = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null;
    user.subscriptionStatus = subscription.status;
    user.stripeSubscriptionId = subscription.id;
    user.currentPeriodStart = startDate;
    user.currentPeriodEnd = currentPeriodEnd;
    if (trialEndDate) {
        user.trialEnd = trialEndDate;
    }
    // 🧠 Plan Name from session metadata
    const planFromMetadata = session.metadata?.plan_name;
    if (planFromMetadata) {
        user.plan = planFromMetadata.toLowerCase();
    }
    else {
        console.warn('No plan_name in metadata, falling back to Stripe price nickname');
        user.plan = subscription.items.data[0]?.price.nickname?.toLowerCase() ?? 'default-plan';
    }
    await user.save();
}
// Webhook needs raw body
router.post('/', express_1.default.raw({ type: 'application/json' }), exports.handleStripeWebhook);
exports.default = router;
