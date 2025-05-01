import express from 'express';

const router = express.Router();

import { Request, Response } from 'express';
import stripe, { createStripeCustomer, createSubscription } from '../utils/stripe';
import User from '../models/User';
import Stripe from 'stripe';
import { authenticateJWT } from '../middlewares/authMiddleware';
import SystemSettings from '../models/SystemSettings';

interface Access {
  id: string;
}

interface AuthenticatedRequest extends Request {
  user?: Access;
}

// Cancel subscription route
router.post('/cancel-subscription', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.body.user_id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await User.findById(userId);

    if (!user || !user.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Active subscription not found' });
    }

    // Cancel the subscription immediately or at period end
    const canceledSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    return res.json({
      status: 'success',
      message: 'Subscription will be canceled at the end of the current period.',
      subscription: canceledSubscription,
    });
  } catch (error: any) {
    console.error('Cancel Subscription Error:', error);
    return res.status(500).json({ error: error.message });
  }
});


export const createCheckoutSessionHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('req.body', req.body)

    if (!req.body?.user_id) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const user = await User.findById(req.body.user_id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      })
      user.stripeCustomerId = customer.id
      await user.save()
    }

    const { priceId, isUpgrade, plan } = req.body

    if (!priceId) {
      return res.status(400).json({ error: 'Missing price ID' })
    }
    console.log({isUpgrade,stripeSubscriptionId : user.stripeSubscriptionId})
    if (isUpgrade && user.stripeSubscriptionId) {
      // 🎯 User already has a subscription -> UPDATE it
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)

      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
        proration_behavior: 'create_prorations',
        items: [
          {
            id: subscription.items.data[0].id,
            price: priceId,
          },
        ],
      })
      user.plan = plan
      await user.save();
      return res.json({ status: "success" })
    } 

    const session = await stripe.checkout.sessions.create({
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
        trial_period_days: 60,
        metadata: {
          plan_name: plan,
        },
      },
      metadata: {
        plan_name: plan,
      },
      success_url: `${process.env.FRONTEND_URL}/auth/login?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    })
    
    return res.json({ url: session.url })

  } catch (error: any) {
    console.error('Checkout Session Error:', error)
    return res.status(500).json({ error: error.message })
  }
}

//router.post('/create-subscription', createSubscriptionHandler);
router.post('/create-checkout-session', createCheckoutSessionHandler);


export default router;