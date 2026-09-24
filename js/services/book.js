/* =====================================================================
   SPORTSBOOK MODEL
   Every game Polymarket has markets for, laid out like a sportsbook:
   sport → league → game → markets (match result, handicap, totals, both
   teams to score, props). Games without markets aren't listed.
   - Games come from /api/pmgames (Poly.games); ESPN supplies scores,
     clocks and crests when the same game is on ESPN (Sports.pmGame).
   - Odds are the price to buy an outcome: decimal odds = 1 / price, so a
     $10 stake at 2.50 returns $25 if it wins (before slippage).
   ===================================================================== */
/* Polymarket's sport codes → [league, sport, region]. Unknown codes fall back to the matched ESPN league or the series title. */
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

const Book = {
  _v: '', _list: [],
  /** All sportsbook games (recomputed when Polymarket or ESPN data changes). */
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
    const out = [];
    Poly.games.forEach(p => {
      const markets = p.mids.map(id => Poly.markets.get(id)).filter(m => m && !(m.end && m.end < now() - 6 * HOUR)); if (!markets.length) return;
      const e = espn.get(p.id) || null; const L = leagueOf(p, e);
      // Sides: ESPN's home/away when matched (which Polymarket name is home?), else Polymarket's order.
      const trim = (n) => n.replace(/\s+(FC|CF|AFC|SC)$/i, '').replace(/^(FC|AFC|CF|SC)\s+/i, '');
      let home = { name: p.a, short: trim(p.a), logo: null, score: null }, away = { name: p.b, short: trim(p.b), logo: null, score: null };
      if (e) { const flip = teamMatch(e.home, p.b, p.abbrs) && !teamMatch(e.home, p.a, p.abbrs); const H = e.home, A = e.away; home = { name: H.name, short: H.short, logo: H.logo, score: H.score, pm: flip ? p.b : p.a }; away = { name: A.name, short: A.short, logo: A.logo, score: A.score, pm: flip ? p.a : p.b }; }
      else { home.pm = p.a; away.pm = p.b; const sc = /^(\d+)\s*-\s*(\d+)$/.exec(p.score || ''); if (sc) { home.score = +sc[1]; away.score = +sc[2]; } }
      const state = e ? e.state : p.live ? 'in' : p.start < now() - 4 * HOUR ? 'post' : 'pre';
      if (state === 'post') return; // finished games aren't bettable
      const g = { id: String(p.id), pm: p, espn: e, start: e ? e.start : p.start, state, clock: e ? (e.detail || e.clock) : [p.period, p.elapsed].filter(Boolean).join(' '), home, away, league: L.name, leagueKey: L.key, sport: L.sport || 'Other', region: L.region, markets, vol: p.volume };
      g.groups = this.group(g); g.main = this.main(g); g.nMarkets = g.groups.reduce((n, x) => n + x.items.length, 0);
      out.push(g);
    });
    return out.sort((a, b) => a.start - b.start);
  },
  sportFromTags(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    return /soccer|football(?!.*american)/.test(t) ? 'Football' : /basketball|nba/.test(t) ? 'Basketball' : /tennis/.test(t) ? 'Tennis' : /nfl|american football/.test(t) ? 'American Football' : /baseball|mlb/.test(t) ? 'Baseball' : /hockey|nhl/.test(t) ? 'Hockey' : /ufc|mma/.test(t) ? 'MMA' : /boxing/.test(t) ? 'Boxing' : /cricket/.test(t) ? 'Cricket' : /esport|counter|league of legends|dota|valorant/.test(t) ? 'Esports' : /rugby/.test(t) ? 'Rugby' : 'Other';
  },
  /** Which betting category a market belongs to. */
  cat(m) {
    const q = String(m.q || '') + ' ' + (m.group || '');
    if (/both teams to score|btts/i.test(q) || /btts|both_teams/i.test(m.smt)) return 'Both teams to score';
    if (/spread|handicap/i.test(m.smt) || /spread|handicap|\(\s*[+-]\d/i.test(q)) return 'Handicap';
    if (/total/i.test(m.smt) || /\bo\/u\b|over\/under|\btotal\b|over \d|under \d/i.test(q)) return 'Totals';
    if (/moneyline/i.test(m.smt) || /\bwin\b|\bdraw\b|moneyline|to advance|winner/i.test(q)) return 'Match result';
    return 'Other';
  },
  side(g, name) { const n = String(name || '').replace(/^will\s+/i, '').replace(/\s+(win|beat)\b.*$/i, '').replace(/\?$/, ''); return teamMatch({ name: g.home.pm || g.home.name, short: g.home.short, abbr: '' }, n, null) || teamMatch(g.home, n, null) ? 'home' : teamMatch({ name: g.away.pm || g.away.name, short: g.away.short, abbr: '' }, n, null) || teamMatch(g.away, n, null) ? 'away' : null; },
  /** A selection: buy outcome `idx` of market `m`. */
  sel(m, idx, label) { return { key: m.id + ':' + idx, m, idx, label }; },
  sels(m) { const yn = /^yes$/i.test(m.yesLabel) && /^no$/i.test(m.noLabel); return [this.sel(m, 0, yn ? 'Yes' : m.yesLabel), this.sel(m, 1, yn ? 'No' : m.noLabel)]; },
  /** The headline market: 1 X 2 for three-way sports, otherwise the two-way moneyline. */
  main(g) {
    const res = g.markets.filter(m => this.cat(m) === 'Match result');
    const yes = res.filter(m => /^yes$/i.test(m.yesLabel));
    const h = yes.find(m => !/draw/i.test(m.q) && this.side(g, m.q) === 'home'), a = yes.find(m => !/draw/i.test(m.q) && this.side(g, m.q) === 'away'), d = yes.find(m => /draw/i.test(m.q));
    if (h && a) return { three: !!d, name: d ? '1X2' : 'Winner', sels: [this.sel(h, 0, '1'), ...(d ? [this.sel(d, 0, 'X')] : []), this.sel(a, 0, '2')] };
    const two = res.find(m => !/^yes$/i.test(m.yesLabel)) || g.markets.find(m => !/^yes$/i.test(m.yesLabel));
    if (two) { const s = this.sels(two); if (this.side(g, two.yesLabel) === 'away') s.reverse(); return { three: false, name: 'Winner', sels: s.map((x, i) => ({ ...x, label: String(i + 1) })) }; }
    const m = g.markets[0]; return { three: false, name: m.group || m.q, sels: this.sels(m) };
  },
  /** Markets grouped by category, as cards of selections (the 1X2 card first). */
  group(g) {
    const used = new Set(); const groups = BOOK_CATS.map(c => ({ cat: c, items: [] }));
    const res = g.markets.filter(m => this.cat(m) === 'Match result' && /^yes$/i.test(m.yesLabel));
    const h = res.find(m => !/draw/i.test(m.q) && this.side(g, m.q) === 'home'), a = res.find(m => !/draw/i.test(m.q) && this.side(g, m.q) === 'away'), d = res.find(m => /draw/i.test(m.q));
    if (h && a) { groups[0].items.push({ title: d ? 'Match result (1X2)' : 'Winner', sels: [this.sel(h, 0, g.home.short), ...(d ? [this.sel(d, 0, 'Draw')] : []), this.sel(a, 0, g.away.short)] }); [h, a, d].forEach(m => m && used.add(m.id)); }
    const short = (label) => { const s = this.side(g, label); return s ? label.replace(/^(.*?)(\s*\([+-]?[\d.]+\))?$/, (_, n, line) => g[s].short + (line || '')) : label; };
    g.markets.forEach(m => {
      if (used.has(m.id)) return;
      const raw = m.group && !/^(yes|no)$/i.test(m.group) ? m.group : m.q;
      const title = String(raw).replace(/^.*?\s(?:vs\.?|v\.?|@)\s.*?:\s*/i, '').replace(/^O\/U\s*/i, 'Total · Over/Under ').replace(/^Spread:\s*/i, 'Handicap: ') || raw;
      groups[BOOK_CATS.indexOf(this.cat(m))].items.push({ title, q: m.q, sels: this.sels(m).map(x => ({ ...x, label: short(x.label) })) });
    });
    return groups.filter(x => x.items.length);
  },
  /** What one unit costs for this selection right now (best ask when streaming, else the last price). */
  price(m, idx) { const p = idx === 0 ? (m.ask != null ? m.ask : m.yes) : (m.bid != null ? 1 - m.bid : 1 - m.yes); return clamp(nz(p, 0), 0, 1); },
  open(m, idx) { const p = this.price(m, idx); return p > 0.005 && p < 0.995 && !(m.end && m.end < now()); },
  odds(p, fmt) {
    if (!(p > 0 && p < 1)) return '—'; const d = 1 / p;
    if (fmt === 'american') return d >= 2 ? '+' + Math.round((d - 1) * 100) : '-' + Math.round(100 / (d - 1));
    if (fmt === 'fractional') { const x = d - 1; let best = [Math.round(x), 1], err = Math.abs(x - best[0]); for (let den = 2; den <= 20; den++) { const num = Math.round(x * den); const e = Math.abs(x - num / den); if (e < err - 1e-9) { best = [num, den]; err = e; } } const gcd = (a, b) => b ? gcd(b, a % b) : a; const k = gcd(best[0], best[1]) || 1; return `${best[0] / k}/${best[1] / k}`; }
    return d >= 100 ? d.toFixed(0) : d.toFixed(2);
  },
  /* ---------- bet slip (singles; kept in this browser) ---------- */
  slip: [], stakes: {},
  loadSlip() { try { const j = JSON.parse(localStorage.getItem('nexis-slip') || '{}'); this.slip = Array.isArray(j.slip) ? j.slip.slice(0, 20) : []; this.stakes = j.stakes || {}; } catch (e) { /* storage unavailable */ } },
  saveSlip() { try { localStorage.setItem('nexis-slip', JSON.stringify({ slip: this.slip, stakes: this.stakes })); } catch (e) { /* storage unavailable */ } },
  inSlip(key) { return this.slip.some(s => s.key === key); },
  toggle(key, info) { const i = this.slip.findIndex(s => s.key === key); if (i >= 0) this.slip.splice(i, 1); else { this.slip.push({ key, ...info }); if (!this.stakes[key]) this.stakes[key] = '10'; } this.saveSlip(); Bus.emit('slip'); },
  remove(key) { this.slip = this.slip.filter(s => s.key !== key); delete this.stakes[key]; this.saveSlip(); Bus.emit('slip'); },
  clear() { this.slip = []; this.stakes = {}; this.saveSlip(); Bus.emit('slip'); },
  /** Slip entries resolved to their live market (entries whose market is gone are marked). */
  resolved() { return this.slip.map(s => { const [mid, idx] = s.key.split(':'); const m = Poly.markets.get(mid); return { ...s, m, idx: +idx, stake: nz(String(this.stakes[s.key] || '').replace(/[^0-9.]/g, ''), 0) }; }); },
};
Book.loadSlip();
