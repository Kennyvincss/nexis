/* =====================================================================
   APP — shell, router, actions, live DOM updates, boot.
   Services emit Bus events; this file patches the visible page in place
   (prices, scores, balances, tx status) so nothing needs a manual refresh.
   ===================================================================== */

/* ---------------- shell ---------------- */
const NAV = [['home', 'Home', 'home'], ['markets', 'Markets', 'chart'], ['crypto', 'Crypto', 'coin'], ['sports', 'Sports', 'soccer'], ['tracker', 'Trader Tracker', 'target'], ['activity', 'Activity', 'zap'], ['polymarket', 'Polymarket', 'layers'], ['create', 'Create Market', 'plus'], ['portfolio', 'Portfolio', 'brief']];
const CORE_FEEDS = ['panta', 'polymarket', 'sports', 'crypto', 'chain'];
function feedPill() {
  const n = CORE_FEEDS.filter(k => Feeds.live(k)).length;
  if (Feeds.st.panta === 'unconfigured') return `<span class="status-dot" style="background:var(--amber)"></span><span>Panta not connected</span><span class="mut num">${n}/${CORE_FEEDS.length}</span>`;
  if (n) return `<span class="live-dot"></span><span>LIVE</span><span class="mut num">${n}/${CORE_FEEDS.length}</span>`;
  if (CORE_FEEDS.every(k => Feeds.st[k] === 'idle')) return `<span class="spin" style="width:10px;height:10px;border-width:1.5px"></span><span>Connecting</span>`;
  return `<span class="status-dot" style="background:var(--red)"></span><span>Offline</span>`;
}
function pantaBadge() {
  const m = Feeds.st.panta === 'unconfigured' ? 'unconfigured' : Panta.mode; const live = Feeds.live('panta');
  const txt = m === 'unconfigured' ? 'API key not set' : m === 'test' ? 'Test key · sandbox data' : live ? 'Live API' : Feeds.st.panta === 'idle' ? 'Connecting…' : 'Unreachable';
  const col = m === 'unconfigured' || m === 'test' ? 'var(--amber)' : live ? 'var(--green)' : 'var(--red)';
  return `<b>${pantaMark.replace('<svg', '<svg width="15" height="15"')}Powered by Panta</b><a class="row" style="gap:6px" href="#/settings?tab=integrations"><span class="status-dot" style="background:${col}"></span>${txt}</a>`;
}
function shellHtml() {
  return `<header class="topbar">
    <a class="logo" href="#/home" aria-label="Nexis home">${logoMark}<span class="wm">NEXIS</span></a>
    <button class="search-trigger" data-action="openSearch">${ic('search', 'sm')}<span>Search markets, crypto, games, traders</span><span class="kbd">⌘K</span></button>
    <div class="top-actions">
      <button class="feed-pill" data-action="feedStatus" id="feed-pill" aria-label="Data sources">${feedPill()}</button>
      <button class="iconbtn only-m" data-action="openSearch" aria-label="Search">${ic('search')}</button>
      <div style="position:relative"><button class="iconbtn" data-action="toggleNotifs" aria-label="Notifications" id="bell">${ic('bell')}<span id="bell-badge"></span></button><div id="notif-pop"></div></div>
      <span id="wallet-slot"></span>
      <div style="position:relative" id="user-slot"></div><div id="user-pop"></div>
      <button class="iconbtn only-m" data-action="openMenu" aria-label="Menu">${ic('menu')}</button>
    </div>
  </header>
  <div class="shell">
    <nav class="sidebar" aria-label="Main">
      ${NAV.map(([k, l, i]) => `<a class="nav-item" data-nav="${k}" href="#/${k}">${ic(i)}<span class="lbl">${l}</span>${k === 'tracker' ? '<span class="count" id="nav-track"></span>' : k === 'sports' ? '<span class="count live-count" id="nav-live"></span>' : ''}</a>`).join('')}
      <div class="nav-bottom">
        <div class="nav-sep"></div>
        <a class="nav-item" data-nav="notifications" href="#/notifications">${ic('bell')}<span class="lbl">Notifications</span><span class="count" id="nav-notif"></span></a>
        <a class="nav-item" data-nav="settings" href="#/settings">${ic('sliders')}<span class="lbl">Settings</span></a>
        <a class="nav-item" data-nav="profile" href="#/profile">${ic('user')}<span class="lbl">Profile</span></a>
        <div class="panta-badge" id="panta-badge">${pantaBadge()}</div>
      </div>
    </nav>
    <main class="main" id="view" tabindex="-1"></main>
  </div>
  <nav class="bottomnav" aria-label="Main">
    ${[['home', 'Home', 'home'], ['markets', 'Markets', 'chart'], ['create', 'Create', 'plain_plus'], ['sports', 'Sports', 'soccer'], ['portfolio', 'Portfolio', 'brief']].map(([k, l, i]) => `<a data-nav="${k}" href="#/${k}" class="${k === 'create' ? 'create' : ''}">${ic(i)}<span>${l}</span></a>`).join('')}
  </nav>`;
}
function renderChrome(route) {
  const navFor = { market: 'markets', event: 'sports', book: 'sports', search: '' }[route] ?? route;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navFor));
  const nl = $('#nav-live'); if (nl) { const n = Sports.list().filter(g => g.state === 'in').length; nl.innerHTML = n ? `<span class="live-dot red"></span>${n}` : ''; }
  const u = Notify.unread();
  const bb = $('#bell-badge'); if (bb) bb.innerHTML = u ? `<span class="dot-badge">${u > 99 ? '99+' : u}</span>` : '';
  const nn = $('#nav-notif'); if (nn) { nn.textContent = u || ''; nn.className = 'count' + (u ? ' hot' : ''); }
  const nt = $('#nav-track'); if (nt) nt.textContent = Traders.list().length || '';
  const ws = $('#wallet-slot'), us = $('#user-slot'); const user = Auth.user; const w = primaryWallet(); const b = Balances.v;
  if (ws) ws.innerHTML = !user ? `<a class="btn btn-quiet sm" href="#/login">Log in</a><a class="btn btn-primary sm" href="#/signup" style="margin-left:4px">Sign up</a>`
    : w ? `<a class="wallet-pill" href="#/portfolio" aria-label="Wallet balance">${ic('wallet', 'sm')}<span class="bal num" data-usdc>${b ? fmtNum(b.usdc, 2) : Balances.err ? '—' : '…'}</span><span class="lbl mut" style="font-size:11px">USDC</span></a>`
    : `<button class="btn btn-primary sm" data-action="linkWallet">${ic('wallet', 'sm')}<span class="lbl">Link wallet</span></button>`;
  if (us) us.innerHTML = user ? `<button class="avatar-btn" data-action="userMenu" aria-label="Account menu" aria-haspopup="menu">${meAvatar()}</button>` : '';
  const fp = $('#feed-pill'); if (fp) fp.innerHTML = feedPill();
  const pb = $('#panta-badge'); if (pb) pb.innerHTML = pantaBadge();
}
function openFeedStatus() {
  const C = Config.c || {}; const stLabel = { live: ['green', 'Live'], stale: ['amber', 'Delayed'], offline: ['red', 'Offline'], unconfigured: ['amber', 'Not configured'], idle: ['', 'Connecting'] };
  const rows = Object.entries(FEEDS).map(([k, f]) => { const s = k === 'ai' ? (AI.available ? 'live' : 'unconfigured') : Feeds.st[k]; const [c, l] = stLabel[s] || ['', s];
    return `<div class="kvrow"><span>${esc(f.name)}</span><span><span class="dim" style="font-size:12.5px">${esc(f.what)}</span><div class="mut" style="font-size:11.5px">${esc(f.src)}${Feeds.last[k] ? ' · last update ' + agoT(Feeds.last[k]) : ''}${Feeds.err[k] && s !== 'live' ? ' · ' + esc(Feeds.err[k]) : ''}</div></span><span class="tag ${c}">${l}</span></div>`; }).join('');
  openModal(`${modalHead('Data sources', 'Everything shown in Nexis comes from these live integrations')}<div class="modal-body" style="padding:0">${rows}</div>
    <div class="modal-body" style="padding-top:12px">${Feeds.st.panta === 'unconfigured' || Panta.mode === 'test' ? infoNote(`Panta ${Panta.mode === 'test' ? 'is using a test key (sandbox fixtures)' : 'isn’t connected'}. Add <code>PANTA_API_KEY</code> (a <code>pk_live_</code> key from docs.panta.market) in your host’s environment variables (Netlify: Site configuration → Environment variables; Vercel: Settings → Environment Variables), then redeploy.`) : ''}
      ${C.error === 'NO_API' ? infoNote('This copy isn’t served with Nexis’ /api functions, so live integrations are unavailable. Open the deployed site.') : ''}</div>
    <div class="modal-foot"><a class="btn btn-ghost" href="#/settings?tab=integrations" data-action="closeModal">Integration settings</a><button class="btn btn-primary" data-action="closeModal">Done</button></div>`, { label: 'Data sources' });
}
function toggleNotifs() {
  const pop = $('#notif-pop'); if (pop.innerHTML) { pop.innerHTML = ''; return; }
  const L = Store.s.notifs.slice(0, 6);
  pop.innerHTML = `<div class="card notif-pop" style="z-index:70;box-shadow:0 20px 60px rgba(0,0,0,.6)"><div class="card-head"><h3>Notifications</h3>${L.some(n => n.unread) ? '<button class="link" data-action="readAll">Mark all read</button>' : ''}</div>${L.length ? notifRows(L) : '<p class="mut" style="padding:16px 18px;font-size:13px">No notifications yet. Only real events appear here.</p>'}<a href="#/notifications" class="row" style="padding:12px 18px;justify-content:center;font-size:13px;color:var(--text-2)">See all</a></div>`;
}
function openMenu() {
  openModal(`${modalHead('Menu')}<div class="modal-body" style="gap:4px">${[...NAV, ['notifications', 'Notifications', 'bell'], ['settings', 'Settings', 'sliders'], ['profile', 'Profile', 'user']].map(([k, l, i]) => `<a class="nav-item" href="#/${k}" data-action="closeModal">${ic(i)}<span>${l}</span></a>`).join('')}<div class="nav-sep"></div><a class="nav-item" href="#/" data-action="closeModal">${ic('home')}<span>About Nexis</span></a></div>`);
}

/* ---------------- router ---------------- */
function parseHash() { const h = location.hash.slice(1) || '/'; const [path, qs] = h.split('?'); const parts = path.split('/').filter(Boolean); return { route: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null, params: new URLSearchParams(qs || '') }; }
const AUTH_ROUTES = ['login', 'signup', 'forgot', 'onboarding'];
const PROTECTED = ['portfolio', 'settings', 'profile'];
let viewStops = [];
function stopViewTimers() { viewStops.forEach(f => { try { f(); } catch (e) {} }); viewStops = []; }
async function router({ silent = false } = {}) {
  const { route, arg, params } = parseHash(); const app = $('#app');
  const same = current.route === route && current.arg === arg;
  if (!silent || !same) stopViewTimers();
  if (!route || route === 'welcome') {
    document.body.classList.add('is-landing'); current = { route: '', arg, params };
    app.innerHTML = Views.landing(); hydrate(app); if (!silent) window.scrollTo(0, 0); return;
  }
  const user = Auth.user;
  if (user && !user.onboarded && !AUTH_ROUTES.includes(route)) { location.hash = '#/onboarding'; return; }
  if (!user && PROTECTED.includes(route)) { UI.auth.next = location.hash.slice(1); toast({ title: 'Log in to continue', body: 'Create a free account or log in to open this page.', kind: 'info' }); location.hash = '#/login'; return; }
  if (AUTH_ROUTES.includes(route)) {
    document.body.classList.add('is-landing'); current = { route, arg, params };
    const html = await Views[route](params, arg); if (html) { app.innerHTML = html; hydrate(app); const f = app.querySelector('[autofocus]'); f && f.focus(); } if (!silent) window.scrollTo(0, 0); return;
  }
  if (!$('#view')) { document.body.classList.remove('is-landing'); app.innerHTML = shellHtml(); }
  const view = Views[route]; const main = $('#view');
  current = { route, arg, params }; renderChrome(route);
  if (!view) { main.innerHTML = `<div class="page">${emptyState({ icon: 'compass', title: 'Page not found', body: 'That link doesn’t match anything in Nexis.', cta: '<a class="btn btn-primary sm" href="#/home">Go home</a>' })}</div>`; return; }
  const y = window.scrollY;
  if (!silent) main.innerHTML = skeletonPage();
  try {
    const html = await view(params, arg);
    if (current.route !== route || current.arg !== arg) return;
    if (html == null) return;
    main.innerHTML = html; hydrate(main); if (!silent || !same) stopViewTimers(); bindView(route, arg, params);
    if (silent && same) window.scrollTo(0, y); else if (!silent) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  } catch (e) {
    console.error(e);
    if (current.route !== route || current.arg !== arg) return;
    main.innerHTML = `<div class="page">${emptyState({ icon: 'alert', title: 'Couldn’t load this page', body: esc(e.message || 'Something went wrong.'), cta: '<button class="btn btn-primary sm" data-action="retry">Try again</button>' })}</div>`;
  }
}
const refresh = () => router({ silent: true });
/** Re-render the current list-style view for live data, without disturbing typing, dialogs or scroll. */
let _soft = { at: 0, t: null };
function softRefresh(routes) {
  if (routes && !routes.includes(current.route)) return;
  const wait = 2500 - (now() - _soft.at); if (wait > 0) { if (!_soft.t) _soft.t = setTimeout(() => { _soft.t = null; softRefresh(routes); }, wait); return; }
  const a = document.activeElement; const busy = modalStack.length || document.hidden || (a && a.closest && a.closest('#view, #app') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || ($('#user-pop') && $('#user-pop').innerHTML) || ($('#notif-pop') && $('#notif-pop').innerHTML) || window.getSelection().toString();
  if (busy) { if (!_soft.t) _soft.t = setTimeout(() => { _soft.t = null; softRefresh(routes); }, 3000); return; }
  _soft.at = now(); refresh();
}

/* ---------------- per-view bindings ---------------- */
function debounceInput(sel, ms, fn) { const i = $(sel); if (!i) return; let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fn(i.value, i), ms); }); }
async function refreshKeepFocus(sel) { const el = $(sel); const pos = el ? el.selectionStart : null; await refresh(); const n = $(sel); if (n) { n.focus(); if (pos != null) n.setSelectionRange(pos, pos); } }
function repaintTrade(id) {
  const box = $('#trade-panel'); const m = Panta.markets.get(id); if (!box || !m) return;
  const a = document.activeElement; const focused = a && a.matches && a.matches(`[data-amt="${id}"]`); const pos = focused ? a.selectionStart : null;
  box.innerHTML = tradePanel(m, UI.trade[id]); bindTradeInput(id);
  if (focused) { const n = box.querySelector(`[data-amt="${id}"]`); n.focus(); n.setSelectionRange(pos, pos); }
}
function bindTradeInput(id) { const inp = $(`#trade-panel [data-amt="${id}"]`); if (!inp) return; let t; inp.addEventListener('input', () => { UI.trade[id].amt = inp.value.replace(/[^0-9.]/g, ''); clearTimeout(t); t = setTimeout(() => repaintTrade(id), 250); }); }
function bindView(route, arg, params) {
  if (route === 'markets') { debounceInput('#mk-q', 220, (v) => { UI.markets.q = v; refreshKeepFocus('#mk-q'); }); const s = $('#mk-sort'); s && s.addEventListener('change', () => { UI.markets.sort = s.value; refresh(); }); }
  if (route === 'market' && arg && !arg.startsWith('pm-')) {
    bindTradeInput(arg); paintPantaTrades(arg); paintMyPosition(arg);
    viewStops.push(Poller(() => paintPantaTrades(arg), 15000, { immediate: false }));
    const off = Bus.on('portfolio', () => paintMyPosition(arg)); viewStops.push(off);
  }
  if (route === 'crypto' && !arg) { debounceInput('#cr-q', 200, (v) => { UI.crypto.q = v; refreshKeepFocus('#cr-q'); }); const s = $('#cr-sort'); s && s.addEventListener('change', () => { UI.crypto.sort = s.value; refresh(); }); }
  if (route === 'crypto' && arg) paintCryptoAbout(arg);
  if (route === 'polymarket') {
    debounceInput('#pm-q', 220, (v) => { UI.pm.q = v; refreshKeepFocus('#pm-q'); });
    $$('[data-pm]').forEach(i => i.addEventListener('input', () => { const tr = UI.pm.trade[i.dataset.id]; if (tr) tr[i.dataset.pm] = i.value; }));
    if (PMTrade.address && !PMTrade._acctAt) { PMTrade._acctAt = now(); PMTrade.loadAccount(); }
    viewStops.push(Poller(() => PMTrade.address ? Promise.all([PMTrade.loadAccount(), PMTrade.refresh()]) : null, 20000, { immediate: false }));
    if (arg) { pmPaintBook(); viewStops.push(Poller(() => pmPaintBook(), 8000, { immediate: false })); const pm = Poly.markets.get(arg); if (pm) Poly.history(pm).then(() => { const c = $(`.chart-box[data-chart="poly"][data-id="${arg}"]`); if (c) mountChartEl(c); }).catch(() => {}); }
  }
  if (route === 'sports' || route === 'book') bindBook();
  if (route === 'sports') { const lg = $('#sp-league'); if (lg) lg.addEventListener('change', () => { Object.assign(UI.sports, { league: lg.value, q: '', status: 'all', limit: 60 }); history.replaceState(null, '', '#/sports'); refresh(); window.scrollTo(0, 0); }); debounceInput('#sp-q', 250, (v) => { UI.sports.q = v; UI.sports.limit = 60; refreshKeepFocus('#sp-q'); }); }
  if (route === 'sports') { const on = $('.daystrip button.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  if (route === 'event' && arg) { paintEventSummary(arg); viewStops.push(Poller(() => paintEventSummary(arg), () => { const g = Sports.games.get(arg); return g && g.state === 'in' ? 12000 : 60000; }, { immediate: false })); }
  if (route === 'tracker' && !arg) {
    paintLeaderboard();
    debounceInput('#tr-q', 350, async (v) => {
      UI.tracker.q = v; UI.tracker.results = null; const box = $('#tr-results'); if (!box) return;
      if (v.trim().length < 2) { box.innerHTML = ''; return; }
      UI.tracker.searching = true; box.innerHTML = trResults();
      const r = await Traders.search(v); if (UI.tracker.q !== v) return; UI.tracker.searching = false; UI.tracker.results = r; const b = $('#tr-results'); if (b) b.innerHTML = trResults();
    });
  }
  if (route === 'search') debounceInput('#search-page-in', 300, (v) => { history.replaceState(null, '', '#/search?q=' + encodeURIComponent(v)); current.params = new URLSearchParams('q=' + v); refreshKeepFocus('#search-page-in'); });
  if (route === 'settings') { paintChainHistory(); paintTotpQr(); }
  if (route === 'portfolio' && UI.portfolio.tab === 'On-chain') paintChainHistory();
}

/* ---------------- actions ---------------- */
const A_APP = {
  closeModal: () => closeModal(), openSearch: () => openSearch(), openMenu: () => openMenu(), feedStatus: () => openFeedStatus(), toggleNotifs: () => toggleNotifs(),
  readNotif: (el) => { Notify.read(el.dataset.id); const p = $('#notif-pop'); if (p) p.innerHTML = ''; return 'default'; },
  readAll: () => { Notify.readAll(); const p = $('#notif-pop'); if (p && p.innerHTML) { p.innerHTML = ''; toggleNotifs(); } if (current.route === 'notifications') refresh(); },
  retry: async (el) => { setBusy(el, true, 'Retrying…'); Config.c = null; Config.loading = null; await Config.load(); await Promise.allSettled([Panta.loadCatalog(), Crypto.load(), Sports.poll(), Poly.load()]); refresh(); },
  quickTrade: (el) => { const id = el.dataset.id, side = el.dataset.side; UI.trade[id] = { ...(UI.trade[id] || { amt: '10' }), side }; if (current.route === 'market' && current.arg === id) { repaintTrade(id); $('#trade-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); } else location.hash = `#/market/${id}?side=${side}`; },
  side: (el) => { const id = el.dataset.id; UI.trade[id].side = el.dataset.side; repaintTrade(id); },
  preset: (el) => { const id = el.dataset.id; UI.trade[id].amt = el.dataset.v === 'max' ? String(Math.floor((Balances.v ? Balances.v.usdc : 0) * 100) / 100) : el.dataset.v; repaintTrade(id); },
  reviewOrder: (el) => openOrder(el.dataset.id),
  confirmOrder: (el) => { el.disabled = true; confirmOrder(); },
  claim: (el) => requireAuth(() => claimWinnings(el.dataset.id), 'Log in to claim'),
  aiAnalyze: async (el) => { const id = el.dataset.id; const m = Panta.markets.get(id); if (!m) return; setBusy(el, true, 'Analyzing…'); try { UI.ai = UI.ai || {}; UI.ai[id] = await AI.analyze(m); refresh(); } catch (e) { setBusy(el, false); toast({ title: 'Analysis unavailable', body: esc(e.message), kind: 'warn' }); } },
  mSrc: (el) => { UI.markets.src = el.dataset.src; UI.markets.cat = 'all'; history.replaceState(null, '', '#/markets'); refresh(); },
  pmConnect: async (el) => { setBusy(el, true, 'Connecting…'); try { await PMTrade.connect(el.dataset.id); toast({ title: 'Wallet connected', body: esc(shortW(PMTrade.address)) + ' on Polygon' }); PMTrade.loadAccount(); } catch (e) { toast({ title: 'Couldn’t connect', body: esc(e.message), kind: 'err' }); } setBusy(el, false); refresh(); },
  pmDisconnect: () => { PMTrade.disconnect(); refresh(); },
  pmSwitch: async (el) => { setBusy(el, true); try { await PMTrade.ensureChain(); await PMTrade.init(); } catch (e) { toast({ title: 'Couldn’t switch network', body: esc(e.message), kind: 'err' }); } setBusy(el, false); refresh(); },
  pmEnable: async (el) => { setBusy(el, true, 'Check your wallet…'); try { await PMTrade.enableTrading(); toast({ title: 'Trading enabled' }); PMTrade.loadAccount(); } catch (e) { toast({ title: 'Couldn’t enable trading', body: esc(e.message), kind: 'err' }); } setBusy(el, false); refresh(); },
  pmResetCreds: () => { PMTrade.resetCreds(); refresh(); },
  pmApprove: () => pmApproveFlow(),
  pmRefresh: async (el) => { setBusy(el, true); await PMTrade.refresh(); setBusy(el, false); refresh(); },
  pmTab: (el) => { UI.pm.tab = el.dataset.t; history.replaceState(null, '', '#/polymarket'); if (PMTrade.address) PMTrade.loadAccount(); refresh(); },
  pmSide: (el) => { UI.pm.trade[el.dataset.id].side = el.dataset.v; pmRepaintPanel(el.dataset.id); },
  pmOut: (el) => { UI.pm.trade[el.dataset.id].out = +el.dataset.v; pmRepaintPanel(el.dataset.id); const m = Poly.markets.get(el.dataset.id); const b = $('#pm-book'); if (m && b) { b.dataset.token = m.tokens[+el.dataset.v]; b.previousElementSibling.querySelector('h3').textContent = 'Order book · ' + (+el.dataset.v === 0 ? m.yesLabel : m.noLabel); pmPaintBook(); } },
  pmKind: (el) => { UI.pm.trade[el.dataset.id].kind = el.dataset.v; pmRepaintPanel(el.dataset.id); },
  pmReview: (el) => { const m = Poly.markets.get(el.dataset.id); pmReview(pmOrderSpec(m, UI.pm.trade[el.dataset.id])); },
  pmConfirm: (el) => { el.disabled = true; pmConfirm(); },
  pmCancel: async (el) => { setBusy(el, true); try { await PMTrade.cancel(el.dataset.id); toast({ title: 'Order cancelled', kind: 'info' }); refresh(); } catch (e) { setBusy(el, false); toast({ title: 'Couldn’t cancel', body: esc(e.message), kind: 'err' }); } },
  pmSellPos: (el) => { const tok = el.dataset.token; const hit = Poly.byToken.get(tok); const p = PMTrade.position(tok); if (hit) { UI.pm.trade[hit.m.id] = { out: hit.idx, side: 'SELL', kind: 'market', amt: p ? String(Math.floor(p.shares * 100) / 100) : '', price: '' }; location.hash = '#/polymarket/' + hit.m.id; return; } if (p) pmReview({ tokenId: tok, title: p.title, outcome: p.outcome, side: 'SELL', kind: 'market', amount: Math.floor(p.shares * 100) / 100 }); },
  mStatus: (el) => { UI.markets.status = el.dataset.s; history.replaceState(null, '', '#/markets'); refresh(); },
  mCat: (el) => { UI.markets.cat = el.dataset.cat; history.replaceState(null, '', '#/markets'); refresh(); },
  pfTab: (el) => { UI.portfolio.tab = el.dataset.t; history.replaceState(null, '', '#/portfolio'); refresh(); },
  trTab: (el) => { UI.tracker.tab = el.dataset.t; refresh(); },
  actTab: (el) => { UI.activity.tab = el.dataset.t; history.replaceState(null, '', '#/activity'); refresh(); },
  sportFilter: (el) => { UI.sports.filter = el.dataset.f; history.replaceState(null, '', '#/sports'); refresh(); },
  spStatus: (el) => { UI.sports.status = el.dataset.v; UI.sports.limit = 60; refresh(); },
  spSport: (el) => { UI.sports.sport = el.dataset.v; UI.sports.league = ''; UI.sports.limit = 60; refresh(); },
  spToggle: (el) => { UI.sports[el.dataset.k] = !UI.sports[el.dataset.k]; UI.sports.limit = 60; refresh(); },
  bkMode: (el) => { UI.sports.mode = el.dataset.v; if (el.dataset.v === 'book') UI.sports.league = ''; history.replaceState(null, '', '#/sports'); refresh(); },
  bkSport: (el) => { Object.assign(UI.book, { sport: el.dataset.v, league: '', limit: 60 }); refresh(); },
  bkLeague: (el) => { const k = el.dataset.v; const g = k && Book.games().find(x => x.leagueKey === k); Object.assign(UI.book, { league: k, sport: g ? g.sport : UI.book.sport, limit: 60 }); refresh(); window.scrollTo(0, 0); },
  bkTab: (el) => { UI.book.tab = el.dataset.v; UI.book.limit = 60; refresh(); },
  bkWhen: (el) => { UI.book.when = el.dataset.v; UI.book.limit = 60; refresh(); },
  bkMore: () => { UI.book.limit += 60; refresh(); },
  bkClearQ: () => { UI.book.q = ''; refresh(); },
  bkCat: (el) => { UI.book.cat = el.dataset.v; refresh(); },
  bkPick: (el) => { Book.toggle(el.dataset.k, { label: el.dataset.l, market: el.dataset.mk, game: (() => { const g = Book.get(el.dataset.g); return g ? `${g.home.short} vs ${g.away.short}` : ''; })(), gid: el.dataset.g }); },
  bkRemove: (el) => Book.remove(el.dataset.k),
  bkClear: () => Book.clear(),
  bkPlace: () => bkPlace(),
  bkSlipOpen: () => { openModal(`${modalHead('Bet slip')}<div class="modal-body" id="bk-slip-modal" style="padding:0">${bkSlip()}</div>`, { label: 'Bet slip' }); bkBindSlip(); },
  spReset: () => { Object.assign(UI.sports, { q: '', sport: 'all', league: '', status: 'all', bettable: false, following: false, limit: 60 }); refresh(); },
  spLeague: (el, ev) => { if (ev) ev.preventDefault(); Object.assign(UI.sports, { league: el.dataset.v || '', q: '', status: 'all', limit: 60 }); history.replaceState(null, '', '#/sports'); refresh(); window.scrollTo(0, 0); },
  spClear: () => { UI.sports.q = ''; refresh(); },
  spMore: () => { UI.sports.limit = (UI.sports.limit || 60) + 90; refresh(); },
  sportDay: (el) => { UI.sports.day = el.dataset.day; history.replaceState(null, '', '#/sports'); $$('.daystrip button').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); refresh(); },
  quoteCreate: (el) => quoteCreate(el), confirmCreate: (el) => { el.disabled = true; confirmCreate(); }, draftAi: (el) => draftAi(el),
  track: (el) => { const id = el.dataset.id; Traders.track(id, el.dataset.name || undefined); closeModal(true); toast({ title: `Tracking @${Traders.name(id)}`, body: 'You’ll be notified when they open, change or close a position. Tracking never places trades.' }); refresh(); },
  untrack: (el) => { const id = el.dataset.id; Traders.untrack(id); toast({ title: `Stopped tracking @${Traders.name(id)}`, kind: 'info' }); refresh(); },
  trNotify: (el) => { const e = Traders.entry(el.dataset.id); if (!e) return; e.notify = !e.notify; Store.emit('track'); toast({ title: e.notify ? 'Alerts on' : 'Alerts off', kind: 'info', ms: 2000 }); refresh(); },
  copySettings: (el) => openCopyModal(el.dataset.id), saveCopy: (el) => saveCopy(el.dataset.id),
  followEvent: (el) => { const id = el.dataset.id; const L = Store.s.followedEvents; const on = !L.includes(id); Store.s.followedEvents = on ? [id, ...L].slice(0, 100) : L.filter(x => x !== id); Store.emit('follow'); const g = Sports.games.get(id);
    toast({ title: on ? `Following ${g ? Sports.title(g) : 'game'}` : 'Unfollowed', body: on ? 'You’ll get score, kick-off and full-time alerts.' : '', kind: on ? 'ok' : 'info', ms: 2500 });
    $$(`[data-action="followEvent"][data-id="${id}"]`).forEach(b => { const g2 = Sports.games.get(id); if (g2) b.outerHTML = followBtn(g2); }); },
  cRange: (el) => { const id = el.dataset.id; UI.chartRange[id] = el.dataset.r; $$(`[data-action="cRange"][data-id="${id}"]`).forEach(b => b.classList.toggle('on', b === el)); const c = $(`.chart-box[data-chart="crypto"][data-id="${id}"]`); if (c) { c.dataset.r = el.dataset.r; mountChartEl(c); } },
};
const A = { ...A_AUTH, ...A_APP };
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a && A[a.dataset.action]) { const r = A[a.dataset.action](a, e); if (a.tagName === 'BUTTON' || (r !== 'default' && a.tagName !== 'A')) e.preventDefault(); return; }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('button,a,input')) { location.hash = row.dataset.href; return; }
  const pop = $('#notif-pop'); if (pop && pop.innerHTML && !e.target.closest('#notif-pop') && !e.target.closest('#bell')) pop.innerHTML = '';
  const up = $('#user-pop'); if (up && up.innerHTML && !e.target.closest('#user-pop')) up.innerHTML = '';
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const kind = f.dataset.form; const fn = FORMS[kind]; if (!fn) return;
  const btn = f.querySelector('[type=submit]'); showErr(f, ''); setBusy(btn, true, FORM_BUSY[kind]);
  try { await fn(f, new FormData(f)); } catch (err) { showErr(f, err.message || 'Something went wrong.'); } finally { if (btn && btn.isConnected) setBusy(btn, false); }
});
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.setting; if (k && Store.s) { Store.s.settings[k] = e.target.checked; Store.save(); toast({ title: 'Setting saved', kind: 'info', ms: 2000 }); } });
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') { if (modalStack.length) closeModal(); else { const p = $('#notif-pop'); if (p && p.innerHTML) p.innerHTML = ''; const u = $('#user-pop'); if (u && u.innerHTML) u.innerHTML = ''; } }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !modalStack.length) { e.preventDefault(); openSearch(); }
});
/* quote countdowns */
setInterval(() => $$('[data-countdown]').forEach(el => { const s = Math.max(0, Math.round((+el.dataset.countdown - now()) / 1000)); el.textContent = s ? s + 's' : 'expired — request a new quote'; }), 1000);

/* ---------------- live DOM patching ---------------- */
const throttleMap = {};
function throttled(key, ms, fn) { const t = throttleMap[key] || 0; if (now() - t < ms) return; throttleMap[key] = now(); fn(); }
function pfPatch() { if (!Portfolio.pos) return; const T = Portfolio.totals(); setText('[data-pfval]', usd(T.val)); $$('[data-pfpnl]').forEach(el => { if (T.hasPnl) { el.textContent = sUsd(T.pnl); el.classList.toggle('up', T.pnl >= 0); el.classList.toggle('down', T.pnl < 0); } }); }
Bus.on('panta:price', ({ m, prev }) => {
  if (m.yes != null) { setText(`[data-py="${m.id}"]`, cents(m.yes), true); setText(`[data-ppct="${m.id}"]`, Math.round(m.yes * 100) + '%'); }
  if (m.no != null) setText(`[data-pn="${m.id}"]`, cents(m.no), true);
  if (m.volume != null) { setText(`[data-pvol="${m.id}"]`, kusd(m.volume)); setText(`[data-pvolf="${m.id}"]`, usd(m.volume, 0)); }
  $$(`[data-pat="${m.id}"]`).forEach(el => el.textContent = agoT(m.pricedAt || now()));
  if (current.route === 'market' && current.arg === m.id) { const c = $(`.chart-box[data-chart="panta"][data-id="${m.id}"]`); if (c) mountChartEl(c); else if (Panta.hist(m.id).length >= 2) softRefresh(['market']); }
  pfPatch();
});
Bus.on('panta:catalog', () => { softRefresh(['markets', 'home', '', 'crypto', 'event', 'create']); renderChrome(current.route); });
Bus.on('poly:price', ({ m }) => {
  setText(`[data-ly="${m.id}"]`, cents(m.yes), true); setText(`[data-ln="${m.id}"]`, cents(1 - m.yes), true); setText(`[data-lpct="${m.id}"]`, Math.round(m.yes * 100) + '%');
  $$(`[data-lbook="${m.id}"]`).forEach(el => { const h = polyBook(m); if (el.innerHTML !== h) el.innerHTML = h; });
  if (current.route === 'market' && current.arg === m.id) throttled('pchart', 4000, () => { const c = $(`.chart-box[data-chart="poly"][data-id="${m.id}"]`); if (c) mountChartEl(c); });
});
Bus.on('poly', () => { if (current.route === 'markets' && UI.markets.src === 'poly') softRefresh(['markets']); });
Bus.on('poly:trades', () => {
  const h = $('#home-ltape'); if (h) h.innerHTML = polyTape(Poly.trades, true, 10);
  const a = $('#act-ltape'); if (a) a.innerHTML = polyTape(Poly.trades, true, 80);
  const pm = $('#pm-trades'); if (pm) pm.innerHTML = polyTape(Poly.mtrades[pm.dataset.cid] || [], false);
});
const paintPantaTapes = () => { const h = $('#home-ptape'); if (h) h.innerHTML = pantaTapeRows(PantaTape.all(), 10); const a = $('#act-ptape'); if (a) a.innerHTML = pantaTapeRows(PantaTape.all(), 80); };
Bus.on('panta:trades', paintPantaTapes); Bus.on('panta:tape', paintPantaTapes);
Bus.on('crypto:tick', ({ c, prev }) => {
  const id = esc(c.id); setText(`[data-cpx="${id}"]`, fmtPx(c.price), true);
  $$(`[data-cchg="${id}"]`).forEach(el => { const h = chgCell(c.chg24); if (el.innerHTML !== h) el.innerHTML = h; });
  setText(`[data-chi="${id}"]`, fmtPx(c.high)); setText(`[data-clo="${id}"]`, fmtPx(c.low));
  if (current.route === 'crypto' && current.arg === c.id) {
    throttled('csrc', 5000, () => $$(`[data-csrc="${id}"]`).forEach(el => el.innerHTML = cryptoSrc(c)));
    throttled('cchart', 3000, () => { const el = $(`.chart-box[data-chart="crypto"][data-id="${id}"]`); if (el && el.dataset.r === '1') drawCryptoChart(el); });
  }
});
Bus.on('crypto', () => { if ((current.route === 'crypto' && !current.arg) || current.route === '' || current.route === 'home') softRefresh(['crypto', '', 'home']); });
Bus.on('sports', () => {
  renderChrome(current.route);
  if (current.route === 'event' && current.arg) paintEventParts(current.arg); else softRefresh(['sports', 'home', '']);
});
Bus.on('sports:score', ({ g }) => $$(`[data-gscore="${g.id}"]`).forEach(el => { el.textContent = scoreText(g); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }));
Bus.on('tx', () => { const b = $('[data-txrows]'); if (b) b.innerHTML = txRows(Store.s.txs.slice(0, 60)); else if (current.route === 'portfolio' && UI.portfolio.tab === 'Transactions') softRefresh(['portfolio']); });
Bus.on('balances', () => { const b = Balances.v; setText('[data-usdc]', b ? fmtNum(b.usdc, 2) : Balances.err ? '—' : '…'); setText('[data-sol]', b ? fmtNum(b.sol, 4) : '—'); });
Bus.on('notifs', () => { renderChrome(current.route); if (current.route === 'notifications') softRefresh(['notifications']); });
Bus.on('trader', (id) => { if (current.route === 'tracker' && (!current.arg || current.arg === id)) softRefresh(['tracker']); });
Bus.on('tracker', () => { renderChrome(current.route); softRefresh(['tracker', 'home', 'activity']); });
Bus.on('portfolio', () => { pfPatch(); softRefresh(['portfolio', 'home']); });
Bus.on('pm', () => { if (current.route === 'polymarket') { const p = $('#pm-mypos'); const m = current.arg && Poly.markets.get(current.arg); if (p && m) p.innerHTML = pmMyPosition(m); softRefresh(['polymarket']); } });
Bus.on('feeds', () => { const fp = $('#feed-pill'); if (fp) fp.innerHTML = feedPill(); const pb = $('#panta-badge'); if (pb) pb.innerHTML = pantaBadge(); });
Bus.on('store', () => { if ($('#view')) renderChrome(current.route); });
Bus.on('auth:expired', () => { Store.init(null); Balances.v = null; toast({ title: 'You’ve been signed out', body: 'Your session ended or was signed out from another device. Log in again.', kind: 'info' }); if (PROTECTED.includes(current.route)) { UI.auth.next = location.hash.slice(1); location.hash = '#/login'; } else refresh(); });

/* ---------------- boot ---------------- */
window.addEventListener('hashchange', () => { const p = $('#user-pop'); if (p) p.innerHTML = ''; const n = $('#notif-pop'); if (n) n.innerHTML = ''; router(); });
(async function boot() {
  Store.init(Auth.user && Auth.user.id);
  // When Nexis runs inside Claude, the page can use the viewer's own Claude connection for AI drafting.
  try { if (window.claude && typeof window.claude.use === 'function') { const s = await window.claude.use('sample'); if (s && typeof s.json === 'function') sampleFn = s; } } catch (e) { /* not available */ }
  router();
  const cfg = await Config.load();
  // Accounts: server-side when the host has storage (Netlify Blobs), otherwise browser-only.
  if (cfg && !cfg.error) {
    const want = cfg.accounts && cfg.accounts.server ? 'remote' : 'local';
    if (Auth.mode !== want) { Auth.setMode(want); Store.init(Auth.user && Auth.user.id); router(); }
  }
  // Keep the account in sync with other devices (profile edits, signed-out sessions).
  Poller(() => Auth.mode === 'remote' && Auth.user ? RemoteAccounts.refresh().then(() => renderChrome(current.route)).catch(() => {}) : null, 60000);
  if (cfg && cfg.panta && !cfg.panta.configured && !cfg.error) { Panta.state = 'unconfigured'; Panta.mode = 'unconfigured'; Feeds.set('panta', 'unconfigured'); }
  else if (cfg && cfg.panta && cfg.panta.mode) Panta.mode = cfg.panta.mode;
  if (cfg && cfg.error === 'NO_API') ['panta', 'polymarket', 'sports', 'crypto', 'chain'].forEach(k => Feeds.set(k, 'offline', new Error('Not running on the Nexis server (/api unavailable)')));
  renderChrome(current.route);
  if (Panta.state !== 'unconfigured') { Panta.start(); PantaTape.start(); }
  Poly.start(); Crypto.start(); Sports.start(); Traders.start(); Portfolio.start(); Balances.start();
  if (Auth.user) Wallets.watch();
  if (current.route) refresh();
})();
