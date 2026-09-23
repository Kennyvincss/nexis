// Server-side Nexis accounts. Every sign-in method checks credentials here, so an
// account works from any browser or device.
//   POST /api/auth { action, ...params }   (session token in params.token)
// Storage: Netlify Blobs (see _store.js). Passwords: scrypt. Sessions: HMAC-signed tokens
// that can be revoked. Wallet sign-in: Ed25519 signature check (Sign-In With Solana).
// Google: ID token checked with Google (aud must equal GOOGLE_CLIENT_ID).
// Email codes: the same signed codes as /api/email (needs AUTH_SECRET).
const crypto = require('crypto');
const { send, env, readJson } = require('./_util');
const { store, available } = require('./_store');
const codes = require('./_codes');

const DAY = 864e5;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const b64u = (x) => Buffer.from(x).toString('base64url');
const rid = (p, n = 12) => p + crypto.randomBytes(n).toString('base64url');

/* ---------- secrets & tokens ---------- */
let SECRET = null;
async function secret(db) {
  if (SECRET) return SECRET;
  if (env('AUTH_SECRET')) return (SECRET = env('AUTH_SECRET'));
  let s = await db.get('meta:secret');
  if (!s) { s = crypto.randomBytes(48).toString('base64url'); await db.set('meta:secret', s); }
  return (SECRET = s);
}
const mac = (key, kind, payload) => crypto.createHmac('sha256', key).update(kind + '.' + payload).digest('base64url');
function makeToken(key, kind, data) { const p = b64u(JSON.stringify(data)); return `${p}.${mac(key, kind, p)}`; }
function readToken(key, kind, tok) {
  const [p, sig] = String(tok || '').split('.'); if (!p || !sig) return null;
  const want = Buffer.from(mac(key, kind, p)); const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.e && d.e > Date.now() ? d : null; } catch (e) { return null; }
}

/* ---------- passwords & TOTP ---------- */
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
async function pwMatches(u, pw) { if (!u || !u.pw) return false; const h = Buffer.from(await scrypt(pw, u.pw.salt), 'hex'); const want = Buffer.from(u.pw.hash, 'hex'); return h.length === want.length && crypto.timingSafeEqual(h, want); }
function pwStrong(p) { p = String(p || ''); const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length; return p.length >= 8 && (kinds >= 2 || p.length >= 14); }
async function setPassword(u, pw) { if (!pwStrong(pw)) throw fail(400, 'weak_password', 'Use at least 8 characters, mixing letters with numbers or symbols.'); const salt = crypto.randomBytes(16).toString('hex'); u.pw = { salt, hash: await scrypt(pw, salt), set: Date.now() }; }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32dec(s) { s = String(s).replace(/=+$/, '').toUpperCase(); let bits = 0, val = 0; const out = []; for (const c of s) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function b32enc(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function totpAt(secretB32, step) { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32dec(secretB32)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); }
function totpOk(secretB32, code) { code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code)) return false; const s = Math.floor(Date.now() / 30000); return [-1, 0, 1].some(d => totpAt(secretB32, s + d) === code); }

/* ---------- Solana message signatures ---------- */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s) { let n = 0n; for (const c of String(s)) { const i = B58.indexOf(c); if (i < 0) throw fail(400, 'bad_address', 'Invalid wallet address.'); n = n * 58n + BigInt(i); } let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex; const lead = String(s).match(/^1*/)[0].length; return Buffer.concat([Buffer.alloc(lead), n ? Buffer.from(hex, 'hex') : Buffer.alloc(0)]); }
async function verifyWallet(db, { address, message, signature }) {
  const msg = String(message || ''); const pub = b58dec(address);
  if (pub.length !== 32) throw fail(400, 'bad_address', 'Invalid wallet address.');
  if (!msg.includes('\n' + address + '\n')) throw fail(400, 'bad_message', 'The signed message is for a different wallet.');
  const issued = Date.parse((msg.match(/Issued At: (.+)$/m) || [])[1]); if (!(Math.abs(Date.now() - issued) < 10 * 60e3)) throw fail(400, 'stale_message', 'That signature has expired. Try again.');
  const nonce = (msg.match(/Nonce: (\S+)/) || [])[1]; if (!nonce) throw fail(400, 'bad_message', 'Invalid sign-in message.');
  const sig = Buffer.from(String(signature || ''), 'hex'); if (sig.length !== 64) throw fail(400, 'bad_signature', 'Invalid signature.');
  const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]), format: 'der', type: 'spki' });
  if (!crypto.verify(null, Buffer.from(msg, 'utf8'), key, sig)) throw fail(401, 'bad_signature', 'The wallet signature didn’t verify.');
  if (await db.get('nonce:' + nonce)) throw fail(400, 'replayed', 'That signature was already used. Try again.');
  await db.set('nonce:' + nonce, Date.now());
}
async function verifyGoogle(credential) {
  const cid = env('GOOGLE_CLIENT_ID'); if (!cid) throw fail(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in isn’t configured on this server.');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(credential || ''))).catch(() => null);
  const p = r && r.ok ? await r.json() : null;
  if (!p || p.aud !== cid || !['accounts.google.com', 'https://accounts.google.com'].includes(p.iss) || Number(p.exp) * 1000 < Date.now()) throw fail(401, 'bad_google', 'Google sign-in couldn’t be verified. Try again.');
  if (!(p.email_verified === true || p.email_verified === 'true')) throw fail(400, 'unverified', 'Your Google email isn’t verified.');
  return { sub: p.sub, email: normEmail(p.email), name: p.name || '', picture: p.picture || null };
}

/* ---------- user records ---------- */
const getUser = (db, id) => id ? db.get('user:' + id) : null;
async function byIndex(db, kind, key) { const id = await db.get(`${kind}:${key}`); return id ? getUser(db, id) : null; }
const saveUser = (db, u) => db.set('user:' + u.id, u);
function newUser(p = {}) { return { id: rid('usr_', 9), email: p.email || null, emailVerified: !!p.emailVerified, name: p.name || '', handle: '', bio: '', hue: 200 + crypto.randomInt(120), picture: p.picture || null, created: Date.now(), onboarded: false, pw: null, google: null, wallets: [], twoFA: { enabled: false }, sessions: [], activity: [] }; }
function log(u, method, device, ok = true) { u.activity = [{ t: Date.now(), method, device: device || 'Unknown device', ok }, ...(u.activity || [])].slice(0, 30); }
function methods(u) { return [u.pw && 'password', u.google && 'google', ...u.wallets.map(w => 'wallet:' + w.address)].filter(Boolean); }
function pub(u, sid) {
  return { id: u.id, email: u.email, emailVerified: u.emailVerified, name: u.name, handle: u.handle, bio: u.bio, hue: u.hue, picture: u.picture, created: u.created, onboarded: u.onboarded,
    providers: { password: u.pw ? { set: u.pw.set } : null, google: u.google ? { email: u.google.email, name: u.google.name, linked: u.google.linked } : null },
    wallets: u.wallets, twoFA: u.twoFA.pending ? { enabled: false, pending: true, secret: u.twoFA.secret } : { enabled: !!u.twoFA.enabled, since: u.twoFA.since },
    sessions: u.sessions.map(s => ({ ...s, current: s.id === sid })), activity: u.activity };
}
async function startSession(db, key, u, method, device, remember = true, isNewAccount = false) {
  const s = { id: rid('ses_', 9), device: device || 'Unknown device', created: Date.now(), lastActive: Date.now(), method, exp: Date.now() + (remember ? 30 : 1) * DAY };
  u.sessions = [s, ...u.sessions.filter(x => x.exp > Date.now())].slice(0, 10); log(u, method, device); await saveUser(db, u);
  return { token: makeToken(key, 'sess', { u: u.id, s: s.id, e: s.exp }), user: pub(u, s.id), method, isNew: isNewAccount || !u.onboarded };
}
async function finishLogin(db, key, u, method, device, remember, isNewAccount) {
  if (u.twoFA && u.twoFA.enabled) return { needs2FA: true, pending: makeToken(key, 'mfa', { u: u.id, m: method, r: !!remember, e: Date.now() + 5 * 60e3 }), method };
  return startSession(db, key, u, method, device, remember, isNewAccount);
}
async function setHandle(db, u, h) {
  h = String(h).replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(h)) throw fail(400, 'bad_handle', 'Handles use 3–20 letters, numbers or underscores.');
  const l = h.toLowerCase(); if (['you', 'nexis', 'admin', 'support', 'panta'].includes(l)) throw fail(409, 'handle_taken', `@${h} is already taken.`);
  const owner = await db.get('handle:' + l); if (owner && owner !== u.id) throw fail(409, 'handle_taken', `@${h} is already taken.`);
  if (u.handle && u.handle.toLowerCase() !== l) await db.del('handle:' + u.handle.toLowerCase());
  await db.set('handle:' + l, u.id); u.handle = h;
}
function needCode(email, purpose, b) { const err = codes.check(email, purpose, b.code, b.token); if (err) throw fail(400, err.code, err.message); }

/* ---------- actions ---------- */
const PUBLIC = {
  async signup(db, key, b) {
    const email = normEmail(b.email); if (!emailOk(email)) throw fail(400, 'invalid_email', 'Enter a valid email address.');
    const ex = await byIndex(db, 'email', email);
    if (ex) throw fail(409, 'email_in_use', ex.pw ? 'An account with this email already exists. Log in instead.' : 'This email belongs to an account that signs in another way (Google, wallet or email code). Use that, then add a password in Security.');
    const u = newUser({ email }); await setPassword(u, b.password);
    await db.set('email:' + email, u.id);
    return startSession(db, key, u, 'Email + password', b.device, true, true);
  },
  async login(db, key, b) {
    const email = normEmail(b.email); if (!emailOk(email)) throw fail(400, 'invalid_email', 'Enter a valid email address.');
    const a = (await db.get('att:' + email)) || { n: 0, until: 0 };
    if (a.until > Date.now()) throw fail(429, 'locked', `Too many attempts. Try again in ${Math.ceil((a.until - Date.now()) / 1000)} seconds.`);
    const u = await byIndex(db, 'email', email);
    if (!(await pwMatches(u, b.password))) {
      a.n++; if (a.n >= 5) { a.until = Date.now() + 60e3; a.n = 0; } await db.set('att:' + email, a);
      if (u) { log(u, 'Email + password', b.device, false); await saveUser(db, u); }
      throw fail(401, 'bad_credentials', u && !u.pw ? 'This account doesn’t have a password. Sign in with Google, your wallet or an email code.' : 'Email or password is incorrect.');
    }
    await db.del('att:' + email);
    return finishLogin(db, key, u, 'Email + password', b.device, b.remember !== false);
  },
  async verify2fa(db, key, b) {
    const p = readToken(key, 'mfa', b.pending); if (!p) throw fail(401, 'expired', 'That sign-in expired. Start again.');
    const u = await getUser(db, p.u); if (!u || !u.twoFA.enabled || !totpOk(u.twoFA.secret, b.code)) throw fail(401, 'bad_code', 'That code isn’t right. Use the current code from your authenticator app.');
    return startSession(db, key, u, p.m + ' · 2FA', b.device, p.r);
  },
  async emailLogin(db, key, b) {
    const email = normEmail(b.email); needCode(email, 'signin', b);
    let u = await byIndex(db, 'email', email); const fresh = !u;
    if (!u) { u = newUser({ email, emailVerified: true }); await db.set('email:' + email, u.id); }
    u.emailVerified = true; if (fresh) await saveUser(db, u);
    return finishLogin(db, key, u, 'Email code', b.device, true, fresh);
  },
  async google(db, key, b) {
    const g = await verifyGoogle(b.credential);
    let u = (await byIndex(db, 'google', g.sub)) || (await byIndex(db, 'email', g.email)); const fresh = !u;
    if (!u) { u = newUser({ email: g.email, emailVerified: true, name: g.name, picture: g.picture }); await db.set('email:' + g.email, u.id); }
    u.google = { sub: g.sub, email: g.email, name: g.name, linked: (u.google && u.google.linked) || Date.now() }; u.emailVerified = u.emailVerified || u.email === g.email;
    if (!u.name) u.name = g.name; if (!u.picture) u.picture = g.picture;
    await db.set('google:' + g.sub, u.id); await saveUser(db, u);
    return finishLogin(db, key, u, 'Google', b.device, true, fresh);
  },
  async wallet(db, key, b) {
    await verifyWallet(db, b);
    let u = await byIndex(db, 'wallet', b.address); const fresh = !u;
    if (!u) { u = newUser(); u.wallets.push({ address: b.address, label: String(b.label || 'Wallet').slice(0, 30), chain: 'Solana', primary: true, linked: Date.now() }); await db.set('wallet:' + b.address, u.id); await saveUser(db, u); }
    return finishLogin(db, key, u, `Wallet · ${String(b.label || 'Wallet').slice(0, 30)}`, b.device, true, fresh);
  },
  async exists(db, key, b) { const u = await byIndex(db, 'email', normEmail(b.email)); return { exists: !!u, password: !!(u && u.pw) }; },
  async reset(db, key, b) {
    const email = normEmail(b.email); needCode(email, 'reset', b);
    const u = await byIndex(db, 'email', email); if (!u) throw fail(404, 'no_account', 'No account uses this email.');
    await setPassword(u, b.password); u.sessions = []; u.emailVerified = true; log(u, 'Password reset', b.device); await saveUser(db, u); return { ok: true };
  },
};
const AUTHED = {
  async me(db, key, b, u, sid) { const s = u.sessions.find(x => x.id === sid); if (s && Date.now() - s.lastActive > 10 * 60e3) { s.lastActive = Date.now(); await saveUser(db, u); } return { user: pub(u, sid) }; },
  async logout(db, key, b, u, sid) { u.sessions = u.sessions.filter(x => x.id !== sid); await saveUser(db, u); return { ok: true }; },
  async update(db, key, b, u) {
    const p = b.patch || {};
    if (p.handle !== undefined) await setHandle(db, u, p.handle);
    if (p.name !== undefined) { const n = String(p.name).trim(); if (n.length > 40) throw fail(400, 'bad_name', 'Keep your name under 40 characters.'); u.name = n; }
    if (p.bio !== undefined) { const t = String(p.bio); if (t.length > 160) throw fail(400, 'bad_bio', 'Bios can be up to 160 characters.'); u.bio = t; }
    if (p.hue !== undefined && Number.isFinite(+p.hue)) u.hue = Math.round(+p.hue) % 360;
    if (p.onboarded !== undefined) u.onboarded = !!p.onboarded;
  },
  async changePassword(db, key, b, u) {
    if (u.pw && !(await pwMatches(u, b.current))) throw fail(401, 'bad_current', 'Your current password is incorrect.');
    if (!u.email) throw fail(400, 'no_email', 'Add an email address before setting a password.');
    const had = !!u.pw; await setPassword(u, b.next); log(u, had ? 'Password changed' : 'Password added', b.device); return { had };
  },
  async removePassword(db, key, b, u) { if (methods(u).length <= 1) throw fail(400, 'last_method', 'Add another sign-in method before removing your password.'); u.pw = null; },
  async linkWallet(db, key, b, u) {
    await verifyWallet(db, b); const owner = await db.get('wallet:' + b.address);
    if (owner && owner !== u.id) throw fail(409, 'wallet_taken', 'This wallet is linked to another Nexis account.');
    if (owner) throw fail(409, 'wallet_linked', 'This wallet is already linked.');
    u.wallets.push({ address: b.address, label: String(b.label || 'Wallet').slice(0, 30), chain: 'Solana', primary: !u.wallets.length, linked: Date.now() });
    await db.set('wallet:' + b.address, u.id); log(u, `Wallet linked · ${b.label || 'Wallet'}`, b.device);
  },
  async unlinkWallet(db, key, b, u) {
    if (methods(u).length <= 1) throw fail(400, 'last_method', 'This wallet is your only way to sign in. Add another method first.');
    const w = u.wallets.find(x => x.address === b.address); if (!w) return;
    u.wallets = u.wallets.filter(x => x.address !== b.address); if (w.primary && u.wallets[0]) u.wallets[0].primary = true;
    await db.del('wallet:' + b.address); log(u, `Wallet removed · ${w.label}`, b.device);
  },
  async setPrimary(db, key, b, u) { u.wallets.forEach(w => w.primary = w.address === b.address); },
  async linkGoogle(db, key, b, u) {
    const g = await verifyGoogle(b.credential); const owner = await db.get('google:' + g.sub);
    if (owner && owner !== u.id) throw fail(409, 'google_taken', 'This Google account is linked to another Nexis account.');
    u.google = { sub: g.sub, email: g.email, name: g.name, linked: Date.now() }; await db.set('google:' + g.sub, u.id);
    if (!u.email) { const o = await db.get('email:' + g.email); if (!o) { u.email = g.email; u.emailVerified = true; await db.set('email:' + g.email, u.id); } }
    log(u, 'Google connected', b.device);
  },
  async unlinkGoogle(db, key, b, u) { if (methods(u).length <= 1) throw fail(400, 'last_method', 'Google is your only sign-in method. Add another first.'); if (u.google) await db.del('google:' + u.google.sub); u.google = null; },
  async setEmail(db, key, b, u) {
    const e = normEmail(b.email); needCode(e, 'verify', b);
    const o = await db.get('email:' + e); if (o && o !== u.id) throw fail(409, 'email_in_use', 'That email is used by another account.');
    if (u.email && u.email !== e) await db.del('email:' + u.email);
    u.email = e; u.emailVerified = true; await db.set('email:' + e, u.id); log(u, 'Email verified', b.device);
  },
  async start2fa(db, key, b, u) { u.twoFA = { enabled: false, pending: true, secret: b32enc(crypto.randomBytes(20)) }; },
  async confirm2fa(db, key, b, u) { if (!u.twoFA.pending || !totpOk(u.twoFA.secret, b.code)) throw fail(400, 'bad_code', 'That code doesn’t match. Check your phone’s clock and try the current code.'); u.twoFA = { enabled: true, secret: u.twoFA.secret, since: Date.now() }; log(u, '2FA enabled', b.device); },
  async disable2fa(db, key, b, u) { u.twoFA = { enabled: false }; log(u, '2FA disabled', b.device); },
  async revokeSession(db, key, b, u, sid) { if (b.id !== sid) u.sessions = u.sessions.filter(x => x.id !== b.id); },
  async deleteAccount(db, key, b, u) {
    const keys = [u.email && 'email:' + u.email, u.google && 'google:' + u.google.sub, u.handle && 'handle:' + u.handle.toLowerCase(), ...u.wallets.map(w => 'wallet:' + w.address), 'user:' + u.id].filter(Boolean);
    for (const k of keys) await db.del(k); return { deleted: true };
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  res.setHeader('cache-control', 'no-store');
  if (!available()) return send(res, 503, { code: 'ACCOUNTS_UNAVAILABLE', message: 'Server accounts aren’t available on this host.' });
  const b = (await readJson(req)) || {}; const action = String(b.action || '');
  try {
    const db = store(); const key = await secret(db);
    if (PUBLIC[action]) return send(res, 200, await PUBLIC[action](db, key, b));
    if (!AUTHED[action]) return send(res, 400, { code: 'INVALID_REQUEST', message: 'Unknown action.' });
    const t = readToken(key, 'sess', b.token); const u = t && await getUser(db, t.u);
    if (!u || !u.sessions.some(s => s.id === t.s && s.exp > Date.now())) return send(res, 401, { code: 'no_session', message: 'Your session has ended. Log in again.' });
    const out = (await AUTHED[action](db, key, b, u, t.s)) || {};
    if (!out.deleted && action !== 'me') await saveUser(db, u);
    return send(res, 200, { ...out, user: out.deleted ? null : pub(u, t.s) });
  } catch (e) {
    if (e.status) return send(res, e.status, { code: e.code, message: e.message });
    console.error('auth error', e);
    return send(res, 500, { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Try again.' });
  }
};
