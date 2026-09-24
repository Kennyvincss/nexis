/* =====================================================================
   SPORTS LEAGUES (ESPN site API) — shared by the browser and /api/sports.
   [sport path, league slug, display name, sport label]. Order = priority on
   the Sports page. Team sports only: ESPN's tennis, golf, racing and MMA
   feeds use a different (non home/away) format.
   ===================================================================== */
const SPORT_LEAGUES = [
  // Football (soccer) — Europe, top flights and cups
  ['soccer', 'eng.1', 'Premier League', 'Football'], ['soccer', 'uefa.champions', 'Champions League', 'Football'], ['soccer', 'uefa.europa', 'Europa League', 'Football'], ['soccer', 'uefa.europa.conf', 'Conference League', 'Football'],
  ['soccer', 'esp.1', 'La Liga', 'Football'], ['soccer', 'ita.1', 'Serie A', 'Football'], ['soccer', 'ger.1', 'Bundesliga', 'Football'], ['soccer', 'fra.1', 'Ligue 1', 'Football'],
  ['soccer', 'ned.1', 'Eredivisie', 'Football'], ['soccer', 'por.1', 'Primeira Liga', 'Football'], ['soccer', 'bel.1', 'Belgian Pro League', 'Football'], ['soccer', 'tur.1', 'Süper Lig', 'Football'],
  ['soccer', 'sco.1', 'Scottish Premiership', 'Football'], ['soccer', 'gre.1', 'Greek Super League', 'Football'], ['soccer', 'aut.1', 'Austrian Bundesliga', 'Football'], ['soccer', 'sui.1', 'Swiss Super League', 'Football'],
  ['soccer', 'den.1', 'Danish Superliga', 'Football'], ['soccer', 'nor.1', 'Eliteserien', 'Football'], ['soccer', 'swe.1', 'Allsvenskan', 'Football'], ['soccer', 'rus.1', 'Russian Premier League', 'Football'],
  ['soccer', 'eng.2', 'Championship', 'Football'], ['soccer', 'eng.3', 'League One', 'Football'], ['soccer', 'eng.4', 'League Two', 'Football'], ['soccer', 'esp.2', 'La Liga 2', 'Football'],
  ['soccer', 'ita.2', 'Serie B', 'Football'], ['soccer', 'ger.2', '2. Bundesliga', 'Football'], ['soccer', 'fra.2', 'Ligue 2', 'Football'],
  ['soccer', 'eng.fa', 'FA Cup', 'Football'], ['soccer', 'eng.league_cup', 'EFL Cup', 'Football'], ['soccer', 'esp.copa_del_rey', 'Copa del Rey', 'Football'], ['soccer', 'ita.coppa_italia', 'Coppa Italia', 'Football'],
  ['soccer', 'ger.dfb_pokal', 'DFB-Pokal', 'Football'], ['soccer', 'fra.coupe_de_france', 'Coupe de France', 'Football'], ['soccer', 'uefa.super_cup', 'UEFA Super Cup', 'Football'], ['soccer', 'eng.w.1', 'Women’s Super League', 'Football'],
  // International
  ['soccer', 'fifa.world', 'FIFA World Cup', 'Football'], ['soccer', 'uefa.euro', 'UEFA Euro', 'Football'], ['soccer', 'uefa.nations', 'UEFA Nations League', 'Football'], ['soccer', 'fifa.worldq.uefa', 'World Cup Qualifying (UEFA)', 'Football'],
  ['soccer', 'fifa.worldq.conmebol', 'World Cup Qualifying (CONMEBOL)', 'Football'], ['soccer', 'fifa.worldq.concacaf', 'World Cup Qualifying (CONCACAF)', 'Football'], ['soccer', 'fifa.worldq.caf', 'World Cup Qualifying (CAF)', 'Football'], ['soccer', 'fifa.worldq.afc', 'World Cup Qualifying (AFC)', 'Football'],
  ['soccer', 'fifa.friendly', 'International Friendlies', 'Football'], ['soccer', 'conmebol.america', 'Copa América', 'Football'], ['soccer', 'caf.nations', 'Africa Cup of Nations', 'Football'], ['soccer', 'afc.asian.cup', 'AFC Asian Cup', 'Football'],
  ['soccer', 'concacaf.gold', 'Gold Cup', 'Football'], ['soccer', 'fifa.cwc', 'FIFA Club World Cup', 'Football'], ['soccer', 'fifa.wwc', 'FIFA Women’s World Cup', 'Football'],
  // Americas, Asia, Africa, Oceania
  ['soccer', 'usa.1', 'MLS', 'Football'], ['soccer', 'usa.nwsl', 'NWSL', 'Football'], ['soccer', 'usa.open', 'U.S. Open Cup', 'Football'], ['soccer', 'mex.1', 'Liga MX', 'Football'],
  ['soccer', 'concacaf.champions', 'CONCACAF Champions Cup', 'Football'], ['soccer', 'concacaf.leagues.cup', 'Leagues Cup', 'Football'], ['soccer', 'bra.1', 'Brasileirão', 'Football'], ['soccer', 'arg.1', 'Argentine Primera', 'Football'],
  ['soccer', 'conmebol.libertadores', 'Copa Libertadores', 'Football'], ['soccer', 'conmebol.sudamericana', 'Copa Sudamericana', 'Football'], ['soccer', 'col.1', 'Colombian Primera A', 'Football'], ['soccer', 'chi.1', 'Chilean Primera', 'Football'],
  ['soccer', 'uru.1', 'Uruguayan Primera', 'Football'], ['soccer', 'per.1', 'Peruvian Liga 1', 'Football'], ['soccer', 'ecu.1', 'Ecuadorian LigaPro', 'Football'],
  ['soccer', 'ksa.1', 'Saudi Pro League', 'Football'], ['soccer', 'jpn.1', 'J1 League', 'Football'], ['soccer', 'chn.1', 'Chinese Super League', 'Football'], ['soccer', 'kor.1', 'K League 1', 'Football'],
  ['soccer', 'ind.1', 'Indian Super League', 'Football'], ['soccer', 'aus.1', 'A-League Men', 'Football'], ['soccer', 'afc.champions', 'AFC Champions League', 'Football'], ['soccer', 'rsa.1', 'South African Premiership', 'Football'],
  ['soccer', 'caf.champions', 'CAF Champions League', 'Football'],
  // Basketball
  ['basketball', 'nba', 'NBA', 'Basketball'], ['basketball', 'wnba', 'WNBA', 'Basketball'], ['basketball', 'mens-college-basketball', 'NCAA Men’s Basketball', 'Basketball'], ['basketball', 'womens-college-basketball', 'NCAA Women’s Basketball', 'Basketball'],
  ['basketball', 'nba-development', 'NBA G League', 'Basketball'],
  // American football
  ['football', 'nfl', 'NFL', 'American Football'], ['football', 'college-football', 'College Football', 'American Football'], ['football', 'ufl', 'UFL', 'American Football'],
  // Baseball
  ['baseball', 'mlb', 'MLB', 'Baseball'], ['baseball', 'college-baseball', 'College Baseball', 'Baseball'],
  // Ice hockey
  ['hockey', 'nhl', 'NHL', 'Hockey'], ['hockey', 'mens-college-hockey', 'NCAA Men’s Hockey', 'Hockey'],
  // Australian rules
  ['australian-football', 'afl', 'AFL', 'Australian Football'],
];
/* The leagues the browser fetches directly if /api/sports is unavailable. */
const SPORT_LEAGUES_CORE = SPORT_LEAGUES.filter(L => ['eng.1', 'uefa.champions', 'uefa.europa', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'nba', 'wnba', 'nfl', 'college-football', 'mlb', 'nhl'].includes(L[1]));
if (typeof module !== 'undefined' && module.exports) module.exports = { SPORT_LEAGUES, SPORT_LEAGUES_CORE };
