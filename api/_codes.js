// Stateless email verification codes (shared by /api/email and /api/auth).
// The token is HMAC-signed with AUTH_SECRET; the code itself is never stored.
const crypto = require('crypto');
const { env } = require('./_util');

const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', env('AUTH_SECRET')).update(data).digest('base64url');

function issue(email, purpose, code, ttlMs = 15 * 60e3) {
  const exp = Date.now() + ttlMs;
  const payload = b64u(JSON.stringify({ e: email, p: purpose, exp, h: sign(`${email}|${purpose}|${code}|${exp}`) }));
  return `${payload}.${sign(payload)}`;
}
/** Returns null when valid, otherwise { code, message }. */
function check(email, purpose, code, token) {
  if (!env('AUTH_SECRET')) return { code: 'EMAIL_NOT_CONFIGURED', message: 'Email codes aren’t configured on this server.' };
  const bad = { code: 'BAD_TOKEN', message: 'Request a new code.' };
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || sign(payload) !== sig) return bad;
  let t; try { t = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch (e) { return bad; }
  if (t.e !== String(email || '').trim().toLowerCase() || t.p !== purpose) return bad;
  if (t.exp < Date.now()) return { code: 'EXPIRED', message: 'That code has expired. Request a new one.' };
  const expect = Buffer.from(sign(`${t.e}|${purpose}|${String(code || '').trim()}|${t.exp}`)); const got = Buffer.from(String(t.h));
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return { code: 'BAD_CODE', message: 'That code isn’t right.' };
  return null;
}
module.exports = { issue, check };
