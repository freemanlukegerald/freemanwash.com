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

async function sendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error('RESEND_API_KEY not set'); return; }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
  } else {
    console.log('Email sent:', payload.subject);
  }
}

// Email to Luke — new signup work order
async function sendOwnerNotification(customer, meta, session) {
  const plan      = meta.plan || 'monthly';
  const planLabel = PLAN_LABELS[plan] || plan;
  const now       = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });

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
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:110px">Bins</td><td style="padding:4px 0;font-size:14px">${meta.num_bins || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Gate Code</td><td style="padding:4px 0;font-size:14px">${meta.gate_code || 'None'}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Notes</td><td style="padding:4px 0;font-size:14px">${meta.notes || 'None'}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:110px">Email</td><td style="padding:4px 0;font-size:14px"><a href="mailto:${customer.email}" style="color:#1e6ef4">${customer.email}</a></td></tr>
          <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Phone</td><td style="padding:4px 0;font-size:14px"><a href="tel:${(meta.phone||customer.phone||'').replace(/\D/g,'')}" style="color:#1e6ef4">${meta.phone || customer.phone || '—'}</a></td></tr>
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#64748b">
          Signed up ${now} CT · Stripe: ${customer.id}
        </div>
      </div>
    </div>`;

  await sendEmail({
    from: 'Freeman Wash <notifications@freemanwash.com>',
    to:   ['luke@freemanwash.com'],
    subject: `New signup: ${customer.name} — ${meta.pickup_day || 'No day set'}`,
    html,
  });
}

// Email to customer — confirmation + manage link
async function sendCustomerConfirmation(customer, meta) {
  const firstName = meta.first_name || customer.name.split(' ')[0] || 'there';
  const plan      = meta.plan || 'monthly';
  const planLabel = PLAN_LABELS[plan] || plan;
  const isMonthly = plan === 'monthly';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
      <div style="background:#0b1120;padding:20px 28px">
        <p style="color:#f97316;font-weight:800;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0">Freeman Exterior Cleaning</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:22px">You're in, ${firstName}! 🎉</h2>
      </div>
      <div style="padding:24px 28px">
        ${isMonthly ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#166534"><strong>Your first month is completely free.</strong> Your card won't be charged for 30 days.</div>` : ''}

        <p style="font-size:15px;color:#1e293b;margin:0 0 20px">Thanks for signing up for <strong>${planLabel}</strong>. Here's what happens next:</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px">
              <strong style="display:block;margin-bottom:2px">📅 Luke will text you</strong>
              <span style="color:#64748b">Expect a text from (512) 333-0552 within a few hours to confirm your first cleaning date.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px">
              <strong style="display:block;margin-bottom:2px">🚿 No need to be home</strong>
              <span style="color:#64748b">Just leave your bins out after trash day. Luke cleans them with 200° hot water and returns them.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:14px">
              <strong style="display:block;margin-bottom:2px">📍 Your service address</strong>
              <span style="color:#64748b">${meta.full_address || '—'} · ${meta.pickup_day || ''} pickup</span>
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin:24px 0">
          <a href="https://freemanwash.com/manage" style="display:inline-block;background:#1e6ef4;color:white;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px">Manage My Subscription →</a>
          <p style="margin:10px 0 0;font-size:12px;color:#94a3b8">Update payment, pause, or cancel anytime — no phone call needed.</p>
        </div>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:13px;color:#64748b;margin:0">Questions? Text or call Luke at <a href="tel:5123330552" style="color:#1e6ef4">(512) 333-0552</a>.</p>
      </div>
    </div>`;

  await sendEmail({
    from:    'Luke Freeman <luke@freemanwash.com>',
    to:      [customer.email],
    subject: `You're in, ${firstName}! Your first month is free — Freeman Exterior Cleaning`,
    html,
  });
}

async function addToGoogleSheet(customer, meta, session) {
  const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!sheetUrl) { console.error('GOOGLE_SHEET_WEBHOOK_URL not set'); return; }

  const plan      = meta.plan || 'monthly';
  const planLabel = PLAN_LABELS[plan] || plan;
  const signupDate = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });

  const res = await fetch(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name:      customer.name,
      email:     customer.email,
      phone:     meta.phone || customer.phone || '',
      address:   meta.full_address || '',
      pickupDay: meta.pickup_day || 'Unknown',
      numBins:   meta.num_bins || '',
      gateCode:  meta.gate_code || '',
      notes:     meta.notes || '',
      plan:      planLabel,
      status:    session.mode === 'subscription' ? 'Trialing' : 'Paid',
      signupDate,
      stripeId:  customer.id,
    }),
  });

  if (!res.ok) {
    console.error('Google Sheet error:', await res.text());
  } else {
    console.log('Google Sheet updated for:', customer.name);
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

        console.log('Processing signup for:', customer.name, customer.email);

        await Promise.all([
          sendOwnerNotification(customer, meta, session),
          sendCustomerConfirmation(customer, meta),
          addToGoogleSheet(customer, meta, session),
        ]);

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
