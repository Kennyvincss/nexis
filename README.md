# nexis

Nexis lets you trade Panta prediction markets with your own Solana wallet, follow live sports and crypto prices, and track real traders. Everything updates in real time.

**Nexis has no mock, demo or simulated data.** If an integration isn't configured or can't be reached, the page shows a **Connect API** or **Data unavailable** state instead of inventing numbers.

## Hosting

Nexis runs on **Netlify** or **Vercel** with no build step.

- **Netlify:** `netlify.toml` publishes the repo root and rewrites `/api/*` to `netlify/functions/api.js`, which runs the same handlers as Vercel.
- **Vercel:** files in `/api` are deployed as functions automatically.

## Where to add credentials

All secrets live in the server functions (`/api`), never in the browser.

To add them:

1. Open your host's environment variables:
   - **Netlify:** Site configuration → Environment variables
   - **Vercel:** Project → Settings → Environment Variables
2. Add the variables below.
3. **Redeploy.** Environment variables only apply to new deploys. On Netlify: Deploys → Trigger deploy → Deploy site.

**Settings → Integrations** in the app, and the **Data sources** pill in the top bar, show which integrations are live.

| Variable | Required | What it enables |
| --- | --- | --- |
| `PANTA_API_KEY` | **Yes, for markets** | Everything Panta: markets, YES/NO prices, volume, trades, positions, quotes, trading, market creation, claims. Use a `pk_live_…` key from [docs.panta.market](https://docs.panta.market). A `pk_test_…` key returns Panta's sandbox fixtures; Nexis labels them and blocks signing. |
| `PANTA_API_BASE_URL` | No | Defaults to `https://live-api.panta.market/api/v1`. |
| `PANTA_USER_ID` | No | Sent as `X-User-Id` if Panta issued you one. |
| `SOLANA_RPC_URL` | Recommended | Your Solana mainnet RPC (Helius, Triton, QuickNode…). Used for wallet balances, on-chain history and transaction confirmation. The public endpoint used by default is heavily rate-limited. |
| `COINGECKO_API_KEY` | Recommended | Raises CoinGecko rate limits for crypto prices and charts. Set `COINGECKO_PRO=1` if it's a Pro key. |
| `ANTHROPIC_API_KEY` | Optional | Nexis AI: drafts markets from a post and lists factors for each side. Without it, drafting uses an on-device parser and analysis is hidden. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Recommended | Email sign-in codes and password-reset codes, sent and checked by [Privy](https://dashboard.privy.io). No email domain needed. In the Privy dashboard enable **Email** as a login method and add your site under **Allowed domains**. The app ID is public; keep the secret only in environment variables. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET` | Optional | Alternative to Privy: Nexis sends its own codes through Resend (needs a verified domain). `AUTH_SECRET` is any long random string. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **Yes on Vercel, for accounts** | Stores accounts on the server so they work on every device. In Vercel open **Storage → Create Database → Upstash for Redis** (free), connect it to the project and the variables are added automatically; `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work. Not needed on Netlify, which uses Netlify Blobs. |
| `GOOGLE_CLIENT_ID` | Optional | "Continue with Google". Create an OAuth Web client in Google Cloud and add your domain as an authorized JavaScript origin. |

## Architecture

```
index.html            shell: loads css/nexis.css and the scripts below, in order
css/nexis.css
js/core.js            utilities, icons, charts, toasts/modals, event bus, per-user preferences store
js/services/          one module per external integration
  net.js              /api client, Config, feed status, reconnecting WebSocket, visibility-aware poller
  panta.js            Panta service (markets, prices, trades, positions, quote/build/submit, create, claim)
  wallet.js           blockchain/wallet service (Phantom/Backpack/Solflare, balances, sign + send, confirmation)
  crypto.js           crypto price service (CoinGecko + Coinbase WebSocket)
  sports.js           sports data service (ESPN scoreboard + match summary)
  polymarket.js       Polymarket markets (top events + per-game sports markets) and the global trades tape
  traders.js          trader activity service (Trader Tracker, Panta trades tape)
  pmtrade.js          Polymarket trading (EVM wallet, Polygon approvals, CLOB orders)
  notifications.js    notifications service (in-app + optional desktop)
  ai.js               Nexis AI
js/auth.js            accounts, sign-in methods, settings
js/views/*.js         pages (markets, crypto, sports, tracker, home, activity, landing)
js/app.js             router, actions, live DOM updates, boot
js/vendor/polymarket-trade.js  Polymarket CLOB client + viem bundle (MIT), loaded only in the Polymarket section; rebuild with `npm run vendor:polymarket`
js/vendor/privy-core.js  Privy browser SDK bundle (Apache-2.0), loaded only for email codes; rebuild with `npm run vendor:privy`
api/panta.js          Panta proxy: adds X-Api-Key server-side; allowlisted paths only
api/sports.js         every league's ESPN scoreboard in one trimmed, edge-cached response (or one league's schedule with ?league=)
api/pmgames.js        the sportsbook's game list from Polymarket (upcoming, live, results from the last 3 days), trimmed and edge-cached (60s)
api/book.js           sportsbook registry: which Panta market holds each bet on each game (verified on Solana before it's recorded)
api/data.js           public-feed proxy (Polymarket, ESPN, CoinGecko, Coinbase); allowlisted hosts, short cache
api/rpc.js            Solana JSON-RPC proxy; allowlisted methods
api/config.js         reports which integrations are configured (never the secrets)
api/email.js          verification codes via Resend
api/ai.js             Claude via the Anthropic SDK
netlify/functions/api.js  Netlify adapter that runs the /api handlers
netlify.toml          Netlify publish dir, functions dir and /api rewrite
```

The services emit events on a small bus. `app.js` patches the visible page in place, so nothing needs a manual refresh: prices, scores, balances, transaction status, notifications and tapes all update live.

## Data sources and update rates

| Area | Source | Updates |
| --- | --- | --- |
| Panta markets | Panta API | Catalog every 45s. Prices of visible markets every 10s. Trades on an open market every 15s. Trades from the top markets every 30s. |
| Price charts (Panta) | Recorded by Nexis | Panta has no price-history endpoint, so Nexis records the prices it observes. Charts are labelled that way. |
| Portfolio | Panta positions + Solana RPC | Positions every 20s, balances every 30s |
| Crypto | CoinGecko `/coins/markets`, `market_chart`; Coinbase `ticker` WebSocket | Tick-by-tick for assets listed on Coinbase, otherwise every 30s |
| Sports | ESPN: ~200 built-in leagues plus leagues discovered from ESPN's catalogue (football, basketball, tennis, MLB, NHL, MMA, golf, motorsport, rugby and more), fetched per sport group by `/api/sports` and cached at the edge (10s) | All groups every 60s; while something is live and a scores page is open, the groups with live games every 10s |
| Trader Tracker | Polymarket Data API (`pm:0x…`), Panta positions (`sol:<wallet>`) | Every 20s per tracked trader |
| Reference markets | Polymarket Gamma + CLOB WebSocket | Streamed prices, trades every 8s |

## Sportsbook

`#/sports` opens a sportsbook. Games (upcoming, live, and results from the last 3 days) come from Polymarket's sports listings via `/api/pmgames`. Bets are placed on **Panta** from the user's Solana wallet; Polymarket is not used for betting. ESPN supplies scores, clocks, crests and match stats when it has the same game.

- **Layout:**
  - **Sport** and **League** dropdowns at the top (no swipe rows or side list);
  - bet-type tabs: **3 Way & O/U**, **Double Chance** and **GG/NG** for football, **Winner** for other sports;
  - games grouped by day ("24/09 Thursday") and league;
  - each row shows kick-off time and game ID, teams, a stats link, one odds column per selection, and "+N" for more bets;
  - Live, Upcoming and Results tabs, search (teams, leagues, game ID), and decimal, fractional or American odds.
- **Game page:** every option shows its name with the odds beside it (e.g. "Arsenal 1.85 · Draw 3.60 · Chelsea 4.20"). Bet groups:
  - **Match Result:** home, draw, away.
  - **Double Chance:** home or draw, home or away, draw or away.
  - **Goals:** over/under 0.5, 1.5, 2.5, 3.5 and 4.5.
  - **Both Teams To Score:** yes, no.
  - **Half Time Result**, plus first-half goals over/under 0.5 and 1.5.
  - **Half Time / Full Time:** all 9 combinations.
  - **Correct Score:** 16 common scores.
  - **First Team to Score:** home, away, no goal.
  - **Corners:** totals over/under 8.5, 9.5 and 10.5; each team over/under 4.5; corner handicap ±1.5.
  - **Cards:** totals over/under 3.5, 4.5 and 5.5; each team over/under 1.5. Player cards appear under More when Polymarket lists them.
  - **Handicap:** ±1.5 and ±2.5.
  - **More:** other markets Polymarket lists for the game.
  - Other sports: winner, plus Polymarket's total and spread lines.
- **List tabs:** 3 Way & O/U, Over/Under, Handicap and Half Time. A game counts as football (1 · X · 2) if its league is football, ESPN says soccer, or Polymarket lists a draw.
- **Bets are Panta markets:** each option is YES or NO on one Panta market per bet type and game, for example:
  - home win, draw, away win;
  - over N.5 goals;
  - home wins by 2 or more (handicap −1.5).

  Double Chance reuses the result markets: "Home or Draw" is NO on "away win". "No goal" is NO on "over 0.5". Draw No Bet isn't offered, because a YES/NO market can't refund stakes on a draw.
- **First bettor creates the market:** if a prop has no Panta market yet, the first bettor creates it on Panta in the same flow, then places the bet. They pay Panta's creation fee, which is shown in the review, and sign one extra transaction.
  - Each market has a fixed question, a resolution rule (regular time only; extra time and penalties don't count; cancelled if not played within 48h) and sources (ESPN match page, Polymarket event, BBC scores).
  - Trading stays open through the game, until about full time, so bets can be placed in play. Panta's Resolution Agent settles the market.
- **Registry (`/api/book`):** records which Panta market holds each prop, so everyone after the first bettor uses the same market. It uses the same Upstash Redis as server accounts.
  - Before recording a market, the server checks on Solana (`SOLANA_RPC_URL`) that the creation transaction succeeded, touches the market account and contains the question.
  - It also checks against Polymarket that the question names both teams, or is the exact Polymarket question for `pm:` props.
  - The first registration wins.
- **In-play betting:** bets can be placed while a game is live, until the 90th minute.
  - Estimated odds follow the game: the goals model is re-fitted to Polymarket's live 1X2 (and O/U 2.5 when listed) for the goals still to come, on top of the current score and time left.
  - Bets that are already decided close automatically: half-time bets after the break, and impossible or near-certain outcomes (under 1% or over 99%).
  - After a goal, First Team to Score becomes **Next Team to Score** (goal 2, 3, …, props `ng<k>_home/away`), with a "No More Goals" option (NO on the matching over/under line).
  - Corners and cards stay open in play, priced from ESPN's live counts plus the expected rest of the match. Corners use each team's `wonCorners` statistic; cards use the yellow and red cards in ESPN's match events. The counts are shown on the game page. If ESPN has no live corner stats for a game, its corner bets close at kick-off.
  - Panta markets created from now on stay open until about 2 hours after kick-off (3.5 hours for other sports). Markets created before this change close at kick-off.
- **Odds:** the Panta price once the market exists. Until then, estimates (marked with *):
  - Polymarket's own price where it lists the same bet;
  - otherwise a goals model fitted like a bookmaker's: home and away Poisson scoring rates that reproduce Polymarket's 1X2 prices and its over/under 2.5 price when listed. It prices goal lines, handicaps, half-time (45% of each rate), HT/FT, correct score and first to score.
  - Corners and cards have no market price, so they use typical averages (about 10 corners and 4.3 cards per match), tilted by team strength.
  - A new Panta market opens at Panta's own price. After a first bettor creates a market, Nexis shows that real price and asks before placing the stake.
- **Bet slip:** each selection shows its odds. Two modes:
  - **Singles:** each selection is its own bet with its own stake and potential winnings.
  - **Accumulator:** one stake. Combined odds = the selections' odds multiplied; potential winnings = stake × combined odds. Panta has no multi-bets, so an accumulator is one Panta market that resolves YES only if every selection wins. It allows 2–6 selections, one per game, and trading ends at the earliest kick-off.
- **Other slip rules:**
  - kept in the browser; minimum $1; USDC balance checked first;
  - review, then one or two signatures per bet (create market if needed, then buy);
  - bets appear in Portfolio, where winnings are claimed after Panta settles.
- **Code:**
  - `js/services/book.js`: games, props, questions and rules, odds, registry lookups, slip;
  - `js/views/book.js`: pages and the bet flow;
  - `api/book.js`: registry.
- **Scores & results:** a tab on the Sports page keeps the full ESPN views described below.

## Sports coverage, search and filters

- **Not offered:** the sports and leagues below are excluded everywhere: scores, sportsbook, league pickers and menus, filters, search, the server feeds and Polymarket market lists.
  - Sports: American Football (NFL, college, CFL) and Australian Football (AFL).
  - Football leagues: FIFA Friendly Matches, Club Friendlies, Primera A (Colombia), J2 League, Morocco (Botola Pro), Liga MX, Liga Nacional (Guatemala), NWSL, Liga Profesional (Argentina), USL Championship, Brazil Série B.
  - Also: Primera Nacional, NIFL Premiership, Ukrainian Premier League, Eredivisie, Romania, K League, Brasileiro (all Brazilian league divisions), Primera División (except La Liga), Czech league, Taça de Portugal, Primera B, Canadian Premier League, Women's U-20 Premier League, Scottish Cup, Indonesian league, Chinese leagues.
- **Main football leagues:** English Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and UEFA Champions League are always listed first under Football, even on days without games, under exactly these names. Polymarket and ESPN name variants map onto them (`FOOTBALL_PINNED` / `footballPinned()` in `js/services/leagues.js`), and they're never excluded.
  - The rules live in one place, `SPORT_EXCLUDED` / `sportExcluded()` in `js/services/leagues.js`. They match by sport, ESPN league key, Polymarket league code or league name, so leagues found through ESPN's catalogue or Polymarket's listings are excluded too.

- **Leagues.** `js/services/leagues.js` lists about 200 leagues across three kinds of event: team games, player-vs-player matches (tennis, MMA) and leaderboards (golf, motorsport). `/api/sports` also reads ESPN's league catalogue for football, basketball and rugby, so leagues ESPN adds appear automatically.
- **Sports page:**
  - **Search:** teams, players, leagues and tournaments.
  - **Sport and league dropdowns:** a Sport dropdown, and a league dropdown whose first group is **Top leagues** (English Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UEFA Champions League, Europa League, MLS, Saudi Pro League, NBA, WNBA, MLB, NHL, ATP, WTA, UFC, F1).
  - **League pages:** picking any league (shortcut, the league picker, or `#/sports?league=soccer/esp.1`) opens its schedule: live games, fixtures for the next 4 weeks and results from the last 7 days, whatever day it is. The picker always lists every known league, not only those playing today.
  - **Filters:** status (All / Live / Upcoming / Finished), sport chips with counts, **Has markets** (only events with a related Panta or Polymarket market), **Following**, and a reset button.
- **Markets on games.** `/api/pmgames` loads Polymarket's game markets (win / draw / spread) for every league Polymarket covers. Nexis matches each one to its ESPN game by both team names and a start time within 30 hours. Game cards show the win and draw prices, and each market opens in the Polymarket section so it can be traded without leaving Nexis. Polymarket usually lists a game a few days before it starts and doesn't cover every league, so lower divisions and far-off fixtures often have no market yet. Panta markets whose titles name the teams are listed as well.
  - **Days:** a day picker covering the last and next 7 days.
- **Coverage limits.** ESPN's free API doesn't cover every league in the world; much lower-division football and most non-US basketball, for example, are missing. Complete global coverage needs a paid sports-data provider, which can be added as another source for `/api/sports`.

## Trading on Panta

**Buy:**

1. Panta quotes the exact shares and fee.
2. Panta builds the transaction.
3. Your wallet signs and sends it.
4. Nexis polls Solana until it is `confirmed` or `finalized`.
5. Nexis submits the order and reports the trade to Panta.

A trade is shown as successful **only after on-chain confirmation**. Transactions that fail, are rejected or whose blockhash expires are shown as such.

**Create a market:**

1. Panta returns a creation quote with the USDC fee.
2. Panta builds a versioned transaction.
3. You sign it.
4. After confirmation, Nexis registers the market with Panta.

**Claim:** after resolution, claimable positions show a **Claim** button, which builds, signs and confirms the claim.

**Limits of the Panta API that Nexis doesn't paper over:**

- **Primary-phase buys only.** Selling and trading in the secondary (order-book) phase aren't available through the API, and those markets say so.
- **Not published by Panta:**
  - liquidity and open interest;
  - price history (see above);
  - cost basis. Entry price and P&L are shown only for trades you place in Nexis.

## Polymarket trading

The **Polymarket** section (`#/polymarket`) trades Polymarket markets from inside Nexis. It is separate from Panta: it uses a different wallet (an EVM wallet on Polygon), a different network and a different balance.

- **Setup, once per wallet:**
  1. Connect an EVM wallet (MetaMask, Rabby, Coinbase Wallet, or any wallet announced via EIP-6963).
  2. Switch to Polygon.
  3. Sign a free message to create Polymarket trading credentials.
  4. Approve Polymarket's exchange contracts: one transaction per approval, each confirmed on Polygon.
  5. Fund the wallet with USDC.e and a little POL for gas.
- **Trading:** market orders (fill-or-kill: a BUY amount is in USDC, a SELL amount in shares) and limit orders (good-till-cancelled), plus the live order book, open orders with cancel, positions and trade history.
- **Safety:**
  - Orders are signed in the wallet and sent from the browser straight to `clob.polymarket.com`; Nexis runs no trading server and never holds keys or funds.
  - A fill counts as successful only after its settlement transaction is confirmed on Polygon. A resting limit order is shown as waiting, not as a trade.
- **Regions:** Nexis checks Polymarket's geoblock endpoint and disables trading where Polymarket isn't available, and Polymarket enforces its own restrictions too.
- **Library:** `@polymarket/clob-client` and `viem` are bundled as `js/vendor/polymarket-trade.js` and loaded only in this section. Rebuild with `npm run vendor:polymarket`.
- **Limitation:** funds held in a polymarket.com account (a proxy wallet) don't appear automatically. The connected wallet trades with its own USDC.

## Trader Tracker

- **Track any trader:**
  - Polymarket accounts: search by username or 0x address, or pick from the leaderboard.
  - Solana wallets trading on Panta: use a wallet address, or a trader from a market's trades tape.
- **Tracking only watches.** Nexis detects new, resized and closed positions and notifies you, for example "@trader opened a YES position on …".
- **Copy trades** is a separate switch, for Panta traders only. It never executes on its own: each new position becomes a Panta quote that you review and sign.
- Polymarket traders can be tracked but not copied, because their positions are on Polygon.

## Notifications

Notifications come only from real events:

- confirmed or failed transactions;
- tracked-trader position changes;
- ±5¢ moves and resolutions on markets you hold;
- goals, kick-off and full time in games you follow.

Desktop notifications can be enabled in Settings.

## Accounts

Accounts are stored on the server, so an account created on one device works from any browser or phone:

- **Vercel:** Upstash Redis, added from the Storage tab (see the table above).
- **Netlify:** Netlify Blobs, which is built in and needs no setup.

`/api/auth` checks every sign-in method:

- **Email + password:** passwords are hashed with scrypt on the server, and repeated failures lock the account for a minute.
- **Wallet:** Sign-In With Solana. The server checks the wallet's Ed25519 signature and rejects replayed messages.
- **Google:** the ID token is checked with Google and must be issued for your `GOOGLE_CLIENT_ID`.
- **Email code and password reset:** Privy sends and checks the code in the browser; the server verifies Privy's signed token (with `PRIVY_APP_SECRET`) and reads the verified email before signing in. Resend is an alternative.
- **Two-factor authentication:** TOTP codes are verified on the server.

Sessions are signed tokens that can be revoked. Settings → Security lists every signed-in device, and signing one out takes effect within a minute. Settings → Integrations shows whether the accounts database is connected.

Without a database, Nexis falls back to accounts kept in the browser, which only work where they were created. Wallet balances, positions and trades always come from the chain and Panta, not from the account.
