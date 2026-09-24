/* =====================================================================
   POLYMARKET SECTION — trade Polymarket markets with your own EVM wallet.
   Separate from Panta. #/polymarket (account + markets) and
   #/polymarket/<pm-id> (market trading page).
   ===================================================================== */
UI.pm = { tab: 'Markets', q: '', trade: {} };
const pmReadyNote = () => PMTrade.ready ? '' : `<div class="sim-note" style="margin-bottom:12px">${ic('info', 'sm')}<span>Finish setup to trade: ${!PMTrade.address ? 'connect a wallet' : !PMTrade.chainOk ? 'switch to Polygon' : !PMTrade.creds ? 'enable trading' : !PMTrade.approved ? 'approve Polymarket’s contracts' : 'check your region'}. <a class="link" style="display:inline" href="#/polymarket">Open setup</a></span></div>`;
function pmStep(done, title, body, action = '') { return `<div class="row" style="gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);align-items:flex-start"><span class="gi" style="${done ? 'background:var(--green);color:#03140B' : ''}">${done ? ic('check', 'sm') : ''}</span><div style="flex:1;min-width:0"><b style="font-size:13.5px">${title}</b><div class="mut" style="font-size:12.5px;margin-top:2px">${body}</div></div>${action}</div>`; }
function pmSetupCard() {
  const P = PMTrade; const b = P.bal; const geo = P.geo;
  const walletBtns = P.wallets.length ? P.wallets.map(w => `<button class="btn btn-ghost sm" data-action="pmConnect" data-id="${esc(w.info.uuid)}">${w.info.icon && /^data:image\//.test(w.info.icon) ? `<img src="${esc(w.info.icon)}" alt="" width="16" height="16">` : ic('wallet', 'sm')}${esc(w.info.name)}</button>`).join('') : `<a class="btn btn-ghost sm" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask ${ic('ext', 'sm')}</a>`;
  return `<div class="card"><div class="card-head"><h3>${ic('wallet', 'sm')}Your Polymarket account</h3>${P.address ? `<button class="link" data-action="pmDisconnect">Disconnect</button>` : ''}</div>
    ${geo && geo.blocked ? `<div class="card-pad">${unavailable('Polymarket isn’t available in your region', `Polymarket reports your location${geo.country ? ' (' + esc(geo.country) + (geo.region ? '-' + esc(geo.region) : '') + ')' : ''} as restricted, so trading is disabled here. You can still browse markets.`)}</div>` : ''}
    ${pmStep(!!P.address, 'Connect an EVM wallet', P.address ? `<span class="num">${esc(shortW(P.address))}</span> · <button class="link" style="display:inline" data-action="copyAddr" data-a="${esc(P.address)}">Copy</button> · <a class="link" style="display:inline" href="${polygonAddr(P.address)}" target="_blank" rel="noopener">Polygonscan</a>` : 'MetaMask, Rabby, Coinbase Wallet or any wallet that supports Polygon. Your Solana wallet isn’t used here.', P.address ? '' : `<div class="row wrap" style="gap:6px;justify-content:flex-end">${walletBtns}</div>`)}
    ${P.address ? pmStep(P.chainOk, 'Polygon network', P.chainOk ? 'Connected to Polygon.' : 'Polymarket runs on Polygon. Your wallet will ask to switch.', P.chainOk ? '' : '<button class="btn btn-primary sm" data-action="pmSwitch">Switch</button>') : ''}
    ${P.address && P.chainOk ? pmStep(!!P.creds, 'Enable trading', P.creds ? 'Trading credentials ready. <button class="link" style="display:inline" data-action="pmResetCreds">Reset</button>' : 'Sign a free message (no transaction) to create your Polymarket trading credentials.', P.creds ? '' : '<button class="btn btn-primary sm" data-action="pmEnable">Sign</button>') : ''}
    ${P.address && P.chainOk ? pmStep(P.approved, 'Approve Polymarket’s contracts', P.approvals ? (P.approved ? 'USDC and outcome shares approved.' : `${P.approvals.reduce((n, a) => n + !a.usdc + !a.ctf, 0)} one-time approval transaction(s), paid in POL (a few cents each).`) : P.chainErr ? esc(P.chainErr) : 'Checking…', P.approvals && !P.approved ? '<button class="btn btn-primary sm" data-action="pmApprove">Approve</button>' : '') : ''}
    ${P.address && P.chainOk ? pmStep(!!(b && b.usdc > 0), 'Fund with USDC on Polygon', b ? `<span class="num">${fmtNum(b.usdc, 2)}</span> USDC.e · <span class="num">${fmtNum(b.pol, 4)}</span> POL for gas${b.pol < 0.05 ? ' · <span style="color:var(--amber)">low on POL</span>' : ''} · <button class="link" style="display:inline" data-action="pmRefresh">Refresh</button><div style="margin-top:4px">Polymarket settles in USDC.e (bridged USDC) on Polygon. Send it to your address above.</div>` : 'Checking balances…') : ''}
    <p class="mut" style="font-size:11.5px;padding:10px 18px">Orders are signed in your wallet and sent from this browser directly to Polymarket. Nexis never holds your keys or funds. Trading involves risk of loss.</p></div>`;
}
function pmMarketRows(list) {
  if (!list.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${Poly.state === 'offline' ? 'Polymarket markets are unavailable right now.' : Poly.markets.size ? 'No markets match.' : 'Loading markets…'}</p>`;
  return list.map(m => `<a class="row" href="#/polymarket/${m.id}" style="padding:11px 18px;border-bottom:1px solid var(--line);gap:12px">${m.image ? `<img src="${esc(m.image)}" alt="" width="34" height="34" style="border-radius:8px;flex:none;object-fit:cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span style="flex:1;min-width:0"><b style="font-size:13.5px;font-weight:550">${esc(m.q)}</b><div class="mut" style="font-size:11.5px">${esc(catLabel(m.cat))} · ${kusd(m.vol)} vol${m.end ? ' · ' + timeLeft(m.end) + ' left' : ''}</div></span><span class="num up" data-ly="${m.id}" style="font-size:14px">${cents(m.yes)}</span><span class="num down" data-ln="${m.id}" style="font-size:14px">${cents(1 - m.yes)}</span></a>`).join('');
}
function pmPositionsHtml() {
  const L = PMTrade.positions; if (!PMTrade.address) return '<p class="mut" style="padding:14px 18px;font-size:13px">Connect a wallet to see your positions.</p>';
  if (!L) return '<p class="mut" style="padding:14px 18px;font-size:13px">Loading positions…</p>';
  if (!L.length) return emptyState({ icon: 'brief', title: 'No Polymarket positions', body: 'Positions held by this wallet appear here.' });
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Market</th><th>Outcome</th><th class="r">Shares</th><th class="r">Avg</th><th class="r">Price</th><th class="r">Value</th><th class="r">P&amp;L</th><th></th></tr></thead><tbody>${L.map(p => { const m = [...Poly.markets.values()].find(x => x.conditionId === p.cid);
    return `<tr><td class="q" style="max-width:340px;white-space:normal">${m ? `<a href="#/polymarket/${m.id}">${esc(p.title)}</a>` : esc(p.title)}</td><td><span class="tag ${p.idx === 0 ? 'green' : 'red'}">${esc(p.outcome)}</span></td><td class="r num">${fmtNum(p.shares, 2)}</td><td class="r num">${cents(p.avg)}</td><td class="r num">${cents(p.cur)}</td><td class="r num">${usd(p.value)}</td><td class="r">${pnlCell(p.pnl)}</td><td class="r">${p.redeemable ? '<a class="btn btn-ghost sm" href="https://polymarket.com/portfolio" target="_blank" rel="noopener">Redeem ↗</a>' : `<button class="btn btn-ghost sm" data-action="pmSellPos" data-token="${esc(p.asset)}" ${PMTrade.ready ? '' : 'disabled'}>Sell</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function pmOrdersHtml() {
  if (!PMTrade.creds) return '<p class="mut" style="padding:14px 18px;font-size:13px">Enable trading to see your open orders.</p>';
  const L = PMTrade.orders; if (!L) return `<p class="mut" style="padding:14px 18px;font-size:13px">${PMTrade.accountErr ? esc(PMTrade.accountErr) : 'Loading…'}</p>`;
  if (!L.length) return emptyState({ icon: 'list', title: 'No open orders', body: 'Limit orders waiting to fill appear here.' });
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Side</th><th>Outcome</th><th class="r">Price</th><th class="r">Size</th><th class="r">Filled</th><th></th></tr></thead><tbody>${L.map(o => { const m = Poly.byToken.get(String(o.asset_id));
    return `<tr><td class="q" style="max-width:300px;white-space:normal">${m ? esc(m.m.q) : '<span class="num">' + esc(shortW(o.id)) + '</span>'}</td><td>${esc(o.side)}</td><td>${esc(o.outcome || '')}</td><td class="r num">${cents(nz(o.price))}</td><td class="r num">${fmtNum(nz(o.original_size), 2)}</td><td class="r num">${fmtNum(nz(o.size_matched), 2)}</td><td class="r"><button class="btn btn-ghost sm" data-action="pmCancel" data-id="${esc(o.id)}">Cancel</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function pmHistoryHtml() {
  if (!PMTrade.creds) return '<p class="mut" style="padding:14px 18px;font-size:13px">Enable trading to see your trade history.</p>';
  const L = PMTrade.trades; if (!L) return '<p class="mut" style="padding:14px 18px;font-size:13px">Loading…</p>';
  if (!L.length) return emptyState({ icon: 'clock', title: 'No trades yet', body: 'Your fills on Polymarket appear here.' });
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Time</th><th>Side</th><th>Outcome</th><th class="r">Price</th><th class="r">Shares</th><th>Status</th><th></th></tr></thead><tbody>${L.slice(0, 100).map(t => `<tr><td class="mut">${t.match_time ? ago(toMs(t.match_time)) : '—'}</td><td>${esc(t.side)}</td><td>${esc(t.outcome || '')}</td><td class="r num">${cents(nz(t.price))}</td><td class="r num">${fmtNum(nz(t.size), 2)}</td><td><span class="tag ${/CONFIRMED/i.test(t.status) ? 'green' : /FAILED/i.test(t.status) ? 'red' : 'amber'}">${esc(String(t.status || '').toLowerCase())}</span></td><td>${t.transaction_hash ? `<a href="${polygonTx(t.transaction_hash)}" target="_blank" rel="noopener" aria-label="View on Polygonscan">${ic('ext', 'sm')}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

Views.polymarket = async (params, id) => {
  PMTrade.discover(); if (!PMTrade._re) { PMTrade._re = true; await PMTrade.reconnect(); } PMTrade.checkRegion();
  if (Poly.state === 'idle') await Poly.load();
  return id ? pmMarketView(id) : pmHome(params);
};
function pmHome(params) {
  if (params.get('tab')) UI.pm.tab = params.get('tab'); const tab = UI.pm.tab;
  let list = [...Poly.markets.values()]; if (UI.pm.q) list = list.filter(m => m.q.toLowerCase().includes(UI.pm.q.toLowerCase())); list.sort((a, b) => b.vol24 - a.vol24);
  return `<div class="page"><div class="page-head"><div><h1>Polymarket</h1><p>Trade Polymarket’s markets with your own EVM wallet on Polygon. Separate from Panta: different wallet, network and balance.</p></div>${srcBadge('pmtrade')}</div>
    <div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px" id="pm-grid"><div style="min-width:0">
      <div class="tabs">${['Markets', 'Positions', 'Open orders', 'History'].map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-action="pmTab" data-t="${k}">${k}${k === 'Open orders' && PMTrade.orders && PMTrade.orders.length ? ` <span class="mut num">${PMTrade.orders.length}</span>` : ''}</button>`).join('')}</div>
      <div class="card" style="margin-top:14px">${tab === 'Markets' ? `<div style="padding:12px 18px;border-bottom:1px solid var(--line)"><label class="search-trigger" style="max-width:none;cursor:text">${ic('search', 'sm')}<input id="pm-q" value="${esc(UI.pm.q)}" placeholder="Search Polymarket markets" style="background:none;border:0;outline:none;flex:1;height:100%;color:var(--text)" aria-label="Search Polymarket markets"></label></div>${pmMarketRows(list.slice(0, 80))}` : tab === 'Positions' ? pmPositionsHtml() : tab === 'Open orders' ? pmOrdersHtml() : pmHistoryHtml()}</div>
    </div><aside>${pmSetupCard()}</aside></div></div>`;
}
function pmMarketView(id) {
  const m = Poly.markets.get(id);
  if (!m) return `<div class="page"><a class="link" href="#/polymarket">${ic('chevLeft', 'sm')}Polymarket</a><div class="card" style="margin-top:14px">${emptyState({ icon: 'chart', title: 'Market not loaded', body: 'Open it from the Polymarket markets list.' })}</div></div>`;
  const tr = UI.pm.trade[id] = UI.pm.trade[id] || { out: 0, side: 'BUY', kind: 'market', amt: '10', price: '' };
  return `<div class="page"><a class="link" href="#/polymarket">${ic('chevLeft', 'sm')}Polymarket</a>
    <div class="mkt-layout" style="margin-top:12px"><div style="min-width:0">
      <div class="mkt-head">${m.image ? `<img class="mkt-img" src="${esc(m.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div style="min-width:0"><h1>${esc(m.q)}</h1><div class="mkt-meta"><span class="tag">${esc(catLabel(m.cat))}</span>${srcBadge('pmtrade')}${m.end ? `<span>${ic('clock', 'sm')}${timeLeft(m.end)} left</span>` : ''}<a class="link" href="${Poly.url(m)}" target="_blank" rel="noopener">polymarket.com ${ic('ext', 'sm')}</a></div></div></div>
      <div class="price-row"><div><div class="lbl">${esc(m.yesLabel)}</div><div class="big up" data-ly="${id}">${cents(m.yes)}</div></div><div><div class="lbl">${esc(m.noLabel)}</div><div class="big down" data-ln="${id}">${cents(1 - m.yes)}</div></div><div><div class="lbl">Volume</div><div class="num" style="font-size:18px">${kusd(m.vol)}</div></div></div>
      <div class="chart-box" data-chart="poly" data-id="${id}"></div>
      <div class="card" style="margin-top:18px"><div class="card-head"><h3>Order book · ${esc(tr.out === 0 ? m.yesLabel : m.noLabel)}</h3><span class="mut" style="font-size:12px">Live from Polymarket</span></div><div id="pm-book" data-token="${esc(m.tokens[tr.out])}"><p class="mut" style="padding:14px 18px;font-size:13px">Loading order book…</p></div></div>
      <div class="card" style="margin-top:18px"><div class="rules"><div style="grid-column:1/-1"><h4>Rules</h4><p>${esc(m.rule || 'See polymarket.com for the full rules.')}</p></div></div></div>
    </div><aside>
      <div class="card card-pad trade-panel stack" style="gap:12px" id="pm-panel">${pmTradePanel(m, tr)}</div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Your position</h3><a class="link" href="#/polymarket?tab=Positions">All</a></div><div id="pm-mypos">${pmMyPosition(m)}</div></div>
    </aside></div></div>`;
}
function pmMyPosition(m) {
  if (!PMTrade.address) return '<p class="mut" style="padding:14px 18px;font-size:13px">Connect a wallet in the Polymarket section.</p>';
  const ps = m.tokens.map((t, i) => ({ p: PMTrade.position(t), i })).filter(x => x.p);
  if (!ps.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${PMTrade.positions ? 'No position in this market.' : 'Loading…'}</p>`;
  return ps.map(({ p, i }) => `<div class="row" style="padding:12px 18px;border-bottom:1px solid var(--line);gap:10px"><span class="tag ${i === 0 ? 'green' : 'red'}">${esc(p.outcome)}</span><span class="num">${fmtNum(p.shares, 2)} sh</span><span class="num mut">avg ${cents(p.avg)}</span><span style="margin-left:auto">${pnlCell(p.pnl)}</span></div>`).join('');
}
function pmTradePanel(m, tr) {
  const px = tr.out === 0 ? m.yes : 1 - m.yes; const pos = PMTrade.position(m.tokens[tr.out]); const blocked = PMTrade.geo && PMTrade.geo.blocked;
  const amtLabel = tr.kind === 'limit' ? 'Shares' : tr.side === 'BUY' ? 'Amount (USDC)' : 'Shares to sell';
  return `<div class="row"><h3 style="font-size:15px">Trade on Polymarket</h3><span class="mut" style="margin-left:auto;font-size:12px">Polygon · USDC</span></div>
    ${pmReadyNote()}
    <div class="seg text" style="width:100%">${['BUY', 'SELL'].map(s => `<button style="flex:1" class="${tr.side === s ? 'on' : ''}" data-action="pmSide" data-id="${m.id}" data-v="${s}">${s === 'BUY' ? 'Buy' : 'Sell'}</button>`).join('')}</div>
    <div class="side-toggle">${[0, 1].map(i => `<button class="btn ${i === 0 ? 'btn-yes' : 'btn-no'} ${tr.out === i ? 'on' : ''}" data-action="pmOut" data-id="${m.id}" data-v="${i}"><span>${esc(i === 0 ? m.yesLabel : m.noLabel)}</span><b data-l${i === 0 ? 'y' : 'n'}="${m.id}">${cents(i === 0 ? m.yes : 1 - m.yes)}</b></button>`).join('')}</div>
    <div class="seg text" style="width:100%">${[['market', 'Market'], ['limit', 'Limit']].map(([k, l]) => `<button style="flex:1" class="${tr.kind === k ? 'on' : ''}" data-action="pmKind" data-id="${m.id}" data-v="${k}">${l}</button>`).join('')}</div>
    ${tr.kind === 'limit' ? `<label class="field"><span>Limit price (¢)</span><input class="input" data-pm="price" data-id="${m.id}" inputmode="decimal" value="${esc(tr.price || Math.round(px * 100))}"></label>` : ''}
    <label class="field"><span>${amtLabel}</span><input class="input" data-pm="amt" data-id="${m.id}" inputmode="decimal" value="${esc(tr.amt)}"></label>
    <div class="est"><div><span>Current price</span><span>${cents(px)}</span></div>${tr.side === 'SELL' ? `<div><span>Shares you hold</span><span>${pos ? fmtNum(pos.shares, 2) : '0'}</span></div>` : `<div><span>USDC balance</span><span>${PMTrade.bal ? fmtNum(PMTrade.bal.usdc, 2) : '—'}</span></div>`}</div>
    <button class="btn ${tr.side === 'BUY' ? 'btn-yes on' : 'btn-no on'} lg block" data-action="pmReview" data-id="${m.id}" ${PMTrade.ready && !blocked ? '' : 'disabled'}>Review ${tr.side === 'BUY' ? 'buy' : 'sell'}</button>
    <p class="mut" style="font-size:11.5px;line-height:1.45">${tr.kind === 'market' ? 'Market orders fill immediately at the best available prices or not at all.' : 'Limit orders wait in the order book until someone matches your price. Cancel any time.'} Each share pays $1 if its outcome wins.</p>`;
}
async function pmPaintBook() {
  const box = $('#pm-book'); if (!box) return; const tok = box.dataset.token;
  try {
    const b = await PMTrade.book(tok); if (!$('#pm-book') || $('#pm-book').dataset.token !== tok) return;
    const bids = (b.bids || []).map(x => [nz(x.price), nz(x.size)]).sort((a, c) => c[0] - a[0]).slice(0, 6), asks = (b.asks || []).map(x => [nz(x.price), nz(x.size)]).sort((a, c) => a[0] - c[0]).slice(0, 6);
    const row = (x, cls) => `<div class="row" style="justify-content:space-between;padding:4px 18px;font-size:12.5px"><span class="num ${cls}">${cents(x[0])}</span><span class="num mut">${fmtNum(x[1], 0)}</span></div>`;
    box.innerHTML = bids.length || asks.length ? `<div class="grid g2" style="gap:0;padding:8px 0"><div><div class="mut" style="font-size:11.5px;padding:0 18px 4px">Bids (buyers)</div>${bids.map(x => row(x, 'up')).join('') || '<p class="mut" style="padding:4px 18px;font-size:12px">None</p>'}</div><div><div class="mut" style="font-size:11.5px;padding:0 18px 4px">Asks (sellers)</div>${asks.map(x => row(x, 'down')).join('') || '<p class="mut" style="padding:4px 18px;font-size:12px">None</p>'}</div></div>` : '<p class="mut" style="padding:14px 18px;font-size:13px">The order book is empty.</p>';
  } catch (e) { box.innerHTML = `<p class="mut" style="padding:14px 18px;font-size:13px">Order book unavailable: ${esc(PMTrade.msg(e))}</p>`; }
}

/* ---------- order review & placement ---------- */
function pmOrderSpec(m, tr) {
  const amount = nz(String(tr.amt).replace(/[^0-9.]/g, ''), 0); const price = tr.kind === 'limit' ? nz(String(tr.price).replace(/[^0-9.]/g, ''), 0) / 100 : null;
  return { m, tokenId: m ? m.tokens[tr.out] : tr.token, outcome: m ? (tr.out === 0 ? m.yesLabel : m.noLabel) : tr.outcome, title: m ? m.q : tr.title, side: tr.side, kind: tr.kind, amount, price };
}
async function pmReview(spec) {
  if (!PMTrade.ready) return toast({ title: 'Finish Polymarket setup first', kind: 'warn', action: { label: 'Open setup', href: '#/polymarket' } });
  if (!(spec.amount > 0)) return toast({ title: 'Enter an amount', kind: 'warn' });
  if (spec.kind === 'limit' && !(spec.price > 0 && spec.price < 1)) return toast({ title: 'Enter a limit price between 1¢ and 99¢', kind: 'warn' });
  if (spec.side === 'BUY' && spec.kind === 'market' && spec.amount < 1) return toast({ title: 'Polymarket’s minimum market buy is $1', kind: 'warn' });
  const pos = PMTrade.position(spec.tokenId);
  if (spec.side === 'SELL' && (!pos || pos.shares + 1e-6 < spec.amount)) return toast({ title: 'You don’t hold that many shares', body: `You hold ${pos ? fmtNum(pos.shares, 2) : 0}.`, kind: 'warn' });
  openModal(`${modalHead('Review order', esc(spec.title))}<div class="modal-body"><div class="pipe">${pipeStep('Getting the current price from the order book', 'run')}</div></div>`);
  let px = spec.price; try { if (spec.kind === 'market') px = await PMTrade.quote({ tokenId: spec.tokenId, side: spec.side, amount: spec.amount }); } catch (e) { return setModal(`${modalHead('Couldn’t price the order')}<div class="modal-body">${emptyState({ icon: 'alert', title: 'No price available', body: esc(PMTrade.msg(e)) })}</div>`); }
  const shares = spec.kind === 'market' && spec.side === 'BUY' ? spec.amount / px : spec.amount; const usdc = spec.kind === 'market' && spec.side === 'BUY' ? spec.amount : shares * px;
  UI.pm.pending = { ...spec, px };
  setModal(`${modalHead('Review order', esc(spec.title))}<div class="modal-body"><div class="order-sum">
    <div><span>Action</span><span class="${spec.side === 'BUY' ? 'up' : 'down'}" style="font-weight:600">${spec.side === 'BUY' ? 'Buy' : 'Sell'} ${esc(spec.outcome)}</span></div>
    <div><span>Type</span><span>${spec.kind === 'market' ? 'Market (fill now or cancel)' : 'Limit (rests in the book)'}</span></div>
    <div><span>${spec.kind === 'market' ? 'Worst price to fill' : 'Limit price'}</span><span>${cents(px)}</span></div>
    <div><span>${spec.side === 'BUY' ? 'Shares (approx.)' : 'Shares'}</span><span>${fmtNum(shares, 2)}</span></div>
    <div><span>${spec.side === 'BUY' ? 'You pay' : 'You receive (approx.)'}</span><span>${fmtNum(usdc, 2)} USDC</span></div>
    ${spec.side === 'BUY' ? `<div><span>Pays if ${esc(spec.outcome)} wins</span><span class="up">${fmtNum(shares, 2)} USDC</span></div>` : ''}
    <div><span>Wallet</span><span class="num">${esc(shortW(PMTrade.address))}</span></div></div>
    <p class="mut" style="font-size:12.5px">Your wallet will ask you to sign the order. Nothing is charged until it matches; settlement happens on Polygon.</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn ${spec.side === 'BUY' ? 'btn-yes on' : 'btn-no on'}" data-action="pmConfirm" autofocus>Sign &amp; place order</button></div>`);
}
async function pmConfirm() {
  const S = UI.pm.pending; if (!S) return; const steps = ['Sign the order in your wallet', 'Send it to Polymarket’s order book', 'Wait for settlement on Polygon'];
  const show = (i, extra = '', fail) => setModal(`${modalHead('Placing order', esc(S.title))}<div class="modal-body">${pipe(steps, i, fail)}${extra}</div>`);
  show(0);
  let r; try { r = await PMTrade.place({ tokenId: S.tokenId, side: S.side, kind: S.kind, amount: S.amount, price: S.px, onStep: (st, h) => show(st === 'sign' ? 0 : st === 'post' ? 1 : 2, h ? `<p class="mut num" style="font-size:12px">Settlement <a class="link" style="display:inline" href="${polygonTx(h)}" target="_blank" rel="noopener">${shortW(h)}</a></p>` : '') }); }
  catch (e) { return show(e.code === 'SIGN' ? 0 : 1, emptyState({ icon: 'alert', title: 'Order not placed', body: esc(e.message) }) + '<button class="btn btn-ghost block" data-action="closeModal">Close</button>', e.code === 'SIGN' ? 0 : 1); }
  UI.pm.pending = null; const txLink = r.tx ? `<a class="btn btn-ghost block" href="${polygonTx(r.tx)}" target="_blank" rel="noopener">View on Polygonscan</a>` : '';
  if (r.final === 'confirmed') { Notify.push({ kind: 'tx', icon: 'check', text: `Polymarket: ${S.side === 'BUY' ? 'bought' : 'sold'} <b>${esc(S.outcome)}</b> · ${esc(S.title)} — confirmed on Polygon`, href: '#/polymarket?tab=History' }); return setModal(`${modalHead('Order filled')}<div class="modal-body"><div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">${S.side === 'BUY' ? 'Bought' : 'Sold'} ${esc(S.outcome)}</h3><p class="dim" style="margin-top:4px">Settled and confirmed on Polygon.</p></div>${txLink}</div><div class="modal-foot"><button class="btn btn-primary" data-action="closeModal">Done</button></div>`); }
  if (r.final === 'resting') return setModal(`${modalHead('Limit order placed')}<div class="modal-body"><div class="receipt"><div class="okc" style="background:var(--blue-soft);color:var(--blue)">${ic('clock', 'lg')}</div><h3 style="font-size:18px">Waiting for a match</h3><p class="dim" style="margin-top:4px">Your order is in Polymarket’s order book at ${cents(S.px)}. It fills when someone matches it — nothing has traded yet.</p></div></div><div class="modal-foot"><a class="btn btn-ghost" href="#/polymarket?tab=Open%20orders" data-action="closeModal">Open orders</a><button class="btn btn-primary" data-action="closeModal">Done</button></div>`);
  if (r.final === 'failed') return setModal(`${modalHead('Settlement failed')}<div class="modal-body">${emptyState({ icon: 'alert', title: 'The trade failed on Polygon', body: 'Polymarket matched the order but settlement failed. Check your positions and balance.' })}${txLink}</div>`);
  return setModal(`${modalHead('Matched — settling')}<div class="modal-body">${emptyState({ icon: 'clock', title: 'Settlement not confirmed yet', body: 'Polymarket matched your order; Polygon hasn’t confirmed settlement yet. Check History in a minute.' })}${txLink}</div><div class="modal-foot"><a class="btn btn-ghost" href="#/polymarket?tab=History" data-action="closeModal">History</a></div>`);
}
async function pmApproveFlow() {
  openModal(`${modalHead('Approve Polymarket')}<div class="modal-body"><div class="pipe">${pipeStep('Preparing approvals', 'run')}</div></div>`);
  try {
    await PMTrade.approveAll((i, n, label, st, hash) => setModal(`${modalHead('Approve Polymarket', `Step ${i + 1} of ${n}`)}<div class="modal-body"><div class="pipe">${pipeStep(esc(label), 'run', st === 'sign' ? 'Confirm in your wallet' : 'Waiting for Polygon')}</div>${hash ? `<p class="mut num" style="font-size:12px"><a class="link" style="display:inline" href="${polygonTx(hash)}" target="_blank" rel="noopener">${shortW(hash)}</a></p>` : ''}</div>`));
    setModal(`${modalHead('All set')}<div class="modal-body"><div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">Approvals confirmed on Polygon</h3><p class="dim" style="margin-top:4px">You can now trade on Polymarket from Nexis.</p></div></div><div class="modal-foot"><button class="btn btn-primary" data-action="closeModal">Done</button></div>`);
  } catch (e) { setModal(`${modalHead('Approval stopped')}<div class="modal-body">${emptyState({ icon: 'alert', title: 'Not approved', body: esc(e.message) })}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Close</button></div>`); await PMTrade.refresh(); }
}
function pmRepaintPanel(id) { const box = $('#pm-panel'); const m = Poly.markets.get(id); if (!box || !m) return; box.innerHTML = pmTradePanel(m, UI.pm.trade[id]); $$('#pm-panel [data-pm]').forEach(i => i.addEventListener('input', () => { UI.pm.trade[id][i.dataset.pm] = i.value; })); }
