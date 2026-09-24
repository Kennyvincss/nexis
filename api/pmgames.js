// Polymarket's per-game sports markets (moneyline, draw, spreads...) in one trimmed, edge-cached response.
//   GET /api/pmgames
// Walks Gamma's sports list (every league Polymarket covers, each with a series id) and pulls each
// series' open events (soonest first, top leagues first), plus catch-all soccer/games tag passes, keeping the
// ones that look like a single game ("A vs. B") starting between 8 hours ago and 21 days from now.
//   GET /api/pmgames?debug=1   counts per league and why events were dropped (not cached) The browser matches them to ESPN games by team and time.
// Returns { at, events: [{ id, slug, title, start, league, series, tags, live, score, markets: [...] }] } — up to 60 markets
// per game (result, draw, handicap, totals, both teams to score, props), for the sportsbook.
const { send } = require('./_util');

const GAMMA = 'https://gamma-api.polymarket.com';
const HEADERS = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const TTL = 60;
const BUDGET_MS = 20000;
let memo = null; // { at, body }

async function getJson(url, ms) { const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const jparse = (v) => { if (Array.isArray(v)) return v; try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } };
// Gamma mixes ISO dates with "2026-09-27 14:00:00+00" (space, short offset) and bare "2026-09-27".
const ms = (v) => { if (!v) return null; let s = String(v).trim(); if (/^\d{4}-\d\d-\d\d \d/.test(s)) s = s.replace(' ', 'T'); if (/T\d/.test(s)) s = s.replace(/([+-]\d\d)$/, '$1:00'); const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const isGame = (title) => /\s(vs\.?|v\.?|@|-|–)\s/i.test(title || '');
// Leagues fetched first, so the time budget never runs out before them.
const PRIORITY = ['epl', 'lal', 'sea', 'bun', 'fl1', 'ucl', 'uel', 'uecl', 'ere', 'por', 'mls', 'efl', 'spl', 'tur', 'bra', 'arg', 'lmx', 'nba', 'nfl', 'mlb', 'nhl', 'wnba', 'cfb', 'cbb', 'atp', 'wta', 'ufc'];
const rankOf = (code) => { const i = PRIORITY.indexOf(String(code).toLowerCase()); return i < 0 ? 999 : i; };
function trimMarket(x) {
  return { id: String(x.id), question: x.question, outcomes: x.outcomes, outcomePrices: x.outcomePrices, clobTokenIds: x.clobTokenIds, conditionId: x.conditionId, slug: x.slug,
    volume: x.volumeNum ?? x.volume, volume24hr: x.volume24hr, liquidity: x.liquidityNum ?? x.liquidity, bestBid: x.bestBid, bestAsk: x.bestAsk, endDate: x.endDate,
    oneDayPriceChange: x.oneDayPriceChange, groupItemTitle: x.groupItemTitle, sportsMarketType: x.sportsMarketType, line: x.line, icon: x.icon, image: x.image, gameStartTime: x.gameStartTime };
}
function trimEvent(e, league) {
  const mk = (e.markets || []).filter(x => !x.closed && x.active !== false && jparse(x.clobTokenIds).length === 2 && jparse(x.outcomePrices).length === 2);
  if (!mk.length) return null;
  const start = ms(e.startTime) || ms(mk.map(x => x.gameStartTime).find(Boolean)) || ms(e.eventDate) || ms(e.endDate);
  const rank = (x) => (x.sportsMarketType === 'moneyline' ? 0 : /draw|win/i.test(x.question || '') ? 1 : 2);
  mk.sort((a, b) => rank(a) - rank(b) || (Number(b.volumeNum ?? b.volume) || 0) - (Number(a.volumeNum ?? a.volume) || 0));
  const series = (e.series || [])[0] || {};
  return { id: String(e.id), slug: e.slug, title: e.title, start, league, series: series.title || e.seriesSlug || '', tags: (e.tags || []).map(t => t.label).filter(Boolean).slice(0, 8), image: e.icon || e.image,
    live: !!e.live, ended: !!e.ended, score: e.score || '', period: e.period || '', elapsed: e.elapsed || '', volume: Number(e.volume) || 0, markets: mk.slice(0, 60).map(trimMarket) };
}
async function pool(items, n, deadline, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; if (Date.now() > deadline) continue; try { out.push(await fn(it)); } catch (e) { /* one league failing is fine */ } } }));
  return out;
}

module.exports = async (req, res) => {
  const debug = !!(req.query && req.query.debug);
  const cacheHdr = { 'cache-control': `public, s-maxage=${TTL}, stale-while-revalidate=${TTL * 5}` };
  if (!debug && memo && Date.now() - memo.at < TTL * 1000) return send(res, 200, memo.body, cacheHdr);
  const t0 = Date.now(); const deadline = t0 + BUDGET_MS; const errors = [];
  const lo = Date.now() - 8 * 3600e3, hi = Date.now() + 21 * 86400e3;
  const since = new Date(Date.now() - 12 * 3600e3).toISOString();
  // Open events for a filter, soonest first (end date ascending), a few pages deep. If Gamma rejects the
  // ordering parameters, fall back to one plain page.
  async function pages(filter, maxPages) {
    const out = [];
    for (let pg = 0; pg < maxPages && Date.now() < deadline; pg++) {
      let evs;
      try { evs = await getJson(`${GAMMA}/events?${filter}&active=true&closed=false&archived=false&end_date_min=${encodeURIComponent(since)}&order=endDate&ascending=true&limit=100&offset=${pg * 100}`, 6000); }
      catch (e) { if (pg) break; errors.push(filter + ': ' + e.message); evs = await getJson(`${GAMMA}/events?${filter}&active=true&closed=false&archived=false&limit=500`, 8000); out.push(...(Array.isArray(evs) ? evs : [])); break; }
      if (!Array.isArray(evs) || !evs.length) break; out.push(...evs);
      if (evs.length < 100) break;
      const last = evs[evs.length - 1]; const t = ms(last.startTime) || ms(last.endDate); if (t && t > hi) break;
    }
    return out;
  }
  let sports = [];
  try { const j = await getJson(`${GAMMA}/sports`, 6000); sports = Array.isArray(j) ? j : []; } catch (e) { errors.push('sports: ' + e.message); }
  const series = [...new Map(sports.flatMap(s => String(s.series || '').split(',').map(id => id.trim()).filter(Boolean).map(id => [id, s.sport || ''])))].sort((a, b) => rankOf(a[1]) - rankOf(b[1]));
  const jobs = [...series.map(([id, league]) => ({ filter: 'series_id=' + encodeURIComponent(id), league, max: 3 })),
    // Catch-all passes, so a league missing from the sports list (or a failed series) still shows up.
    { filter: 'tag_slug=soccer', league: '', max: 5 }, { filter: 'tag_slug=games', league: '', max: 5 }];
  const lists = await pool(jobs, 16, deadline, async (j) => { try { return (await pages(j.filter, j.max)).map(e => [e, j.league]); } catch (e) { errors.push(j.filter + ': ' + e.message); throw e; } });
  // Series results first, so a game keeps its league code when a tag pass sees it too.
  const raw = lists.flat().sort((a, b) => (a[1] ? 0 : 1) - (b[1] ? 0 : 1));
  const seen = new Set(); const events = []; const why = { notGame: 0, noMarkets: 0, outOfWindow: 0, ended: 0 };
  raw.forEach(([e, league]) => {
    if (!e || seen.has(String(e.id))) return; seen.add(String(e.id));
    if (!isGame(e.title)) { why.notGame++; return; }
    const t = trimEvent(e, league); if (!t) { why.noMarkets++; return; } if (t.ended) { why.ended++; return; }
    if (!t.start || t.start < lo || t.start > hi) { why.outOfWindow++; return; }
    events.push(t);
  });
  if (debug) {
    const per = {}; events.forEach(e => { const k = e.league || '(tag pass)'; per[k] = (per[k] || 0) + 1; });
    return send(res, 200, { ms: Date.now() - t0, series: series.length, seriesCodes: series.map(x => x[1]).slice(0, 200), rawEvents: raw.length, uniqueEvents: seen.size, kept: events.length, dropped: why, perLeague: per, errors: errors.slice(0, 20), sample: events.slice(0, 5).map(e => ({ title: e.title, league: e.league, start: new Date(e.start).toISOString(), markets: e.markets.length })) }, { 'cache-control': 'no-store' });
  }
  if (!events.length && !raw.length) return send(res, 502, { error: 'Polymarket unavailable', code: 'POLYMARKET_UNAVAILABLE' }, { 'cache-control': 'no-store' });
  events.sort((a, b) => a.start - b.start);
  const body = JSON.stringify({ at: Date.now(), ms: Date.now() - t0, events });
  memo = { at: Date.now(), body };
  return send(res, 200, body, cacheHdr);
};
