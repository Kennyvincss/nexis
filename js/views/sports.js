/* =====================================================================
   LIVE SPORTS — scoreboard hub + match page (ESPN data, auto-updating)
   Related markets are real Panta (tradable) and Polymarket (reference)
   markets whose titles mention the teams. No odds are invented.
   ===================================================================== */
function crest(t, size = '') {
  if (t.logo && /^https:\/\//.test(t.logo)) return `<span class="crest ${size}" style="background:var(--card-3);overflow:hidden"><img src="${esc(t.logo)}" alt="" style="width:78%;height:78%;object-fit:contain" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  return `<span class="crest ${size}" style="background:${esc(t.color)};color:${t.ink}">${esc((t.abbr || t.short || '?').slice(0, 3))}</span>`;
}
const scoreText = (g) => g.kind === 'field' ? (g.leaders && g.leaders[0] ? g.leaders[0].name : '') : g.state === 'pre' || g.home.score == null ? 'vs' : `${g.home.score}–${g.away.score}`;
function gameBadge(g) {
  if (g.state === 'in') return `<span class="live-badge sm"><span class="live-dot red"></span>${esc(g.detail || g.clock || 'LIVE')}</span>`;
  if (g.state === 'post') return `<span class="tag">${esc(g.detail || 'Final')}</span>`;
  return `<span class="tag">${esc(Sports.label(g))}</span>`;
}
function scoreboardHtml(g, big = false) {
  return `<div class="sb ${big ? 'big' : ''}"><div class="sb-team">${crest(g.home, big ? 'lg' : '')}<span>${esc(big ? g.home.name : g.home.short)}</span></div><div class="sb-score num" data-gscore="${g.id}">${scoreText(g)}</div><div class="sb-team r"><span>${esc(big ? g.away.name : g.away.short)}</span>${crest(g.away, big ? 'lg' : '')}</div></div>`;
}
const isFollowed = (id) => !!(Store.s && Store.s.followedEvents.includes(id));
function followBtn(g, sm = true) { const on = isFollowed(g.id); return `<button class="btn ${on ? 'btn-blue' : 'btn-ghost'} ${sm ? 'sm' : ''}" data-action="followEvent" data-id="${g.id}" aria-pressed="${on}" style="position:relative;z-index:2">${ic(on ? 'bell' : 'bellOff', 'sm')}${on ? 'Following' : 'Follow'}</button>`; }
function leaderRows(g, n) { return (g.leaders || []).slice(0, n).map(r => `<div class="lb-row"><span class="num mut">${esc(r.pos)}</span>${r.flag ? `<img src="${esc(r.flag)}" alt="" width="16" height="11" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span></span>'}<span class="lb-name">${esc(r.name)}</span><span class="num">${esc(r.score)}</span><span class="mut num">${esc(r.thru)}</span></div>`).join(''); }
function gameCard(g) {
  const rel = Sports.related(g); const n = rel.panta.length + rel.poly.length;
  const top = `<div class="ecard-top">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">${esc(g.league)}${g.kind !== 'team' && g.tournament && g.tournament !== g.league ? ' · ' + esc(g.tournament) : ''}</span><span style="margin-left:auto;flex:none">${gameBadge(g)}</span></div>`;
  const body = g.kind === 'field'
    ? `<a href="#/event/${g.id}" class="ecard-link" aria-label="Open ${esc(g.name)}"><b style="font-size:15px">${esc(g.name)}</b>${g.session ? ` <span class="mut" style="font-size:12px">${esc(g.session)}</span>` : ''}</a><div class="lb">${leaderRows(g, 5) || '<p class="mut" style="font-size:12.5px">Leaderboard appears when play starts.</p>'}</div>`
    : `<a href="#/event/${g.id}" class="ecard-link" aria-label="Open ${esc(g.name)}">${scoreboardHtml(g)}</a>${g.kind === 'match' ? `<div class="mut num" style="font-size:12px;text-align:center">${esc(g.setLine || g.round || '')}</div>` : ''}`;
  return `<article class="ecard ${g.state === 'in' ? 'live' : ''}" data-game="${g.id}">${top}${body}
    ${g.lastPlay && g.state === 'in' ? `<div class="mut" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.lastPlay)}</div>` : ''}
    ${gameOdds(g, rel)}
    <div class="mcard-foot"><span>${n ? `<b>${n}</b> market${n === 1 ? '' : 's'} to trade` : '<span class="mut">No markets yet</span>'}</span>${g.odds && g.odds.text ? `<span class="mut" title="${esc(g.odds.provider || 'Sportsbook')} line via ESPN">${esc(g.odds.text)}</span>` : ''}<span style="margin-left:auto">${followBtn(g)}</span></div>
  </article>`;
}
/* The game's Polymarket win / draw prices as quick trade buttons (moneyline markets only). */
function gameOdds(g, rel) {
  if (!rel.pmEvent || g.state === 'post') return '';
  const ms = rel.poly.filter(m => m.game === rel.pmEvent.id);
  const lbl = (m) => { const q = String(m.q || ''); if (/draw/i.test(q)) return 'Draw'; const side = [g.home, g.away].find(t => teamMatch(t, q.replace(/^will\s+/i, '').replace(/\s+win.*$/i, ''), null)); return side ? side.short : null; };
  let picks = ms.map(m => ({ m, l: lbl(m), p: m.yes, idx: 0 })).filter(x => x.l && /^will /i.test(x.m.q));
  if (!picks.length && ms[0] && ms[0].yesLabel !== 'Yes') picks = [{ m: ms[0], l: ms[0].yesLabel, p: ms[0].yes }, { m: ms[0], l: ms[0].noLabel, p: 1 - ms[0].yes }];
  if (!picks.length) return '';
  const order = (x) => x.l === g.home.short ? 0 : x.l === 'Draw' ? 1 : 2; picks.sort((a, b) => order(a) - order(b));
  return `<div class="row" style="gap:6px;position:relative;z-index:2">${picks.slice(0, 3).map(x => `<a class="btn btn-ghost sm" style="flex:1;justify-content:space-between;min-width:0" href="#/polymarket/${x.m.id}" title="Trade on Polymarket in Nexis"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.l)}</span><b class="num">${Math.round(x.p * 100)}¢</b></a>`).join('')}</div>`;
}
function sportsState() {
  if (Sports.games.size) return null;
  if (Sports.state === 'offline') return unavailable('Live sports unavailable', `Nexis couldn’t reach ESPN${Sports.error ? ': ' + esc(Sports.error.message || String(Sports.error)) : ''}. It retries automatically.`, '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>');
  if (Sports.state === 'idle') return skeletonCards(6);
  return null;
}
/* Day picker: last 7 days … next 7 days, plus week-long Results / Upcoming lists. */
function sportsDays() {
  const t = dayStart(now()); const out = [{ k: 'past', label: 'Results', sub: 'Last 7 days' }];
  for (let i = -7; i <= 7; i++) { const d = t + i * DAY; out.push({ k: i === 0 ? 'today' : ymd(d), t: d, label: i === 0 ? 'Today' : i === -1 ? 'Yesterday' : i === 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-US', { weekday: 'short' }), sub: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }); }
  out.push({ k: 'next', label: 'Upcoming', sub: 'Next 7 days' }); return out;
}
function sportsSelection(day) {
  const t = dayStart(now());
  if (day === 'past') return { from: t - 7 * DAY, to: t - DAY, multi: true, order: -1, title: 'Results · last 7 days' };
  if (day === 'next') return { from: t + DAY, to: t + 7 * DAY, multi: true, order: 1, title: 'Upcoming · next 7 days' };
  if (day === 'today' || !/^\d{8}$/.test(day || '')) return { from: t, to: t, today: true, order: 1 };
  const d = new Date(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)).getTime();
  return { from: d, to: d, order: d < t ? -1 : 1, title: new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) };
}
const SPORT_ORDER = ['Football', 'Basketball', 'Tennis', 'Baseball', 'Hockey', 'MMA', 'Golf', 'Motorsport', 'Rugby', 'Lacrosse', 'Volleyball', 'Field Hockey', 'Water Polo'];
const gameText = (g) => [g.name, g.league, g.tournament, g.round, g.sport, g.home && g.home.name, g.away && g.away.name, g.home && g.home.abbr, g.away && g.away.abbr, g.venue, ...(g.leaders || []).slice(0, 20).map(r => r.name)].filter(Boolean).join(' ').toLowerCase();
Views.sportsScores = async (params) => {
  const st = UI.sports; if (params.get('q') != null) st.q = params.get('q'); if (params.get('day')) st.day = params.get('day'); st.day = st.day || 'today';
  st.status = st.status || 'all'; st.sport = st.sport || 'all'; st.q = st.q || ''; st.limit = st.limit || 60;
  if (params.get('league')) st.league = params.get('league');
  if (st.league && !st.league.includes('/')) st.league = '';
  if (st.league) return sportsLeagueView(st);
  const days = sportsDays(); if (!days.some(d => d.k === st.day)) st.day = 'today';
  const sel = sportsSelection(st.day);
  const head = `<div class="page-head"><div><h1>Sports</h1><p>Live scores, results and fixtures from ESPN for football, basketball, tennis, US sports, MMA, golf, motorsport, rugby and more.</p></div><div class="row" style="gap:8px">${bkModeTabs('scores')}${srcBadge('espn')}</div></div>`;
  if (Sports.state === 'idle') await Sports.poll();
  let rangeErr = null; try { await Sports.loadRange(sel.from, sel.to); } catch (e) { rangeErr = e; }
  const rs = Sports.rangeState(sel.from, sel.to);
  if (!Sports.games.size) { const blocked = sportsState() || (rangeErr || (rs && rs.error) ? unavailable('Sports data unavailable', `Nexis couldn’t load the schedule from ESPN${(rangeErr || rs.error).message ? ': ' + esc((rangeErr || rs.error).message) : ''}. It retries automatically.`, '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>') : null); if (blocked) return `<div class="page">${head}${daysHtml(days, st.day)}${blocked}</div>`; }
  let pool = Sports.between(sel.from, sel.to);
  if (sel.today) Sports.list().filter(g => g.state === 'in').forEach(g => { if (!pool.includes(g)) pool.push(g); });
  if (st.day === 'past') pool = pool.filter(g => g.state !== 'pre');
  // search
  const q = st.q.trim().toLowerCase(); const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length) pool = pool.filter(g => { const t = gameText(g); return terms.every(w => t.includes(w)); });
  // facets (computed before the sport/league/status filters so counts stay useful)
  const bySport = {}; pool.forEach(g => bySport[g.sport] = (bySport[g.sport] || 0) + 1);
  const sportsHere = Object.keys(bySport).sort((a, b) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99));
  if (st.sport !== 'all' && !bySport[st.sport]) st.sport = 'all';
  const inSport = pool.filter(g => st.sport === 'all' || g.sport === st.sport);
  const leagueRank = (name) => { const i = LEAGUES.findIndex(L => L[2] === name); return i < 0 ? 999 : i; };
  const byLeague = {}; inSport.forEach(g => { const k = g.sp + '/' + g.lg; byLeague[k] = (byLeague[k] || 0) + 1; });
  const STATUS = { all: () => true, live: g => g.state === 'in', upcoming: g => g.state === 'pre', finished: g => g.state === 'post' };
  const counts = { live: inSport.filter(STATUS.live).length, upcoming: inSport.filter(STATUS.upcoming).length, finished: inSport.filter(STATUS.finished).length };
  let list = inSport.filter(STATUS[st.status] || STATUS.all);
  if (st.following) list = list.filter(g => isFollowed(g.id));
  if (st.bettable) list = list.filter(g => { const r = Sports.related(g); return r.panta.length + r.poly.length > 0; });
  list.sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) * (sel.multi ? 0 : 1) || (sel.multi ? 0 : leagueRank(a.league) - leagueRank(b.league)) || (a.start - b.start) * sel.order);
  const total = list.length; const shown = list.slice(0, st.limit);
  const groups = {}; shown.forEach(g => { const k = sel.multi ? new Date(g.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : g.league + (g.kind !== 'team' ? '' : ''); (groups[k] = groups[k] || []).push(g); });
  const groupList = Object.entries(groups); if (!sel.multi) groupList.sort((a, b) => leagueRank(a[0]) - leagueRank(b[0]));
  const partial = rs && rs.failed > rs.ok ? `<div class="sim-note" style="margin-bottom:14px">${ic('info', 'sm')}<span>Some leagues didn’t load from ESPN just now. Retrying automatically.</span></div>` : '';
  const leagueOpts = leagueOptions(st.sport, byLeague, st.league);
  return `<div class="page">${head}${daysHtml(days, st.day)}
    <div class="sp-filters">
      <label class="search-trigger sp-search">${ic('search', 'sm')}<input id="sp-q" value="${esc(st.q)}" placeholder="Search teams, players, leagues, tournaments" autocomplete="off" aria-label="Search sports">${st.q ? '<button class="iconbtn" data-action="spClear" aria-label="Clear search" style="width:26px;height:26px">' + ic('x', 'sm') + '</button>' : ''}</label>
      <div class="seg text">${[['all', 'All'], ['live', `Live${counts.live ? ' · ' + counts.live : ''}`], ['upcoming', `Upcoming${counts.upcoming ? ' · ' + counts.upcoming : ''}`], ['finished', `Finished${counts.finished ? ' · ' + counts.finished : ''}`]].map(([k, l]) => `<button class="${st.status === k ? 'on' : ''}" data-action="spStatus" data-v="${k}">${k === 'live' && counts.live ? '<span class="live-dot red" style="margin-right:6px"></span>' : ''}${l}</button>`).join('')}</div>
    </div>
    <div class="row wrap" style="gap:8px;margin:12px 0 16px">
      <select class="select" id="sp-sport" style="width:auto;max-width:100%;height:34px;padding:0 10px" aria-label="Sport"><option value="all">All sports (${pool.length})</option>${sportsHere.map(sp => `<option value="${esc(sp)}" ${st.sport === sp ? 'selected' : ''}>${esc(sp)} (${bySport[sp]})</option>`).join('')}</select>
      <select class="select" id="sp-league" style="width:auto;max-width:100%;height:34px;padding:0 10px" aria-label="Open a league"><option value="">Open a league…</option>${leagueOpts}</select>
      <button class="chip ${st.bettable ? 'on' : ''}" data-action="spToggle" data-k="bettable" aria-pressed="${!!st.bettable}">${ic('chart', 'sm')}Has markets</button>
      <button class="chip ${st.following ? 'on' : ''}" data-action="spToggle" data-k="following" aria-pressed="${!!st.following}">${ic('bell', 'sm')}Following</button>
      ${st.q || st.sport !== 'all' || st.status !== 'all' || st.bettable || st.following ? '<button class="link" data-action="spReset">Reset filters</button>' : ''}
      <span class="mut" style="margin-left:auto;font-size:12.5px">${total} ${total === 1 ? 'event' : 'events'}</span>
    </div>
    ${Sports.state === 'stale' && sel.today ? `<div class="sim-note" style="margin-bottom:14px">${ic('alert', 'sm')}<span>ESPN didn’t respond to the last refresh — scores may be behind. Retrying.</span></div>` : ''}${partial}
    ${sel.title ? `<h2 style="font-size:17px;margin-bottom:12px">${esc(sel.title)}</h2>` : ''}
    ${shown.length ? groupList.map(([k, gs]) => `<section class="section" style="margin-top:${sel.title ? 14 : 18}px"><div class="section-head"><h2 style="font-size:15px">${esc(k)}</h2><span class="mut" style="font-size:12px">${gs.length} ${gs.length === 1 ? 'event' : 'events'}</span></div><div class="grid gauto">${gs.map(gameCard).join('')}</div></section>`).join('') + (total > shown.length ? `<div style="text-align:center;margin-top:18px"><button class="btn btn-ghost" data-action="spMore">Show more · ${total - shown.length} left</button></div>` : '')
      : `<div class="card">${emptyState({ icon: 'soccer', title: q ? `Nothing matches “${esc(st.q)}”` : st.status === 'live' ? 'Nothing live right now' : st.following ? 'You’re not following any of these' : st.bettable ? 'No events with markets here' : 'No events', body: q ? 'Try a team, player, league or tournament name, or another day.' : st.bettable ? 'Only events with a related Panta or Polymarket market are shown. Turn off “Has markets” to see everything.' : st.day === 'past' ? 'No results in the last 7 days for this filter.' : st.day === 'next' ? 'No fixtures in the next 7 days for this filter.' : 'Nothing scheduled on this day for this filter.' })}</div>`}
  </div>`;
};
/* League shortcuts shown above the filters on every Sports page. */
const TOP_LEAGUES = ['soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1', 'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/usa.1', 'soccer/ksa.1', 'basketball/nba', 'basketball/wnba', 'baseball/mlb', 'hockey/nhl', 'tennis/atp', 'tennis/wta', 'mma/ufc', 'racing/f1'];
const leagueName = (key) => { const L = Sports.meta.get(key); return L ? L[2] : key.split('/').slice(1).join('/'); };
/* Top leagues, first in every league dropdown. */
function topLeagueOptions(cur) { return `<optgroup label="Top leagues">${TOP_LEAGUES.filter(k => !sportExcluded({ key: k })).map(k => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(leagueName(k))}</option>`).join('')}</optgroup>`; }
function topLeagueChips(cur) {
  return `<div class="row sp-top" style="gap:8px;margin:14px 0 2px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px" role="navigation" aria-label="Top leagues">${TOP_LEAGUES.map(k => { const L = Sports.meta.get(k); return `<button class="chip ${k === cur ? 'on' : ''}" style="flex:none" data-action="spLeague" data-v="${esc(k)}">${ic(SPORT_IC[L ? L[3] : ''] || 'ball', 'sm')}${esc(leagueName(k))}</button>`; }).join('')}</div>`;
}
/* Every league Nexis knows (built-in list + ones ESPN's catalogue added), grouped by sport. */
function leagueOptions(sport, counts, cur) {
  const bySp = {}; [...Sports.meta.values()].forEach(L => { if (sportExcluded({ path: L[0], key: L[0] + '/' + L[1], name: L[2], sport: L[3] })) return; const lab = L[3] || SPORT_LABEL_OF_PATH[L[0]] || L[0]; if (sport !== 'all' && lab !== sport) return; (bySp[lab] = bySp[lab] || []).push(L); });
  const rank = (L) => { const i = LEAGUES.findIndex(x => x[0] === L[0] && x[1] === L[1]); return i < 0 ? 9999 : i; };
  return (sport === 'all' ? topLeagueOptions(cur) : '') + Object.keys(bySp).sort((a, b) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99)).map(lab => `<optgroup label="${esc(lab)}">${bySp[lab].sort((a, b) => rank(a) - rank(b) || String(a[2]).localeCompare(String(b[2]))).map(L => { const k = L[0] + '/' + L[1]; const n = counts && counts[k]; return `<option value="${esc(k)}" ${k === cur && !(sport === 'all' && TOP_LEAGUES.includes(k)) ? 'selected' : ''}>${esc(L[2])}${n ? ` (${n} today)` : ''}</option>`; }).join('')}</optgroup>`).join('');
}
/* One league: live now, upcoming fixtures (next 4 weeks) and recent results (last 7 days). */
async function sportsLeagueView(st) {
  const key = st.league; let err = null;
  try { await Sports.loadLeague(key); } catch (e) { err = e; }
  const L = Sports.meta.get(key); const name = leagueName(key); const t = dayStart(now());
  let pool = Sports.inLeague(key).filter(g => g.start >= t - 8 * DAY && g.start < t + 30 * DAY);
  const q = st.q.trim().toLowerCase(); const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length) pool = pool.filter(g => { const x = gameText(g); return terms.every(w => x.includes(w)); });
  const STATUS = { all: () => true, live: g => g.state === 'in', upcoming: g => g.state === 'pre', finished: g => g.state === 'post' };
  const counts = { live: pool.filter(STATUS.live).length, upcoming: pool.filter(STATUS.upcoming).length, finished: pool.filter(STATUS.finished).length };
  let list = pool.filter(STATUS[st.status] || STATUS.all);
  if (st.following) list = list.filter(g => isFollowed(g.id));
  if (st.bettable) list = list.filter(g => { const r = Sports.related(g); return r.panta.length + r.poly.length > 0; });
  const live = list.filter(STATUS.live).sort((a, b) => a.start - b.start);
  const up = list.filter(STATUS.upcoming).sort((a, b) => a.start - b.start).slice(0, st.limit);
  const done = list.filter(STATUS.finished).sort((a, b) => b.start - a.start).slice(0, st.limit);
  const byDay = (gs, prefix) => { const o = {}; gs.forEach(g => { const k = prefix + new Date(g.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); (o[k] = o[k] || []).push(g); }); return Object.entries(o); };
  const sections = [...(live.length ? [['Live now', live]] : []), ...byDay(up, ''), ...byDay(done, 'Result · ')];
  const more = list.filter(STATUS.upcoming).length > up.length || list.filter(STATUS.finished).length > done.length;
  const withMk = pool.filter(g => { const r = Sports.related(g); return r.panta.length + r.poly.length > 0; }).length;
  const head = `<div class="page-head"><div><a class="link" href="#/sports" data-action="spLeague" data-v="">${ic('chevLeft', 'sm')}All sports</a><h1 style="margin-top:6px">${esc(name)}</h1><p>${esc(L ? L[3] : '')}${L ? ' · ' : ''}${counts.upcoming} upcoming · ${counts.finished} results in the last week${withMk ? ` · ${withMk} with markets` : ''}</p></div>${srcBadge('espn')}</div>`;
  const empty = err && !pool.length ? unavailable('League unavailable', `Nexis couldn’t load ${esc(name)} from ESPN${err.message ? ': ' + esc(err.message) : ''}. It retries automatically.`, '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>')
    : `<div class="card">${emptyState({ icon: 'soccer', title: q ? `Nothing matches “${esc(st.q)}”` : st.bettable ? 'No games with markets yet' : 'No games in this window', body: q ? 'Try another team or player name.' : st.bettable ? 'Polymarket usually lists a game’s markets a few days before kick-off. Turn off “Has markets” to see every fixture.' : `${esc(name)} has no games from the last 7 days through the next 4 weeks — it may be between seasons.` })}</div>`;
  return `<div class="page">${head}
    <div class="sp-filters" style="margin-top:12px">
      <label class="search-trigger sp-search">${ic('search', 'sm')}<input id="sp-q" value="${esc(st.q)}" placeholder="Search ${esc(name)} teams or players" autocomplete="off" aria-label="Search this league">${st.q ? '<button class="iconbtn" data-action="spClear" aria-label="Clear search" style="width:26px;height:26px">' + ic('x', 'sm') + '</button>' : ''}</label>
      <div class="seg text">${[['all', 'All'], ['live', `Live${counts.live ? ' · ' + counts.live : ''}`], ['upcoming', `Upcoming${counts.upcoming ? ' · ' + counts.upcoming : ''}`], ['finished', `Results${counts.finished ? ' · ' + counts.finished : ''}`]].map(([k, l]) => `<button class="${st.status === k ? 'on' : ''}" data-action="spStatus" data-v="${k}">${k === 'live' && counts.live ? '<span class="live-dot red" style="margin-right:6px"></span>' : ''}${l}</button>`).join('')}</div>
    </div>
    <div class="row wrap" style="gap:8px;margin:12px 0 16px">
      <select class="select" id="sp-league" style="width:auto;max-width:100%;height:34px;padding:0 10px" aria-label="League"><option value="">All sports</option>${leagueOptions('all', null, key)}</select>
      <button class="chip ${st.bettable ? 'on' : ''}" data-action="spToggle" data-k="bettable" aria-pressed="${!!st.bettable}">${ic('chart', 'sm')}Has markets</button>
      <button class="chip ${st.following ? 'on' : ''}" data-action="spToggle" data-k="following" aria-pressed="${!!st.following}">${ic('bell', 'sm')}Following</button>
      <span class="mut" style="margin-left:auto;font-size:12.5px">${list.length} ${list.length === 1 ? 'game' : 'games'}</span>
    </div>
    ${sections.length ? sections.map(([k, gs]) => `<section class="section" style="margin-top:18px"><div class="section-head"><h2 style="font-size:15px">${esc(k)}</h2><span class="mut" style="font-size:12px">${gs.length} ${gs.length === 1 ? 'game' : 'games'}</span></div><div class="grid gauto">${gs.map(gameCard).join('')}</div></section>`).join('') + (more ? `<div style="text-align:center;margin-top:18px"><button class="btn btn-ghost" data-action="spMore">Show more</button></div>` : '') : empty}
  </div>`;
}
function daysHtml(days, cur) {
  return `<div class="daystrip" role="tablist" aria-label="Choose a day">${days.map(d => `<button role="tab" aria-selected="${d.k === cur}" class="${d.k === cur ? 'on' : ''} ${d.k === 'past' || d.k === 'next' ? 'wide' : ''}" data-action="sportDay" data-day="${d.k}"><b>${esc(d.label)}</b><span>${esc(d.sub)}</span></button>`).join('')}</div>`;
}

/* ---------- match page ---------- */
Views.event = async (params, id) => {
  if (Sports.state === 'idle' || !Sports.games.has(id)) await Sports.poll();
  let g = Sports.games.get(id); if (!g) { try { g = await Sports.fetchGame(id); } catch (e) { g = null; } }
  if (!g) { const b = sportsState(); return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a><div style="margin-top:14px">${b || `<div class="card">${emptyState({ icon: 'soccer', title: 'Game not found', body: 'ESPN has no game with this link. It may have been removed, or the link is wrong.' })}</div>`}</div></div>`; }
  const rel = Sports.related(g); Panta.watch(rel.panta.map(m => m.id));
  if (g.kind === 'match' || g.kind === 'field') return eventSimple(g, rel);
  return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a>
    <div class="card ev-hero ${g.state === 'in' ? 'live' : ''}" style="margin-top:12px" id="ev-hero">${eventHero(g)}</div>
    <div class="mkt-layout" style="margin-top:16px"><div style="min-width:0" class="stack">
      <div class="card"><div class="card-head"><h3>Match stats</h3>${srcBadge('espn', true)}</div><div id="ev-stats" style="padding:8px 18px 12px"><p class="mut" style="font-size:13px;padding:8px 0">Loading from ESPN…</p></div></div>
      <div class="card"><div class="card-head"><h3>${g.sport === 'Football' ? 'Key events' : 'Play-by-play'}</h3></div><div id="ev-events">${detailsTimeline(g)}</div></div>
      <div class="card"><div class="card-head"><h3>Lineups &amp; leaders</h3></div><div id="ev-lineups"><p class="mut" style="padding:14px 18px;font-size:13px">Loading…</p></div></div>
    </div><aside class="stack">
      <div id="ev-markets">${relatedMarketsCard(rel, `No Panta markets mention ${g.home.short} or ${g.away.short} yet.`)}</div>
      <div class="card"><div class="card-head"><h3>Game info</h3></div><div id="ev-info">${gameInfo(g)}</div></div>
    </aside></div></div>`;
};
/* Tennis / MMA (player vs player) and golf / racing (leaderboard) event pages. */
function eventSimple(g, rel) {
  return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a>
    <div class="card ev-hero ${g.state === 'in' ? 'live' : ''}" style="margin-top:12px" id="ev-hero">${eventHero(g)}</div>
    <div class="mkt-layout" style="margin-top:16px"><div style="min-width:0" class="stack">
      <div class="card"><div class="card-head"><h3>${g.kind === 'field' ? 'Leaderboard' + (g.session ? ' · ' + esc(g.session) : '') : g.sport === 'Tennis' ? 'Set by set' : 'Fight'}</h3>${srcBadge('espn', true)}</div><div id="ev-board">${eventBoard(g)}</div></div>
    </div><aside class="stack">
      <div id="ev-markets">${relatedMarketsCard(rel, g.kind === 'field' ? `No Panta markets mention ${g.name} yet.` : `No Panta markets mention ${g.home.name} or ${g.away.name} yet.`)}</div>
      <div class="card"><div class="card-head"><h3>Event info</h3></div><div id="ev-info">${gameInfo(g)}</div></div>
    </aside></div></div>`;
}
function eventBoard(g) {
  if (g.kind === 'field') return g.leaders.length ? `<div class="lb big"><div class="lb-row lb-head"><span>Pos</span><span></span><span>Name</span><span>${g.sport === 'Golf' ? 'To par' : 'Result'}</span><span>${g.sport === 'Golf' ? 'Thru' : ''}</span></div>${leaderRows(g, 40)}</div>` : `<p class="mut" style="padding:14px 18px;font-size:13px">${g.state === 'pre' ? 'The leaderboard appears once play starts.' : 'ESPN hasn’t published a leaderboard for this event.'}</p>`;
  const n = Math.max(g.home.sets.length, g.away.sets.length);
  if (!n) return `<p class="mut" style="padding:14px 18px;font-size:13px">${g.state === 'pre' ? 'Scores appear once the match starts.' : g.state === 'post' ? `${esc((g.home.winner ? g.home : g.away).name)} won${g.detail ? ' · ' + esc(g.detail) : ''}.` : 'Live — no score breakdown published.'}</p>`;
  const row = (p, o) => `<tr><td>${p.logo ? `<img src="${esc(p.logo)}" alt="" width="18" height="12" style="vertical-align:middle;margin-right:6px" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b style="font-weight:${p.winner ? 700 : 500}">${esc(p.name)}</b>${p.winner ? ' ' + ic('check', 'sm') : ''}</td>${Array.from({ length: n }, (_, i) => { const x = p.sets[i], y = o.sets[i]; const won = x && y && x.v > y.v; return `<td class="r num" style="${won ? 'font-weight:700' : 'color:var(--muted)'}">${x && x.v != null ? x.v : ''}${x && x.tb != null ? `<sup>${x.tb}</sup>` : ''}</td>`; }).join('')}</tr>`;
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Player</th>${Array.from({ length: n }, (_, i) => `<th class="r">Set ${i + 1}</th>`).join('')}</tr></thead><tbody>${row(g.home, g.away)}${row(g.away, g.home)}</tbody></table></div>`;
}
function eventHero(g) {
  if (g.kind === 'field') return `<div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}</span><span style="margin-left:auto" class="row">${gameBadge(g)}${followBtn(g)}</span></div>
    <h1 style="font-size:clamp(22px,3vw,32px);margin:14px 0 6px">${esc(g.name)}</h1>
    ${g.leaders[0] ? `<p class="dim" style="font-size:14px">${g.state === 'post' ? 'Winner' : 'Leader'}: <b style="color:var(--text)">${esc(g.leaders[0].name)}</b>${g.leaders[0].score ? ' · ' + esc(g.leaders[0].score) : ''}</p>` : ''}
    <div class="row wrap ev-meta"><span>${ic('clock', 'sm')}${esc(g.state === 'pre' ? Sports.label(g) : g.detail || '')}</span>${g.session ? `<span>${ic('flag', 'sm')}${esc(g.session)}</span>` : ''}${g.venue ? `<span>${ic('flag', 'sm')}${esc(g.venue)}</span>` : ''}<span class="mut" style="margin-left:auto">Updated ${agoT(Sports.updatedAt || now())}</span></div>`;
  if (g.kind === 'match') return `<div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}${g.tournament ? ' · ' + esc(g.tournament) : ''}</span><span style="margin-left:auto" class="row">${gameBadge(g)}${followBtn(g)}</span></div>
    ${scoreboardHtml(g, true)}
    ${g.setLine ? `<p class="num" style="text-align:center;font-size:15px;margin-bottom:6px">${esc(g.setLine)}</p>` : ''}
    <div class="row wrap ev-meta"><span>${ic('clock', 'sm')}${esc(g.state === 'pre' ? Sports.label(g) : g.detail || '')}</span>${g.round ? `<span>${ic('trophy', 'sm')}${esc(g.round)}</span>` : ''}${g.venue ? `<span>${ic('flag', 'sm')}${esc(g.venue)}</span>` : ''}<span class="mut" style="margin-left:auto">Updated ${agoT(Sports.updatedAt || now())}</span></div>`;
  return `<div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}</span>${g.notes ? `<span class="mut">· ${esc(g.notes)}</span>` : ''}<span style="margin-left:auto" class="row">${gameBadge(g)}${followBtn(g)}</span></div>
    ${scoreboardHtml(g, true)}
    ${g.state === 'in' && g.lastPlay ? `<p class="dim" style="text-align:center;font-size:13px;margin-bottom:6px">${esc(g.lastPlay)}</p>` : ''}
    <div class="row wrap ev-meta"><span>${ic('clock', 'sm')}${esc(g.state === 'pre' ? Sports.label(g) : g.detail || '')}</span>${g.venue ? `<span>${ic('flag', 'sm')}${esc(g.venue)}${g.city ? ', ' + esc(g.city) : ''}</span>` : ''}${g.broadcast ? `<span>${ic('radio', 'sm')}${esc(g.broadcast)}</span>` : ''}${g.odds && g.odds.text ? `<span title="Sportsbook line published by ESPN">${ic('chart', 'sm')}${esc(g.odds.text)}${g.odds.ou != null ? ' · O/U ' + esc(g.odds.ou) : ''}${g.odds.provider ? ' <span class="mut">(' + esc(g.odds.provider) + ')</span>' : ''}</span>` : ''}<span class="mut" style="margin-left:auto">Updated ${agoT(Sports.updatedAt || now())}</span></div>`;
}
function gameInfo(g) {
  if (g.kind === 'match' || g.kind === 'field') { const rows = [['Starts', new Date(g.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })], ['Ends', g.end ? fmtDate(g.end, { month: 'short', day: 'numeric' }) : ''], ['Status', g.detail || g.statusName], ['Competition', g.league], ['Event', g.tournament], [g.kind === 'field' ? 'Session' : 'Round', g.kind === 'field' ? g.session : g.round], ['Venue', g.venue], ['Records', g.kind === 'match' ? [g.home.record && `${g.home.short} ${g.home.record}`, g.away.record && `${g.away.short} ${g.away.record}`].filter(Boolean).join(' · ') : '']].filter(r => r[1]);
    return rows.map(([k, v]) => `<div class="row" style="padding:10px 18px;border-bottom:1px solid var(--line);font-size:13px;gap:12px"><span class="mut" style="width:90px;flex:none">${k}</span><span>${esc(v)}</span></div>`).join(''); }
  const s = Sports.summaries[g.id];
  const rows = [['Kick-off', new Date(g.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })], ['Status', g.detail || g.statusName], ['Venue', g.venue], ['Broadcast', g.broadcast], ['Attendance', s && s.attendance ? Number(s.attendance).toLocaleString('en-US') : ''], ['Officials', s && s.officials.length ? s.officials.join(', ') : ''], ['Records', [g.home.record && `${g.home.short} ${g.home.record}`, g.away.record && `${g.away.short} ${g.away.record}`].filter(Boolean).join(' · ')], ['Form', [g.home.form && `${g.home.short} ${g.home.form}`, g.away.form && `${g.away.short} ${g.away.form}`].filter(Boolean).join(' · ')]].filter(r => r[1]);
  return rows.map(([k, v]) => `<div class="row" style="padding:10px 18px;border-bottom:1px solid var(--line);font-size:13px;gap:12px"><span class="mut" style="width:90px;flex:none">${k}</span><span>${esc(v)}</span></div>`).join('') + (s && s.news.length ? `<div style="padding:10px 18px">${s.news.map(n => n.url ? `<a class="link" style="display:flex;font-size:12.5px;margin:4px 0" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)} ${ic('ext', 'sm')}</a>` : '').join('')}</div>` : '');
}
function detailsTimeline(g) {
  const s = Sports.summaries[g.id];
  const icFor = (k) => k === 'goal' ? (g.sport === 'Basketball' ? 'basketball' : g.sport === 'American Football' ? 'amfootball' : 'soccer') : k === 'yellow' || k === 'red' ? 'card' : k === 'sub' ? 'repeat' : 'whistle';
  const colFor = (k) => k === 'yellow' ? 'color:var(--amber)' : k === 'red' ? 'color:var(--red)' : k === 'goal' ? 'color:var(--text)' : '';
  if (g.sport === 'Football') {
    const list = (s && s.key.length ? s.key.map(k => ({ min: k.min, kind: k.kind, text: k.text })) : g.details.map(d => ({ min: d.min, kind: d.kind, text: `${d.kind === 'goal' ? 'Goal' : d.text} — ${d.who}${d.og ? ' (own goal)' : ''}${d.pen ? ' (pen)' : ''} · ${(d.side === 'home' ? g.home : g.away).short}` }))).slice().reverse();
    if (!list.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${g.state === 'pre' ? 'Events appear here from kick-off.' : 'No key events reported yet.'}</p>`;
    return list.slice(0, 40).map(e => `<div class="tl ${e.kind}"><span class="tl-min num">${esc(e.min)}</span><span class="tl-ic" style="${colFor(e.kind)}">${ic(icFor(e.kind), 'sm')}</span><div class="tl-t">${esc(e.text)}</div></div>`).join('');
  }
  const plays = s ? s.plays : [];
  if (!plays.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${g.state === 'pre' ? 'Play-by-play appears once the game starts.' : g.lastPlay ? esc(g.lastPlay) : 'Loading play-by-play…'}</p>`;
  return plays.map(p => `<div class="tl ${p.score ? 'goal' : ''}"><span class="tl-min num">${p.period ? 'Q' + p.period : ''}</span><span class="tl-ic">${p.score ? ic(icFor('goal'), 'sm') : ''}</span><div class="tl-t">${esc(p.text)}${p.score && p.home != null ? ` <span class="num mut">${p.home}–${p.away}</span>` : ''}<div class="mut num" style="font-size:11.5px">${esc(p.min)}</div></div></div>`).join('');
}
function statsBlock(g) {
  const s = Sports.summaries[g.id];
  const T = s && s.teamStats.length ? s.teamStats : null;
  const H = T ? T.find(t => t.id === g.home.id) || T[0] : null, A = T ? T.find(t => t.id === g.away.id) || T[1] : null;
  let rows = [];
  if (H && A) { const am = new Map(A.stats.map(x => [x.name, x])); rows = H.stats.map(h => [h.label, h.value, (am.get(h.name) || {}).value]).filter(r => r[2] != null && r[1] !== '' && r[1] != null); }
  else { const hs = g.home.stats, as = g.away.stats; rows = Object.keys(hs).filter(k => as[k] != null).map(k => [k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), hs[k], as[k]]); }
  if (!rows.length) return `<p class="mut" style="font-size:13px;padding:8px 0">${g.state === 'pre' ? 'Team statistics appear once the game starts.' : 'ESPN hasn’t published team statistics for this game.'}</p>`;
  const head = `<div class="srow" style="font-weight:600"><span>${esc(g.home.abbr || g.home.short)}</span><span></span><span>${esc(g.away.abbr || g.away.short)}</span></div>`;
  return head + rows.slice(0, 16).map(([label, a, b]) => {
    const na = parseFloat(String(a).replace('%', '')), nb = parseFloat(String(b).replace('%', ''));
    const bars = Number.isFinite(na) && Number.isFinite(nb) && !/[-:]/.test(String(a)) && na + nb > 0;
    const tot = na + nb;
    return `<div class="srow"><span class="num">${esc(a)}</span><div class="sbar">${bars ? `<div class="sl"><i style="width:${na / tot * 100}%;background:${esc(g.home.color)}"></i></div>` : '<span></span>'}<span>${esc(label)}</span>${bars ? `<div class="sr"><i style="width:${nb / tot * 100}%;background:${esc(g.away.color)}"></i></div>` : '<span></span>'}</div><span class="num">${esc(b)}</span></div>`;
  }).join('');
}
function lineupsBlock(g) {
  const s = Sports.summaries[g.id]; if (!s) return '<p class="mut" style="padding:14px 18px;font-size:13px">Loading…</p>';
  const team = (id) => id === g.home.id ? g.home : id === g.away.id ? g.away : null;
  const parts = [];
  if (s.rosters.some(r => r.players.length)) parts.push(`<div class="grid g2" style="gap:0">${s.rosters.map(r => { const t = team(r.id); const st = r.players.filter(p => p.starter), sub = r.players.filter(p => !p.starter); return `<div style="padding:12px 18px;border-bottom:1px solid var(--line)"><div class="row" style="gap:8px;margin-bottom:8px">${t ? crest(t, 'sm') : ''}<b style="font-size:13.5px">${esc(t ? t.name : '')}</b>${r.formation ? `<span class="tag">${esc(r.formation)}</span>` : ''}</div>${st.map(p => `<div class="row" style="font-size:12.5px;gap:8px;padding:2px 0"><span class="num mut" style="width:22px">${esc(p.num || '')}</span><span>${esc(p.name)}</span><span class="mut" style="margin-left:auto;font-size:11px">${esc(p.pos || '')}</span></div>`).join('')}${sub.length ? `<div class="mut" style="font-size:11.5px;margin-top:8px">Bench: ${sub.slice(0, 12).map(p => esc(p.name) + (p.subbedIn ? ' ↑' : '')).join(', ')}</div>` : ''}</div>`; }).join('')}</div>`);
  if (s.leaders.some(l => l.cats.length)) parts.push(`<div class="grid g2" style="gap:0">${s.leaders.map(l => { const t = team(l.id); return `<div style="padding:12px 18px"><div class="row" style="gap:8px;margin-bottom:6px">${t ? crest(t, 'sm') : ''}<b style="font-size:13px">${esc(t ? t.short : '')} leaders</b></div>${l.cats.slice(0, 4).map(c => `<div class="row" style="font-size:12.5px;padding:3px 0;gap:8px"><span class="mut" style="width:96px;flex:none">${esc(c.cat)}</span><span>${esc(c.who)}</span><span class="num" style="margin-left:auto">${esc(c.val || '')}</span></div>`).join('')}</div>`; }).join('')}</div>`);
  if (!parts.length && s.players.some(p => p.groups.length)) parts.push(s.players.map(tp => { const t = team(tp.id); const gr = tp.groups[0]; if (!gr) return ''; return `<div class="table-wrap"><div class="card-head"><h3 style="font-size:13px">${esc(t ? t.name : '')}</h3></div><table class="t"><thead><tr><th>Player</th>${gr.labels.slice(0, 8).map(l => `<th class="r">${esc(l)}</th>`).join('')}</tr></thead><tbody>${gr.rows.map(r => `<tr><td>${esc(r.name)}</td>${r.stats.slice(0, 8).map(v => `<td class="r num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }).join(''));
  return parts.join('') || `<p class="mut" style="padding:14px 18px;font-size:13px">${g.state === 'pre' ? 'Lineups are usually published about an hour before kick-off.' : 'No lineup data published for this game.'}</p>`;
}
async function paintEventSummary(id) {
  const g = Sports.games.get(id); if (!g || current.route !== 'event' || current.arg !== id) return;
  if (g.kind === 'match' || g.kind === 'field') return paintEventParts(id);
  try { await Sports.summary(g); } catch (e) { const s = $('#ev-stats'); if (s && !Sports.summaries[id]) s.innerHTML = `<p class="mut" style="font-size:13px;padding:8px 0">Match details unavailable: ${esc(e.message)}</p>`; }
  if (current.arg !== id) return; paintEventParts(id);
}
function paintEventParts(id) {
  const g = Sports.games.get(id); if (!g) return;
  if (g.kind === 'match' || g.kind === 'field') { const b = $('#ev-board'); if (b) { const h = eventBoard(g); if (b.innerHTML !== h) b.innerHTML = h; } const hero = $('#ev-hero'); if (hero) { const h = eventHero(g); if (hero.dataset.sig !== h) { hero.innerHTML = h; hero.dataset.sig = h; hero.classList.toggle('live', g.state === 'in'); } } const inf = $('#ev-info'); if (inf) inf.innerHTML = gameInfo(g); return; }
  const set = (sel, html) => { const el = $(sel); if (el && el.innerHTML !== html) el.innerHTML = html; };
  set('#ev-stats', statsBlock(g)); set('#ev-events', detailsTimeline(g)); set('#ev-lineups', lineupsBlock(g)); set('#ev-info', gameInfo(g));
  const hero = $('#ev-hero'); if (hero) { const h = eventHero(g); if (hero.dataset.sig !== h) { hero.innerHTML = h; hero.dataset.sig = h; hero.classList.toggle('live', g.state === 'in'); } }
}
