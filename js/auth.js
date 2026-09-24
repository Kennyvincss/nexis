/* =====================================================================
   AUTH SERVICE + ACCOUNT VIEWS
   Accounts are stored in this browser (PBKDF2 password hashes). Real
   integrations, each shown as "not configured" when its key is missing:
     Google sign-in   Google Identity Services (GOOGLE_CLIENT_ID)
     Email codes      /api/email via Resend (RESEND_API_KEY, EMAIL_FROM, AUTH_SECRET)
     Wallet sign-in   Phantom / Backpack / Solflare message signature
     2FA              RFC 6238 TOTP (any authenticator app)
   ===================================================================== */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const randB58 = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => B58[b % 58]).join('');
const shortAddr = (a) => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
function pwStrength(p) { p = p || ''; let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (p.length < 8) s = Math.min(s, 1); return Math.min(4, s); }
const PW_LABEL = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
async function hashPw(pw, salt) {
  const enc = new TextEncoder(); const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function deviceLabel() { const ua = navigator.userAgent; const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'; const o = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS'; return `${b} on ${o}`; }
const aerr = (code, message) => Object.assign(new Error(message), { code });

/* ---------- TOTP (RFC 6238) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = (u8) => { let bits = '', out = ''; u8.forEach(b => bits += b.toString(2).padStart(8, '0')); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const b32dec = (s) => { let bits = ''; s.replace(/=+$/, '').toUpperCase().split('').forEach(c => { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); }); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); };
async function totp(secret, t = now()) {
  const counter = Math.floor(t / 1000 / 30); const buf = new ArrayBuffer(8); const dv = new DataView(buf); dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const k = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, buf)); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
async function totpOk(secret, code) { code = String(code || '').replace(/\s/g, ''); for (const d of [-1, 0, 1]) if (await totp(secret, now() + d * 30000) === code) return true; return false; }
function loadScript(src, globalName) { if (window[globalName]) return Promise.resolve(window[globalName]); return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(window[globalName]); s.onerror = () => rej(new Error('Couldn’t load ' + src)); document.head.appendChild(s); }); }

/* ---------- Privy (email one-time codes, sent and checked by Privy) ----------
   Enabled when the server has PRIVY_APP_ID and PRIVY_APP_SECRET. The Privy SDK is
   loaded only when someone uses an email code. The server verifies Privy's signed
   token and reads the verified email before signing anyone in. */
const PrivyAuth = {
  client: null,
  get appId() { return Config.c && Config.c.privy && Config.c.privy.appId; },
  get enabled() { return !!(this.appId && Config.c.privy.server); },
  async get() {
    if (this.client) return this.client;
    const P = await loadScript('/js/vendor/privy-core.js', 'NexisPrivy');
    if (!P) throw aerr('PRIVY_LOAD', 'Couldn’t load Privy. Check your connection or ad blocker.');
    const c = new P.Privy({ appId: this.appId, storage: new P.LocalStorage() });
    await c.initialize(); this.client = c; return c;
  },
  msg(e) { const m = String((e && e.message) || e || ''); return /invalid.*code|code.*invalid|incorrect/i.test(m) ? 'That code isn’t right.' : /expired/i.test(m) ? 'That code has expired. Request a new one.' : /too many|rate/i.test(m) ? 'Too many attempts. Wait a minute and try again.' : /origin|domain|not allowed/i.test(m) ? 'Privy rejected this site. Add this domain under Allowed domains in the Privy dashboard.' : m || 'Privy couldn’t complete the request.'; },
  async send(email) { try { await (await this.get()).auth.email.sendCode(email); } catch (e) { throw aerr('PRIVY', this.msg(e)); } },
  async verify(email, code) {
    try { const c = await this.get(); const r = await c.auth.email.loginWithCode(email, String(code || '').trim()); return { accessToken: r.token || await c.getAccessToken(), idToken: r.identity_token || await c.getIdentityToken() }; }
    catch (e) { throw aerr('PRIVY', this.msg(e)); }
  },
  async logout() { if (this.client) { try { await this.client.auth.logout(); } catch (e) {} } },
};

/* ---------- email codes: Privy when configured, otherwise Resend via /api/email ---------- */
const EmailCodes = {
  get resend() { return !!(Config.c && Config.c.email && Config.c.email.configured); },
  get configured() { return PrivyAuth.enabled || this.resend; },
  tokens: {},
  token(purpose, email) { const t = this.tokens[purpose + ':' + String(email).toLowerCase()]; if (!t) throw aerr('NO_CODE', 'Request a code first.'); return t; },
  async send(email, purpose) {
    if (PrivyAuth.enabled) return PrivyAuth.send(String(email).trim().toLowerCase());
    const r = await Net.api('email', { method: 'POST', body: { action: 'send', email, purpose } }); this.tokens[purpose + ':' + email.toLowerCase()] = r.token; return true;
  },
  async verify(email, purpose, code) { const token = this.token(purpose, email); await Net.api('email', { method: 'POST', body: { action: 'verify', email, purpose, code, token } }); delete this.tokens[purpose + ':' + email.toLowerCase()]; return true; },
  /** Proof that the user received the code, for the accounts server. Browser-only accounts check it here instead. */
  async proof(purpose, email, code) {
    email = String(email).trim().toLowerCase();
    if (PrivyAuth.enabled) { const privy = await PrivyAuth.verify(email, code); return Auth.adapter.remote ? { privy } : {}; }
    if (!Auth.adapter.remote) { await this.verify(email, purpose, code); return {}; }
    return { code, token: this.token(purpose, email) };
  },
};

/* ---------- local account store ---------- */
const AUTH_KEY = 'nexis-auth-v2';
const LocalAccounts = {
  db: null,
  load() { try { this.db = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { this.db = null; } this.db = this.db || { users: {}, session: null, attempts: {} }; },
  persist() { try { localStorage.setItem(AUTH_KEY, JSON.stringify(this.db)); } catch (e) {} },
  users() { return Object.values(this.db.users); },
  findByEmail(e) { e = String(e || '').trim().toLowerCase(); return this.users().find(u => u.email === e); },
  findByWallet(a) { return this.users().find(u => u.wallets.some(w => w.address === a)); },
  current() { const s = this.db.session; if (!s || s.expires < now()) return null; return this.db.users[s.uid] || null; },
  methods(u) { return [u.providers.password && 'password', u.providers.google && 'google', ...u.wallets.map(w => 'wallet:' + w.address)].filter(Boolean); },
  newUser(p) { const id = 'usr_' + randB58(10); const u = { id, email: p.email ? p.email.trim().toLowerCase() : null, emailVerified: !!p.emailVerified, name: p.name || '', handle: '', bio: '', hue: 200 + Math.floor(Math.random() * 120), created: now(), onboarded: false, providers: { password: null, google: null }, wallets: [], twoFA: { enabled: false }, sessions: [], activity: [], picture: p.picture || null }; this.db.users[id] = u; return u; },
  log(u, method, ok = true) { u.activity.unshift({ t: now(), method, device: deviceLabel(), ok }); u.activity = u.activity.slice(0, 30); },
  startSession(u, method, remember = true) {
    const s = { id: 'ses_' + randB58(10), uid: u.id, method, created: now(), expires: now() + (remember ? 30 : 1) * DAY, device: deviceLabel() };
    u.sessions = [{ id: s.id, device: s.device, created: now(), lastActive: now(), current: true, method }, ...u.sessions.map(x => ({ ...x, current: false }))].slice(0, 5);
    this.log(u, method); this.db.session = s; this.persist(); return { user: u, session: s, isNew: !u.onboarded };
  },
  checkPw(p) { if ((p || '').length < 8 || pwStrength(p) < 2) throw aerr('weak_password', 'Use at least 8 characters, mixing letters with numbers or symbols.'); },
  async signUp({ email, password }) {
    if (!emailOk(email)) throw aerr('invalid_email', 'Enter a valid email address.'); this.checkPw(password);
    const ex = this.findByEmail(email); if (ex) throw aerr('email_in_use', ex.providers.password ? 'An account with this email already exists on this device. Log in instead.' : 'This email belongs to an account that signs in another way. Use that method, then add a password in Security.');
    const u = this.newUser({ email }); const salt = randB58(16); u.providers.password = { salt, hash: await hashPw(password, salt), set: now() };
    return this.startSession(u, 'Email + password');
  },
  async signIn({ email, password, remember }) {
    email = String(email || '').trim().toLowerCase(); if (!emailOk(email)) throw aerr('invalid_email', 'Enter a valid email address.');
    const a = this.db.attempts[email] || { n: 0, until: 0 }; if (a.until > now()) throw aerr('locked', `Too many attempts. Try again in ${Math.ceil((a.until - now()) / 1000)} seconds.`);
    const u = this.findByEmail(email); const ok = !!(u && u.providers.password && (await hashPw(password || '', u.providers.password.salt)) === u.providers.password.hash);
    if (!ok) { a.n++; if (a.n >= 5) { a.until = now() + 60e3; a.n = 0; } this.db.attempts[email] = a; if (u) this.log(u, 'Email + password', false); this.persist(); throw aerr('bad_credentials', 'Email or password is incorrect.'); }
    delete this.db.attempts[email]; if (u.twoFA.enabled) { this.persist(); return { needs2FA: true, uid: u.id, remember, method: 'Email + password' }; }
    return this.startSession(u, 'Email + password', remember);
  },
  async verify2FA({ uid, code, remember, method }) { const u = this.db.users[uid]; if (!u || !(await totpOk(u.twoFA.secret, code))) throw aerr('bad_code', 'That code isn’t right. Use the current code from your authenticator app.'); return this.startSession(u, method + ' · 2FA', remember); },
  emailLogin(email) { email = email.trim().toLowerCase(); let u = this.findByEmail(email) || this.newUser({ email }); u.emailVerified = true; if (u.twoFA.enabled) { this.persist(); return { needs2FA: true, uid: u.id, remember: true, method: 'Email code' }; } return this.startSession(u, 'Email code'); },
  google({ email, name, picture, sub }) {
    email = String(email).toLowerCase(); let u = this.users().find(x => x.providers.google && x.providers.google.sub === sub) || this.findByEmail(email);
    if (!u) u = this.newUser({ email, name, emailVerified: true, picture });
    u.providers.google = { email, name, sub, linked: (u.providers.google && u.providers.google.linked) || now() }; u.emailVerified = true; if (!u.name) u.name = name || ''; if (!u.picture) u.picture = picture || null;
    if (u.twoFA.enabled) { this.persist(); return { needs2FA: true, uid: u.id, remember: true, method: 'Google' }; }
    return this.startSession(u, 'Google');
  },
  wallet({ address, label }) { let u = this.findByWallet(address); if (!u) { u = this.newUser({}); u.wallets.push({ address, label, chain: 'Solana', primary: true, linked: now() }); } return this.startSession(u, `Wallet · ${label}`); },
  async resetPassword({ email, password }) { this.checkPw(password); const u = this.findByEmail(email); if (!u) throw aerr('no_account', 'No account with this email exists on this device.'); const salt = randB58(16); u.providers.password = { salt, hash: await hashPw(password, salt), set: now() }; u.sessions = []; this.log(u, 'Password reset'); this.persist(); },
  signOut() { const u = this.current(); if (u) u.sessions = u.sessions.filter(x => !x.current); this.db.session = null; this.persist(); },
  me() { const u = this.current(); if (!u) throw aerr('no_session', 'Your session has ended. Log in again.'); return u; },
  handleFree(h, uid) { const l = h.toLowerCase(); return !(['you', 'nexis', 'admin', 'support', 'panta'].includes(l) || this.users().some(x => x.id !== uid && (x.handle || '').toLowerCase() === l)); },
  updateProfile(patch) {
    const u = this.me();
    if (patch.handle !== undefined) { const h = String(patch.handle).replace(/^@/, '').trim(); if (!/^[A-Za-z0-9_]{3,20}$/.test(h)) throw aerr('bad_handle', 'Handles use 3–20 letters, numbers or underscores.'); if (!this.handleFree(h, u.id)) throw aerr('handle_taken', `@${h} is already taken.`); patch.handle = h; }
    if (patch.name !== undefined && patch.name.trim().length > 40) throw aerr('bad_name', 'Keep your name under 40 characters.');
    if (patch.bio !== undefined && patch.bio.length > 160) throw aerr('bad_bio', 'Bios can be up to 160 characters.');
    Object.assign(u, patch); this.persist(); return u;
  },
  async changePassword({ current, next }) {
    const u = this.me(); if (u.providers.password && (await hashPw(current || '', u.providers.password.salt)) !== u.providers.password.hash) throw aerr('bad_current', 'Your current password is incorrect.');
    this.checkPw(next); if (!u.email) throw aerr('no_email', 'Add an email address before setting a password.');
    const had = !!u.providers.password; const salt = randB58(16); u.providers.password = { salt, hash: await hashPw(next, salt), set: now() }; this.log(u, had ? 'Password changed' : 'Password added'); this.persist(); return had;
  },
  removePassword() { const u = this.me(); if (this.methods(u).length <= 1) throw aerr('last_method', 'Add another sign-in method before removing your password.'); u.providers.password = null; this.persist(); },
  linkWallet({ address, label }) { const u = this.me(); const o = this.findByWallet(address); if (o && o.id !== u.id) throw aerr('wallet_taken', 'This wallet is linked to another Nexis account on this device.'); if (o) throw aerr('wallet_linked', 'This wallet is already linked.'); u.wallets.push({ address, label, chain: 'Solana', primary: !u.wallets.length, linked: now() }); this.log(u, `Wallet linked · ${label}`); this.persist(); return u; },
  unlinkWallet(address) { const u = this.me(); if (this.methods(u).length <= 1) throw aerr('last_method', 'This wallet is your only way to sign in. Add another method first.'); const w = u.wallets.find(x => x.address === address); u.wallets = u.wallets.filter(x => x.address !== address); if (w && w.primary && u.wallets[0]) u.wallets[0].primary = true; this.log(u, `Wallet removed · ${w ? w.label : ''}`); this.persist(); },
  setPrimaryWallet(address) { const u = this.me(); u.wallets.forEach(w => w.primary = w.address === address); this.persist(); },
  linkGoogle(p) { const u = this.me(); u.providers.google = { email: p.email, name: p.name, sub: p.sub, linked: now() }; if (!u.email) { u.email = p.email; u.emailVerified = true; } this.persist(); return u; },
  unlinkGoogle() { const u = this.me(); if (this.methods(u).length <= 1) throw aerr('last_method', 'Google is your only sign-in method. Add another first.'); u.providers.google = null; this.persist(); },
  setEmail(email) { const u = this.me(); const e = email.trim().toLowerCase(); const o = this.findByEmail(e); if (o && o.id !== u.id) throw aerr('email_in_use', 'That email is used by another account on this device.'); u.email = e; u.emailVerified = true; this.log(u, 'Email verified'); this.persist(); },
  start2FA() { const u = this.me(); u.twoFA = { enabled: false, pending: true, secret: b32enc(crypto.getRandomValues(new Uint8Array(20))) }; this.persist(); return u.twoFA; },
  async confirm2FA(code) { const u = this.me(); if (!(await totpOk(u.twoFA.secret, code))) throw aerr('bad_code', 'That code doesn’t match. Check your phone’s clock and try the current code.'); u.twoFA.enabled = true; u.twoFA.pending = false; u.twoFA.since = now(); this.log(u, '2FA enabled'); this.persist(); },
  disable2FA() { const u = this.me(); u.twoFA = { enabled: false }; this.log(u, '2FA disabled'); this.persist(); },
  revokeSession(id) { const u = this.me(); u.sessions = u.sessions.filter(x => x.id !== id || x.current); this.persist(); },
  deleteAccount() { const u = this.me(); delete this.db.users[u.id]; this.db.session = null; this.persist(); try { localStorage.removeItem(LS_KEY + ':' + u.id); } catch (e) {} },
};
/* ---------- server accounts (/api/auth): work from any browser or device ---------- */
const SESSION_KEY = 'nexis-session-v3';
const RemoteAccounts = {
  remote: true, db: null,
  load() { try { this.db = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { this.db = null; } },
  persist() { try { if (this.db) localStorage.setItem(SESSION_KEY, JSON.stringify(this.db)); else localStorage.removeItem(SESSION_KEY); } catch (e) {} },
  current() { return (this.db && this.db.user) || null; },
  methods(u) { return LocalAccounts.methods(u); },
  async call(action, body = {}, authed = false) {
    try { return await Net.api('auth', { method: 'POST', timeout: 20000, body: { action, device: deviceLabel(), ...body, ...(authed ? { token: this.db && this.db.token } : {}) } }); }
    catch (e) {
      if (authed && e.status === 401) { this.db = null; this.persist(); Bus.emit('auth:expired'); }
      if (e.code === 'NO_API' || e.code === 'NETWORK') throw aerr(e.code, 'Can’t reach the Nexis server. Check your connection and try again.');
      throw aerr(e.code || 'error', e.message);
    }
  },
  take(r) { if (r.needs2FA) return { needs2FA: true, pending: r.pending, method: r.method }; this.db = { token: r.token, user: r.user }; this.persist(); return { user: r.user, session: { method: r.method }, isNew: r.isNew }; },
  async authed(action, body) { const r = await this.call(action, body, true); if (r.user && this.db) { this.db.user = r.user; this.persist(); } return r; },
  async signUp({ email, password }) { if (!emailOk(email)) throw aerr('invalid_email', 'Enter a valid email address.'); LocalAccounts.checkPw(password); return this.take(await this.call('signup', { email, password })); },
  async signIn({ email, password, remember }) { if (!emailOk(String(email || '').trim())) throw aerr('invalid_email', 'Enter a valid email address.'); return this.take(await this.call('login', { email, password, remember })); },
  async verify2FA({ pending, code }) { return this.take(await this.call('verify2fa', { pending, code })); },
  async emailLogin(email, proof = {}) { return this.take(await this.call('emailLogin', { email, ...proof })); },
  async google({ credential }) { return this.take(await this.call('google', { credential })); },
  async wallet({ address, label, message, signature }) { return this.take(await this.call('wallet', { address, label, message, signature })); },
  async findByEmail(email) { const r = await this.call('exists', { email }); return r.exists ? r : null; },
  async resetPassword({ email, password, ...proof }) { LocalAccounts.checkPw(password); await this.call('reset', { email, password, ...proof }); },
  signOut() { const t = this.db && this.db.token; this.db = null; this.persist(); if (t) Net.api('auth', { method: 'POST', body: { action: 'logout', token: t } }).catch(() => {}); },
  me() { const u = this.current(); if (!u) throw aerr('no_session', 'Your session has ended. Log in again.'); return u; },
  async refresh() { if (!this.db) return null; const r = await this.authed('me'); return r.user; },
  handleFree() { return true; }, // checked by the server when saved
  async updateProfile(patch) { return (await this.authed('update', { patch })).user; },
  async changePassword({ current, next }) { LocalAccounts.checkPw(next); return (await this.authed('changePassword', { current, next })).had; },
  async removePassword() { await this.authed('removePassword'); },
  async linkWallet({ address, label, message, signature }) { return (await this.authed('linkWallet', { address, label, message, signature })).user; },
  async unlinkWallet(address) { await this.authed('unlinkWallet', { address }); },
  async setPrimaryWallet(address) { await this.authed('setPrimary', { address }); },
  async linkGoogle({ credential }) { return (await this.authed('linkGoogle', { credential })).user; },
  async unlinkGoogle() { await this.authed('unlinkGoogle'); },
  async setEmail(email, proof = {}) { await this.authed('setEmail', { email, ...proof }); },
  async start2FA() { return (await this.authed('start2fa')).user.twoFA; },
  async confirm2FA(code) { await this.authed('confirm2fa', { code }); },
  async disable2FA() { await this.authed('disable2fa'); },
  async revokeSession(id) { await this.authed('revokeSession', { id }); },
  async deleteAccount() { const u = this.current(); await this.call('deleteAccount', {}, true); this.db = null; this.persist(); try { if (u) localStorage.removeItem(LS_KEY + ':' + u.id); } catch (e) {} },
};
/* Server accounts when the host provides storage (Netlify Blobs); browser-only accounts otherwise. */
const AUTH_MODE_KEY = 'nexis-auth-mode';
const Auth = {
  adapter: RemoteAccounts, mode: 'remote',
  init() { LocalAccounts.load(); RemoteAccounts.load(); let m = 'remote'; try { m = localStorage.getItem(AUTH_MODE_KEY) || 'remote'; } catch (e) {} this.setMode(m, false); },
  setMode(m, save = true) { this.mode = m === 'local' ? 'local' : 'remote'; this.adapter = this.mode === 'local' ? LocalAccounts : RemoteAccounts; if (save) { try { localStorage.setItem(AUTH_MODE_KEY, this.mode); } catch (e) {} } },
  get user() { return this.adapter.current(); }, methods(u) { return this.adapter.methods(u || this.user); },
};
Auth.init();
const meHandle = () => (Auth.user && Auth.user.handle) || 'you';
const meName = () => { const u = Auth.user; if (!u) return 'Guest'; return u.name || u.handle || (u.email ? u.email.split('@')[0] : '') || (u.wallets[0] ? shortAddr(u.wallets[0].address) : 'You'); };
const primaryWallet = () => Auth.user && (Auth.user.wallets.find(w => w.primary) || Auth.user.wallets[0]);
const meAvatar = (size = '') => { const u = Auth.user; return avatarFor(meName(), u && u.picture, size); };

/* ---------- flow orchestration ---------- */
UI.auth = { view: 'main', email: '', pending: null, next: '' };
function onAuthed(res) {
  if (res.needs2FA) { UI.auth.pending = res; UI.auth.view = 'twofa'; closeModal(true); if (!['login', 'signup'].includes(current.route)) location.hash = '#/login'; else refreshAuth(); return; }
  const u = res.user; Store.init(u.id); closeModal(true);
  const next = UI.auth.next; UI.auth = { view: 'main', email: '', pending: null, next: '' };
  setTimeout(() => { Wallets.watch(); Balances.refresh(); }, 300);
  if (res.isNew) { location.hash = '#/onboarding'; return; }
  toast({ title: `Welcome back${u.name ? ', ' + u.name.split(' ')[0] : ''}`, body: `Signed in with ${esc(res.session.method)}.` });
  location.hash = next && !/^\/?(login|signup|forgot|onboarding)/.test(next) ? '#' + next.replace(/^#/, '') : '#/home';
}
function authErrorHtml(msg) { return msg ? `<div class="auth-err" role="alert">${ic('alert', 'sm')}<span>${esc(msg)}</span></div>` : ''; }
function setBusy(btn, busy, label) { if (!btn) return; if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label || 'Working…'}`; } else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; } }
function requireAuth(fn, why = 'Log in to continue') { if (Auth.user) return fn(); toast({ title: why, body: 'Create a free account or log in.', kind: 'info' }); UI.auth.next = location.hash.slice(1); location.hash = '#/login'; }

/* ---------- wallet connect (sign-in / link) ---------- */
function siwsMessage(address, nonce) { return `${location.host} wants you to sign in with your Solana account:\n${address}\n\nSign in to Nexis. This request will not trigger a transaction or cost any fees.\n\nURI: ${location.origin}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`; }
function openWalletFlow({ mode = 'login', onDone } = {}) {
  const title = mode === 'login' ? 'Continue with Wallet' : 'Link a wallet';
  const pick = () => `${modalHead(title, mode === 'login' ? 'Your wallet becomes your Nexis identity. No transaction, no fees.' : 'Linked wallets sign your Panta trades and fund them with USDC.')}<div class="modal-body" style="gap:8px">
    ${WALLETS.map(w => { const d = !!w.get(); return d ? `<button class="wrow" data-action="walletPick" data-w="${w.id}">${walletIcon(w)}<span style="flex:1;text-align:left"><b>${w.name}</b><span class="mut" style="display:block;font-size:12px">Detected in this browser</span></span><span class="tag green">Detected</span>${ic('chevRight', 'sm')}</button>` : `<a class="wrow" href="${w.url}" target="_blank" rel="noopener">${walletIcon(w)}<span style="flex:1;text-align:left"><b>${w.name}</b><span class="mut" style="display:block;font-size:12px">Not installed</span></span><span class="tag">Install ${ic('ext', 'sm')}</span></a>`; }).join('')}
    <p class="mut" style="font-size:12px;margin-top:6px">Nexis asks your wallet to sign a message to prove you own it (Sign-In With Solana). Signing never moves funds.</p>
    ${!WALLETS.some(w => w.get()) ? infoNote('No Solana wallet extension was found in this browser. Install Phantom, Backpack or Solflare, then reload this page.') : ''}</div>`;
  openModal(pick(), { label: title }); UI.walletFlow = { mode, onDone, pick };
}
async function walletConnect(id) {
  const F = UI.walletFlow; const W = WALLETS.find(x => x.id === id);
  setModal(`${modalHead(`Connect ${W.name}`)}<div class="modal-body"><div class="wstep">${walletIcon(W, 52)}<div class="spin lg"></div></div><p style="text-align:center">Approve the connection request in ${W.name}.</p></div>`);
  let c; try { c = await Wallets.connect(id); } catch (e) { return setModal(`${modalHead(`Connect ${W.name}`)}<div class="modal-body">${emptyState({ icon: 'alert', title: 'Not connected', body: esc(e.message || 'The request was rejected or closed in your wallet.') })}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="walletBack">Choose another wallet</button></div>`); }
  const nonce = randB58(16); const msg = siwsMessage(c.address, nonce); F.pending = { ...c, msg };
  setModal(`${modalHead('Verify ownership', `${W.name} · ${shortAddr(c.address)}`)}<div class="modal-body"><div class="row" style="gap:12px">${walletIcon(W, 40)}<div><b class="num">${shortAddr(c.address)}</b><div class="mut" style="font-size:12px">Connected</div></div><span class="tag green" style="margin-left:auto">${ic('check', 'sm')}Connected</span></div><div><div class="label" style="margin-bottom:6px">Message to sign</div><pre class="sigmsg">${esc(msg)}</pre></div><p class="mut" style="font-size:12px">This proves you control the wallet. It is not a transaction and costs nothing.</p></div><div class="modal-foot"><button class="btn btn-ghost" data-action="walletBack">Back</button><button class="btn btn-blue" data-action="walletSign" autofocus>${ic('key', 'sm')}Sign message</button></div>`);
}
async function walletSign(btn) {
  const F = UI.walletFlow; const p = F.pending; setBusy(btn, true, 'Waiting for signature…');
  let sig; try { sig = await Wallets.signMessage(p.prov, p.msg); } catch (e) { setBusy(btn, false); return toast({ title: 'Signature declined', body: 'Nothing was signed.', kind: 'warn' }); }
  try {
    const proof = { address: p.address, label: p.W.name, message: p.msg, signature: sig };
    if (F.mode === 'login') return onAuthed(await Auth.adapter.wallet(proof));
    await Auth.adapter.linkWallet(proof); Wallets.watch(); Balances.refresh();
    setModal(`${modalHead('Wallet linked')}<div class="modal-body"><div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">${p.W.name} · <span class="num">${shortAddr(p.address)}</span></h3><p class="dim" style="margin-top:4px">This wallet can sign in and sign your Panta trades.</p></div></div><div class="modal-foot"><button class="btn btn-primary" data-action="walletDone">Continue</button></div>`);
  } catch (e) { setBusy(btn, false); toast({ title: 'Couldn’t link wallet', body: esc(e.message), kind: 'err' }); }
}

/* ---------- Google Identity Services ---------- */
async function openGoogleFlow({ mode = 'login' } = {}) {
  const cid = Config.c && Config.c.google && Config.c.google.clientId;
  if (!cid) return openModal(`${modalHead('Continue with Google')}<div class="modal-body">${unavailable('Google sign-in isn’t configured', 'The site owner needs to create an OAuth client in Google Cloud and add its ID as <code>GOOGLE_CLIENT_ID</code> on the server.')}</div>`);
  openModal(`${modalHead(mode === 'login' ? 'Continue with Google' : 'Connect Google')}<div class="modal-body"><div id="gsi-btn" style="display:flex;justify-content:center;min-height:44px"><span class="spin"></span></div><p class="mut" style="font-size:12px;text-align:center">Google shares your name, email and profile picture with Nexis.</p><div data-err></div></div>`);
  try {
    const g = await loadScript('https://accounts.google.com/gsi/client', 'google');
    g.accounts.id.initialize({ client_id: cid, callback: async (resp) => {
      try { const p = JSON.parse(decodeURIComponent(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        if (!p.email_verified) throw new Error('Your Google email isn’t verified.');
        const g2 = { credential: resp.credential, email: p.email, name: p.name, picture: p.picture, sub: p.sub };
        if (mode === 'link') { await Auth.adapter.linkGoogle(g2); closeModal(); toast({ title: 'Google connected' }); refresh(); }
        else onAuthed(await Auth.adapter.google(g2));
      } catch (e) { const box = $('.overlay [data-err]'); if (box) box.innerHTML = authErrorHtml(e.message); }
    } });
    const el = $('#gsi-btn'); if (el) { el.innerHTML = ''; g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 320 }); }
  } catch (e) { const box = $('.overlay [data-err]'); if (box) box.innerHTML = authErrorHtml('Google sign-in couldn’t load. Check your connection or ad blocker.'); }
}

/* ---------- auth pages ---------- */
function authSide() {
  const top = [...Panta.markets.values()].filter(m => m.yes != null && m.tradable).slice(0, 2);
  const btc = Crypto.bySym.get('BTC'), g = Sports.list().find(x => x.state === 'in' && x.home);
  const rows = [
    ...top.map(m => `<a href="#/market/${m.id}" class="row"><span class="tag">${esc(PANTA_CAT_LABEL[m.category] || m.category)}</span><span style="flex:1;font-size:13px">${esc(m.title)}</span><span class="num up" data-py="${m.id}">${cents(m.yes)}</span></a>`),
    g ? `<a href="#/event/${g.id}" class="row"><span class="live-badge sm"><span class="live-dot red"></span>${esc(g.clock || 'LIVE')}</span><span style="flex:1;font-size:13px">${esc(g.home.short)} <span class="num">${g.home.score ?? ''}–${g.away.score ?? ''}</span> ${esc(g.away.short)}</span></a>` : '',
    btc ? `<a href="#/crypto/bitcoin" class="row"><span class="tag">BTC</span><span style="flex:1;font-size:13px">Bitcoin</span><span class="num" data-cpx="BTC">${fmtPx(btc.price)}</span></a>` : '',
  ].filter(Boolean);
  return `<aside class="auth-side"><a class="logo" href="#/">${logoMark}<span class="wm">NEXIS</span></a><div><h2>See the signal.<br><span class="mut">Make the move.</span></h2><p class="dim" style="margin-top:14px;max-width:40ch">Trade prediction markets on Panta, track real traders, and follow live sports and crypto.</p>${rows.length ? `<div class="auth-mini">${rows.join('')}</div>` : ''}</div><p class="mut" style="font-size:12px">Markets settle on Solana in USDC. Trade only what you can afford to lose.</p></aside>`;
}
function authCard(mode) {
  const A = UI.auth; const isLogin = mode === 'login'; const emailReady = EmailCodes.configured; const gReady = !!(Config.c && Config.c.google && Config.c.google.clientId);
  if (A.view === 'emailCode') return `<button class="link" data-action="authView" data-v="main">${ic('chevLeft', 'sm')}All sign-in options</button><h1>Continue with email</h1><p class="dim">We’ll email you a 6-digit sign-in code.</p>
    ${A.codeSent ? `<form class="stack" style="gap:14px" data-form="emailCodeVerify" novalidate><p class="dim" style="font-size:13px">Code sent to <b style="color:var(--text)">${esc(A.email)}</b>. It expires in 15 minutes.</p><input class="input otp num" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" autofocus><div data-err></div><button class="btn btn-primary lg block" type="submit">Sign in</button><button type="button" class="btn btn-quiet block" data-action="resendCode">Resend code</button></form>`
    : `<form class="stack" style="gap:14px" data-form="emailCodeSend" novalidate><label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(A.email)}" placeholder="you@example.com" autofocus></label><div data-err></div><button class="btn btn-primary lg block" type="submit">${ic('mail', 'sm')}Send code</button></form>`}`;
  if (A.view === 'twofa') return `<div class="auth-icon">${ic('shield', 'lg')}</div><h1>Two-factor authentication</h1><p class="dim">Enter the 6-digit code from your authenticator app.</p><form class="stack" style="gap:14px" data-form="twofa" novalidate><input class="input otp num" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" autofocus><div data-err></div><button class="btn btn-primary lg block" type="submit">Verify</button></form><button class="link" data-action="authView" data-v="main">${ic('chevLeft', 'sm')}Back to log in</button>`;
  return `<h1>${isLogin ? 'Welcome back' : 'Create your Nexis account'}</h1><p class="dim">${isLogin ? 'Log in to trade, track traders and follow live markets.' : 'Free to join. Connect a Solana wallet to trade on Panta.'}</p>
    <div class="seg text auth-tabs" role="tablist"><a class="${isLogin ? 'on' : ''}" href="#/login" role="tab" aria-selected="${isLogin}">Log in</a><a class="${!isLogin ? 'on' : ''}" href="#/signup" role="tab" aria-selected="${!isLogin}">Create account</a></div>
    <div class="stack" style="gap:8px">
      <button class="sso" data-action="authGoogle">${googleG}<span>Continue with Google</span><span class="sso-sub">${gReady ? 'Gmail' : 'Not configured'}</span></button>
      <button class="sso" data-action="authWallet">${ic('wallet')}<span>Continue with Wallet</span><span class="sso-sub">Phantom, Backpack, Solflare</span></button>
      <button class="sso" data-action="authView" data-v="emailCode" ${emailReady ? '' : 'disabled title="Email delivery isn’t configured"'}>${ic('mail')}<span>Continue with Email</span><span class="sso-sub">${emailReady ? 'One-time code' : 'Not configured'}</span></button>
    </div>
    <div class="or">or with email and password</div>
    <form class="stack" style="gap:14px" data-form="${isLogin ? 'login' : 'signup'}" novalidate>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(A.email)}" placeholder="you@example.com" required></label>
      <div class="field"><div class="row" style="justify-content:space-between"><label class="label" for="pw-${mode}">Password</label>${isLogin ? '<a class="link" href="#/forgot" style="font-size:12px">Forgot password?</a>' : ''}</div>
        <div class="pw-field"><input class="input" id="pw-${mode}" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="${isLogin ? 'Your password' : 'At least 8 characters'}" required ${!isLogin ? 'data-strength' : ''}><button type="button" class="pw-eye" data-action="pwToggle" aria-label="Show password" aria-pressed="false">${ic('eye', 'sm')}</button></div>
        ${!isLogin ? '<div class="pw-meter" data-meter><i></i><i></i><i></i><i></i><span class="mut">Use 8+ characters with letters and numbers</span></div>' : ''}</div>
      ${isLogin ? '<label class="check" style="padding:0"><input type="checkbox" name="remember" checked><span style="font-size:13px">Keep me logged in for 30 days</span></label>' : '<label class="check" style="padding:0"><input type="checkbox" name="terms"><span style="font-size:13px" class="dim">I agree to the Terms and Privacy Policy and understand prediction markets involve risk of loss.</span></label>'}
      <div data-err></div><button class="btn btn-primary lg block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    </form>
    <p class="dim" style="font-size:13px;text-align:center">${isLogin ? 'New to Nexis? <a class="blue" href="#/signup">Create an account</a>' : 'Already have an account? <a class="blue" href="#/login">Log in</a>'}</p>`;
}
function authPage(mode) { return `<div class="auth">${authSide()}<main class="auth-main"><a class="logo auth-logo" href="#/">${logoMark}<span class="wm">NEXIS</span></a><div class="auth-card" id="auth-card">${authCard(mode)}</div><div class="auth-foot"><span class="mut">${Auth.mode === 'remote' ? 'Your Nexis account works on any device.' : 'Your Nexis account is stored in this browser.'} Trades are signed by your own wallet.</span><a class="link" href="#/home">Explore without an account ${ic('arrowR', 'sm')}</a></div></main></div>`; }
function refreshAuth() { const c = $('#auth-card'); if (c) { c.innerHTML = authCard(current.route); const f = c.querySelector('[autofocus]'); f && f.focus(); } }
Views.login = async () => { if (Auth.user && UI.auth.view !== 'twofa') { location.hash = '#/home'; return ''; } return authPage('login'); };
Views.signup = async () => { if (Auth.user) { location.hash = '#/home'; return ''; } if (UI.auth.view === 'twofa') UI.auth.view = 'main'; return authPage('signup'); };
Views.forgot = async () => {
  const F = UI.forgot = UI.forgot || { step: 1, email: UI.auth.email || '' };
  const body = !EmailCodes.configured ? `<a class="link" href="#/login">${ic('chevLeft', 'sm')}Back to log in</a><div class="auth-icon">${ic('lock', 'lg')}</div><h1>Reset your password</h1>${unavailable('Password reset needs email delivery', 'The site owner hasn’t set up email codes (Privy: PRIVY_APP_ID + PRIVY_APP_SECRET, or Resend). You can still sign in with Google or your wallet if they’re linked.')}`
    : F.step === 1 ? `<a class="link" href="#/login">${ic('chevLeft', 'sm')}Back to log in</a><div class="auth-icon">${ic('lock', 'lg')}</div><h1>Reset your password</h1><p class="dim">Enter your account email and we’ll send a 6-digit reset code.</p><form class="stack" style="gap:14px" data-form="forgot" novalidate><label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(F.email)}" placeholder="you@example.com" autofocus></label><div data-err></div><button class="btn btn-primary lg block" type="submit">Send reset code</button></form>`
    : `<button class="link" data-action="forgotBack">${ic('chevLeft', 'sm')}Use a different email</button><h1>Enter your code</h1><p class="dim">We sent a code to <b style="color:var(--text)">${esc(F.email)}</b>. It expires in 15 minutes.</p><form class="stack" style="gap:14px" data-form="reset" novalidate><label class="field"><span>Reset code</span><input class="input otp num" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></label><div class="field"><label class="label" for="pw-new">New password</label><div class="pw-field"><input class="input" id="pw-new" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" data-strength><button type="button" class="pw-eye" data-action="pwToggle" aria-label="Show password" aria-pressed="false">${ic('eye', 'sm')}</button></div><div class="pw-meter" data-meter><i></i><i></i><i></i><i></i><span class="mut">Use 8+ characters with letters and numbers</span></div></div><div data-err></div><button class="btn btn-primary lg block" type="submit">Reset password</button></form>`;
  return `<div class="auth">${authSide()}<main class="auth-main"><a class="logo auth-logo" href="#/">${logoMark}<span class="wm">NEXIS</span></a><div class="auth-card">${body}</div></main></div>`;
};
Views.onboarding = async () => {
  const u = Auth.user; if (!u) { location.hash = '#/login'; return ''; }
  const hues = [215, 250, 280, 330, 15, 40, 150, 185];
  let sugg = (u.name || (u.email || '').split('@')[0] || 'trader').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14) || 'trader'; if (sugg.length < 3) sugg += '_trader';
  let h = u.handle || sugg; let i = 1; while (!Auth.adapter.handleFree(h, u.id) && i < 50) h = sugg + (++i);
  UI.onb = UI.onb || { hue: u.hue };
  const w = u.wallets[0];
  return `<div class="auth onb"><main class="auth-main" style="grid-column:1/-1"><div class="auth-card wide">
    <div class="row" style="gap:10px"><span class="logo" style="width:auto">${logoMark}</span><span class="tag green">${ic('check', 'sm')}Signed in with ${esc(u.sessions[0]?.method || 'Nexis')}</span></div>
    <h1>Set up your profile</h1><p class="dim">Choose how you appear on Nexis.</p>
    <form class="stack" style="gap:16px" data-form="onboard" novalidate>
      <div class="row" style="gap:16px;align-items:center"><span class="avatar lg" id="onb-av" style="background:linear-gradient(135deg,hsl(${UI.onb.hue} 55% 42%),hsl(${(UI.onb.hue + 40) % 360} 50% 30%))">${esc(meName().slice(0, 2).toUpperCase())}</span><div><div class="label" style="margin-bottom:6px">Avatar colour</div><div class="row" style="gap:6px">${hues.map(x => `<button type="button" class="swatch ${x === UI.onb.hue ? 'on' : ''}" data-action="onbHue" data-h="${x}" style="background:hsl(${x} 55% 42%)" aria-label="Colour ${x}"></button>`).join('')}</div></div></div>
      <div class="grid g2"><label class="field"><span>Display name</span><input class="input" name="name" value="${esc(u.name || '')}" placeholder="Your name" maxlength="40" autocomplete="name"></label><label class="field"><span>Handle</span><div class="input-at"><input class="input" name="handle" value="${esc(h)}" maxlength="20" autocomplete="username" data-handle></div><span class="mut" style="font-size:12px" data-handle-msg>${ic('check', 'sm')} @${esc(h)} is available</span></label></div>
      <div class="linkbox" id="onb-wallet">${w ? `${walletIcon(Wallets.byName(w.label) || WALLETS[0], 32)}<div style="flex:1"><b>${esc(w.label)} · <span class="num">${shortAddr(w.address)}</span></b><div class="mut" style="font-size:12.5px">Linked. Trades on Panta are signed by this wallet.</div></div><span class="tag green">Linked</span>` : `${ic('wallet')}<div style="flex:1"><b>Link a Solana wallet</b><div class="mut" style="font-size:12.5px">Needed to trade on Panta. You can do this later in Settings → Wallets.</div></div><button type="button" class="btn btn-ghost sm" data-action="linkWallet">Link wallet</button>`}</div>
      <div data-err></div><button class="btn btn-primary lg block" type="submit">Enter Nexis ${ic('arrowR', 'sm')}</button>
      <div class="row" style="justify-content:space-between"><button type="button" class="link" data-action="onbSkip">Skip for now — go to dashboard</button><button type="button" class="link" data-action="logout">Not you? Log out</button></div>
    </form></div></main></div>`;
};

/* ---------- settings ---------- */
const SET_TABS = [['account', 'Account', 'user'], ['profile', 'Profile', 'edit'], ['wallets', 'Wallets', 'wallet'], ['security', 'Security', 'shield'], ['notifications', 'Notifications', 'bell'], ['integrations', 'Integrations', 'plug']];
function methodRow(icon, title, sub, on, actions) { return `<div class="mrow2">${icon}<div style="flex:1;min-width:0"><b>${title}</b><div class="mut" style="font-size:12.5px">${sub}</div></div>${on ? '<span class="tag green">Connected</span>' : '<span class="tag">Not set up</span>'}${actions}</div>`; }
Views.settings = async (params) => {
  if (Auth.mode === 'remote' && Auth.user) { try { await RemoteAccounts.refresh(); } catch (e) { /* show cached data */ } if (!Auth.user) { location.hash = '#/login'; return ''; } }
  const u = Auth.user; if (!u) return ''; await Config.load();
  const tab = params.get('tab') || UI.setTab || 'account'; UI.setTab = tab; const st = Store.s.settings; const nM = Auth.methods(u).length; let body = '';
  if (tab === 'account') body = `<div class="card"><div class="card-head"><h3>Account</h3></div>
      <div class="kvrow"><span>Email</span><div>${u.email ? `${esc(u.email)} ${u.emailVerified ? '<span class="tag green">Verified</span>' : '<span class="tag amber">Unverified</span>'}` : '<span class="mut">No email added</span>'}</div><button class="btn btn-ghost sm" data-action="changeEmail">${u.email ? 'Change' : 'Add email'}</button></div>
      <div class="kvrow"><span>Account ID</span><div class="num mut" style="font-size:12.5px">${esc(u.id)}</div><span></span></div>
      <div class="kvrow"><span>Member since</span><div>${fmtDateLong(u.created)}</div><span></span></div>
      <div class="kvrow"><span>Stored on</span><div class="dim" style="font-size:13px">This browser. Clearing site data removes the account; your wallet and on-chain positions are unaffected.</div><span></span></div></div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>Sign-in methods</h3><span class="mut" style="font-size:12px">Keep at least one · ${nM} active</span></div>
      ${methodRow(`<span class="mi">${googleG}</span>`, 'Google', u.providers.google ? esc(u.providers.google.email) : (Config.c.google && Config.c.google.clientId ? 'Sign in with your Google account' : 'Not configured on this server'), !!u.providers.google, u.providers.google ? `<button class="btn btn-quiet sm" data-action="unlinkGoogle" ${nM <= 1 ? 'disabled' : ''}>Disconnect</button>` : `<button class="btn btn-ghost sm" data-action="linkGoogle" ${Config.c.google && Config.c.google.clientId ? '' : 'disabled'}>Connect</button>`)}
      ${methodRow(`<span class="mi">${ic('lock')}</span>`, 'Email + password', u.providers.password ? `Last changed ${agoT(u.providers.password.set)}` : 'Add a password to log in with your email', !!u.providers.password, `<a class="btn btn-ghost sm" href="#/settings?tab=security">${u.providers.password ? 'Change' : 'Add'}</a>`)}
      ${methodRow(`<span class="mi">${ic('wallet')}</span>`, 'Wallet', u.wallets.length ? `${u.wallets.length} linked · ${u.wallets.map(w => shortAddr(w.address)).join(', ')}` : 'Sign in with Phantom, Backpack or Solflare', u.wallets.length > 0, `<a class="btn btn-ghost sm" href="#/settings?tab=wallets">Manage</a>`)}</div>
    <div class="card danger" style="margin-top:14px"><div class="card-head"><h3>Danger zone</h3></div><div class="kvrow"><span>Delete account</span><div class="dim" style="font-size:13px">${Auth.mode === 'remote' ? 'Permanently removes your Nexis account and its sign-in methods.' : 'Removes your Nexis account, tracked traders and settings from this browser.'} Your wallet and Panta positions are not affected.</div><button class="btn btn-no sm" data-action="deleteAccount">Delete account</button></div></div>`;
  if (tab === 'profile') body = `<div class="card"><div class="card-head"><h3>Public profile</h3><a class="link" href="#/profile">View profile ${ic('chevRight', 'sm')}</a></div><form class="card-pad stack" style="gap:16px" data-form="profile" novalidate>
      <div class="row" style="gap:16px;align-items:center"><span class="avatar lg" id="prof-av" style="background:linear-gradient(135deg,hsl(${u.hue} 55% 42%),hsl(${(u.hue + 40) % 360} 50% 30%))">${esc(meName().slice(0, 2).toUpperCase())}</span><div><div class="label" style="margin-bottom:6px">Avatar colour</div><div class="row" style="gap:6px">${[215, 250, 280, 330, 15, 40, 150, 185].map(x => `<button type="button" class="swatch ${x === u.hue ? 'on' : ''}" data-action="profHue" data-h="${x}" style="background:hsl(${x} 55% 42%)" aria-label="Colour ${x}"></button>`).join('')}</div><input type="hidden" name="hue" value="${u.hue}"></div></div>
      <div class="grid g2"><label class="field"><span>Display name</span><input class="input" name="name" value="${esc(u.name || '')}" maxlength="40"></label><label class="field"><span>Handle</span><div class="input-at"><input class="input" name="handle" value="${esc(u.handle || '')}" maxlength="20" data-handle></div><span class="mut" style="font-size:12px" data-handle-msg>@${esc(u.handle || '')}</span></label></div>
      <label class="field"><span>Bio</span><textarea class="textarea" name="bio" maxlength="160" placeholder="What markets do you trade?">${esc(u.bio || '')}</textarea><span class="mut" style="font-size:12px"><span data-bio-count>${(u.bio || '').length}</span>/160</span></label>
      <div data-err></div><div class="row"><div class="spacer"></div><button class="btn btn-primary" type="submit">Save profile</button></div></form></div>`;
  if (tab === 'wallets') { const b = Balances.v; body = `<div class="card"><div class="card-head"><h3>Connected wallets</h3><button class="btn btn-primary sm" data-action="linkWallet">${ic('plain_plus', 'sm')}Link wallet</button></div>
      ${u.wallets.length ? u.wallets.map(w => { const W = Wallets.byName(w.label) || WALLETS[0]; const isP = primaryWallet() && primaryWallet().address === w.address; return `<div class="mrow2">${walletIcon(W, 36)}<div style="flex:1;min-width:0"><b>${esc(w.label)}</b> ${w.primary ? '<span class="tag blue">Primary</span>' : ''}<div class="mut num" style="font-size:12.5px;word-break:break-all">${esc(w.address)}</div><div class="row" style="gap:8px;margin-top:6px;font-size:12px"><span data-wstatus="${w.address}">${walletStatusTag(w.address)}</span>${isP ? `<span class="num mut" data-bal>${b ? `${fmtNum(b.usdc, 2)} USDC · ${fmtNum(b.sol, 4)} SOL` : Balances.err ? 'Balance unavailable' : 'Loading balance…'}</span>` : ''}<a class="link" href="${explorerAddr(w.address)}" target="_blank" rel="noopener">Solscan ${ic('ext', 'sm')}</a></div></div>
        <div class="row" style="gap:4px">${!w.primary ? `<button class="btn btn-ghost sm" data-action="setPrimary" data-a="${w.address}">Make primary</button>` : ''}<button class="iconbtn" data-action="copyAddr" data-a="${w.address}" aria-label="Copy address" data-tip="Copy address">${ic('copy', 'sm')}</button><button class="iconbtn" data-action="unlinkWallet" data-a="${w.address}" aria-label="Remove wallet" data-tip="Remove">${ic('trash', 'sm')}</button></div></div>`; }).join('') : emptyState({ icon: 'wallet', title: 'No wallets linked', body: 'Link a Solana wallet to trade on Panta and to sign in without a password.', cta: '<button class="btn btn-primary sm" data-action="linkWallet">Link wallet</button>' })}</div>
    ${primaryWallet() ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>On-chain activity</h3><span class="mut" style="font-size:12px">Latest signatures for ${shortAddr(primaryWallet().address)}</span></div><div id="chain-hist"><p class="mut" style="padding:14px 18px;font-size:13px">Loading from Solana…</p></div></div>` : ''}`; }
  if (tab === 'security') body = `<div class="card"><div class="card-head"><h3>${ic('lock', 'sm')}${u.providers.password ? 'Change password' : 'Add a password'}</h3>${u.providers.password ? `<span class="mut" style="font-size:12px">Last changed ${agoT(u.providers.password.set)}</span>` : ''}</div>
      ${!u.email ? `<div class="card-pad"><p class="dim" style="font-size:13px">Add an email address first — passwords are used with your email to log in.</p><button class="btn btn-ghost sm" style="margin-top:10px" data-action="changeEmail">Add email</button></div>` : `<form class="card-pad stack" style="gap:14px;max-width:460px" data-form="password" novalidate>
        ${u.providers.password ? `<div class="field"><label class="label" for="pw-cur">Current password</label><div class="pw-field"><input class="input" id="pw-cur" name="current" type="password" autocomplete="current-password"><button type="button" class="pw-eye" data-action="pwToggle" aria-label="Show password" aria-pressed="false">${ic('eye', 'sm')}</button></div></div>` : ''}
        <div class="field"><label class="label" for="pw-next">New password</label><div class="pw-field"><input class="input" id="pw-next" name="next" type="password" autocomplete="new-password" data-strength><button type="button" class="pw-eye" data-action="pwToggle" aria-label="Show password" aria-pressed="false">${ic('eye', 'sm')}</button></div><div class="pw-meter" data-meter><i></i><i></i><i></i><i></i><span class="mut">Use 8+ characters with letters and numbers</span></div></div>
        <div class="field"><label class="label" for="pw-conf">Confirm new password</label><div class="pw-field"><input class="input" id="pw-conf" name="confirm" type="password" autocomplete="new-password"><button type="button" class="pw-eye" data-action="pwToggle" aria-label="Show password" aria-pressed="false">${ic('eye', 'sm')}</button></div></div>
        <div data-err></div><div class="row"><button class="btn btn-primary" type="submit">${u.providers.password ? 'Update password' : 'Add password'}</button>${u.providers.password ? `<button type="button" class="btn btn-quiet" data-action="removePassword" ${nM <= 1 ? 'disabled' : ''}>Remove password</button>` : ''}</div></form>`}</div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>${ic('shield', 'sm')}Two-factor authentication</h3>${u.twoFA.enabled ? '<span class="tag green">On</span>' : '<span class="tag">Off</span>'}</div><div class="card-pad">${u.twoFA.enabled ? `<p class="dim" style="font-size:13px">Your authenticator code is required when you log in with a password, email code or Google. Enabled ${agoT(u.twoFA.since)}.</p><button class="btn btn-ghost sm" style="margin-top:10px" data-action="disable2FA">Turn off 2FA</button>`
      : u.twoFA.pending ? `<div class="twofa"><div class="qr-box" id="totp-qr"><span class="spin"></span></div><div class="stack" style="gap:10px;flex:1"><p class="dim" style="font-size:13px">Scan the code with Google Authenticator, 1Password, Authy or similar — or enter the key manually.</p><div class="num sigmsg" style="padding:8px 10px">${u.twoFA.secret.match(/.{1,4}/g).join(' ')}</div><form class="row" data-form="twofaSetup" novalidate><input class="input otp num" name="code" inputmode="numeric" maxlength="6" placeholder="000000" style="max-width:150px"><button class="btn btn-primary" type="submit">Verify &amp; enable</button></form><div data-err></div></div></div>`
      : `<p class="dim" style="font-size:13px">Add a code from an authenticator app when logging in. Wallet sign-in already requires a signature.</p><button class="btn btn-primary sm" style="margin-top:10px" data-action="start2FA">Set up authenticator app</button>`}</div></div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>${ic('laptop', 'sm')}${Auth.mode === 'remote' ? 'Signed-in devices' : 'Sessions on this device'}</h3></div>${u.sessions.map(sn => `<div class="mrow2"><span class="mi">${ic(/iOS|Android/.test(sn.device) ? 'phone' : 'laptop')}</span><div style="flex:1"><b>${esc(sn.device)}</b> ${sn.current ? '<span class="tag green">Current</span>' : ''}<div class="mut" style="font-size:12.5px">${esc(sn.method || '')} · signed in ${agoT(sn.created)}</div></div>${sn.current ? '<button class="btn btn-ghost sm" data-action="logout">Log out</button>' : `<button class="btn btn-quiet sm" data-action="revokeSession" data-id="${sn.id}">Remove</button>`}</div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>${ic('clock', 'sm')}Recent security activity</h3></div>${u.activity.slice(0, 10).map(a => `<div class="mrow2"><span class="mi" style="color:${a.ok ? 'var(--green)' : 'var(--red)'}">${ic(a.ok ? 'check' : 'alert', 'sm')}</span><div style="flex:1"><b style="font-weight:550">${a.ok ? '' : 'Failed: '}${esc(a.method)}</b><div class="mut" style="font-size:12.5px">${esc(a.device)}</div></div><span class="mut" style="font-size:12px">${agoT(a.t)}</span></div>`).join('')}</div>`;
  if (tab === 'notifications') { const row = (k, t, s) => `<label class="row" style="padding:14px 18px;border-bottom:1px solid var(--line);cursor:pointer"><div style="flex:1"><div style="font-weight:500">${t}</div><div class="mut" style="font-size:12.5px">${s}</div></div><input type="checkbox" class="toggle" data-setting="${k}" ${st[k] ? 'checked' : ''}></label>`;
    body = `<div class="card"><div class="card-head"><h3>${ic('bell', 'sm')}Alerts</h3></div>${row('notifyTracked', 'Tracked traders', 'When a trader you track opens, closes or changes a position')}${row('notifyTx', 'Transactions', 'When your trades, claims or market creations confirm or fail on Solana')}${row('notifyMoves', 'Price moves', 'Moves of 5¢ or more on Panta markets you hold')}${row('notifyGoals', 'Followed games', 'Kick-off, goals and final scores for games you follow')}</div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>${ic('laptop', 'sm')}Desktop notifications</h3>${Store.s.settings.desktop && 'Notification' in window && Notification.permission === 'granted' ? '<span class="tag green">On</span>' : '<span class="tag">Off</span>'}</div><div class="card-pad row wrap"><p class="dim" style="font-size:13px;flex:1;min-width:220px">Show system notifications while Nexis is in a background tab.</p><button class="btn btn-ghost" data-action="enableDesktop">Enable</button></div></div>`; }
  if (tab === 'integrations') body = integrationsHtml();
  return `<div class="page" style="max-width:980px"><div class="page-head"><div><h1>Settings</h1><p>Signed in as ${esc(u.email || '@' + (u.handle || 'you'))}</p></div><button class="btn btn-ghost sm" data-action="logout">${ic('logout', 'sm')}Log out</button></div>
    <div class="set-layout"><nav class="set-nav" aria-label="Settings">${SET_TABS.map(([k, l, i]) => `<a class="nav-item ${k === tab ? 'on' : ''}" href="#/settings?tab=${k}">${ic(i)}<span>${l}</span></a>`).join('')}</nav><div style="min-width:0">${body}</div></div></div>`;
};
function integrationsHtml() {
  const c = Config.c || {}; const row = (ok, name, detail, env) => `<div class="mrow2"><span class="mi" style="color:${ok ? 'var(--green)' : 'var(--muted)'}">${ic(ok ? 'check' : 'plug', 'sm')}</span><div style="flex:1;min-width:0"><b>${name}</b><div class="mut" style="font-size:12.5px">${detail}</div>${!ok && env ? `<div class="num mut" style="font-size:11.5px;margin-top:3px">Set: ${env}</div>` : ''}</div>${ok ? '<span class="tag green">Configured</span>' : '<span class="tag">Not configured</span>'}</div>`;
  return `<div class="card"><div class="card-head"><h3>${ic('plug', 'sm')}Server integrations</h3><button class="btn btn-ghost sm" data-action="feedStatus">Live status</button></div>
    ${c.error ? `<div class="card-pad">${unavailable('Server functions unreachable', 'This copy of Nexis isn’t running with its /api functions (for example, opened as a local file or inside a preview). Deploy it to Netlify or Vercel to enable integrations.')}</div>` : ''}
    ${row(c.accounts && c.accounts.server, 'Accounts database', c.accounts && c.accounts.server ? 'Accounts are stored on the server and work on every device.' : 'Not connected — accounts only work in the browser where they were created. In Vercel open Storage → Create Database → Upstash for Redis, connect it to this project, then redeploy.', 'KV_REST_API_URL, KV_REST_API_TOKEN (added automatically by Upstash)')}
    ${row(c.panta && c.panta.configured, `Panta ${c.panta && c.panta.mode === 'test' ? '<span class="tag amber">test key · sandbox fixtures</span>' : ''}`, 'Markets, trading, positions, market creation and resolution', 'PANTA_API_KEY')}
    ${row(c.rpc && c.rpc.custom, 'Solana RPC', c.rpc && c.rpc.custom ? 'Private RPC endpoint' : 'Using the public mainnet endpoint (rate-limited). Add a private RPC for reliable confirmations.', 'SOLANA_RPC_URL')}
    ${row(c.ai && c.ai.configured, 'Nexis AI (Claude)', 'Market drafting and factor analysis', 'ANTHROPIC_API_KEY')}
    ${row(c.privy && c.privy.server, 'Email codes (Privy)', c.privy && c.privy.server ? 'Privy sends and checks email sign-in and password-reset codes.' : c.privy && c.privy.appId ? 'PRIVY_APP_ID is set but PRIVY_APP_SECRET is missing.' : 'Email sign-in and password-reset codes, sent by Privy. No email domain needed.', 'PRIVY_APP_ID, PRIVY_APP_SECRET')}
    ${c.privy && c.privy.server ? '' : row(c.email && c.email.configured, 'Email (Resend)', 'Alternative to Privy for sign-in codes and password resets', 'RESEND_API_KEY, EMAIL_FROM, AUTH_SECRET')}
    ${row(c.google && c.google.clientId, 'Google sign-in', 'Google Identity Services', 'GOOGLE_CLIENT_ID')}
    ${row(true, 'Public data feeds', 'Polymarket, ESPN, CoinGecko and Coinbase need no keys. ' + (c.coingecko && c.coingecko.key ? 'CoinGecko key set.' : 'Optional COINGECKO_API_KEY raises CoinGecko rate limits.'), '')}</div>`;
}
async function paintChainHistory() {
  const box = $('#chain-hist'); const w = primaryWallet(); if (!box || !w) return;
  try { const h = await Chain.history(w.address, 15); box.innerHTML = h.length ? `<div class="table-wrap"><table class="t"><tbody>${h.map(x => `<tr><td class="num"><a class="link" style="display:inline" href="${explorerTx(x.sig)}" target="_blank" rel="noopener">${shortW(x.sig)}</a></td><td><span class="tag ${x.status === 'failed' ? 'red' : 'green'}">${x.status === 'failed' ? 'Failed' : x.status === 'finalized' ? 'Finalized' : 'Confirmed'}</span></td><td class="r mut">${x.t ? agoT(x.t) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut" style="padding:14px 18px;font-size:13px">No transactions for this wallet yet.</p>'; }
  catch (e) { box.innerHTML = `<div class="card-pad">${unavailable('Solana RPC unavailable', esc(e.message))}</div>`; }
}
async function paintTotpQr() {
  const box = $('#totp-qr'); const u = Auth.user; if (!box || !u || !u.twoFA.pending) return;
  const uri = `otpauth://totp/${encodeURIComponent('Nexis:' + (u.email || u.handle || u.id))}?secret=${u.twoFA.secret}&issuer=Nexis&algorithm=SHA1&digits=6&period=30`;
  try { const q = await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', 'qrcode'); const qr = q(0, 'M'); qr.addData(uri); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
  catch (e) { box.innerHTML = `<span class="mut" style="font-size:12px;padding:8px">QR unavailable — enter the key manually.</span>`; }
}

/* ---------- forms ---------- */
function showErr(form, msg) { const e = form.querySelector('[data-err]'); if (e) e.innerHTML = authErrorHtml(msg); }
function meterUpdate(inp) { const m = inp.closest('.field').querySelector('[data-meter]'); if (!m) return; const s = inp.value ? pwStrength(inp.value) : -1; m.querySelectorAll('i').forEach((el, i) => el.className = i <= s - 1 || (s === 0 && i === 0 && inp.value) ? 'on s' + Math.max(1, s) : ''); m.querySelector('span').textContent = inp.value ? PW_LABEL[s] + (s < 2 ? ' — add length, numbers or symbols' : '') : 'Use 8+ characters with letters and numbers'; }
document.addEventListener('input', (e) => {
  const t = e.target; if (!t.matches) return;
  if (t.matches('[data-strength]')) meterUpdate(t);
  if (t.matches('[data-handle]')) { const msg = t.closest('.field').querySelector('[data-handle-msg]'); const h = t.value.replace(/^@/, ''); const u = Auth.user; const ok = /^[A-Za-z0-9_]{3,20}$/.test(h); const free = ok && Auth.adapter.handleFree(h, u && u.id); msg.innerHTML = !ok ? `<span style="color:var(--amber)">3–20 letters, numbers or underscores</span>` : free ? `<span class="up">${ic('check', 'sm')} @${esc(h)} is available</span>` : `<span class="down">@${esc(h)} is taken</span>`; }
  if (t.name === 'bio') { const c = $('[data-bio-count]'); if (c) c.textContent = t.value.length; }
});
const FORMS = {
  login: async (f, fd) => { UI.auth.email = fd.get('email'); if (!fd.get('password')) throw aerr('x', 'Enter your password.'); onAuthed(await Auth.adapter.signIn({ email: fd.get('email'), password: fd.get('password'), remember: !!fd.get('remember') })); },
  signup: async (f, fd) => { UI.auth.email = fd.get('email'); if (!fd.get('terms')) throw aerr('x', 'Please accept the terms to continue.'); onAuthed(await Auth.adapter.signUp({ email: fd.get('email'), password: fd.get('password') })); },
  emailCodeSend: async (f, fd) => { const email = String(fd.get('email') || '').trim(); if (!emailOk(email)) throw aerr('x', 'Enter a valid email address.'); await EmailCodes.send(email, 'signin'); UI.auth.email = email; UI.auth.codeSent = true; refreshAuth(); },
  emailCodeVerify: async (f, fd) => { const proof = await EmailCodes.proof('signin', UI.auth.email, fd.get('code')); const r = await Auth.adapter.emailLogin(UI.auth.email, proof); UI.auth.codeSent = false; onAuthed(r); },
  twofa: async (f, fd) => onAuthed(await Auth.adapter.verify2FA({ ...UI.auth.pending, code: fd.get('code') })),
  forgot: async (f, fd) => { const email = String(fd.get('email') || '').trim(); if (!emailOk(email)) throw aerr('x', 'Enter a valid email address.'); if (!(await Auth.adapter.findByEmail(email))) throw aerr('x', 'No Nexis account uses this email.'); await EmailCodes.send(email, 'reset'); UI.forgot = { step: 2, email }; refresh(); },
  reset: async (f, fd) => { LocalAccounts.checkPw(fd.get('password')); const proof = await EmailCodes.proof('reset', UI.forgot.email, fd.get('code')); await Auth.adapter.resetPassword({ email: UI.forgot.email, password: fd.get('password'), ...proof }); UI.auth.email = UI.forgot.email; UI.forgot = null; toast({ title: 'Password updated', body: 'Log in with your new password.' }); location.hash = '#/login'; },
  onboard: async (f, fd) => { await Auth.adapter.updateProfile({ name: String(fd.get('name') || '').trim(), handle: fd.get('handle'), hue: UI.onb.hue, onboarded: true }); UI.onb = null; location.hash = '#/home'; setTimeout(() => toast({ title: `Welcome to Nexis, @${Auth.user.handle}` }), 300); },
  profile: async (f, fd) => { await Auth.adapter.updateProfile({ name: String(fd.get('name') || '').trim(), handle: fd.get('handle'), bio: String(fd.get('bio') || ''), hue: +fd.get('hue') }); toast({ title: 'Profile saved' }); refresh(); },
  password: async (f, fd) => { if (fd.get('next') !== fd.get('confirm')) throw aerr('x', 'The new passwords don’t match.'); const had = await Auth.adapter.changePassword({ current: fd.get('current'), next: fd.get('next') }); toast({ title: had ? 'Password updated' : 'Password added' }); refresh(); },
  twofaSetup: async (f, fd) => { await Auth.adapter.confirm2FA(fd.get('code')); toast({ title: 'Two-factor authentication is on' }); refresh(); },
  emailChange: async (f, fd) => { const email = String(fd.get('email') || '').trim(); if (!emailOk(email)) throw aerr('x', 'Enter a valid email address.'); await EmailCodes.send(email, 'verify'); UI.emailChange = { email }; openEmailChange(2); },
  emailConfirm: async (f, fd) => { const proof = await EmailCodes.proof('verify', UI.emailChange.email, fd.get('code')); await Auth.adapter.setEmail(UI.emailChange.email, proof); closeModal(); toast({ title: 'Email verified' }); refresh(); },
};
const FORM_BUSY = { login: 'Logging in…', signup: 'Creating account…', emailCodeSend: 'Sending…', emailCodeVerify: 'Verifying…', twofa: 'Verifying…', forgot: 'Sending…', reset: 'Resetting…', onboard: 'Saving…', profile: 'Saving…', password: 'Saving…', twofaSetup: 'Verifying…', emailChange: 'Sending…', emailConfirm: 'Verifying…' };
function openEmailChange(step = 1) {
  if (!EmailCodes.configured) return openModal(`${modalHead('Change email')}<div class="modal-body">${unavailable('Email verification isn’t configured', 'Nexis needs Privy (PRIVY_APP_ID, PRIVY_APP_SECRET) or email delivery (RESEND_API_KEY, EMAIL_FROM, AUTH_SECRET) to verify a new address.')}</div>`);
  if (step === 1) return openModal(`${modalHead(Auth.user.email ? 'Change email' : 'Add email')}<div class="modal-body"><form class="stack" style="gap:14px" data-form="emailChange" novalidate><label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" autofocus></label><p class="mut" style="font-size:12.5px">We’ll send a 6-digit code to confirm you own this address.</p><div data-err></div><button class="btn btn-primary block" type="submit">Send code</button></form></div>`);
  setModal(`${modalHead('Enter the code')}<div class="modal-body"><p class="dim">Sent to <b style="color:var(--text)">${esc(UI.emailChange.email)}</b></p><form class="stack" style="gap:14px" data-form="emailConfirm" novalidate><input class="input otp num" name="code" inputmode="numeric" maxlength="6" placeholder="000000" autofocus><div data-err></div><button class="btn btn-primary block" type="submit">Verify</button></form></div>`);
}
function confirmAct(title, body, label, fn, danger = true) {
  openModal(`${modalHead(title)}<div class="modal-body"><p class="dim">${body}</p><div data-err></div></div><div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn ${danger ? 'btn-no on' : 'btn-primary'}" id="confirm-act">${label}</button></div>`);
  $('#confirm-act').onclick = async (e) => { const b = e.currentTarget; setBusy(b, true); try { await fn(); } catch (err) { setBusy(b, false); const box = $('.overlay [data-err]'); if (box) box.innerHTML = authErrorHtml(err.message); } };
}
function logout() { Auth.adapter.signOut(); PrivyAuth.logout(); closeModal(true); const up = $('#user-pop'); if (up) up.innerHTML = ''; Store.init(null); Balances.v = null; UI.setTab = 'account'; location.hash = '#/'; toast({ title: 'You’re logged out', kind: 'info' }); }
function toggleUserMenu() {
  const pop = $('#user-pop'); if (!pop) return; if (pop.innerHTML) { pop.innerHTML = ''; return; }
  const u = Auth.user; const w = primaryWallet(); const b = Balances.v;
  pop.innerHTML = `<div class="card user-pop"><div class="row" style="padding:14px 16px;gap:12px;border-bottom:1px solid var(--line)">${meAvatar('md')}<div style="min-width:0"><b>${esc(meName())}</b><div class="mut" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${esc(meHandle())}${u.email ? ' · ' + esc(u.email) : ''}</div></div></div>
    ${w ? `<div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);font-size:12.5px">${ic('wallet', 'sm')}<span class="num">${shortAddr(w.address)}</span><span class="num" style="margin-left:auto">${b ? fmtNum(b.usdc, 2) + ' USDC' : '—'}</span></div>` : ''}
    <div style="padding:6px">${[['#/profile', 'user', 'Profile'], ['#/settings?tab=account', 'sliders', 'Account settings'], ['#/settings?tab=profile', 'edit', 'Profile settings'], ['#/settings?tab=wallets', 'wallet', 'Wallets'], ['#/settings?tab=security', 'shield', 'Security']].map(([h, i, l]) => `<a class="nav-item" href="${h}" data-action="closeUserMenu">${ic(i)}<span>${l}</span></a>`).join('')}<div class="nav-sep" style="margin:6px"></div><button class="nav-item" style="width:100%" data-action="logout">${ic('logout')}<span>Log out</span></button></div></div>`;
}
const A_AUTH = {
  authGoogle: () => openGoogleFlow({ mode: 'login' }), authWallet: () => openWalletFlow({ mode: 'login' }),
  authView: (el) => { UI.auth.view = el.dataset.v; UI.auth.codeSent = false; refreshAuth(); },
  resendCode: async (el) => { setBusy(el, true, 'Sending…'); try { await EmailCodes.send(UI.auth.email, 'signin'); toast({ title: 'New code sent', kind: 'info' }); } catch (e) { toast({ title: 'Couldn’t send code', body: esc(e.message), kind: 'err' }); } setBusy(el, false); },
  forgotBack: () => { UI.forgot = { step: 1, email: UI.forgot.email }; refresh(); },
  pwToggle: (el) => { const i = el.parentNode.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', show); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.innerHTML = ic(show ? 'eyeOff' : 'eye', 'sm'); i.focus(); },
  walletPick: (el) => walletConnect(el.dataset.w), walletBack: () => setModal(UI.walletFlow.pick()), walletSign: (el) => walletSign(el),
  walletDone: () => { closeModal(); const f = UI.walletFlow && UI.walletFlow.onDone; UI.walletFlow = null; refresh(); if (f) setTimeout(f, 150); },
  onbHue: (el) => { UI.onb.hue = +el.dataset.h; $$('[data-action=onbHue]').forEach(b => b.classList.toggle('on', b === el)); $('#onb-av').style.background = `linear-gradient(135deg,hsl(${UI.onb.hue} 55% 42%),hsl(${(UI.onb.hue + 40) % 360} 50% 30%))`; },
  onbSkip: async (el) => { const f = $('[data-form=onboard]'); try { setBusy(el, true); await Auth.adapter.updateProfile({ handle: f.elements.handle.value, hue: UI.onb.hue, onboarded: true }); } catch (e) { setBusy(el, false); return showErr(f, e.message); } UI.onb = null; location.hash = '#/home'; },
  profHue: (el) => { const h = +el.dataset.h; $$('[data-action=profHue]').forEach(b => b.classList.toggle('on', b === el)); $('#prof-av').style.background = `linear-gradient(135deg,hsl(${h} 55% 42%),hsl(${(h + 40) % 360} 50% 30%))`; $('[name=hue]').value = h; },
  linkWallet: () => requireAuth(() => openWalletFlow({ mode: 'link' })), linkGoogle: () => openGoogleFlow({ mode: 'link' }),
  unlinkGoogle: () => confirmAct('Disconnect Google?', 'You won’t be able to sign in with Google until you connect it again.', 'Disconnect', async () => { await Auth.adapter.unlinkGoogle(); closeModal(); refresh(); }),
  removePassword: () => confirmAct('Remove password?', 'You’ll sign in with your other methods instead.', 'Remove password', async () => { await Auth.adapter.removePassword(); closeModal(); refresh(); }),
  setPrimary: async (el) => { try { await Auth.adapter.setPrimaryWallet(el.dataset.a); } catch (e) { return toast({ title: 'Couldn’t update', body: esc(e.message), kind: 'err' }); } Balances.refresh(); toast({ title: 'Primary wallet updated' }); refresh(); },
  copyAddr: async (el) => { try { await navigator.clipboard.writeText(el.dataset.a); toast({ title: 'Address copied', kind: 'info', ms: 1800 }); } catch (e) { toast({ title: 'Couldn’t copy', body: esc(el.dataset.a), kind: 'warn' }); } },
  unlinkWallet: (el) => confirmAct('Remove this wallet?', `${shortAddr(el.dataset.a)} will no longer sign in or sign trades for this account. Your funds and positions stay in the wallet.`, 'Remove wallet', async () => { await Auth.adapter.unlinkWallet(el.dataset.a); closeModal(); Balances.refresh(); refresh(); }),
  changeEmail: () => openEmailChange(1),
  start2FA: async (el) => { setBusy(el, true); try { await Auth.adapter.start2FA(); } catch (e) { setBusy(el, false); return toast({ title: 'Couldn’t start setup', body: esc(e.message), kind: 'err' }); } refresh(); },
  disable2FA: () => confirmAct('Turn off two-factor authentication?', 'Your account will only need your password, email code or Google to log in.', 'Turn off', async () => { await Auth.adapter.disable2FA(); closeModal(); refresh(); }),
  revokeSession: async (el) => { try { await Auth.adapter.revokeSession(el.dataset.id); } catch (e) { return toast({ title: 'Couldn’t sign out that session', body: esc(e.message), kind: 'err' }); } refresh(); },
  deleteAccount: () => { const u = Auth.user; openModal(`${modalHead('Delete account')}<div class="modal-body"><p class="dim">This permanently deletes <b style="color:var(--text)">@${esc(u.handle || 'you')}</b> and its sign-in methods. Your wallet and Panta positions are not affected.</p><label class="field"><span>Type <b class="num">${esc(u.handle || 'delete')}</b> to confirm</span><input class="input" id="del-in" autocomplete="off"></label></div><div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn btn-no on" data-action="confirmDelete">Delete account</button></div>`); },
  confirmDelete: async (el) => { if ($('#del-in').value.trim() !== (Auth.user.handle || 'delete')) return toast({ title: 'Confirmation doesn’t match', kind: 'warn' }); setBusy(el, true); try { await Auth.adapter.deleteAccount(); } catch (e) { setBusy(el, false); return toast({ title: 'Couldn’t delete account', body: esc(e.message), kind: 'err' }); } closeModal(true); Store.init(null); location.hash = '#/'; toast({ title: 'Account deleted', kind: 'info' }); },
  logout: () => logout(), userMenu: (el, e) => { e.stopPropagation(); toggleUserMenu(); }, closeUserMenu: () => { $('#user-pop').innerHTML = ''; },
  enableDesktop: () => Notify.enableDesktop().then(() => refresh()),
};
