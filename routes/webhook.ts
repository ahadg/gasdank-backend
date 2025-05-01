import express from 'express';

const router = express.Router();

import { Request, Response } from 'express';
import stripe, { createStripeCustomer, createSubscription } from '../utils/stripe';
import User from '../models/User';
import Stripe from 'stripe';
import { authenticateJWT } from '../middlewares/authMiddleware';

interface Access {
  id: string;
}

interface AuthenticatedRequest extends Request {
  user?: Access;
}



export const handleStripeWebhook = async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature']!;
    let event;
  
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err : any) {
      console.log(`Webhook Error: ${err.message}`)
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    console.log("event.type",event.type)
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log("session",session)
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
  
  async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const user = await User.findOne({ stripeCustomerId: session.customer });
    if (!user) return;
  
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string) as Stripe.Subscription;
    console.log("subscription",subscription)
    const startDate = new Date(subscription?.items?.data[0]?.current_period_start * 1000); // when the trial starts
    const currentPeriodEnd = new Date(subscription?.items?.data[0]?.current_period_end * 1000); // end of trial or billing cycle
    console.log("subscription_items",subscription?.items?.data)
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
    } else {
      console.warn('No plan_name in metadata, falling back to Stripe price nickname');
      user.plan = subscription.items.data[0]?.price.nickname?.toLowerCase() ?? 'default-plan';
    }
  
    await user.save();
  }
  
  



// Webhook needs raw body
router.post('/', express.raw({type: 'application/json'}), handleStripeWebhook);


export default router;