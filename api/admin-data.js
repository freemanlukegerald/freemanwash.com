const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Password check
  const { password } = req.query;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD environment variable is not set.' });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const subscribers = [];
    let hasMore = true;
    let startingAfter = undefined;

    // Paginate through all subscriptions — this is the most reliable way
    // to get all customers who have (or had) a subscription
    while (hasMore) {
      const params = {
        limit: 100,
        status: 'all', // includes trialing, active, past_due, cancelled, etc.
        expand: ['data.customer'],
      };
      if (startingAfter) params.starting_after = startingAfter;

      const page = await stripe.subscriptions.list(params);

      for (const sub of page.data) {
        const customer = sub.customer;
        if (!customer || customer.deleted) continue;

        subscribers.push({
          customerId: customer.id,
          name: customer.name || '—',
          email: customer.email || '—',
          phone: customer.phone || customer.metadata?.phone || '—',
          address: customer.metadata?.full_address || '—',
          signupTimestamp: customer.created,
          signupDate: new Date(customer.created * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }),
          status: sub.status,
          subscriptionId: sub.id,
          trialEnd: sub.trial_end
            ? new Date(sub.trial_end * 1000).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
            : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
            : null,
        });
      }

      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1].id;
    }

    // Sort newest first
    subscribers.sort((a, b) => b.signupTimestamp - a.signupTimestamp);

    return res.status(200).json(subscribers);
  } catch (err) {
    console.error('Admin data error:', err);
    return res.status(500).json({ error: err.message });
  }
};
