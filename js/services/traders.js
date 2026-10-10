/* =====================================================================
   TRADER ACTIVITY SERVICE (Trader Tracker)
   Traders are Solana wallets, id "sol:<address>": live
   positions from the positions endpoint (polled 20s), plus the wallet's
   trades from each market's trade history (entry, P&L, volume). (Polymarket accounts,
   "pm:0x…", are no longer tracked; old entries are dropped on start.)
   Changes between polls become activity + notifications. Tracking never
   trades. Copy trading (Panta traders only) turns each new position into a
   ready-to-sign order that you confirm in your own wallet.
   ===================================================================== */
const isPmId = (id) => /^pm:0x[a-f0-9]{40}$/.test(id);
const isSolId = (id) => /^sol:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
const Traders = {
  data: {}, names: {}, loading: {}, seen: {}, lb: null, lbAt: 0,
  list() { return ((Store.s && Store.s.tracked) || []).filter(t => !isPmId(t.id)); },
  entry(id) { return this.list().find(t => t.id === id); },
  isTracked(id) { return !!this.entry(id); },
  track(id, name) { if (this.isTracked(id)) return; Store.s.tracked.unshift({ id, name: name || this.name(id), since: now(), notify: true }); Store.emit('track'); this.load(id); },
  untrack(id) { Store.s.tracked = Store.s.tracked.filter(t => t.id !== id); delete Store.s.copy[id]; Store.emit('track'); },
  name(id) { return this.names[id] || (this.entry(id) || {}).name || shortW(id.split(':')[1]); },
  href(id) { return `#/tracker/${id}`; },
  async load(id) {
    if (this.loading[id]) return this.loading[id];
    const run = (isSolId(id) ? this.loadSol(id) : Promise.reject(new Error('Unknown trader id'))).then(d => { this.diff(id, d); this.data[id] = d; if (d.name) this.names[id] = d.name; return d; });
    this.loading[id] = run;
    try { return await run; } catch (e) { this.data[id] = { ...(this.data[id] || {}), id, error: e.message }; return this.data[id]; } finally { delete this.loading[id]; Bus.emit('trader', id); }
  },
  /** A wallet's trades, read from the trade history of each market it holds or was seen trading (cached 60s per market). */
  _tapes: {},
  async walletTrades(w, mIds) {
    const out = [];
    for (const mId of mIds.slice(0, 15)) {
      let c = this._tapes[mId];
      if (!c || now() - c.at > 60e3) { try { c = this._tapes[mId] = { at: now(), list: await Panta.trades(mId, 200) }; } catch (e) { c = c || { at: now(), list: [] }; } }
      c.list.forEach(t => { if (t.wallet === w) out.push({ ...t, mId }); });
    }
    return out.sort((a, b) => (b.t || 0) - (a.t || 0));
  },
  async loadSol(id) {
    const w = id.slice(4); const pos = await Panta.positions(w);
    const seen = [...new Set(Object.entries(PantaTape.byMarket).filter(([, L]) => L.some(t => t.wallet === w)).map(([m]) => m))];
    const mIds = [...new Set([...pos.map(p => p.marketId), ...seen])];
    const missing = mIds.filter(m => !Panta.markets.has(m)).slice(0, 10); for (const m of missing) { try { await Panta.detail(m); } catch (e) {} }
    const trades = await this.walletTrades(w, mIds);
    const cost = {}; trades.forEach(t => { const k = t.mId + ':' + t.side; cost[k] = (cost[k] || 0) + t.amount; });
    const title = (m) => { const x = Panta.markets.get(m); return x ? x.title : 'Market ' + shortW(m); };
    const positions = pos.filter(p => p.shares > 0).map(p => {
      const m = Panta.markets.get(p.marketId); const key = p.marketId + ':' + p.side; let c = cost[key] || null; if (c && !(c / p.shares > 0 && c / p.shares <= 1)) c = null; // trades found don't match the shares held (e.g. partly sold): cost unknown
      const cur = p.outcome ? (p.outcome === p.side ? 1 : 0) : m ? (p.side === 'YES' ? m.yes : m.no) : null;
      const value = cur != null ? cur * p.shares : null;
      return { key, mId: p.marketId, title: title(p.marketId), outcome: p.side, side: p.side, entry: c ? c / p.shares : null, cost: c, cur, shares: p.shares, value, pnl: c != null && value != null ? value - c : null, phase: p.phase, claimable: p.claimable, claimed: p.claimed, result: p.outcome };
    });
    const open = positions.filter(p => !p.result), closed = positions.filter(p => p.result);
    const sum = (L, f) => L.reduce((s, p) => s + (f(p) || 0), 0); const withCost = positions.filter(p => p.cost);
    const unreal = open.some(p => p.pnl != null) ? sum(open, p => p.pnl) : null;
    const realized = closed.some(p => p.pnl != null) ? sum(closed, p => p.pnl) : null;
    const totalCost = sum(withCost, p => p.cost);
    const tradeLog = trades.slice(0, 100).map(t => ({ id: t.sig || t.id, tid: id, t: t.t, kind: 'open', text: `Bought ${t.side} · ${usd(t.amount, 2)} · ${title(t.mId)}`, title: title(t.mId), side: t.side, outcome: t.side, usd: t.amount, mId: t.mId, fromTape: true }));
    const prevLog = (this.data[id] && this.data[id].activity) || (Store.s.trackerLog || []).filter(x => x.tid === id).map(x => ({ ...x }));
    return { id, src: 'sol', name: this.names[id] || shortW(w), wallet: w, positions: open, closed, activity: prevLog, trades: tradeLog, perf: [],
      stats: { value: sum(open, p => p.value), unreal, realized, winRate: closed.length ? Math.round(closed.filter(p => p.result === p.side).length / closed.length * 100) : null, roi: totalCost ? (sum(withCost, p => p.pnl)) / totalCost * 100 : null,
        trades: trades.length || null, volume: trades.length ? sum(trades, t => t.amount) : null, active: new Set(open.map(p => p.mId)).size, claimable: positions.filter(p => p.claimable && !p.claimed).length }, t: now() };
  },
  diff(id, d) {
    const old = this.data[id]; if (!old || !old.positions || old.error) return;
    const o = new Map(old.positions.map(p => [p.key, p])), n = new Map(d.positions.map(p => [p.key, p]));
    n.forEach((p, k) => { const b = o.get(k); if (!b) this.announce(id, d.name, { kind: 'open', title: p.title, outcome: p.side, side: p.side, shares: p.shares, mId: p.mId, price: p.cur }); else if (Math.abs(p.shares - b.shares) > 1e-6) this.announce(id, d.name, { kind: 'resize', title: p.title, outcome: p.side, side: p.side, shares: p.shares - b.shares, mId: p.mId, price: p.cur }); });
    o.forEach((b, k) => { if (!n.has(k)) this.announce(id, d.name, { kind: 'close', title: b.title, outcome: b.side, side: b.side, shares: -b.shares, mId: b.mId }); });
    d.activity = (Store.s.trackerLog || []).filter(x => x.tid === id);
  },
  announce(id, name, a) {
    const e = this.entry(id); if (!e) return; const nm = '@' + (name || this.name(id));
    const amt = a.usd != null ? ` · ${usd(a.usd, 0)}${a.price ? ' at ' + cents(a.price) : ''}` : a.shares != null ? ` · ${a.shares > 0 ? '+' : '−'}${fmtNum(Math.abs(a.shares))} shares` : '';
    const sports = /\bvs\.?\b/i.test(a.title || '');
    const txt = a.kind === 'open' ? (sports ? `${nm} entered ${a.title} (${a.outcome})${amt}` : `${nm} opened a ${String(a.outcome).toUpperCase()} position on ${a.title}${amt}`)
      : a.kind === 'close' ? `${nm} closed a position${a.pnl != null ? ' for ' + sUsd(a.pnl, 0) : ''} · ${a.title}` : `${nm} changed position size on ${a.title}${amt}`;
    const item = { id: uid('tl'), tid: id, t: a.t || now(), kind: a.kind, text: txt, title: a.title, side: a.side, outcome: a.outcome, price: a.price, usd: a.usd, pnl: a.pnl, shares: a.shares, mId: a.mId };
    Store.s.trackerLog.unshift(item); Store.s.trackerLog = Store.s.trackerLog.slice(0, 300);
    if (e.notify) Notify.push({ kind: 'tracked', icon: a.kind === 'open' ? 'trend' : a.kind === 'close' ? 'flag' : 'sliders', text: esc(txt), href: this.href(id), toast: true, title: a.kind === 'open' ? 'New position' : a.kind === 'close' ? 'Position closed' : 'Position changed', setting: 'notifyTracked' });
    const cp = Store.s.copy[id];
    if (cp && cp.on && a.mId && (a.kind === 'open' || (a.kind === 'resize' && a.shares > 0))) {
      const amt2 = Math.min(cp.max || 10, cp.max || 10);
      toast({ title: `Mirror @${name || this.name(id)}?`, body: `${esc(a.side)} on ${esc(a.title)} · up to ${usd(amt2, 0)} — you confirm in your wallet`, kind: 'info', ms: 20000, action: { label: 'Review order', href: `#/market/${a.mId}?side=${a.side}&amt=${amt2}` } });
    }
    Store.emit('tracker'); Bus.emit('tracker', item);
  },
  pantaActive() { const by = {}; Object.values(PantaTape.byMarket).flat().forEach(t => { if (!t.wallet) return; const r = by[t.wallet] = by[t.wallet] || { id: 'sol:' + t.wallet, name: shortW(t.wallet), n: 0, amt: 0 }; r.n++; r.amt += t.amount; }); return Object.values(by).sort((a, b) => b.amt - a.amt).slice(0, 10); },
  async search(q) {
    q = q.trim(); if (q.length < 2) return []; const out = []; const add = (r) => { if (!out.some(x => x.id === r.id)) out.push(r); };
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) add({ id: 'sol:' + q, name: shortW(q), src: 'sol', sub: 'Solana wallet' });
    this.pantaActive().filter(r => r.id.slice(4).toLowerCase().startsWith(q.toLowerCase())).forEach(r => add({ id: r.id, name: r.name, src: 'sol', sub: `Active trader · ${r.n} recent trade${r.n === 1 ? '' : 's'}` }));
    out.forEach(r => this.names[r.id] = this.names[r.id] || r.name); return out.slice(0, 12);
  },
  async poll() { this.purgePm(); const ids = [...new Set([...this.list().map(t => t.id), ...(current.route === 'tracker' && current.arg ? [current.arg] : [])])]; for (const id of ids) { await this.load(id); await delay(250); } },
  /** Drops Polymarket traders tracked before the tracker became Panta-only. */
  purgePm() { const S = Store.s; if (!S || !(S.tracked || []).some(t => isPmId(t.id))) return; S.tracked = S.tracked.filter(t => !isPmId(t.id)); Object.keys(S.copy || {}).forEach(k => { if (isPmId(k)) delete S.copy[k]; }); S.trackerLog = (S.trackerLog || []).filter(x => !isPmId(x.tid || '')); Store.save(); },
  start() { this.purgePm(); Poller(() => this.poll(), 20000, { immediate: false }); setTimeout(() => this.poll(), 2500); },
};
/* Panta trade tapes Nexis has loaded (market pages, home), used for the live activity feed and trader discovery. */
const PantaTape = {
  byMarket: {},
  async load(id) { const list = await Panta.trades(id, 50); const known = new Set((this.byMarket[id] || []).map(t => t.sig)); const fresh = list.filter(t => !known.has(t.sig)); this.byMarket[id] = list; if (fresh.length && known.size) Bus.emit('panta:trades', { id, fresh }); return list; },
  all() { return Object.entries(this.byMarket).flatMap(([id, l]) => l.map(t => ({ ...t, mId: id }))).sort((a, b) => (b.t || 0) - (a.t || 0)); },
  async sweep() { const ids = Panta.order.filter(id => { const m = Panta.markets.get(id); return m && !m.resolved; }).slice(0, 6); for (const id of ids) { try { await this.load(id); } catch (e) { if (e.status === 429) break; } await delay(300); } Bus.emit('panta:tape'); },
  start() { Poller(() => Panta.state === 'live' && this.sweep(), 30000, { immediate: false }); Bus.on('panta:catalog', () => { if (!this._first && Panta.state === 'live') { this._first = true; this.sweep(); } }); },
};
