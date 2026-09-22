/* =====================================================================
   TRADER ACTIVITY SERVICE (Trader Tracker)
   Two kinds of real traders:
     pm:<0x wallet>   Polymarket accounts — public positions, entries, P&L,
                      closed positions and activity (Data API, polled 20s)
     sol:<address>    Panta traders (Solana wallets) — live positions from
                      Panta's positions endpoint (polled 30s). Panta doesn't
                      publish per-wallet entry prices, so P&L shows "—".
   Changes between polls become activity + notifications. Tracking never
   trades. Copy trading (Panta traders only) turns each new position into a
   ready-to-sign order that you confirm in your own wallet.
   ===================================================================== */
const isPmId = (id) => /^pm:0x[a-f0-9]{40}$/.test(id);
const isSolId = (id) => /^sol:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
const Traders = {
  data: {}, names: {}, loading: {}, seen: {}, lb: null, lbAt: 0,
  list() { return (Store.s && Store.s.tracked) || []; },
  entry(id) { return this.list().find(t => t.id === id); },
  isTracked(id) { return !!this.entry(id); },
  track(id, name) { if (this.isTracked(id)) return; Store.s.tracked.unshift({ id, name: name || this.name(id), since: now(), notify: true }); Store.emit('track'); this.load(id); },
  untrack(id) { Store.s.tracked = Store.s.tracked.filter(t => t.id !== id); delete Store.s.copy[id]; Store.emit('track'); },
  name(id) { return this.names[id] || (this.entry(id) || {}).name || shortW(id.split(':')[1]); },
  href(id) { return `#/tracker/${id}`; },
  async load(id) {
    if (this.loading[id]) return this.loading[id];
    const run = (isPmId(id) ? this.loadPm(id) : isSolId(id) ? this.loadSol(id) : Promise.reject(new Error('Unknown trader id'))).then(d => { this.diff(id, d); this.data[id] = d; if (d.name) this.names[id] = d.name; return d; });
    this.loading[id] = run;
    try { return await run; } catch (e) { this.data[id] = { ...(this.data[id] || {}), id, error: e.message }; return this.data[id]; } finally { delete this.loading[id]; Bus.emit('trader', id); }
  },
  async loadPm(id) {
    const w = id.slice(3);
    const [prof, pos, closed, act, val, trd] = await Promise.allSettled([
      Net.data(`${GAMMA}/public-profile?address=${w}`), Net.data(`${PDATA}/positions?user=${w}&sizeThreshold=0.1&limit=100&sortBy=CURRENT&sortDirection=DESC`),
      Net.data(`${PDATA}/closed-positions?user=${w}&limit=100`), Net.data(`${PDATA}/activity?user=${w}&limit=100`), Net.data(`${PDATA}/value?user=${w}`), Net.data(`${PDATA}/traded?user=${w}`),
    ]);
    const ok = (r) => r.status === 'fulfilled' ? r.value : null;
    if (!ok(pos) && !ok(act)) throw new Error((pos.reason && pos.reason.message) || 'Polymarket data is unavailable right now.');
    const P = ok(prof), a0 = (ok(act) || [])[0] || {};
    const positions = (ok(pos) || []).map(p => ({ key: p.asset, cid: p.conditionId, title: p.title, outcome: p.outcome, side: +p.outcomeIndex === 0 ? 'YES' : 'NO', entry: nz(p.avgPrice), cur: nz(p.curPrice), shares: nz(p.size), value: nz(p.currentValue), cost: nz(p.initialValue), pnl: nz(p.cashPnl), pnlPct: nz(p.percentPnl), real: nz(p.realizedPnl), slug: p.eventSlug || p.slug })).filter(p => p.shares > .01);
    const cl = (ok(closed) || []).map(p => ({ title: p.title, outcome: p.outcome, side: +p.outcomeIndex === 0 ? 'YES' : 'NO', entry: nz(p.avgPrice), shares: nz(p.totalBought), pnl: nz(p.realizedPnl), t: toMs(p.timestamp) })).sort((x, y) => (y.t || 0) - (x.t || 0));
    const activity = (ok(act) || []).map(x => ({ key: [x.transactionHash, x.asset, x.type, x.size, x.timestamp].join('|'), t: toMs(x.timestamp), type: x.type, sideTx: x.side, title: x.title, outcome: x.outcome, side: +x.outcomeIndex === 0 ? 'YES' : 'NO', price: nz(x.price), usd: nz(x.usdcSize) || nz(x.size) * nz(x.price), size: nz(x.size), asset: x.asset, cid: x.conditionId, tx: x.transactionHash })).sort((x, y) => (y.t || 0) - (x.t || 0));
    const unreal = positions.reduce((s, p) => s + p.pnl, 0), realized = cl.reduce((s, p) => s + p.pnl, 0) + positions.reduce((s, p) => s + p.real, 0);
    const wins = cl.filter(p => p.pnl > 0).length, cost = cl.reduce((s, p) => s + p.entry * p.shares, 0) + positions.reduce((s, p) => s + p.cost, 0);
    const V = ok(val), value = Array.isArray(V) ? nz(V[0] && V[0].value, NaN) : nz(V && V.value, NaN), T = ok(trd);
    const perf = []; let run = 0; [...cl].reverse().forEach(p => { run += p.pnl; perf.push([p.t, run]); }); if (perf.length) perf.push([now(), run + unreal]);
    return { id, src: 'pm', name: (P && (P.name || P.pseudonym)) || a0.name || a0.pseudonym || this.names[id] || shortW(w), wallet: w, img: P && P.profileImage, bio: P && P.bio, since: P && toMs(P.createdAt), positions, closed: cl, activity, perf,
      stats: { value: Number.isFinite(value) ? value : positions.reduce((s, p) => s + p.value, 0), unreal, realized, winRate: cl.length ? Math.round(wins / cl.length * 100) : null, closedN: cl.length, roi: cost ? (realized + unreal) / cost * 100 : null, trades: T && T.traded != null ? nz(T.traded) : null, volume: activity.filter(a => a.type === 'TRADE').reduce((s, a) => s + a.usd, 0), active: new Set(positions.map(p => p.cid)).size }, t: now() };
  },
  async loadSol(id) {
    const w = id.slice(4); const pos = await Panta.positions(w);
    const missing = pos.filter(p => !Panta.markets.has(p.marketId)).slice(0, 10); for (const p of missing) { try { await Panta.detail(p.marketId); } catch (e) {} }
    const positions = pos.filter(p => p.shares > 0).map(p => { const m = Panta.markets.get(p.marketId); const cur = m ? (p.side === 'YES' ? m.yes : m.no) : null; return { key: p.marketId + ':' + p.side, mId: p.marketId, title: m ? m.title : shortW(p.marketId), outcome: p.side, side: p.side, entry: null, cur, shares: p.shares, value: cur != null ? cur * p.shares : null, pnl: null, phase: p.phase, claimable: p.claimable, claimed: p.claimed, result: p.outcome }; });
    const prevLog = (this.data[id] && this.data[id].activity) || (Store.s.trackerLog || []).filter(x => x.tid === id).map(x => ({ ...x }));
    return { id, src: 'sol', name: this.names[id] || shortW(w), wallet: w, positions, closed: positions.filter(p => p.result), activity: prevLog, perf: [],
      stats: { value: positions.reduce((s, p) => s + (p.value || 0), 0), unreal: null, realized: null, winRate: null, roi: null, trades: null, volume: null, active: new Set(positions.map(p => p.mId)).size, claimable: positions.filter(p => p.claimable && !p.claimed).length }, t: now() };
  },
  diff(id, d) {
    const old = this.data[id]; if (!old || !old.positions || old.error) { if (d.src === 'pm') { const s = this.seen[id] = this.seen[id] || new Set(); d.activity.forEach(a => s.add(a.key)); } return; }
    if (d.src === 'pm') {
      const s = this.seen[id] = this.seen[id] || new Set(); const oldPos = new Map(old.positions.map(p => [p.key, p])), newPos = new Map(d.positions.map(p => [p.key, p]));
      d.activity.filter(a => !s.has(a.key)).reverse().forEach(a => {
        s.add(a.key); if (!['TRADE', 'REDEEM'].includes(a.type)) return;
        const before = oldPos.get(a.asset), after = newPos.get(a.asset); let kind, pnl = null, delta = null;
        if (a.type === 'REDEEM') { kind = 'close'; pnl = before ? a.usd - before.cost : null; }
        else if (a.sideTx === 'BUY') { kind = before ? 'resize' : 'open'; delta = a.usd; }
        else { kind = after ? 'resize' : 'close'; delta = -a.usd; if (!after && before) pnl = (a.price - before.entry) * a.size; }
        this.announce(id, d.name, { kind, title: a.title, outcome: a.outcome, side: a.side, price: a.price, usd: a.usd, pnl, delta, t: a.t });
      });
    } else {
      const o = new Map(old.positions.map(p => [p.key, p])), n = new Map(d.positions.map(p => [p.key, p]));
      n.forEach((p, k) => { const b = o.get(k); if (!b) this.announce(id, d.name, { kind: 'open', title: p.title, outcome: p.side, side: p.side, shares: p.shares, mId: p.mId, price: p.cur }); else if (Math.abs(p.shares - b.shares) > 1e-6) this.announce(id, d.name, { kind: 'resize', title: p.title, outcome: p.side, side: p.side, shares: p.shares - b.shares, mId: p.mId, price: p.cur }); });
      o.forEach((b, k) => { if (!n.has(k)) this.announce(id, d.name, { kind: 'close', title: b.title, outcome: b.side, side: b.side, shares: -b.shares, mId: b.mId }); });
      d.activity = (Store.s.trackerLog || []).filter(x => x.tid === id);
    }
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
  async leaderboard() {
    if (this.lbAt && now() - this.lbAt < (this.lb ? 5 * 60e3 : 30e3)) return this.lb; this.lbAt = now();
    try { const j = await Net.data(`${PDATA}/v1/leaderboard?timePeriod=WEEK&orderBy=PNL&limit=15`); const rows = (Array.isArray(j) ? j : j.data || j.leaderboard || []).map(r => ({ id: 'pm:' + String(r.proxyWallet || r.user || '').toLowerCase(), name: r.userName || r.name || r.pseudonym || shortW(r.proxyWallet || r.user), img: r.profileImage, pnl: nz(r.pnl ?? r.amount, null), vol: nz(r.vol ?? r.volume, null) })).filter(r => isPmId(r.id)); if (!rows.length) throw new Error('empty'); this.lb = { rows, src: 'Polymarket weekly P&L leaderboard' }; }
    catch (e) { const by = {}; Poly.trades.forEach(t => { if (!t.wallet) return; const r = by[t.wallet] = by[t.wallet] || { id: 'pm:' + t.wallet, name: t.who, img: t.img, vol: 0 }; r.vol += t.usd; }); const rows = Object.values(by).sort((a, b) => b.vol - a.vol).slice(0, 12); this.lb = rows.length ? { rows, src: 'Most active in the live trades tape' } : null; }
    (this.lb ? this.lb.rows : []).forEach(r => this.names[r.id] = this.names[r.id] || r.name); return this.lb;
  },
  pantaActive() { const by = {}; Object.values(PantaTape.byMarket).flat().forEach(t => { if (!t.wallet) return; const r = by[t.wallet] = by[t.wallet] || { id: 'sol:' + t.wallet, name: shortW(t.wallet), n: 0, amt: 0 }; r.n++; r.amt += t.amount; }); return Object.values(by).sort((a, b) => b.amt - a.amt).slice(0, 10); },
  async search(q) {
    q = q.trim(); if (q.length < 2) return []; const out = []; const add = (r) => { if (!out.some(x => x.id === r.id)) out.push(r); };
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) add({ id: 'pm:' + q.toLowerCase(), name: this.names['pm:' + q.toLowerCase()] || shortW(q), src: 'pm', sub: 'Polymarket account' });
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) add({ id: 'sol:' + q, name: shortW(q), src: 'sol', sub: 'Solana wallet · Panta positions' });
    Poly.trades.filter(t => t.wallet && (t.who || '').toLowerCase().includes(q.toLowerCase())).forEach(t => add({ id: 'pm:' + t.wallet, name: t.who, img: t.img, src: 'pm', sub: 'Traded on Polymarket in the last few minutes' }));
    try { const j = await Net.data(`${GAMMA}/public-search?q=${encodeURIComponent(q)}&search_profiles=true&limit_per_type=8`); (j.profiles || []).forEach(p => p.proxyWallet && add({ id: 'pm:' + p.proxyWallet.toLowerCase(), name: p.name || p.pseudonym || shortW(p.proxyWallet), img: p.profileImage, src: 'pm', sub: 'Polymarket trader' })); } catch (e) {}
    out.forEach(r => this.names[r.id] = this.names[r.id] || r.name); return out.slice(0, 12);
  },
  async poll() { const ids = [...new Set([...this.list().map(t => t.id), ...(current.route === 'tracker' && current.arg ? [current.arg] : [])])]; for (const id of ids) { await this.load(id); await delay(250); } },
  start() { Poller(() => this.poll(), 20000, { immediate: false }); setTimeout(() => this.poll(), 2500); },
};
/* Panta trade tapes Nexis has loaded (market pages, home), used for the live activity feed and trader discovery. */
const PantaTape = {
  byMarket: {},
  async load(id) { const list = await Panta.trades(id, 50); const known = new Set((this.byMarket[id] || []).map(t => t.sig)); const fresh = list.filter(t => !known.has(t.sig)); this.byMarket[id] = list; if (fresh.length && known.size) Bus.emit('panta:trades', { id, fresh }); return list; },
  all() { return Object.entries(this.byMarket).flatMap(([id, l]) => l.map(t => ({ ...t, mId: id }))).sort((a, b) => (b.t || 0) - (a.t || 0)); },
  async sweep() { const ids = Panta.order.filter(id => { const m = Panta.markets.get(id); return m && !m.resolved; }).slice(0, 6); for (const id of ids) { try { await this.load(id); } catch (e) { if (e.status === 429) break; } await delay(300); } Bus.emit('panta:tape'); },
  start() { Poller(() => Panta.state === 'live' && this.sweep(), 30000, { immediate: false }); Bus.on('panta:catalog', () => { if (!this._first && Panta.state === 'live') { this._first = true; this.sweep(); } }); },
};
