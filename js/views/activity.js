/* =====================================================================
   ACTIVITY, NOTIFICATIONS, PROFILE, SEARCH
   ===================================================================== */
Views.activity = async (params) => {
  if (params.get('tab')) UI.activity.tab = params.get('tab'); if (!['Panta', 'Tracked'].includes(UI.activity.tab)) UI.activity.tab = 'Panta'; const tab = UI.activity.tab;
  const tabs = [['Panta', 'Panta trades'], ['Tracked', 'Tracked traders']];
  const body = tab === 'Panta' ? (pantaState('trades') && !Panta.markets.size ? pantaState('trades') : `<div class="card table-wrap" id="act-ptape">${pantaTapeRows(PantaTape.all(), 80)}</div><p class="mut" style="font-size:12px;margin-top:8px">Trades from the most active Panta markets and markets you’ve opened, refreshed every 30 seconds. Panta has no global trade stream.</p>`)
    : (Store.s.trackerLog.length ? `<div class="card">${Store.s.trackerLog.slice(0, 100).map(trLogRow).join('')}</div>` : `<div class="card">${emptyState({ icon: 'target', title: 'No tracked activity yet', body: 'Track traders and their position changes land here.', cta: '<a class="btn btn-primary sm" href="#/tracker">Find traders</a>' })}</div>`);
  return `<div class="page"><div class="page-head"><div><h1>Live activity</h1><p>Real trades as they happen. No simulated activity.</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-action="actTab" data-t="${k}">${l}</button>`).join('')}</div><div style="margin-top:16px">${body}</div></div>`;
};

Views.notifications = async () => {
  const L = Store.s.notifs; const st = Store.s.settings;
  return `<div class="page"><div class="page-head"><div><h1>Notifications</h1><p>Only real events: confirmed or failed transactions, tracked-trader moves, price moves and resolutions on markets you hold, and games you follow.</p></div><div class="row">${L.some(n => n.unread) ? '<button class="btn btn-ghost sm" data-action="readAll">Mark all read</button>' : ''}<a class="btn btn-ghost sm" href="#/settings?tab=notifications">${ic('sliders', 'sm')}Settings</a></div></div>
    ${'Notification' in window && !st.desktop ? `<div class="card card-pad row wrap" style="gap:12px;margin-bottom:14px">${ic('bell')}<span style="flex:1;min-width:200px;font-size:13px">Get desktop alerts while Nexis is in the background.</span><button class="btn btn-ghost sm" data-action="enableDesktop">Enable desktop notifications</button></div>` : ''}
    <div class="card">${L.length ? notifRows(L) : emptyState({ icon: 'bell', title: 'Nothing yet', body: 'Track a trader, follow a game or place a trade — alerts appear here as they happen.' })}</div></div>`;
};

Views.profile = async () => {
  const u = Auth.user; const w = primaryWallet(); const P = Portfolio.pos || [];
  return `<div class="page"><div class="card profile-hero" style="padding:22px"><div class="row wrap" style="gap:16px">${meAvatar('lg')}<div style="flex:1;min-width:0"><h1 style="font-size:24px">${esc(meName())}</h1><div class="mut" style="font-size:13px">@${esc(meHandle())}${u.email ? ' · ' + esc(u.email) : ''}</div>${u.bio ? `<p class="dim" style="margin-top:8px">${esc(u.bio)}</p>` : ''}</div><a class="btn btn-ghost sm" href="#/settings?tab=profile">${ic('edit', 'sm')}Edit profile</a></div></div>
    <div class="stats-strip" style="margin-top:16px"><div class="stat"><div class="k">Open positions</div><div class="v">${w ? P.length : '—'}</div><div class="s mut">On Panta</div></div><div class="stat"><div class="k">Tracked traders</div><div class="v">${Traders.list().length}</div></div><div class="stat"><div class="k">Followed games</div><div class="v">${Store.s.followedEvents.length}</div></div><div class="stat"><div class="k">Transactions</div><div class="v">${Store.s.txs.length}</div><div class="s mut">Signed in Nexis</div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>Wallets</h3><a class="link" href="#/settings?tab=wallets">Manage</a></div>${u.wallets.length ? u.wallets.map(x => `<div class="row" style="padding:12px 18px;border-bottom:1px solid var(--line);gap:10px">${ic('wallet', 'sm')}<span>${esc(x.label)}</span><span class="num mut">${shortAddr(x.address)}</span>${x.primary ? '<span class="tag blue">Primary</span>' : ''}<a class="link" style="margin-left:auto" href="${explorerAddr(x.address)}" target="_blank" rel="noopener">Solscan ${ic('ext', 'sm')}</a></div>`).join('') : `<p class="mut" style="padding:14px 18px;font-size:13px">No wallet linked. <button class="link" style="display:inline" data-action="linkWallet">Link one</button></p>`}</div>
    ${w ? `<div class="card" style="margin-top:16px"><div class="card-head"><h3>Public trader page</h3></div><p class="dim" style="padding:14px 18px;font-size:13px">Your wallet’s Panta positions are public on-chain. Others can track you at <a class="link num" style="display:inline" href="#/tracker/sol:${esc(w.address)}">#/tracker/sol:${esc(shortW(w.address))}</a>.</p></div>` : ''}</div>`;
};

/* ---------- search ---------- */
function searchLocal(q) {
  const s = q.trim().toLowerCase(); if (!s) return { panta: [], poly: [], coins: [], games: [] };
  return {
    panta: [...Panta.markets.values()].filter(m => !m.cancelled && !Panta.isBook(m) && (m.title + ' ' + m.category).toLowerCase().includes(s)).slice(0, 8),
    poly: Listings.all().filter(m => m.q.toLowerCase().includes(s) && !Listings.pantaFor(m)).sort((a, b) => b.vol24 - a.vol24).slice(0, 6),
    coins: Crypto.coins.filter(c => c.name.toLowerCase().includes(s) || c.sym.toLowerCase() === s).slice(0, 5),
    games: Sports.list().filter(g => gameText(g).includes(s)).slice(0, 8),
  };
}
function searchRowsHtml(r, close = false) {
  const ca = close ? ' data-action="closeModal"' : '';
  return (r.panta.length ? `<h5>Markets</h5>${r.panta.map(m => `<a href="#/market/${m.id}"${ca}><span style="flex:1;font-size:13.5px">${esc(m.title)}</span><span class="num up">${m.yes != null ? cents(m.yes) : '—'}</span></a>`).join('')}` : '')
    + (r.coins.length ? `<h5>Crypto</h5>${r.coins.map(c => `<a href="#/crypto/${esc(c.id)}"${ca}>${coinImg(c, 20)}<span style="flex:1">${esc(c.name)} <span class="mut">${esc(c.sym)}</span></span><span class="num">${fmtPx(c.price)}</span></a>`).join('')}` : '')
    + (r.games.length ? `<h5>Sports</h5>${r.games.map(g => `<a href="#/event/${g.id}"${ca}>${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span style="flex:1">${g.kind === 'field' ? esc(g.name) : `${esc(g.home.short)} ${scoreText(g)} ${esc(g.away.short)}`} <span class="mut" style="font-size:11.5px">${esc(g.league)}</span></span><span class="mut" style="font-size:12px">${esc(g.state === 'in' ? 'LIVE' : Sports.label(g))}</span></a>`).join('')}` : '')
    + (r.poly.length ? `<h5>More markets</h5>${r.poly.map(m => `<a href="#/market/${m.id}"${ca}><span style="flex:1;font-size:13.5px">${esc(m.q)}</span><span class="num mut">${cents(m.yes)}</span></a>`).join('')}` : '');
}
function openSearch() {
  closeModal(true);
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="search-modal" role="dialog" aria-label="Search"><div class="sin">${ic('search')}<input id="gs-in" placeholder="Search markets, crypto, games, traders" autocomplete="off"><button class="iconbtn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div><div class="sres" id="gs-res"></div></div>`;
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov); modalStack = [{ ov }];
  const inp = $('#gs-in'), res = $('#gs-res');
  const draw = () => {
    const q = inp.value.trim();
    if (!q) { res.innerHTML = `<h5>Jump to</h5>${[['#/markets', 'chart', 'Markets'], ['#/crypto', 'coin', 'Crypto prices'], ['#/sports', 'soccer', 'Live sports'], ['#/tracker', 'target', 'Trader Tracker']].map(([h, i, l]) => `<a href="${h}" data-action="closeModal">${ic(i, 'sm')}${l}</a>`).join('')}`; return; }
    const html = searchRowsHtml(searchLocal(q), true);
    res.innerHTML = (html || `<div class="empty" style="padding:24px">No markets, assets or games match “${esc(q)}”.</div>`) + `<a href="#/search?q=${encodeURIComponent(q)}" data-action="closeModal" style="margin-top:6px;color:var(--text-2)">${ic('arrowR', 'sm')}Search traders and all results for “${esc(q)}”</a>`;
  };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { location.hash = '#/search?q=' + encodeURIComponent(inp.value); closeModal(); } });
  draw(); inp.focus();
}
Views.search = async (params) => {
  const q = params.get('q') || ''; const r = searchLocal(q); const html = searchRowsHtml(r);
  let traders = []; if (q.trim().length >= 2) { try { traders = await Traders.search(q); } catch (e) {} }
  return `<div class="page"><div class="page-head"><div><h1>Search</h1></div></div>
    <label class="search-trigger" style="max-width:none;cursor:text;height:44px">${ic('search', 'sm')}<input id="search-page-in" value="${esc(q)}" placeholder="Search markets, crypto, games, traders" style="background:none;border:0;outline:none;flex:1;height:100%;color:var(--text)" autocomplete="off"></label>
    <div class="card sres" style="margin-top:14px;padding:8px">${html || ''}${traders.length ? `<h5>Traders</h5>${traders.map(t => `<a href="${Traders.href(t.id)}">${avatarFor(t.name, t.img, 'sm')}<span style="flex:1">@${esc(t.name)}</span><span class="mut" style="font-size:12px">${esc(t.sub)}</span></a>`).join('')}` : ''}${!html && !traders.length ? `<div class="empty" style="padding:28px">${q ? `Nothing matches “${esc(q)}”. <div style="margin-top:12px"><a class="btn btn-ghost sm" href="#/create">Create a market about it</a></div>` : 'Type to search.'}</div>` : ''}</div></div>`;
};
