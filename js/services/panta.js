/* =====================================================================
   PANTA SERVICE — the only place Nexis talks to Panta.
   All calls go through /api/panta, which adds PANTA_API_KEY server-side.
   Endpoints (docs.panta.market, base https://live-api.panta.market/api/v1):
     GET  markets/  markets/{id}/  markets/{id}/trades/  categories/  positions/?wallet=  trades/status/?signature=
     POST primaryorderquote/ → primaryorderbuild/ → (wallet signs + sends) → primaryordersubmit/ + trades/report/
     POST markets/create/quote/ → markets/create/build/ → (wallet signs + sends) → markets/create/register/
     POST claim/build/ → (wallet signs + sends)
   Panta publishes no streaming endpoint or price-history endpoint: Nexis polls
   market detail for prices and records the prices it observes (clearly
   labelled) to draw charts.
   ===================================================================== */
const PANTA_CATEGORIES = ['sports', 'crypto', 'politics', 'entertainment', 'finance', 'science', 'world', 'other'];
const PANTA_CAT_LABEL = { sports: 'Sports', crypto: 'Crypto', politics: 'Politics', entertainment: 'Entertainment', finance: 'Finance', science: 'Science', world: 'World', other: 'Other' };

const Panta = {
  markets: new Map(), order: [], state: 'idle', error: null, mode: 'unconfigured', loadedAt: 0, categories: PANTA_CATEGORIES.slice(),
  watched: new Set(), detailAt: {},

  async call(path, { method = 'GET', query, body } = {}) {
    const qs = new URLSearchParams({ path }); for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') qs.set(k, v);
    try {
      const r = await Net.api('panta?' + qs.toString(), { method, body, timeout: 20000 });
      const mode = r._headers && r._headers.get('x-panta-mode'); if (mode) this.mode = mode;
      return r;
    } catch (e) {
      if (e.code === 'PANTA_NOT_CONFIGURED') { this.mode = 'unconfigured'; this.state = 'unconfigured'; Feeds.set('panta', 'unconfigured', e); }
      if (e.status === 429) e.message = 'Panta is rate-limiting requests. Nexis will retry automatically.';
      throw e;
    }
  },
  price(...vals) { for (const v of vals) { if (v === null || v === undefined || v === '') continue; let n = Number(v); if (!Number.isFinite(n)) continue; if (n > 1) n = n / 100; return clamp(n, 0, 1); } return null; },
  norm(raw, prev) {
    const yes = this.price(raw.yesPrice, raw.primaryYesPrice, raw.secondaryYesPrice);
    const no = this.price(raw.noPrice, raw.primaryNoPrice, raw.secondaryNoPrice);
    const status = String(raw.status || '').toLowerCase(), phase = String(raw.phase || '').toLowerCase();
    const m = {
      id: raw.marketId, src: 'panta', ...this.text(raw, prev),
      category: String(raw.category || 'other').toLowerCase(), image: (raw.images || []).find(Boolean) || null,
      phase, status, type: raw.marketType || 'standard', region: raw.region || '',
      start: toMs(raw.startTime), end: toMs(raw.endTime), resolveAt: toMs(raw.resolutionTime),
      resolved: raw.resolved === true || phase === 'resolved' || status === 'resolved', cancelled: phase === 'cancelled' || status === 'cancelled',
      outcome: (raw.outcome || raw.winningSide || raw.result || null) && String(raw.outcome || raw.winningSide || raw.result).toUpperCase(),
      volume: nz(raw.totalVolumeUsdc ?? raw.volumeUsdc, null),
      yes: yes ?? (prev ? prev.yes : null), no: no ?? (yes != null ? 1 - yes : prev ? prev.no : null),
      primaryYes: this.price(raw.primaryYesPrice), secondaryYes: this.price(raw.secondaryYesPrice),
      rule: raw.resolutionRule || raw.rules || '', sources: raw.sourcesOfTruth || [],
      createdByPartner: !!raw.createdByPartner, pricedAt: yes != null ? now() : prev ? prev.pricedAt : null,
    };
    m.tradable = !m.resolved && !m.cancelled && (m.phase === 'primary' || m.status === 'open' || m.phase === '') && (!m.end || m.end > now());
    return m;
  },
  /** Panta's catalogue often ships an empty title; the question may only appear in the detail response.
      A known question is never replaced by an empty one, and questions are remembered in this browser. */
  titles: null,
  titleCache() { if (!this.titles) { try { this.titles = JSON.parse(localStorage.getItem('nexis-panta-titles') || '{}'); } catch (e) { this.titles = {}; } } return this.titles; },
  rememberTitle(id, t) { const c = this.titleCache(); if (c[id] === t) return; c[id] = t; const keys = Object.keys(c); if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(k => delete c[k]); try { localStorage.setItem('nexis-panta-titles', JSON.stringify(c)); } catch (e) {} },
  text(raw, prev) {
    const pick = (...v) => { for (const x of v) { const t = typeof x === 'string' ? x.trim() : ''; if (t) return t; } return ''; };
    const md = raw.metadata || {}, ev = raw.event || {};
    const q = pick(raw.title, raw.question, raw.name, raw.eventTitle, ev.title, ev.question, md.title, md.question);
    const description = pick(raw.description, md.description, ev.description) || (prev && prev.description) || '';
    if (q) this.rememberTitle(raw.marketId, q);
    const known = q || (prev && !prev.untitled && prev.title) || this.titleCache()[raw.marketId] || '';
    const fromDesc = !known && description ? (description.length > 160 ? description.slice(0, 157).trimEnd() + '…' : description) : '';
    return { title: known || fromDesc || 'Untitled Panta market', description, untitled: !known && !fromDesc };
  },
  /** Fetches details for untitled markets (open ones first) so their questions can appear. Throttled; skips recent attempts. */
  titleTried: {},
  async fillTitles(max = 30) {
    if (this._filling || this.state === 'unconfigured') return; this._filling = true; let changed = 0;
    try {
      const ids = this.order.map(id => this.markets.get(id)).filter(m => m && m.untitled && now() - (this.titleTried[m.id] || 0) > 30 * 60e3)
        .sort((a, b) => (b.tradable - a.tradable) || ((b.volume || 0) - (a.volume || 0))).slice(0, max).map(m => m.id);
      for (const id of ids) { this.titleTried[id] = now(); try { const m = await this.detail(id); if (!m.untitled) changed++; } catch (e) { if (e.status === 429) break; } await delay(250); }
    } finally { this._filling = false; if (changed) Bus.emit('panta:catalog'); }
  },
  upsert(raw) {
    const prev = this.markets.get(raw.marketId); const m = this.norm(raw, prev);
    if (prev) { const oldYes = prev.yes; Object.assign(prev, m); if (m.yes != null && m.yes !== oldYes) this.observe(prev, oldYes); return prev; }
    this.markets.set(m.id, m); if (m.yes != null) this.observe(m, null); return m;
  },
  // ---- observed price history (Panta has no history endpoint) ----
  hist(id) { if (!this._h) this._h = {}; if (!this._h[id]) { try { this._h[id] = JSON.parse(localStorage.getItem('nexis-px:' + id) || '[]'); } catch (e) { this._h[id] = []; } } return this._h[id]; },
  observe(m, prevYes) {
    const h = this.hist(m.id); const last = h[h.length - 1];
    if (!last || last[1] !== m.yes || now() - last[0] > 10 * 60e3) { h.push([now(), m.yes]); if (h.length > 600) h.splice(0, h.length - 600); try { localStorage.setItem('nexis-px:' + m.id, JSON.stringify(h)); } catch (e) {} }
    Bus.emit('panta:price', { m, prev: prevYes });
  },

  // ---- reads ----
  async loadCatalog() {
    try {
      const items = []; let cursor = null;
      for (let page = 0; page < 4; page++) {
        const r = await this.call('markets/', { query: { limit: 50, cursor } });
        const rows = Array.isArray(r) ? r : r.items || r.results || [];
        items.push(...rows); cursor = r.nextCursor; if (!cursor || !rows.length) break;
      }
      const seen = new Set(); items.forEach(x => { if (x && x.marketId) { this.upsert(x); seen.add(x.marketId); } });
      this.order = [...seen]; this.state = 'live'; this.error = null; this.loadedAt = now(); Feeds.set('panta', 'live');
      Bus.emit('panta:catalog'); this.fillTitles();
    } catch (e) { this.error = e; if (e.code !== 'PANTA_NOT_CONFIGURED') { this.state = this.markets.size ? 'stale' : 'error'; Feeds.set('panta', this.state === 'stale' ? 'stale' : 'offline', e); } Bus.emit('panta:catalog'); }
  },
  async detail(id) {
    const r = await this.call(`markets/${id}/`); this.detailAt[id] = now();
    const m = this.upsert(r); Bus.emit('panta:market', m); return m;
  },
  async trades(id, limit = 50) {
    const r = await this.call(`markets/${id}/trades/`, { query: { limit } });
    return (r.items || r.trades || (Array.isArray(r) ? r : [])).map(t => {
      const y = nz(t.yesAmount), n = nz(t.noAmount);
      return { id: t.id ?? t.signature, wallet: t.wallet, side: y >= n ? 'YES' : 'NO', amount: Math.max(y, n), fee: nz(t.feePaid), primary: !!t.isPrimary, t: toMs(t.blockTime), sig: t.signature, asset: t.quoteAsset || 'USDC' };
    }).sort((a, b) => (b.t || 0) - (a.t || 0));
  },
  async loadCategories() { try { const r = await this.call('categories/'); const c = Array.isArray(r) ? r : r.categories; if (Array.isArray(c) && c.length) this.categories = c.map(x => String(x).toLowerCase()); } catch (e) {} return this.categories; },
  async positions(wallet) {
    const r = await this.call('positions/', { query: { wallet } });
    return (r.positions || []).map(p => ({ marketId: p.marketId, category: p.category, side: String(p.side || '').toUpperCase(), shares: nz(p.shares), phase: p.phase, claimable: !!p.claimable, claimed: !!p.claimed, outcome: p.outcome ? String(p.outcome).toUpperCase() : null }));
  },
  tradeStatus(signature) { return this.call('trades/status/', { query: { signature } }); },

  // ---- writes (Panta prepares; the user's wallet signs and sends) ----
  quoteBuy({ wallet, marketId, side, amountUsdc }) { return this.call('primaryorderquote/', { method: 'POST', body: { wallet, marketId, side: side.toLowerCase(), amountUsdc } }); },
  buildBuy({ quoteId, wallet, maxSlippageBps = 100 }) { return this.call('primaryorderbuild/', { method: 'POST', body: { quoteId, wallet, maxSlippageBps } }); },
  submitBuy({ orderId, signature, wallet }) { return this.call('primaryordersubmit/', { method: 'POST', body: { orderId, signature, wallet } }); },
  report({ signature, wallet, marketId }) { return this.call('trades/report/', { method: 'POST', body: { signature, wallet, marketId } }); },
  quoteCreate(body) { return this.call('markets/create/quote/', { method: 'POST', body }); },
  buildCreate({ createId, wallet }) { return this.call('markets/create/build/', { method: 'POST', body: { createId, wallet } }); },
  registerCreate({ createId, signature }) { return this.call('markets/create/register/', { method: 'POST', body: { createId, signature } }); },
  buildClaim({ wallet, marketId }) { return this.call('claim/build/', { method: 'POST', body: { wallet, marketId } }); },

  // ---- live updates: catalog every 45s, prices of watched markets every 10s ----
  watch(ids) { ids.filter(Boolean).forEach(id => this.watched.add(id)); },
  unwatchAll() { this.watched.clear(); },
  async refreshWatched() {
    if (this.state === 'unconfigured') return;
    const ids = [...this.watched].filter(id => this.markets.has(id)).sort((a, b) => (this.detailAt[a] || 0) - (this.detailAt[b] || 0)).slice(0, 12);
    for (const id of ids) { try { await this.detail(id); } catch (e) { if (e.status === 429) break; } await delay(120); }
  },
  start() {
    Poller(() => this.loadCatalog(), 45000);
    Poller(() => this.refreshWatched(), 10000, { immediate: false });
  },
};
const pantaYes = (m) => m && m.yes != null ? m.yes : null;
