/* =====================================================================
   SPORTSBOOK VIEWS
   #/sports            sportsbook: bet-type tabs (3 Way & O/U, Double Chance,
                       GG/NG), games by day with odds columns, bet slip
                       (Scores & results tab: the ESPN views in sports.js)
   #/book/<game id>    every bet for one game
   Bets are placed on Panta from the user's Solana wallet. A bet type with no
   Panta market yet is created on Panta by the first bettor (they pay
   Panta's creation fee), registered in /api/book, then bet on.
   ===================================================================== */
UI.book = UI.book || { sport: 'all', league: '', tab: 'all', when: 'all', q: '', limit: 80, bt: '3way' };
try { UI.book.fmt = localStorage.getItem('nexis-odds') || 'decimal'; } catch (e) { UI.book.fmt = 'decimal'; }
const BK_MIN = 1;

const bkTime = (g) => new Date(g.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const bkDay = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.toLocaleDateString('en-US', { weekday: 'long' })}`; };
const bkScore = (g) => g.home.score != null && g.away.score != null ? `${g.home.score} – ${g.away.score}` : '';
/** One odds button: a side of a prop. Estimated odds (no Panta market yet) are marked with an asterisk. */
function bkOdd(g, [label, prop, side], opts = {}) {
  const key = `${g.id}|${prop}|${side}`; const q = Book.quote(g, prop, side); const on = Book.inSlip(key);
  const txt = q.p != null ? Book.odds(q.p, UI.book.fmt) : '—';
  const market = opts.market || BOOK_MARKET_NAME[prop] || Book.question(g, prop) || '';
  const title = `${market} · ${opts.full || label}${q.src === 'est' ? ' · estimated odds (from Polymarket); Panta’s price is quoted before you sign' : ' · Panta price'}`;
  return `<button class="odd ${on ? 'on' : ''} ${q.src === 'est' ? 'est' : ''}" ${q.open ? '' : 'disabled'} data-action="bkPick" data-k="${esc(key)}" data-g="${esc(g.id)}" data-l="${esc(opts.full || label)}" data-mk="${esc(market)}" aria-pressed="${on}" title="${esc(title)}">
    <span class="odd-l ${opts.showLabel ? '' : 'mob'}">${esc(label)}</span><b class="num" data-bko="${esc(key)}">${q.open || g.state === 'pre' ? esc(txt) : ic('lock', 'sm')}${q.src === 'est' && q.p != null && q.open ? '<sup>*</sup>' : ''}</b></button>`;
}
/** Full label for a column, e.g. "1" → "Man City", "X2" → "Draw or Brighton". */
function bkFull(g, label) { return { 1: g.home.short, X: 'Draw', 2: g.away.short, '1X': `${g.home.short} or draw`, 12: `${g.home.short} or ${g.away.short}`, X2: `Draw or ${g.away.short}`, GG: 'Both teams score', NG: 'Not both teams score', 'O 2.5': 'Over 2.5 goals', 'U 2.5': 'Under 2.5 goals' }[label] || label; }
function bkCols(g) { const tabs = g.tabs; return (tabs.find(t => t.id === UI.book.bt) || tabs[0]).cols; }
function bkRow(g) {
  const cols = bkCols(g); const statsHref = g.espn ? `#/event/${esc(g.espn.id)}` : `#/book/${esc(g.id)}`;
  const n = (g.football ? 10 : 2) + (g.extra || []).length * 2;
  const right = g.state === 'post'
    ? `<div class="bk-final"><span class="mut">FT</span><b class="num">${esc(bkScore(g) || '—')}</b></div>`
    : `<div class="bk-odds" style="--n:${cols.length}">${cols.map(c => bkOdd(g, c, { full: bkFull(g, c[0]) })).join('')}</div>`;
  return `<div class="bk-row ${g.state === 'in' ? 'live' : ''}">
    <div class="bk-when">${g.state === 'in' ? `<b class="bk-live"><span class="live-dot red"></span>${esc(g.clock || 'Live')}</b>` : `<b class="num">${bkTime(g)}</b>`}<span class="mut">ID: ${esc(Book.shortId(g))}</span></div>
    <a class="bk-teams" href="#/book/${esc(g.id)}"><span>${esc(g.home.short)}</span><span>${esc(g.away.short)}</span></a>
    ${g.state === 'in' && bkScore(g) ? `<b class="bk-sc num">${g.home.score}<br>${g.away.score}</b>` : ''}
    <a class="bk-stat" href="${statsHref}" aria-label="Stats for ${esc(g.home.short)} vs ${esc(g.away.short)}" title="Stats">${ic('trend', 'sm')}</a>
    ${right}
    ${g.state === 'post' ? '' : `<a class="bk-more" href="#/book/${esc(g.id)}" aria-label="All markets">+${n}</a>`}
  </div>`;
}
function bkFilter(list, st) {
  const t = dayStart(now()); const q = st.q.trim().toLowerCase(); const terms = q.split(/\s+/).filter(Boolean);
  return list.filter(g => (st.sport === 'all' || g.sport === st.sport) && (!st.league || g.leagueKey === st.league)
    && (st.tab === 'results' ? g.state === 'post' : g.state !== 'post') && (st.tab !== 'live' || g.state === 'in') && (st.tab !== 'upcoming' || g.state === 'pre')
    && (st.when === 'all' || st.tab === 'results' || (st.when === 'today' ? dayStart(g.start) <= t : dayStart(g.start) === t + DAY))
    && (!terms.length || terms.every(w => [g.home.name, g.away.name, g.home.short, g.away.short, g.league, g.region, g.sport, g.pm.title, Book.shortId(g)].join(' ').toLowerCase().includes(w))));
}
/** Leagues of one sport with open games: top leagues first, then by volume. */
function bkLeagues(all, sp) { const L = {}; all.forEach(g => { if (g.state === 'post' || g.sport !== sp) return; const x = L[g.leagueKey] = L[g.leagueKey] || { key: g.leagueKey, name: g.league, region: g.region, n: 0, vol: 0 }; x.n++; x.vol += g.vol || 0; }); return Object.values(L).sort((a, b) => bookRank(a.name) - bookRank(b.name) || b.vol - a.vol || b.n - a.n); }
function bkNav(all, st) {
  const live = all.filter(g => g.state !== 'post');
  const bySport = {}; live.forEach(g => { (bySport[g.sport] = bySport[g.sport] || []).push(g); });
  const sports = Object.keys(bySport).sort((a, b) => (BOOK_SPORTS.indexOf(a) + 1 || 99) - (BOOK_SPORTS.indexOf(b) + 1 || 99));
  const leaguesOf = (sp) => bkLeagues(all, sp);
  return `<nav class="bk-nav card" aria-label="Sports and leagues">
    <button class="bk-nav-i ${st.sport === 'all' ? 'on' : ''}" data-action="bkSport" data-v="all">${ic('grid', 'sm')}<span>All sports</span><span class="num mut">${live.length}</span></button>
    ${sports.map(sp => `<button class="bk-nav-i ${st.sport === sp && !st.league ? 'on' : ''}" data-action="bkSport" data-v="${esc(sp)}">${ic(SPORT_IC[sp] || 'ball', 'sm')}<span>${esc(sp)}</span><span class="num mut">${bySport[sp].length}</span></button>
      ${st.sport === sp ? `<div class="bk-sub">${leaguesOf(sp).map(l => `<button class="bk-nav-i sub ${st.league === l.key ? 'on' : ''}" data-action="bkLeague" data-v="${esc(l.key)}"><span>${esc(l.name)}${l.region && l.region !== 'World' ? `<i class="mut"> · ${esc(l.region)}</i>` : ''}</span><span class="num mut">${l.n}</span></button>`).join('')}</div>` : ''}`).join('')}
  </nav>`;
}
function bkModeTabs(mode) { return `<div class="seg text" role="tablist" aria-label="Sports view"><button class="${mode === 'book' ? 'on' : ''}" data-action="bkMode" data-v="book">Sportsbook</button><button class="${mode === 'scores' ? 'on' : ''}" data-action="bkMode" data-v="scores">Scores &amp; results</button></div>`; }
async function bkLoad() {
  // Only the games are needed to draw the page; ESPN scores and Panta prices fill in when they arrive.
  if (Poly.gamesState === 'idle') { const load = Poly.loadGames(); if (!Poly.games.length) await load; }
  if (Sports.state === 'idle') Sports.poll().catch(() => {});
  if (Panta.state === 'idle') Panta.loadCatalog().catch(() => {});
}

Views.sports = async (params, arg) => {
  if (params.get('league') || params.get('view') === 'scores') UI.sports.mode = 'scores';
  if (UI.sports.mode === 'scores' || UI.sports.league) return Views.sportsScores(params, arg);
  const st = UI.book; await bkLoad();
  const head = `<div class="page-head"><div><h1>Sports</h1><p>Upcoming, live and finished games from every league with a market. Bets are placed on Panta from your Solana wallet.</p></div><div class="row" style="gap:8px">${bkModeTabs('book')}</div></div>`;
  const all = Book.games();
  if (!all.length) {
    const body = Poly.gamesState === 'offline' ? unavailable('Sportsbook unavailable', 'Nexis couldn’t load the game list. It retries automatically.', '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>') : Poly.gamesState === 'idle' ? skeletonCards(6) : `<div class="card">${emptyState({ icon: 'soccer', title: 'No games right now', body: 'Check back soon, or see Scores & results.' })}</div>`;
    return `<div class="page">${head}${body}</div>`;
  }
  if (st.sport !== 'all' && !all.some(g => g.sport === st.sport)) { st.sport = 'all'; st.league = ''; }
  if (st.league && !all.some(g => g.leagueKey === st.league)) st.league = '';
  const liveN = bkFilter(all, { ...st, tab: 'live', when: 'all' }).length;
  let list = bkFilter(all, st);
  list = st.tab === 'results' ? list.sort((a, b) => b.start - a.start) : list.sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || a.start - b.start);
  const shown = list.slice(0, st.limit);
  Book.loadReg(shown.filter(g => g.state === 'pre')).catch(() => {});
  // Days → leagues → games (a live section first).
  const days = new Map(); shown.forEach(g => { const k = g.state === 'in' ? 'Live now' : bkDay(g.start); if (!days.has(k)) days.set(k, new Map()); const L = days.get(k); if (!L.has(g.leagueKey)) L.set(g.leagueKey, []); L.get(g.leagueKey).push(g); });
  const anyFootball = shown.some(g => g.football); const tabs = anyFootball ? BOOK_TABS.football : BOOK_TABS.other;
  if (!tabs.some(t => t.id === st.bt)) st.bt = tabs[0].id;
  const sportsHere = [...new Set(all.filter(g => g.state !== 'post').map(g => g.sport))].sort((a, b) => (BOOK_SPORTS.indexOf(a) + 1 || 99) - (BOOK_SPORTS.indexOf(b) + 1 || 99));
  const anyEst = shown.some(g => g.state === 'pre' && bkCols(g).some(([, p, s]) => Book.quote(g, p, s).src === 'est'));
  const section = ([day, leagues]) => `<section class="bk-day"><h2 class="bk-dayh">${esc(day)}</h2>${[...leagues.values()].sort((a, b) => bookRank(a[0].league) - bookRank(b[0].league)).map(gs => { const cols = bkCols(gs[0]); return `<div class="card bk-league"><div class="bk-lhead"><span>${ic(SPORT_IC[gs[0].sport] || 'ball', 'sm')}<b>${esc(gs[0].league)}</b>${gs[0].region && gs[0].region !== 'World' ? `<span class="mut"> · ${esc(gs[0].region)}</span>` : ''}</span>${gs[0].state === 'post' ? '<span class="bk-cols" style="--n:1"><span>Result</span></span>' : `<span class="bk-cols" style="--n:${cols.length}">${cols.map(c => `<span>${esc(c[0])}</span>`).join('')}</span>`}</div>${gs.map(bkRow).join('')}</div>`; }).join('')}</section>`;
  return `<div class="page bk">${head}
    <div class="bk-layout">
      ${bkNav(all, st)}
      <div class="bk-main">
        <div class="bk-chips row" style="gap:8px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px"><button class="chip ${st.sport === 'all' ? 'on' : ''}" style="flex:none" data-action="bkSport" data-v="all">All</button>${sportsHere.map(sp => `<button class="chip ${st.sport === sp ? 'on' : ''}" style="flex:none" data-action="bkSport" data-v="${esc(sp)}">${ic(SPORT_IC[sp] || 'ball', 'sm')}${esc(sp)}</button>`).join('')}</div>
        ${st.sport !== 'all' ? `<div class="bk-chips row" style="gap:6px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px"><button class="chip ${!st.league ? 'on' : ''}" style="flex:none;height:28px;font-size:12px" data-action="bkLeague" data-v="">All leagues</button>${bkLeagues(all, st.sport).map(l => `<button class="chip ${st.league === l.key ? 'on' : ''}" style="flex:none;height:28px;font-size:12px" data-action="bkLeague" data-v="${esc(l.key)}">${esc(l.name)} · ${l.n}</button>`).join('')}</div>` : ''}
        <div class="sp-filters">
          <label class="search-trigger sp-search">${ic('search', 'sm')}<input id="bk-q" value="${esc(st.q)}" placeholder="Search teams, leagues or game ID" autocomplete="off" aria-label="Search games">${st.q ? '<button class="iconbtn" data-action="bkClearQ" aria-label="Clear search" style="width:26px;height:26px">' + ic('x', 'sm') + '</button>' : ''}</label>
          <div class="seg text">${[['all', 'All'], ['live', `Live${liveN ? ' · ' + liveN : ''}`], ['upcoming', 'Upcoming'], ['results', 'Results']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="bkTab" data-v="${k}">${k === 'live' && liveN ? '<span class="live-dot red" style="margin-right:6px"></span>' : ''}${l}</button>`).join('')}</div>
        </div>
        <div class="row wrap" style="gap:8px;margin:12px 0 4px">
          ${st.tab === 'results' ? '' : [['all', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow']].map(([k, l]) => `<button class="chip ${st.when === k ? 'on' : ''}" data-action="bkWhen" data-v="${k}">${l}</button>`).join('')}
          <select class="select" id="bk-fmt" style="width:auto;height:32px;padding:0 10px;margin-left:auto" aria-label="Odds format">${[['decimal', 'Decimal (2.50)'], ['fractional', 'Fractional (3/2)'], ['american', 'American (+150)']].map(([k, l]) => `<option value="${k}" ${st.fmt === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        ${st.league ? `<div class="row" style="gap:8px;margin-top:10px"><span class="tag">${esc((all.find(g => g.leagueKey === st.league) || {}).league || '')}</span><button class="link" data-action="bkLeague" data-v="">Show all leagues</button></div>` : ''}
        ${st.tab === 'results' ? '' : `<div class="bk-bt" role="tablist" aria-label="Bet type">${tabs.map(t => `<button role="tab" aria-selected="${st.bt === t.id}" class="${st.bt === t.id ? 'on' : ''}" data-action="bkBt" data-v="${t.id}">${esc(t.label)}</button>`).join('')}</div>`}
        ${days.size ? [...days.entries()].map(section).join('')
          + (list.length > shown.length ? `<div style="text-align:center;margin-top:16px"><button class="btn btn-ghost" data-action="bkMore">Show more · ${list.length - shown.length} left</button></div>` : '')
          : `<div class="card" style="margin-top:14px">${emptyState({ icon: 'soccer', title: st.q ? `Nothing matches “${esc(st.q)}”` : st.tab === 'live' ? 'Nothing live right now' : st.tab === 'results' ? 'No results yet' : 'No games here', body: st.tab === 'live' ? 'Live games appear here once they kick off.' : st.tab === 'results' ? 'Games that finished in the last 3 days appear here.' : 'Try another sport, league or time.' })}</div>`}
        ${anyEst && st.tab !== 'results' ? `<p class="mut" style="font-size:12px;margin-top:12px">* Estimated odds, from Polymarket, for bets that don’t have a Panta market yet. You see Panta’s actual price before you sign.</p>` : ''}
      </div>
      <aside class="bk-slip-col"><div id="bk-slip">${bkSlip()}</div></aside>
    </div>
    ${bkSlipBar()}
  </div>`;
};

/* ---------- one game: every bet ---------- */
Views.book = async (params, id) => {
  await bkLoad();
  const g = Book.get(id);
  if (!g) return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a><div class="card" style="margin-top:14px">${emptyState({ icon: 'soccer', title: 'Game not found', body: 'It may be older than 3 days, or no longer listed.' })}</div></div>`;
  Book.loadReg([g], { extra: true }).catch(() => {});
  const status = g.state === 'in' ? `<span class="bk-live"><span class="live-dot red"></span>${esc(g.clock || 'Live')}</span>` : g.state === 'post' ? '<span class="tag">Full time</span>' : `<span class="mut">${bkDay(g.start)} · ${bkTime(g)}</span>`;
  const score = g.state !== 'pre' && bkScore(g) ? `<div class="bk-score num">${esc(bkScore(g))}</div>` : `<div class="bk-score mut" style="font-size:15px">vs</div>`;
  const card = (title, cols, sub) => `<div class="card bk-mkt"><div class="bk-mkt-t">${esc(title)}${sub ? `<div class="mut" style="font-size:11.5px;font-weight:400">${esc(sub)}</div>` : ''}</div><div class="bk-odds" style="--n:${cols.length}">${cols.map(c => bkOdd(g, c, { showLabel: true, full: c[3] || bkFull(g, c[0]), market: title })).join('')}</div></div>`;
  const core = g.football ? [
    card('1X2', [['1', 'home', 'YES'], ['X', 'draw', 'YES'], ['2', 'away', 'YES']]),
    card('Double chance', [['1X', 'away', 'NO'], ['12', 'draw', 'NO'], ['X2', 'home', 'NO']]),
    card('Total goals O/U 2.5', [['Over 2.5', 'ou25', 'YES'], ['Under 2.5', 'ou25', 'NO']]),
    card('GG/NG', [['GG', 'btts', 'YES'], ['NG', 'btts', 'NO']]),
  ] : [card('Winner', [['1', 'winner', 'YES'], ['2', 'winner', 'NO']])];
  const extra = (g.extra || []).map(m => { const yn = /^yes$/i.test(m.yesLabel); const p = 'pm:' + m.id.replace(/^pm-/, ''); return card(m.group && !/^(yes|no)$/i.test(m.group) ? m.group : m.q, [[yn ? 'Yes' : m.yesLabel, p, 'YES', yn ? 'Yes' : m.yesLabel], [yn ? 'No' : m.noLabel, p, 'NO', yn ? 'No' : m.noLabel]], m.group ? m.q : ''); });
  const statsLink = g.espn ? `<a class="link" href="#/event/${esc(g.espn.id)}">${ic('trend', 'sm')}Match stats &amp; lineups</a>` : '';
  return `<div class="page bk"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a>
    <div class="card bk-hero ${g.state === 'in' ? 'live' : ''}" style="margin-top:12px">
      <div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}${g.region && g.region !== 'World' ? ' · ' + esc(g.region) : ''} · ID ${esc(Book.shortId(g))}</span><span style="margin-left:auto">${status}</span></div>
      <div class="bk-vs"><div class="bk-side">${g.home.logo ? `<img src="${esc(g.home.logo)}" alt="" width="44" height="44" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc(g.home.name)}</b></div>${score}<div class="bk-side">${g.away.logo ? `<img src="${esc(g.away.logo)}" alt="" width="44" height="44" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc(g.away.name)}</b></div></div>
      <div class="row" style="gap:10px;justify-content:center;font-size:12.5px">${statsLink}</div>
    </div>
    <div class="bk-game">
      <div style="min-width:0">
        ${g.state === 'post' ? `<div class="card" style="margin-top:16px">${emptyState({ icon: 'check', title: 'Full time', body: 'Betting has closed. Panta’s Resolution Agent settles each market from the result; winning bets can be claimed in Portfolio.' })}</div>`
          : `${g.state === 'in' ? `<div class="sim-note" style="margin-top:16px">${ic('info', 'sm')}<span>Betting closes at kick-off; in-play bets aren’t available.</span></div>` : ''}
        <h2 class="bk-cat">Main</h2><div class="bk-mkts">${core.join('')}</div>
        ${extra.length ? `<h2 class="bk-cat">More markets</h2><div class="bk-mkts">${extra.join('')}</div>` : ''}
        <p class="mut" style="font-size:12px;margin-top:12px">* Estimated odds, from Polymarket, for bets that don’t have a Panta market yet. Each bet is a YES/NO position on a Panta market, settled by Panta’s Resolution Agent from the result.</p>`}
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
  let total = 0, ret = 0, retKnown = true;
  const rows = items.map(s => {
    const ok = s.g && s.q.open; const p = s.q.p;
    if (ok) { total += s.stake; if (p) ret += s.stake / p; else retKnown = false; }
    const game = s.g ? `${s.g.home.short} vs ${s.g.away.short}` : (s.game || '');
    return `<div class="bk-slip-i ${ok ? '' : 'off'}">
      <div class="row" style="gap:8px;align-items:flex-start"><div style="flex:1;min-width:0"><b style="font-size:13.5px">${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.market || '')}</div><div class="mut" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(game)}</div></div>
        <b class="num" data-bko="${esc(s.key)}">${ok && p ? esc(Book.odds(p, fmt)) + (s.q.src === 'est' ? '<sup>*</sup>' : '') : '—'}</b><button class="iconbtn" data-action="bkRemove" data-k="${esc(s.key)}" aria-label="Remove bet" style="width:26px;height:26px">${ic('x', 'sm')}</button></div>
      ${ok ? `<div class="row" style="gap:8px;margin-top:8px"><label class="bk-stake"><span class="mut">$</span><input inputmode="decimal" data-bk-stake="${esc(s.key)}" value="${esc(Book.stakes[s.key] || '')}" aria-label="Stake in USDC"></label><span class="mut" style="font-size:12px;margin-left:auto">Returns <b class="num" data-bk-ret="${esc(s.key)}" style="color:var(--text)">${p ? usd(s.stake / p) : '—'}</b></span></div>
        ${s.q.market ? '' : `<div class="mut" style="font-size:11.5px;margin-top:6px">${ic('plus', 'sm')} First bet on this outcome: you’ll create its Panta market (Panta’s fee is shown before you sign).</div>`}` : `<div class="mut" style="font-size:12px;margin-top:6px">${s.g && s.g.state !== 'pre' ? 'Betting closed at kick-off' : 'No longer available'}</div>`}
    </div>`;
  }).join('');
  const w = typeof primaryWallet === 'function' ? primaryWallet() : null;
  const cta = !Auth.user ? `<button class="btn btn-primary block" data-action="bkPlace">Log in to bet</button>` : !w ? `<button class="btn btn-primary block" data-action="bkPlace">${ic('wallet', 'sm')}Connect a Solana wallet</button>` : `<button class="btn btn-primary block" data-action="bkPlace">Place ${items.length === 1 ? 'bet' : items.length + ' bets'}</button>`;
  return `<div class="card bk-slip"><div class="card-head"><h3>Bet slip · ${items.length}</h3><button class="link" data-action="bkClear">Clear</button></div>${rows}
    <div class="bk-slip-f"><div class="row"><span class="mut">Total stake</span><b class="num" id="bk-total" style="margin-left:auto">${usd(total)}</b></div><div class="row"><span class="mut">Potential return</span><b class="num up" id="bk-return" style="margin-left:auto">${retKnown ? usd(ret) : '—'}</b></div>
      ${cta}
      <p class="mut" style="font-size:11.5px;margin-top:8px">Each bet is a single, placed on Panta in USDC from your Solana wallet (minimum $${BK_MIN}). You review Panta’s price, shares and fees before signing. Winnings are claimed in Portfolio after Panta settles the market.</p></div></div>`;
}
function bkSlipBar() { const n = Book.slip.length; return `<button class="bk-slipbar ${n ? '' : 'hide'}" data-action="bkSlipOpen" id="bk-slipbar">${ic('list', 'sm')}Bet slip<span class="bk-n num">${n}</span></button>`; }
function bkRepaintSlip() { $$('#bk-slip').forEach(el => { el.innerHTML = bkSlip(); hydrate(el); }); const b = $('#bk-slipbar'); if (b) b.outerHTML = bkSlipBar(); const m = $('.overlay .modal #bk-slip-modal'); if (m) { m.innerHTML = bkSlip(); hydrate(m); } bkBindSlip(); }
function bkBindSlip() {
  $$('[data-bk-stake]').forEach(i => { if (i._bk) return; i._bk = 1; i.addEventListener('input', () => {
    const k = i.dataset.bkStake; Book.stakes[k] = i.value; Book.saveSlip();
    let total = 0, ret = 0, known = true; Book.resolved().forEach(s => { if (!s.g || !s.q.open) return; total += s.stake; if (s.q.p) ret += s.stake / s.q.p; else known = false; if (s.key === k) $$(`[data-bk-ret="${CSS.escape(k)}"]`).forEach(el => el.textContent = s.q.p ? usd(s.stake / s.q.p) : '—'); });
    $$('#bk-total').forEach(el => el.textContent = usd(total)); $$('#bk-return').forEach(el => el.textContent = known ? usd(ret) : '—');
  }); });
}
function bindBook() {
  debounceInput('#bk-q', 250, (v) => { UI.book.q = v; UI.book.limit = 80; refreshKeepFocus('#bk-q'); });
  const f = $('#bk-fmt'); if (f) f.addEventListener('change', () => { UI.book.fmt = f.value; try { localStorage.setItem('nexis-odds', f.value); } catch (e) { /* storage unavailable */ } refresh(); });
  bkBindSlip();
}

/* ---------- placing bets on Panta ---------- */
/** Waits until Panta's API knows a just-created market (it indexes new markets within seconds). */
async function bkAwaitMarket(id) { for (let i = 0; i < 10; i++) { try { const m = await Panta.detail(id); if (m) return m; } catch (e) { /* not indexed yet */ } await delay(2000); } return null; }
/** Creates the Panta market for one prop (the bettor signs and pays Panta's fee), then registers it for everyone. */
async function bkCreate(bet, wallet, onStep) {
  const body = Book.createBody(bet.g, bet.prop); if (!body) throw new Error('This bet type can’t be created for this game.');
  onStep('Getting Panta’s creation quote');
  const q = bet.createQuote && now() - bet.createQuote.at < 4 * 60e3 ? bet.createQuote.q : await Panta.quoteCreate({ ...body, wallet: wallet.address });
  onStep('Building the market');
  const b = await Panta.buildCreate({ createId: q.createId, wallet: wallet.address }); if (!b.transaction) throw new Error(b.disclaimer || 'Panta returned no transaction to sign.');
  const prov = await Wallets.provider(wallet); const tx = await Chain.txFromBase64(b.transaction);
  onStep('Sign the new market in your wallet');
  const marketId = b.expectedEventPda || q.expectedEventPda;
  const rec = await Tx.run({ kind: 'Create market', desc: body.question, marketId, amount: -nz(b.paymentUsdc || q.paymentUsdc) / 1e6, prov, tx, lastValidBlockHeight: b.lastValidBlockHeight });
  if (!Tx.ok(rec)) throw new Error('The market creation didn’t confirm on Solana. No bet was placed.');
  onStep('Registering the market');
  await Panta.registerCreate({ createId: q.createId, signature: rec.sig });
  let use = { marketId, question: body.question };
  try { const r = await Net.api('book', { method: 'POST', body: { action: 'register', game: bet.g.id, prop: bet.prop, marketId, signature: rec.sig, question: body.question } }); if (r.market) use = r.market; } catch (e) { /* the bet still works on this market; others may create their own */ }
  Book.reg.set(bet.g.id + ':' + bet.prop, use); Panta.rememberTitle(use.marketId, use.question);
  onStep('Waiting for Panta to open the market');
  const m = await bkAwaitMarket(use.marketId); if (!m) throw new Error('The market was created but Panta hasn’t listed it yet. Try the bet again in a minute; it won’t be created twice.');
  return m;
}
/** Buys one side of a Panta market (the same steps as a market page order). */
async function bkBuy(bet, marketId, wallet, onStep) {
  onStep('Getting Panta’s price');
  const q = await Panta.quoteBuy({ wallet: wallet.address, marketId, side: bet.side, amountUsdc: bet.stake.toFixed(2) });
  onStep('Building the bet');
  const b = await Panta.buildBuy({ quoteId: q.quoteId, wallet: wallet.address, maxSlippageBps: 100 });
  if (!b.instructions || !b.instructions.length) throw new Error(b.disclaimer || 'Panta returned nothing to sign.');
  const prov = await Wallets.provider(wallet); const tx = await Chain.txFromInstructions(b, wallet.address);
  onStep(`Sign the bet in ${wallet.label}`);
  const rec = await Tx.run({ kind: 'Bet ' + bet.side, desc: `${bet.label} · ${bet.g.home.short} vs ${bet.g.away.short}`, marketId, amount: -bet.stake, prov, tx, lastValidBlockHeight: b.lastValidBlockHeight });
  if (!Tx.ok(rec)) throw new Error('The bet didn’t confirm on Solana.');
  onStep('Recording with Panta');
  await Promise.allSettled([Panta.submitBuy({ orderId: b.orderId, signature: rec.sig, wallet: wallet.address }), Panta.report({ signature: rec.sig, wallet: wallet.address, marketId })]);
  const k = marketId + ':' + bet.side; const e = Store.s.entries[k] || { usdc: 0, shares: 0 }; e.usdc += bet.stake; e.shares += nz(b.expectedShares || q.shares); Store.s.entries[k] = e; Store.save();
  return { sig: rec.sig, shares: nz(b.expectedShares || q.shares), price: nz(q.avgPrice, null) };
}
async function bkPlace() {
  if (!Auth.user) return requireAuth(() => {}, 'Log in to bet');
  const w = primaryWallet(); if (!w) return openWalletFlow({ mode: 'link' });
  if (Panta.mode === 'test') return toast({ title: 'Panta is in test mode', body: 'The server uses a pk_test_ key, so bets can’t be signed.', kind: 'warn' });
  const bets = Book.resolved().filter(s => s.g && s.q.open);
  if (!bets.length) return toast({ title: 'No open bets on the slip', kind: 'warn' });
  const low = bets.find(s => !(s.stake >= BK_MIN)); if (low) return toast({ title: `Minimum stake is $${BK_MIN}`, body: esc(low.label), kind: 'warn' });
  const total = bets.reduce((n, s) => n + s.stake, 0);
  if (Balances.v && Balances.v.usdc != null && Balances.v.usdc + 1e-9 < total) return toast({ title: 'Not enough USDC', body: `Your wallet holds ${fmtNum(Balances.v.usdc, 2)} USDC; these bets need ${usd(total)}.`, kind: 'warn' });
  // Review: Panta's price for bets whose market exists; the creation fee for the rest.
  openModal(`${modalHead('Review bets')}<div class="modal-body"><div class="pipe">${pipeStep('Getting quotes from Panta', 'run')}</div></div>`, { label: 'Review bets' });
  await Book.loadReg(bets.map(b => b.g)).catch(() => {});
  let fees = 0;
  for (const s of bets) {
    const reg = Book.reg.get(s.g.id + ':' + s.prop); s.marketId = reg && reg.marketId;
    try {
      if (s.marketId) { const q = await Panta.quoteBuy({ wallet: w.address, marketId: s.marketId, side: s.side, amountUsdc: s.stake.toFixed(2) }); s.preview = { price: nz(q.avgPrice, null), shares: nz(q.shares), fee: nz(q.feeUsdc) }; }
      else { const body = Book.createBody(s.g, s.prop); const q = await Panta.quoteCreate({ ...body, wallet: w.address }); s.createQuote = { at: now(), q }; s.fee = nz(q.paymentUsdc) / 1e6; fees += s.fee; }
    } catch (e) { s.err = e.message; }
  }
  const line = (s) => `<div class="bk-rev"><div style="flex:1;min-width:0"><b>${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.market || '')} · ${esc(s.g.home.short)} vs ${esc(s.g.away.short)}</div>
    <div style="font-size:12px;margin-top:3px">${s.err ? `<span class="down">${esc(s.err)}</span>` : s.preview ? `Panta odds <b class="num">${s.preview.price ? Book.odds(s.preview.price, UI.book.fmt) : '—'}</b> · ~${fmtNum(s.preview.shares, 2)} shares · returns ~${usd(s.preview.shares)}${s.preview.fee ? ` · fee ${fmtNum(s.preview.fee, 2)} USDC` : ''}` : `<span class="amber">New Panta market</span> · creation fee <b class="num">${fmtNum(s.fee, 2)} USDC</b> · odds set when it opens`}</div></div><b class="num">${usd(s.stake)}</b></div>`;
  const ok = bets.filter(s => !s.err);
  setModal(`${modalHead('Review bets')}<div class="modal-body">${bets.map(line).join('')}
    <div class="order-sum" style="margin-top:10px"><div><span>Stakes</span><span>${usd(ok.reduce((n, s) => n + s.stake, 0))}</span></div>${fees ? `<div><span>Market creation fees</span><span>${fmtNum(fees, 2)} USDC</span></div>` : ''}<div><span>Signatures</span><span>${ok.reduce((n, s) => n + (s.marketId ? 1 : 2), 0)} in ${esc(w.label)}</span></div></div>
    ${fees ? infoNote('A bet on an outcome nobody has bet on yet first creates its Panta market (one extra signature). Panta’s Resolution Agent settles it from the result, and everyone after you bets on the same market.') : ''}
    <p class="mut" style="font-size:12px">Prices can move before you sign; each bet uses a 1% slippage limit. If a market resolves against you, that stake is lost.</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn btn-primary" data-action="bkConfirm" ${ok.length ? 'autofocus' : 'disabled'}>Place ${ok.length === 1 ? 'bet' : ok.length + ' bets'}</button></div>`);
  UI.book.pending = { bets: ok, wallet: w };
}
async function bkConfirm() {
  const P = UI.book.pending; if (!P) return; UI.book.pending = null; const { bets, wallet } = P;
  const done = [];
  const paint = (i, note) => setModal(`${modalHead(`Placing ${bets.length === 1 ? 'bet' : bets.length + ' bets'}`)}<div class="modal-body">${bets.map((s, j) => `<div class="bk-rev"><div style="flex:1;min-width:0"><b>${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.g.home.short)} vs ${esc(s.g.away.short)} · ${usd(s.stake)}</div></div>${j < done.length ? done[j].html : j === i ? `<span class="mut" style="font-size:12px;text-align:right">${esc(note || '')}</span>` : '<span class="mut" style="font-size:12px">Waiting</span>'}</div>`).join('')}</div>`);
  for (let i = 0; i < bets.length; i++) {
    const s = bets[i]; const step = (t) => paint(i, t); paint(i, 'Starting…');
    try {
      let marketId = s.marketId || (Book.reg.get(s.g.id + ':' + s.prop) || {}).marketId;
      if (!marketId) { const m = await bkCreate(s, wallet, step); marketId = m.id; }
      const r = await bkBuy(s, marketId, wallet, step);
      done.push({ ok: true, html: `<a class="tag green" href="${explorerTx(r.sig)}" target="_blank" rel="noopener">Placed</a>` }); Book.remove(s.key);
      Notify.push({ kind: 'tx', icon: 'check', text: `Bet placed: <b>${esc(s.label)}</b> · ${esc(s.g.home.short)} vs ${esc(s.g.away.short)} · ${usd(s.stake)}`, href: '#/portfolio' });
    } catch (e) { done.push({ ok: false, html: `<span class="tag red" title="${esc(e.message)}">Not placed</span>` }); s.err = e.message; }
  }
  const okN = done.filter(d => d.ok).length; const fails = bets.filter((s, j) => !done[j].ok);
  setModal(`${modalHead(okN === bets.length ? 'Bets placed' : okN ? 'Some bets placed' : 'Bets not placed')}<div class="modal-body">${bets.map((s, j) => `<div class="bk-rev"><div style="flex:1;min-width:0"><b>${esc(s.label)}</b><div class="mut" style="font-size:11.5px">${esc(s.g.home.short)} vs ${esc(s.g.away.short)} · ${usd(s.stake)}</div>${!done[j].ok ? `<div class="down" style="font-size:12px">${esc(s.err || '')}</div>` : ''}</div>${done[j].html}</div>`).join('')}${fails.length ? '<p class="mut" style="font-size:12.5px;margin-top:10px">Bets that weren’t placed stay on your slip.</p>' : ''}</div><div class="modal-foot"><a class="btn btn-ghost" href="#/portfolio" data-action="closeModal">My bets</a><button class="btn btn-primary" data-action="closeModal">Done</button></div>`);
  Portfolio.load && Portfolio.load(true); Balances.refresh && Balances.refresh(); bkRepaintSlip();
}
Bus.on('slip', () => { bkRepaintSlip(); $$('.odd[data-k]').forEach(b => { const on = Book.inSlip(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); });
Bus.on('poly', () => { if ((current.route === 'sports' && UI.sports.mode !== 'scores' && !UI.sports.league) || current.route === 'book') softRefresh(['sports', 'book']); });
Bus.on('book:reg', () => { if ((current.route === 'sports' && UI.sports.mode !== 'scores' && !UI.sports.league) || current.route === 'book') softRefresh(['sports', 'book']); });
Bus.on('sports', () => { if (current.route === 'book') softRefresh(['book']); });
