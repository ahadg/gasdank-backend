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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
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

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const subscriptionData = subscription as unknown as { current_period_start: number; current_period_end: number };

  user.subscriptionStatus = subscription.status;
  user.stripeSubscriptionId = subscription.id;
  user.currentPeriodStart = new Date(subscriptionData.current_period_start * 1000);
  user.currentPeriodEnd = new Date(subscriptionData.current_period_end * 1000);
  user.plan = subscription.items.data[0].price.nickname?.toLowerCase();
  
  await user.save();
}

export const createSubscriptionHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.stripeCustomerId) {
      const customer = await createStripeCustomer(user);
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    const session = await createSubscription(
      user.stripeCustomerId,
      process.env.STRIPE_PRICE_ID!
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Webhook needs raw body
router.post('/webhook', express.raw({type: 'application/json'}), handleStripeWebhook);
router.post('/create-subscription', authenticateJWT, createSubscriptionHandler);

export default router;