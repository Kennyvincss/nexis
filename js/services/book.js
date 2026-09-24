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
  epl: ['English Premier League', 'Football', 'England'], lal: ['La Liga', 'Football', 'Spain'], sea: ['Serie A', 'Football', 'Italy'], bun: ['Bundesliga', 'Football', 'Germany'],
  fl1: ['Ligue 1', 'Football', 'France'], ucl: ['UEFA Champions League', 'Football', 'Europe'], uel: ['Europa League', 'Football', 'Europe'], uecl: ['Conference League', 'Football', 'Europe'],
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
const BOOK_SPORTS = ['Football', 'Basketball', 'Tennis', 'Baseball', 'Hockey', 'MMA', 'Boxing', 'Cricket', 'Rugby', 'Motorsport', 'Golf', 'Esports', 'Other'];
const BOOK_CATS = ['Match result', 'Handicap', 'Totals', 'Both teams to score', 'Other'];
/* Leagues listed first (in this order) wherever leagues are listed; the rest follow by volume. */
const BOOK_TOP = ['English Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UEFA Champions League', 'Europa League', 'UEFA Europa League', 'Conference League', 'UEFA Conference League', 'Eredivisie', 'Primeira Liga', 'MLS', 'Saudi Pro League', 'NBA', 'NFL', 'MLB', 'NHL', 'WNBA', 'ATP', 'WTA', 'UFC'];
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
/* Football list tabs (column header, prop, side). Other sports get per-game columns from Book.tabs(). */
const BOOK_FOOTBALL_TABS = [
  { id: '3way', label: '3 Way & O/U', cols: [['1', 'home', 'YES'], ['X', 'draw', 'YES'], ['2', 'away', 'YES'], ['O 2.5', 'ou25', 'YES'], ['U 2.5', 'ou25', 'NO']] },
  { id: 'ou', label: 'Over/Under', cols: [['O 1.5', 'ou15', 'YES'], ['U 1.5', 'ou15', 'NO'], ['O 3.5', 'ou35', 'YES'], ['U 3.5', 'ou35', 'NO']] },
  { id: 'hcp', label: 'Handicap', cols: [['1 −1.5', 'hc_h1', 'YES'], ['2 +1.5', 'hc_h1', 'NO'], ['1 +1.5', 'hc_a1', 'NO'], ['2 −1.5', 'hc_a1', 'YES']] },
  { id: 'ht', label: 'Half Time', cols: [['HT 1', 'ht_home', 'YES'], ['HT X', 'ht_draw', 'YES'], ['HT 2', 'ht_away', 'YES']] },
];
const BOOK_OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
const BOOK_HTFT = ['hh', 'hd', 'ha', 'dh', 'dd', 'da', 'ah', 'ad', 'aa'];
const BOOK_CORNER_LINES = [8.5, 9.5, 10.5];
const BOOK_CARD_LINES = [3.5, 4.5, 5.5];
const lineKey = (l) => String(l).replace('.', '');
const BOOK_SCORES = ['1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '0-0', '1-1', '2-2', '3-3', '0-1', '0-2', '1-2', '0-3', '1-3', '2-3'];
const ouKey = (line) => 'ou' + String(line).replace('.', '');

const Book = {
  _v: '', _list: [], _model: new Map(),
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
      const e = espn.get(p.id) || null; let L = leagueOf(p, e);
      // The six main football leagues always carry the same key and name, whatever Polymarket or ESPN call them.
      const pin = footballPinned({ key: L.key, code: p.league, name: L.name }) || footballPinned({ name: p.series }); if (pin) L = { key: pin.key, name: pin.name, sport: 'Football', region: pin.region };
      if (sportExcluded({ sport: L.sport, key: L.key, code: p.league, name: L.name, tags: p.tags }) || sportExcluded({ name: p.series })) return; // not offered on Nexis
      // Sides: ESPN's home/away when matched (which Polymarket name is home?), else Polymarket's order.
      let home = { name: p.a, short: trim(p.a), logo: null, score: null, pm: p.a }, away = { name: p.b, short: trim(p.b), logo: null, score: null, pm: p.b };
      if (e) { const flip = teamMatch(e.home, p.b, p.abbrs) && !teamMatch(e.home, p.a, p.abbrs); const H = e.home, A = e.away; home = { name: H.name, short: H.short, logo: H.logo, score: H.score, pm: flip ? p.b : p.a }; away = { name: A.name, short: A.short, logo: A.logo, score: A.score, pm: flip ? p.a : p.b }; }
      if (home.score == null) { const sc = /^(\d+)\s*-\s*(\d+)/.exec(p.score || ''); if (sc) { home.score = +sc[1]; away.score = +sc[2]; } }
      const state = e ? e.state : p.ended ? 'post' : p.live ? 'in' : p.start < now() - 4 * HOUR ? 'post' : 'pre';
      // Three-way (with a draw) whenever it's football by league, by ESPN, or because Polymarket lists a draw for it.
      const hasDraw = markets.some(m => /\bdraw\b/i.test(m.q || ''));
      const football = L.sport === 'Football' || (e && e.sp === 'soccer') || hasDraw;
      const sport = football && (!L.sport || L.sport === 'Other') ? 'Football' : (L.sport || 'Other');
      const g = { id: String(p.id), pm: p, espn: e, start: e ? e.start : p.start, state, clock: e ? (e.detail || e.clock) : [p.period, p.elapsed].filter(Boolean).join(' '), home, away, league: L.name, leagueKey: L.key, sport, region: L.region, markets, vol: p.volume, football, image: p.image };
      g.extra = this.extraMarkets(g); g.tabs = this.tabs(g);
      out.push(g);
    });
    return out.sort((a, b) => a.start - b.start);
  },
  sportFromTags(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    if (/\bnfl\b|american football|college football|\bcfl\b/.test(t)) return 'American Football';
    if (/\bafl\b|australian football/.test(t)) return 'Australian Football';
    return /soccer|football(?!.*american)/.test(t) ? 'Football' : /basketball|nba/.test(t) ? 'Basketball' : /tennis/.test(t) ? 'Tennis' : /nfl|american football/.test(t) ? 'American Football' : /baseball|mlb/.test(t) ? 'Baseball' : /hockey|nhl/.test(t) ? 'Hockey' : /ufc|mma/.test(t) ? 'MMA' : /boxing/.test(t) ? 'Boxing' : /cricket/.test(t) ? 'Cricket' : /esport|counter|league of legends|dota|valorant/.test(t) ? 'Esports' : /rugby/.test(t) ? 'Rugby' : 'Other';
  },
  side(g, name) { const n = String(name || '').replace(/^will\s+/i, '').replace(/\s+(win|beat)\b.*$/i, '').replace(/\?$/, ''); return teamMatch({ name: g.home.pm, short: g.home.short, abbr: '' }, n, null) || teamMatch(g.home, n, null) ? 'home' : teamMatch({ name: g.away.pm, short: g.away.short, abbr: '' }, n, null) || teamMatch(g.away, n, null) ? 'away' : null; },
  lineOf(m) { if (m.line != null && Number.isFinite(+m.line)) return +m.line; const x = /\(?([+-]?\d+(?:\.\d+)?)\)?\s*$/.exec(String(m.q || '').replace(/\?$/, '')); return x ? +x[1] : null; },
  isTotal(m) { return /total/i.test(m.smt || '') || /\bo\/u\b|over\/under|\btotal\b/i.test(m.q || ''); },
  isSpread(m) { return /spread|handicap/i.test(m.smt || '') || /spread|handicap/i.test(m.q || ''); },
  /** Polymarket markets for the game not covered by the fixed props (player props, other lines…); mirrored as pm:<id>. */
  extraMarkets(g) {
    return g.markets.filter(m => {
      const q = m.q || '';
      if (/\bdraw\b/i.test(q) || (/^will .* win/i.test(q) && this.side(g, q))) return false;
      if (/moneyline/i.test(m.smt || '') && !/^yes$/i.test(m.yesLabel)) return false;
      if (/both teams to score|btts/i.test(q + (m.smt || ''))) return false;
      if (g.football && this.isTotal(m) && BOOK_OU_LINES.includes(this.lineOf(m))) return false;
      if (g.football && this.isSpread(m) && [1.5, 2.5].includes(Math.abs(this.lineOf(m) || 0))) return false;
      if (!g.football && (m.id === (this.pmTotal(g) || {}).id || m.id === (this.pmSpread(g) || {}).id)) return false;
      return true;
    });
  },
  pmTotal(g) { return g.markets.filter(m => this.isTotal(m) && this.lineOf(m) != null).sort((a, b) => b.vol - a.vol)[0] || null; },
  pmSpread(g) { return g.markets.filter(m => this.isSpread(m) && this.lineOf(m) != null).sort((a, b) => b.vol - a.vol)[0] || null; },
  /** List columns per tab: football uses fixed props; other sports use winner + Polymarket's main total and spread (mirrored). */
  tabs(g) {
    if (g.football) return BOOK_FOOTBALL_TABS.map(t => ({ ...t, cols: t.cols.map(([h, prop, side]) => ({ h, prop, side })) }));
    const pid = (m) => 'pm:' + m.id.replace(/^pm-/, '');
    const tot = this.pmTotal(g), spr = this.pmSpread(g);
    const overIdx = tot ? (/under/i.test(tot.yesLabel) ? 1 : 0) : 0;
    const totCols = tot ? [{ h: 'Over', prop: pid(tot), side: overIdx === 0 ? 'YES' : 'NO', sub: 'O ' + this.lineOf(tot) }, { h: 'Under', prop: pid(tot), side: overIdx === 0 ? 'NO' : 'YES', sub: 'U ' + this.lineOf(tot) }] : [null, null];
    let sprCols = [null, null];
    if (spr) {
      const line = this.lineOf(spr); const bare = (t) => String(t || '').replace(/^spread:\s*/i, '').replace(/\(.*?\)/g, '').trim();
      const yesTeam = /^yes$/i.test(spr.yesLabel) ? this.side(g, bare(spr.q)) : this.side(g, bare(spr.yesLabel));
      const f = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x); const homeYes = yesTeam !== 'away';
      sprCols = [{ h: '1', prop: pid(spr), side: homeYes ? 'YES' : 'NO', sub: f(homeYes ? line : -line) }, { h: '2', prop: pid(spr), side: homeYes ? 'NO' : 'YES', sub: f(homeYes ? -line : line) }];
    }
    return [
      { id: 'main', label: 'Winner & Totals', cols: [{ h: '1', prop: 'winner', side: 'YES' }, { h: '2', prop: 'winner', side: 'NO' }, ...totCols] },
      { id: 'hcp', label: 'Handicap', cols: sprCols },
    ];
  },

  /* ---------- props: question, rules and sources for each Panta market ---------- */
  dateText(g) { return new Date(g.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); },
  /** Human name of a prop's bet type (slip + game page). */
  marketName(g, prop) {
    { const x = this.nameX(g, prop); if (x) return x; }
    if (['home', 'draw', 'away'].includes(prop)) return 'Match result (1X2)';
    if (prop === 'winner') return 'Winner';
    let m;
    if ((m = /^ou(\d)5$/.exec(prop))) return `Total goals O/U ${m[1]}.5`;
    if ((m = /^htou(\d)5$/.exec(prop))) return `1st half goals O/U ${m[1]}.5`;
    if ((m = /^hc_([ha])(\d)$/.exec(prop))) return `Handicap ${m[1] === 'h' ? g.home.short : g.away.short} −${m[2]}.5`;
    if (/^ht_/.test(prop)) return 'Half-time result';
    if ((m = /^cs_(\d)_(\d)$/.exec(prop))) return 'Correct score';
    if (prop.startsWith('pm:')) { const x = Poly.markets.get('pm-' + prop.slice(3)); return x ? (x.group && !/^(yes|no)$/i.test(x.group) ? x.group : x.q) : 'Market'; }
    return prop;
  },
  question(g, prop) {
    { const x = this.questionX(g, prop); if (x) return x; }
    const H = g.home.pm, A = g.away.pm, D = this.dateText(g); let m;
    if (prop.startsWith('pm:')) { const x = Poly.markets.get('pm-' + prop.slice(3)); if (!x) return null; return /^yes$/i.test(x.yesLabel) ? x.q : `${x.q} — will ${x.yesLabel} be the result?`; }
    if ((m = /^ou(\d)5$/.exec(prop))) return `Will ${H} vs ${A} on ${D} have ${+m[1] + 1} or more total goals?`;
    if ((m = /^htou(\d)5$/.exec(prop))) return `Will ${H} vs ${A} on ${D} have ${+m[1] + 1} or more goals in the first half?`;
    if ((m = /^hc_([ha])(\d)$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `Will ${X} beat ${Y} by ${+m[2] + 1} or more goals in their match on ${D}?`; }
    if ((m = /^cs_(\d)_(\d)$/.exec(prop))) return `Will ${H} vs ${A} on ${D} finish ${m[1]}-${m[2]} (${H} ${m[1]}, ${A} ${m[2]})?`;
    return { home: `Will ${H} beat ${A} in their match on ${D}?`, draw: `Will ${H} vs ${A} on ${D} end in a draw?`, away: `Will ${A} beat ${H} in their match on ${D}?`,
      ht_home: `Will ${H} lead ${A} at half-time in their match on ${D}?`, ht_draw: `Will ${H} vs ${A} on ${D} be level at half-time?`, ht_away: `Will ${A} lead ${H} at half-time in their match on ${D}?`,
      btts: `Will both ${H} and ${A} score in their match on ${D}?`, winner: `Will ${H} beat ${A} on ${D}?` }[prop] || null;
  },
  rule(g, prop) {
    { const x = this.ruleX(g, prop); if (x) return x; }
    const H = g.home.pm, A = g.away.pm, when = new Date(g.start).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; let m;
    const base = `This market is about the ${g.league} ${g.football ? 'match' : 'game'} ${H} vs ${A} scheduled for ${when}.`;
    const ft = ' It is settled on the score after regular time: 90 minutes plus stoppage time. Extra time and penalty shoot-outs do not count.';
    const ht = ' It is settled on the score at half-time (end of the first 45 minutes plus stoppage time).';
    const off = ' If the match is abandoned or not played within 48 hours of the scheduled start, the market is cancelled.';
    if (prop.startsWith('pm:')) { const x = Poly.markets.get('pm-' + prop.slice(3)); return `${base} It mirrors the Polymarket market "${x ? x.q : ''}" (${Poly.url(x || {})}) and resolves ${x && !/^yes$/i.test(x.yesLabel) ? `YES if "${x.yesLabel}" is the result and NO if "${x.noLabel}" is` : 'the same way'}. ${(x && x.rule) || ''}`.slice(0, 2048); }
    if ((m = /^ou(\d)5$/.exec(prop))) return `${base}${ft} Resolves YES if the two teams score ${+m[1] + 1} or more goals in total (over ${m[1]}.5). Resolves NO if they score ${m[1]} or fewer. Own goals count.${off}`;
    if ((m = /^htou(\d)5$/.exec(prop))) return `${base}${ht} Resolves YES if ${+m[1] + 1} or more goals are scored in the first half (over ${m[1]}.5). Resolves NO otherwise.${off}`;
    if ((m = /^hc_([ha])(\d)$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `${base}${ft} Resolves YES if ${X} wins by ${+m[2] + 1} or more goals (${X} −${m[2]}.5). Resolves NO otherwise, including if ${Y} wins or the match is drawn.${off}`; }
    if ((m = /^cs_(\d)_(\d)$/.exec(prop))) return `${base}${ft} Resolves YES if the final score is exactly ${H} ${m[1]}, ${A} ${m[2]}. Resolves NO for any other score.${off}`;
    return base + ({
      home: `${ft} Resolves YES if ${H} wins. Resolves NO if ${A} wins or the match is drawn.`,
      draw: `${ft} Resolves YES if the match is drawn. Resolves NO if either team wins.`,
      away: `${ft} Resolves YES if ${A} wins. Resolves NO if ${H} wins or the match is drawn.`,
      ht_home: `${ht} Resolves YES if ${H} is ahead at half-time. Resolves NO otherwise.`,
      ht_draw: `${ht} Resolves YES if the score is level at half-time. Resolves NO otherwise.`,
      ht_away: `${ht} Resolves YES if ${A} is ahead at half-time. Resolves NO otherwise.`,
      btts: `${ft} Resolves YES if both teams score at least one goal. Resolves NO otherwise.`,
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
  /** Everything Panta's market-creation endpoint needs for one prop. Trading runs until about full time (in-play). */
  createBody(g, prop) {
    const q = this.question(g, prop); if (!q) return null; const t = Math.floor(Date.now() / 1000);
    // Trading stays open through the game (in-play): until about full time; settles after it.
    const ko = Math.floor(g.start / 1000); const settle = ko + (g.football ? 3 : 5) * 3600; const end = Math.min(settle - 1800, Math.max(ko + (g.football ? 2 : 3.5) * 3600, t + 15 * 60));
    const image = [g.image, g.home.logo, g.away.logo].find(u => /^https:\/\//.test(u || '')) || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png';
    return { question: q, title: q, description: `${g.league}: ${g.home.name} vs ${g.away.name}. Created from Nexis Sports.`, resolutionRule: this.rule(g, prop), sourcesOfTruth: this.sources(g), category: 'sports', marketType: 'breaking', startTime: t, endTime: end, resolutionTime: settle, imageUrl: image, region: g.region || 'Global' };
  },

  /* ---------- registry (/api/book) and Panta markets ---------- */
  reg: new Map(), regAt: new Map(), regOk: true,
  /** Props shown in the list (all tabs) — looked up in the registry for the visible games. */
  listProps(g) { return [...new Set(g.tabs.flatMap(t => t.cols.filter(Boolean).map(c => c.prop)))]; },
  /** Every prop on the game page. */
  props(g) {
    if (!g.football) return [...this.listProps(g), ...(g.extra || []).map(m => 'pm:' + m.id.replace(/^pm-/, ''))];
    const L = this.liveInfo(g); const next = L.sh + L.sa + 1;
    const ng = L.live && next >= 2 && next <= 9 ? ['ng' + next + '_home', 'ng' + next + '_away'] : [];
    return [...new Set(['home', 'draw', 'away', ...BOOK_OU_LINES.map(ouKey), 'btts', 'ht_home', 'ht_draw', 'ht_away', 'htou05', 'htou15', ...BOOK_HTFT.map(x => 'htft_' + x),
      ...BOOK_SCORES.map(s => 'cs_' + s.replace('-', '_')), 'fts_home', 'fts_away', ...ng, ...BOOK_CORNER_LINES.map(l => 'cor_o' + lineKey(l)), 'corh_o45', 'cora_o45', 'corhc_h1', 'corhc_a1',
      ...BOOK_CARD_LINES.map(l => 'crd_o' + lineKey(l)), 'crdh_o15', 'crda_o15', 'hc_h1', 'hc_a1', 'hc_h2', 'hc_a2', ...(g.extra || []).map(m => 'pm:' + m.id.replace(/^pm-/, ''))])];
  },
  /** Looks up the Panta markets registered for these games (cached 30s), then loads their Panta prices. */
  async loadReg(games, { extra = false } = {}) {
    const keys = games.flatMap(g => (extra ? this.props(g) : this.listProps(g)).map(p => g.id + ':' + p)).filter(k => now() - (this.regAt.get(k) || 0) > 30e3);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 300) {
      const part = keys.slice(i, i + 300);
      try { const r = await Net.api('book?keys=' + encodeURIComponent(part.join(','))); this.regOk = true; part.forEach(k => { this.regAt.set(k, now()); const v = r.markets && r.markets[k]; if (v) { this.reg.set(k, v); Panta.rememberTitle(v.marketId, v.question); } }); }
      catch (e) { this.regOk = e.code !== 'NO_STORE'; part.forEach(k => this.regAt.set(k, now())); }
    }
    const ids = [...new Set(keys.map(k => this.reg.get(k)).filter(Boolean).map(v => v.marketId))];
    for (const id of ids.filter(id => !Panta.markets.has(id)).slice(0, 24)) { try { await Panta.detail(id); } catch (e) { /* shown as estimate */ } }
    Panta.watch(ids);
    Bus.emit('book:reg');
  },
  pantaFor(g, prop) { const r = this.reg.get(g.id + ':' + prop); return r ? Panta.markets.get(r.marketId) || { id: r.marketId, pending: true } : null; },

  /* ---------- estimated odds ---------- */
  /** Goals model for a football game, fitted like a bookmaker's: home and away scoring rates (Poisson) that
      reproduce Polymarket's 1X2 prices and, when listed, its over/under 2.5 price. Half-time uses 45% of each rate. */
  /** Live corner and card counts from ESPN (null when ESPN has no live stats for the game). Corners: each team's
      "wonCorners" statistic; cards: the yellow and red cards in ESPN's match events. */
  liveCounts(g) {
    const e = g.espn; if (!e || g.state !== 'in') return { corners: null, cards: null };
    const sum = Sports.summaries && Sports.summaries[e.id]; const ts = (id) => sum && (sum.teamStats || []).find(t => t.id === id);
    const stat = (t, name) => { const v = t.stats && t.stats[name]; if (v != null && v !== '') return nz(v, null); const s = ts(t.id); const x = s && s.stats.find(y => y.name === name); return x ? nz(x.value, null) : null; };
    const ch = stat(e.home, 'wonCorners'), ca = stat(e.away, 'wonCorners');
    const cards = (side) => (e.details || []).filter(d => d.side === side && (d.kind === 'yellow' || d.kind === 'red')).length;
    const flip = g.home.name !== e.home.name; // Nexis home = ESPN home unless the sides were swapped
    const corners = ch != null && ca != null ? (flip ? [ca, ch] : [ch, ca]) : null;
    const cd = [cards('home'), cards('away')];
    return { corners, cards: flip ? cd.reverse() : cd };
  },
  /** Live state of a game for in-play pricing: minute (0 before kick-off), current score, whether half-time has passed. */
  liveInfo(g) {
    if (g.state !== 'in') return { live: false, min: 0, sh: 0, sa: 0, htDone: false };
    // ESPN: displayClock "67'" / "45'+2'", detail "HT"; Polymarket only: elapsed "67", period "1H" / "HT" / "2H".
    const clk = String(g.espn ? (g.espn.clock || g.espn.detail || '') : (g.pm.elapsed || ''));
    const per = String(g.espn ? (g.espn.detail || '') : (g.pm.period || ''));
    const ht = /\bHT\b|half.?time/i.test(clk + ' ' + per);
    let min = ht ? 45 : nz((/(\d+)/.exec(clk) || [])[1], 0); min = clamp(min, 0, 90);
    const period = g.espn ? nz(g.espn.period, 0) : /2H|second/i.test(per) ? 2 : 0;
    return { live: true, min, sh: nz(g.home.score, 0), sa: nz(g.away.score, 0), htDone: ht || period >= 2 || min > 45 };
  },
  /** Goals model for a football game, fitted like a bookmaker's: home and away scoring rates (Poisson) that reproduce
      Polymarket's 1X2 prices and, when listed, its over/under 2.5 price. In play, the fit is for the goals still to
      come on top of the current score, over the time left (45% of goals in the first half, 55% in the second). */
  model(g) {
    const L = this.liveInfo(g);
    const k = g.id + '|' + Poly.gamesAt + '|' + L.sh + '-' + L.sa + '|' + Math.floor(L.min) + '|' + L.htDone; const c = this._model.get(g.id); if (c && c.k === k) return c.v;
    const yes = g.markets.filter(m => /^yes$/i.test(m.yesLabel));
    const pick = (side) => yes.find(x => !/draw/i.test(x.q) && /\bwin\b/i.test(x.q) && this.side(g, x.q) === side);
    const mh = pick('home'), ma = pick('away'), md = yes.find(x => /\bdraw\b/i.test(x.q));
    let v = null;
    if (mh && ma) {
      let ph = mh.yes, pa = ma.yes, pd = md ? md.yes : Math.max(0.05, 1 - ph - pa); const sum = ph + pa + pd; ph /= sum; pa /= sum; pd /= sum;
      const ou = g.markets.find(x => this.isTotal(x) && this.lineOf(x) === 2.5); const pOver = ou ? (/under/i.test(ou.yesLabel) ? 1 - ou.yes : ou.yes) : null;
      const w1 = 0.45 * Math.max(0, 45 - L.min) / 45, w2 = 0.55 * (L.min <= 45 ? 1 : Math.max(0, 90 - L.min) / 45), W = Math.max(w1 + w2, 1e-4);
      const pois = (l) => { const out = [Math.exp(-l)]; for (let i = 1; i <= 10; i++) out.push(out[i - 1] * l / i); return out; };
      const grid = (lh, la) => { const H = pois(lh), A = pois(la); return H.map(x => A.map(y => x * y)); };
      const sums = (G) => { let w = 0, d = 0, l = 0; G.forEach((r, i) => r.forEach((p, j) => { const a = i + L.sh, b = j + L.sa; if (a > b) w += p; else if (a === b) d += p; else l += p; })); return { w, d, l }; };
      const split = (T) => { let lo = 0.01, hi = 0.99; for (let n = 0; n < 40; n++) { const s = (lo + hi) / 2; const r = sums(grid(T * s * W, T * (1 - s) * W)); if (r.w - r.l < ph - pa) lo = s; else hi = s; } return (lo + hi) / 2; };
      const need = 3 - L.sh - L.sa; // goals still needed for over 2.5
      let T = 2.7;
      if (pOver != null && need > 0 && pOver > 0.01 && pOver < 0.99) { let lo = 0.2, hi = 8; for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; const P = pois(mid * W); let under = 0; for (let x = 0; x < need; x++) under += P[x]; if (1 - under < pOver) lo = mid; else hi = mid; } T = (lo + hi) / 2; }
      else if (!L.live) { let lo = 0.3, hi = 7; for (let n = 0; n < 30; n++) { const mid = (lo + hi) / 2; const s = split(mid); const d = sums(grid(mid * s, mid * (1 - s))).d; if (d > pd) lo = mid; else hi = mid; } T = (lo + hi) / 2; }
      const s = split(T); v = { T, s, W, w1, w2, ...L, grid, pois, lh: T * s, la: T * (1 - s) };
    }
    if (this._model.size > 5000) this._model.clear(); this._model.set(g.id, { k, v }); return v;
  },
  /** Probability of YES for a prop from the goals model (football), from the current score when in play. */
  modelP(g, prop) {
    const M = this.model(g); if (!M) return null; let m;
    { const x = this.modelX(g, M, prop); if (x !== undefined) return x; }
    const half = /^ht/.test(prop);
    if (half && M.htDone) return null; // decided at half-time
    const f = half ? M.w1 : M.W;
    const G = M.grid(M.T * M.s * f, M.T * (1 - M.s) * f);
    const sum = (fn) => { let p = 0; G.forEach((r, i) => r.forEach((x, j) => { if (fn(i + M.sh, j + M.sa)) p += x; })); return p; };
    if (prop === 'home' || prop === 'ht_home') return sum((i, j) => i > j);
    if (prop === 'draw' || prop === 'ht_draw') return sum((i, j) => i === j);
    if (prop === 'away' || prop === 'ht_away') return sum((i, j) => i < j);
    if ((m = /^(?:ht)?ou(\d)5$/.exec(prop))) return sum((i, j) => i + j > +m[1]);
    if ((m = /^hc_([ha])(\d)$/.exec(prop))) return sum((i, j) => (m[1] === 'h' ? i - j : j - i) > +m[2]);
    if ((m = /^cs_(\d)_(\d)$/.exec(prop))) return sum((i, j) => i === +m[1] && j === +m[2]);
    if (prop === 'btts') return sum((i, j) => i > 0 && j > 0);
    return null;
  },
  /** Polymarket-based probability of YES for a prop (shown until a Panta market exists): Polymarket's own price
      where it lists the same bet, otherwise the goals model (football). */
  estimate(g, prop) {
    if (prop.startsWith('pm:')) { const m = Poly.markets.get('pm-' + prop.slice(3)); return m ? m.yes : null; }
    if (!g.football) {
      if (prop !== 'winner') return null;
      const two = g.markets.find(x => !/^yes$/i.test(x.yesLabel) && this.side(g, x.yesLabel) && !this.isTotal(x) && !this.isSpread(x));
      if (two) return this.side(g, two.yesLabel) === 'home' ? two.yes : 1 - two.yes;
      const yes = g.markets.find(x => /^yes$/i.test(x.yesLabel) && /\bwin\b/i.test(x.q) && this.side(g, x.q) === 'home');
      return yes ? yes.yes : null;
    }
    const yes = g.markets.filter(m => /^yes$/i.test(m.yesLabel)); let m;
    if (['home', 'draw', 'away'].includes(prop)) { const x = prop === 'draw' ? yes.find(y => /\bdraw\b/i.test(y.q)) : yes.find(y => !/draw/i.test(y.q) && /\bwin\b/i.test(y.q) && this.side(g, y.q) === prop); if (x) return x.yes; }
    if ((m = /^ou(\d)5$/.exec(prop))) { const x = g.markets.find(y => this.isTotal(y) && this.lineOf(y) === +m[1] + 0.5); if (x) return /under/i.test(x.yesLabel) ? 1 - x.yes : x.yes; }
    return this.modelP(g, prop);
  },
  /** Price to buy one side, where it comes from, and whether it can be bet right now. */
  /** Whether a prop can be bet right now: before kick-off, and in play until the 90th minute, except bets that are
      already decided (half-time bets after the break, first scorer after a goal) or can't be priced live (corners, cards). */
  canBet(g, prop) {
    if (g.state === 'pre') return g.start > now() + 60e3 || g.start > now() - 5 * 60e3;
    if (g.state !== 'in') return false;
    if (!g.football) return true;
    const L = this.liveInfo(g);
    if (L.min >= 90) return false;
    if (/^(ht_|htou|htft_)/.test(prop) && L.htDone) return false;
    if (/^fts_/.test(prop) && L.sh + L.sa > 0) return false; // decided: becomes "next team to score"
    { const m = /^ng(\d)_/.exec(prop); if (m && +m[1] !== L.sh + L.sa + 1) return false; } // only the next goal is open
    const C = this.liveCounts(g);
    if (/^cor/.test(prop) && !C.corners) return false; // no live corner stats for this game
    if (/^crd/.test(prop) && !g.espn) return false;
    return true;
  },
  quote(g, prop, side) {
    let open = this.canBet(g, prop);
    const pm = this.pantaFor(g, prop);
    const decided = (p) => p != null && (p < 0.01 || p > 0.99); // a (near-)certain outcome isn't offered
    if (pm && pm.yes != null && !pm.pending) { const p = side === 'YES' ? pm.yes : (pm.no != null ? pm.no : 1 - pm.yes); return { p, src: 'panta', open: open && pm.tradable !== false && !decided(p), market: pm }; }
    const e = this.estimate(g, prop); const p = e == null ? null : side === 'YES' ? e : 1 - e;
    if (g.state === 'in' && (e == null || decided(p))) open = false;
    return { p, src: 'est', open, market: pm };
  },
  /* ---------- more football bet types: HT/FT, first to score, corners, cards, both teams to score ---------- */
  nameX(g, prop) {
    const H = g.home.short, A = g.away.short; let m;
    if (prop === 'btts') return 'Both teams to score';
    if (/^htft_/.test(prop)) return 'Half time / Full time';
    if (/^fts_/.test(prop)) return 'First team to score';
    if ((m = /^ng(\d)_/.exec(prop))) return `Next team to score (goal ${m[1]})`;
    if ((m = /^cor_o(\d+)5$/.exec(prop))) return `Total corners O/U ${m[1]}.5`;
    if ((m = /^cor([ha])_o(\d)5$/.exec(prop))) return `${m[1] === 'h' ? H : A} corners O/U ${m[2]}.5`;
    if ((m = /^corhc_([ha])1$/.exec(prop))) return `Corner handicap ${m[1] === 'h' ? H : A} −1.5`;
    if ((m = /^crd_o(\d)5$/.exec(prop))) return `Total cards O/U ${m[1]}.5`;
    if ((m = /^crd([ha])_o(\d)5$/.exec(prop))) return `${m[1] === 'h' ? H : A} cards O/U ${m[2]}.5`;
    return null;
  },
  questionX(g, prop) {
    const H = g.home.pm, A = g.away.pm, D = this.dateText(g); let m;
    if ((m = /^htft_([hda])([hda])$/.exec(prop))) { const ht = { h: `${H} leading`, d: 'level', a: `${A} leading` }[m[1]]; const ft = { h: `${H} winning`, d: 'a draw', a: `${A} winning` }[m[2]]; return `Will ${H} vs ${A} on ${D} be ${ht} at half-time and end with ${ft}?`; }
    if ((m = /^ng(\d)_(home|away)$/.exec(prop))) { const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'); const [X, Y] = m[2] === 'home' ? [H, A] : [A, H]; return `Will ${X} score the ${ordinal(+m[1])} goal of their match against ${Y} on ${D}?`; }
    if ((m = /^fts_(home|away)$/.exec(prop))) { const [X, Y] = m[1] === 'home' ? [H, A] : [A, H]; return `Will ${X} score the first goal of their match against ${Y} on ${D}?`; }
    if ((m = /^cor_o(\d+)5$/.exec(prop))) return `Will ${H} vs ${A} on ${D} have ${+m[1] + 1} or more corners in total?`;
    if ((m = /^cor([ha])_o(\d)5$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `Will ${X} win ${+m[2] + 1} or more corners in their match against ${Y} on ${D}?`; }
    if ((m = /^corhc_([ha])1$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `Will ${X} win at least 2 more corners than ${Y} in their match on ${D}?`; }
    if ((m = /^crd_o(\d)5$/.exec(prop))) return `Will ${H} vs ${A} on ${D} have ${+m[1] + 1} or more cards in total?`;
    if ((m = /^crd([ha])_o(\d)5$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `Will ${X} receive ${+m[2] + 1} or more cards in their match against ${Y} on ${D}?`; }
    return null;
  },
  ruleX(g, prop) {
    const H = g.home.pm, A = g.away.pm, when = new Date(g.start).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; let m;
    const base = `This market is about the ${g.league} match ${H} vs ${A} scheduled for ${when}.`;
    const reg = ' Only regular time counts: 90 minutes plus stoppage time; extra time and penalty shoot-outs do not count.';
    const off = ' If the match is abandoned or not played within 48 hours of the scheduled start, the market is cancelled.';
    const corners = ' Corners are counted from the official match statistics (such as ESPN\'s match page). A corner that is awarded and retaken counts once.';
    const cards = ' Each yellow card and each red card shown to a player on the pitch counts as one card; a second yellow followed by a red counts as two. Cards shown to managers, staff or players on the bench, and cards after the final whistle, do not count.';
    if ((m = /^htft_([hda])([hda])$/.exec(prop))) { const ht = { h: `${H} is ahead`, d: 'the score is level', a: `${A} is ahead` }[m[1]]; const ft = { h: `${H} wins`, d: 'the match is drawn', a: `${A} wins` }[m[2]]; return `${base} It is settled on the half-time score and the score after regular time.${reg} Resolves YES if ${ht} at half-time and ${ft} after regular time. Resolves NO otherwise.${off}`; }
    if ((m = /^ng(\d)_(home|away)$/.exec(prop))) { const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'); const [X, Y] = m[2] === 'home' ? [H, A] : [A, H]; return `${base}${reg} Goals are counted in the order they are scored. Resolves YES if ${X} scores the ${ordinal(+m[1])} goal of the match (an own goal counts for the team credited with it). Resolves NO if ${Y} scores it or the match ends with fewer than ${m[1]} goals.${off}`; }
    if ((m = /^fts_(home|away)$/.exec(prop))) { const [X, Y] = m[1] === 'home' ? [H, A] : [A, H]; return `${base}${reg} Resolves YES if ${X} scores the first goal of the match (an own goal counts for the team credited with it). Resolves NO if ${Y} scores first or no goal is scored.${off}`; }
    if ((m = /^cor_o(\d+)5$/.exec(prop))) return `${base}${reg}${corners} Resolves YES if ${+m[1] + 1} or more corners are taken in total (over ${m[1]}.5). Resolves NO otherwise.${off}`;
    if ((m = /^cor([ha])_o(\d)5$/.exec(prop))) { const X = m[1] === 'h' ? H : A; return `${base}${reg}${corners} Resolves YES if ${X} win ${+m[2] + 1} or more corners (over ${m[2]}.5). Resolves NO otherwise.${off}`; }
    if ((m = /^corhc_([ha])1$/.exec(prop))) { const [X, Y] = m[1] === 'h' ? [H, A] : [A, H]; return `${base}${reg}${corners} Resolves YES if ${X} win at least 2 more corners than ${Y} (${X} −1.5 corners). Resolves NO otherwise.${off}`; }
    if ((m = /^crd_o(\d)5$/.exec(prop))) return `${base}${reg}${cards} Resolves YES if ${+m[1] + 1} or more cards are shown in total (over ${m[1]}.5). Resolves NO otherwise.${off}`;
    if ((m = /^crd([ha])_o(\d)5$/.exec(prop))) { const X = m[1] === 'h' ? H : A; return `${base}${reg}${cards} Resolves YES if ${X} players receive ${+m[2] + 1} or more cards (over ${m[2]}.5). Resolves NO otherwise.${off}`; }
    return null;
  },
  /** Estimates for the bet types above from the goals model. Corners and cards have no market price to fit, so they
      use typical match averages (about 10 corners, 4.3 cards), tilted towards the favourite (corners) or the underdog (cards). */
  modelX(g, M, prop) {
    let m;
    const cdf = (l, k) => { let t = Math.exp(-l), s = t; for (let i = 1; i <= k; i++) { t *= l / i; s += t; } return s; };
    const over = (l, line) => 1 - cdf(l, Math.floor(line));
    if ((m = /^htft_([hda])([hda])$/.exec(prop))) {
      if (M.htDone) return null; // the half-time part is already decided
      if (!M._htft) {
        const G1 = M.grid(M.T * M.s * M.w1, M.T * (1 - M.s) * M.w1), G2 = M.grid(M.T * M.s * M.w2, M.T * (1 - M.s) * M.w2); const out = {}; const code = (d) => d > 0 ? 'h' : d < 0 ? 'a' : 'd';
        for (let i1 = 0; i1 <= 7; i1++) for (let j1 = 0; j1 <= 7; j1++) { const p1 = G1[i1][j1]; if (p1 < 1e-9) continue; const a1 = i1 + M.sh, b1 = j1 + M.sa; for (let i2 = 0; i2 <= 7; i2++) for (let j2 = 0; j2 <= 7; j2++) { const k = code(a1 - b1) + code(a1 + i2 - b1 - j2); out[k] = (out[k] || 0) + p1 * G2[i2][j2]; } }
        M._htft = out;
      }
      return M._htft[m[1] + m[2]] || 0;
    }
    if ((m = /^fts_(home|away)$/.exec(prop))) { if (M.sh + M.sa > 0) return null; const l = M.T * M.W; return (1 - Math.exp(-l)) * (m[1] === 'home' ? M.s : 1 - M.s); }
    if ((m = /^ng(\d)_(home|away)$/.exec(prop))) { if (M.sh + M.sa + 1 !== +m[1]) return null; const l = M.T * M.W; return (1 - Math.exp(-l)) * (m[2] === 'home' ? M.s : 1 - M.s); }
    // Corners and cards in play: the current count plus the expected rest of the match (spread evenly over 90 minutes).
    const C = M.live ? this.liveCounts(g) : null; const rem = M.live ? Math.max(0, 90 - M.min) / 90 : 1;
    if (/^cor/.test(prop) && M.live && !(C && C.corners)) return null;
    if (/^crd/.test(prop) && M.live && !g.espn) return null;
    const base = (kind) => (C && C[kind]) || [0, 0];
    if (!M._edge) { const G = M.grid(M.lh, M.la); let w = 0, l = 0; G.forEach((r, i) => r.forEach((x, j) => { if (i > j) w += x; else if (i < j) l += x; })); M._edge = w - l; }
    const edge = M._edge;
    const cShare = clamp(0.5 + edge * 0.35, 0.3, 0.7), CT = 10.2;
    const overFrom = (have, l, line) => have > line ? 1 : over(l, line - have);
    if ((m = /^cor_o(\d+)5$/.exec(prop))) { const b = base('corners'); return overFrom(b[0] + b[1], CT * rem, +m[1] + 0.5); }
    if ((m = /^cor([ha])_o(\d)5$/.exec(prop))) { const b = base('corners'); return overFrom(m[1] === 'h' ? b[0] : b[1], CT * rem * (m[1] === 'h' ? cShare : 1 - cShare), +m[2] + 0.5); }
    if ((m = /^corhc_([ha])1$/.exec(prop))) { const bc = base('corners'); const a = CT * rem * cShare, b = CT * rem * (1 - cShare); const P = (l) => { const o = [Math.exp(-l)]; for (let i = 1; i <= 30; i++) o.push(o[i - 1] * l / i); return o; }; const X = P(a), Y = P(b); let p = 0; X.forEach((x, i) => Y.forEach((y, j) => { if ((m[1] === 'h' ? (bc[0] + i) - (bc[1] + j) : (bc[1] + j) - (bc[0] + i)) >= 2) p += x * y; })); return p; }
    const kShare = clamp(0.5 - edge * 0.2, 0.35, 0.65), KT = 4.3;
    if ((m = /^crd_o(\d)5$/.exec(prop))) { const b = base('cards'); return overFrom(b[0] + b[1], KT * rem, +m[1] + 0.5); }
    if ((m = /^crd([ha])_o(\d)5$/.exec(prop))) { const b = base('cards'); return overFrom(m[1] === 'h' ? b[0] : b[1], KT * rem * (m[1] === 'h' ? kShare : 1 - kShare), +m[2] + 0.5); }
    return undefined;
  },
  odds(p, fmt) {
    if (!(p > 0 && p < 1)) return '—'; const d = 1 / p;
    if (fmt === 'american') return d >= 2 ? '+' + Math.round((d - 1) * 100) : '-' + Math.round(100 / (d - 1));
    if (fmt === 'fractional') { const x = d - 1; let best = [Math.round(x), 1], err = Math.abs(x - best[0]); for (let den = 2; den <= 20; den++) { const num = Math.round(x * den); const e = Math.abs(x - num / den); if (e < err - 1e-9) { best = [num, den]; err = e; } } const gcd = (a, b) => b ? gcd(b, a % b) : a; const k = gcd(best[0], best[1]) || 1; return `${best[0] / k}/${best[1] / k}`; }
    return d >= 100 ? d.toFixed(0) : d.toFixed(2);
  },
  shortId(g) { return String(g.id).replace(/\D/g, '').slice(-6) || g.id; },

  /* ---------- bet slip (singles; kept in this browser) ---------- */
  slip: [], stakes: {}, mode: 'single', accStake: '10',
  loadSlip() { try { const j = JSON.parse(localStorage.getItem('nexis-slip2') || '{}'); this.slip = Array.isArray(j.slip) ? j.slip.slice(0, 20) : []; this.stakes = j.stakes || {}; this.mode = j.mode === 'acc' ? 'acc' : 'single'; this.accStake = j.accStake || '10'; } catch (e) { /* storage unavailable */ } },
  saveSlip() { try { localStorage.setItem('nexis-slip2', JSON.stringify({ slip: this.slip, stakes: this.stakes, mode: this.mode, accStake: this.accStake })); } catch (e) { /* storage unavailable */ } },
  setMode(m) { this.mode = m === 'acc' ? 'acc' : 'single'; this.saveSlip(); Bus.emit('slip'); },
  inSlip(key) { return this.slip.some(s => s.key === key); },
  toggle(key, info) { const i = this.slip.findIndex(s => s.key === key); if (i >= 0) this.slip.splice(i, 1); else { this.slip.push({ key, ...info }); if (!this.stakes[key]) this.stakes[key] = '10'; } this.saveSlip(); Bus.emit('slip'); },
  remove(key) { this.slip = this.slip.filter(s => s.key !== key); delete this.stakes[key]; this.saveSlip(); Bus.emit('slip'); },
  clear() { this.slip = []; this.stakes = {}; this.saveSlip(); Bus.emit('slip'); },
  /** Slip entries with their game and current price. Key: <game>|<prop>|<YES|NO>. */
  resolved() { return this.slip.map(s => { const [gid, prop, side] = s.key.split('|'); const g = this.get(gid); const q = g ? this.quote(g, prop, side) : { p: null, open: false }; return { ...s, g, prop, side, q, stake: nz(String(this.stakes[s.key] || '').replace(/[^0-9.]/g, ''), 0) }; }); },
};
/* ---------- accumulators ----------
   Panta has no parlays, so an accumulator is its own Panta YES/NO market: YES only if every leg wins. Its question
   lists the legs, its rule points to each leg's own question, and trading ends at the earliest kick-off. */
Object.assign(Book, {
  ACC_MAX: 6,
  /** Problems that stop these legs forming an accumulator (empty when fine). */
  accProblems(legs) {
    const out = [];
    if (legs.length < 2) out.push('Add at least 2 selections for an accumulator.');
    if (legs.length > this.ACC_MAX) out.push(`An accumulator can have at most ${this.ACC_MAX} selections.`);
    const games = legs.map(l => l.g && l.g.id); if (new Set(games).size < games.length) out.push('Only one selection per game in an accumulator.');
    if (legs.some(l => !l.g || !l.q.open)) out.push('Remove selections whose betting has closed.');
    return out;
  },
  /** Combined decimal odds (product of the legs), or null if any leg has no price yet. */
  accOdds(legs) { let o = 1; for (const l of legs) { if (!(l.q.p > 0)) return null; o *= 1 / l.q.p; } return o; },
  accBody(legs) {
    const n = legs.length; const D = (g) => this.dateText(g);
    const desc = (l) => `${l.label} (${l.market}), ${l.g.home.pm} vs ${l.g.away.pm} on ${D(l.g)}`;
    const question = `Accumulator: will all ${n} of these bets win? ${legs.map((l, i) => `(${i + 1}) ${desc(l)}`).join('; ')}`;
    if (question.length > 512) return { error: 'These selections are too long to fit one Panta market question (512 characters). Remove a selection.' };
    const rule = (`This market resolves YES only if every one of the following ${n} bets wins, and NO if any of them loses. `
      + legs.map((l, i) => `Bet ${i + 1}: the question "${this.question(l.g, l.prop)}" must resolve ${l.side}.`).join(' ')
      + ' Each question is settled as it would be on its own: football results use the score after regular time (90 minutes plus stoppage time) unless the question is about half-time; corners and cards come from the official match statistics.'
      + ' If any of these matches is abandoned or not played within 48 hours of its scheduled start, this market is cancelled.');
    if (rule.length > 2048) return { error: 'These selections are too long to fit one Panta market rule (2048 characters). Remove a selection.' };
    // Trading closes when the first leg's game ends (legs can be in play); settles after the last one.
    const first = Math.min(...legs.map(l => l.g.start + (l.g.football ? 2 : 3.5) * 3600e3)), last = Math.max(...legs.map(l => l.g.start));
    const sources = [...new Set(legs.flatMap(l => this.sources(l.g)))].slice(0, 20);
    const image = legs.map(l => [l.g.image, l.g.home.logo, l.g.away.logo].find(u => /^https:\/\//.test(u || ''))).find(Boolean) || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png';
    return { question, title: `Accumulator (${n} selections)`, description: legs.map(desc).join(' · ').slice(0, 2000), resolutionRule: rule, sourcesOfTruth: sources, category: 'sports', marketType: 'breaking',
      startTime: Math.floor(Date.now() / 1000), endTime: Math.floor(first / 1000), resolutionTime: Math.floor(last / 1000) + (legs.every(l => l.g.football) ? 3 : 5) * 3600, imageUrl: image, region: 'Global' };
  },
});
Book.loadSlip();
