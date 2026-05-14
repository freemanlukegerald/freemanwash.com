const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const PLAN_LABELS = {
  monthly:  'Monthly ($30/mo — 1st month free)',
  quarterly:'Quarterly ($55/visit · 4×/year)',
  biweekly: 'Bi-Weekly ($25/visit · every 2 wks)',
  onetime:  'One-Time ($75)',
};

async function sendNewSignupEmail(customer, meta, session) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const plan      = meta.plan || 'monthly';
  const planLabel = PLAN_LABELS[plan] || plan;
  const now       = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });

  const text = [
    '── NEW CUSTOMER SIGNED UP ──',
    '',
    `Name:      ${customer.name}`,
    `Plan:      ${planLabel}`,
    `Pickup:    ${meta.pickup_day || '—'}`,
    '',
    'SERVICE ADDRESS',
    meta.full_address || '—',
    '',
    'BINS & ACCESS',
    `Bins:      ${meta.num_bins || '—'}`,
    `Gate Code: ${meta.gate_code || 'None'}`,
    `Notes:     ${meta.notes || 'None'}`,
    '',
    'CONTACT',
    `Email:     ${customer.email}`,
    `Phone:     ${meta.phone || customer.phone || '—'}`,
    '',
    `Signed up: ${now} CT`,
    `Stripe ID: ${customer.id}`,
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
      <div style="background:#0b1120;padding:20px 28px">
        <p style="color:#f97316;font-weight:800;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0">Freeman Exterior Cleaning</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:20px">New Customer Signed Up</h2>
      </div>
      <div style="padding:24px 28px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:110px">Name</td><td style="padding:6px 0;font-weight:600;font-size:14px">${customer.name}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Plan</td><td style="padding:6px 0;font-size:14px">${planLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Pickup Day</td><td style="padding:6px 0;font-weight:700;font-size:14px;color:#1e6ef4">${meta.pickup_day || '—'}</td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">

        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Service Address</p>
        <p style="margin:0;font-size:14px;font-weight:600">${meta.full_address || '—'}</p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">

        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Bins & Access</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:110px">Bins</td><td style="padding:4px 0;font-size:14px">${meta.num_bins || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Gate Code</td><td style="padding:4px 0;font-size:14px">${meta.gate_code || 'None'}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Notes</td><td style="padding:4px 0;font-size:14px">${meta.notes || 'None'}</td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">

        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Contact</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:110px">Email</td><td style="padding:4px 0;font-size:14px"><a href="mailto:${customer.email}" style="color:#1e6ef4">${customer.email}</a></td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Phone</td><td style="padding:4px 0;font-size:14px"><a href="tel:${(meta.phone || customer.phone || '').replace(/\D/g,'')}" style="color:#1e6ef4">${meta.phone || customer.phone || '—'}</a></td></tr>
        </table>

        <div style="margin-top:20px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#64748b">
          Signed up ${now} CT &nbsp;·&nbsp; Stripe: ${customer.id}
        </div>
      </div>
    </div>
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Freeman Wash <notifications@freemanwash.com>',
        to:   ['luke@freemanwash.com'],
        subject: `New signup: ${customer.name} — ${meta.pickup_day || 'No day set'} (${PLAN_LABELS[plan] || plan})`,
        text,
        html,
      }),
    });
  } catch (err) {
    console.error('Email send error:', err);
  }
}

async function addToGoogleSheet(customer, meta, session) {
  const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!sheetUrl) return;

  const plan      = meta.plan || 'monthly';
  const planLabel = PLAN_LABELS[plan] || plan;
  const signupDate = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });

  try {
    await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:        customer.name,
        email:       customer.email,
        phone:       meta.phone || customer.phone || '',
        address:     meta.full_address || '',
        pickupDay:   meta.pickup_day || 'Unknown',
        numBins:     meta.num_bins || '',
        gateCode:    meta.gate_code || '',
        notes:       meta.notes || '',
        plan:        planLabel,
        status:      session.mode === 'subscription' ? 'Trialing' : 'Paid',
        signupDate,
        stripeId:    customer.id,
      }),
    });
  } catch (err) {
    console.error('Google Sheet error:', err);
  }
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

      case 'checkout.session.completed': {
        const session  = event.data.object;
        const customer = await stripe.customers.retrieve(session.customer);
        const meta     = customer.metadata || {};

        // Notify Luke + update route sheet
        await Promise.all([
          sendNewSignupEmail(customer, meta, session),
          addToGoogleSheet(customer, meta, session),
        ]);

        // Update customer status in Stripe
        if (session.mode === 'subscription' && session.subscription) {
          await stripe.customers.update(session.customer, {
            metadata: { status: 'trialing', subscription_id: session.subscription },
          });
        } else if (session.mode === 'payment') {
          await stripe.customers.update(session.customer, {
            metadata: { status: 'completed' },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await stripe.customers.update(sub.customer, {
          metadata: { status: sub.status, subscription_id: sub.id },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await stripe.customers.update(invoice.customer, {
          metadata: { status: 'payment_failed' },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await stripe.customers.update(sub.customer, {
          metadata: { status: 'cancelled', subscription_id: sub.id },
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  return res.status(200).json({ received: true });
};
