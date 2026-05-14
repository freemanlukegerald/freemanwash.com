const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLAN_CONFIG = {
  monthly: {
    mode: 'subscription',
    interval: 'month',
    interval_count: 1,
    baseAmount: 3000,
    extraBinAmount: 1000,
    trialDays: 30,
    label: 'Monthly Bin Cleaning',
  },
  quarterly: {
    mode: 'subscription',
    interval: 'month',
    interval_count: 3,
    baseAmount: 5500,
    extraBinAmount: 1000,
    trialDays: 0,
    label: 'Quarterly Bin Cleaning',
  },
  biweekly: {
    mode: 'subscription',
    interval: 'week',
    interval_count: 2,
    baseAmount: 2500,
    extraBinAmount: 1000,
    trialDays: 0,
    label: 'Bi-Weekly Bin Cleaning',
  },
  onetime: {
    mode: 'payment',
    baseAmount: 7500,
    extraBinAmount: 1000,
    label: 'One-Time Bin Cleaning',
  },
};

function readBody(req) {
  if (req.body) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk.toString()));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = await readBody(req); }
  catch { return res.status(400).json({ error: 'Invalid request body' }); }

  const { plan, firstName, lastName, email, phone, address, city, zip, pickupDay, numBins, gateCode, notes } = body;

  if (!firstName || !lastName || !email || !phone || !address || !city || !zip || !pickupDay || !numBins) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const config = PLAN_CONFIG[plan] || PLAN_CONFIG.monthly;

  // Extra bins above the 2 included in base price
  const numBinsInt = parseInt(numBins) || 2;
  const extraBins  = Math.max(0, numBinsInt - 2);

  try {
    const customer = await stripe.customers.create({
      name:  `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      metadata: {
        first_name:   firstName.trim(),
        last_name:    lastName.trim(),
        address:      address.trim(),
        city:         city.trim(),
        state:        'TX',
        zip:          zip.trim(),
        full_address: `${address.trim()}, ${city.trim()}, TX ${zip.trim()}`,
        pickup_day:   pickupDay,
        num_bins:     numBins,
        gate_code:    gateCode || '',
        notes:        notes || '',
        plan:         plan || 'monthly',
        status:       'pending',
        signup_date:  new Date().toISOString(),
      },
    });

    const baseUrl =
      process.env.SITE_URL ||
      (req.headers.origin && req.headers.origin !== 'null' ? req.headers.origin : null) ||
      `https://${req.headers.host}` ||
      'https://freemanwash.com';

    const serviceMetadata = {
      customer_name: `${firstName.trim()} ${lastName.trim()}`,
      full_address:  `${address.trim()}, ${city.trim()}, TX ${zip.trim()}`,
      phone:         phone.trim(),
      pickup_day:    pickupDay,
      num_bins:      numBins,
      gate_code:     gateCode || '',
      notes:         notes || '',
      plan:          plan || 'monthly',
    };

    // Build line items dynamically
    const buildLineItems = (recurring) => {
      const items = [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `${config.label} (up to 2 bins)` },
            unit_amount: config.baseAmount,
            ...(recurring ? { recurring } : {}),
          },
          quantity: 1,
        },
      ];

      if (extraBins > 0) {
        items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: `Additional Bin${extraBins > 1 ? 's' : ''} (×${extraBins})` },
            unit_amount: config.extraBinAmount,
            ...(recurring ? { recurring } : {}),
          },
          quantity: extraBins,
        });
      }

      return items;
    };

    let sessionParams;

    if (config.mode === 'subscription') {
      const recurring = { interval: config.interval, interval_count: config.interval_count };
      sessionParams = {
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: buildLineItems(recurring),
        mode: 'subscription',
        subscription_data: {
          metadata: serviceMetadata,
          ...(config.trialDays > 0 ? { trial_period_days: config.trialDays } : {}),
        },
        customer_update: { address: 'auto', name: 'auto' },
        success_url: `${baseUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/signup`,
      };
    } else {
      sessionParams = {
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: buildLineItems(null),
        mode: 'payment',
        payment_intent_data: { metadata: serviceMetadata },
        success_url: `${baseUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/signup`,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
};
