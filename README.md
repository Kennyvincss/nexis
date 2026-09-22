# nexis

Nexis — trade predictions, track traders, and copy their moves. The app is `index.html` plus one serverless function, `api/proxy.js`.

## Live data

| Feed | Source | What updates live |
| --- | --- | --- |
| Prediction markets | Polymarket Gamma API (poll 20s) | prices, volume, liquidity, 24h change, new markets, resolution |
| Order book | Polymarket CLOB WebSocket | best bid/ask, last trade, price chart tip |
| Trades tape | Polymarket Data API (poll 8s) | real fills with trader names |
| Trader Tracker | Polymarket Data API (poll 20s per tracked trader) | positions, entry, size, P&L, win rate, ROI, activity |
| Live sports | ESPN scoreboard API (poll 12s live / 60s idle) | score, clock, status, team stats, goals and cards |
| Crypto spot | Coinbase WebSocket | BTC, ETH, SOL |

- On Vercel, the browser calls `/api/proxy?url=…` (same origin, allowlisted hosts, short edge cache). Elsewhere it calls the APIs directly.
- If a feed can't be reached, the app keeps working with simulated data and says so. The **Data sources** pill in the top bar shows each feed's status.
- **Labels:** every market and match carries a source badge, either `LIVE · Polymarket`, `LIVE · ESPN` or `SIMULATED`.
- **Simulated:** Nexis-native demo markets, demo traders (@CryptoAlex etc.), the Arsenal vs Chelsea demo replay, and balances (paper USDG).
- **Trading is paper trading.** Buys and sells on live markets fill at the live price (best bid/ask when the spread is tight), but no funds move and no on-chain order is placed until a live Panta adapter replaces `MockPantaAdapter`.
- **Sports markets on real games:** Nexis paper markets priced by the Nexis scoring model from the live ESPN score and clock, anchored to bookmaker moneylines before kick-off when ESPN provides them. They resolve automatically from the final result.

## Trader Tracker

- **Find traders** (`#/tracker`): search by name, Polymarket username or 0x wallet, or pick from the weekly leaderboard.
- **Track** saves the trader to your account. You then get alerts when they open, close or resize a position, for example "@trader opened a YES position on …", "@trader closed a position for +$420" or "@trader entered Arsenal vs Chelsea".
- **Tracking never copies trades.** *Copy trades* is a separate switch, and copies mirror both entries and exits as paper trades.
- **Trader page** (`#/tracker/pm:<wallet>`) shows:
  - current positions with entry, size, YES/NO side and live P&L
  - realized P&L, win rate, ROI, total trades, volume and active markets
  - trading history, recent activity and a performance chart

## Authentication

Sign-in and account management run through the `Auth` service in `index.html`, currently backed by `MockAuthAdapter` (accounts, PBKDF2 password hashes and sessions are stored in this browser's `localStorage` only).

- **Log in / Create account** (`#/login`, `#/signup`): Continue with Google (Gmail), Continue with Wallet (Phantom, Backpack, Solflare — real extension if installed, otherwise a simulated demo address), Continue with Email (passwordless link), and email + password with show/hide toggle, strength meter and "Forgot password?" (`#/forgot`, 6-digit reset code).
- **Wallet identity**: Sign-In With Solana message signed by the wallet; the address becomes the Nexis account.
- **After sign-in**: returning users land on the dashboard (`#/home`); new accounts get a one-step profile setup (`#/onboarding`) that can be skipped straight to the dashboard.
- **Settings** (`#/settings?tab=…`): `account` (email, sign-in methods, delete account), `profile`, `wallets` (link, set primary, copy, remove), `security` (change/add/remove password, 2FA, active sessions, activity log), `preferences`. Log out from the account menu, Settings, or the wallet menu.

### Connecting a real provider

Implement an adapter with the same method names as `MockAuthAdapter` (see the `ProviderAuthAdapter` comment next to it — `signUpWithPassword`, `signInWithPassword`, `sendMagicLink`, `verifyMagicLink`, `signInWithGoogle`, `walletNonce`, `signInWithWallet`, `requestPasswordReset`, `resetPassword`, `signOut`, `updateProfile`, `changePassword`, `linkWallet`, `unlinkWallet`, …) and set `Auth.adapter` to it. The UI does not need to change.
