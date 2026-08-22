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
    throw new Error('Email failed');
  } else {
    console.log('Email sent:', payload.subject);
  }
}

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

  const {
    firstName, lastName, email, phone, address, notes,
    product, cut, material, size, qty, price,
    designLink, fileName,
  } = body;

  if (!firstName || !lastName || !email || !phone || !address) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
      <div style="background:#0d0d0d;padding:20px 28px">
        <p style="color:#f5c000;font-weight:800;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0">🦆 Sticker Duck</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:20px">New Sticker Order Request</h2>
      </div>
      <div style="padding:24px 28px">

        <!-- Order Details -->
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #e2e8f0">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8">Order Details</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:100px">Product</td><td style="padding:5px 0;font-weight:700;font-size:14px">${product || '—'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Cut</td><td style="padding:5px 0;font-size:14px">${cut === 'die-cut' ? 'Die Cut' : 'Kiss Cut'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Material</td><td style="padding:5px 0;font-size:14px">${material ? material.charAt(0).toUpperCase() + material.slice(1) : '—'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Size</td><td style="padding:5px 0;font-size:14px">${size || '—'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Quantity</td><td style="padding:5px 0;font-size:14px;font-weight:700">${qty ? parseInt(qty).toLocaleString() : '—'} stickers</td></tr>
          </table>
          <div style="margin-top:12px;padding-top:12px;border-top:2px solid #e2e8f0">
            <span style="font-size:18px;font-weight:800;color:#000">Total: $${price || '—'}</span>
          </div>
        </div>

        <!-- Customer Details -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:100px">Name</td><td style="padding:6px 0;font-weight:600;font-size:14px">${firstName.trim()} ${lastName.trim()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Email</td><td style="padding:6px 0;font-size:14px"><a href="mailto:${email}" style="color:#1e6ef4">${email}</a></td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Phone</td><td style="padding:6px 0;font-size:14px"><a href="tel:${(phone||'').replace(/\D/g,'')}" style="color:#1e6ef4">${phone}</a></td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Ship To</td><td style="padding:6px 0;font-size:14px">${address}</td></tr>
        </table>

        ${designLink ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:12px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Design File Link</p>
          <a href="${designLink}" style="color:#1e6ef4;font-size:14px;word-break:break-all">${designLink}</a>
        </div>
        ` : ''}

        ${fileName ? `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:12px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Design File (to be sent separately)</p>
          <p style="margin:0;font-size:14px;font-weight:600">${fileName}</p>
        </div>
        ` : ''}

        ${notes ? `
        <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;margin-bottom:12px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Notes</p>
          <p style="margin:0;font-size:14px">${notes}</p>
        </div>
        ` : ''}

        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;font-size:13px;color:#713f12;font-weight:600">
          🦆 Next step: Review the order, send a proof, then send a payment link via email or text.
        </div>

        <div style="margin-top:12px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#64748b">
          Submitted ${now} CT
        </div>
      </div>
    </div>`;

  // Customer confirmation email
  const customerHtml = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
      <div style="background:#0d0d0d;padding:20px 28px">
        <p style="color:#f5c000;font-weight:800;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0">🦆 Sticker Duck</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:22px">Order Received, ${firstName.trim()}! 🎉</h2>
      </div>
      <div style="padding:24px 28px">
        <p style="font-size:15px;color:#1e293b;margin:0 0 16px">We got your order for <strong>${qty ? parseInt(qty).toLocaleString() : ''} ${product || 'stickers'}</strong>. Here's what happens next:</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px">
            <strong style="display:block;margin-bottom:2px">🎨 Proof sent shortly</strong>
            <span style="color:#64748b">We'll review your design file and send a digital proof for your approval — usually within a few hours.</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px">
            <strong style="display:block;margin-bottom:2px">💳 Payment link to follow</strong>
            <span style="color:#64748b">Once you approve the proof, we'll send a secure payment link for $${price || '—'}.</span>
          </td></tr>
          <tr><td style="padding:10px 0;font-size:14px">
            <strong style="display:block;margin-bottom:2px">🚀 Printed &amp; shipped in 3–5 days</strong>
            <span style="color:#64748b">After payment, your stickers go to print. Shipped to ${address}.</span>
          </td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:13px;color:#64748b;margin:0">Questions? Text or call Luke at <a href="tel:5123330552" style="color:#1e6ef4">(512) 333-0552</a> or reply to this email.</p>
      </div>
    </div>`;

  try {
    await Promise.all([
      sendEmail({
        from:    'Sticker Duck <notifications@freemanwash.com>',
        to:      ['luke@freemanwash.com'],
        subject: `🦆 New order: ${firstName.trim()} ${lastName.trim()} — ${qty} × ${product}`,
        html,
      }),
      sendEmail({
        from:    'Luke @ Sticker Duck <luke@freemanwash.com>',
        to:      [email],
        subject: `Order received — ${qty} × ${product} · Sticker Duck`,
        html:    customerHtml,
      }),
    ]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sticker order error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
