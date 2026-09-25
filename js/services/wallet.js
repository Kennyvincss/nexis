/* =====================================================================
   BLOCKCHAIN / WALLET SERVICE (Solana)
   - Wallets: detects Phantom, Backpack and Solflare; connects, signs, sends.
   - Chain: JSON-RPC via /api/rpc (SOLANA_RPC_URL) for balances, history and
     confirmation. A transaction is shown as successful only after the RPC
     reports it "confirmed" or "finalized".
   - @solana/web3.js is loaded from jsDelivr on first use (building/decoding
     the transactions Panta returns).
   ===================================================================== */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WALLETS = [
  // silent: supports connect({ onlyIfTrusted: true }) (reconnects without a popup). browse: opens a page in the wallet's mobile app.
  { id: 'phantom', name: 'Phantom', c: '#AB9FF2', url: 'https://phantom.com/download', silent: true, browse: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}`, get: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : (window.solana && window.solana.isPhantom ? window.solana : null) },
  { id: 'backpack', name: 'Backpack', c: '#E33E3F', url: 'https://backpack.app/download', get: () => (window.backpack && window.backpack.isBackpack) ? window.backpack : null },
  { id: 'solflare', name: 'Solflare', c: '#FC7227', url: 'https://solflare.com/download', browse: (u) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}`, get: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null },
];
const walletIcon = (w, size = 34) => `<span class="wicon" style="width:${size}px;height:${size}px;background:${w.c}">${w.name[0]}</span>`;
const explorerTx = (sig) => `https://solscan.io/tx/${sig}`;
const explorerAddr = (a) => `https://solscan.io/account/${a}`;

const Chain = {
  async rpc(method, params = []) {
    const r = await Net.api('rpc', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params } });
    if (r.error) throw Object.assign(new Error(r.error.message || 'RPC error'), { code: 'RPC_' + r.error.code });
    Feeds.set('chain', 'live'); return r.result;
  },
  async balances(address) {
    const [sol, toks] = await Promise.all([
      this.rpc('getBalance', [address, { commitment: 'confirmed' }]),
      this.rpc('getTokenAccountsByOwner', [address, { mint: USDC_MINT }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    ]);
    const usdc = (toks.value || []).reduce((s, a) => s + nz(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount), 0);
    return { sol: nz(sol.value ?? sol) / 1e9, usdc, t: now() };
  },
  async history(address, limit = 25) {
    const r = await this.rpc('getSignaturesForAddress', [address, { limit }]);
    return (r || []).map(x => ({ sig: x.signature, t: x.blockTime ? x.blockTime * 1000 : null, status: x.err ? 'failed' : (x.confirmationStatus || 'confirmed'), memo: x.memo || '' }));
  },
  /** Polls until the signature is confirmed/finalized, failed, or its blockhash expires. */
  async confirm(sig, { lastValidBlockHeight, onUpdate, timeoutMs = 120000 } = {}) {
    const t0 = now();
    while (now() - t0 < timeoutMs) {
      try {
        const r = await this.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
        const s = r && r.value && r.value[0];
        if (s) {
          if (s.err) { onUpdate && onUpdate('failed'); return { status: 'failed', err: s.err }; }
          if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') { onUpdate && onUpdate(s.confirmationStatus); return { status: s.confirmationStatus }; }
          onUpdate && onUpdate('processed');
        } else if (lastValidBlockHeight) {
          const h = await this.rpc('getBlockHeight', [{ commitment: 'confirmed' }]);
          if (h > lastValidBlockHeight) { onUpdate && onUpdate('expired'); return { status: 'expired' }; }
        }
      } catch (e) { onUpdate && onUpdate('checking'); }
      await delay(2000);
    }
    return { status: 'unknown' };
  },
  web3: null,
  loadWeb3() {
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (this._w3) return this._w3;
    this._w3 = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.99.0/lib/index.iife.min.js'; s.crossOrigin = 'anonymous'; s.onload = () => res(window.solanaWeb3); s.onerror = () => { this._w3 = null; rej(new Error('Couldn’t load the Solana library. Check your connection.')); }; document.head.appendChild(s); });
    return this._w3;
  },
  b64(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; },
  /** Legacy transaction from Panta's instruction list (primary buy, claim). */
  async txFromInstructions({ instructions, recentBlockhash, lastValidBlockHeight }, feePayer) {
    const W = await this.loadWeb3();
    const tx = new W.Transaction({ feePayer: new W.PublicKey(feePayer), blockhash: recentBlockhash, lastValidBlockHeight });
    instructions.forEach(ix => tx.add(new W.TransactionInstruction({ programId: new W.PublicKey(ix.programId), keys: (ix.accounts || []).map(a => ({ pubkey: new W.PublicKey(a.pubkey), isSigner: !!a.isSigner, isWritable: !!a.isWritable })), data: toWeb3Bytes(W, this.b64(ix.data || '')) })));
    return tx;
  },
  /** Versioned transaction from a base64 string (market creation). */
  async txFromBase64(b64) { const W = await this.loadWeb3(); return W.VersionedTransaction.deserialize(this.b64(b64)); },
};
function toWeb3Bytes(W, u8) { const B = W.Buffer || window.Buffer; return B && B.from ? B.from(u8) : u8; }

const Wallets = {
  status: {}, // address -> connected | locked | disconnected | other-account | missing
  byName(name) { return WALLETS.find(w => w.name === name || w.id === name); },
  detected() { return WALLETS.filter(w => w.get()); },
  /** The provider for a linked wallet, connected to the right account. */
  async provider(w, { interactive = true } = {}) {
    const W = this.byName(w.label || w.name); const prov = W && W.get();
    if (!prov) throw Object.assign(new Error(`${w.label || 'Your wallet'} isn’t installed in this browser.`), { code: 'WALLET_MISSING' });
    let pk = prov.publicKey && prov.publicKey.toString();
    if (!pk || !prov.isConnected) { const r = await prov.connect(interactive ? undefined : { onlyIfTrusted: true }); pk = ((r && r.publicKey) || prov.publicKey).toString(); }
    if (w.address && pk !== w.address) throw Object.assign(new Error(`${W.name} is on a different account (${shortW(pk)}). Switch to ${shortW(w.address)} in your wallet.`), { code: 'WRONG_ACCOUNT' });
    return prov;
  },
  async connect(id) {
    const W = WALLETS.find(x => x.id === id); const prov = W && W.get();
    if (!prov) throw Object.assign(new Error(`${W ? W.name : 'This wallet'} isn’t installed. Install it, then reload this page.`), { code: 'WALLET_MISSING', url: W && W.url });
    const r = await prov.connect(); const address = ((r && r.publicKey) || prov.publicKey).toString();
    return { W, prov, address };
  },
  async signMessage(prov, text) {
    const r = await prov.signMessage(new TextEncoder().encode(text), 'utf8');
    const bytes = r && r.signature ? r.signature : r; return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  /** Asks the wallet to sign and broadcast. Returns the signature. */
  async signAndSend(prov, tx) {
    if (prov.signAndSendTransaction) { const r = await prov.signAndSendTransaction(tx); return typeof r === 'string' ? r : r.signature; }
    const signed = await prov.signTransaction(tx); const raw = signed.serialize();
    let bin = ''; raw.forEach(b => bin += String.fromCharCode(b));
    return Chain.rpc('sendTransaction', [btoa(bin), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' }]);
  },
  /** Status of each linked wallet in this browser, without opening wallet popups: only wallets that support a silent
      reconnect (Phantom) are asked; the others show "connects when you sign" until they're used. */
  watch() {
    const u = Auth.user; if (!u) return;
    const upd = (a, s) => { if (this.status[a] === s) return; this.status[a] = s; Bus.emit('wallet:status', a); };
    const check = (W, prov) => { const pk = prov.isConnected && prov.publicKey ? prov.publicKey.toString() : null; (Auth.user ? Auth.user.wallets : []).filter(w => this.byName(w.label) === W).forEach(w => upd(w.address, !pk ? 'idle' : pk === w.address ? 'connected' : 'other-account')); };
    const seen = new Set();
    u.wallets.forEach(w => {
      const W = this.byName(w.label); const prov = W && W.get();
      if (!prov) { upd(w.address, 'missing'); return; }
      if (seen.has(W)) return; seen.add(W);
      if (!prov._nexisWatch && prov.on) { prov._nexisWatch = true; ['connect', 'disconnect', 'accountChanged'].forEach(ev => { try { prov.on(ev, () => setTimeout(() => check(W, prov), 0)); } catch (e) { /* event not supported */ } }); }
      if (prov.isConnected && prov.publicKey) return check(W, prov);
      if (!W.silent) return check(W, prov);
      prov.connect({ onlyIfTrusted: true }).then(() => check(W, prov)).catch(() => check(W, prov));
    });
  },
  /** Connects a linked wallet on request (the Settings "Connect" button). */
  async reconnect(address) { const w = Auth.user && Auth.user.wallets.find(x => x.address === address); if (!w) return; try { await this.provider(w); } finally { this.watch(); } },
  isMobile: () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
};
function walletStatusTag(a) { return { connected: '<span class="tag green"><span class="live-dot"></span>Connected</span>', idle: `<span class="tag">Not connected in this browser</span> <button class="link" style="display:inline;font-size:12px;margin-left:6px" data-action="walletReconnect" data-a="${esc(a)}">Connect</button>`, 'other-account': '<span class="tag amber">Another account is active in the wallet</span>', missing: '<span class="tag">Wallet not detected in this browser</span>' }[Wallets.status[a]] || '<span class="tag">Checking…</span>'; }

/* Balances for the signed-in user's primary wallet, refreshed every 30s. */
const Balances = {
  v: null, err: null, addr: null,
  async refresh() {
    const w = primaryWallet(); if (!w) { this.v = null; return; }
    if (this.addr !== w.address) { this.v = null; this.addr = w.address; }
    try { this.v = await Chain.balances(w.address); this.err = null; } catch (e) { this.err = e; Feeds.set('chain', 'offline', e); }
    Bus.emit('balances');
  },
  start() { Poller(() => this.refresh(), 30000); },
};

/* ---------- transaction lifecycle (persisted per user) ---------- */
const TX_ST = { signing: ['amber', 'Waiting for signature'], submitted: ['amber', 'Submitted · confirming'], processed: ['amber', 'Processed · confirming'], checking: ['amber', 'Confirming'], confirmed: ['green', 'Confirmed'], finalized: ['green', 'Finalized'], failed: ['red', 'Failed'], expired: ['red', 'Expired · not included'], unknown: ['amber', 'Unconfirmed'], rejected: ['', 'Cancelled in wallet'] };
const Tx = {
  add(t) { const tx = { id: uid('tx'), t: now(), status: 'signing', ...t }; Store.s.txs.unshift(tx); Store.s.txs = Store.s.txs.slice(0, 150); Store.save(); Bus.emit('tx', tx); return tx; },
  set(tx, patch) { Object.assign(tx, patch); Store.save(); Bus.emit('tx', tx); },
  ok(tx) { return tx && (tx.status === 'confirmed' || tx.status === 'finalized'); },
  /** Sign + send + confirm. Resolves with the final tx record; never marks success before on-chain confirmation. */
  async run({ kind, desc, marketId, amount, prov, tx: rawTx, lastValidBlockHeight }) {
    const rec = this.add({ kind, desc, marketId, amount });
    let sig;
    try { sig = await Wallets.signAndSend(prov, rawTx); }
    catch (e) { this.set(rec, { status: /reject|cancel|denied|declined/i.test(e.message || '') || e.code === 4001 ? 'rejected' : 'failed', err: e.message }); throw e; }
    this.set(rec, { sig, status: 'submitted' });
    const r = await Chain.confirm(sig, { lastValidBlockHeight, onUpdate: (s) => { if (!this.ok(rec) && s !== rec.status) this.set(rec, { status: s }); } });
    this.set(rec, { status: r.status, err: r.err ? JSON.stringify(r.err) : undefined, tConfirmed: now() });
    Notify.push({ kind: 'tx', icon: this.ok(rec) ? 'check' : 'alert', text: `${esc(kind)} ${this.ok(rec) ? 'confirmed on Solana' : TX_ST[rec.status][1].toLowerCase()} · ${esc(desc || '')}`, href: '#/portfolio?tab=Transactions', toast: true, toastKind: this.ok(rec) ? 'ok' : 'err', setting: 'notifyTx' });
    return rec;
  },
};
