/* =====================================================================
   SPORTS DATA SERVICE (ESPN public site API via /api/data)
   - Scoreboards for the leagues below: polled every 12s while any game is
     live, otherwise every 60s.
   - Game summary (box score, lineups/rosters, key events, plays, leaders):
     polled every 12s while a match page is open.
   - Related prediction markets are real Panta (tradable) and Polymarket
     (reference) markets whose titles mention the teams.
   ===================================================================== */
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const LEAGUES = [
  ['soccer', 'eng.1', 'Premier League', 'Football'], ['soccer', 'uefa.champions', 'Champions League', 'Football'], ['soccer', 'uefa.europa', 'Europa League', 'Football'],
  ['soccer', 'esp.1', 'La Liga', 'Football'], ['soccer', 'ita.1', 'Serie A', 'Football'], ['soccer', 'ger.1', 'Bundesliga', 'Football'], ['soccer', 'fra.1', 'Ligue 1', 'Football'], ['soccer', 'usa.1', 'MLS', 'Football'],
  ['basketball', 'nba', 'NBA', 'Basketball'], ['basketball', 'wnba', 'WNBA', 'Basketball'], ['football', 'nfl', 'NFL', 'American Football'], ['football', 'college-football', 'College Football', 'American Football'],
];
/* Calendar days in the viewer's time zone, as ESPN's YYYYMMDD. */
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
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
    return { id: `${lg.replace(/[^a-z0-9]/gi, '')}-${e.id}`, espnId: e.id, sp, lg, league, sport, name: e.name || `${away.name} at ${home.name}`, start: toMs(e.date), state: ty.state || 'pre', statusName: ty.name || '', detail: ty.shortDetail || ty.detail || '', completed: !!ty.completed, clock: st.displayClock || '', period: nz(st.period, 0), home, away, venue: (c.venue && c.venue.fullName) || '', city: c.venue && c.venue.address && [c.venue.address.city, c.venue.address.country].filter(Boolean).join(', '), broadcast: (c.broadcasts || []).flatMap(b => b.names || []).join(', '), details, odds: odds ? { text: odds.details || '', ou: odds.overUnder ?? null, provider: odds.provider && odds.provider.name } : null, lastPlay: c.situation && c.situation.lastPlay && c.situation.lastPlay.text, notes: (c.notes || []).map(n => n.headline).filter(Boolean).join(' · ') };
  },
  label(g) { if (g.state === 'pre') return /postpon|cancel|suspend|delay/i.test(g.statusName) ? g.detail : `${fmtDate(g.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(g.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; if (g.state === 'post') return g.detail || 'Final'; return g.detail || g.clock; },
  isLive(g) { return g.state === 'in'; },
  async poll() {
    const res = await Promise.allSettled(LEAGUES.map(L => Net.data(`${ESPN}/${L[0]}/${L[1]}/scoreboard`)));
    let ok = 0, live = false;
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.events)) return; ok++;
      r.value.events.forEach(e => {
        const g = this.parse(LEAGUES[i], e); if (!g) return;
        if (g.state === 'pre' && g.start - now() > 3 * DAY) return;
        if (g.state === 'post' && now() - g.start > 30 * HOUR) return;
        const prev = this.games.get(g.id); this.games.set(g.id, g); if (g.state === 'in') live = true;
        if (prev) this.diff(prev, g);
      });
    });
    this.anyLive = live;
    if (ok) { this.state = 'live'; this.error = null; this.updatedAt = now(); Feeds.set('sports', 'live'); }
    else { this.error = (res.find(r => r.status === 'rejected') || {}).reason; this.state = this.games.size ? 'stale' : 'offline'; Feeds.set('sports', this.state, this.error); }
    Bus.emit('sports');
  },
  diff(a, b) {
    const followed = Store.s && Store.s.followedEvents.includes(b.id);
    if (b.home.score != null && a.home.score != null && (b.home.score > a.home.score || b.away.score > a.away.score)) {
      const side = b.home.score > a.home.score ? 'home' : 'away'; const d = [...b.details].reverse().find(x => x.kind === 'goal' && x.side === side);
      const scorer = d && d.who ? ` — ${d.who}${d.min ? ' ' + d.min : ''}` : '';
      const txt = `${b.sport === 'Football' ? 'Goal' : 'Score'} · ${b[side].name}${scorer} · ${b.home.short} ${b.home.score}–${b.away.score} ${b.away.short}`;
      Bus.emit('sports:score', { g: b, side, text: txt });
      if (followed && b.sport === 'Football') Notify.push({ kind: 'goal', icon: 'soccer', text: esc(txt), href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
    }
    if (a.state !== b.state && followed) {
      if (b.state === 'in') Notify.push({ kind: 'game', icon: 'whistle', text: `<b>${esc(b.home.short)} vs ${esc(b.away.short)}</b> has started`, href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
      if (b.state === 'post') Notify.push({ kind: 'game', icon: 'flag', text: `Final: <b>${esc(b.home.short)} ${b.home.score}–${b.away.score} ${esc(b.away.short)}</b>`, href: '#/event/' + b.id, toast: true, setting: 'notifyGoals' });
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
  words(t) { return [t.name, t.short, t.abbr].filter(Boolean).map(x => x.toLowerCase()); },
  related(g) {
    const keys = [...new Set([...this.words(g.home), ...this.words(g.away)].filter(k => k.length >= 4 || /^[a-z]{3}$/.test(k)))];
    const hit = (title) => { const t = ' ' + String(title || '').toLowerCase() + ' '; const h = keys.filter(k => k.length >= 4 ? t.includes(k) : new RegExp(`\\b${k}\\b`).test(t)); return h.length; };
    const panta = [...Panta.markets.values()].filter(m => hit(m.title) >= 1 && !m.cancelled).sort((a, b) => hit(b.title) - hit(a.title)).slice(0, 8);
    const poly = [...Poly.markets.values()].filter(m => hit(m.q) >= 1).sort((a, b) => hit(b.q) - hit(a.q) || b.vol - a.vol).slice(0, 8);
    return { panta, poly };
  },
  /** Loads every league's schedule between two local days (inclusive). ESPN dates are US time, so we
      ask for one extra day each side and filter by the viewer's local day. Cached: 10 min, 2 min for today. */
  async loadRange(fromT, toT) {
    const from = dayStart(fromT), to = dayStart(toT); const key = ymd(from) + '-' + ymd(to);
    const today = dayStart(now()); const c = this.ranges[key];
    if (c && (c.loading || now() - c.at < (to >= today && from <= today ? 2 : 10) * 60e3)) return c.loading || c;
    const q = `${ymd(from - DAY)}-${ymd(to + DAY)}`;
    const run = (async () => {
      const res = await Promise.allSettled(LEAGUES.map(L => Net.data(`${ESPN}/${L[0]}/${L[1]}/scoreboard?dates=${q}&limit=500`)));
      let ok = 0;
      res.forEach((r, i) => { if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.events)) return; ok++;
        r.value.events.forEach(e => { const g = this.parse(LEAGUES[i], e); if (!g) return; const prev = this.games.get(g.id); if (!prev || prev.state !== 'in') this.games.set(g.id, g); }); });
      const out = { at: now(), ok, failed: LEAGUES.length - ok, error: ok ? null : ((res.find(r => r.status === 'rejected') || {}).reason || new Error('No schedule data returned')) };
      this.ranges[key] = out; Bus.emit('sports'); return out;
    })();
    this.ranges[key] = { ...(c || {}), loading: run };
    try { return await run; } catch (e) { delete this.ranges[key]; throw e; }
  },
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
  start() { Poller(() => this.poll(), () => this.anyLive ? 12000 : 60000); },
};
