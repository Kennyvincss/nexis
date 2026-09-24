/* =====================================================================
   POLYMARKET SERVICE (read-only reference data, via /api/data)
   Nexis executes trades on Panta. Polymarket supplies public reference
   markets, the global live trades tape and public trader data for the
   Trader Tracker. Prices stream from the CLOB WebSocket.
   ===================================================================== */
const GAMMA = 'https://gamma-api.polymarket.com', PDATA = 'https://data-api.polymarket.com', CLOB = 'https://clob.polymarket.com';
function polyCat(tags, title) {
  const t = (tags.join(' ') + ' ' + (title || '')).toLowerCase();
  if (/crypto|bitcoin|ethereum|solana|\bbtc\b|\beth\b|\bxrp\b|token/.test(t)) return 'crypto';
  if (/sport|nba|nfl|soccer|football|premier league|champions league|tennis|mlb|nhl|ufc|f1|golf|\bvs\.?\b/.test(t)) return 'sports';
  if (/politic|election|president|senate|congress|court/.test(t)) return 'politics';
  if (/fed|rate|economy|inflation|stock|finance|gdp|tariff/.test(t)) return 'finance';
  if (/culture|movie|music|oscar|grammy|celebrity|tv|album|box office/.test(t)) return 'entertainment';
  if (/science|space|ai\b|climate/.test(t)) return 'science';
  if (/war|world|geopolit|israel|ukraine|china|russia/.test(t)) return 'world';
  return 'other';
}
const Poly = {
  markets: new Map(), byToken: new Map(), trades: [], mtrades: {}, keys: new Set(), state: 'idle', ws: null,
  async load() {
    try {
      const evs = await Net.data(`${GAMMA}/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=40`);
      if (!Array.isArray(evs)) throw new Error('Unexpected response');
      evs.forEach(e => { const cat = polyCat((e.tags || []).map(t => t.label || ''), e.title); (e.markets || []).filter(x => !x.closed && jparse(x.clobTokenIds).length === 2 && jparse(x.outcomePrices).length === 2).sort((a, b) => nz(b.volume24hr) - nz(a.volume24hr)).slice(0, 2).forEach(x => this.upsert(x, e, cat)); });
      this.state = 'live'; Feeds.set('polymarket', 'live'); this.subscribe(); Bus.emit('poly');
    } catch (e) { this.state = this.markets.size ? 'stale' : 'offline'; Feeds.set('polymarket', this.state, e); Bus.emit('poly'); }
  },
  /** Per-game sports markets (every league Polymarket covers) from /api/pmgames, for matching to ESPN games. */
  games: [], gamesAt: 0, gamesState: 'idle',
  async loadGames() {
    try {
      const r = await Net.api('pmgames', { timeout: 35000 }); if (!r || !Array.isArray(r.events)) throw new Error('Unexpected response');
      this.games = r.events.map(e => {
        const mids = (e.markets || []).map(x => this.upsert(x, e, 'sports')).map(m => { m.game = e.id; m.start = e.start; return m.id; });
        const [a, b] = String(e.title || '').split(/\s+(?:vs\.?|v\.?|@)\s+/i);
        const abbrs = String(e.slug || '').split('-').slice(1).filter(w => /^[a-z]{2,4}$/.test(w));
        return { id: e.id, slug: e.slug, title: e.title, league: e.league, start: e.start, a: a || '', b: b || '', abbrs, mids };
      }).filter(g => g.a && g.b && g.mids.length);
      this.gamesAt = now(); this.gamesState = 'live'; this.subscribe(); Bus.emit('poly'); Bus.emit('sports');
    } catch (e) { this.gamesState = this.games.length ? 'stale' : 'offline'; }
  },
  upsert(x, e, cat) {
    const id = 'pm-' + x.id; const outs = jparse(x.outcomes); const px = jparse(x.outcomePrices).map(Number); const tok = jparse(x.clobTokenIds).map(String);
    const f = { id, src: 'polymarket', q: x.question || (e && e.title), yesLabel: outs[0] || 'Yes', noLabel: outs[1] || 'No', yes: clamp(nz(px[0], .5), 0, 1), vol: nz(x.volumeNum ?? x.volume), vol24: nz(x.volume24hr), liq: nz(x.liquidityNum ?? x.liquidity), chg: nz(x.oneDayPriceChange), bid: x.bestBid != null ? nz(x.bestBid, null) : null, ask: x.bestAsk != null ? nz(x.bestAsk, null) : null, end: toMs(x.endDate), conditionId: x.conditionId, tokens: tok, slug: x.slug, eventSlug: (e && e.slug) || x.eventSlug, cat: cat || 'other', image: x.icon || x.image || (e && e.icon), rule: (x.description || '').slice(0, 800) };
    const m = this.markets.get(id); if (m) { const streamed = m.bid != null && this.ws && this.ws.open; Object.assign(m, f, streamed ? { yes: m.yes, bid: m.bid, ask: m.ask } : {}); } else this.markets.set(id, { ...f, hist: [] });
    tok.forEach((t, i) => this.byToken.set(t, { m: this.markets.get(id), idx: i })); return this.markets.get(id);
  },
  url(m) { return `https://polymarket.com/event/${encodeURIComponent(m.eventSlug || m.slug || '')}`; },
  subscribe() {
    // Busiest markets first; game markets only once they have volume or kick off within a day.
    const ms = [...this.markets.values()].filter(m => !m.game || m.vol24 > 0 || Math.abs((m.start || 0) - now()) < DAY).sort((a, b) => (a.game ? 1 : 0) - (b.game ? 1 : 0) || b.vol24 - a.vol24);
    const ids = ms.flatMap(m => m.tokens).slice(0, 400); const key = ids.join(','); if (!ids.length || key === this._key) return; this._key = key;
    if (!this.ws) this.ws = new Socket('wss://ws-subscriptions-clob.polymarket.com/ws/market', { name: 'clob', onOpen: (ws) => { ws.send(JSON.stringify({ assets_ids: this._key.split(','), type: 'market' })); clearInterval(this._ping); this._ping = setInterval(() => this.ws.send('PING'), 10000); }, onMessage: (d) => (Array.isArray(d) ? d : [d]).forEach(x => this.onMsg(x)) });
    if (this.ws.open) this.ws.send({ assets_ids: ids, type: 'market' }); else this.ws.connect();
  },
  onMsg(x) {
    if (!x || typeof x !== 'object') return; const t = x.event_type;
    if (t === 'book') { const bids = (x.bids || x.buys || []).map(o => nz(o.price)), asks = (x.asks || x.sells || []).map(o => nz(o.price)); this.quote(x.asset_id, bids.length ? Math.max(...bids) : null, asks.length ? Math.min(...asks) : null); }
    else if (t === 'price_change') (x.price_changes || []).forEach(pc => pc.best_bid != null && this.quote(pc.asset_id, nz(pc.best_bid), nz(pc.best_ask)));
    else if (t === 'best_bid_ask') this.quote(x.asset_id, nz(x.best_bid), nz(x.best_ask));
    else if (t === 'last_trade_price') { const r = this.byToken.get(String(x.asset_id)); if (!r) return; const p = nz(x.price); r.m.last = r.idx === 0 ? p : 1 - p; if (r.m.bid == null || r.m.ask - r.m.bid > .1) this.setYes(r.m, r.m.last); }
  },
  quote(asset, bb, ba) {
    const r = this.byToken.get(String(asset)); if (!r || bb == null || ba == null) return; const m = r.m;
    [m.bid, m.ask] = r.idx === 0 ? [bb, ba] : [1 - ba, 1 - bb];
    this.setYes(m, m.ask - m.bid <= .1 ? (m.bid + m.ask) / 2 : (m.last ?? m.yes));
  },
  setYes(m, y) { if (Math.abs(y - m.yes) < 1e-4) return; const prev = m.yes; m.yes = clamp(y, 0, 1); if (m.hist && m.hist.length) m.hist[m.hist.length - 1] = [now(), m.yes]; Feeds.set('polymarket', 'live'); Bus.emit('poly:price', { m, prev }); },
  normTrade: (x) => ({ key: [x.transactionHash, x.asset, x.size, x.timestamp].join('|'), tx: x.transactionHash, cid: x.conditionId, wallet: String(x.proxyWallet || '').toLowerCase(), who: x.name || x.pseudonym || shortW(x.proxyWallet), img: x.profileImage, title: x.title, outcome: x.outcome, yesSide: +x.outcomeIndex === 0, side: x.side, price: nz(x.price), size: nz(x.size), usd: nz(x.size) * nz(x.price), t: toMs(x.timestamp), slug: x.slug, eventSlug: x.eventSlug }),
  addTrades(list, cid) {
    const fresh = [];
    list.forEach(t => { if (this.keys.has(t.key)) return; this.keys.add(t.key); fresh.push(t); const k = cid || t.cid; if (k) (this.mtrades[k] = this.mtrades[k] || []).unshift(t); });
    if (!cid) this.trades = [...fresh, ...this.trades].sort((a, b) => b.t - a.t).slice(0, 150);
    Object.keys(this.mtrades).forEach(k => this.mtrades[k] = this.mtrades[k].sort((a, b) => b.t - a.t).slice(0, 50));
    return fresh;
  },
  async pollTrades() {
    try { const list = await Net.data(`${PDATA}/trades?limit=60&takerOnly=true`); if (!Array.isArray(list)) throw new Error('Unexpected response'); const f = this.addTrades(list.map(this.normTrade)); Feeds.set('polymarket', 'live'); if (f.length) Bus.emit('poly:trades', f); }
    catch (e) { if (this.state !== 'live') Feeds.set('polymarket', 'offline', e); }
  },
  async marketTrades(m) { const list = await Net.data(`${PDATA}/trades?market=${m.conditionId}&limit=30&takerOnly=true`); if (Array.isArray(list)) { this.addTrades(list.map(this.normTrade), m.conditionId); Bus.emit('poly:trades'); } return this.mtrades[m.conditionId] || []; },
  async history(m) { if (m.histLoaded) return m.hist; const j = await Net.data(`${CLOB}/prices-history?market=${m.tokens[0]}&interval=1m&fidelity=60`); m.hist = (j.history || []).map(h => [toMs(h.t), nz(h.p)]).filter(x => x[1] > 0); m.hist.push([now(), m.yes]); m.histLoaded = true; return m.hist; },
  async oi(m) { const r = await Net.data(`${PDATA}/oi?market=${m.conditionId}`); const v = Array.isArray(r) ? r[0] && r[0].value : r && r.value; m.oi = v != null ? nz(v) : null; return m.oi; },
  async holders(m) { const r = await Net.data(`${PDATA}/holders?market=${m.conditionId}&limit=8`); return (Array.isArray(r) ? r : []).flatMap(g => (g.holders || []).map(h => ({ wallet: String(h.proxyWallet || '').toLowerCase(), name: h.name || h.pseudonym || shortW(h.proxyWallet), img: h.profileImage, amount: nz(h.amount), idx: +h.outcomeIndex }))).sort((a, b) => b.amount - a.amount).slice(0, 10); },
  start() { Poller(() => this.load(), 30000); Poller(() => this.pollTrades(), 8000); Poller(() => this.loadGames(), 120000); },
};
