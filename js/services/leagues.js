/* =====================================================================
   SPORTS LEAGUES (ESPN) — shared by the browser and /api/sports.
   Entry: [sport path, league slug, display name, sport label, kind]
     kind: 'team'  home vs away (default)
           'match' player vs player (tennis, MMA)
           'field' leaderboard (golf, racing)
   Order = priority on the Sports page. /api/sports also discovers extra
   leagues from ESPN's catalogue for groups marked `discover`, so leagues
   ESPN adds later appear without code changes.
   ===================================================================== */
const SOC = (slug, name) => ['soccer', slug, name, 'Football', 'team'];
const SPORT_LEAGUES = [
  // ---- Football: Europe (top flights) ----
  SOC('eng.1', 'English Premier League'), SOC('uefa.champions', 'UEFA Champions League'), SOC('uefa.europa', 'Europa League'), SOC('uefa.europa.conf', 'Conference League'),
  SOC('esp.1', 'La Liga'), SOC('ita.1', 'Serie A'), SOC('ger.1', 'Bundesliga'), SOC('fra.1', 'Ligue 1'), SOC('por.1', 'Primeira Liga'),
  SOC('bel.1', 'Belgian Pro League'), SOC('tur.1', 'Süper Lig'), SOC('sco.1', 'Scottish Premiership'), SOC('gre.1', 'Greek Super League'), SOC('aut.1', 'Austrian Bundesliga'),
  SOC('sui.1', 'Swiss Super League'), SOC('den.1', 'Danish Superliga'), SOC('nor.1', 'Eliteserien'), SOC('swe.1', 'Allsvenskan'), SOC('rus.1', 'Russian Premier League'),
  SOC('pol.1', 'Ekstraklasa'), SOC('cro.1', 'Croatian HNL'),
  SOC('srb.1', 'Serbian SuperLiga'), SOC('hun.1', 'Hungarian NB I'), SOC('bul.1', 'Bulgarian First League'), SOC('isr.1', 'Israeli Premier League'), SOC('cyp.1', 'Cypriot First Division'),
  SOC('fin.1', 'Veikkausliiga'), SOC('irl.1', 'League of Ireland'), SOC('wal.1', 'Cymru Premier'), SOC('svk.1', 'Slovak Super Liga'),
  // ---- Football: Europe (lower divisions & cups) ----
  SOC('eng.2', 'Championship'), SOC('eng.3', 'League One'), SOC('eng.4', 'League Two'), SOC('eng.5', 'National League'), SOC('esp.2', 'La Liga 2'), SOC('ita.2', 'Serie B'),
  SOC('ger.2', '2. Bundesliga'), SOC('ger.3', '3. Liga'), SOC('fra.2', 'Ligue 2'), SOC('ned.2', 'Eerste Divisie'), SOC('por.2', 'Liga Portugal 2'), SOC('sco.2', 'Scottish Championship'),
  SOC('eng.fa', 'FA Cup'), SOC('eng.league_cup', 'EFL Cup'), SOC('eng.trophy', 'EFL Trophy'), SOC('esp.copa_del_rey', 'Copa del Rey'), SOC('ita.coppa_italia', 'Coppa Italia'),
  SOC('ger.dfb_pokal', 'DFB-Pokal'), SOC('fra.coupe_de_france', 'Coupe de France'), SOC('ned.cup', 'KNVB Cup'),   SOC('esp.super_cup', 'Supercopa de España'), SOC('ita.super_cup', 'Supercoppa Italiana'), SOC('ger.super_cup', 'DFL-Supercup'), SOC('eng.charity', 'Community Shield'), SOC('uefa.super_cup', 'UEFA Super Cup'),
  SOC('uefa.champions_qual', 'Champions League Qualifying'), SOC('uefa.europa_qual', 'Europa League Qualifying'), SOC('uefa.europa.conf_qual', 'Conference League Qualifying'),
  // ---- Football: women ----
  SOC('eng.w.1', 'Women’s Super League'), SOC('uefa.wchampions', 'Women’s Champions League'), SOC('esp.w.1', 'Liga F'), SOC('fra.w.1', 'Première Ligue'), SOC('ger.w.1', 'Frauen-Bundesliga'),
  SOC('fifa.wwc', 'FIFA Women’s World Cup'), SOC('uefa.weuro', 'Women’s Euro'),
  // ---- Football: international ----
  SOC('fifa.world', 'FIFA World Cup'), SOC('uefa.euro', 'UEFA Euro'), SOC('uefa.nations', 'UEFA Nations League'), SOC('fifa.worldq.uefa', 'World Cup Qualifying (UEFA)'),
  SOC('fifa.worldq.conmebol', 'World Cup Qualifying (CONMEBOL)'), SOC('fifa.worldq.concacaf', 'World Cup Qualifying (CONCACAF)'), SOC('fifa.worldq.caf', 'World Cup Qualifying (CAF)'),
  SOC('fifa.worldq.afc', 'World Cup Qualifying (AFC)'), SOC('fifa.worldq.ofc', 'World Cup Qualifying (OFC)'), SOC('uefa.euroq', 'Euro Qualifying'),   SOC('conmebol.america', 'Copa América'), SOC('caf.nations', 'Africa Cup of Nations'), SOC('caf.nations_qual', 'AFCON Qualifying'), SOC('afc.asian.cup', 'AFC Asian Cup'), SOC('concacaf.gold', 'Gold Cup'),
  SOC('concacaf.nations.league', 'CONCACAF Nations League'), SOC('fifa.cwc', 'FIFA Club World Cup'), SOC('fifa.olympics', 'Olympic Football'), SOC('fifa.world.u20', 'U-20 World Cup'),
  SOC('fifa.world.u17', 'U-17 World Cup'), SOC('uefa.euro.u21', 'U-21 Euro'),   // ---- Football: Americas ----
  SOC('usa.1', 'MLS'), SOC('usa.open', 'U.S. Open Cup'), SOC('usa.usl.l1', 'USL League One'),   SOC('mex.2', 'Liga de Expansión MX'), SOC('concacaf.champions', 'CONCACAF Champions Cup'), SOC('concacaf.leagues.cup', 'Leagues Cup'),
  SOC('bra.copa_do_brazil', 'Copa do Brasil'), SOC('arg.copa', 'Copa Argentina'),
  SOC('conmebol.libertadores', 'Copa Libertadores'), SOC('conmebol.sudamericana', 'Copa Sudamericana'), SOC('conmebol.recopa', 'Recopa Sudamericana'),
  SOC('chi.1', 'Chilean Primera'), SOC('uru.1', 'Uruguayan Primera'), SOC('per.1', 'Peruvian Liga 1'), SOC('ecu.1', 'Ecuadorian LigaPro'),
  SOC('par.1', 'Paraguayan Primera'), SOC('bol.1', 'Bolivian Primera'), SOC('ven.1', 'Venezuelan Primera'), SOC('crc.1', 'Costa Rican Primera'), SOC('hon.1', 'Honduran Liga Nacional'),
  SOC('slv.1', 'Salvadoran Primera'), SOC('jam.1', 'Jamaica Premier League'),
  // ---- Football: Asia, Middle East, Africa, Oceania ----
  SOC('ksa.1', 'Saudi Pro League'), SOC('uae.1', 'UAE Pro League'), SOC('qat.1', 'Qatar Stars League'), SOC('jpn.1', 'J1 League'),   SOC('ind.1', 'Indian Super League'), SOC('tha.1', 'Thai League 1'), SOC('mys.1', 'Malaysia Super League'),
  SOC('vie.1', 'V.League 1'), SOC('aus.1', 'A-League Men'), SOC('aus.w.1', 'A-League Women'), SOC('afc.champions', 'AFC Champions League Elite'), SOC('afc.cup', 'AFC Champions League Two'),
  SOC('rsa.1', 'South African Premiership'), SOC('egy.1', 'Egyptian Premier League'), SOC('tun.1', 'Tunisian Ligue 1'), SOC('alg.1', 'Algerian Ligue 1'),
  SOC('nga.1', 'Nigeria Premier League'), SOC('gha.1', 'Ghana Premier League'), SOC('ken.1', 'Kenyan Premier League'), SOC('caf.champions', 'CAF Champions League'), SOC('caf.confed', 'CAF Confederation Cup'),
  // ---- Basketball ----
  ['basketball', 'nba', 'NBA', 'Basketball', 'team'], ['basketball', 'wnba', 'WNBA', 'Basketball', 'team'], ['basketball', 'mens-college-basketball', 'NCAA Men’s Basketball', 'Basketball', 'team'],
  ['basketball', 'womens-college-basketball', 'NCAA Women’s Basketball', 'Basketball', 'team'], ['basketball', 'nba-development', 'NBA G League', 'Basketball', 'team'], ['basketball', 'nbl', 'NBL (Australia)', 'Basketball', 'team'],
  ['basketball', 'fiba', 'FIBA', 'Basketball', 'team'], ['basketball', 'nba-summer-league', 'NBA Summer League', 'Basketball', 'team'],
  // ---- Tennis (player vs player) ----
  ['tennis', 'atp', 'ATP', 'Tennis', 'match'], ['tennis', 'wta', 'WTA', 'Tennis', 'match'],
  // ---- Baseball ----
  ['baseball', 'mlb', 'MLB', 'Baseball', 'team'], ['baseball', 'college-baseball', 'College Baseball', 'Baseball', 'team'], ['baseball', 'world-baseball-classic', 'World Baseball Classic', 'Baseball', 'team'],
  // ---- Ice hockey ----
  ['hockey', 'nhl', 'NHL', 'Hockey', 'team'], ['hockey', 'mens-college-hockey', 'NCAA Men’s Hockey', 'Hockey', 'team'], ['hockey', 'womens-college-hockey', 'NCAA Women’s Hockey', 'Hockey', 'team'],
  // ---- MMA (fighter vs fighter) ----
  ['mma', 'ufc', 'UFC', 'MMA', 'match'], ['mma', 'pfl', 'PFL', 'MMA', 'match'], ['mma', 'bellator', 'Bellator', 'MMA', 'match'],
  // ---- Golf (leaderboards) ----
  ['golf', 'pga', 'PGA Tour', 'Golf', 'field'], ['golf', 'lpga', 'LPGA Tour', 'Golf', 'field'], ['golf', 'eur', 'DP World Tour', 'Golf', 'field'], ['golf', 'liv', 'LIV Golf', 'Golf', 'field'], ['golf', 'champions-tour', 'PGA Tour Champions', 'Golf', 'field'],
  // ---- Motorsport (leaderboards) ----
  ['racing', 'f1', 'Formula 1', 'Motorsport', 'field'], ['racing', 'irl', 'IndyCar', 'Motorsport', 'field'], ['racing', 'nascar-premier', 'NASCAR Cup Series', 'Motorsport', 'field'],
  // ---- Rugby union ----
  ['rugby', '180659', 'Six Nations', 'Rugby', 'team'], ['rugby', '164205', 'Rugby World Cup', 'Rugby', 'team'], ['rugby', '244293', 'The Rugby Championship', 'Rugby', 'team'],
  ['rugby', '267979', 'Premiership Rugby', 'Rugby', 'team'], ['rugby', '270557', 'United Rugby Championship', 'Rugby', 'team'], ['rugby', '270559', 'Top 14', 'Rugby', 'team'],
  ['rugby', '242041', 'Super Rugby Pacific', 'Rugby', 'team'], ['rugby', '271937', 'European Champions Cup', 'Rugby', 'team'],
  // ---- Other team sports ----
  ['lacrosse', 'pll', 'Premier Lacrosse League', 'Lacrosse', 'team'], ['lacrosse', 'nll', 'National Lacrosse League', 'Lacrosse', 'team'],
  ['lacrosse', 'mens-college-lacrosse', 'NCAA Men’s Lacrosse', 'Lacrosse', 'team'], ['volleyball', 'mens-college-volleyball', 'NCAA Men’s Volleyball', 'Volleyball', 'team'], ['volleyball', 'womens-college-volleyball', 'NCAA Women’s Volleyball', 'Volleyball', 'team'],
  ['field-hockey', 'womens-college-field-hockey', 'NCAA Field Hockey', 'Field Hockey', 'team'], ['water-polo', 'mens-college-water-polo', 'NCAA Water Polo', 'Water Polo', 'team'],
];
/* How /api/sports splits work: one request per group, each within the time budget. */
const SPORT_GROUPS = [
  { id: 'soccer', label: 'Football', sports: ['soccer'], discover: true },
  { id: 'basketball', label: 'Basketball', sports: ['basketball'], discover: true },
  { id: 'tennis', label: 'Tennis', sports: ['tennis'] },
  { id: 'us', label: 'US sports', sports: ['baseball', 'hockey'] },
  { id: 'fight', label: 'MMA', sports: ['mma'] },
  { id: 'golf', label: 'Golf & motorsport', sports: ['golf', 'racing'] },
  { id: 'rugby', label: 'Rugby & more', sports: ['rugby', 'lacrosse', 'volleyball', 'field-hockey', 'water-polo'], discover: true },
];
const SPORT_LABEL_OF_PATH = { soccer: 'Football', basketball: 'Basketball', tennis: 'Tennis', football: 'American Football', baseball: 'Baseball', hockey: 'Hockey', mma: 'MMA', golf: 'Golf', racing: 'Motorsport', rugby: 'Rugby', 'australian-football': 'Australian Football', lacrosse: 'Lacrosse', volleyball: 'Volleyball', 'field-hockey': 'Field Hockey', 'water-polo': 'Water Polo' };
const SPORT_KIND_OF_PATH = { tennis: 'match', mma: 'match', golf: 'field', racing: 'field' };
/* The leagues the browser fetches directly if /api/sports is unavailable. */
const SPORT_LEAGUES_CORE = SPORT_LEAGUES.filter(L => ['eng.1', 'uefa.champions', 'uefa.europa', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'nba', 'wnba', 'nfl', 'college-football', 'mlb', 'nhl', 'atp', 'wta', 'ufc'].includes(L[1]));
/* Sports and leagues that are not offered on Nexis anywhere (scores, sportsbook, pickers, filters, markets).
   Matched by sport, by ESPN key, by Polymarket league code, or by league name (for leagues found by discovery). */
/* The main football leagues: always listed first under Football (even on days without games), under these names,
   whatever Polymarket or ESPN call them. They are never excluded. */
const FOOTBALL_PINNED = [
  { key: 'soccer/eng.1', name: 'English Premier League', region: 'England', codes: ['epl'], names: /^(english |england )?premier league$|^epl$/i },
  { key: 'soccer/esp.1', name: 'La Liga', region: 'Spain', codes: ['lal', 'laliga'], names: /^la ?liga( ea sports)?$|^spanish (la liga|primera divisi[oó]n)$/i },
  { key: 'soccer/ita.1', name: 'Serie A', region: 'Italy', codes: ['sea', 'seriea'], names: /^(italian )?serie a( tim| enilive)?$/i },
  { key: 'soccer/ger.1', name: 'Bundesliga', region: 'Germany', codes: ['bun', 'bundesliga'], names: /^(german )?bundesliga$/i },
  { key: 'soccer/fra.1', name: 'Ligue 1', region: 'France', codes: ['fl1', 'ligue1'], names: /^(french )?ligue 1( mcdonald'?s| uber eats)?$/i },
  { key: 'soccer/uefa.champions', name: 'UEFA Champions League', region: 'Europe', codes: ['ucl'], names: /^(uefa )?champions league$/i },
];
function footballPinned({ key, code, name } = {}) {
  const n = String(name || '').replace(/\b(19|20)\d\d(\s*[-/]\s*(19|20)?\d\d)?\b/g, '').replace(/\s+/g, ' ').trim();
  return FOOTBALL_PINNED.find(p => (key && p.key === key) || (code && p.codes.includes(String(code).toLowerCase())) || (n && p.names.test(n))) || null;
}
const SPORT_EXCLUDED = {
  sports: ['American Football', 'Australian Football'],
  paths: ['football', 'australian-football'],
  keys: ['soccer/fifa.friendly', 'soccer/club.friendly', 'soccer/col.1', 'soccer/jpn.2', 'soccer/mar.1', 'soccer/mex.1', 'soccer/gua.1', 'soccer/usa.nwsl', 'soccer/arg.1', 'soccer/usa.usl.1', 'soccer/bra.2',
    'soccer/arg.2', 'soccer/nir.1', 'soccer/ukr.1', 'soccer/ned.1', 'soccer/rou.1', 'soccer/kor.1', 'soccer/bra.1', 'soccer/bra.3', 'soccer/cze.1', 'soccer/por.taca.portugal', 'soccer/chi.2', 'soccer/col.2', 'soccer/can.1', 'soccer/sco.tennents', 'soccer/idn.1', 'soccer/chn.1', 'soccer/chn.2'],
  codes: ['nfl', 'cfb', 'ufl', 'cfl', 'afl', 'lmx', 'arg', 'nwsl', 'ere', 'bra', 'bra2', 'bra3', 'kor', 'kl1', 'chn', 'csl', 'idn', 'rou', 'cze', 'ukr', 'upl', 'nir', 'can', 'cpl'],
  names: /\bfriendl(y|ies)\b|\bprimera a\b|\bj2\b|j\.?\s?league 2|\bmorocc|botola|\bliga (bbva )?mx\b|guatemal|\bcfl\b|canadian football|\bnwsl\b|liga profesional|argentine primera|usl championship|brasileir[aã]o s[ée]rie b|brazil\w* s[ée]rie b|\bnfl\b|american football|college football|australian football|\bafl\b|primera nacional|\bnifl\b|ukrain|premier liha|eredivisie|romani|\bk[- ]?league|brasileir|primera divisi[oó]n|\bczech|ta[çc]a de portugal|\bprimera b\b|canadian premier league|women'?s? u-?20|u-?20 (women|premier league)|scottish cup|indonesi|\bchin(a|ese)\b/i,
};
/** True if a sport/league should not appear on Nexis. Pass whatever is known: { sport, path, key, code, name, tags }. */
function sportExcluded({ sport, path, key, code, name, tags } = {}) {
  if (footballPinned({ key, code, name })) return false; // the six main leagues are always offered
  if (sport && SPORT_EXCLUDED.sports.includes(sport)) return true;
  const p = path || (key ? String(key).split('/')[0] : '');
  if (p && SPORT_EXCLUDED.paths.includes(p)) return true;
  if (key && SPORT_EXCLUDED.keys.includes(key)) return true;
  if (code && SPORT_EXCLUDED.codes.includes(String(code).toLowerCase())) return true;
  if (name && SPORT_EXCLUDED.names.test(String(name))) return true;
  if (tags && tags.some(t => /^(nfl|cfl|afl|ncaaf|college football|american football|australian football)$/i.test(String(t)))) return true;
  return false;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { SPORT_LEAGUES, SPORT_GROUPS, SPORT_LEAGUES_CORE, SPORT_LABEL_OF_PATH, SPORT_KIND_OF_PATH, SPORT_EXCLUDED, sportExcluded, FOOTBALL_PINNED, footballPinned };
