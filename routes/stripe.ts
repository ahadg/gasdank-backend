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

      const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
        proration_behavior: 'create_prorations',
        items: [
          {
            id: subscription.items.data[0].id,
            price: priceId,
          },
        ],
      })

      // 🎯 After updating subscription, update User's Plan locally
      // const settings = await SystemSettings.findOne()
      // const newPlan = settings?.plans.find((plan:any) => plan.stripePriceId === priceId)

      // if (newPlan?.name) {
      //   user.plan = newPlan.name
      //   await user.save()
      // }

    } 
    // 🎯 No active subscription -> create new Checkout Session
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
      expand: ['subscription'],
      metadata: {
        plan_name: plan, // example
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