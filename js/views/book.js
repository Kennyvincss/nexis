/* =====================================================================
   SPORTSBOOK VIEWS
   #/sports            sportsbook: sports & leagues, games with odds, bet slip
                       (Scores & results tab: the ESPN views in sports.js)
   #/book/<game id>    every market for one game, grouped by bet type
   Bets are Polymarket market orders placed from the bet slip (singles).
   ===================================================================== */
UI.book = UI.book || { sport: 'all', league: '', tab: 'all', when: 'all', q: '', limit: 60, cat: 'All' };
try { UI.book.fmt = localStorage.getItem('nexis-odds') || 'decimal'; } catch (e) { UI.book.fmt = 'decimal'; }

const bkKickoff = (g) => {
  if (g.state === 'in') return `<span class="bk-live"><span class="live-dot red"></span>${esc(g.clock || 'Live')}</span>`;
  const d = new Date(g.start); const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const today = dayStart(now()); const day = dayStart(g.start);
  return `<span class="mut">${day === today ? 'Today' : day === today + DAY ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${t}</span>`;
};
function bkOdd(s, g, opts = {}) {
  const on = Book.inSlip(s.key); const open = Book.open(s.m, s.idx); const p = Book.price(s.m, s.idx);
  return `<button class="odd ${on ? 'on' : ''}" ${open ? '' : 'disabled'} data-action="bkPick" data-k="${esc(s.key)}" data-g="${esc(g.id)}" data-l="${esc(opts.label || s.label)}" data-mk="${esc(opts.market || '')}" aria-pressed="${on}" title="${esc((opts.market ? opts.market + ' · ' : '') + (opts.label || s.label))}">
    <span class="odd-l">${esc(opts.show || s.label)}</span><b class="num" data-odd="${esc(s.key)}">${open ? Book.odds(p, UI.book.fmt) : ic('lock', 'sm')}</b></button>`;
}
const bkCrest = (t) => t.logo ? `<img src="${esc(t.logo)}" alt="" width="18" height="18" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="bk-dot">${esc((t.short || t.name || '?').slice(0, 1))}</span>`;
function bkRow(g) {
  const main = g.main; const labels = main.three ? ['1', 'X', '2'] : ['1', '2'];
  const marketLabel = (s) => s.label === '1' ? g.home.short : s.label === '2' ? g.away.short : s.label === 'X' ? 'Draw' : s.label;
  return `<div class="bk-row ${g.state === 'in' ? 'live' : ''}">
    <a class="bk-teams" href="#/book/${esc(g.id)}">
      <div class="bk-when">${bkKickoff(g)}</div>
      <div class="bk-team">${bkCrest(g.home)}<span>${esc(g.home.short)}</span>${g.state === 'in' && g.home.score != null ? `<b class="num">${g.home.score}</b>` : ''}</div>
      <div class="bk-team">${bkCrest(g.away)}<span>${esc(g.away.short)}</span>${g.state === 'in' && g.away.score != null ? `<b class="num">${g.away.score}</b>` : ''}</div>
    </a>
    <div class="bk-odds ${main.sels.length === 3 ? 'three' : main.sels.length === 2 ? 'two' : ''}">${main.sels.map(s => bkOdd(s, g, { show: labels.includes(s.label) ? s.label : s.label, label: marketLabel(s), market: main.name })).join('')}</div>
    <a class="bk-more" href="#/book/${esc(g.id)}" aria-label="All ${g.nMarkets} markets">${g.nMarkets > 1 ? '+' + (g.nMarkets - 1) : ic('chevRight', 'sm')}</a>
  </div>`;
}
function bkFilter(list, st, { ignoreSport, ignoreLeague } = {}) {
  const t = dayStart(now()); const q = st.q.trim().toLowerCase(); const terms = q.split(/\s+/).filter(Boolean);
  return list.filter(g => (ignoreSport || st.sport === 'all' || g.sport === st.sport) && (ignoreLeague || !st.league || g.leagueKey === st.league)
    && (st.tab !== 'live' || g.state === 'in') && (st.tab !== 'upcoming' || g.state === 'pre')
    && (st.when === 'all' || (st.when === 'today' ? dayStart(g.start) <= t : st.when === 'tomorrow' ? dayStart(g.start) === t + DAY : true))
    && (!terms.length || terms.every(w => [g.home.name, g.away.name, g.home.short, g.away.short, g.league, g.region, g.sport, g.pm.title].join(' ').toLowerCase().includes(w))));
}
function bkNav(all, st) {
  const bySport = {}; all.forEach(g => { (bySport[g.sport] = bySport[g.sport] || []).push(g); });
  const sports = Object.keys(bySport).sort((a, b) => (BOOK_SPORTS.indexOf(a) + 1 || 99) - (BOOK_SPORTS.indexOf(b) + 1 || 99));
  const leaguesOf = (sp) => { const L = {}; bySport[sp].forEach(g => { const x = L[g.leagueKey] = L[g.leagueKey] || { key: g.leagueKey, name: g.league, region: g.region, n: 0, vol: 0 }; x.n++; x.vol += g.vol || 0; }); return Object.values(L).sort((a, b) => bookRank(a.name) - bookRank(b.name) || b.vol - a.vol || b.n - a.n); };
  return `<nav class="bk-nav card" aria-label="Sports and leagues">
    <button class="bk-nav-i ${st.sport === 'all' ? 'on' : ''}" data-action="bkSport" data-v="all">${ic('grid', 'sm')}<span>All sports</span><span class="num mut">${all.length}</span></button>
    ${sports.map(sp => `<button class="bk-nav-i ${st.sport === sp && !st.league ? 'on' : ''}" data-action="bkSport" data-v="${esc(sp)}">${ic(SPORT_IC[sp] || 'ball', 'sm')}<span>${esc(sp)}</span><span class="num mut">${bySport[sp].length}</span></button>
      ${st.sport === sp ? `<div class="bk-sub">${leaguesOf(sp).map(l => `<button class="bk-nav-i sub ${st.league === l.key ? 'on' : ''}" data-action="bkLeague" data-v="${esc(l.key)}"><span>${esc(l.name)}${l.region && l.region !== 'World' ? `<i class="mut"> · ${esc(l.region)}</i>` : ''}</span><span class="num mut">${l.n}</span></button>`).join('')}</div>` : ''}`).join('')}
  </nav>`;
}
function bkModeTabs(mode) { return `<div class="seg text" role="tablist" aria-label="Sports view"><button class="${mode === 'book' ? 'on' : ''}" data-action="bkMode" data-v="book">Sportsbook</button><button class="${mode === 'scores' ? 'on' : ''}" data-action="bkMode" data-v="scores">Scores &amp; results</button></div>`; }
async function bkLoad() {
  const waits = [];
  if (Poly.gamesState === 'idle') waits.push(Poly.loadGames());
  if (Sports.state === 'idle') waits.push(Sports.poll());
  if (waits.length) await Promise.allSettled(waits);
  Sports.loadRange(now(), now() + 7 * DAY).catch(() => {}); // ESPN scores/crests for the week's games (repaints when ready)
  // Restore a previously connected Polymarket wallet so the bet slip can place bets without visiting setup.
  if (!PMTrade._re && PMTrade.saved()) { PMTrade._re = true; PMTrade.discover(); PMTrade.reconnect().then(() => PMTrade.checkRegion()).catch(() => {}); }
}

Views.sports = async (params, arg) => {
  if (params.get('league') || params.get('view') === 'scores') UI.sports.mode = 'scores';
  if (UI.sports.mode === 'scores' || UI.sports.league) return Views.sportsScores(params, arg);
  const st = UI.book; await bkLoad();
  const head = `<div class="page-head"><div><h1>Sports</h1><p>Every game with a live market — match result, handicap, totals and more. Bets are placed on Polymarket from inside Nexis.</p></div><div class="row" style="gap:8px">${bkModeTabs('book')}</div></div>`;
  const all = Book.games();
  if (!all.length) {
    const body = Poly.gamesState === 'offline' ? unavailable('Sportsbook unavailable', 'Nexis couldn’t load sports markets from Polymarket. It retries automatically.', '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>') : Poly.gamesState === 'idle' ? skeletonCards(6) : `<div class="card">${emptyState({ icon: 'soccer', title: 'No games open for betting', body: 'Polymarket has no open game markets right now. Check back soon, or see Scores & results.' })}</div>`;
    return `<div class="page">${head}${body}</div>`;
  }
  if (st.sport !== 'all' && !all.some(g => g.sport === st.sport)) { st.sport = 'all'; st.league = ''; }
  if (st.league && !all.some(g => g.leagueKey === st.league)) st.league = '';
  const liveN = bkFilter(all, { ...st, tab: 'live', when: 'all' }).length;
  const list = bkFilter(all, st).sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || a.start - b.start);
  const shown = list.slice(0, st.limit);
  // Group by league (busiest league first), games by kick-off inside each.
  const groups = new Map(); shown.forEach(g => { if (!groups.has(g.leagueKey)) groups.set(g.leagueKey, { name: g.league, region: g.region, sport: g.sport, games: [] }); groups.get(g.leagueKey).games.push(g); });
  const glist = [...groups.values()].sort((a, b) => (b.games.some(g => g.state === 'in') ? 1 : 0) - (a.games.some(g => g.state === 'in') ? 1 : 0) || bookRank(a.name) - bookRank(b.name) || b.games.reduce((n, g) => n + (g.vol || 0), 0) - a.games.reduce((n, g) => n + (g.vol || 0), 0));
  const sportsHere = [...new Set(all.map(g => g.sport))].sort((a, b) => (BOOK_SPORTS.indexOf(a) + 1 || 99) - (BOOK_SPORTS.indexOf(b) + 1 || 99));
  const hdr = (x) => x.games[0] && x.games[0].main.three ? '<span>1</span><span>X</span><span>2</span>' : '<span>1</span><span>2</span>';
  return `<div class="page bk">${head}
    <div class="bk-layout">
      ${bkNav(all, st)}
      <div class="bk-main">
        <div class="bk-chips row" style="gap:8px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px"><button class="chip ${st.sport === 'all' ? 'on' : ''}" style="flex:none" data-action="bkSport" data-v="all">All · ${all.length}</button>${sportsHere.map(sp => `<button class="chip ${st.sport === sp ? 'on' : ''}" style="flex:none" data-action="bkSport" data-v="${esc(sp)}">${ic(SPORT_IC[sp] || 'ball', 'sm')}${esc(sp)}</button>`).join('')}</div>
        <div class="sp-filters">
          <label class="search-trigger sp-search">${ic('search', 'sm')}<input id="bk-q" value="${esc(st.q)}" placeholder="Search teams, players or leagues" autocomplete="off" aria-label="Search games">${st.q ? '<button class="iconbtn" data-action="bkClearQ" aria-label="Clear search" style="width:26px;height:26px">' + ic('x', 'sm') + '</button>' : ''}</label>
          <div class="seg text">${[['all', 'All'], ['live', `Live${liveN ? ' · ' + liveN : ''}`], ['upcoming', 'Upcoming']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="bkTab" data-v="${k}">${k === 'live' && liveN ? '<span class="live-dot red" style="margin-right:6px"></span>' : ''}${l}</button>`).join('')}</div>
        </div>
        <div class="row wrap" style="gap:8px;margin:12px 0 4px">
          ${[['all', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow']].map(([k, l]) => `<button class="chip ${st.when === k ? 'on' : ''}" data-action="bkWhen" data-v="${k}">${l}</button>`).join('')}
          <select class="select" id="bk-fmt" style="width:auto;height:32px;padding:0 10px;margin-left:auto" aria-label="Odds format">${[['decimal', 'Decimal (2.50)'], ['fractional', 'Fractional (3/2)'], ['american', 'American (+150)']].map(([k, l]) => `<option value="${k}" ${st.fmt === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        ${st.league ? `<div class="row" style="gap:8px;margin-top:10px"><span class="tag">${esc((all.find(g => g.leagueKey === st.league) || {}).league || '')}</span><button class="link" data-action="bkLeague" data-v="">Show all leagues</button></div>` : ''}
        ${glist.length ? glist.map(x => `<section class="card bk-league"><div class="bk-lhead"><span>${ic(SPORT_IC[x.sport] || 'ball', 'sm')}<b>${esc(x.name)}</b>${x.region && x.region !== 'World' ? `<span class="mut"> · ${esc(x.region)}</span>` : ''}</span><span class="bk-cols ${x.games[0] && x.games[0].main.three ? 'three' : 'two'}">${hdr(x)}</span></div>${x.games.map(bkRow).join('')}</section>`).join('')
          + (list.length > shown.length ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-ghost" data-action="bkMore">Show more · ${list.length - shown.length} left</button></div>` : '')
          : `<div class="card" style="margin-top:14px">${emptyState({ icon: 'soccer', title: st.q ? `Nothing matches “${esc(st.q)}”` : st.tab === 'live' ? 'Nothing live right now' : 'No games here', body: st.tab === 'live' ? 'Live games appear here once they kick off. See Upcoming for what’s next.' : 'Try another sport, league or time.' })}</div>`}
      </div>
      <aside class="bk-slip-col"><div id="bk-slip">${bkSlip()}</div></aside>
    </div>
    ${bkSlipBar()}
  </div>`;
};

/* ---------- one game: every market ---------- */
Views.book = async (params, id) => {
  await bkLoad();
  const g = Book.get(id);
  if (!g) return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a><div class="card" style="margin-top:14px">${emptyState({ icon: 'soccer', title: 'Game not available', body: 'This game has finished or its markets have closed.' })}</div></div>`;
  const cats = ['All', ...g.groups.map(x => x.cat)]; const cur = cats.includes(UI.book.cat) ? UI.book.cat : 'All';
  const shown = cur === 'All' ? g.groups : g.groups.filter(x => x.cat === cur);
  const score = g.state === 'in' && g.home.score != null ? `<div class="bk-score num">${g.home.score} – ${g.away.score}</div>` : `<div class="bk-score mut" style="font-size:15px">vs</div>`;
  return `<div class="page bk"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a>
    <div class="card bk-hero ${g.state === 'in' ? 'live' : ''}" style="margin-top:12px">
      <div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}${g.region && g.region !== 'World' ? ' · ' + esc(g.region) : ''}</span><span style="margin-left:auto">${bkKickoff(g)}</span></div>
      <div class="bk-vs"><div class="bk-side">${g.home.logo ? `<img src="${esc(g.home.logo)}" alt="" width="44" height="44" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc(g.home.name)}</b></div>${score}<div class="bk-side">${g.away.logo ? `<img src="${esc(g.away.logo)}" alt="" width="44" height="44" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc(g.away.name)}</b></div></div>
      <div class="row" style="gap:10px;justify-content:center;font-size:12.5px">${g.espn ? `<a class="link" href="#/event/${esc(g.espn.id)}">${ic('chart', 'sm')}Match stats &amp; lineups</a>` : ''}<span class="mut">${g.nMarkets} ${g.nMarkets === 1 ? 'market' : 'markets'}${g.vol ? ` · ${kusd(g.vol)} traded on Polymarket` : ''}</span></div>
    </div>
    <div class="bk-game">
      <div style="min-width:0">
        <div class="tabs" style="margin-top:16px;overflow-x:auto">${cats.map(c => `<button class="tab ${c === cur ? 'on' : ''}" data-action="bkCat" data-v="${esc(c)}">${esc(c)}${c !== 'All' ? ` <span class="mut num">${g.groups.find(x => x.cat === c).items.length}</span>` : ''}</button>`).join('')}</div>
        ${shown.map(grp => `${cur === 'All' ? `<h2 class="bk-cat">${esc(grp.cat)}</h2>` : ''}<div class="bk-mkts">${grp.items.map(it => `<div class="card bk-mkt"><div class="bk-mkt-t">${esc(it.title)}</div><div class="bk-odds ${it.sels.length === 3 ? 'three' : 'two'}">${it.sels.map(s => bkOdd(s, g, { market: it.title })).join('')}</div></div>`).join('')}</div>`).join('')}
      </div>
      <aside class="bk-slip-col"><div id="bk-slip">${bkSlip()}</div></aside>
    </div>
    ${bkSlipBar()}
  </div>`;
};

/* ---------- bet slip ---------- */
function bkSlip() {
  const items = Book.resolved(); const fmt = UI.book.fmt;
  if (!items.length) return `<div class="card bk-slip"><div class="card-head"><h3>Bet slip</h3></div><p class="mut" style="padding:16px 18px;font-size:13px">Tap any odds to add a bet.</p></div>`;
  let total = 0, ret = 0;
  const rows = items.map(s => {
    const ok = s.m && Book.open(s.m, s.idx); const p = s.m ? Book.price(s.m, s.idx) : 0; if (ok) { total += s.stake; ret += s.stake / p; }
    return `<div class="bk-slip-i ${ok ? '' : 'off'}">
      <div class="row" style="gap:8px;align-items:flex-start"><div style="flex:1;min-width:0"><b style="font-size:13.5px">${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.market || '')}</div><div class="mut" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.game || '')}</div></div>
        <b class="num" data-odd="${esc(s.key)}">${ok ? Book.odds(p, fmt) : '—'}</b><button class="iconbtn" data-action="bkRemove" data-k="${esc(s.key)}" aria-label="Remove bet" style="width:26px;height:26px">${ic('x', 'sm')}</button></div>
      ${ok ? `<div class="row" style="gap:8px;margin-top:8px"><label class="bk-stake"><span class="mut">$</span><input inputmode="decimal" data-bk-stake="${esc(s.key)}" value="${esc(Book.stakes[s.key] || '')}" aria-label="Stake in USDC"></label><span class="mut" style="font-size:12px;margin-left:auto">Returns <b class="num" data-bk-ret="${esc(s.key)}" style="color:var(--text)">${usd(s.stake / p)}</b></span></div>` : '<div class="mut" style="font-size:12px;margin-top:6px">Market closed or suspended</div>'}
    </div>`;
  }).join('');
  const setup = !PMTrade.ready ? `<a class="btn btn-ghost block" href="#/polymarket">${ic('wallet', 'sm')}Set up Polymarket to bet</a>` : '';
  return `<div class="card bk-slip"><div class="card-head"><h3>Bet slip · ${items.length}</h3><button class="link" data-action="bkClear">Clear</button></div>${rows}
    <div class="bk-slip-f"><div class="row"><span class="mut">Total stake</span><b class="num" id="bk-total" style="margin-left:auto">${usd(total)}</b></div><div class="row"><span class="mut">Potential return</span><b class="num up" id="bk-return" style="margin-left:auto">${usd(ret)}</b></div>
      ${setup || `<button class="btn btn-primary block" data-action="bkPlace">Place ${items.length === 1 ? 'bet' : items.length + ' bets'}</button>`}
      <p class="mut" style="font-size:11.5px;margin-top:8px">Each bet is a single, placed as a Polymarket market order in USDC on Polygon (minimum $1). Accumulators aren’t available. Returns assume today’s odds; the fill price can move slightly.</p></div></div>`;
}
function bkSlipBar() { const n = Book.slip.length; return `<button class="bk-slipbar ${n ? '' : 'hide'}" data-action="bkSlipOpen" id="bk-slipbar">${ic('list', 'sm')}Bet slip<span class="bk-n num">${n}</span></button>`; }
function bkRepaintSlip() { $$('#bk-slip').forEach(el => { el.innerHTML = bkSlip(); hydrate(el); }); const b = $('#bk-slipbar'); if (b) b.outerHTML = bkSlipBar(); const m = $('.overlay .modal #bk-slip-modal'); if (m) { m.innerHTML = bkSlip(); hydrate(m); } bkBindSlip(); }
function bkBindSlip() {
  $$('[data-bk-stake]').forEach(i => { if (i._bk) return; i._bk = 1; i.addEventListener('input', () => {
    const k = i.dataset.bkStake; Book.stakes[k] = i.value; Book.saveSlip();
    let total = 0, ret = 0; Book.resolved().forEach(s => { if (!s.m || !Book.open(s.m, s.idx)) return; const p = Book.price(s.m, s.idx); total += s.stake; ret += s.stake / p; if (s.key === k) $$(`[data-bk-ret="${CSS.escape(k)}"]`).forEach(el => el.textContent = usd(s.stake / p)); });
    $$('#bk-total').forEach(el => el.textContent = usd(total)); $$('#bk-return').forEach(el => el.textContent = usd(ret));
  }); });
}
function bindBook() {
  debounceInput('#bk-q', 250, (v) => { UI.book.q = v; UI.book.limit = 60; refreshKeepFocus('#bk-q'); });
  const f = $('#bk-fmt'); if (f) f.addEventListener('change', () => { UI.book.fmt = f.value; try { localStorage.setItem('nexis-odds', f.value); } catch (e) { /* storage unavailable */ } refresh(); });
  bkBindSlip();
}
/** Places each slip bet in turn as a Polymarket market buy, then reports what filled. */
async function bkPlace() {
  if (!PMTrade.ready) return toast({ title: 'Finish Polymarket setup first', kind: 'warn', action: { label: 'Open setup', href: '#/polymarket' } });
  const bets = Book.resolved().filter(s => s.m && Book.open(s.m, s.idx));
  if (!bets.length) return toast({ title: 'No open bets on the slip', kind: 'warn' });
  const low = bets.find(s => !(s.stake >= 1)); if (low) return toast({ title: 'Minimum stake is $1', body: esc(low.label), kind: 'warn' });
  const total = bets.reduce((n, s) => n + s.stake, 0);
  const bal = PMTrade.bal && PMTrade.bal.usdc; if (bal != null && bal + 1e-9 < total) return toast({ title: 'Not enough USDC', body: `Your Polygon wallet has ${usd(bal)}; these bets need ${usd(total)}.`, kind: 'warn' });
  const done = []; const line = (s, st) => `<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:0"><b style="font-size:13px">${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.game || '')} · ${usd(s.stake)}</div></span>${st}</div>`;
  const paint = (i, note = '') => setModal(`${modalHead(`Placing ${bets.length === 1 ? 'bet' : bets.length + ' bets'}`)}<div class="modal-body">${bets.map((s, j) => line(s, j < done.length ? done[j].html : j === i ? `<span class="mut" style="font-size:12px">${esc(note || 'Sign in your wallet…')}</span>` : '<span class="mut" style="font-size:12px">Waiting</span>')).join('')}</div>`);
  openModal(''); paint(0);
  for (let i = 0; i < bets.length; i++) {
    const s = bets[i];
    try {
      const r = await PMTrade.place({ tokenId: s.m.tokens[s.idx], side: 'BUY', kind: 'market', amount: s.stake, onStep: (st) => paint(i, st === 'sign' ? 'Sign in your wallet…' : st === 'post' ? 'Sending to Polymarket…' : 'Settling on Polygon…') });
      const ok = r && r.final === 'confirmed'; done.push({ ok: true, html: `<span class="tag ${ok ? 'green' : 'blue'}">${ok ? 'Placed' : 'Settling'}</span>` }); Book.remove(s.key);
      Notify.push({ kind: 'tx', icon: 'check', text: `Bet placed: <b>${esc(s.label)}</b> · ${esc(s.game || '')} · ${usd(s.stake)}`, href: '#/polymarket?tab=Positions' });
    } catch (e) { done.push({ ok: false, html: `<span class="tag red" title="${esc(e.message)}">Not placed</span>` }); }
  }
  const okN = done.filter(d => d.ok).length; const fails = bets.map((s, j) => !done[j].ok ? s : null).filter(Boolean);
  setModal(`${modalHead(okN === bets.length ? 'Bets placed' : okN ? 'Some bets placed' : 'Bets not placed')}<div class="modal-body">${bets.map((s, j) => line(s, done[j].html)).join('')}${fails.length ? `<p class="mut" style="font-size:12.5px;margin-top:10px">Bets that weren’t placed stay on your slip. Nothing was charged for them.</p>` : ''}</div><div class="modal-foot"><a class="btn btn-ghost" href="#/polymarket?tab=Positions" data-action="closeModal">My bets</a><button class="btn btn-primary" data-action="closeModal">Done</button></div>`);
  PMTrade.loadAccount && PMTrade.loadAccount().catch(() => {}); bkRepaintSlip();
}
Bus.on('slip', () => { bkRepaintSlip(); $$('.odd[data-k]').forEach(b => { const on = Book.inSlip(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); });
Bus.on('poly:price', ({ m }) => { $$(`[data-odd^="${m.id}:"]`).forEach(el => { const idx = +el.dataset.odd.split(':')[1]; if (Book.open(m, idx)) el.textContent = Book.odds(Book.price(m, idx), UI.book.fmt); }); });
Bus.on('poly', () => { if ((current.route === 'sports' && UI.sports.mode !== 'scores' && !UI.sports.league) || current.route === 'book') softRefresh(['sports', 'book']); });
Bus.on('sports', () => { if (current.route === 'book') softRefresh(['book']); });
Bus.on('pm', () => { if (current.route === 'book' || current.route === 'sports') bkRepaintSlip(); });
