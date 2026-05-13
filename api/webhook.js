const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Must read raw body to verify Stripe webhook signature
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      // Trial started — customer entered card, subscription is active in trial
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          await stripe.customers.update(session.customer, {
            metadata: {
              status: 'trialing',
              subscription_id: session.subscription,
            },
          });
          console.log(`Customer ${session.customer} moved to trialing`);
        }
        break;
      }

      // Subscription status changed (trial_end → active, paused, etc.)
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await stripe.customers.update(sub.customer, {
          metadata: {
            status: sub.status,
            subscription_id: sub.id,
          },
        });
        console.log(`Customer ${sub.customer} subscription status: ${sub.status}`);
        break;
      }

      // Payment failed — flag the customer
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await stripe.customers.update(invoice.customer, {
          metadata: { status: 'payment_failed' },
        });
        console.log(`Payment failed for customer ${invoice.customer}`);
        break;
      }

      // Subscription cancelled
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await stripe.customers.update(sub.customer, {
          metadata: {
            status: 'cancelled',
            subscription_id: sub.id,
          },
        });
        console.log(`Subscription cancelled for customer ${sub.customer}`);
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err) {
    // Log but still return 200 to prevent Stripe from retrying
    console.error('Webhook handler error:', err);
  }

  return res.status(200).json({ received: true });
};
