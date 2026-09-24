// Every league's scoreboard in one response, cached at the edge so all visitors share it.
//   GET /api/sports                          today's scoreboards (live scores)
//   GET /api/sports?dates=YYYYMMDD-YYYYMMDD  a date range (results / fixtures)
// Returns { at, leagues: [[index, ok]], events: [[leagueIndex, event]] } with events trimmed to the
// fields Nexis shows. League list: js/services/leagues.js (shared with the browser).
const { send } = require('./_util');
const { SPORT_LEAGUES } = require('../js/services/leagues.js');

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const HEADERS = { accept: 'application/json, text/plain, */*', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const memo = new Map(); // per warm instance: key -> { at, body }

const pick = (o, keys) => { const out = {}; if (o) keys.forEach(k => { if (o[k] !== undefined) out[k] = o[k]; }); return out; };
function trimTeam(c) {
  const t = c.team || {};
  return { ...pick(c, ['homeAway', 'score', 'winner', 'form']), records: c.records ? c.records.slice(0, 1).map(r => pick(r, ['summary'])) : undefined,
    statistics: c.statistics ? c.statistics.map(s => pick(s, ['name', 'displayValue', 'value'])) : undefined,
    team: { ...pick(t, ['id', 'displayName', 'shortDisplayName', 'name', 'abbreviation', 'color']), logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) } };
}
function trimEvent(e) {
  const c = (e.competitions || [])[0] || {};
  return { ...pick(e, ['id', 'date', 'name']), status: e.status || c.status,
    competitions: [{ ...pick(c, ['date']), competitors: (c.competitors || []).map(trimTeam), venue: c.venue ? { fullName: c.venue.fullName, address: c.venue.address && pick(c.venue.address, ['city', 'country']) } : undefined,
      broadcasts: (c.broadcasts || []).map(b => pick(b, ['names'])), odds: (c.odds || []).slice(0, 1).map(o => ({ details: o.details, overUnder: o.overUnder, provider: o.provider && { name: o.provider.name } })),
      details: (c.details || []).map(d => ({ ...pick(d, ['scoringPlay', 'redCard', 'yellowCard', 'ownGoal', 'penaltyKick']), type: d.type && pick(d.type, ['text']), clock: d.clock && pick(d.clock, ['displayValue']), team: d.team && pick(d.team, ['id']), athletesInvolved: (d.athletesInvolved || []).slice(0, 1).map(a => pick(a, ['displayName'])) })),
      situation: c.situation && c.situation.lastPlay ? { lastPlay: { text: c.situation.lastPlay.text } } : undefined, notes: (c.notes || []).map(n => pick(n, ['headline'])) }] };
}
async function fetchLeague(L, dates) {
  const url = `${ESPN}/${L[0]}/${L[1]}/scoreboard?limit=500${dates ? '&dates=' + dates : ''}`;
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json(); return Array.isArray(j.events) ? j.events : [];
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = { ok: true, v: await fn(items[k], k) }; } catch (e) { out[k] = { ok: false, e }; } } })); return out; }

module.exports = async (req, res) => {
  const dates = String((req.query && req.query.dates) || '');
  if (dates && !/^\d{8}(-\d{8})?$/.test(dates)) return send(res, 400, { error: 'dates must be YYYYMMDD or YYYYMMDD-YYYYMMDD' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [from, to] = dates ? dates.split('-').concat(dates.split('-')[0]).slice(0, 2) : [today, today];
  const past = dates && to < String(+today - 1); // entirely before yesterday (UTC)
  const ttl = !dates ? 10 : past ? 900 : from > today ? 300 : 30;
  const key = dates || 'today'; const m = memo.get(key);
  if (m && Date.now() - m.at < ttl * 1000) return send(res, 200, m.body, { 'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` });
  const results = await pool(SPORT_LEAGUES, 16, (L) => fetchLeague(L, dates));
  const leagues = results.map((r, i) => [i, r.ok ? 1 : 0]); const events = [];
  results.forEach((r, i) => { if (r.ok) r.v.forEach(e => events.push([i, trimEvent(e)])); });
  const okN = leagues.filter(x => x[1]).length;
  if (!okN) return send(res, 502, { error: 'ESPN unavailable', code: 'ESPN_UNAVAILABLE' }, { 'cache-control': 'no-store' });
  const body = JSON.stringify({ at: Date.now(), leagues, events });
  memo.set(key, { at: Date.now(), body }); if (memo.size > 60) memo.delete(memo.keys().next().value);
  return send(res, 200, body, { 'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}` });
};
