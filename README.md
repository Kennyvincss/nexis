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
  polymarket.js       reference markets + global trades tape (view only)
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
api/sports.js         every league's ESPN scoreboard in one trimmed, edge-cached response
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
| Sports | ESPN: ~200 built-in leagues plus leagues discovered from ESPN's catalogue (football, basketball, tennis, NFL/college, MLB, NHL, MMA, golf, motorsport, rugby and more), fetched per sport group by `/api/sports` and cached at the edge | Every 12s while something is live, otherwise 60s |
| Trader Tracker | Polymarket Data API (`pm:0x…`), Panta positions (`sol:<wallet>`) | Every 20s per tracked trader |
| Reference markets | Polymarket Gamma + CLOB WebSocket | Streamed prices, trades every 8s |

## Sports coverage, search and filters

- **Leagues.** `js/services/leagues.js` lists about 200 leagues across three kinds of event: team games, player-vs-player matches (tennis, MMA) and leaderboards (golf, motorsport). `/api/sports` also reads ESPN's league catalogue for football, basketball and rugby, so leagues ESPN adds appear automatically.
- **Sports page:**
  - **Search:** teams, players, leagues and tournaments.
  - **Filters:** status (All / Live / Upcoming / Finished), sport chips with counts, a league picker grouped by sport, **Has markets** (only events with a related Panta or Polymarket market), **Following**, and a reset button.
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
