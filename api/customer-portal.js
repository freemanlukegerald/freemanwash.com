const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).send('Missing session_id.');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const customerId = session.customer;

    if (!customerId) {
      return res.status(400).send('No customer found for this session.');
    }

    const baseUrl =
      process.env.SITE_URL ||
      `https://${req.headers.host}` ||
      'https://freemanwash.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/`,
    });

    return res.redirect(302, portalSession.url);
  } catch (err) {
    console.error('Portal error:', err);
    return res.status(500).send(
      'Unable to open subscription portal. Please text Luke at (512) 333-0552 to make changes.'
    );
  }
};
