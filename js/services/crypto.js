/* =====================================================================
   CRYPTO PRICE SERVICE
   - CoinGecko /coins/markets (via /api/data, optional COINGECKO_API_KEY):
     price, 24h change/high/low/volume, market cap, 7-day sparkline. Polled 30s.
   - Coinbase Exchange WebSocket "ticker": tick-by-tick price for assets
     listed on Coinbase (BNB, TRX, TON etc. aren't — those update every 30s).
   - Charts: CoinGecko market_chart; the latest point follows live ticks.
   ===================================================================== */
const CG = 'https://api.coingecko.com/api/v3';
const Crypto = {
  coins: [], byId: new Map(), bySym: new Map(), state: 'idle', error: null, updatedAt: 0, streaming: new Set(), charts: {}, info: {},
  async load() {
    try {
      const rows = await Net.data(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&sparkline=true&price_change_percentage=1h,24h,7d`);
      if (!Array.isArray(rows) || !rows.length) throw new Error(rows && rows.status && rows.status.error_message || 'No price data returned');
      rows.forEach(r => {
        const sym = String(r.symbol || '').toUpperCase(); const prev = this.byId.get(r.id);
        const c = { id: r.id, sym, name: r.name, image: r.image, rank: r.market_cap_rank, price: nz(r.current_price, null), chg24: nz(r.price_change_percentage_24h, null), chg1h: nz(r.price_change_percentage_1h_in_currency, null), chg7d: nz(r.price_change_percentage_7d_in_currency, null), high: nz(r.high_24h, null), low: nz(r.low_24h, null), vol: nz(r.total_volume, null), mcap: nz(r.market_cap, null), supply: nz(r.circulating_supply, null), ath: nz(r.ath, null), spark: (r.sparkline_in_7d && r.sparkline_in_7d.price) || [], cgAt: toMs(r.last_updated) || now(), src: 'CoinGecko' };
        c.open = c.price != null && c.chg24 != null ? c.price / (1 + c.chg24 / 100) : null;
        if (prev) { const streamed = prev.src === 'Coinbase' && now() - prev.tickAt < 60000; Object.assign(prev, c, streamed ? { price: prev.price, src: 'Coinbase', tickAt: prev.tickAt, chg24: prev.open ? (prev.price - c.open) / c.open * 100 : c.chg24 } : {}); }
        else { this.byId.set(c.id, c); this.bySym.set(sym, c); }
      });
      this.coins = rows.map(r => this.byId.get(r.id)); this.state = 'live'; this.error = null; this.updatedAt = now(); Feeds.set('crypto', 'live');
      this.subscribe(); Bus.emit('crypto');
    } catch (e) { this.error = e; this.state = this.coins.length ? 'stale' : 'offline'; Feeds.set('crypto', this.state, e); Bus.emit('crypto'); }
  },
  COINBASE: new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'BCH', 'SHIB', 'UNI', 'NEAR', 'SUI', 'APT', 'ATOM', 'XLM', 'HBAR', 'ICP', 'FIL', 'ARB', 'OP', 'AAVE', 'PEPE', 'ETC', 'INJ', 'RNDR', 'TIA', 'SEI', 'ONDO', 'POL', 'ALGO', 'MKR', 'CRV', 'BONK', 'WIF', 'JUP', 'PYTH', 'HNT', 'RENDER', 'TRUMP', 'ENA', 'LDO', 'IMX', 'GRT', 'STX', 'VET', 'XTZ', 'EOS']),
  subscribe() {
    const ids = this.coins.map(c => c.sym).filter(s => this.COINBASE.has(s)).map(s => s + '-USD');
    const key = ids.join(','); if (!ids.length || key === this._key) return; this._key = key;
    if (!this.ws) this.ws = new Socket('wss://ws-feed.exchange.coinbase.com', { name: 'coinbase', onOpen: (ws) => ws.send(JSON.stringify({ type: 'subscribe', product_ids: this._key.split(','), channels: ['ticker'] })), onMessage: (d) => this.tick(d) });
    if (this.ws.open) this.ws.send({ type: 'subscribe', product_ids: ids, channels: ['ticker'] }); else this.ws.connect();
  },
  tick(d) {
    if (!d || d.type !== 'ticker' || !d.price) return;
    const c = this.bySym.get(String(d.product_id).split('-')[0]); if (!c) return;
    const prev = c.price; const p = nz(d.price);
    c.price = p; c.tickAt = now(); c.src = 'Coinbase'; this.streaming.add(c.sym);
    if (c.open) c.chg24 = (p - c.open) / c.open * 100;
    if (c.high != null && p > c.high) c.high = p; if (c.low != null && p < c.low) c.low = p;
    const ch = this.charts[c.id]; if (ch && ch['1']) { const pts = ch['1']; if (now() - pts[pts.length - 1][0] > 60000) pts.push([now(), p]); else pts[pts.length - 1] = [now(), p]; }
    Bus.emit('crypto:tick', { c, prev });
  },
  async chart(id, days = '1') {
    const key = String(days); const cache = this.charts[id] = this.charts[id] || {};
    if (cache[key] && now() - (cache[key + ':at'] || 0) < (key === '1' ? 5 * 60e3 : 30 * 60e3)) return cache[key];
    const r = await Net.data(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${key}`);
    if (!r || !Array.isArray(r.prices)) throw new Error('No chart data returned');
    cache[key] = r.prices.map(([t, p]) => [t, p]); cache[key + ':vol'] = r.total_volumes || []; cache[key + ':at'] = now(); return cache[key];
  },
  async details(id) {
    if (this.info[id] && now() - this.info[id].at < 10 * 60e3) return this.info[id];
    const r = await Net.data(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`);
    const md = r.market_data || {};
    this.info[id] = { at: now(), desc: ((r.description && r.description.en) || '').replace(/<[^>]+>/g, '').split(/\n\n/)[0].slice(0, 700), home: (r.links && r.links.homepage || []).find(Boolean) || null, genesis: r.genesis_date, fdv: nz(md.fully_diluted_valuation && md.fully_diluted_valuation.usd, null), maxSupply: nz(md.max_supply, null), totalSupply: nz(md.total_supply, null), athDate: md.ath_date && md.ath_date.usd, atl: nz(md.atl && md.atl.usd, null), chg30d: nz(md.price_change_percentage_30d, null), chg1y: nz(md.price_change_percentage_1y, null), categories: (r.categories || []).filter(Boolean).slice(0, 4) };
    return this.info[id];
  },
  find(q) { q = String(q || '').toLowerCase(); return this.coins.find(c => c.id === q || c.sym.toLowerCase() === q); },
  start() { Poller(() => this.load(), 30000); },
};
