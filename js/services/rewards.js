/* =====================================================================
   REWARDS SERVICE — launch rollout: member numbers, promotional credits,
   missions, XP, referrals, leaderboards (server: /api/rewards).
   Credits are promotional platform credits: never cash, never withdrawable.
   Without server accounts (browser-only mode) the program runs on clearly
   labelled DEMO data so the experience can be previewed.
   ===================================================================== */
const RW_PHASES = [null, 'Join', 'Credit reveal', 'Community growth', 'Anticipation', 'Credit guide', 'Product activation'];
const RW_DEMO_CFG = {
  phase: 4, memberCap: 10000, memberCount: 7843, countdownAt: Date.now() + 9 * 864e5, brand: 'Nexis', social: { x: '', announcement: '', community: '' },
  uses: [{ id: 'opening_fee', label: 'Market opening fees', desc: 'Cover Panta’s fee when your bet opens a new market.', active: false }, { id: 'markets', label: 'Prediction market trades', desc: 'Put credits toward trades on Nexis markets.', active: false }, { id: 'sportsbook', label: 'Sportsbook bets', desc: 'Use credits on sportsbook bets.', active: false }, { id: 'drops', label: 'Future drops', desc: 'Early access to future Nexis drops.', active: false }],
  missions: [{ id: 'follow_x', title: 'Follow us on X', xp: 25, kind: 'link', url: '' }, { id: 'repost', title: 'Repost the launch announcement', xp: 25, kind: 'link', url: '' }, { id: 'community', title: 'Join the community', xp: 25, kind: 'link', url: '' }, { id: 'share_card', title: 'Share your Member Card', xp: 100, kind: 'share' }, { id: 'invite2', title: 'Invite 2 friends', xp: 100, kind: 'referrals', target: 2 }],
  statuses: [['NEW MEMBER', 0], ['MEMBER', 150], ['BUILDER', 400], ['EARLY OG', 1000], ['FAMILY LEGEND', 2500]], xp: { join: 100, profile: 50, referral: 50 }, milestones: [1, 3, 10, 25, 50, 100],
  guide: { published: false, title: 'How to use your credits' },
};
const Rewards = {
  cfg: null, me: null, isAdmin: false, demo: false, state: 'idle', err: null, lb: null, lbAt: 0,
  get token() { return Auth.mode === 'remote' && typeof RemoteAccounts !== 'undefined' && RemoteAccounts.db ? RemoteAccounts.db.token : null; },
  async call(action, body = {}) { return Net.api('rewards', { method: 'POST', timeout: 20000, body: { action, ...body, ...(this.token ? { token: this.token } : {}) } }); },

  /* ---- waitlist gate: until an admin opens the website, non-admins only see the waitlist site ---- */
  cachedGate() { try { return localStorage.getItem('nexis-gate'); } catch (e) { return null; } },
  cachedAdmin() { try { return !!(Auth.user && localStorage.getItem('nexis-admin') === Auth.user.id); } catch (e) { return false; } },
  remember() { try { if (this.cfg && this.cfg.gate) localStorage.setItem('nexis-gate', this.cfg.gate); if (Auth.user) { if (this.isAdmin) localStorage.setItem('nexis-admin', Auth.user.id); else if (localStorage.getItem('nexis-admin') === Auth.user.id) localStorage.removeItem('nexis-admin'); } } catch (e) { /* storage unavailable */ } },
  gated() {
    if (this.demo) return false; // no rewards server: never lock the site
    const g = this.cfg ? this.cfg.gate : this.cachedGate(); if (!g || g === 'open') return false;
    return !(this.isAdmin || (this.state !== 'ready' && this.cachedAdmin()));
  },
  home() { return this.gated() ? '#/me' : '#/rewards'; },

  /* ---- phase helpers ---- */
  get phase() { return (this.cfg && this.cfg.phase) || 1; },
  get creditsVisible() { return this.phase >= 2; },
  get guidePublished() { return !!(this.cfg && this.cfg.guide && this.cfg.guide.published); },
  get activeUses() { return ((this.cfg && this.cfg.uses) || []).filter(u => u.active); },
  creditState() {
    const m = this.me; if (!m || !m.credits || m.credits.hidden) return { key: 'locked', label: 'Revealed soon', icon: 'lock' };
    if (m.credits.status === 'held') return { key: 'review', label: 'Under review', icon: 'shield' };
    if (m.credits.status === 'none') return { key: 'none', label: 'No launch credits', icon: 'info' };
    if (this.phase >= 6 && this.activeUses.length) return { key: 'available', label: 'Available', icon: 'check' };
    if (this.phase >= 5) return { key: 'guide', label: 'Guide available', icon: 'info' };
    return { key: 'soon', label: 'Guide coming soon', icon: 'lock' };
  },

  /* ---- referral code (/join?ref=2847) and device id (anti-abuse signal) ---- */
  captureRef() {
    let ref = null;
    try { if (location.pathname.replace(/\/+$/, '') === '/join') { ref = new URLSearchParams(location.search).get('ref'); history.replaceState(null, '', '/#/join' + (ref ? '?ref=' + encodeURIComponent(ref) : '')); } } catch (e) { /* ignore */ }
    const h = location.hash.match(/^#\/join\?(.*)$/); if (h) ref = new URLSearchParams(h[1]).get('ref') || ref;
    if (ref && /^\d{1,7}$/.test(ref)) { try { localStorage.setItem('nexis-ref', JSON.stringify({ n: +ref, t: Date.now() })); } catch (e) { /* storage unavailable */ } }
  },
  refCode() { try { const r = JSON.parse(localStorage.getItem('nexis-ref') || 'null'); return r && Date.now() - r.t < 30 * 864e5 ? r.n : null; } catch (e) { return null; } },
  devId() {
    let id = null; try { id = localStorage.getItem('nexis-dev'); if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('nexis-dev', id); } } catch (e) { id = 'nostore'; }
    const fp = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency || ''].join('|');
    return id + '|' + fp;
  },

  /* ---- loading ---- */
  async loadConfig() {
    try { const r = await this.call('config'); this.cfg = r.config; this.demo = false; this.err = null; }
    catch (e) { if (['REWARDS_UNAVAILABLE', 'NO_API'].includes(e.code) || e.status === 404) { this.demo = true; this.cfg = { ...RW_DEMO_CFG }; } else this.err = e; }
    this.remember(); Bus.emit('rewards'); return this.cfg;
  },
  sync() { if (!this._sync) this._sync = this._doSync().finally(() => { this._sync = null; }); return this._sync; },
  async _doSync() {
    if (!Auth.user) { this.me = null; this.isAdmin = false; Bus.emit('rewards'); return null; }
    if (!this.cfg) await this.loadConfig();
    if (this.demo || !this.token) { this.demo = true; if (!this.cfg || !this.cfg.memberCount) this.cfg = { ...RW_DEMO_CFG }; this.me = this.demoMember(); Bus.emit('rewards'); return this.me; }
    this.state = 'loading';
    try {
      const r = await this.call('me', { ref: this.refCode(), dev: this.devId() });
      this.me = r.member; this.cfg = r.config; this.isAdmin = !!r.isAdmin; this.state = 'ready'; this.err = null; this.remember();
      if (r.fresh) { try { localStorage.removeItem('nexis-ref'); } catch (e) { /* ignore */ } }
    } catch (e) { this.state = 'error'; this.err = e; }
    Bus.emit('rewards'); this.maybeReveal(); return this.me;
  },
  async act(action, body) {
    if (this.demo) return this.demoAct(action, body);
    const r = await this.call(action, body); if (r.member) this.me = r.member; if (r.config) this.cfg = r.config; Bus.emit('rewards'); return r;
  },
  async leaderboard(force) {
    if (!force && this.lb && Date.now() - this.lbAt < 20e3) return this.lb;
    if (this.demo || !this.cfg) { this.lb = this.demoLeaderboard(); this.lbAt = Date.now(); return this.lb; }
    try { this.lb = await this.call('leaderboard'); this.lbAt = Date.now(); } catch (e) { if (!this.lb) throw e; }
    return this.lb;
  },

  /* ---- reveal flow (member number → credits → guide) ---- */
  maybeReveal() {
    if (this._revealing && !$('.rw-reveal')) { this._revealing = false; UI.rwRevealDone = null; } // the reveal was replaced by another dialog
    const m = this.me; if (!m || this.demo || this._revealing || ['login', 'signup', 'onboarding', 'forgot', 'welcome', 'xdone'].includes(current.route) || (current.route === '' && !this.gated())) return;
    const needNumber = !m.revealed, needCredits = this.creditsVisible && (m.revealedPhase || 0) < 2 && m.credits && !m.credits.hidden;
    if (needNumber || needCredits) { this._revealing = true; setTimeout(() => rwReveal(needNumber ? 'number' : 'credits'), 500); }
  },

  /* ---- demo mode (no rewards server): local, clearly labelled ---- */
  demoMember() {
    const u = Auth.user; let st; try { st = JSON.parse(localStorage.getItem('nexis-rw-demo:' + u.id) || 'null'); } catch (e) { st = null; }
    if (!st) { let h = 0; for (const c of u.id) h = (h * 31 + c.charCodeAt(0)) >>> 0; const amounts = [5, 10, 10, 25, 25, 37, 50, 100]; st = { n: 1000 + (h % 8000), amount: amounts[h % amounts.length], missions: {}, shared: false, revealed: false, revealedPhase: 0, joinedAt: Date.now() }; }
    this._demo = st; this.demoSave();
    const xpLog = [{ k: 'join', xp: 100, label: 'Joined' }, ...(u.name && u.bio ? [{ k: 'profile', xp: 50, label: 'Completed profile' }] : []), ...Object.keys(st.missions).map(id => { const ms = this.cfg.missions.find(x => x.id === id) || {}; return { k: 'mission:' + id, xp: ms.xp || 0, label: ms.title || id }; })];
    const xp = xpLog.reduce((s, e) => s + e.xp, 0);
    return { demo: true, n: st.n, handle: u.handle, joinedAt: st.joinedAt, early: true, revealed: st.revealed, revealedPhase: st.revealedPhase, credits: this.creditsVisible ? { amount: st.amount, status: 'granted', ledger: [] } : { hidden: true }, xp, status: rwStatusOf(xp), xpLog, missions: st.missions, refs: { qualified: 0, pending: 0, review: 0 }, rank: { refs: null, xp: null, early: null, total: this.cfg.memberCount }, underReview: false };
  },
  demoSave() { try { localStorage.setItem('nexis-rw-demo:' + Auth.user.id, JSON.stringify(this._demo)); } catch (e) { /* ignore */ } },
  demoAct(action, body) {
    const st = this._demo; if (!st) return {};
    if (action === 'reveal') { st.revealed = true; st.revealedPhase = this.phase; }
    if (action === 'mission') st.missions[body.id] = Date.now();
    if (action === 'shared') { const ms = this.cfg.missions.find(x => x.kind === 'share'); if (ms) st.missions[ms.id] = Date.now(); }
    this.demoSave(); this.me = this.demoMember(); Bus.emit('rewards'); return { member: this.me };
  },
  demoLeaderboard() {
    const names = ['satoshi_fan', 'degenqueen', 'onchainchris', 'sol_maxi', 'predict0r', 'yesnoyes', 'alpha_ana', 'marketmole', 'oddsoracle', 'panther', 'kickoff_kid', 'bullbear', 'ccrypto', 'nightowl', 'lucky7'];
    const rows = names.map((h, i) => ({ n: 1000 + i * 37, h, r: Math.max(0, 127 - i * 9), x: 2400 - i * 140 }));
    return { demo: true, at: Date.now(), total: (this.cfg && this.cfg.memberCount) || 0, top: { refs: rows, xp: rows.slice().sort((a, b) => b.x - a.x), early: rows.slice().sort((a, b) => a.n - b.n) }, you: null };
  },
};
function rwStatusOf(xp) {
  const S = (Rewards.cfg && Rewards.cfg.statuses) || RW_DEMO_CFG.statuses; let cur = S[0], next = null;
  for (const s of S) { if (xp >= s[1]) cur = s; else { next = s; break; } }
  return { name: cur[0], at: cur[1], next: next ? { name: next[0], at: next[1] } : null };
}
/* Countdown tickers: any element with data-rwcd="<ms timestamp>". */
setInterval(() => { $$('[data-rwcd]').forEach(el => { const ms = +el.dataset.rwcd - Date.now(); el.textContent = rwCountdownText(ms); }); }, 1000);
function rwCountdownText(ms) { if (ms <= 0) return 'Any moment now'; const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60; return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`; }
