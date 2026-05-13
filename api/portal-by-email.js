const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const { email } = req.query;

  if (!email) return res.status(400).json({ error: 'Missing email.' });

  try {
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });

    if (!customers.data.length) {
      return res.status(404).json({
        error: 'No account found for that email. Try the email you used when you signed up, or text Luke at (512) 333-0552.',
      });
    }

    const customerId = customers.data[0].id;

    const baseUrl =
      process.env.SITE_URL ||
      `https://${req.headers.host}` ||
      'https://freemanwash.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('Portal by email error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please text Luke at (512) 333-0552.' });
  }
};
