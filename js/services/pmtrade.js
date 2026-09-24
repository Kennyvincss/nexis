/* =====================================================================
   POLYMARKET TRADING SERVICE (separate from Panta)
   - Your EVM wallet (MetaMask, Rabby, Coinbase Wallet… found via EIP-6963)
     signs everything. Nexis never holds keys or funds.
   - Orders are signed in the wallet and sent from this browser straight to
     Polymarket's order book (clob.polymarket.com), so Polymarket applies its
     own regional restrictions. Nexis also checks Polymarket's geoblock
     endpoint and disables trading where Polymarket isn't available.
   - A trade counts as done only after its settlement transaction is
     confirmed on Polygon.
   Library: js/vendor/polymarket-trade.js (@polymarket/clob-client + viem),
   loaded only when this section is used.
   ===================================================================== */
const PM_HOST = 'https://clob.polymarket.com';
const PM_CHAIN_HEX = '0x89';
const ctfAbiText = ['function isApprovedForAll(address owner, address operator) view returns (bool)', 'function setApprovalForAll(address operator, bool approved)'];

const PMTrade = {
  lib: null, wallets: [], wallet: null, address: null, chainOk: false, client: null, creds: null, geo: null,
  bal: null, approvals: null, positions: null, orders: null, trades: null, busy: false,

  async load() { if (!this.lib) { this.lib = await loadScript('/js/vendor/polymarket-trade.js', 'NexisPolymarket'); if (!this.lib) throw aerr('PM_LOAD', 'Couldn’t load the Polymarket trading library. Check your connection or ad blocker.'); } return this.lib; },

  /* ---------- wallets ---------- */
  discover() {
    if (this._disc) return; this._disc = true;
    window.addEventListener('eip6963:announceProvider', (e) => { const d = e.detail; if (!d || !d.info || !d.provider) return; if (!this.wallets.some(w => w.info.uuid === d.info.uuid)) { this.wallets.push(d); Bus.emit('pm'); } });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => { if (!this.wallets.length && window.ethereum) { this.wallets.push({ info: { uuid: 'injected', name: window.ethereum.isMetaMask ? 'MetaMask' : window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet', icon: '', rdns: 'injected' }, provider: window.ethereum }); Bus.emit('pm'); } }, 500);
  },
  saved() { try { return JSON.parse(localStorage.getItem('nexis-pm') || 'null'); } catch (e) { return null; } },
  save(v) { try { if (v) localStorage.setItem('nexis-pm', JSON.stringify(v)); else localStorage.removeItem('nexis-pm'); } catch (e) {} },
  credsKey(a) { return 'nexis-pm-creds:' + String(a).toLowerCase(); },
  loadCreds(a) { try { return JSON.parse(localStorage.getItem(this.credsKey(a)) || 'null'); } catch (e) { return null; } },
  msg(e) {
    const m = String((e && (e.shortMessage || e.message)) || e || '');
    if (e && (e.code === 4001 || /user rejected|denied|rejected the request/i.test(m))) return 'You rejected the request in your wallet. Nothing was sent.';
    if (e && e.status === 403) return 'Polymarket refused this request from your location. Trading on Polymarket isn’t available in your region.';
    if (e && e.status === 401) return 'Polymarket didn’t accept your trading credentials. Enable trading again.';
    if (/network error|failed to fetch|load failed/i.test(m)) return 'Couldn’t reach Polymarket from this browser. Check your connection; some browsers or extensions block it.';
    if (/not enough balance|insufficient/i.test(m)) return 'Not enough USDC (or shares) for this order, or allowances are missing.';
    if (/no match|couldn't be fully filled|FOK/i.test(m)) return 'There wasn’t enough liquidity to fill this order at a fair price. Try a smaller amount or a limit order.';
    return m || 'Something went wrong.';
  },
  async connect(uuid) {
    const w = this.wallets.find(x => x.info.uuid === uuid) || this.wallets[0];
    if (!w) throw aerr('NO_EVM', 'No EVM wallet was found in this browser. Install MetaMask, Rabby or Coinbase Wallet, then reload.');
    let accts; try { accts = await w.provider.request({ method: 'eth_requestAccounts' }); } catch (e) { throw aerr('CONNECT', this.msg(e)); }
    if (!accts || !accts[0]) throw aerr('NO_ACCOUNT', 'Your wallet didn’t share an account.');
    this.wallet = w; this.address = accts[0]; this.save({ uuid: w.info.uuid, rdns: w.info.rdns, address: this.address }); this.watch(w.provider);
    await this.ensureChain(); await this.init(); Bus.emit('pm');
  },
  async reconnect() {
    const s = this.saved(); if (!s) return; this.discover(); await delay(600);
    const w = this.wallets.find(x => (s.rdns && x.info.rdns === s.rdns) || x.info.uuid === s.uuid); if (!w) return;
    let accts = []; try { accts = await w.provider.request({ method: 'eth_accounts' }); } catch (e) { return; }
    if (!accts.length) return; this.wallet = w; this.address = accts[0]; this.watch(w.provider);
    try { this.chainOk = (await w.provider.request({ method: 'eth_chainId' })) === PM_CHAIN_HEX; } catch (e) { this.chainOk = false; }
    if (this.chainOk) await this.init().catch(() => {}); Bus.emit('pm');
  },
  watch(p) {
    if (p._nexisPm || !p.on) return; p._nexisPm = true;
    p.on('accountsChanged', (a) => { this.address = (a && a[0]) || null; this.client = null; this.creds = null; this.bal = this.approvals = this.positions = this.orders = this.trades = null; if (!this.address) this.save(null); else this.save({ ...(this.saved() || {}), address: this.address }); if (this.address && this.chainOk) this.init().catch(() => {}); Bus.emit('pm'); });
    p.on('chainChanged', (c) => { this.chainOk = c === PM_CHAIN_HEX; this.client = null; if (this.chainOk && this.address) this.init().catch(() => {}); Bus.emit('pm'); });
  },
  disconnect() { this.wallet = null; this.address = null; this.client = null; this.creds = null; this.bal = this.approvals = this.positions = this.orders = this.trades = null; this.save(null); Bus.emit('pm'); },
  async ensureChain() {
    const p = this.wallet.provider; let cid = await p.request({ method: 'eth_chainId' });
    if (cid !== PM_CHAIN_HEX) {
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PM_CHAIN_HEX }] }); }
      catch (e) {
        if (e && (e.code === 4902 || /unrecognized|not been added|unknown chain/i.test(e.message || ''))) await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: PM_CHAIN_HEX, chainName: 'Polygon', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'] }] });
        else throw aerr('CHAIN', this.msg(e));
      }
      cid = await p.request({ method: 'eth_chainId' });
    }
    this.chainOk = cid === PM_CHAIN_HEX; if (!this.chainOk) throw aerr('WRONG_CHAIN', 'Switch your wallet to the Polygon network to trade on Polymarket.');
  },

  /* ---------- clients, credentials, region ---------- */
  async init() {
    if (!this.address || !this.chainOk) return; const L = await this.load();
    this.wc = L.createWalletClient({ account: this.address, chain: L.polygon, transport: L.custom(this.wallet.provider) });
    this.pc = L.createPublicClient({ chain: L.polygon, transport: L.custom(this.wallet.provider) });
    this.contracts = L.getContractConfig(137); this.creds = this.loadCreds(this.address);
    this.client = new L.ClobClient(PM_HOST, 137, this.wc, this.creds || undefined, 0, this.address, undefined, undefined, undefined, undefined, undefined, undefined, true);
    await this.refresh();
  },
  async checkRegion() {
    if (this.geo && now() - this.geo.at < 10 * 60e3) return this.geo;
    try { const r = await Net._fetch('https://polymarket.com/api/geoblock', {}, 8000); const j = await r.json(); this.geo = { at: now(), known: true, blocked: !!j.blocked, country: j.country || '', region: j.region || '' }; }
    catch (e) { this.geo = { at: now(), known: false, blocked: false }; }
    Bus.emit('pm'); return this.geo;
  },
  async enableTrading() {
    const L = await this.load(); const c = new L.ClobClient(PM_HOST, 137, this.wc, undefined, 0, this.address);
    let creds; try { creds = await c.createOrDeriveApiKey(); } catch (e) { throw aerr('PM_AUTH', this.msg(e)); }
    if (!creds || !creds.key) throw aerr('PM_AUTH', 'Polymarket didn’t return trading credentials. ' + this.msg(creds && creds.error));
    this.creds = creds; try { localStorage.setItem(this.credsKey(this.address), JSON.stringify(creds)); } catch (e) {}
    await this.init();
  },
  resetCreds() { try { localStorage.removeItem(this.credsKey(this.address)); } catch (e) {} this.creds = null; this.init().catch(() => {}); },

  /* ---------- balances & approvals (read from Polygon) ---------- */
  spenders() { const c = this.contracts; return [['CTF Exchange', c.exchange], ['Neg-risk Exchange', c.negRiskExchange], ['Neg-risk Adapter', c.negRiskAdapter]]; },
  async refresh() {
    if (!this.pc || !this.address) return; const L = this.lib; const c = this.contracts; const ctfAbi = L.parseAbi(ctfAbiText);
    try {
      const [usdc, pol, ...rest] = await Promise.all([
        this.pc.readContract({ address: c.collateral, abi: L.erc20Abi, functionName: 'balanceOf', args: [this.address] }),
        this.pc.getBalance({ address: this.address }),
        ...this.spenders().map(([, s]) => this.pc.readContract({ address: c.collateral, abi: L.erc20Abi, functionName: 'allowance', args: [this.address, s] })),
        ...this.spenders().map(([, s]) => this.pc.readContract({ address: c.conditionalTokens, abi: ctfAbi, functionName: 'isApprovedForAll', args: [this.address, s] })),
      ]);
      const n = this.spenders().length;
      this.bal = { usdc: Number(L.formatUnits(usdc, 6)), pol: Number(L.formatUnits(pol, 18)), at: now() };
      this.approvals = this.spenders().map(([name, s], i) => ({ name, spender: s, usdc: rest[i] >= 10n ** 12n, ctf: !!rest[n + i] }));
      this.chainErr = null;
    } catch (e) { this.chainErr = this.msg(e); }
    Bus.emit('pm');
  },
  get approved() { return !!(this.approvals && this.approvals.every(a => a.usdc && a.ctf)); },
  get ready() { return !!(this.address && this.chainOk && this.creds && this.approved && !(this.geo && this.geo.blocked)); },
  /** One wallet transaction per missing approval; each is confirmed on Polygon before the next. */
  async approveAll(onStep) {
    const L = this.lib; const c = this.contracts; const ctfAbi = L.parseAbi(ctfAbiText); const todo = [];
    (this.approvals || []).forEach(a => { if (!a.usdc) todo.push({ label: `Allow ${a.name} to use your USDC`, args: { address: c.collateral, abi: L.erc20Abi, functionName: 'approve', args: [a.spender, L.maxUint256] } }); if (!a.ctf) todo.push({ label: `Allow ${a.name} to move your outcome shares`, args: { address: c.conditionalTokens, abi: ctfAbi, functionName: 'setApprovalForAll', args: [a.spender, true] } }); });
    for (let i = 0; i < todo.length; i++) {
      onStep && onStep(i, todo.length, todo[i].label, 'sign');
      let hash; try { hash = await this.wc.writeContract({ ...todo[i].args, account: this.address, chain: L.polygon }); } catch (e) { throw aerr('APPROVE', this.msg(e)); }
      onStep && onStep(i, todo.length, todo[i].label, 'confirm', hash);
      const rc = await this.pc.waitForTransactionReceipt({ hash, timeout: 180000 });
      if (rc.status !== 'success') throw aerr('APPROVE', `The approval transaction failed on Polygon (${shortW(hash)}).`);
    }
    await this.refresh();
    try { await this.client.updateBalanceAllowance({ asset_type: L.AssetType.COLLATERAL }); } catch (e) { /* Polymarket refreshes this on its own too */ }
  },

  /* ---------- account data ---------- */
  async loadAccount() {
    if (!this.address) return; const a = this.address.toLowerCase();
    const [pos, ord, tr] = await Promise.allSettled([
      Net.data(`${PDATA}/positions?user=${a}&sizeThreshold=0.01&limit=100&sortBy=CURRENT&sortDirection=DESC`),
      this.client && this.creds ? this.client.getOpenOrders() : Promise.resolve(null),
      this.client && this.creds ? this.client.getTrades({}, true) : Promise.resolve(null),
    ]);
    this.positions = pos.status === 'fulfilled' && Array.isArray(pos.value) ? pos.value.map(p => ({ asset: String(p.asset), cid: p.conditionId, title: p.title, outcome: p.outcome, idx: +p.outcomeIndex, shares: nz(p.size), avg: nz(p.avgPrice), cur: nz(p.curPrice), value: nz(p.currentValue), pnl: nz(p.cashPnl), redeemable: !!p.redeemable, slug: p.eventSlug || p.slug })).filter(p => p.shares > 0.0001) : (this.positions || []);
    this.orders = ord.status === 'fulfilled' && ord.value ? (Array.isArray(ord.value) ? ord.value : ord.value.data || []) : this.orders;
    this.trades = tr.status === 'fulfilled' && tr.value ? (Array.isArray(tr.value) ? tr.value : tr.value.data || []) : this.trades;
    this.accountErr = ord.status === 'rejected' ? this.msg(ord.reason) : null;
    Bus.emit('pm');
  },
  position(tokenId) { return (this.positions || []).find(p => p.asset === String(tokenId)); },

  /* ---------- orders ---------- */
  async book(tokenId) { const L = await this.load(); const c = this.client || new L.ClobClient(PM_HOST, 137); return c.getOrderBook(tokenId); },
  async quote({ tokenId, side, amount }) { const L = this.lib; return this.client.calculateMarketPrice(tokenId, side === 'BUY' ? L.Side.BUY : L.Side.SELL, amount, L.OrderType.FOK); },
  /** kind: 'market' (FOK; BUY amount in USDC, SELL amount in shares) or 'limit' (GTC; amount in shares at price). */
  async place({ tokenId, side, kind, amount, price, onStep }) {
    const L = this.lib; const S = side === 'BUY' ? L.Side.BUY : L.Side.SELL;
    onStep && onStep('sign');
    let signed; try {
      const [tickSize, negRisk] = await Promise.all([this.client.getTickSize(tokenId), this.client.getNegRisk(tokenId)]);
      signed = kind === 'market' ? await this.client.createMarketOrder({ tokenID: tokenId, amount, side: S }, { tickSize, negRisk }) : await this.client.createOrder({ tokenID: tokenId, price, size: amount, side: S }, { tickSize, negRisk });
    } catch (e) { throw aerr('SIGN', this.msg(e)); }
    onStep && onStep('post');
    let r; try { r = await this.client.postOrder(signed, kind === 'market' ? L.OrderType.FOK : L.OrderType.GTC); } catch (e) { throw aerr('POST', this.msg(e)); }
    if (!r || r.success === false) throw aerr('POST', this.msg(r && (r.errorMsg || r.error)) || 'Polymarket rejected the order.');
    const res = { orderID: r.orderID, status: String(r.status || '').toLowerCase(), hashes: r.transactionsHashes || r.transactionHashes || [], taking: r.takingAmount, making: r.makingAmount };
    if (res.status === 'live' || res.status === 'unmatched') { res.final = 'resting'; this.loadAccount(); return res; }
    onStep && onStep('settle', res.hashes[0]);
    res.final = await this.settle(res);
    this.refresh(); this.loadAccount(); return res;
  },
  /** Waits for the fill to settle on Polygon: the settlement tx receipt, or the trade reaching CONFIRMED. */
  async settle(res) {
    const t0 = now();
    if (res.hashes.length) {
      try { const rc = await this.pc.waitForTransactionReceipt({ hash: res.hashes[0], timeout: 120000 }); res.tx = res.hashes[0]; return rc.status === 'success' ? 'confirmed' : 'failed'; } catch (e) { /* fall through to trade polling */ }
    }
    while (now() - t0 < 120000) {
      try {
        const list = await this.client.getTrades({}, true); const arr = Array.isArray(list) ? list : (list && list.data) || [];
        const t = arr.find(x => x.taker_order_id === res.orderID || (x.maker_orders || []).some(m => m.order_id === res.orderID));
        if (t) { res.tx = t.transaction_hash || res.tx; const st = String(t.status || '').toUpperCase(); if (st === 'CONFIRMED') return 'confirmed'; if (st === 'FAILED') return 'failed'; }
      } catch (e) { /* keep polling */ }
      await delay(3000);
    }
    return 'pending';
  },
  async cancel(orderID) { try { await this.client.cancelOrder({ orderID }); } catch (e) { throw aerr('CANCEL', this.msg(e)); } await this.loadAccount(); },
};
const polygonTx = (h) => `https://polygonscan.com/tx/${h}`;
const polygonAddr = (a) => `https://polygonscan.com/address/${a}`;
