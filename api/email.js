// Email verification codes (sign-in links, password reset, email change) delivered with Resend.
// Stateless: the server returns an HMAC-signed token; the code is never stored.
//   POST /api/email { action: "send", email, purpose }          -> { token }
//   POST /api/email { action: "verify", email, purpose, code, token } -> { ok: true }
// Environment variables:
//   RESEND_API_KEY  Resend API key (https://resend.com)
//   EMAIL_FROM      verified sender, e.g. "Nexis <no-reply@yourdomain.com>"
//   AUTH_SECRET     long random string used to sign verification tokens
const crypto = require('crypto');
const { send, env, readJson } = require('./_util');
const codes = require('./_codes');

const PURPOSES = { signin: 'Your Nexis sign-in code', reset: 'Reset your Nexis password', verify: 'Confirm your email for Nexis' };
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM') || !env('AUTH_SECRET')) return send(res, 503, { code: 'EMAIL_NOT_CONFIGURED', message: 'Email delivery needs RESEND_API_KEY, EMAIL_FROM and AUTH_SECRET.' });
  const b = await readJson(req) || {};
  const email = String(b.email || '').trim().toLowerCase(); const purpose = String(b.purpose || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !PURPOSES[purpose]) return send(res, 400, { code: 'INVALID_REQUEST', message: 'Enter a valid email address.' });

  if (b.action === 'send') {
    const code = String(crypto.randomInt(100000, 1000000));
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: [email], subject: PURPOSES[purpose], text: `Your Nexis code is ${code}. It expires in 15 minutes. If you didn't request it, ignore this email.`, html: `<p>Your Nexis code is</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>It expires in 15 minutes. If you didn't request it, ignore this email.</p>` }),
    }).catch(() => null);
    if (!r || !r.ok) return send(res, 502, { code: 'EMAIL_SEND_FAILED', message: 'The email could not be sent. Try again.' });
    return send(res, 200, { token: codes.issue(email, purpose, code) });
  }

  if (b.action === 'verify') {
    const err = codes.check(email, purpose, b.code, b.token);
    if (err) return send(res, 400, err);
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { code: 'INVALID_REQUEST', message: 'Unknown action.' });
};
