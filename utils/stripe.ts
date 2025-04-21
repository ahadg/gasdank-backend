import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
 // apiVersion: '2023-08-16',
});
export default stripe
export const createStripeCustomer = async (user : any) => {
  return stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    metadata: {
      userId: user._id.toString(),
    },
  });
};

export const createSubscription = async (customerId: string, priceId: string) => {
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