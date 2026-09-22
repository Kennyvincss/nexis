# nexis

Nexis — trade predictions, follow traders with public records, and copy their moves. Single-file prototype: open `index.html` in a browser.

## Authentication

Sign-in and account management run through the `Auth` service in `index.html`, currently backed by `MockAuthAdapter` (accounts, PBKDF2 password hashes and sessions are stored in this browser's `localStorage` only).

- **Log in / Create account** (`#/login`, `#/signup`): Continue with Google (Gmail), Continue with Wallet (Phantom, Backpack, Solflare — real extension if installed, otherwise a simulated demo address), Continue with Email (passwordless link), and email + password with show/hide toggle, strength meter and "Forgot password?" (`#/forgot`, 6-digit reset code).
- **Wallet identity**: Sign-In With Solana message signed by the wallet; the address becomes the Nexis account.
- **After sign-in**: returning users land on the dashboard (`#/home`); new accounts get a one-step profile setup (`#/onboarding`) that can be skipped straight to the dashboard.
- **Settings** (`#/settings?tab=…`): `account` (email, sign-in methods, delete account), `profile`, `wallets` (link, set primary, copy, remove), `security` (change/add/remove password, 2FA, active sessions, activity log), `preferences`. Log out from the account menu, Settings, or the wallet menu.

### Connecting a real provider

Implement an adapter with the same method names as `MockAuthAdapter` (see the `ProviderAuthAdapter` comment next to it — `signUpWithPassword`, `signInWithPassword`, `sendMagicLink`, `verifyMagicLink`, `signInWithGoogle`, `walletNonce`, `signInWithWallet`, `requestPasswordReset`, `resetPassword`, `signOut`, `updateProfile`, `changePassword`, `linkWallet`, `unlinkWallet`, …) and set `Auth.adapter` to it. The UI does not need to change.
