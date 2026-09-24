// Every league's ESPN scoreboard for one sport group, in one trimmed, edge-cached response.
//   GET /api/sports?group=soccer                       today (live scores)
//   GET /api/sports?group=soccer&dates=YYYYMMDD-YYYYMMDD  results / fixtures
// Groups and the built-in league list: js/services/leagues.js. Groups marked `discover` also pull
// ESPN's league catalogue, so leagues ESPN adds appear automatically.
// Returns { at, group, leagues: [[key, name, label, kind, ok]], events: [[key, event]] }.
const { send } = require('./_util');
const { SPORT_LEAGUES, SPORT_GROUPS, SPORT_LABEL_OF_PATH, SPORT_KIND_OF_PATH } = require('../js/services/leagues.js');

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
const HEADERS = { accept: 'application/json, text/plain, */*', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const memo = new Map();      // response cache per warm instance: key -> { at, body }
const quiet = new Map();     // league key -> time until which "today" requests skip it (it had no games)
const catalog = new Map();   // sport path -> { at, slugs }
const BUDGET_MS = 20000;     // vercel.json gives this function 30s

const pick = (o, keys) => { const out = {}; if (o) keys.forEach(k => { if (o[k] !== undefined) out[k] = o[k]; }); return out; };
const logoOf = (t) => t && (t.logo || (t.logos && t.logos[0] && t.logos[0].href));
function trimTeam(c) {
  const t = c.team || {};
  return { ...pick(c, ['homeAway', 'score', 'winner', 'form', 'order']), records: c.records ? c.records.slice(0, 1).map(r => pick(r, ['summary'])) : undefined,
    statistics: c.statistics ? c.statistics.map(s => pick(s, ['name', 'displayValue', 'value'])) : undefined,
    team: { ...pick(t, ['id', 'displayName', 'shortDisplayName', 'name', 'abbreviation', 'color', 'location']), logo: logoOf(t) } };
}
function trimAthlete(c) {
  const a = c.athlete || (c.athletes && c.athletes[0] && c.athletes[0].athlete) || {};
  const sc = c.score && typeof c.score === 'object' ? c.score.displayValue : c.score;
  return { ...pick(c, ['id', 'order', 'winner', 'homeAway']), score: sc, linescores: (c.linescores || []).map(l => ({ value: l.value, tiebreak: l.tiebreak, displayValue: l.displayValue })),
    athlete: { displayName: a.displayName || (c.team && c.team.displayName), shortName: a.shortName, flag: a.flag && { href: a.flag.href, alt: a.flag.alt } },
    team: c.team ? { displayName: c.team.displayName, abbreviation: c.team.abbreviation, logo: logoOf(c.team) } : undefined,
    status: c.status ? { position: c.status.position && { displayName: c.status.position.displayName }, thru: c.status.thru, displayValue: c.status.displayValue } : undefined,
    records: c.records ? c.records.slice(0, 1).map(r => pick(r, ['summary'])) : undefined };
}
function trimComp(c, kind) {
  const base = { ...pick(c, ['id', 'date']), status: c.status, round: c.round && pick(c.round, ['displayName']), type: c.type && pick(c.type, ['abbreviation', 'text']), notes: (c.notes || []).map(n => pick(n, ['headline'])) };
  if (kind === 'team') return { ...base, competitors: (c.competitors || []).map(trimTeam), venue: c.venue ? { fullName: c.venue.fullName, address: c.venue.address && pick(c.venue.address, ['city', 'country']) } : undefined,
    broadcasts: (c.broadcasts || []).map(b => pick(b, ['names'])), odds: (c.odds || []).slice(0, 1).map(o => ({ details: o.details, overUnder: o.overUnder, provider: o.provider && { name: o.provider.name } })),
    details: (c.details || []).map(d => ({ ...pick(d, ['scoringPlay', 'redCard', 'yellowCard', 'ownGoal', 'penaltyKick']), type: d.type && pick(d.type, ['text']), clock: d.clock && pick(d.clock, ['displayValue']), team: d.team && pick(d.team, ['id']), athletesInvolved: (d.athletesInvolved || []).slice(0, 1).map(a => pick(a, ['displayName'])) })),
    situation: c.situation && c.situation.lastPlay ? { lastPlay: { text: c.situation.lastPlay.text } } : undefined };
  const comps = (c.competitors || []).map(trimAthlete); comps.sort((a, b) => (a.order || 999) - (b.order || 999));
  return { ...base, competitors: kind === 'field' ? comps.slice(0, 40) : comps, venue: c.venue ? { fullName: c.venue.fullName } : undefined };
}
function trimEvent(e, kind) {
  const out = { ...pick(e, ['id', 'date', 'endDate', 'name', 'shortName']), status: e.status, competitions: (e.competitions || []).map(c => trimComp(c, kind)) };
  if (e.groupings) out.groupings = e.groupings.map(g => ({ grouping: g.grouping && pick(g.grouping, ['slug', 'displayName']), competitions: (g.competitions || []).map(c => trimComp(c, kind)) }));
  if (kind === 'team') out.competitions = out.competitions.slice(0, 1);
  return out;
}
async function getJson(url, ms) { const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
/** Extra leagues from ESPN's catalogue (cached 12h). Failure just means the built-in list is used. */
async function discover(sport) {
  const c = catalog.get(sport); if (c && Date.now() - c.at < 12 * 3600e3) return c.slugs;
  let slugs = [];
  try { const j = await getJson(`${CORE}/${sport}/leagues?limit=1000&lang=en&region=us`, 5000); slugs = (j.items || []).map(i => (/\/leagues\/([^/?]+)/.exec(i.$ref || '') || [])[1]).filter(Boolean); } catch (e) { slugs = (c && c.slugs) || []; }
  catalog.set(sport, { at: Date.now(), slugs }); return slugs;
}
async function pool(items, n, deadline, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; if (Date.now() > deadline) { out[k] = { skipped: true }; continue; } try { out[k] = { ok: true, v: await fn(items[k]) }; } catch (e) { out[k] = { ok: false }; } } }));
  return out;
}

module.exports = async (req, res) => {
  const q = req.query || {}; const dates = String(q.dates || ''); const gid = String(q.group || '');
  const G = SPORT_GROUPS.find(g => g.id === gid);
  if (!G) return send(res, 400, { error: 'group must be one of ' + SPORT_GROUPS.map(g => g.id).join(', ') });
  if (dates && !/^\d{8}(-\d{8})?$/.test(dates)) return send(res, 400, { error: 'dates must be YYYYMMDD or YYYYMMDD-YYYYMMDD' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [from, to] = dates ? dates.split('-').concat(dates.split('-')[0]).slice(0, 2) : [today, today];
  const ttl = !dates ? 15 : to < today ? 900 : from > today ? 300 : 30;
  const cacheHdr = { 'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` };
  const mkey = gid + '|' + (dates || 'today'); const m = memo.get(mkey);
  if (m && Date.now() - m.at < ttl * 1000) return send(res, 200, m.body, cacheHdr);

  const t0 = Date.now(); const deadline = t0 + BUDGET_MS;
  const list = SPORT_LEAGUES.filter(L => G.sports.includes(L[0])).map(L => ({ sp: L[0], slug: L[1], name: L[2], label: L[3], kind: L[4] || 'team' }));
  if (G.discover) {
    const known = new Set(list.map(l => l.sp + '/' + l.slug));
    const found = (await Promise.all(G.sports.map(async sp => (await discover(sp)).map(slug => ({ sp, slug }))))).flat();
    found.forEach(({ sp, slug }) => { if (!known.has(sp + '/' + slug)) { known.add(sp + '/' + slug); list.push({ sp, slug, name: null, label: SPORT_LABEL_OF_PATH[sp] || sp, kind: SPORT_KIND_OF_PATH[sp] || 'team', discovered: true }); } });
  }
  const now = Date.now();
  const todo = list.filter(l => dates || !((quiet.get(l.sp + '/' + l.slug) || 0) > now));
  const results = await pool(todo, 24, deadline, async (l) => getJson(`${ESPN}/${l.sp}/${l.slug}/scoreboard?limit=500${dates ? '&dates=' + dates : ''}`, 4500));

  const leagues = []; const events = []; let okN = 0;
  todo.forEach((l, i) => {
    const r = results[i]; const key = l.sp + '/' + l.slug;
    if (!r || r.skipped) return;
    if (!r.ok) { if (!l.discovered) leagues.push([key, l.name, l.label, l.kind, 0]); return; }
    okN++; const evs = Array.isArray(r.v.events) ? r.v.events : [];
    const lg = (r.v.leagues || [])[0] || {};
    if (!evs.length) { if (!dates) quiet.set(key, now + 30 * 60e3); if (l.discovered) return; }
    leagues.push([key, l.name || lg.name || lg.abbreviation || l.slug, l.label, l.kind, 1]);
    evs.forEach(e => events.push([key, trimEvent(e, l.kind)]));
  });
  if (!okN && !events.length) return send(res, 502, { error: 'ESPN unavailable', code: 'ESPN_UNAVAILABLE' }, { 'cache-control': 'no-store' });
  const body = JSON.stringify({ at: Date.now(), group: gid, ms: Date.now() - t0, leagues, events });
  memo.set(mkey, { at: Date.now(), body }); if (memo.size > 80) memo.delete(memo.keys().next().value);
  return send(res, 200, body, cacheHdr);
};
