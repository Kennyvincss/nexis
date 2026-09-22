# nexis

Nexis lets you trade Panta prediction markets with your own Solana wallet, follow live sports and crypto prices, and track real traders. Everything updates in real time.

**Nexis has no mock, demo or simulated data.** If an integration isn't configured or can't be reached, the page shows a **Connect API** or **Data unavailable** state instead of inventing numbers.

## Where to add credentials

All secrets live in serverless functions under `/api`, never in the browser.

To add them:

1. Open **Vercel → your project → Settings → Environment Variables**.
2. Add the variables below for **Production** (and Preview if you use it).
3. **Redeploy**. Environment variables only apply to new deployments.

**Settings → Integrations** in the app, and the **Data sources** pill in the top bar, show which integrations are live.

| Variable | Required | What it enables |
| --- | --- | --- |
| `PANTA_API_KEY` | **Yes, for markets** | Everything Panta: markets, YES/NO prices, volume, trades, positions, quotes, trading, market creation, claims. Use a `pk_live_…` key from [docs.panta.market](https://docs.panta.market). A `pk_test_…` key returns Panta's sandbox fixtures; Nexis labels them and blocks signing. |
| `PANTA_API_BASE_URL` | No | Defaults to `https://live-api.panta.market/api/v1`. |
| `PANTA_USER_ID` | No | Sent as `X-User-Id` if Panta issued you one. |
| `SOLANA_RPC_URL` | Recommended | Your Solana mainnet RPC (Helius, Triton, QuickNode…). Used for wallet balances, on-chain history and transaction confirmation. The public endpoint used by default is heavily rate-limited. |
| `COINGECKO_API_KEY` | Recommended | Raises CoinGecko rate limits for crypto prices and charts. Set `COINGECKO_PRO=1` if it's a Pro key. |
| `ANTHROPIC_API_KEY` | Optional | Nexis AI: drafts markets from a post and lists factors for each side. Without it, drafting uses an on-device parser and analysis is hidden. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET` | Optional | Email verification codes: passwordless sign-in and password reset. `AUTH_SECRET` is any long random string. |
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
  notifications.js    notifications service (in-app + optional desktop)
  ai.js               Nexis AI
js/auth.js            accounts, sign-in methods, settings
js/views/*.js         pages (markets, crypto, sports, tracker, home, activity, landing)
js/app.js             router, actions, live DOM updates, boot
api/panta.js          Panta proxy: adds X-Api-Key server-side; allowlisted paths only
api/data.js           public-feed proxy (Polymarket, ESPN, CoinGecko, Coinbase); allowlisted hosts, short cache
api/rpc.js            Solana JSON-RPC proxy; allowlisted methods
api/config.js         reports which integrations are configured (never the secrets)
api/email.js          verification codes via Resend
api/ai.js             Claude via the Anthropic SDK
```

The services emit events on a small bus. `app.js` patches the visible page in place, so nothing needs a manual refresh: prices, scores, balances, transaction status, notifications and tapes all update live.

## Data sources and update rates

| Area | Source | Updates |
| --- | --- | --- |
| Panta markets | Panta API | Catalog every 45s. Prices of visible markets every 10s. Trades on an open market every 15s. Trades from the top markets every 30s. |
| Price charts (Panta) | Recorded by Nexis | Panta has no price-history endpoint, so Nexis records the prices it observes. Charts are labelled that way. |
| Portfolio | Panta positions + Solana RPC | Positions every 20s, balances every 30s |
| Crypto | CoinGecko `/coins/markets`, `market_chart`; Coinbase `ticker` WebSocket | Tick-by-tick for assets listed on Coinbase, otherwise every 30s |
| Sports | ESPN scoreboard + summary | Every 12s while a game is live, otherwise 60s |
| Trader Tracker | Polymarket Data API (`pm:0x…`), Panta positions (`sol:<wallet>`) | Every 20s per tracked trader |
| Reference markets | Polymarket Gamma + CLOB WebSocket | Streamed prices, trades every 8s |

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

Accounts are stored in the browser's `localStorage`: PBKDF2 password hashes, real TOTP two-factor authentication, and Sign-In With Solana wallet login. Email codes (Resend) and Google sign-in are verified server-side when configured.

Because of this, accounts don't sync across devices. A hosted user database is the next step if you need that. Wallet balances, positions and trades always come from the chain and Panta, not from the account.
