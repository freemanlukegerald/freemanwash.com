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

  const { firstName, lastName, email, phone, address, city, zip, notes } = body;

  if (!firstName || !lastName || !email || !phone || !address || !city || !zip) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const fullAddress = `${address.trim()}, ${city.trim()}, TX ${zip.trim()}`;
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden">
      <div style="background:#0b1120;padding:20px 28px">
        <p style="color:#f97316;font-weight:800;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0">Freeman Exterior Cleaning</p>
        <h2 style="color:#fff;margin:6px 0 0;font-size:20px">New Driveway Lead — $50 Off Offer</h2>
      </div>
      <div style="padding:24px 28px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:110px">Name</td><td style="padding:6px 0;font-weight:600;font-size:14px">${firstName.trim()} ${lastName.trim()}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Email</td><td style="padding:6px 0;font-size:14px"><a href="mailto:${email}" style="color:#1e6ef4">${email}</a></td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Phone</td><td style="padding:6px 0;font-size:14px"><a href="tel:${phone.replace(/\D/g,'')}" style="color:#1e6ef4">${phone}</a></td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Service Address</p>
        <p style="margin:0;font-size:14px;font-weight:600">${fullAddress}</p>
        ${notes ? `
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">Notes</p>
        <p style="margin:0;font-size:14px">${notes}</p>
        ` : ''}
        <div style="margin-top:20px;padding:12px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:13px;color:#92400e;font-weight:600">
          🎯 This customer claimed the $50 off offer — follow up to schedule their quote.
        </div>
        <div style="margin-top:12px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#64748b">
          Submitted ${now} CT
        </div>
      </div>
    </div>`;

  try {
    await sendEmail({
      from:    'Freeman Wash <notifications@freemanwash.com>',
      to:      ['luke@freemanwash.com'],
      subject: `New driveway lead: ${firstName.trim()} ${lastName.trim()} — ${city.trim()}`,
      html,
    });

    // Also log to Google Sheets if configured
    const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (sheetUrl) {
      const signupDate = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      `${firstName.trim()} ${lastName.trim()}`,
          email,
          phone,
          address:   fullAddress,
          pickupDay: 'N/A',
          numBins:   '',
          gateCode:  '',
          notes:     notes || '',
          plan:      'Driveway Lead ($50 Off)',
          status:    'Lead',
          signupDate,
          stripeId:  '',
        }),
      }).catch(err => console.error('Sheet error:', err));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Driveway lead error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
