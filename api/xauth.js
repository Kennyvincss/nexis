// Sign in with X (OAuth 2.0 authorization code + PKCE).
//   GET /api/xauth?action=start        → redirects to X's consent screen
//   GET /api/xauth?code=…&state=…      → X redirects back here; creates or finds the Nexis account, then sends the
//                                        browser to /#/xdone?c=<one-time code>, which /api/auth { action: 'xclaim' } turns
//                                        into a normal Nexis session.
// Environment: X_CLIENT_ID and X_CLIENT_SECRET from developer.x.com (OAuth 2.0, type "Web App", confidential client),
// with the callback URL https://<your domain>/api/xauth. Needs server storage (accounts).
const crypto = require('crypto');
const { env } = require('./_util');
const { store, available } = require('./_store');

const A = () => require('./auth').helpers;
const b64u = (b) => Buffer.from(b).toString('base64url');
function originOf(req) {
  const h = req.headers || {}; const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  const proto = String(h['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}
function redirect(res, url) { res.setHeader('location', url); res.setHeader('cache-control', 'no-store'); res.status(302).send(''); }
const back = (req, res, err) => redirect(res, `${originOf(req)}/#/?xerr=${encodeURIComponent(err)}`);

module.exports = async (req, res) => {
  const id = env('X_CLIENT_ID'), secret = env('X_CLIENT_SECRET'); const q = req.query || {};
  if (!id || !available()) return back(req, res, 'Sign-in with X isn’t set up on this site yet.');
  const db = store(); const cb = originOf(req) + '/api/xauth';
  try {
    if (q.action === 'start') {
      const state = b64u(crypto.randomBytes(18)), verifier = b64u(crypto.randomBytes(40));
      await db.set('xs:' + state, { v: verifier, t: Date.now() });
      const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
      const p = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: cb, scope: 'users.read tweet.read', state, code_challenge: challenge, code_challenge_method: 'S256' });
      return redirect(res, 'https://x.com/i/oauth2/authorize?' + p);
    }
    if (q.error) return back(req, res, 'X sign-in was cancelled.');
    if (!q.code || !q.state) return back(req, res, 'X sign-in didn’t complete. Try again.');
    const st = await db.get('xs:' + q.state); await db.del('xs:' + q.state);
    if (!st || Date.now() - st.t > 10 * 60e3) return back(req, res, 'That X sign-in expired. Try again.');
    const headers = { 'content-type': 'application/x-www-form-urlencoded' }; if (secret) headers.authorization = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
    const tr = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: new URLSearchParams({ code: q.code, grant_type: 'authorization_code', redirect_uri: cb, code_verifier: st.v, client_id: id }), signal: AbortSignal.timeout(12000) });
    const tok = await tr.json().catch(() => ({})); if (!tr.ok || !tok.access_token) { console.error('xauth token', tr.status, JSON.stringify(tok).slice(0, 300)); return back(req, res, 'X didn’t accept the sign-in. Try again.'); }
    const ur = await fetch('https://api.x.com/2/users/me?user.fields=created_at,profile_image_url,public_metrics,verified', { headers: { authorization: 'Bearer ' + tok.access_token }, signal: AbortSignal.timeout(12000) });
    const me = (await ur.json().catch(() => ({}))).data; if (!ur.ok || !me || !me.id) { console.error('xauth me', ur.status); return back(req, res, 'Couldn’t read your X profile. Try again.'); }
    const { byIndex, saveUser, newUser, setHandle } = A();
    let u = await byIndex(db, 'x', me.id); const fresh = !u;
    if (!u) {
      u = newUser({ name: String(me.name || me.username).slice(0, 40), picture: me.profile_image_url || null });
      for (const h of [me.username, `${me.username}_x`, `${me.username}${crypto.randomInt(100, 999)}`]) { try { await setHandle(db, u, String(h).slice(0, 20)); break; } catch (e) { /* taken: try the next */ } }
      u.onboarded = true;
    }
    u.x = { id: me.id, username: me.username, created: me.created_at ? Date.parse(me.created_at) : null, followers: me.public_metrics ? me.public_metrics.followers_count : null, verified: !!me.verified, linked: (u.x && u.x.linked) || Date.now() };
    if (!u.picture && me.profile_image_url) u.picture = me.profile_image_url;
    await db.set('x:' + me.id, u.id); await saveUser(db, u);
    const code = b64u(crypto.randomBytes(18)); await db.set('xc:' + code, { uid: u.id, fresh, t: Date.now() });
    return redirect(res, `${originOf(req)}/#/xdone?c=${code}`);
  } catch (e) { console.error('xauth error', e); return back(req, res, 'Something went wrong signing in with X. Try again.'); }
};
