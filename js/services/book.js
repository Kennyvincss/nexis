/* =====================================================================
   SPORTSBOOK MODEL
   Every game Polymarket lists (upcoming, live and recent results), laid
   out like a sportsbook: sport → league → game → bet types. Bets are
   placed on Panta (see "BETS = PANTA MARKETS" below); Polymarket only
   supplies the games and the estimated odds shown before a Panta market
   exists. ESPN supplies scores, clocks and crests when it has the game.
   Decimal odds = 1 / price, so a $10 stake at 2.50 returns $25 if it wins.
   ===================================================================== */
const BOOK_CODES = {
  epl: ['Premier League', 'Football', 'England'], lal: ['La Liga', 'Football', 'Spain'], sea: ['Serie A', 'Football', 'Italy'], bun: ['Bundesliga', 'Football', 'Germany'],
  fl1: ['Ligue 1', 'Football', 'France'], ucl: ['Champions League', 'Football', 'Europe'], uel: ['Europa League', 'Football', 'Europe'], uecl: ['Conference League', 'Football', 'Europe'],
  ere: ['Eredivisie', 'Football', 'Netherlands'], por: ['Primeira Liga', 'Football', 'Portugal'], tur: ['Süper Lig', 'Football', 'Turkey'], spl: ['Saudi Pro League', 'Football', 'Saudi Arabia'],
  mls: ['MLS', 'Football', 'USA'], lmx: ['Liga MX', 'Football', 'Mexico'], bra: ['Brasileirão', 'Football', 'Brazil'], arg: ['Liga Profesional', 'Football', 'Argentina'],
  efl: ['Championship', 'Football', 'England'], fac: ['FA Cup', 'Football', 'England'], cdr: ['Copa del Rey', 'Football', 'Spain'], fifwc: ['World Cup', 'Football', 'International'],
  nba: ['NBA', 'Basketball', 'USA'], wnba: ['WNBA', 'Basketball', 'USA'], cbb: ['NCAA Basketball', 'Basketball', 'USA'], euroleague: ['EuroLeague', 'Basketball', 'Europe'],
  nfl: ['NFL', 'American Football', 'USA'], cfb: ['College Football', 'American Football', 'USA'], mlb: ['MLB', 'Baseball', 'USA'], kbo: ['KBO', 'Baseball', 'South Korea'], npb: ['NPB', 'Baseball', 'Japan'],
  nhl: ['NHL', 'Hockey', 'USA'], khl: ['KHL', 'Hockey', 'Russia'], atp: ['ATP', 'Tennis', 'World'], wta: ['WTA', 'Tennis', 'World'], ufc: ['UFC', 'MMA', 'World'], box: ['Boxing', 'Boxing', 'World'],
  f1: ['Formula 1', 'Motorsport', 'World'], ipl: ['IPL', 'Cricket', 'India'], cricket: ['Cricket', 'Cricket', 'World'], nrl: ['NRL', 'Rugby', 'Australia'], afl: ['AFL', 'Australian Football', 'Australia'],
  cs2: ['Counter-Strike 2', 'Esports', 'World'], csgo: ['Counter-Strike 2', 'Esports', 'World'], lol: ['League of Legends', 'Esports', 'World'], dota2: ['Dota 2', 'Esports', 'World'], val: ['Valorant', 'Esports', 'World'],
};
const BOOK_REGION = { eng: 'England', esp: 'Spain', ita: 'Italy', ger: 'Germany', fra: 'France', ned: 'Netherlands', por: 'Portugal', sco: 'Scotland', tur: 'Turkey', bel: 'Belgium', aut: 'Austria', sui: 'Switzerland', den: 'Denmark', nor: 'Norway', swe: 'Sweden', gre: 'Greece', usa: 'USA', can: 'Canada', mex: 'Mexico', bra: 'Brazil', arg: 'Argentina', col: 'Colombia', chi: 'Chile', ksa: 'Saudi Arabia', jpn: 'Japan', kor: 'South Korea', chn: 'China', aus: 'Australia', uefa: 'Europe', fifa: 'International', conmebol: 'South America', concacaf: 'North America', caf: 'Africa', afc: 'Asia', club: 'International' };
const BOOK_SPORTS = ['Football', 'Basketball', 'Tennis', 'American Football', 'Baseball', 'Hockey', 'MMA', 'Boxing', 'Cricket', 'Rugby', 'Australian Football', 'Motorsport', 'Golf', 'Esports', 'Other'];
const BOOK_CATS = ['Match result', 'Handicap', 'Totals', 'Both teams to score', 'Other'];
/* Leagues listed first (in this order) wherever leagues are listed; the rest follow by volume. */
const BOOK_TOP = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League', 'UEFA Champions League', 'Europa League', 'UEFA Europa League', 'Conference League', 'UEFA Conference League', 'Eredivisie', 'Primeira Liga', 'MLS', 'Saudi Pro League', 'NBA', 'NFL', 'MLB', 'NHL', 'WNBA', 'ATP', 'WTA', 'UFC'];
const bookRank = (name) => { const i = BOOK_TOP.indexOf(name); return i < 0 ? 999 : i; };

/* ---------------------------------------------------------------------
   BETS = PANTA MARKETS
   Every bet is YES or NO on a Panta market. Each game has a fixed set of
   propositions ("props"), each one Panta market:
     football:  home (home win) · draw · away (away win) · ou25 (3+ goals) · btts
     others:    winner (home beats away, incl. overtime)
     any sport: pm:<Polymarket market id> — mirrors one Polymarket market
   Bet types map onto props: 1 = home YES, X = draw YES, 2 = away YES,
   1X = away NO, 12 = draw NO, X2 = home NO, Over 2.5 = ou25 YES,
   Under 2.5 = ou25 NO, GG = btts YES, NG = btts NO.
   Which Panta market holds each prop is kept in /api/book. If none exists
   yet, the first bettor creates it on Panta. Odds are the Panta price once the
   market exists, otherwise an estimate from Polymarket (marked "est.").
   --------------------------------------------------------------------- */
const BOOK_TABS = {
  football: [
    { id: '3way', label: '3 Way & O/U', cols: [['1', 'home', 'YES'], ['X', 'draw', 'YES'], ['2', 'away', 'YES'], ['O 2.5', 'ou25', 'YES'], ['U 2.5', 'ou25', 'NO']] },
    { id: 'dc', label: 'Double Chance', cols: [['1X', 'away', 'NO'], ['12', 'draw', 'NO'], ['X2', 'home', 'NO']] },
    { id: 'ggng', label: 'GG/NG', cols: [['GG', 'btts', 'YES'], ['NG', 'btts', 'NO']] },
  ],
  other: [{ id: 'winner', label: 'Winner', cols: [['1', 'winner', 'YES'], ['2', 'winner', 'NO']] }],
};
const BOOK_MARKET_NAME = { home: '1X2', draw: '1X2', away: '1X2', ou25: 'Total goals O/U 2.5', btts: 'Both teams to score (GG/NG)', winner: 'Winner' };

const Book = {
  _v: '', _list: [], _est: new Map(),
  /** All sportsbook games — upcoming, live and recent results (recomputed when Polymarket or ESPN data changes). */
  games() {
    const v = `${Poly.gamesAt}|${Sports.games.size}|${Sports.updatedAt || 0}|${Object.keys(Sports.ranges).length}`;
    if (v !== this._v) { this._v = v; this._list = this.build(); }
    return this._list;
  },
  get(id) { return this.games().find(g => g.id === String(id)) || null; },
  build() {
    // ESPN game for each Polymarket game (scores, clocks, crests, league names).
    const espn = new Map();
    Sports.games.forEach(g => { if (!g.home || !g.away) return; const p = Sports.pmGame(g); if (p && !espn.has(p.id)) espn.set(p.id, g); });
    // League names per Polymarket code: the ESPN league most of its games matched, else the table, else the series title.
    const votes = {}; Poly.games.forEach(p => { const e = espn.get(p.id); if (!e || !p.league) return; const k = p.league; votes[k] = votes[k] || {}; const lk = e.sp + '/' + e.lg; votes[k][lk] = (votes[k][lk] || 0) + 1; });
    const leagueOf = (p, e) => {
      const v = votes[p.league]; const top = v && Object.entries(v).sort((a, b) => b[1] - a[1])[0];
      const L = top ? Sports.meta.get(top[0]) : e ? Sports.meta.get(e.sp + '/' + e.lg) : null;
      const C = BOOK_CODES[p.league];
      if (L) return { key: L[0] + '/' + L[1], name: L[2], sport: L[3], region: BOOK_REGION[String(L[1]).split('.')[0]] || (C && C[2]) || '' };
      if (C) return { key: 'pm/' + p.league, name: C[0], sport: C[1], region: C[2] };
      let name = String(p.series || '').replace(/\b(19|20)\d\d(\s*[-/]\s*(19|20)?\d\d)?\b/g, '').replace(/\s+/g, ' ').trim() || (p.league ? p.league.toUpperCase() : 'Other');
      const known = { 'english premier league': 'Premier League', 'epl': 'Premier League', 'laliga': 'La Liga', 'la liga': 'La Liga', 'serie a': 'Serie A', 'bundesliga': 'Bundesliga', 'ligue 1': 'Ligue 1', 'uefa champions league': 'Champions League', 'champions league': 'Champions League', 'uefa europa league': 'Europa League', 'europa league': 'Europa League' }[name.toLowerCase()];
      if (known) { const B = Object.entries(BOOK_CODES).find(([, v]) => v[0] === known); return { key: B ? 'pm/' + B[0] : 'pm/' + known.toLowerCase(), name: known, sport: 'Football', region: B ? B[1][2] : '' }; }
      return { key: 'pm/' + (p.league || name.toLowerCase()), name, sport: this.sportFromTags(p.tags), region: '' };
    };
    const trim = (n) => String(n || '').replace(/\s+(FC|CF|AFC|SC)$/i, '').replace(/^(FC|AFC|CF|SC)\s+/i, '');
    const out = [];
    Poly.games.forEach(p => {
      const markets = p.mids.map(id => Poly.markets.get(id)).filter(Boolean);
      const e = espn.get(p.id) || null; const L = leagueOf(p, e);
      // Sides: ESPN's home/away when matched (which Polymarket name is home?), else Polymarket's order.
      let home = { name: p.a, short: trim(p.a), logo: null, score: null, pm: p.a }, away = { name: p.b, short: trim(p.b), logo: null, score: null, pm: p.b };
      if (e) { const flip = teamMatch(e.home, p.b, p.abbrs) && !teamMatch(e.home, p.a, p.abbrs); const H = e.home, A = e.away; home = { name: H.name, short: H.short, logo: H.logo, score: H.score, pm: flip ? p.b : p.a }; away = { name: A.name, short: A.short, logo: A.logo, score: A.score, pm: flip ? p.a : p.b }; }
      if (home.score == null) { const sc = /^(\d+)\s*-\s*(\d+)/.exec(p.score || ''); if (sc) { home.score = +sc[1]; away.score = +sc[2]; } }
      const state = e ? e.state : p.ended ? 'post' : p.live ? 'in' : p.start < now() - 4 * HOUR ? 'post' : 'pre';
      const sport = L.sport || 'Other';
      const g = { id: String(p.id), pm: p, espn: e, start: e ? e.start : p.start, state, clock: e ? (e.detail || e.clock) : [p.period, p.elapsed].filter(Boolean).join(' '), home, away, league: L.name, leagueKey: L.key, sport, region: L.region, markets, vol: p.volume, football: sport === 'Football', image: p.image };
      g.tabs = g.football ? BOOK_TABS.football : BOOK_TABS.other;
      g.extra = this.extraMarkets(g);
      out.push(g);
    });
    return out.sort((a, b) => a.start - b.start);
  },
  sportFromTags(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    return /soccer|football(?!.*american)/.test(t) ? 'Football' : /basketball|nba/.test(t) ? 'Basketball' : /tennis/.test(t) ? 'Tennis' : /nfl|american football/.test(t) ? 'American Football' : /baseball|mlb/.test(t) ? 'Baseball' : /hockey|nhl/.test(t) ? 'Hockey' : /ufc|mma/.test(t) ? 'MMA' : /boxing/.test(t) ? 'Boxing' : /cricket/.test(t) ? 'Cricket' : /esport|counter|league of legends|dota|valorant/.test(t) ? 'Esports' : /rugby/.test(t) ? 'Rugby' : 'Other';
  },
  side(g, name) { const n = String(name || '').replace(/^will\s+/i, '').replace(/\s+(win|beat)\b.*$/i, '').replace(/\?$/, ''); return teamMatch({ name: g.home.pm, short: g.home.short, abbr: '' }, n, null) || teamMatch(g.home, n, null) ? 'home' : teamMatch({ name: g.away.pm, short: g.away.short, abbr: '' }, n, null) || teamMatch(g.away, n, null) ? 'away' : null; },
  /** Polymarket markets for the game that aren't covered by the fixed props (handicaps, other totals, player props). */
  extraMarkets(g) {
    return g.markets.filter(m => { const q = m.q || ''; if (/draw/i.test(q) && g.football) return false; if (/^will .* win/i.test(q) && this.side(g, q)) return false; if (/moneyline/i.test(m.smt) && !/^yes$/i.test(m.yesLabel)) return false; if (g.football && (/both teams to score|btts/i.test(q + m.smt) || (/total|o\/u/i.test(q + m.smt) && (m.line === 2.5 || /\b2\.5\b/.test(q))))) return false; return true; });
  },

  /* ---------- props: question, rules and sources for each Panta market ---------- */
  dateText(g) { return new Date(g.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); },
  question(g, prop) {
    const H = g.home.pm, A = g.away.pm, D = this.dateText(g);
    if (prop.startsWith('pm:')) { const m = Poly.markets.get('pm-' + prop.slice(3)); if (!m) return null; return /^yes$/i.test(m.yesLabel) ? m.q : `${m.q} — will ${m.yesLabel} be the result?`; }
    return { home: `Will ${H} beat ${A} in their match on ${D}?`, draw: `Will ${H} vs ${A} on ${D} end in a draw?`, away: `Will ${A} beat ${H} in their match on ${D}?`,
      ou25: `Will ${H} vs ${A} on ${D} have 3 or more total goals?`, btts: `Will both ${H} and ${A} score in their match on ${D}?`, winner: `Will ${H} beat ${A} on ${D}?` }[prop] || null;
  },
  rule(g, prop) {
    const H = g.home.pm, A = g.away.pm, when = new Date(g.start).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const base = `This market is about the ${g.league} ${g.football ? 'match' : 'game'} ${H} vs ${A} scheduled for ${when}.`;
    const ft = ' It is settled on the result after regular time: 90 minutes plus stoppage time. Extra time and penalty shoot-outs do not count.';
    const off = ' If the match is abandoned or not played within 48 hours of the scheduled start, the market is cancelled.';
    if (prop.startsWith('pm:')) { const m = Poly.markets.get('pm-' + prop.slice(3)); return `${base} It mirrors the Polymarket market "${m ? m.q : ''}" (${Poly.url(m || {})}) and resolves ${m && !/^yes$/i.test(m.yesLabel) ? `YES if "${m.yesLabel}" is the result and NO if "${m.noLabel}" is` : 'the same way'}. ${(m && m.rule) || ''}`.slice(0, 2048); }
    return base + ({
      home: `${ft} Resolves YES if ${H} wins. Resolves NO if ${A} wins or the match is drawn.`,
      draw: `${ft} Resolves YES if the match is drawn. Resolves NO if either team wins.`,
      away: `${ft} Resolves YES if ${A} wins. Resolves NO if ${H} wins or the match is drawn.`,
      ou25: `${ft} Resolves YES if the two teams score 3 or more goals in total (over 2.5). Resolves NO if they score 2 or fewer. Own goals count.`,
      btts: `${ft} Resolves YES if both teams score at least one goal. Resolves NO if either team fails to score. Own goals count for the team credited with the goal.`,
      winner: ` Resolves YES if ${H} wins, including overtime, extra innings or any tiebreak the competition uses. Resolves NO if ${A} wins.`,
    }[prop] || '') + off;
  },
  sources(g) {
    const s = [];
    if (g.espn) s.push(g.espn.sp === 'soccer' ? `https://www.espn.com/soccer/match/_/gameId/${g.espn.espnId}` : `https://www.espn.com/${g.espn.sp === 'football' ? 'nfl' : g.espn.lg}/game/_/gameId/${g.espn.espnId}`);
    if (g.pm.slug) s.push(`https://polymarket.com/event/${g.pm.slug}`);
    s.push(g.football ? 'https://www.bbc.com/sport/football/scores-fixtures' : 'https://www.espn.com/');
    return s;
  },
  /** Everything Panta's market-creation endpoint needs for one prop. Trading closes at kick-off. */
  createBody(g, prop) {
    const q = this.question(g, prop); if (!q) return null; const t = Math.floor(Date.now() / 1000);
    const end = Math.floor(g.start / 1000); const settle = end + (g.football ? 3 : 5) * 3600;
    const image = [g.image, g.home.logo, g.away.logo].find(u => /^https:\/\//.test(u || '')) || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png';
    return { question: q, title: q, description: `${g.league}: ${g.home.name} vs ${g.away.name}. Created from Nexis Sports.`, resolutionRule: this.rule(g, prop), sourcesOfTruth: this.sources(g), category: 'sports', marketType: 'breaking', startTime: t, endTime: end, resolutionTime: settle, imageUrl: image, region: g.region || 'Global' };
  },

  /* ---------- registry (/api/book) and Panta markets ---------- */
  reg: new Map(), regAt: new Map(), regOk: true,
  props(g) { return [...(g.football ? ['home', 'draw', 'away', 'ou25', 'btts'] : ['winner']), ...(g.extra || []).map(m => 'pm:' + m.id.replace(/^pm-/, ''))]; },
  /** Looks up the Panta markets registered for these games (cached 30s), then loads their Panta prices. */
  async loadReg(games, { extra = false } = {}) {
    const keys = games.flatMap(g => this.props(g).filter(p => extra || !p.startsWith('pm:')).map(p => g.id + ':' + p)).filter(k => now() - (this.regAt.get(k) || 0) > 30e3);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 300) {
      const part = keys.slice(i, i + 300);
      try { const r = await Net.api('book?keys=' + encodeURIComponent(part.join(','))); this.regOk = true; part.forEach(k => { this.regAt.set(k, now()); const v = r.markets && r.markets[k]; if (v) { this.reg.set(k, v); Panta.rememberTitle(v.marketId, v.question); } }); }
      catch (e) { this.regOk = e.code !== 'NO_STORE'; part.forEach(k => this.regAt.set(k, now())); }
    }
    const ids = [...new Set(keys.map(k => this.reg.get(k)).filter(Boolean).map(v => v.marketId))].filter(id => !Panta.markets.has(id));
    for (const id of ids.slice(0, 24)) { try { await Panta.detail(id); } catch (e) { /* shown as estimate */ } }
    Panta.watch([...new Set(keys.map(k => this.reg.get(k)).filter(Boolean).map(v => v.marketId))]);
    Bus.emit('book:reg');
  },
  pantaFor(g, prop) { const r = this.reg.get(g.id + ':' + prop); return r ? Panta.markets.get(r.marketId) || { id: r.marketId, pending: true } : null; },
  /** Polymarket-based probability of YES for a prop (the estimate shown until a Panta market exists). */
  estimate(g, prop) {
    const k = g.id + ':' + prop + ':' + Poly.gamesAt; if (this._est.has(k)) { const f = this._est.get(k); return f(); }
    let f = () => null;
    if (prop.startsWith('pm:')) { const m = Poly.markets.get('pm-' + prop.slice(3)); if (m) f = () => m.yes; }
    else if (g.football && ['home', 'draw', 'away'].includes(prop)) {
      const yes = g.markets.filter(m => /^yes$/i.test(m.yesLabel));
      const m = prop === 'draw' ? yes.find(x => /draw/i.test(x.q)) : yes.find(x => !/draw/i.test(x.q) && /\bwin\b/i.test(x.q) && this.side(g, x.q) === prop);
      if (m) f = () => m.yes;
    } else if (prop === 'ou25') { const m = g.markets.find(x => /total|o\/u|over/i.test(x.q + x.smt) && (x.line === 2.5 || /\b2\.5\b/.test(x.q))); if (m) { const over = /over/i.test(m.yesLabel) || /^yes$/i.test(m.yesLabel); f = () => over ? m.yes : 1 - m.yes; } }
    else if (prop === 'btts') { const m = g.markets.find(x => /both teams to score|btts/i.test(x.q + x.smt)); if (m) f = () => m.yes; }
    else if (prop === 'winner') {
      const two = g.markets.find(x => !/^yes$/i.test(x.yesLabel) && this.side(g, x.yesLabel)) ; const yes = g.markets.find(x => /^yes$/i.test(x.yesLabel) && /\bwin\b/i.test(x.q) && this.side(g, x.q) === 'home');
      if (two) { const homeFirst = this.side(g, two.yesLabel) === 'home'; f = () => homeFirst ? two.yes : 1 - two.yes; } else if (yes) f = () => yes.yes;
    }
    this._est.set(k, f); if (this._est.size > 20000) this._est.clear(); return f();
  },
  /** Price to buy one side, where it comes from, and whether it can be bet right now. */
  quote(g, prop, side) {
    const open = g.state === 'pre' && g.start > now() + 2 * 60e3;
    const pm = this.pantaFor(g, prop);
    if (pm && pm.yes != null && !pm.pending) { const p = side === 'YES' ? pm.yes : (pm.no != null ? pm.no : 1 - pm.yes); return { p, src: 'panta', open: open && pm.tradable !== false, market: pm }; }
    const e = this.estimate(g, prop); const p = e == null ? null : side === 'YES' ? e : 1 - e;
    return { p, src: 'est', open, market: pm };
  },
  odds(p, fmt) {
    if (!(p > 0 && p < 1)) return '—'; const d = 1 / p;
    if (fmt === 'american') return d >= 2 ? '+' + Math.round((d - 1) * 100) : '-' + Math.round(100 / (d - 1));
    if (fmt === 'fractional') { const x = d - 1; let best = [Math.round(x), 1], err = Math.abs(x - best[0]); for (let den = 2; den <= 20; den++) { const num = Math.round(x * den); const e = Math.abs(x - num / den); if (e < err - 1e-9) { best = [num, den]; err = e; } } const gcd = (a, b) => b ? gcd(b, a % b) : a; const k = gcd(best[0], best[1]) || 1; return `${best[0] / k}/${best[1] / k}`; }
    return d >= 100 ? d.toFixed(0) : d.toFixed(2);
  },
  shortId(g) { return String(g.id).replace(/\D/g, '').slice(-6) || g.id; },

  /* ---------- bet slip (singles; kept in this browser) ---------- */
  slip: [], stakes: {},
  loadSlip() { try { const j = JSON.parse(localStorage.getItem('nexis-slip2') || '{}'); this.slip = Array.isArray(j.slip) ? j.slip.slice(0, 20) : []; this.stakes = j.stakes || {}; } catch (e) { /* storage unavailable */ } },
  saveSlip() { try { localStorage.setItem('nexis-slip2', JSON.stringify({ slip: this.slip, stakes: this.stakes })); } catch (e) { /* storage unavailable */ } },
  inSlip(key) { return this.slip.some(s => s.key === key); },
  toggle(key, info) { const i = this.slip.findIndex(s => s.key === key); if (i >= 0) this.slip.splice(i, 1); else { this.slip.push({ key, ...info }); if (!this.stakes[key]) this.stakes[key] = '10'; } this.saveSlip(); Bus.emit('slip'); },
  remove(key) { this.slip = this.slip.filter(s => s.key !== key); delete this.stakes[key]; this.saveSlip(); Bus.emit('slip'); },
  clear() { this.slip = []; this.stakes = {}; this.saveSlip(); Bus.emit('slip'); },
  /** Slip entries with their game and current price. Key: <game>|<prop>|<YES|NO>. */
  resolved() { return this.slip.map(s => { const [gid, prop, side] = s.key.split('|'); const g = this.get(gid); const q = g ? this.quote(g, prop, side) : { p: null, open: false }; return { ...s, g, prop, side, q, stake: nz(String(this.stakes[s.key] || '').replace(/[^0-9.]/g, ''), 0) }; }); },
};
Book.loadSlip();
