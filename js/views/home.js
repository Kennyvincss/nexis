/* =====================================================================
   HOME DASHBOARD — only live data: balances, positions, Panta markets,
   crypto, live games, trades tapes and tracked-trader activity.
   ===================================================================== */
function cryptoStrip(n = 8) {
  if (!Crypto.coins.length) return Crypto.state === 'offline' ? `<div class="ticker mut">${ic('plug', 'sm')} Crypto prices unavailable right now.</div>` : '';
  return `<div class="ticker" id="home-ticker">${Crypto.coins.slice(0, n).map(c => `<a href="#/crypto/${esc(c.id)}" class="row" style="gap:7px"><b>${esc(c.sym)}</b><span class="num" data-cpx="${esc(c.id)}">${fmtPx(c.price)}</span><span data-cchg="${esc(c.id)}">${chgCell(c.chg24)}</span></a>`).join('')}<a class="link" href="#/crypto" style="margin-left:auto">All prices ${ic('chevRight', 'sm')}</a></div>`;
}
function pantaTapeRows(list, n = 12) {
  if (!list.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${Panta.state === 'live' ? 'Loading trades from the most active Panta markets…' : 'Needs the Panta API.'}</p>`;
  return `<table class="t tape"><tbody>${list.slice(0, n).map(t => { const m = Panta.markets.get(t.mId); return `<tr><td style="padding:9px 18px;white-space:normal"><span class="${t.side === 'YES' ? 'up' : 'down'}" style="font-weight:600;font-size:12px">${esc(t.side)}</span> <a class="dim" style="font-size:12.5px" href="#/tracker/sol:${esc(t.wallet)}">${esc(shortW(t.wallet))}</a>${m ? `<div class="mut" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px"><a href="#/market/${m.id}">${esc(m.title)}</a></div>` : ''}</td><td class="r num" style="font-size:12.5px">${fmtNum(t.amount, 2)}</td><td class="r mut" style="font-size:12px;padding-right:18px">${t.t ? ago(t.t) : ''} <a href="${explorerTx(t.sig)}" target="_blank" rel="noopener" aria-label="View transaction">${ic('ext', 'sm')}</a></td></tr>`; }).join('')}</tbody></table>`;
}
Views.home = async () => {
  const w = primaryWallet(); const b = Balances.v; const T = Portfolio.totals(); const P = Portfolio.pos || [];
  const live = Sports.list().filter(g => g.state === 'in'); const soon = Sports.list().filter(g => g.state === 'pre').slice(0, 4 - Math.min(4, live.length));
  const blocked = pantaState(); const markets = marketItems({ cat: 'all', q: '', sort: 'popular', status: 'open' }).list.slice(0, 6); Panta.watch(markets.filter(x => x.kind === 'panta').map(x => x.m.id));
  const log = (Store.s.trackerLog || []).slice(0, 6);
  return `<div class="page">${pantaModeBanner()}
    <div class="page-head"><div><h1>${Auth.user ? `Welcome back, ${esc(meName().split(' ')[0])}` : 'Nexis'}</h1><p>Live prediction markets on Panta, real-time sports and crypto, and the traders you follow.</p></div><div class="row"><a class="btn btn-ghost" href="#/markets">${ic('chart', 'sm')}Markets</a><a class="btn btn-primary" href="#/create">${ic('plus', 'sm')}Create market</a></div></div>
    ${Auth.user ? (w ? `<div class="stats-strip"><div class="stat"><div class="k">USDC balance</div><div class="v" data-usdc>${b ? fmtNum(b.usdc, 2) : Balances.err ? '—' : '…'}</div><div class="s mut">${esc(w.label)} · ${shortAddr(w.address)}</div></div><div class="stat"><div class="k">Positions value</div><div class="v" data-pfval>${P.length ? usd(T.val) : '—'}</div><div class="s mut">${P.length} open on Panta</div></div><div class="stat"><div class="k">P&amp;L</div><div class="v ${T.pnl >= 0 ? 'up' : 'down'}" data-pfpnl>${T.hasPnl ? sUsd(T.pnl) : '—'}</div><div class="s mut">Trades placed in Nexis</div></div><div class="stat"><div class="k">Tracked traders</div><div class="v">${Traders.list().length}</div><div class="s"><a class="link" href="#/tracker">Trader Tracker</a></div></div></div>`
      : `<div class="card card-pad row wrap" style="gap:14px">${ic('wallet')}<div style="flex:1;min-width:200px"><b>Link a Solana wallet to trade</b><p class="mut" style="font-size:13px">Your USDC balance and Panta positions are read straight from your wallet.</p></div><button class="btn btn-primary" data-action="linkWallet">Link wallet</button></div>`)
      : `<div class="card card-pad row wrap" style="gap:14px">${ic('user')}<div style="flex:1;min-width:200px"><b>Log in to trade and track</b><p class="mut" style="font-size:13px">Everything here is live. An account lets you link a wallet, track traders and get alerts.</p></div><a class="btn btn-ghost" href="#/login">Log in</a><a class="btn btn-primary" href="#/signup">Sign up</a></div>`}
    <div style="margin-top:16px">${cryptoStrip()}</div>
    ${live.length || soon.length ? `<section class="section"><div class="section-head"><h2>${live.length ? `<span class="live-dot red"></span> Live now` : 'Up next'}</h2><a class="link" href="#/sports">All sports ${ic('chevRight', 'sm')}</a></div><div class="grid gauto">${[...live.slice(0, 4), ...soon].map(gameCard).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>Top markets</h2><a class="link" href="#/markets">All markets ${ic('chevRight', 'sm')}</a></div>
      ${blocked && !markets.length ? blocked : markets.length ? `<div class="grid gauto">${markets.map(x => x.kind === 'panta' ? pantaCard(x.m) : listingCard(x.m)).join('')}</div>` : Panta.state === 'idle' || !Panta.loadedAt || Poly.state === 'idle' ? skeletonCards(3) : `<div class="card">${emptyState({ icon: 'chart', title: 'No open markets', body: 'Panta has no open markets right now.', cta: '<a class="btn btn-primary sm" href="#/create">Create one</a>' })}</div>`}</section>
    <section style="margin-top:26px">
      <div class="card"><div class="card-head"><h3>Live trades · Panta</h3>${srcBadge('panta', true)}</div><div id="home-ptape" class="table-wrap">${pantaTapeRows(PantaTape.all(), 10)}</div></div>
    </section>
    <section class="card" style="margin-top:18px"><div class="card-head"><h3>Tracked trader activity</h3><a class="link" href="#/tracker">Trader Tracker</a></div>${log.length ? log.map(trLogRow).join('') : `<p class="mut" style="padding:14px 18px;font-size:13px">${Traders.list().length ? 'No position changes detected yet.' : 'Track traders to see their new positions here the moment they happen.'}</p>`}</section>
  </div>`;
};
