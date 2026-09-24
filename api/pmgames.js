// Polymarket's per-game sports markets (moneyline, draw, spreads...) in one trimmed, edge-cached response.
//   GET /api/pmgames
// Walks Gamma's sports list (every league Polymarket covers, each with a series id) and pulls each
// series' open events, keeping the ones that look like a single game ("A vs. B") starting between
// 12 hours ago and 21 days from now. The browser matches them to ESPN games by team and time.
// Returns { at, events: [{ id, slug, title, start, league, image, markets: [...] }] }.
const { send } = require('./_util');

const GAMMA = 'https://gamma-api.polymarket.com';
const HEADERS = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' };
const TTL = 60;
const BUDGET_MS = 20000;
let memo = null; // { at, body }

async function getJson(url, ms) { const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const jparse = (v) => { if (Array.isArray(v)) return v; try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } };
const ms = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const isGame = (title) => /\s(vs\.?|v\.?|@)\s/i.test(title || '');

function trimMarket(x) {
  return { id: String(x.id), question: x.question, outcomes: x.outcomes, outcomePrices: x.outcomePrices, clobTokenIds: x.clobTokenIds, conditionId: x.conditionId, slug: x.slug,
    volume: x.volumeNum ?? x.volume, volume24hr: x.volume24hr, liquidity: x.liquidityNum ?? x.liquidity, bestBid: x.bestBid, bestAsk: x.bestAsk, endDate: x.endDate,
    oneDayPriceChange: x.oneDayPriceChange, groupItemTitle: x.groupItemTitle, sportsMarketType: x.sportsMarketType, icon: x.icon, image: x.image, gameStartTime: x.gameStartTime };
}
function trimEvent(e, league) {
  const mk = (e.markets || []).filter(x => !x.closed && x.active !== false && jparse(x.clobTokenIds).length === 2 && jparse(x.outcomePrices).length === 2);
  if (!mk.length) return null;
  const start = ms(e.startTime) || ms(mk.map(x => x.gameStartTime).find(Boolean)) || ms(e.eventDate) || ms(e.endDate);
  const rank = (x) => (x.sportsMarketType === 'moneyline' ? 0 : /draw|win/i.test(x.question || '') ? 1 : 2);
  mk.sort((a, b) => rank(a) - rank(b) || (Number(b.volumeNum ?? b.volume) || 0) - (Number(a.volumeNum ?? a.volume) || 0));
  return { id: String(e.id), slug: e.slug, title: e.title, start, league, image: e.icon || e.image, markets: mk.slice(0, 8).map(trimMarket) };
}
async function pool(items, n, deadline, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; if (Date.now() > deadline) continue; try { out.push(await fn(it)); } catch (e) { /* one league failing is fine */ } } }));
  return out;
}

module.exports = async (req, res) => {
  const cacheHdr = { 'cache-control': `public, s-maxage=${TTL}, stale-while-revalidate=${TTL * 5}` };
  if (memo && Date.now() - memo.at < TTL * 1000) return send(res, 200, memo.body, cacheHdr);
  const t0 = Date.now(); const deadline = t0 + BUDGET_MS;
  let sports = [];
  try { const j = await getJson(`${GAMMA}/sports`, 6000); sports = Array.isArray(j) ? j : []; } catch (e) { sports = []; }
  const series = [...new Map(sports.flatMap(s => String(s.series || '').split(',').map(id => id.trim()).filter(Boolean).map(id => [id, s.sport || ''])))];
  const lists = await pool(series, 16, deadline, async ([id, league]) => {
    const evs = await getJson(`${GAMMA}/events?series_id=${encodeURIComponent(id)}&active=true&closed=false&archived=false&limit=200`, 6000);
    return (Array.isArray(evs) ? evs : []).map(e => [e, league]);
  });
  let raw = lists.flat();
  // Fallback when the sports list is unavailable: Polymarket's "games" tag.
  if (!raw.length) { try { const evs = await getJson(`${GAMMA}/events?tag_slug=games&active=true&closed=false&archived=false&limit=500`, 8000); raw = (Array.isArray(evs) ? evs : []).map(e => [e, '']); } catch (e) { /* none */ } }
  const lo = Date.now() - 12 * 3600e3, hi = Date.now() + 21 * 86400e3; const seen = new Set(); const events = [];
  raw.forEach(([e, league]) => {
    if (!e || seen.has(String(e.id)) || !isGame(e.title)) return; seen.add(String(e.id));
    const t = trimEvent(e, league); if (t && t.start && t.start >= lo && t.start <= hi) events.push(t);
  });
  if (!events.length && !raw.length) return send(res, 502, { error: 'Polymarket unavailable', code: 'POLYMARKET_UNAVAILABLE' }, { 'cache-control': 'no-store' });
  events.sort((a, b) => a.start - b.start);
  const body = JSON.stringify({ at: Date.now(), ms: Date.now() - t0, events });
  memo = { at: Date.now(), body };
  return send(res, 200, body, cacheHdr);
};
