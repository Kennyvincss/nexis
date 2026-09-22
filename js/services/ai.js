/* =====================================================================
   AI SERVICE
   Uses /api/ai (Claude, ANTHROPIC_API_KEY) when configured, or the page's
   own Claude connection when Nexis runs inside Claude. Drafting a market
   falls back to a deterministic on-device parser; factor analysis has no
   fallback and shows "unavailable" instead of inventing text.
   ===================================================================== */
let sampleFn = null;
const AI = {
  get server() { return !!(Config.c && Config.c.ai && Config.c.ai.configured); },
  get available() { return this.server || !!sampleFn; },
  label() { return this.server ? 'Nexis AI (Claude)' : sampleFn ? 'Claude in this page' : 'On-device parser'; },
  async run(task, payload, schemaHint) {
    if (this.server) { const r = await Net.api('ai', { method: 'POST', body: { task, ...payload }, timeout: 60000 }); Feeds.set('ai', 'live'); return r; }
    if (sampleFn) return sampleFn.json(schemaHint, { modelTier: 'quick' });
    throw Object.assign(new Error('Nexis AI isn’t configured. Add ANTHROPIC_API_KEY on the server.'), { code: 'AI_NOT_CONFIGURED' });
  },
  async extract(text) {
    const local = this.parseLocal(text);
    if (!this.available) return { ...local, engine: 'local' };
    try {
      const r = await this.run('extract', { text }, `Convert this post into a binary prediction market. Today is ${fmtDateLong(now())}. Post: """${text.slice(0, 1000)}""" Return ONLY JSON {"isPrediction":bool,"question":"Will ...?","category":"sports|crypto|politics|entertainment|finance|science|world|other","deadlineISO":"YYYY-MM-DD","resolutionSource":"...","resolutionRule":"...","confidence":0-100,"assumption":""}`);
      const end = r.deadlineISO ? Date.parse(r.deadlineISO + 'T23:59:00Z') : local.end;
      return { isPrediction: r.isPrediction !== false, question: r.question || local.question, category: PANTA_CATEGORIES.includes(r.category) ? r.category : local.category, end: end > now() ? end : local.end, source: r.resolutionSource || local.source, rule: r.resolutionRule || local.rule, confidence: clamp(Math.round(nz(r.confidence, local.confidence)), 1, 99), assumption: r.assumption || '', engine: 'ai' };
    } catch (e) { return { ...local, engine: 'local', aiError: e.message }; }
  },
  async analyze(m) {
    const r = await this.run('analyze', { market: { title: m.title || m.q, yesPrice: m.yes != null ? Math.round(m.yes * 100) + '¢' : null, rule: m.rule || m.description } }, `Neutral analysis of the prediction market "${m.title || m.q}". Return ONLY JSON {"yes":[{"title":"","detail":""}],"no":[{"title":"","detail":""}],"summary":""} with 3 factors per side. Never recommend a side.`);
    return { yes: (r.yes || []).slice(0, 4), no: (r.no || []).slice(0, 4), summary: r.summary || '', at: now(), engine: this.label() };
  },
  /** Deterministic parser: finds an asset/price/deadline or a "X will Y" claim. No invented data. */
  parseLocal(raw) {
    const text = String(raw || '').trim(); const t = text.replace(/[“”]/g, '"');
    const ASSETS = { btc: 'BTC', bitcoin: 'BTC', eth: 'ETH', ethereum: 'ETH', sol: 'SOL', solana: 'SOL', xrp: 'XRP', bnb: 'BNB', doge: 'DOGE', ada: 'ADA', avax: 'AVAX', link: 'LINK', sui: 'SUI', jup: 'JUP', bonk: 'BONK', wif: 'WIF' };
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    let asset = null; for (const k of Object.keys(ASSETS)) { if (new RegExp('(^|[^a-z$])\\$?' + k + '(?![a-z])', 'i').test(t)) { asset = ASSETS[k]; break; } }
    let price = null; const pm = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|b)?\b/i.exec(t) || /\b(\d+(?:\.\d+)?)\s*(k|m)\b/i.exec(t);
    if (pm) { price = parseFloat(pm[1].replace(/,/g, '')); const u = (pm[2] || '').toLowerCase(); price *= u === 'k' ? 1e3 : u === 'm' ? 1e6 : u === 'b' ? 1e9 : 1; }
    const down = /(drop|fall|dump|crash|below|under)/i.test(t);
    let end = null, assumption = '', matched = false; const y = new Date().getUTCFullYear();
    const mb = /(before|by|until|end of)\s+(?:the\s+)?(?:end of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{1,2}))?/i.exec(t);
    if (mb) { matched = true; const mi = MONTHS.indexOf(mb[2].toLowerCase()); const endOf = /end of/i.test(mb[0]) || mi === 11; let yr = y; end = endOf ? Date.UTC(yr, mi + 1, 0, 23, 59) : Date.UTC(yr, mi, mb[3] ? +mb[3] : 1); if (end < now()) { yr++; end = endOf ? Date.UTC(yr, mi + 1, 0, 23, 59) : Date.UTC(yr, mi, mb[3] ? +mb[3] : 1); } if (mi === 11 && !/end of/i.test(mb[0])) assumption = '“Before December” read as by December 31.'; }
    else if (/this year|end of (the )?year|eoy/i.test(t)) { matched = true; end = Date.UTC(y, 11, 31, 23, 59); }
    else if (/next week/i.test(t)) { matched = true; end = now() + 9 * DAY; } else if (/this week/i.test(t)) { matched = true; end = now() + 5 * DAY; } else if (/tonight|today/i.test(t)) { matched = true; end = now() + 12 * HOUR; }
    if (!end) { end = now() + 30 * DAY; assumption = 'No deadline found — set one.'; }
    const dl = fmtDate(end, { month: 'long', day: 'numeric', year: 'numeric' }); const predictive = /(will|gonna|going to|calling it|hit|reach|flip|win|pass|break|before|by)/i.test(t);
    let question, category, source, rule, confidence;
    if (asset && price) { category = 'crypto'; const ps = '$' + price.toLocaleString('en-US'); question = `Will ${asset} ${down ? 'fall below' : 'reach'} ${ps} before ${dl}?`; source = `${asset}/USD spot price (CoinGecko or Coinbase)`; rule = `Resolves YES if the ${asset}/USD spot price trades ${down ? 'at or below' : 'at or above'} ${ps} at any time before ${dl} (UTC), per the named source. Otherwise NO.`; confidence = 70 + (matched ? 15 : 0); }
    else if (/\bwin(s)?\b/i.test(t)) { category = 'sports'; const sm = /([A-Z][\w.&' ]{1,30}?)\s+(?:will|gonna|to)?\s*win/i.exec(t); const team = sm ? sm[1].trim() : 'The team'; question = `Will ${team} win ${/tonight/i.test(t) ? 'tonight' : 'their next match'}?`; source = 'Official match result (league website)'; rule = `Resolves YES if ${team} win according to the official result. A draw, loss or cancellation resolves NO.`; confidence = 55 + (sm ? 15 : 0); }
    else { category = /(fed|rate|inflation|stock|market cap)/i.test(t) ? 'finance' : /(election|president|senate|law|court)/i.test(t) ? 'politics' : /(movie|album|trailer|show|oscar)/i.test(t) ? 'entertainment' : 'other'; const wm = /^(.+?)\s+will\s+(.+?)(?:\s+(?:before|by)\s+.+)?[.!]*$/i.exec(t.replace(/^(i think|calling it[:,]?|imo[:,]?)\s*/i, '')); question = wm ? `Will ${wm[1]} ${wm[2]} before ${dl}?` : ''; source = ''; rule = ''; confidence = wm ? 50 : 20; }
    if (!predictive) confidence = Math.min(confidence, 25);
    return { isPrediction: predictive && confidence >= 30 && !!question, question, category, end, source, rule, confidence, assumption, engine: 'local' };
  },
};
