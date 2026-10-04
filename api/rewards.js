// Launch rollout & rewards: member numbers, promotional credits, missions, XP, referrals, leaderboards and admin.
//   POST /api/rewards { action, token?, ... }      (token = the Nexis session token from /api/auth)
// Public:  config · leaderboard · card
// Member:  me (joins on first call; { ref, dev }) · reveal · mission { id } · shared
// Admin:   admin_overview · admin_config { patch } · admin_member { q } · admin_member_update { uid, op, ... }
//          admin_review · admin_lb_refresh
// Admins are listed in ADMIN_EMAILS, ADMIN_HANDLES or ADMIN_USER_IDS (comma-separated).
// Credits are promotional platform credits: never withdrawable, never paid out as cash.
// Storage: the accounts store (Upstash Redis on Vercel). Keys start with "rw:".
const crypto = require('crypto');
const { send, env, readJson } = require('./_util');
const { store, available } = require('./_store');

const H = () => require('./auth').helpers;
const DAY = 864e5;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

/* ---------- configuration (admin-editable; merged over these defaults) ---------- */
const DEFAULTS = {
  gate: 'waitlist', // 'waitlist': visitors only see the standalone waitlist site (admins see everything) · 'open': the full website
  phase: 4, // 1 join · 2 credit reveal · 3 community growth · 4 anticipation · 5 credit guide · 6 product activation
  memberCap: 10000,
  countdownAt: null, // ms timestamp for the Credit Guide release, or null
  brand: 'Nexis',
  social: { x: '', announcement: '', community: '' },
  credits: { table: [[5, 30], [10, 26], [25, 20], [37, 10], [50, 8], [100, 4], [250, 1.5], [500, 0.5]], budget: null },
  guide: { title: 'How to use your credits', body: '' },
  // Only uses the product actually has. "active" means credits can really be spent there (phase 6).
  uses: [
    { id: 'opening_fee', label: 'Market opening fees', desc: 'Cover Panta’s fee when your bet opens a new market.', active: false },
    { id: 'markets', label: 'Prediction market trades', desc: 'Put credits toward trades on Nexis markets.', active: false },
    { id: 'sportsbook', label: 'Sportsbook bets', desc: 'Use credits on sportsbook bets.', active: false },
    { id: 'drops', label: 'Future drops', desc: 'Early access to future Nexis drops.', active: false },
  ],
  missions: [
    { id: 'follow_x', title: 'Follow {x} on X', xp: 25, kind: 'link', url: 'x', enabled: true },
    { id: 'repost', title: 'Repost the launch announcement', xp: 25, kind: 'link', url: 'announcement', enabled: true },
    { id: 'community', title: 'Join the community', xp: 25, kind: 'link', url: 'community', enabled: true },
    { id: 'share_card', title: 'Share your Member Card', xp: 100, kind: 'share', enabled: true },
    { id: 'invite2', title: 'Invite 2 friends', xp: 100, kind: 'referrals', target: 2, enabled: true },
  ],
  xp: { join: 100, profile: 50, referral: 50 },
  statuses: [['NEW MEMBER', 0], ['MEMBER', 150], ['BUILDER', 400], ['EARLY OG', 1000], ['FAMILY LEGEND', 2500]],
  milestones: [1, 3, 10, 25, 50, 100],
  antiAbuse: { perNetworkPerDay: 3, refDailyCap: 25, minXAgeDays: 30 },
};
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(a, b) { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o; }
async function getConfig(db) { return merge(DEFAULTS, (await db.get('rw:config')) || {}); }
function linkFor(cfg, key) { if (key === 'x') return cfg.social.x ? `https://x.com/${cfg.social.x.replace(/^@/, '')}` : ''; return cfg.social[key] || ''; }
function pubConfig(cfg, memberCount) {
  const published = cfg.phase >= 5;
  return {
    gate: cfg.gate === 'open' ? 'open' : 'waitlist', xLogin: !!env('X_CLIENT_ID'), phase: cfg.phase, memberCap: cfg.memberCap, memberCount, countdownAt: cfg.countdownAt, brand: cfg.brand, social: cfg.social,
    uses: cfg.uses.map(u => ({ id: u.id, label: u.label, desc: u.desc, active: cfg.phase >= 6 && !!u.active })),
    missions: cfg.missions.filter(m => m.enabled).map(m => ({ id: m.id, title: m.title.replace('{x}', cfg.social.x ? '@' + cfg.social.x.replace(/^@/, '') : 'us'), xp: m.xp, kind: m.kind, target: m.target || 0, url: m.kind === 'link' ? linkFor(cfg, m.url) || (/^https:\/\//.test(m.url) ? m.url : '') : '' })),
    statuses: cfg.statuses, xp: cfg.xp, milestones: cfg.milestones,
    guide: published ? { published: true, title: cfg.guide.title, body: cfg.guide.body } : { published: false, title: cfg.guide.title },
  };
}

/* ---------- helpers ---------- */
const hash = (key, v) => v ? crypto.createHmac('sha256', key).update('rw.' + v).digest('base64url').slice(0, 22) : '';
const ipOf = (req) => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim();
function drawCredits(cfg) {
  const t = cfg.credits.table.filter(r => r[0] > 0 && r[1] > 0); const sum = t.reduce((s, r) => s + r[1], 0);
  let x = crypto.randomInt(1e9) / 1e9 * sum; for (const [amt, w] of t) { x -= w; if (x < 0) return amt; } return t.length ? t[t.length - 1][0] : 0;
}
const xpTotal = (m, cfg, qualified) => m.xpLog.reduce((s, e) => s + e.xp, 0) + qualified * cfg.xp.referral;
function statusOf(cfg, xp) { let cur = cfg.statuses[0], next = null; for (const s of cfg.statuses) { if (xp >= s[1]) cur = s; else { next = s; break; } } return { name: cur[0], at: cur[1], next: next ? { name: next[0], at: next[1] } : null }; }
function addXp(m, k, xp, label) { if (m.xpLog.some(e => e.k === k)) return false; m.xpLog.push({ k, xp, label, t: Date.now() }); return true; }
async function refStats(db, uid) {
  const all = await db.hgetall('rw:refs:' + uid); const L = Object.values(all);
  return { qualified: L.filter(r => r.status === 'qualified').length, pending: L.filter(r => r.status === 'pending').length, review: L.filter(r => r.status === 'review').length, list: L.sort((a, b) => b.t - a.t).slice(0, 50) };
}
function isAdmin(u) {
  const list = (n) => String(env(n) || '').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  return !!u && (list('ADMIN_EMAILS').includes(String(u.email || '').toLowerCase()) || list('ADMIN_HANDLES').includes(String(u.handle || '').toLowerCase()) || list('ADMIN_USER_IDS').includes(String(u.id).toLowerCase()));
}
async function authed(db, b) {
  const { secret, readToken, getUser } = H(); const key = await secret(db);
  const t = readToken(key, 'sess', b.token); const u = t && await getUser(db, t.u);
  if (!u || !u.sessions.some(s => s.id === t.s && s.exp > Date.now())) throw fail(401, 'no_session', 'Log in to see your membership.');
  return { u, key };
}
/** Leaderboard row + sorted-set scores (ties go to the lower member number). Writes only when something changed. */
async function saveRow(db, cfg, m, u, qualified, force) {
  const row = { n: m.n, h: (u && u.handle) || m.handle || '', x: xpTotal(m, cfg, qualified), r: qualified, f: m.flags.length ? 1 : 0, e: m.n <= cfg.memberCap ? 1 : 0, d: m.deleted ? 1 : 0 };
  const key = JSON.stringify(row); if (!force && m._row === key) return false; m._row = key;
  await db.hset('rw:rows', m.uid, row);
  if (row.f || row.d) { await db.zrem('rw:z:refs', m.uid); await db.zrem('rw:z:xp', m.uid); await db.zrem('rw:z:early', m.uid); }
  else { const tie = 1e7 - row.n; await db.zadd('rw:z:refs', row.r * 1e7 + tie, m.uid); await db.zadd('rw:z:xp', row.x * 1e7 + tie, m.uid); if (row.e) await db.zadd('rw:z:early', row.n, m.uid); else await db.zrem('rw:z:early', m.uid); }
  return true;
}
async function ranks(db, uid) {
  const [r, x, e, total] = await Promise.all([db.zrank('rw:z:refs', uid, true), db.zrank('rw:z:xp', uid, true), db.zrank('rw:z:early', uid, false), db.zcard('rw:z:xp')]);
  const p = (v) => v == null ? null : v + 1; return { refs: p(r), xp: p(x), early: p(e), total };
}
async function review(db, uid, n, reason) { await db.hset('rw:review', uid, { n, reason, t: Date.now() }); }

/* ---------- membership ---------- */
async function join(db, key, cfg, u, b, req) {
  const n = await db.incr('rw:seq'); await db.set('rw:num:' + n, u.id);
  const ipH = hash(key, ipOf(req)), devH = hash(key, String(b.dev || '').slice(0, 200)); const flags = [];
  if (ipH) { const day = new Date().toISOString().slice(0, 10); const c = await db.incr(`rw:ip:${ipH}:${day}`); if (c > cfg.antiAbuse.perNetworkPerDay) flags.push('Many new members from one network today'); }
  if (u.x && u.x.created && cfg.antiAbuse.minXAgeDays && Date.now() - u.x.created < cfg.antiAbuse.minXAgeDays * DAY) flags.push(`X account younger than ${cfg.antiAbuse.minXAgeDays} days`);
  if (devH) { const seen = (await db.get('rw:dev:' + devH)) || []; if (seen.length) flags.push(`Device already used by member #${seen[0]}`); await db.set('rw:dev:' + devH, [...seen, n].slice(0, 20)); }
  const early = n <= cfg.memberCap;
  let amount = early ? drawCredits(cfg) : 0;
  if (amount && cfg.credits.budget != null) { const spent = Number((await db.get('rw:stat:credits')) || 0); const min = Math.min(...cfg.credits.table.map(r => r[0])); if (spent + amount > cfg.credits.budget) amount = spent + min <= cfg.credits.budget ? min : 0; }
  const m = { uid: u.id, n, joinedAt: Date.now(), handle: u.handle || '', early, credits: { amount, status: !amount ? 'none' : flags.length ? 'held' : 'granted' }, ledger: amount ? [{ t: Date.now(), kind: 'grant', amount, note: 'Launch reward' }] : [], xpLog: [], missions: {}, revealed: false, flags, ipH, devH, referredBy: null, referral: null };
  addXp(m, 'join', cfg.xp.join, 'Joined');
  if (amount) await db.incr('rw:stat:credits', amount);
  if (flags.length) await review(db, u.id, n, flags.join('; '));
  const rn = parseInt(b.ref, 10);
  if (rn > 0 && rn !== n) {
    const ruid = await db.get('rw:num:' + rn); const rm = ruid && ruid !== u.id ? await db.get('rw:m:' + ruid) : null;
    if (rm) {
      const same = (ipH && rm.ipH === ipH) || (devH && rm.devH === devH);
      m.referredBy = rn; m.referral = { status: same ? 'review' : 'pending', reason: same ? 'Same network or device as the referrer' : '', t: Date.now() };
      await db.hset('rw:refs:' + ruid, u.id, { n, t: Date.now(), status: m.referral.status });
      if (same) await review(db, u.id, n, `Referral by #${rn}: same network or device`);
    }
  }
  return m;
}
/** A referral counts once the new member is real: onboarded, a verified email or a wallet, not flagged. */
const qualifies = (u, m) => u.onboarded && u.handle && (u.emailVerified || (u.wallets && u.wallets.length) || u.google || u.x) && !m.flags.length;
async function qualify(db, cfg, m) {
  const ruid = await db.get('rw:num:' + m.referredBy); if (!ruid) return;
  const day = new Date().toISOString().slice(0, 10); const c = await db.incr(`rw:refday:${ruid}:${day}`);
  m.referral.status = c > cfg.antiAbuse.refDailyCap ? 'review' : 'qualified'; m.referral.reason = m.referral.status === 'review' ? 'Referrer over the daily referral limit' : ''; m.referral.at = Date.now();
  await db.hset('rw:refs:' + ruid, m.uid, { n: m.n, t: m.referral.t, status: m.referral.status });
  if (m.referral.status === 'review') await review(db, m.uid, m.n, `Referral by #${m.referredBy}: referrer over daily limit`);
  else await refreshRow(db, cfg, ruid);
}
async function refreshRow(db, cfg, uid) {
  const m = await db.get('rw:m:' + uid); if (!m) return; const u = await H().getUser(db, uid); const rs = await refStats(db, uid);
  autoMissions(m, cfg, rs.qualified); await saveRow(db, cfg, m, u, rs.qualified); await db.set('rw:m:' + uid, m);
}
function autoMissions(m, cfg, qualified) {
  for (const ms of cfg.missions) if (ms.enabled && ms.kind === 'referrals' && qualified >= (ms.target || 1) && !m.missions[ms.id]) { m.missions[ms.id] = Date.now(); addXp(m, 'mission:' + ms.id, ms.xp, ms.title); }
}
async function view(db, cfg, m, u, rs) {
  const xp = xpTotal(m, cfg, rs.qualified); const rk = await ranks(db, m.uid);
  const showCredits = cfg.phase >= 2;
  return {
    n: m.n, handle: u.handle, joinedAt: m.joinedAt, early: m.early, revealed: m.revealed, revealedPhase: m.revealedPhase || 0,
    credits: showCredits ? { amount: m.credits.amount, status: m.credits.status, ledger: m.ledger.slice(-20) } : { hidden: true },
    xp, status: statusOf(cfg, xp), xpLog: [...m.xpLog, ...(rs.qualified ? [{ k: 'referrals', xp: rs.qualified * cfg.xp.referral, label: `Invited ${rs.qualified} friend${rs.qualified === 1 ? '' : 's'}`, t: Date.now() }] : [])],
    missions: m.missions, refs: { qualified: rs.qualified, pending: rs.pending, review: rs.review },
    rank: rk,
    underReview: m.credits.status === 'held' || (m.referral && m.referral.status === 'review'),
  };
}

/* ---------- leaderboards: sorted sets; the top-100 lists are cached 30s ---------- */
async function leaderboard(db, cfg, force) {
  const c = await db.get('rw:lb'); if (!force && c && Date.now() - c.at < 30e3) return c;
  const [refs, xp, early, total] = await Promise.all([db.zrange('rw:z:refs', 0, 99, true), db.zrange('rw:z:xp', 0, 99, true), db.zrange('rw:z:early', 0, 99, false), db.zcard('rw:z:xp')]);
  const ids = [...new Set([...refs, ...xp, ...early])]; const rows = await db.hmget('rw:rows', ids); const by = {}; ids.forEach((id, i) => { by[id] = rows[i]; });
  const pick = (L) => L.map(id => by[id]).filter(r => r && !r.f && !r.d).map(r => ({ n: r.n, h: r.h, x: r.x, r: r.r }));
  const out = { at: Date.now(), total, top: { refs: pick(refs), xp: pick(xp), early: pick(early) } };
  await db.set('rw:lb', out); return out;
}
/** Rebuilds the sorted sets from the stored rows (admin; also migrates older data). */
async function rebuildRanks(db) {
  const rows = await db.hgetall('rw:rows'); let n = 0;
  for (const [uid, r] of Object.entries(rows)) { if (r.f || r.d) { await db.zrem('rw:z:refs', uid); await db.zrem('rw:z:xp', uid); await db.zrem('rw:z:early', uid); continue; } const tie = 1e7 - r.n; await db.zadd('rw:z:refs', r.r * 1e7 + tie, uid); await db.zadd('rw:z:xp', r.x * 1e7 + tie, uid); if (r.e) await db.zadd('rw:z:early', r.n, uid); n++; }
  await db.del('rw:lb'); return n;
}

/* ---------- actions ---------- */
const PUBLIC = {
  async config(db) { const cfg = await getConfig(db); return { config: pubConfig(cfg, Number((await db.get('rw:seq')) || 0)) }; },
  async leaderboard(db, b) {
    const cfg = await getConfig(db); const lb = await leaderboard(db, cfg); let you = null;
    if (b.token) { try { const { u } = await authed(db, b); you = await ranks(db, u.id); } catch (e) { /* signed out */ } }
    return { at: lb.at, total: lb.total, top: lb.top, you };
  },
  async card(db, b) {
    const cfg = await getConfig(db); const n = parseInt(b.n, 10); const uid = n > 0 && await db.get('rw:num:' + n); const row = uid && await db.hget('rw:rows', uid);
    if (!row || row.f || row.d) throw fail(404, 'not_found', 'No member with that number.');
    return { card: { n: row.n, handle: row.h, early: !!row.e, refs: row.r, xp: row.x, status: statusOf(cfg, row.x).name } };
  },
};
const MEMBER = {
  async me(db, key, cfg, u, b, req) {
    let m = await db.get('rw:m:' + u.id); let fresh = !m; const before = m ? JSON.stringify(m) : '';
    if (!m) {
      // One join per account even when requests race: the first caller takes the lock, the others wait for its result.
      if (await db.incr('rw:joinlock:' + u.id) === 1) m = await join(db, key, cfg, u, b, req);
      else { for (let i = 0; i < 20 && !m; i++) { await new Promise(r => setTimeout(r, 250)); m = await db.get('rw:m:' + u.id); } fresh = false; if (!m) throw fail(409, 'joining', 'Your membership is being created. Try again in a moment.'); }
    }
    if (u.name && u.handle && u.bio) addXp(m, 'profile', cfg.xp.profile, 'Completed profile');
    if (m.referral && m.referral.status === 'pending' && qualifies(u, m)) await qualify(db, cfg, m);
    const rs = await refStats(db, u.id); autoMissions(m, cfg, rs.qualified); m.handle = u.handle || m.handle;
    await saveRow(db, cfg, m, u, rs.qualified); if (fresh || JSON.stringify(m) !== before) await db.set('rw:m:' + u.id, m); // write only on change
    return { member: await view(db, cfg, m, u, rs), fresh };
  },
  async reveal(db, key, cfg, u) { const m = await db.get('rw:m:' + u.id); if (!m) throw fail(404, 'not_member', 'Not a member yet.'); m.revealed = true; m.revealedPhase = cfg.phase; await db.set('rw:m:' + u.id, m); return {}; },
  async mission(db, key, cfg, u, b) {
    const m = await db.get('rw:m:' + u.id); if (!m) throw fail(404, 'not_member', 'Not a member yet.');
    const ms = cfg.missions.find(x => x.id === b.id && x.enabled); if (!ms || ms.kind !== 'link') throw fail(400, 'bad_mission', 'That mission can’t be completed this way.');
    if (!m.missions[ms.id]) { m.missions[ms.id] = Date.now(); addXp(m, 'mission:' + ms.id, ms.xp, ms.title.replace('{x}', cfg.social.x ? '@' + cfg.social.x.replace(/^@/, '') : 'us')); }
    const rs = await refStats(db, u.id); await saveRow(db, cfg, m, u, rs.qualified); await db.set('rw:m:' + u.id, m); return { member: await view(db, cfg, m, u, rs) };
  },
  async shared(db, key, cfg, u) {
    const m = await db.get('rw:m:' + u.id); if (!m) throw fail(404, 'not_member', 'Not a member yet.');
    const ms = cfg.missions.find(x => x.kind === 'share' && x.enabled);
    if (ms && !m.missions[ms.id]) { m.missions[ms.id] = Date.now(); addXp(m, 'mission:' + ms.id, ms.xp, 'Shared Member Card'); }
    m.shared = Date.now(); const rs = await refStats(db, u.id); await saveRow(db, cfg, m, u, rs.qualified); await db.set('rw:m:' + u.id, m); return { member: await view(db, cfg, m, u, rs) };
  },
};
const ADMIN = {
  async admin_overview(db, key, cfg) {
    const members = Number((await db.get('rw:seq')) || 0); const rev = await db.hgetall('rw:review');
    return { config: cfg, stats: { members, credits: Number((await db.get('rw:stat:credits')) || 0), review: Object.keys(rev).length } };
  },
  async admin_config(db, key, cfg, u, b) {
    const p = b.patch || {}; const cur = (await db.get('rw:config')) || {}; const out = { ...cur };
    if (p.gate != null) out.gate = p.gate === 'open' ? 'open' : 'waitlist';
    if (p.phase != null) { const ph = parseInt(p.phase, 10); if (!(ph >= 1 && ph <= 6)) throw fail(400, 'bad_phase', 'Phase must be 1–6.'); out.phase = ph; }
    if (p.memberCap != null) out.memberCap = Math.max(1, parseInt(p.memberCap, 10) || DEFAULTS.memberCap);
    if ('countdownAt' in p) out.countdownAt = p.countdownAt ? Number(p.countdownAt) || Date.parse(p.countdownAt) || null : null;
    if (p.brand != null) out.brand = String(p.brand).slice(0, 40);
    if (isObj(p.social)) {
      const v = (k) => String(p.social[k] || '').trim().slice(0, 300); const soc = { ...DEFAULTS.social, ...(cur.social || {}) };
      if ('x' in p.social) { const x = v('x').replace(/^@/, ''); if (x && !/^\w{1,15}$/.test(x)) throw fail(400, 'bad_x', 'The X handle can only use letters, numbers and underscores.'); soc.x = x; }
      for (const k of ['announcement', 'community']) if (k in p.social) { const u2 = v(k); if (u2 && !/^https:\/\/[^\s<>"']+$/.test(u2)) throw fail(400, 'bad_url', 'Links must start with https://'); soc[k] = u2; }
      out.social = soc;
    }
    if (isObj(p.guide)) out.guide = { title: String(p.guide.title || DEFAULTS.guide.title).slice(0, 120), body: String(p.guide.body || '').slice(0, 20000) };
    if (isObj(p.credits)) {
      const t = Array.isArray(p.credits.table) ? p.credits.table.map(r => [Math.round(Number(r[0])), Number(r[1])]).filter(r => r[0] > 0 && r[1] > 0) : null;
      if (t && !t.length) throw fail(400, 'bad_table', 'The credit table needs at least one amount.');
      out.credits = { table: t || cfg.credits.table, budget: p.credits.budget === '' || p.credits.budget == null ? null : Math.max(0, Number(p.credits.budget)) };
    }
    if (Array.isArray(p.uses)) out.uses = p.uses.slice(0, 20).map(x => ({ id: String(x.id || '').slice(0, 30), label: String(x.label || '').slice(0, 60), desc: String(x.desc || '').slice(0, 200), active: !!x.active })).filter(x => x.id && x.label);
    if (Array.isArray(p.missions)) out.missions = p.missions.slice(0, 20).map(x => ({ id: String(x.id || '').slice(0, 30), title: String(x.title || '').slice(0, 80), xp: Math.max(0, parseInt(x.xp, 10) || 0), kind: ['link', 'share', 'referrals'].includes(x.kind) ? x.kind : 'link', url: ['x', 'announcement', 'community'].includes(x.url) || /^https:\/\/[^\s<>"']+$/.test(String(x.url || '')) ? String(x.url || '').slice(0, 300) : '', target: Math.max(0, parseInt(x.target, 10) || 0), enabled: x.enabled !== false })).filter(x => x.id && x.title);
    if (isObj(p.xp)) out.xp = { join: Math.max(0, parseInt(p.xp.join, 10) || 0), profile: Math.max(0, parseInt(p.xp.profile, 10) || 0), referral: Math.max(0, parseInt(p.xp.referral, 10) || 0) };
    if (Array.isArray(p.statuses)) out.statuses = p.statuses.map(s => [String(s[0]).slice(0, 30).toUpperCase(), Math.max(0, parseInt(s[1], 10) || 0)]).sort((a, b) => a[1] - b[1]);
    if (isObj(p.antiAbuse)) out.antiAbuse = { perNetworkPerDay: Math.max(1, parseInt(p.antiAbuse.perNetworkPerDay, 10) || 3), refDailyCap: Math.max(1, parseInt(p.antiAbuse.refDailyCap, 10) || 25), minXAgeDays: Math.max(0, parseInt(p.antiAbuse.minXAgeDays, 10) || 0) };
    await db.set('rw:config', out); await db.del('rw:lb'); return { config: merge(DEFAULTS, out) };
  },
  async admin_member(db, key, cfg, u, b) {
    const q = String(b.q || '').trim(); let uid = null;
    if (/^#?\d+$/.test(q)) uid = await db.get('rw:num:' + q.replace('#', '')); else if (/^usr_/.test(q)) uid = q; else if (/^@?\w{3,20}$/.test(q)) { const x = await H().byIndex(db, 'handle', q.replace('@', '').toLowerCase()); uid = x && x.id; }
    const m = uid && await db.get('rw:m:' + uid); if (!m) throw fail(404, 'not_found', 'No member found for that number, @handle or user id.');
    const usr = await H().getUser(db, uid); const rs = await refStats(db, uid);
    return { member: { ...m, xp: xpTotal(m, cfg, rs.qualified), refs: rs, email: usr && usr.email, handle: usr && usr.handle, x: usr && usr.x ? { username: usr.x.username, created: usr.x.created, followers: usr.x.followers } : null, created: usr && usr.created, verified: !!(usr && (usr.emailVerified || usr.wallets.length || usr.google || usr.x)) } };
  },
  async admin_member_update(db, key, cfg, u, b) {
    const m = await db.get('rw:m:' + b.uid); if (!m) throw fail(404, 'not_found', 'No such member.'); const note = String(b.note || '').slice(0, 200) || 'Admin';
    const amt = Math.round(Number(b.amount) || 0);
    if (b.op === 'credits_set') { const d = amt - m.credits.amount; m.credits.amount = Math.max(0, amt); if (m.credits.status === 'none' && amt > 0) m.credits.status = 'granted'; m.ledger.push({ t: Date.now(), kind: 'adjust', amount: d, note }); await db.incr('rw:stat:credits', d); }
    else if (b.op === 'credits_add') { m.credits.amount = Math.max(0, m.credits.amount + amt); if (m.credits.status === 'none' && m.credits.amount > 0) m.credits.status = 'granted'; m.ledger.push({ t: Date.now(), kind: 'adjust', amount: amt, note }); await db.incr('rw:stat:credits', amt); }
    else if (b.op === 'credits_release') { m.credits.status = m.credits.amount ? 'granted' : 'none'; m.ledger.push({ t: Date.now(), kind: 'release', amount: 0, note }); }
    else if (b.op === 'credits_hold') { m.credits.status = 'held'; m.ledger.push({ t: Date.now(), kind: 'hold', amount: 0, note }); }
    else if (b.op === 'xp_add') m.xpLog.push({ k: 'admin:' + Date.now(), xp: amt, label: note, t: Date.now() });
    else if (b.op === 'flag') { m.flags.push(note); await review(db, m.uid, m.n, note); if (m.credits.status === 'granted') m.credits.status = 'held'; }
    else if (b.op === 'unflag') { m.flags = []; await db.hdel('rw:review', m.uid); }
    else if (b.op === 'referral') {
      if (!m.referral) throw fail(400, 'no_referral', 'This member wasn’t referred.');
      const st = b.status === 'qualified' ? 'qualified' : 'rejected'; m.referral.status = st; m.referral.reason = note;
      const ruid = await db.get('rw:num:' + m.referredBy); if (ruid) { await db.hset('rw:refs:' + ruid, m.uid, { n: m.n, t: m.referral.t, status: st }); await db.set('rw:m:' + m.uid, m); await refreshRow(db, cfg, ruid); }
      await db.hdel('rw:review', m.uid);
    } else throw fail(400, 'bad_op', 'Unknown operation.');
    m._row = ''; await db.set('rw:m:' + m.uid, m); await refreshRow(db, cfg, m.uid); await db.del('rw:lb');
    return ADMIN.admin_member(db, key, cfg, u, { q: m.uid });
  },
  async admin_review(db) { const r = await db.hgetall('rw:review'); return { items: Object.entries(r).map(([uid, x]) => ({ uid, ...x })).sort((a, b) => b.t - a.t).slice(0, 200) }; },
  async admin_lb_refresh(db) { return { total: await rebuildRanks(db) }; },
};

/** Account deleted: free the leaderboard row; the member number stays retired. */
async function onDelete(db, uid) {
  const m = await db.get('rw:m:' + uid); if (m) { m.deleted = true; await db.set('rw:m:' + uid, m); }
  const row = await db.hget('rw:rows', uid); if (row) await db.hset('rw:rows', uid, { ...row, d: 1 });
  await db.zrem('rw:z:refs', uid); await db.zrem('rw:z:xp', uid); await db.zrem('rw:z:early', uid); await db.del('rw:lb');
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  res.setHeader('cache-control', 'no-store');
  if (!available()) return send(res, 503, { code: 'REWARDS_UNAVAILABLE', message: 'The rewards program needs server storage (Upstash Redis).' });
  const b = (await readJson(req)) || {}; const action = String(b.action || '');
  try {
    const db = store();
    if (PUBLIC[action]) return send(res, 200, await PUBLIC[action](db, b));
    const cfg = await getConfig(db);
    if (MEMBER[action]) { const { u, key } = await authed(db, b); return send(res, 200, { ...(await MEMBER[action](db, key, cfg, u, b, req)), isAdmin: isAdmin(u), config: pubConfig(cfg, Number((await db.get('rw:seq')) || 0)) }); }
    if (ADMIN[action]) { const { u, key } = await authed(db, b); if (!isAdmin(u)) throw fail(403, 'forbidden', 'Admins only.'); return send(res, 200, await ADMIN[action](db, key, cfg, u, b)); }
    return send(res, 400, { code: 'INVALID_REQUEST', message: 'Unknown action.' });
  } catch (e) {
    if (e.status) return send(res, e.status, { code: e.code, message: e.message });
    console.error('rewards error', e);
    return send(res, 500, { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Try again.' });
  }
};
module.exports = handler;
module.exports.onDelete = onDelete;
module.exports._defaults = DEFAULTS;
