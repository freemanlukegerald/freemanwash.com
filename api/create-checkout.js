const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Read raw body from request stream
function readBody(req) {
  if (req.body) {
    return Promise.resolve(
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    );
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
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { firstName, lastName, email, phone, address, city, zip, pickupDay, numBins, gateCode, notes } = body;

  // Validate all required fields
  if (!firstName || !lastName || !email || !phone || !address || !city || !zip || !pickupDay || !numBins) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    // Create Stripe customer — all service details stored here as the source of truth
    const customer = await stripe.customers.create({
      name: `${firstName.trim()} ${lastName.trim()}`,
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
        status:       'pending',
        signup_date:  new Date().toISOString(),
      },
    });

    // Detect base URL for redirects
    const baseUrl =
      process.env.SITE_URL ||
      (req.headers.origin && req.headers.origin !== 'null' ? req.headers.origin : null) ||
      `https://${req.headers.host}` ||
      'https://freemanwash.com';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: 'price_1TWOURIOi0nNhdyyt6ouFROc',
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          customer_name: `${firstName.trim()} ${lastName.trim()}`,
          full_address:  `${address.trim()}, ${city.trim()}, TX ${zip.trim()}`,
          phone:         phone.trim(),
          pickup_day:    pickupDay,
          num_bins:      numBins,
          gate_code:     gateCode || '',
          notes:         notes || '',
        },
      },
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      success_url: `${baseUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/signup`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
};
