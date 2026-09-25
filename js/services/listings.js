/* =====================================================================
   LISTINGS — every open yes/no market from the public catalogue, traded
   on Panta. A listed market becomes a Panta market the first time
   someone trades it: that trader signs Panta's creation (and pays its
   fee), Nexis records the market in /api/book under
   "<event id>:pm:<market id>" (verified server-side), and everyone after
   trades the same Panta market. Until then prices are estimates.
   ===================================================================== */
const Listings = {
  reg: new Map(), regAt: new Map(), regIds: new Set(), regOk: true,
  key(m) { return `${m.ev}:pm:${String(m.id).replace(/^pm-/, '')}`; },
  /** Listed markets still open for at least 30 more minutes and seen in the latest catalogue. */
  all() {
    const t = now();
    return [...Poly.markets.values()].filter(m => m.listed && !m.game && m.ev && t - (m.seenAt || 0) < 20 * 60e3 && m.end && m.end > t + 30 * 60e3 && m.q && /^yes$/i.test(m.yesLabel) && /^no$/i.test(m.noLabel));
  },
  /** Panta markets by normalized question, so a listing whose market already exists shows that market. */
  _ti: null, _tiKey: '',
  byTitle(q) {
    const key = Panta.loadedAt + ':' + Panta.markets.size;
    if (this._tiKey !== key) { const T = new Map(); Panta.markets.forEach(m => { if (!m.untitled && !m.cancelled && !Panta.isBook(m)) T.set(this.norm(m.title), m); }); this._ti = T; this._tiKey = key; }
    return this._ti.get(this.norm(q)) || null;
  },
  norm: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  /** The Panta market for a listing: registered in /api/book, or a Panta market with the same question. */
  pantaFor(m) {
    const r = this.reg.get(this.key(m)); if (r) return Panta.markets.get(r.marketId) || { id: r.marketId, pending: true };
    return this.byTitle(m.q);
  },
  isMirror(p) { return !!p && (this.regIds.has(p.id) || /Listed on Nexis\.\s*$/.test(p.description || '')); },
  /** Looks up registered Panta markets for these listings (cached 60s), then loads their Panta prices. */
  async lookup(list, force) {
    const keys = [...new Set(list.filter(m => m.ev).map(m => this.key(m)))].filter(k => force || now() - (this.regAt.get(k) || 0) > 60e3);
    if (!keys.length) return; let found = false;
    for (let i = 0; i < keys.length; i += 300) {
      const part = keys.slice(i, i + 300);
      try { const r = await Net.api('book?keys=' + encodeURIComponent(part.join(','))); this.regOk = true; part.forEach(k => { this.regAt.set(k, now()); const v = r.markets && r.markets[k]; if (v) { if (!this.reg.has(k)) found = true; this.reg.set(k, v); this.regIds.add(v.marketId); Panta.rememberTitle(v.marketId, v.question); } }); }
      catch (e) { this.regOk = e.code !== 'NO_STORE'; part.forEach(k => this.regAt.set(k, now())); }
    }
    const ids = [...new Set(keys.map(k => this.reg.get(k)).filter(Boolean).map(v => v.marketId))];
    for (const id of ids.filter(id => !Panta.markets.has(id)).slice(0, 24)) { try { await Panta.detail(id); found = true; } catch (e) { /* shown as a listing */ } }
    Panta.watch(ids);
    if (found) Bus.emit('listings');
  },
  /** Everything Panta's market-creation endpoint needs for a listing. Trading runs until the market's end date. */
  createBody(m) {
    const t = Math.floor(now() / 1000); const end = Math.floor(m.end / 1000); if (!(end > t + 30 * 60)) return null;
    const q = String(m.q || '').trim().slice(0, 512); if (!q) return null;
    const urls = [m.resSrc, ...(String(m.desc || '').match(/https:\/\/[^\s)"'<>\]]+/g) || [])].map(u => String(u || '').replace(/[.,;]+$/, '')).filter(u => /^https:\/\/\S+$/.test(u));
    const sources = [...new Set(urls)].slice(0, 5);
    const desc = String(m.desc || '').trim();
    const rule = (desc || `Resolves YES if the answer to “${q}” is yes by the market’s end date; otherwise NO.`);
    const image = [m.image, m.evImage].find(u => /^https:\/\//.test(u || ''));
    if (!image) return null;
    return {
      question: q, title: q,
      description: `${m.evTitle && this.norm(m.evTitle) !== this.norm(q) ? m.evTitle.trim().replace(/[.?!]?$/, (x) => x || '.') + ' ' : ''}Listed on Nexis.`,
      resolutionRule: rule.length > 2048 ? rule.slice(0, 2045).trimEnd() + '…' : rule,
      sourcesOfTruth: sources.length ? sources : [Poly.url(m)],
      category: PANTA_CATEGORIES.includes(m.cat) ? m.cat : 'other', marketType: 'breaking',
      startTime: t, endTime: end, resolutionTime: end + 6 * 3600, imageUrl: image, region: 'Global',
    };
  },
};
