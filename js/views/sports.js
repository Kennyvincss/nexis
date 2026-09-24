/* =====================================================================
   LIVE SPORTS — scoreboard hub + match page (ESPN data, auto-updating)
   Related markets are real Panta (tradable) and Polymarket (reference)
   markets whose titles mention the teams. No odds are invented.
   ===================================================================== */
function crest(t, size = '') {
  if (t.logo && /^https:\/\//.test(t.logo)) return `<span class="crest ${size}" style="background:var(--card-3);overflow:hidden"><img src="${esc(t.logo)}" alt="" style="width:78%;height:78%;object-fit:contain" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  return `<span class="crest ${size}" style="background:${esc(t.color)};color:${t.ink}">${esc((t.abbr || t.short || '?').slice(0, 3))}</span>`;
}
const scoreText = (g) => g.state === 'pre' || g.home.score == null ? 'vs' : `${g.home.score}–${g.away.score}`;
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
function gameCard(g) {
  const rel = Sports.related(g); const n = rel.panta.length + rel.poly.length;
  return `<article class="ecard ${g.state === 'in' ? 'live' : ''}" data-game="${g.id}">
    <div class="ecard-top">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span style="white-space:nowrap">${esc(g.league)}</span><span style="margin-left:auto">${gameBadge(g)}</span></div>
    <a href="#/event/${g.id}" class="ecard-link" aria-label="Open ${esc(g.name)}">${scoreboardHtml(g)}</a>
    ${g.lastPlay && g.state === 'in' ? `<div class="mut" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.lastPlay)}</div>` : ''}
    <div class="mcard-foot"><span>${n ? `<b>${n}</b> related market${n === 1 ? '' : 's'}` : '<span class="mut">No markets yet</span>'}</span>${g.odds && g.odds.text ? `<span class="mut" title="${esc(g.odds.provider || 'Sportsbook')} line via ESPN">${esc(g.odds.text)}</span>` : ''}<span style="margin-left:auto">${followBtn(g)}</span></div>
  </article>`;
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
const SPORT_ORDER = ['Football', 'Basketball', 'American Football', 'Baseball', 'Hockey', 'Australian Football'];
Views.sports = async (params) => {
  const st = UI.sports; if (params.get('f')) st.filter = params.get('f'); if (params.get('day')) st.day = params.get('day'); st.day = st.day || 'today';
  const days = sportsDays(); if (!days.some(d => d.k === st.day)) st.day = 'today';
  const sel = sportsSelection(st.day);
  const head = `<div class="page-head"><div><h1>Sports</h1><p>Live scores update automatically. Pick a day to see results and upcoming fixtures.</p></div>${srcBadge('espn')}</div>`;
  if (Sports.state === 'idle') await Sports.poll();
  let rangeErr = null; try { await Sports.loadRange(sel.from, sel.to); } catch (e) { rangeErr = e; }
  const rs = Sports.rangeState(sel.from, sel.to);
  if (!Sports.games.size) { const blocked = sportsState() || (rangeErr || (rs && rs.error) ? unavailable('Sports data unavailable', `Nexis couldn’t load the schedule from ESPN${(rangeErr || rs.error).message ? ': ' + esc((rangeErr || rs.error).message) : ''}. It retries automatically.`, '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>') : null); if (blocked) return `<div class="page">${head}${daysHtml(days, st.day)}${blocked}</div>`; }
  let pool = Sports.between(sel.from, sel.to);
  if (sel.today) Sports.list().filter(g => g.state === 'in').forEach(g => { if (!pool.includes(g)) pool.push(g); });
  if (st.day === 'past') pool = pool.filter(g => g.state !== 'pre');
  const F = { All: () => true, Live: (g) => g.state === 'in', Following: (g) => isFollowed(g.id) };
  const sportsHere = [...new Set(pool.map(g => g.sport))].sort((a, b) => SPORT_ORDER.indexOf(a) - SPORT_ORDER.indexOf(b)); sportsHere.forEach(sp => { F[sp] = (g) => g.sport === sp; });
  if (!F[st.filter]) st.filter = 'All';
  const leagueRank = (name) => { const i = LEAGUES.findIndex(L => L[2] === name); return i < 0 ? 999 : i; };
  const leaguesHere = [...new Set(pool.filter(F[st.filter]).map(g => g.league))].sort((a, b) => leagueRank(a) - leagueRank(b));
  if (st.league && !leaguesHere.includes(st.league)) st.league = '';
  if (!sel.today && st.filter === 'Live') st.filter = 'All';
  const chips = Object.keys(F).filter(k => k !== 'Live' || sel.today); const live = pool.filter(F.Live).length;
  const list = pool.filter(F[st.filter] || F.All).filter(g => !st.league || g.league === st.league).sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) * (sel.multi ? 0 : 1) || (a.start - b.start) * sel.order);
  const groups = {}; list.forEach(g => { const k = sel.multi ? new Date(g.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : g.league; (groups[k] = groups[k] || []).push(g); });
  const groupList = Object.entries(groups); if (!sel.multi) groupList.sort((a, b) => leagueRank(a[0]) - leagueRank(b[0]));
  const partial = rs && rs.failed > rs.ok ? `<div class="sim-note" style="margin-bottom:14px">${ic('info', 'sm')}<span>${rs.failed} league${rs.failed === 1 ? '' : 's'} didn’t load from ESPN just now. Retrying automatically.</span></div>` : '';
  return `<div class="page">${head}${daysHtml(days, st.day)}
    <div class="row wrap" style="gap:8px;margin:14px 0 18px">${chips.map(k => `<button class="chip ${k === st.filter ? 'on' : ''}" data-action="sportFilter" data-f="${esc(k)}">${k === 'Live' ? `<span class="live-dot red"></span>Live${live ? ' · ' + live : ''}` : esc(k)}</button>`).join('')}${leaguesHere.length > 1 ? `<select class="select" id="sp-league" style="width:auto;height:32px;padding:0 10px;margin-left:auto" aria-label="League"><option value="">All leagues · ${leaguesHere.length}</option>${leaguesHere.map(l => `<option value="${esc(l)}" ${l === st.league ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>
    ${Sports.state === 'stale' && sel.today ? `<div class="sim-note" style="margin-bottom:14px">${ic('alert', 'sm')}<span>ESPN didn’t respond to the last refresh — scores may be behind. Retrying.</span></div>` : ''}${partial}
    ${sel.title ? `<h2 style="font-size:17px;margin-bottom:12px">${esc(sel.title)}</h2>` : ''}
    ${list.length ? groupList.map(([k, gs]) => `<section class="section" style="margin-top:${sel.title ? 14 : 22}px"><div class="section-head"><h2 style="font-size:15px">${esc(k)}</h2><span class="mut" style="font-size:12px">${gs.length} game${gs.length === 1 ? '' : 's'}</span></div><div class="grid gauto">${gs.map(gameCard).join('')}</div></section>`).join('')
      : `<div class="card">${emptyState({ icon: 'soccer', title: st.filter === 'Live' ? 'No games live right now' : st.filter === 'Following' ? 'You’re not following any of these games' : 'No games', body: st.filter === 'Following' ? 'Follow a game to get goal, kick-off and full-time alerts.' : st.day === 'past' ? 'No results in the last 7 days for these leagues.' : st.day === 'next' ? 'No fixtures scheduled in the next 7 days for these leagues.' : 'Nothing scheduled on this day for the leagues Nexis follows.' })}</div>`}
  </div>`;
};
function daysHtml(days, cur) {
  return `<div class="daystrip" role="tablist" aria-label="Choose a day">${days.map(d => `<button role="tab" aria-selected="${d.k === cur}" class="${d.k === cur ? 'on' : ''} ${d.k === 'past' || d.k === 'next' ? 'wide' : ''}" data-action="sportDay" data-day="${d.k}"><b>${esc(d.label)}</b><span>${esc(d.sub)}</span></button>`).join('')}</div>`;
}

/* ---------- match page ---------- */
Views.event = async (params, id) => {
  if (Sports.state === 'idle' || !Sports.games.has(id)) await Sports.poll();
  let g = Sports.games.get(id); if (!g) { try { g = await Sports.fetchGame(id); } catch (e) { g = null; } }
  if (!g) { const b = sportsState(); return `<div class="page"><a class="link" href="#/sports">${ic('chevLeft', 'sm')}Sports</a><div style="margin-top:14px">${b || `<div class="card">${emptyState({ icon: 'soccer', title: 'Game not found', body: 'ESPN has no game with this link. It may have been removed, or the link is wrong.' })}</div>`}</div></div>`; }
  const rel = Sports.related(g); Panta.watch(rel.panta.map(m => m.id));
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
function eventHero(g) {
  return `<div class="row" style="gap:8px;font-size:12.5px;color:var(--text-2)">${ic(SPORT_IC[g.sport] || 'ball', 'sm')}<span>${esc(g.league)}</span>${g.notes ? `<span class="mut">· ${esc(g.notes)}</span>` : ''}<span style="margin-left:auto" class="row">${gameBadge(g)}${followBtn(g)}</span></div>
    ${scoreboardHtml(g, true)}
    ${g.state === 'in' && g.lastPlay ? `<p class="dim" style="text-align:center;font-size:13px;margin-bottom:6px">${esc(g.lastPlay)}</p>` : ''}
    <div class="row wrap ev-meta"><span>${ic('clock', 'sm')}${esc(g.state === 'pre' ? Sports.label(g) : g.detail || '')}</span>${g.venue ? `<span>${ic('flag', 'sm')}${esc(g.venue)}${g.city ? ', ' + esc(g.city) : ''}</span>` : ''}${g.broadcast ? `<span>${ic('radio', 'sm')}${esc(g.broadcast)}</span>` : ''}${g.odds && g.odds.text ? `<span title="Sportsbook line published by ESPN">${ic('chart', 'sm')}${esc(g.odds.text)}${g.odds.ou != null ? ' · O/U ' + esc(g.odds.ou) : ''}${g.odds.provider ? ' <span class="mut">(' + esc(g.odds.provider) + ')</span>' : ''}</span>` : ''}<span class="mut" style="margin-left:auto">Updated ${agoT(Sports.updatedAt || now())}</span></div>`;
}
function gameInfo(g) {
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
  try { await Sports.summary(g); } catch (e) { const s = $('#ev-stats'); if (s && !Sports.summaries[id]) s.innerHTML = `<p class="mut" style="font-size:13px;padding:8px 0">Match details unavailable: ${esc(e.message)}</p>`; }
  if (current.arg !== id) return; paintEventParts(id);
}
function paintEventParts(id) {
  const g = Sports.games.get(id); if (!g) return;
  const set = (sel, html) => { const el = $(sel); if (el && el.innerHTML !== html) el.innerHTML = html; };
  set('#ev-stats', statsBlock(g)); set('#ev-events', detailsTimeline(g)); set('#ev-lineups', lineupsBlock(g)); set('#ev-info', gameInfo(g));
  const hero = $('#ev-hero'); if (hero) { const h = eventHero(g); if (hero.dataset.sig !== h) { hero.innerHTML = h; hero.dataset.sig = h; hero.classList.toggle('live', g.state === 'in'); } }
}
