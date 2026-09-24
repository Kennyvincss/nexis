/* =====================================================================
   NETWORK + REAL-TIME SERVICE
   - Net: calls Nexis' serverless functions (/api/*). Secrets live there.
   - Config: which integrations the deployment has configured.
   - Feeds: live/offline status per data source (shown in the top bar).
   - Socket: reconnecting WebSocket with exponential backoff.
   - Poller: visibility-aware interval polling.
   ===================================================================== */
const Net = {
  hasApi: null, // false when the page isn't served with the /api functions (e.g. opened as a file)
  async _fetch(url, opts = {}, timeout = 12000) {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeout);
    try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(tm); }
  },
  async json(r) { const t = await r.text(); if (!t) return {}; try { return JSON.parse(t); } catch (e) { const err = new Error('The server returned an unreadable response.'); err.code = 'BAD_RESPONSE'; err.status = r.status; throw err; } },
  fail(status, body) { const e = new Error((body && (body.message || body.error)) || `Request failed (${status})`); e.status = status; e.code = (body && body.code) || 'HTTP_' + status; e.body = body; return e; },
  async api(path, { method = 'GET', body, timeout } = {}) {
    if (this.hasApi === false) throw Object.assign(new Error('This copy of Nexis is not running on its server, so live integrations are unavailable.'), { code: 'NO_API' });
    let r;
    try { r = await this._fetch('/api/' + path, method === 'POST' ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) } : {}, timeout); }
    catch (e) { throw Object.assign(new Error('Network error — check your connection.'), { code: 'NETWORK' }); }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) { if (r.status === 404 || /html/.test(ct)) { this.hasApi = false; throw Object.assign(new Error('This copy of Nexis is not running on its server, so live integrations are unavailable.'), { code: 'NO_API' }); } }
    this.hasApi = true;
    const j = await this.json(r);
    if (!r.ok) throw this.fail(r.status, j);
    j && typeof j === 'object' && Object.defineProperty(j, '_headers', { value: r.headers, enumerable: false });
    return j;
  },
  /** Public feeds (Polymarket, ESPN, CoinGecko…) through /api/data. */
  /** Public feeds through /api/data. Hosts that allow browser requests (ESPN) fall back to a direct
      fetch when the server is blocked or unavailable, and stay direct once that works. */
  DIRECT_OK: new Set(['site.api.espn.com']), direct: {},
  async data(url, opts) {
    const host = new URL(url).hostname; const canDirect = this.DIRECT_OK.has(host);
    if (canDirect && this.direct[host]) return this.fetchDirect(url, opts);
    try { return await this.api('data?url=' + encodeURIComponent(url), opts); }
    catch (e) { if (!canDirect) throw e; const r = await this.fetchDirect(url, opts); this.direct[host] = true; return r; }
  },
  async fetchDirect(url, { timeout = 12000 } = {}) {
    let r; try { r = await this._fetch(url, { headers: { accept: 'application/json' } }, timeout); } catch (e) { throw Object.assign(new Error('Network error — check your connection.'), { code: 'NETWORK' }); }
    const j = await this.json(r); if (!r.ok) throw this.fail(r.status, j); return j;
  },
};

const Config = {
  c: null, loading: null,
  async load() {
    if (this.c) return this.c; if (this.loading) return this.loading;
    this.loading = Net.api('config').then(c => (this.c = c)).catch(e => (this.c = { error: e.code || 'ERR', panta: { configured: false, mode: 'unconfigured' }, google: {}, email: {}, ai: {}, rpc: {} }));
    return this.loading;
  },
  get pantaMode() { return (this.c && this.c.panta && this.c.panta.mode) || 'unconfigured'; },
};

const FEEDS = {
  panta: { name: 'Panta markets', src: 'Panta API (via /api/panta)', what: 'Markets, YES/NO prices, volume, trades, positions, creation, resolution' },
  polymarket: { name: 'Polymarket', src: 'Gamma, Data API and CLOB WebSocket', what: 'Reference markets, live trades, public trader positions' },
  sports: { name: 'Live sports', src: 'ESPN scoreboard + summary API', what: 'Scores, clock, status, lineups, stats and key events' },
  crypto: { name: 'Crypto prices', src: 'CoinGecko + Coinbase WebSocket', what: 'Price, 24h change/high/low/volume, market cap, charts' },
  chain: { name: 'Solana', src: 'Solana RPC (via /api/rpc)', what: 'Wallet balances, transaction confirmation' },
  ai: { name: 'Nexis AI', src: 'Claude API (via /api/ai)', what: 'Market drafting and factor analysis' },
};
const Feeds = {
  st: Object.fromEntries(Object.keys(FEEDS).map(k => [k, 'idle'])), last: {}, err: {},
  set(k, v, err) { const ch = this.st[k] !== v; this.st[k] = v; if (v === 'live') { this.last[k] = now(); delete this.err[k]; } if (err) this.err[k] = String(err.message || err).slice(0, 160); if (ch) Bus.emit('feeds', k); },
  live(k) { return this.st[k] === 'live'; },
};

class Socket {
  constructor(url, { onOpen, onMessage, name } = {}) { this.url = url; this.onOpen = onOpen; this.onMessage = onMessage; this.name = name; this.backoff = 2000; this.ws = null; this.stopped = false; }
  connect() {
    if (this.stopped || (this.ws && this.ws.readyState <= 1)) return;
    let ws; try { ws = new WebSocket(this.url); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.backoff = 2000; this.onOpen && this.onOpen(ws); };
    ws.onmessage = (ev) => { if (typeof ev.data !== 'string') return; let d; try { d = JSON.parse(ev.data); } catch (e) { d = ev.data; } this.onMessage && this.onMessage(d, ws); };
    ws.onclose = () => { this.ws = null; this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  retry() { if (this.stopped) return; clearTimeout(this.t); this.t = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(60000, this.backoff * 2); }
  send(obj) { if (this.ws && this.ws.readyState === 1) { this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); return true; } return false; }
  get open() { return !!(this.ws && this.ws.readyState === 1); }
  stop() { this.stopped = true; clearTimeout(this.t); try { this.ws && this.ws.close(); } catch (e) {} }
}

/** Runs fn every `ms` while the tab is visible (and once immediately). Returns a stop function; stop.now() runs it immediately. */
function Poller(fn, ms, { immediate = true } = {}) {
  let t = null, stopped = false, busy = false;
  const run = async () => { if (stopped) return; if (!document.hidden && !busy) { busy = true; try { await fn(); } catch (e) { console.warn(e); } busy = false; } t = setTimeout(run, typeof ms === 'function' ? ms() : ms); };
  if (immediate) run(); else t = setTimeout(run, typeof ms === 'function' ? ms() : ms);
  const onVis = () => { if (!document.hidden && !stopped) { clearTimeout(t); run(); } };
  document.addEventListener('visibilitychange', onVis);
  const stop = () => { stopped = true; clearTimeout(t); document.removeEventListener('visibilitychange', onVis); };
  stop.now = () => { if (!stopped) { clearTimeout(t); run(); } }; // run now, then continue on the (re-evaluated) interval
  return stop;
}
