/* =====================================================================
   SPORTS DATA SERVICE (ESPN public site API via /api/data)
   - Scoreboards for the leagues below: polled every 12s while any game is
     live, otherwise every 60s.
   - Game summary (box score, lineups/rosters, key events, plays, leaders):
     polled every 12s while a match page is open.
   - Related prediction markets: Panta markets whose titles mention the
     teams, and the game's own Polymarket markets (tradable in Nexis via
     #/polymarket), matched by team names and kick-off time.
   ===================================================================== */
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const LEAGUES = SPORT_LEAGUES; // js/services/leagues.js
/* Calendar days in the viewer's time zone, as ESPN's YYYYMMDD. */
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/* Team / player name matching between ESPN and Polymarket ("Arsenal" ~ "Arsenal FC", "Man City" ≁ "Manchester United"). */
const NAME_STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'cd', 'ud', 'sd', 'club', 'de', 'del', 'la', 'the', 'fk', 'sk', 'bk', 'if', 'ss', 'calcio', 'futbol', 'football', 'and', 'st', 'saint', 'sv', 'vfl', 'vfb', 'tsg', 'rc', 'rcd', 'ca', 'cr', 'se', 'ec', 'bc', 'kc', 'nk', 'hnk', 'gnk', 'jk', 'ogc', 'sl', 'us', 'ssc']);
const NAME_ALIAS = { internazionale: 'inter', 'man': 'manchester', utd: 'united', spurs: 'tottenham', wolves: 'wolverhampton', psg: 'paris', atletico: 'atletico', bayern: 'bayern', munchen: 'munich' };
const _tokCache = new Map();
/** Team/player name → comparable tokens. Memoised: the same few thousand names are compared constantly. */
const nameTokens = (s) => { const k = String(s || ''); let v = _tokCache.get(k); if (!v) { if (_tokCache.size > 20000) _tokCache.clear(); v = tokenize(k); _tokCache.set(k, v); } return v; };
const tokenize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !NAME_STOP.has(w) && !/^\d{4}$/.test(w)).map(w => NAME_ALIAS[w] || w);
const subsetOf = (a, b) => a.length > 0 && a.every(w => b.includes(w));
function teamMatch(t, polyName, abbrs) {
  const P = nameTokens(polyName); if (!P.length) return false;
  if ([t.name, t.short].some(n => { const T = nameTokens(n); return subsetOf(T, P) || subsetOf(P, T); })) return true;
  return !!(t.abbr && t.abbr.length === 3 && abbrs && abbrs.includes(t.abbr.toLowerCase())); // slug codes, e.g. epl-ars-che-2026-09-27
}
const Sports = {
  games: new Map(), state: 'idle', error: null, summaries: {}, anyLive: false, ranges: {},
  team(c) {
    const t = c.team || {}; const col = String(t.color || '444444').replace('#', '');
    const lum = parseInt(col.slice(0, 2), 16) * .299 + parseInt(col.slice(2, 4), 16) * .587 + parseInt(col.slice(4, 6), 16) * .114;
    const stats = Object.fromEntries((c.statistics || []).map(s => [s.name, s.displayValue ?? s.value]));
    return { id: String(t.id || ''), name: t.displayName || t.name || 'TBD', short: t.shortDisplayName || t.name || t.abbreviation || 'TBD', abbr: (t.abbreviation || '').toUpperCase(), color: '#' + col, ink: lum > 170 ? '#111' : '#fff', logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || null, score: c.score != null && c.score !== '' ? nz(c.score) : null, form: c.form || '', record: (c.records && c.records[0] && c.records[0].summary) || '', winner: !!c.winner, stats, leaders: (c.leaders || []).map(l => ({ cat: l.displayName || l.name, who: l.leaders && l.leaders[0] && l.leaders[0].athlete && l.leaders[0].athlete.displayName, val: l.leaders && l.leaders[0] && l.leaders[0].displayValue })).filter(l => l.who) };
  },
  parse([sp, lg, league, sport], e) {
    const c = (e.competitions || [])[0]; if (!c) return null;
    const H = (c.competitors || []).find(x => x.homeAway === 'home'), A = (c.competitors || []).find(x => x.homeAway === 'away'); if (!H || !A) return null;
    const st = e.status || c.status || {}; const ty = st.type || {};
    const home = this.team(H), away = this.team(A);
    const details = (c.details || []).map(d => { const txt = (d.type && d.type.text) || ''; const side = d.team && String(d.team.id) === home.id ? 'home' : 'away'; return { min: (d.clock && d.clock.displayValue) || '', kind: d.scoringPlay || /goal/i.test(txt) ? 'goal' : d.redCard || /red card/i.test(txt) ? 'red' : d.yellowCard || /yellow/i.test(txt) ? 'yellow' : /sub/i.test(txt) ? 'sub' : 'event', text: txt, side: d.ownGoal ? (side === 'home' ? 'away' : 'home') : side, who: ((d.athletesInvolved || [])[0] || {}).displayName || '', og: !!d.ownGoal, pen: !!d.penaltyKick }; });
    const odds = (c.odds || [])[0];
    return { id: `${lg.replace(/[^a-z0-9]/gi, '')}-${e.id}`, espnId: e.id, sp, lg, league, sport, name: e.name || `${away.name} at ${home.name}`, start: toMs(e.date), state: ty.state || 'pre', statusName: ty.name || '', detail: ty.shortDetail || ty.detail || '', completed: !!ty.completed, clock: st.displayClock || '', clockSec: Number.isFinite(+st.clock) ? +st.clock : null, period: nz(st.period, 0), home, away, venue: (c.venue && c.venue.fullName) || '', city: c.venue && c.venue.address && [c.venue.address.city, c.venue.address.country].filter(Boolean).join(', '), broadcast: (c.broadcasts || []).flatMap(b => b.names || []).join(', '), details, odds: odds ? { text: odds.details || '', ou: odds.overUnder ?? null, provider: odds.provider && odds.provider.name } : null, lastPlay: c.situation && c.situation.lastPlay && c.situation.lastPlay.text, notes: (c.notes || []).map(n => n.headline).filter(Boolean).join(' · ') };
  },
  kindOf(L) { return L[4] || SPORT_KIND_OF_PATH[L[0]] || 'team'; },
  /** Any ESPN event → one or more games: team fixture, player-vs-player matches, or one leaderboard. */
  parseAll(L, e) {
    if (sportExcluded({ path: L[0], key: L[0] + '/' + L[1], name: L[2], sport: L[3] })) return []; // not offered on Nexis
    const kind = this.kindOf(L);
    if (kind === 'match') return this.parseMatches(L, e);
    if (kind === 'field') { const g = this.parseField(L, e); return g ? [g] : []; }
    const g = this.parse(L, e); if (g) g.kind = 'team'; return g ? [g] : [];
  },
  statusOf(st) { const ty = (st && st.type) || {}; return { state: ty.state || 'pre', statusName: ty.name || '', detail: ty.shortDetail || ty.detail || ty.description || '', completed: !!ty.completed, clock: (st && st.displayClock) || '', period: nz(st && st.period, 0) }; },
  player(c) {
    const a = c.athlete || {}; const name = a.displayName || (c.team && c.team.displayName) || 'TBD';
    const sets = (c.linescores || []).map(l => ({ v: l.value != null ? nz(l.value) : nz(l.displayValue, null), tb: l.tiebreak }));
    return { id: String(c.id || name), name, short: a.shortName || name, abbr: name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(), color: '#2A3140', ink: '#fff', logo: (a.flag && a.flag.href) || (c.team && c.team.logo) || null, flag: a.flag && a.flag.alt, score: null, winner: !!c.winner, sets, record: (c.records && c.records[0] && c.records[0].summary) || '', form: '', stats: {}, leaders: [] };
  },
  parseMatches([sp, lg, league, sport], e) {
    const lgId = lg.replace(/[^a-z0-9]/gi, ''); const out = [];
    const blocks = e.groupings ? e.groupings.map(g => ({ label: g.grouping && g.grouping.displayName, comps: g.competitions || [] })) : [{ label: '', comps: e.competitions || [] }];
    blocks.forEach(b => b.comps.forEach(c => {
      const cs = (c.competitors || []).slice().sort((x, y) => (x.order || 9) - (y.order || 9)); if (cs.length < 2) return;
      const P1 = this.player(cs[0]), P2 = this.player(cs[1]); const st = this.statusOf(c.status || e.status);
      if (P1.sets.length || P2.sets.length) { let a = 0, b2 = 0; P1.sets.forEach((x, i) => { const y = P2.sets[i]; if (!y || x.v == null || y.v == null) return; if (x.v > y.v) a++; else if (y.v > x.v) b2++; }); if (st.state !== 'pre') { P1.score = a; P2.score = b2; } }
      const setLine = P1.sets.length ? P1.sets.map((x, i) => `${x.v ?? '-'}-${(P2.sets[i] || {}).v ?? '-'}`).join('  ') : '';
      const round = [b.label, c.round && c.round.displayName, c.type && c.type.text].filter(Boolean).join(' · ');
      out.push({ id: `${lgId}-${c.id}`, espnId: c.id, eventId: e.id, kind: 'match', sp, lg, league, sport, name: `${P1.name} vs ${P2.name}`, tournament: e.name || '', round, start: toMs(c.date || e.date), ...st,
        home: P1, away: P2, setLine, venue: (c.venue && c.venue.fullName) || '', city: '', broadcast: '', details: [], odds: null, lastPlay: '', notes: [e.name, round].filter(Boolean).join(' · ') });
    }));
    return out;
  },
  parseField([sp, lg, league, sport], e) {
    const comps = e.competitions || []; if (!comps.length) return null;
    const c = comps.find(x => this.statusOf(x.status).state === 'in') || comps.slice().reverse().find(x => /race|round|final/i.test((x.type && (x.type.text || x.type.abbreviation)) || '')) || comps[comps.length - 1];
    const st = this.statusOf(e.status && e.status.type && e.status.type.state !== 'pre' ? e.status : c.status || e.status);
    const rows = (c.competitors || []).map((x, i) => ({ pos: (x.status && x.status.position && x.status.position.displayName) || String(x.order || i + 1), name: (x.athlete && x.athlete.displayName) || (x.team && x.team.displayName) || '—', flag: x.athlete && x.athlete.flag && x.athlete.flag.href, score: x.score != null ? String(x.score) : '', thru: x.status && (x.status.thru != null ? String(x.status.thru) : x.status.displayValue) || '' }));
    return { id: `${lg.replace(/[^a-z0-9]/gi, '')}-${e.id}`, espnId: e.id, kind: 'field', sp, lg, league, sport, name: e.name || league, tournament: e.name || '', start: toMs(e.date), end: toMs(e.endDate), ...st,
      session: (c.type && (c.type.text || c.type.abbreviation)) || '', leaders: rows, home: null, away: null, venue: (c.venue && c.venue.fullName) || '', details: [], notes: '' };
  },
  label(g) { if (g.state === 'pre') return /postpon|cancel|suspend|delay/i.test(g.statusName) ? g.detail : `${fmtDate(g.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(g.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; if (g.state === 'post') return g.detail || 'Final'; return g.detail || g.clock; },
  isLive(g) { return g.state === 'in'; },
  /** Every sport group via /api/sports (one cached request each, in parallel); if all fail, the main
      leagues directly from ESPN. */
  meta: new Map(SPORT_LEAGUES.map(L => [L[0] + '/' + L[1], L])),
  async fetchBoards(dates, groups) {
    const res = await Promise.allSettled((groups || SPORT_GROUPS).map(G => Net.api(`sports?group=${G.id}${dates ? '&dates=' + dates : ''}`, { timeout: 35000 })));
    if (res.some(r => r.status === 'fulfilled')) {
      const out = [];
      res.forEach(r => {
        if (r.status !== 'fulfilled') { out.push({ status: 'rejected', reason: r.reason }); return; }
        const by = new Map();
        (r.value.leagues || []).forEach(([key, name, label, kind, ok]) => { if (sportExcluded({ key, name, sport: label })) return; const [sp, ...rest] = key.split('/'); const L = [sp, rest.join('/'), name || rest.join('/'), label, kind]; if (!this.meta.has(key)) this.meta.set(key, L); by.set(key, ok ? { status: 'fulfilled', L: this.meta.get(key), value: { events: [] } } : { status: 'rejected', L, reason: new Error('League unavailable') }); });
        (r.value.events || []).forEach(([key, e]) => { const x = by.get(key); if (x && x.value) x.value.events.push(e); });
        out.push(...by.values());
      });
      this.via = 'server'; return out;
    }
    this.via = 'direct';
    const d = await Promise.allSettled(SPORT_LEAGUES_CORE.map(L => Net.data(`${ESPN}/${L[0]}/${L[1]}/scoreboard${dates ? '?dates=' + dates + '&limit=500' : ''}`)));
    return d.map((r, i) => ({ ...r, L: SPORT_LEAGUES_CORE[i] }));
  },
  /** Live scores. Every 60s all sport groups; in between (every 10s while games are live) only the groups
      that have live games, so a live match somewhere doesn't mean re-downloading every league. */
  poll() { if (!this._inflight) this._inflight = this._poll().finally(() => { this._inflight = null; }); return this._inflight; },
  /** Called when a page showing scores opens: refresh now if the last update is older than 10s. */
  kick() { if (this.state !== 'idle' && now() - (this.updatedAt || 0) > 10000) { if (this._poller) this._poller.now(); else this.poll().catch(() => {}); } },
  async _poll() {
    const full = !this._fullAt || now() - this._fullAt > 55e3 || !this.liveGroups || !this.liveGroups.size;
    const res = await this.fetchBoards('', full ? null : SPORT_GROUPS.filter(G => this.liveGroups.has(G.id)));
    if (full) this._fullAt = now();
    let ok = 0, live = false;
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.events)) return; ok++;
      r.value.events.forEach(e => this.parseAll(r.L, e).forEach(g => {
        if (g.state === 'pre' && g.start - now() > 3 * DAY) return;
        if (g.state === 'post' && now() - (g.end || g.start) > 30 * HOUR) return;
        const prev = this.games.get(g.id); this.games.set(g.id, g); if (g.state === 'in') live = true;
        if (prev) this.diff(prev, g);
      }));
    });
    const groupOf = (sp) => (SPORT_GROUPS.find(G => G.sports.includes(sp)) || {}).id;
    this.liveGroups = new Set([...this.games.values()].filter(g => g.state === 'in').map(g => groupOf(g.sp)).filter(Boolean));
    this.anyLive = live || this.liveGroups.size > 0;
    if (ok) { this.state = 'live'; this.error = null; this.updatedAt = now(); Feeds.set('sports', 'live'); }
    else { this.error = (res.find(r => r.status === 'rejected') || {}).reason; this.state = this.games.size ? 'stale' : 'offline'; Feeds.set('sports', this.state, this.error); }
    Bus.emit('sports');
  },
  diff(a, b) {
    const followed = Store.s && Store.s.followedEvents.includes(b.id);
    if (b.kind === 'team' && b.home.score != null && a.home.score != null && (b.home.score > a.home.score || b.away.score > a.away.score)) {
      const side = b.home.score > a.home.score ? 'home' : 'away'; const d = [...b.details].reverse().find(x => x.kind === 'goal' && x.side === side);
      const scorer = d && d.who ? ` — ${d.who}${d.min ? ' ' + d.min : ''}` : '';
      const txt = `${b.sport === 'Football' ? 'Goal' : 'Score'} · ${b[side].name}${scorer} · ${b.home.short} ${b.home.score}–${b.away.score} ${b.away.short}`;
      Bus.emit('sports:score', { g: b, side, text: txt });
      if (followed && b.sport === 'Football') Notify.push({ kind: 'goal', icon: 'soccer', text: esc(txt), href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
    }
    if (a.state !== b.state && followed) {
      if (b.state === 'in') Notify.push({ kind: 'game', icon: 'whistle', text: `<b>${esc(this.title(b))}</b> has started`, href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
      if (b.state === 'post') Notify.push({ kind: 'game', icon: 'flag', text: b.kind === 'field' ? `Final: <b>${esc(b.name)}</b>${b.leaders[0] ? ' — ' + esc(b.leaders[0].name) + ' wins' : ''}` : b.kind === 'match' ? `Final: <b>${esc((b.home.winner ? b.home : b.away).name)}</b> beat ${esc((b.home.winner ? b.away : b.home).name)}${b.setLine ? ' · ' + esc(b.setLine) : ''}` : `Final: <b>${esc(b.home.short)} ${b.home.score}–${b.away.score} ${esc(b.away.short)}</b>`, href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
    }
  },
  async summary(g) {
    const r = await Net.data(`${ESPN}/${g.sp}/${g.lg}/summary?event=${g.espnId}`);
    const bx = r.boxscore || {};
    const teamStats = (bx.teams || []).map(t => ({ id: String(t.team && t.team.id), stats: (t.statistics || []).map(s => ({ name: s.name, label: s.label || s.name, value: s.displayValue ?? s.value })) }));
    const rosters = (r.rosters || []).map(ro => ({ id: String(ro.team && ro.team.id), formation: ro.formation || '', players: (ro.roster || []).map(p => ({ name: p.athlete && (p.athlete.displayName || p.athlete.shortName), pos: p.position && (p.position.abbreviation || p.position.name), num: p.jersey, starter: !!p.starter, subbedIn: !!p.subbedIn })).filter(p => p.name) }));
    const players = (bx.players || []).map(tp => ({ id: String(tp.team && tp.team.id), groups: (tp.statistics || []).map(s => ({ labels: s.labels || [], rows: (s.athletes || []).slice(0, 12).map(a => ({ name: a.athlete && (a.athlete.shortName || a.athlete.displayName), stats: a.stats || [], starter: !!a.starter })) })) }));
    const key = (r.keyEvents || []).map(k => ({ min: (k.clock && k.clock.displayValue) || '', text: k.text || (k.type && k.type.text) || '', kind: k.scoringPlay ? 'goal' : /yellow/i.test(k.type && k.type.text) ? 'yellow' : /red/i.test(k.type && k.type.text) ? 'red' : /sub/i.test(k.type && k.type.text) ? 'sub' : 'event', team: k.team && String(k.team.id) }));
    const plays = (r.plays || []).slice(-25).reverse().map(p => ({ min: (p.clock && p.clock.displayValue) || '', period: p.period && p.period.number, text: p.text || '', score: p.scoringPlay, home: p.homeScore, away: p.awayScore }));
    const leaders = (r.leaders || []).map(t => ({ id: String(t.team && t.team.id), cats: (t.leaders || []).map(l => ({ cat: l.displayName, who: l.leaders && l.leaders[0] && l.leaders[0].athlete && l.leaders[0].athlete.displayName, val: l.leaders && l.leaders[0] && l.leaders[0].displayValue })).filter(x => x.who) }));
    const s = { at: now(), teamStats, rosters, players, key, plays, leaders, attendance: r.gameInfo && r.gameInfo.attendance, officials: (r.gameInfo && r.gameInfo.officials || []).map(o => o.displayName).slice(0, 3), news: (r.news && r.news.articles || []).slice(0, 3).map(a => ({ title: a.headline, url: a.links && a.links.web && a.links.web.href })) };
    this.summaries[g.id] = s; return s;
  },
  title(g) { return g.kind === 'field' ? g.name : `${g.home.short} vs ${g.away.short}`; },
  words(t) { return [t.name, t.short, t.abbr].filter(Boolean).map(x => x.toLowerCase()); },
  _rel: {},
  related(g) {
    const v = `${Panta.markets.size}|${Poly.markets.size}|${Poly.gamesAt}|${Panta.loadedAt}|${g.start}|${g.home ? g.home.name + g.away.name : g.name}`; const c = this._rel[g.id];
    if (c && c.v === v) return c.r; const r = this.relatedRaw(g); this._rel[g.id] = { v, r }; return r;
  },
  relatedRaw(g) {
    const names = g.kind === 'field' ? [g.name, ...g.leaders.slice(0, 10).map(r => r.name.split(' ').pop())].map(x => String(x).toLowerCase()) : [...this.words(g.home), ...this.words(g.away), ...(g.kind === 'match' ? [g.home.name.split(' ').pop(), g.away.name.split(' ').pop()].map(x => x.toLowerCase()) : [])];
    const keys = [...new Set(names.filter(k => k.length >= 4 || /^[a-z]{3}$/.test(k)))];
    const hit = (title) => { const t = ' ' + String(title || '').toLowerCase() + ' '; const h = keys.filter(k => k.length >= 4 ? t.includes(k) : new RegExp(`\\b${k}\\b`).test(t)); return h.length; };
    const panta = [...Panta.markets.values()].filter(m => hit(m.title) >= 1 && !m.cancelled).sort((a, b) => hit(b.title) - hit(a.title)).slice(0, 8);
    // This exact game on Polymarket (moneyline, draw, spreads…) first, then other markets naming the teams.
    const game = this.pmGame(g); const own = game ? game.mids.map(id => Poly.markets.get(id)).filter(Boolean) : [];
    const other = g.kind === 'field' || game ? [] : [...Poly.markets.values()].filter(m => !m.game && hit(m.q) >= (g.kind === 'field' ? 1 : 2)).sort((a, b) => b.vol - a.vol).slice(0, 4);
    const fieldPoly = g.kind === 'field' ? [...Poly.markets.values()].filter(m => hit(m.q) >= 1).sort((a, b) => hit(b.q) - hit(a.q) || b.vol - a.vol).slice(0, 8) : [];
    return { panta, poly: [...own, ...other, ...fieldPoly].slice(0, 10), pmEvent: game };
  },
  /** The Polymarket game event for an ESPN game: both sides' names match and it starts within 30 hours. */
  _pm: new Map(), _pmAt: 0, _pmIdx: null,
  pmGame(g) {
    if (!g.home || !g.away || !Poly.games.length) return null;
    // Cache per game until the Polymarket list changes; only Polymarket games within 30h are compared (sorted index).
    if (this._pmAt !== Poly.gamesAt) { this._pmAt = Poly.gamesAt; this._pm.clear(); this._pmIdx = Poly.games.slice().sort((a, b) => a.start - b.start); }
    const key = `${g.id}|${g.start}|${g.home.name}|${g.away.name}`; if (this._pm.has(key)) return this._pm.get(key);
    const idx = this._pmIdx; let lo = 0, hi = idx.length; const from = g.start - 30 * HOUR;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (idx[mid].start < from) lo = mid + 1; else hi = mid; }
    let hit = null;
    for (let i = lo; i < idx.length && idx[i].start < g.start + 30 * HOUR; i++) { const p = idx[i]; if ((teamMatch(g.home, p.a, p.abbrs) && teamMatch(g.away, p.b, p.abbrs)) || (teamMatch(g.home, p.b, p.abbrs) && teamMatch(g.away, p.a, p.abbrs))) { hit = p; break; } }
    if (this._pm.size > 20000) this._pm.clear(); this._pm.set(key, hit); return hit;
  },
  /** Loads every league's schedule between two local days (inclusive). ESPN dates are US time, so we
      ask for one extra day each side and filter by the viewer's local day. Cached: 10 min, 2 min for today. */
  async loadRange(fromT, toT) {
    const from = dayStart(fromT), to = dayStart(toT); const key = ymd(from) + '-' + ymd(to);
    const today = dayStart(now()); const c = this.ranges[key];
    if (c && (c.loading || now() - c.at < (to >= today && from <= today ? 2 : 10) * 60e3)) return c.loading || c;
    const q = `${ymd(from - DAY)}-${ymd(to + DAY)}`;
    const run = (async () => {
      const res = await this.fetchBoards(q);
      let ok = 0;
      res.forEach((r, i) => { if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.events)) return; ok++;
        r.value.events.forEach(e => this.parseAll(r.L, e).forEach(g => { const prev = this.games.get(g.id); if (!prev || prev.state !== 'in') this.games.set(g.id, g); })); });
      const out = { at: now(), ok, failed: res.length - ok, error: ok ? null : ((res.find(r => r.status === 'rejected') || {}).reason || new Error('No schedule data returned')) };
      this.ranges[key] = out; Bus.emit('sports'); return out;
    })();
    this.ranges[key] = { ...(c || {}), loading: run };
    try { return await run; } catch (e) { delete this.ranges[key]; throw e; }
  },
  /** One league's schedule: the last 7 days through the next 28 (league view). Cached 5 min, 1 min while live. */
  leagues: {},
  async loadLeague(key) {
    const c = this.leagues[key];
    if (c && (c.loading || now() - c.at < (c.live ? 1 : 5) * 60e3)) return c.loading || c;
    const L = this.meta.get(key) || (() => { const [sp, ...rest] = key.split('/'); return [sp, rest.join('/'), rest.join('/'), SPORT_LABEL_OF_PATH[sp] || sp, SPORT_KIND_OF_PATH[sp] || 'team']; })();
    const t = dayStart(now()); const q = `${ymd(t - 8 * DAY)}-${ymd(t + 29 * DAY)}`;
    const run = (async () => {
      let events = null;
      try {
        const r = await Net.api(`sports?league=${encodeURIComponent(key)}&dates=${q}`, { timeout: 35000 });
        const lg = (r.leagues || [])[0]; if (lg && lg[1] && !this.meta.has(key)) this.meta.set(key, [L[0], L[1], lg[1], L[3], L[4]]);
        if (lg && !lg[4]) throw new Error('League unavailable');
        events = (r.events || []).map(x => x[1]);
      } catch (e) {
        const r = await Net.data(`${ESPN}/${L[0]}/${L[1]}/scoreboard?dates=${q}&limit=500`); events = Array.isArray(r.events) ? r.events : [];
      }
      const LL = this.meta.get(key) || L; let live = false;
      events.forEach(e => this.parseAll(LL, e).forEach(g => { const prev = this.games.get(g.id); if (!prev || prev.state !== 'in' || g.state !== 'pre') this.games.set(g.id, g); if (g.state === 'in') live = true; }));
      const out = { at: now(), ok: true, live, n: events.length }; this.leagues[key] = out; Bus.emit('sports'); return out;
    })();
    this.leagues[key] = { ...(c || {}), loading: run };
    try { return await run; } catch (e) { this.leagues[key] = { at: now(), ok: false, error: e }; throw e; }
  },
  inLeague(key) { return [...this.games.values()].filter(g => g.sp + '/' + g.lg === key); },
  rangeState(fromT, toT) { return this.ranges[ymd(dayStart(fromT)) + '-' + ymd(dayStart(toT))] || null; },
  between(fromT, toT) { const a = dayStart(fromT), b = dayStart(toT) + DAY; return [...this.games.values()].filter(g => g.start >= a && g.start < b); },
  /** A single game by Nexis id (e.g. an old link), rebuilt from ESPN's summary header. */
  async fetchGame(id) {
    if (this.games.has(id)) return this.games.get(id);
    const m = /^([a-z0-9]+)-(\d+)$/i.exec(id || ''); if (!m) return null;
    const L = LEAGUES.find(x => x[1].replace(/[^a-z0-9]/gi, '') === m[1]); if (!L) return null;
    const r = await Net.data(`${ESPN}/${L[0]}/${L[1]}/summary?event=${m[2]}`);
    const h = r && r.header; const comp = h && (h.competitions || [])[0]; if (!comp) return null;
    const g = this.parse(L, { id: m[2], date: comp.date, name: h.name || '', status: comp.status, competitions: [comp] });
    if (g) this.games.set(g.id, g); return g;
  },
  list() { return [...this.games.values()].sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) || (a.state === 'post' ? b.start - a.start : a.start - b.start)); },
  start() {
    // Fast refresh only while something is live and a page showing scores is open.
    const watching = () => { try { return ['sports', 'event', 'book', 'home', ''].includes(current.route); } catch (e) { return true; } };
    this._poller = Poller(() => this.poll(), () => this.anyLive && watching() ? 10000 : 60000);
  },
};
