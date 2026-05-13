const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { session_id } = req.query;

  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Only return safe, non-sensitive data to the frontend
    const fullName = session.customer_details?.name || '';
    const firstName = fullName.split(' ')[0] || 'Friend';

    return res.status(200).json({ firstName });
  } catch (err) {
    console.error('get-session error:', err);
    // Return a friendly fallback — never break the confirmation page
    return res.status(200).json({ firstName: 'Friend' });
  }
};
