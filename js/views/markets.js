/* =====================================================================
   MARKET VIEWS — Markets, market detail, trading, create market, portfolio
   Panta markets are tradable (your wallet signs). Polymarket markets are
   shown as read-only reference data with a link out.
   ===================================================================== */
const catLabel = (c) => PANTA_CAT_LABEL[c] || (c ? c[0].toUpperCase() + c.slice(1) : 'Other');
const phaseTag = (m) => m.cancelled ? '<span class="tag red">Cancelled</span>' : m.resolved ? `<span class="tag ${m.outcome === 'YES' ? 'green' : m.outcome === 'NO' ? 'red' : ''}">Resolved${m.outcome ? ' ' + m.outcome : ''}</span>` : m.phase === 'secondary' ? '<span class="tag purple">Secondary</span>' : m.phase === 'primary' ? '<span class="tag blue">Primary</span>' : m.status ? `<span class="tag">${esc(m.status)}</span>` : '';
const endsLabel = (m) => m.end ? (m.end > now() ? timeLeft(m.end) + ' left' : 'Trading ended') : '—';
function srcBadge(k, compact) { const L = { panta: ['Panta', Feeds.live('panta')], poly: ['Polymarket · view only', Feeds.live('polymarket')], pmtrade: ['Polymarket', Feeds.live('polymarket')], espn: ['ESPN', Feeds.live('sports')], coingecko: ['CoinGecko', Feeds.live('crypto')], coinbase: ['Coinbase', true], chain: ['Solana', Feeds.live('chain')] }[k] || [k, false]; return `<span class="src ${L[1] ? 'live' : 'stale'} ${compact ? 'sm' : ''}">${L[1] ? '<i></i>' : ''}${L[1] ? 'LIVE · ' : ''}${esc(L[0])}</span>`; }
function pantaModeBanner() {
  if (Panta.mode === 'test') return `<div class="sim-note" style="margin-bottom:14px">${ic('alert', 'sm')}<span><b>Panta test mode.</b> This server uses a <code>pk_test_</code> key, so Panta returns its sandbox fixtures, not mainnet markets. Trades can’t be signed in test mode. Use a <code>pk_live_</code> key for real markets.</span></div>`;
  return '';
}
function pantaState(what = 'Panta markets') {
  if (Panta.state === 'unconfigured' || Panta.mode === 'unconfigured' && Panta.error && Panta.error.code === 'PANTA_NOT_CONFIGURED') return unavailable('Connect the Panta API', `Nexis reads and trades ${what} through Panta. The site owner needs to add <code>PANTA_API_KEY</code> (from docs.panta.market) in your host’s environment variables (Netlify: Site configuration → Environment variables; Vercel: Settings → Environment Variables) and redeploy.`, '<a class="btn btn-ghost sm" href="#/settings?tab=integrations">Integration status</a>');
  if (Panta.error && Panta.error.code === 'NO_API') return unavailable('Live data unavailable here', 'This copy of Nexis isn’t running on its server, so it can’t reach Panta. Open the deployed site to trade.');
  if (Panta.state === 'error') return unavailable('Panta is unreachable', esc(Panta.error ? Panta.error.message : 'Try again shortly.') + ' Nexis retries automatically.', '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>');
  return null;
}
function pantaCard(m) {
  const ended = !m.tradable;
  return `<article class="mcard">
    <div class="mcard-top"><span class="tag">${esc(catLabel(m.category))}</span>${phaseTag(m)}${m.type === 'breaking' ? '<span class="tag amber">Breaking</span>' : ''}<span class="time">${ic('clock', 'sm')}${esc(endsLabel(m))}</span></div>
    ${m.untitled && m.image ? `<a href="#/market/${m.id}" class="mcard-img" aria-label="Open market"><img src="${esc(m.image)}" alt="Market image from Panta" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : ''}
    <h3><a href="#/market/${m.id}" ${m.untitled ? 'class="mut" title="Panta hasn’t published this market’s question yet"' : ''}>${esc(m.title)}</a></h3>
    <div class="mcard-mid"><div><div class="prob-big" data-ppct="${m.id}">${m.yes != null ? Math.round(m.yes * 100) + '%' : '—'}</div><div class="prob-lbl">${m.yes != null ? 'chance' : 'Loading price…'}</div></div>${Panta.hist(m.id).length > 2 ? sparkSvg(Panta.hist(m.id).map(x => x[1]).slice(-48)) : ''}</div>
    <div class="yn"><button class="btn btn-yes" data-action="quickTrade" data-id="${m.id}" data-side="YES" ${ended ? 'disabled' : ''}><span>Yes</span><span data-py="${m.id}">${m.yes != null ? cents(m.yes) : '—'}</span></button><button class="btn btn-no" data-action="quickTrade" data-id="${m.id}" data-side="NO" ${ended ? 'disabled' : ''}><span>No</span><span data-pn="${m.id}">${m.no != null ? cents(m.no) : '—'}</span></button></div>
    <div class="mcard-foot"><span><b data-pvol="${m.id}">${m.volume != null ? kusd(m.volume) : '—'}</b> vol</span>${srcBadge('panta', true)}</div>
  </article>`;
}
function polyCard(m) {
  return `<article class="mcard"><div class="mcard-top"><span class="tag">${esc(catLabel(m.cat))}</span>${srcBadge('poly', true)}<span class="time">${m.end ? ic('clock', 'sm') + timeLeft(m.end) : ''}</span></div>
    <h3><a href="#/market/${m.id}">${esc(m.q)}</a></h3>
    <div class="mcard-mid"><div><div class="prob-big" data-lpct="${m.id}">${Math.round(m.yes * 100)}%</div><div class="prob-lbl">${esc(m.yesLabel)} · ${chgHtml(m.chg * 100)}</div></div></div>
    <div class="mcard-foot"><span><b>${kusd(m.vol)}</b> vol</span><span><b>${kusd(m.liq)}</b> liq</span><a class="link" style="margin-left:auto;position:relative;z-index:2" href="${Poly.url(m)}" target="_blank" rel="noopener">Polymarket ${ic('ext', 'sm')}</a></div></article>`;
}
function pantaList({ cat = 'all', q = '', sort = 'volume', status = 'all' } = {}) {
  let l = Panta.order.map(id => Panta.markets.get(id)).filter(Boolean).filter(m => !m.cancelled);
  if (status === 'open') l = l.filter(m => m.tradable); else if (status === 'closed') l = l.filter(m => !m.tradable);
  if (cat !== 'all') l = l.filter(m => m.category === cat);
  if (q) { const s = q.toLowerCase(); l = l.filter(m => (m.title + ' ' + m.description + ' ' + m.category).toLowerCase().includes(s)); }
  const k = { volume: (m) => -(m.volume || 0), ending: (m) => m.tradable ? (m.end || 9e15) : 9e15 + 1, newest: (m) => -(m.start || 0), prob: (m) => -(m.yes ?? -1) }[sort] || (() => 0);
  return l.sort((a, b) => (a.tradable === b.tradable ? 0 : a.tradable ? -1 : 1) || (!!a.untitled - !!b.untitled) || k(a) - k(b));
}

/* ---------------- MARKETS ---------------- */
Views.markets = async (params) => {
  const st = UI.markets; if (params.get('cat')) st.cat = params.get('cat'); if (params.get('src')) st.src = params.get('src');
  if (st.src === 'poly') {
    let list = [...Poly.markets.values()]; if (st.cat !== 'all') list = list.filter(m => m.cat === st.cat); if (st.q) list = list.filter(m => m.q.toLowerCase().includes(st.q.toLowerCase()));
    list.sort((a, b) => b.vol24 - a.vol24);
    return marketsFrame(st, list.length ? `<div class="grid gauto">${list.map(polyCard).join('')}</div>` : Poly.state === 'offline' ? unavailable('Polymarket data unavailable', 'Nexis couldn’t reach Polymarket. It retries automatically.') : skeletonCards(6), list.length, 'Reference markets from Polymarket. Prices stream live; trade them on Polymarket.');
  }
  const blocked = pantaState(); if (blocked && !Panta.markets.size) return marketsFrame(st, blocked, 0);
  if (Panta.state === 'idle' || (!Panta.loadedAt && !Panta.markets.size)) return marketsFrame(st, skeletonCards(6), 0);
  st.status = st.status || 'open'; const list = pantaList(st); Panta.watch(list.slice(0, 24).map(m => m.id));
  const nOpen = pantaList({ ...st, status: 'open' }).length, nClosed = pantaList({ ...st, status: 'closed' }).length;
  const statusSeg = `<div class="seg text" style="margin-bottom:14px">${[['open', `Open · ${nOpen}`], ['closed', `Closed · ${nClosed}`]].map(([k, l]) => `<button class="${st.status === k ? 'on' : ''}" data-action="mStatus" data-s="${k}">${l}</button>`).join('')}</div>`;
  return marketsFrame(st, statusSeg + (list.length ? `<div class="grid gauto">${list.map(pantaCard).join('')}</div>` : emptyState({ title: st.status === 'open' ? 'No open markets match' : 'No closed markets match', body: st.q ? `Nothing on Panta matches “${esc(st.q)}”.` : st.status === 'open' ? 'No Panta markets are open for trading in this category right now.' : 'No closed or resolved markets in this category.', cta: st.status === 'open' ? '<a class="btn btn-primary sm" href="#/create">Create a market</a>' : '' })), list.length, 'Live Panta markets. Trade with your Solana wallet; settlement in USDC.');
};
function marketsFrame(st, inner, n, note = '') {
  const cats = ['all', ...(st.src === 'poly' ? ['crypto', 'sports', 'politics', 'finance', 'entertainment', 'world', 'science', 'other'] : Panta.categories)];
  return `<div class="page">${pantaModeBanner()}
    <div class="page-head"><div><h1>Markets</h1><p>${note}</p></div><div class="row"><div class="seg text">${[['panta', 'Panta'], ['poly', 'Polymarket']].map(([k, l]) => `<button class="${st.src === k ? 'on' : ''}" data-action="mSrc" data-src="${k}">${l}</button>`).join('')}</div><a class="btn btn-ghost" href="#/create">${ic('plus', 'sm')}Create market</a></div></div>
    <div class="row wrap" style="gap:10px;margin-bottom:14px"><label class="search-trigger" style="max-width:none;flex:1;min-width:220px;cursor:text">${ic('search', 'sm')}<input id="mk-q" value="${esc(st.q)}" placeholder="Search markets" style="background:none;border:0;outline:none;flex:1;height:100%;color:var(--text)" aria-label="Search markets"></label>${st.src === 'panta' ? `<label class="row" style="gap:8px"><span class="mut" style="font-size:13px">Sort</span><select class="select" id="mk-sort" style="width:auto;height:38px;padding:0 10px">${[['volume', 'Volume'], ['ending', 'Ending soon'], ['newest', 'Newest'], ['prob', 'Highest YES']].map(([k, l]) => `<option value="${k}" ${k === st.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
    <div class="row wrap" style="gap:8px;margin-bottom:18px">${cats.map(c => `<button class="chip ${c === st.cat ? 'on' : ''}" data-action="mCat" data-cat="${c}">${c === 'all' ? 'All' : esc(catLabel(c))}</button>`).join('')}</div>
    ${n ? `<div class="mut" style="font-size:12.5px;margin-bottom:12px">${n} market${n === 1 ? '' : 's'}</div>` : ''}${inner}</div>`;
}

/* ---------------- MARKET DETAIL ---------------- */
Views.market = async (params, id) => (id || '').startsWith('pm-') ? polyMarketView(id) : pantaMarketView(id, params);
async function pantaMarketView(id, params) {
  const blocked = pantaState('this market'); if (blocked && !Panta.markets.has(id)) return `<div class="page">${blocked}</div>`;
  let m = Panta.markets.get(id);
  try { m = await Panta.detail(id); } catch (e) { if (!m) throw e; }
  Panta.watch([id]); const tr = UI.trade[id] = UI.trade[id] || { side: params.get('side') || 'YES', amt: params.get('amt') || '10' };
  if (params.get('side')) { tr.side = params.get('side'); tr.amt = params.get('amt') || tr.amt; }
  const h = Panta.hist(id);
  return `<div class="page">${pantaModeBanner()}
    <a class="link" href="#/markets">${ic('chevLeft', 'sm')}Markets</a>
    <div class="mkt-layout" style="margin-top:12px"><div style="min-width:0">
      <div class="mkt-head">${m.image ? `<img class="mkt-img" src="${esc(m.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="mkt-icon">${esc(catLabel(m.category).slice(0, 3).toUpperCase())}</span>`}<div style="min-width:0"><h1>${esc(m.title)}</h1>
        <div class="mkt-meta"><span class="tag">${esc(catLabel(m.category))}</span>${phaseTag(m)}${m.type === 'breaking' ? '<span class="tag amber">Breaking</span>' : ''}<span>${ic('clock', 'sm')}${esc(endsLabel(m))}</span>${srcBadge('panta')}</div></div></div>
      <div class="price-row">
        <div><div class="lbl">YES</div><div class="big up" data-py="${id}">${m.yes != null ? cents(m.yes) : '—'}</div></div>
        <div><div class="lbl">NO</div><div class="big down" data-pn="${id}">${m.no != null ? cents(m.no) : '—'}</div></div>
        <div><div class="lbl">Implied probability</div><div class="num" style="font-size:20px" data-ppct="${id}">${m.yes != null ? Math.round(m.yes * 100) + '%' : '—'}</div></div>
        <div class="mut" style="font-size:12px;margin-left:auto">${m.pricedAt ? `Updated <span data-pat="${id}">${agoT(m.pricedAt)}</span>` : 'Price not published yet'}</div>
      </div>
      ${h.length >= 2 ? `<div class="chart-box" data-chart="panta" data-id="${id}"></div><p class="mut" style="font-size:11.5px;margin-top:4px">Prices recorded by Nexis from Panta since ${fmtDate(h[0][0], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Panta doesn’t publish price history.</p>` : `<div class="card card-pad" style="margin-top:8px"><p class="mut" style="font-size:13px">${ic('chart', 'sm')} Panta doesn’t publish price history. Nexis records prices while markets are open here — the chart appears once prices change.</p></div>`}
      <div class="card" style="margin-top:20px"><div class="info-grid">
        <div><div class="k">Volume</div><div class="v" data-pvolf="${id}">${m.volume != null ? usd(m.volume, 0) : '—'}</div></div>
        <div><div class="k">Phase</div><div class="v">${esc(m.phase || m.status || '—')}</div></div>
        <div><div class="k">Trading ends</div><div class="v">${m.end ? fmtDate(m.end, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</div></div>
        <div><div class="k">Resolution</div><div class="v">${m.resolveAt ? fmtDate(m.resolveAt, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div></div>
        ${m.primaryYes != null && m.secondaryYes != null ? `<div><div class="k">Primary YES</div><div class="v">${cents(m.primaryYes)}</div></div><div><div class="k">Secondary YES</div><div class="v">${cents(m.secondaryYes)}</div></div>` : ''}
        <div><div class="k">Region</div><div class="v">${esc(m.region || 'Global')}</div></div>
        <div><div class="k">Market ID</div><div class="v" style="font-size:12px"><button class="link" data-action="copyAddr" data-a="${esc(id)}" style="display:inline-flex">${esc(shortW(id))} ${ic('copy', 'sm')}</button></div></div>
      </div>
      <div class="rules"><div><h4>Description</h4><p>${esc(m.description || m.title)}</p></div><div><h4>Resolution</h4><p>${m.rule ? esc(m.rule) : 'Resolved by Panta’s Resolution Agent against the market’s declared source of truth, with a dispute window.'}${m.sources.length ? `<br><span class="mut">Sources: ${m.sources.map(esc).join(', ')}</span>` : ''}</p></div></div>
      <p class="mut" style="font-size:11.5px;padding:0 18px 14px">Liquidity and open interest aren’t published by the Panta API.</p></div>
      ${aiPanel(m)}
    </div>
    <aside>
      <div class="card card-pad trade-panel stack" style="gap:14px" id="trade-panel">${tradePanel(m, tr)}</div>
      <div class="card" style="margin-top:14px" id="my-pos"></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Recent trades</h3>${srcBadge('panta', true)}</div><div id="pt-trades" data-mid="${id}"><p class="mut" style="padding:14px 18px;font-size:13px">Loading trades…</p></div></div>
    </aside></div></div>`;
}
function tradePanel(m, tr) {
  const blocked = !m.tradable ? (m.resolved ? `Resolved${m.outcome ? ' ' + m.outcome : ''} — trading closed` : m.cancelled ? 'Market cancelled' : m.phase === 'secondary' ? 'This market is in its secondary (order-book) phase. Panta’s API currently supports primary-phase buys only.' : 'Trading has ended') : null;
  const px = tr.side === 'YES' ? m.yes : m.no; const amt = nz(tr.amt, 0);
  return `<div class="row"><h3 style="font-size:15px">Trade</h3><span class="mut" style="margin-left:auto;font-size:12px">USDC · signed by your wallet</span></div>
    <div class="side-toggle"><button class="btn btn-yes ${tr.side === 'YES' ? 'on' : ''}" data-action="side" data-id="${m.id}" data-side="YES"><span>Buy YES</span><b data-py="${m.id}">${m.yes != null ? cents(m.yes) : '—'}</b></button><button class="btn btn-no ${tr.side === 'NO' ? 'on' : ''}" data-action="side" data-id="${m.id}" data-side="NO"><span>Buy NO</span><b data-pn="${m.id}">${m.no != null ? cents(m.no) : '—'}</b></button></div>
    <label class="field"><span>Amount (USDC)</span><div class="input-affix"><input class="input" data-amt="${m.id}" inputmode="decimal" value="${esc(tr.amt)}" aria-label="Amount in USDC"></div></label>
    <div class="presets">${[5, 10, 25, 50, 100].map(v => `<button data-action="preset" data-id="${m.id}" data-v="${v}">$${v}</button>`).join('')}${Balances.v ? `<button data-action="preset" data-id="${m.id}" data-v="max">Max</button>` : ''}</div>
    <div class="est"><div><span>Current ${tr.side} price</span><span>${px != null ? cents(px) : '—'}</span></div><div><span>Indicative shares</span><span>${px ? (amt / px).toFixed(2) : '—'}</span></div><div><span>USDC balance</span><span data-usdc>${Balances.v ? fmtNum(Balances.v.usdc, 2) : primaryWallet() ? '…' : 'No wallet'}</span></div></div>
    ${blocked ? `<div class="sim-note">${ic('info', 'sm')}<span>${esc(blocked)}</span></div>` : `<button class="btn ${tr.side === 'YES' ? 'btn-yes on' : 'btn-no on'} lg block" data-action="reviewOrder" data-id="${m.id}">Review ${tr.side} order</button>`}
    <p class="mut" style="font-size:11.5px;line-height:1.45">Panta quotes the exact shares and fee before you sign. Each share pays $1 if the outcome is ${tr.side}. Quotes last ~90 seconds.</p>`;
}
function aiPanel(m) {
  const a = UI.ai && UI.ai[m.id];
  return `<div class="ai-panel" style="margin-top:20px"><div class="ai-head"><span class="ai-mark">${ic('spark', 'sm')}</span><h3>NEXIS AI ANALYSIS</h3>${a ? `<span class="tag dashed">${esc(a.engine)} · ${agoT(a.at)}</span>` : ''}<div class="spacer"></div>${AI.available ? `<button class="btn btn-ghost sm" data-action="aiAnalyze" data-id="${m.id}">${ic('refresh', 'sm')}${a ? 'Refresh' : 'Analyze'}</button>` : ''}</div>
    ${a ? `<div class="ai-cols"><div class="ai-col"><h4><i style="background:var(--green)"></i>Factors supporting YES</h4>${a.yes.map(f => `<div class="factor"><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div>`).join('')}</div><div class="ai-col"><h4><i style="background:var(--red)"></i>Factors supporting NO</h4>${a.no.map(f => `<div class="factor"><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div>`).join('')}</div></div>${a.summary ? `<p class="dim" style="padding:0 18px 14px;font-size:13px">${esc(a.summary)}</p>` : ''}`
      : `<p class="mut" style="padding:14px 18px;font-size:13px">${AI.available ? 'Generate a balanced list of factors for each side. The AI has no live data and never recommends a side.' : 'Nexis AI isn’t configured on this server (ANTHROPIC_API_KEY).'}</p>`}
    <div class="ai-foot">${ic('info', 'sm')}Informational only — not a prediction or recommendation.</div></div>`;
}
async function paintPantaTrades(id) {
  const box = $('#pt-trades'); if (!box || box.dataset.mid !== id) return;
  try { const list = await PantaTape.load(id); box.innerHTML = list.length ? `<table class="t tape"><tbody>${list.slice(0, 15).map(t => `<tr><td style="padding:9px 18px"><span class="${t.side === 'YES' ? 'up' : 'down'}" style="font-weight:600;font-size:12px">${t.side}</span> <a class="dim" style="font-size:12.5px" href="#/tracker/sol:${esc(t.wallet)}">${esc(shortW(t.wallet))}</a>${t.primary ? '' : ' <span class="tag" style="height:17px;font-size:10px">2°</span>'}</td><td class="r num" style="font-size:12.5px">${fmtNum(t.amount, 2)}</td><td class="r mut" style="font-size:12px;padding-right:18px">${t.t ? ago(t.t) : ''} <a href="${explorerTx(t.sig)}" target="_blank" rel="noopener" aria-label="View transaction">${ic('ext', 'sm')}</a></td></tr>`).join('')}</tbody></table>` : '<p class="mut" style="padding:14px 18px;font-size:13px">No trades yet on this market.</p>'; }
  catch (e) { box.innerHTML = `<p class="mut" style="padding:14px 18px;font-size:13px">${esc(e.message)}</p>`; }
}
async function paintMyPosition(id) {
  const box = $('#my-pos'); if (!box) return; const w = primaryWallet();
  if (!Auth.user || !w) { box.innerHTML = `<div class="card-pad"><p class="mut" style="font-size:13px">${Auth.user ? 'Link a Solana wallet to see your position.' : 'Log in and link a wallet to see your position.'}</p></div>`; return; }
  try { const pos = (await Portfolio.load()).filter(p => p.marketId === id); box.innerHTML = `<div class="card-head"><h3>Your position</h3><a class="link" href="#/portfolio">Portfolio</a></div>` + (pos.length ? pos.map(p => positionRowCompact(p)).join('') : '<p class="mut" style="padding:14px 18px;font-size:13px">No position in this market.</p>'); }
  catch (e) { box.innerHTML = `<div class="card-pad"><p class="mut" style="font-size:13px">Positions unavailable: ${esc(e.message)}</p></div>`; }
}
async function polyMarketView(id) {
  const m = Poly.markets.get(id); if (!m) { if (Poly.state === 'offline') throw new Error('Polymarket data is unavailable right now.'); throw new Error('This market isn’t loaded — open it from Markets → Polymarket.'); }
  Promise.allSettled([Poly.history(m), Poly.oi(m), Poly.marketTrades(m), Poly.holders(m)]).then(([h, oi, tr, ho]) => {
    if (current.arg !== id) return; const c = $(`.chart-box[data-chart="poly"][data-id="${id}"]`); if (c) mountChartEl(c);
    setText(`[data-moi="${id}"]`, m.oi != null ? usd(m.oi, 0) : '—');
    const tb = $('#pm-trades'); if (tb) tb.innerHTML = polyTape(Poly.mtrades[m.conditionId] || [], false);
    const hb = $('#pm-holders'); if (hb) hb.innerHTML = ho.status === 'fulfilled' && ho.value.length ? ho.value.map(h => `<a class="row" href="#/tracker/pm:${esc(h.wallet)}" style="padding:10px 16px;border-bottom:1px solid var(--line)">${avatarFor(h.name, h.img, 'sm')}<span style="font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@${esc(h.name)}</span><span class="tag ${h.idx === 0 ? 'green' : 'red'}">${esc(h.idx === 0 ? m.yesLabel : m.noLabel)}</span><span class="num mut" style="margin-left:auto;font-size:12px">${kfmt(h.amount)} sh</span></a>`).join('') : '<p class="mut" style="padding:14px 18px;font-size:13px">Holder data unavailable.</p>';
  });
  return `<div class="page"><a class="link" href="#/markets?src=poly">${ic('chevLeft', 'sm')}Polymarket markets</a>
    <div class="sim-note" style="margin-top:12px;background:var(--blue-soft);border-color:var(--blue-line);color:#BFD2FF">${ic('info', 'sm')}<span>Reference market from Polymarket. Nexis trades on Panta — to trade this market, use <a href="${Poly.url(m)}" target="_blank" rel="noopener" style="text-decoration:underline">Polymarket</a>.</span></div>
    <div class="mkt-layout" style="margin-top:12px"><div style="min-width:0">
      <div class="mkt-head">${m.image ? `<img class="mkt-img" src="${esc(m.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><h1>${esc(m.q)}</h1><div class="mkt-meta"><span class="tag">${esc(catLabel(m.cat))}</span>${srcBadge('poly')}${m.end ? `<span>${ic('clock', 'sm')}${timeLeft(m.end)} left</span>` : ''}</div></div></div>
      <div class="price-row"><div><div class="lbl">${esc(m.yesLabel)}</div><div class="big up" data-ly="${id}">${cents(m.yes)}</div></div><div><div class="lbl">${esc(m.noLabel)}</div><div class="big down" data-ln="${id}">${cents(1 - m.yes)}</div></div><div><div class="lbl">Order book</div><div class="book" data-lbook="${id}">${polyBook(m)}</div></div></div>
      <div class="chart-box" data-chart="poly" data-id="${id}"></div>
      <div class="card" style="margin-top:20px"><div class="info-grid"><div><div class="k">Volume</div><div class="v">${usd(m.vol, 0)}</div></div><div><div class="k">24h volume</div><div class="v">${usd(m.vol24, 0)}</div></div><div><div class="k">Liquidity</div><div class="v">${usd(m.liq, 0)}</div></div><div><div class="k">Open interest</div><div class="v" data-moi="${id}">…</div></div></div><div class="rules"><div style="grid-column:1/-1"><h4>Rules</h4><p>${esc(m.rule || 'See Polymarket for full rules.')}</p></div></div></div>
    </div><aside>
      <div class="card"><div class="card-head"><h3>Top holders</h3>${srcBadge('poly', true)}</div><div id="pm-holders"><p class="mut" style="padding:14px 18px;font-size:13px">Loading…</p></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Recent trades</h3></div><div class="table-wrap" id="pm-trades" data-cid="${esc(m.conditionId)}">${polyTape(Poly.mtrades[m.conditionId] || [], false)}</div></div>
    </aside></div></div>`;
}
const polyBook = (m) => m.bid != null && m.ask != null ? `<span>Bid <b class="num up">${cents(m.bid)}</b></span> <span>Ask <b class="num down">${cents(m.ask)}</b></span>` : '<span class="mut">Waiting for the book…</span>';
function polyTape(list, showMarket = true, n = 20) {
  if (!list.length) return `<p class="mut" style="padding:14px 18px;font-size:13px">${Feeds.live('polymarket') ? 'No trades yet — new fills appear here as they happen.' : 'Connecting to Polymarket…'}</p>`;
  return `<table class="t tape"><tbody>${list.slice(0, n).map(t => `<tr><td style="padding:9px 18px"><span class="${t.yesSide ? 'up' : 'down'}" style="font-weight:600;font-size:12px">${t.side === 'SELL' ? 'SELL' : 'BUY'} ${esc(t.outcome || '')}</span> <a class="dim" style="font-size:12.5px" href="#/tracker/pm:${esc(t.wallet)}">@${esc(t.who)}</a>${showMarket && t.title ? `<div class="mut" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px">${esc(t.title)}</div>` : ''}</td><td class="r num" style="font-size:12.5px">${usd(t.usd, t.usd < 100 ? 2 : 0)}</td><td class="r num" style="font-size:12.5px">${cents(t.price)}</td><td class="r mut" style="font-size:12px;padding-right:18px">${ago(t.t)}</td></tr>`).join('')}</tbody></table>`;
}
ChartKinds.panta = (el) => { const h = Panta.hist(el.dataset.id); if (h.length < 2) return; lineChart(el, { values: h.map(x => x[1] * 100), times: h.map(x => x[0]), fmt: v => v.toFixed(0) + '¢', color: 'var(--blue)', domain: [0, 100] }); };
ChartKinds.poly = (el) => { const m = Poly.markets.get(el.dataset.id); if (!m || !m.hist || m.hist.length < 2) { el.innerHTML = '<p class="mut" style="padding:30px;text-align:center;font-size:13px">Loading price history…</p>'; return; } lineChart(el, { values: m.hist.map(x => x[1] * 100), times: m.hist.map(x => x[0]), fmt: v => v.toFixed(0) + '¢', color: 'var(--blue)', domain: [0, 100] }); };

/* ---------------- TRADING (Panta primary buy) ---------------- */
function tradeGate(m) {
  if (!Auth.user) return requireAuth(() => {}, 'Log in to trade'), false;
  if (!primaryWallet()) { openWalletFlow({ mode: 'link', onDone: () => openOrder(m.id) }); return false; }
  if (Panta.mode === 'test') { toast({ title: 'Panta is in test mode', body: 'The server uses a pk_test_ key, so trades can’t be signed.', kind: 'warn' }); return false; }
  if (!m.tradable) { toast({ title: 'Trading is closed for this market', kind: 'warn' }); return false; }
  return true;
}
async function openOrder(id) {
  const m = Panta.markets.get(id); const tr = UI.trade[id] = UI.trade[id] || { side: 'YES', amt: '10' }; if (!m || !tradeGate(m)) return;
  const amt = nz(tr.amt, 0); if (!(amt >= .01)) return toast({ title: 'Enter an amount of at least $0.01', kind: 'warn' });
  const amountUsdc = amt.toFixed(2); const w = primaryWallet();
  if (Balances.v && Balances.v.usdc < amt) return toast({ title: 'Not enough USDC', body: `Your wallet holds ${fmtNum(Balances.v.usdc, 2)} USDC.`, kind: 'err' });
  openModal(`${modalHead('Review order', esc(m.title))}<div class="modal-body"><div class="pipe">${pipeStep('Requesting a quote from Panta', 'run')}</div></div>`, { label: 'Review order' });
  let q; try { q = await Panta.quoteBuy({ wallet: w.address, marketId: id, side: tr.side, amountUsdc }); }
  catch (e) { return setModal(`${modalHead('Couldn’t get a quote')}<div class="modal-body">${emptyState({ icon: 'alert', title: 'Panta rejected the quote', body: esc(e.message) })}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Close</button></div>`); }
  UI.pendingOrder = { m, q, side: tr.side, amountUsdc, wallet: w };
  const exp = toMs(q.expiresAt) || now() + 90e3;
  setModal(`${modalHead('Review order', esc(m.title))}<div class="modal-body">
    <div class="order-sum"><div><span>Side</span><span class="${tr.side === 'YES' ? 'up' : 'down'}" style="font-weight:600">${tr.side}</span></div><div><span>You pay</span><span>${fmtNum(q.amountUsdc || amountUsdc, 2)} USDC</span></div><div><span>Estimated shares</span><span>${fmtNum(q.shares, 4)}</span></div><div><span>Average price</span><span>${q.avgPrice != null ? cents(nz(q.avgPrice)) : '—'}</span></div><div><span>Panta fee</span><span>${fmtNum(q.feeUsdc, 2)} USDC</span></div><div><span>Pays if ${tr.side} wins</span><span class="up">${fmtNum(q.shares, 2)} USDC</span></div><div><span>Wallet</span><span>${esc(w.label)} · ${shortAddr(w.address)}</span></div></div>
    <p class="mut" style="font-size:12.5px">If the market resolves ${tr.side === 'YES' ? 'NO' : 'YES'}, these shares are worth $0. Slippage limit 1%. Quote expires in <b data-countdown="${exp}">${Math.max(0, Math.round((exp - now()) / 1000))}s</b>.</p>
    ${q.disclaimer ? infoNote(esc(q.disclaimer)) : ''}</div>
    <div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn ${tr.side === 'YES' ? 'btn-yes on' : 'btn-no on'}" data-action="confirmOrder" autofocus>Confirm in ${esc(w.label)}</button></div>`);
}
const pipeStep = (label, state, t = '') => `<div class="pipe-step ${state}"><span class="pi">${state === 'done' ? ic('check', 'sm') : state === 'fail' ? ic('x', 'sm') : ''}</span><span>${label}</span><span class="pt">${t}</span></div>`;
function pipe(steps, i, failAt) { return `<div class="pipe">${steps.map((s, j) => pipeStep(s, failAt === j ? 'fail' : j < i ? 'done' : j === i ? 'run' : '')).join('')}</div>`; }
async function confirmOrder() {
  const P = UI.pendingOrder; if (!P) return; const { m, q, side, wallet } = P;
  const steps = ['Building the transaction with Panta', `Signing in ${wallet.label}`, 'Waiting for Solana confirmation', 'Registering the trade with Panta'];
  const show = (i, extra = '', failAt) => setModal(`${modalHead('Placing order', esc(m.title))}<div class="modal-body">${pipe(steps, i, failAt)}${extra}</div>`);
  show(0);
  let b; try { b = await Panta.buildBuy({ quoteId: q.quoteId, wallet: wallet.address, maxSlippageBps: 100 }); } catch (e) { return show(0, emptyState({ icon: 'alert', title: 'Build failed', body: esc(e.message) + (e.code === 'QUOTE_EXPIRED' || /expire/i.test(e.message) ? ' Request a new quote.' : '') }) + '<button class="btn btn-ghost block" data-action="closeModal">Close</button>', 0); }
  if (!b.instructions || !b.instructions.length) return show(0, infoNote(esc(b.disclaimer || 'Panta returned no instructions to sign (sandbox fixtures). Nothing was sent.')) + '<button class="btn btn-ghost block" data-action="closeModal">Close</button>', 0);
  let prov, tx; try { prov = await Wallets.provider(wallet); tx = await Chain.txFromInstructions(b, wallet.address); } catch (e) { return show(1, emptyState({ icon: 'alert', title: 'Wallet unavailable', body: esc(e.message) }) + '<button class="btn btn-ghost block" data-action="closeModal">Close</button>', 1); }
  show(1);
  let rec; try { const run = Tx.run({ kind: 'Buy ' + side, desc: m.title, marketId: m.id, amount: -nz(P.amountUsdc), prov, tx, lastValidBlockHeight: b.lastValidBlockHeight }); const off = Bus.on('tx', (t) => { if (t.marketId === m.id && t.sig && t.status === 'submitted') show(2, `<p class="mut num" style="font-size:12px">Signature <a class="link" style="display:inline" href="${explorerTx(t.sig)}" target="_blank" rel="noopener">${shortW(t.sig)}</a></p>`); }); rec = await run; off(); }
  catch (e) { return show(1, emptyState({ icon: 'alert', title: 'Not sent', body: esc(e.message || 'The wallet declined the transaction.') }) + '<button class="btn btn-ghost block" data-action="closeModal">Close</button>', 1); }
  if (!Tx.ok(rec)) return show(2, emptyState({ icon: 'alert', title: TX_ST[rec.status][1], body: rec.status === 'expired' ? 'The transaction wasn’t included before its blockhash expired. No funds moved — request a new quote.' : 'The transaction did not succeed on Solana. Check it on Solscan.' }) + `<a class="btn btn-ghost block" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">View on Solscan</a>`, 2);
  show(3);
  await Promise.allSettled([Panta.submitBuy({ orderId: b.orderId, signature: rec.sig, wallet: wallet.address }), Panta.report({ signature: rec.sig, wallet: wallet.address, marketId: m.id })]);
  const k = m.id + ':' + side; const e = Store.s.entries[k] || { usdc: 0, shares: 0 }; e.usdc += nz(P.amountUsdc); e.shares += nz(b.expectedShares || q.shares); Store.s.entries[k] = e; Store.save();
  UI.pendingOrder = null; Portfolio.load(true); Balances.refresh(); Panta.detail(m.id).catch(() => {});
  setModal(`${modalHead('Order confirmed')}<div class="modal-body"><div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">Bought ~${fmtNum(b.expectedShares || q.shares, 2)} ${side} shares</h3><p class="dim" style="margin-top:4px">${fmtNum(P.amountUsdc, 2)} USDC · confirmed on Solana (${esc(rec.status)})</p></div><div class="order-sum"><div><span>Signature</span><span><a class="link" style="display:inline" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">${shortW(rec.sig)} ${ic('ext', 'sm')}</a></span></div><div><span>Order</span><span>${esc(b.orderId || '—')}</span></div></div></div><div class="modal-foot"><a class="btn btn-ghost" href="#/portfolio" data-action="closeModal">Portfolio</a><button class="btn btn-primary" data-action="closeModal">Done</button></div>`);
}
async function claimWinnings(marketId) {
  const w = primaryWallet(); const m = Panta.markets.get(marketId) || { title: shortW(marketId), id: marketId };
  openModal(`${modalHead('Claim winnings', esc(m.title))}<div class="modal-body"><div class="pipe">${pipeStep('Building the claim with Panta', 'run')}</div></div>`);
  try {
    const b = await Panta.buildClaim({ wallet: w.address, marketId }); if (!b.instructions || !b.instructions.length) throw new Error(b.disclaimer || 'Panta returned nothing to sign.');
    const prov = await Wallets.provider(w); const tx = await Chain.txFromInstructions(b, w.address);
    setModal(`${modalHead('Claim winnings', esc(m.title))}<div class="modal-body">${pipe(['Building the claim', `Signing in ${w.label}`, 'Waiting for Solana confirmation'], 1)}</div>`);
    const rec = await Tx.run({ kind: 'Claim', desc: m.title, marketId, amount: nz(b.winningShares), prov, tx, lastValidBlockHeight: b.lastValidBlockHeight });
    setModal(`${modalHead(Tx.ok(rec) ? 'Winnings claimed' : 'Claim not confirmed')}<div class="modal-body">${Tx.ok(rec) ? `<div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">${fmtNum(b.winningShares, 2)} USDC claimed</h3></div>` : emptyState({ icon: 'alert', title: TX_ST[rec.status][1], body: 'Check the transaction on Solscan.' })}<a class="btn btn-ghost block" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">View on Solscan</a></div>`);
    Portfolio.load(true); Balances.refresh();
  } catch (e) { setModal(`${modalHead('Claim failed')}<div class="modal-body">${emptyState({ icon: 'alert', title: 'Couldn’t claim', body: esc(e.message) })}</div>`); }
}

/* ---------------- PORTFOLIO (real Panta positions + on-chain balances) ---------------- */
const Portfolio = {
  pos: null, at: 0, err: null, base: {}, claimSeen: {},
  async load(force) {
    const w = primaryWallet(); if (!w) return [];
    if (!force && this.pos && now() - this.at < 15000 && this.addr === w.address) return this.pos;
    try {
      const pos = await Panta.positions(w.address); this.addr = w.address; this.err = null;
      const missing = pos.filter(p => !Panta.markets.has(p.marketId)).slice(0, 8); for (const p of missing) { try { await Panta.detail(p.marketId); } catch (e) {} }
      pos.forEach(p => { if (p.claimable && !p.claimed && !this.claimSeen[p.marketId + p.side] && this.pos) { const m = Panta.markets.get(p.marketId); Notify.push({ kind: 'resolved', icon: 'trophy', text: `<b>${esc(m ? m.title : shortW(p.marketId))}</b> resolved ${esc(p.outcome || '')} — your ${p.side} shares can be claimed`, href: '#/portfolio', toast: true, title: 'Winnings to claim' }); } if (p.claimable) this.claimSeen[p.marketId + p.side] = true; });
      this.pos = pos; this.at = now(); Panta.watch(pos.map(p => p.marketId)); Bus.emit('portfolio'); return pos;
    } catch (e) { this.err = e; Bus.emit('portfolio'); throw e; }
  },
  value(p) { const m = Panta.markets.get(p.marketId); if (p.outcome) return p.outcome === p.side ? p.shares : 0; const px = m ? (p.side === 'YES' ? m.yes : m.no) : null; return px != null ? px * p.shares : null; },
  cost(p) { const e = Store.s.entries[p.marketId + ':' + p.side]; return e && e.shares ? e.usdc * Math.min(1, p.shares / e.shares) : null; },
  totals() { const P = this.pos || []; let val = 0, cost = 0, costKnown = 0, missing = 0; P.forEach(p => { const v = this.value(p); if (v == null) missing++; else val += v; const c = this.cost(p); if (c != null && v != null) { cost += c; costKnown += v; } }); return { val, pnl: costKnown - cost, hasPnl: cost > 0, missing }; },
  watchMoves() { Bus.on('panta:price', ({ m, prev }) => { if (!this.pos || !this.pos.some(p => p.marketId === m.id) || prev == null) return; const b = this.base[m.id] ?? (this.base[m.id] = prev); if (Math.abs(m.yes - b) >= .05) { this.base[m.id] = m.yes; Notify.push({ kind: 'move', icon: 'zap', text: `<b>${esc(m.title)}</b> moved ${m.yes > b ? '<span class="up">+' : '<span class="down">−'}${Math.abs(Math.round((m.yes - b) * 100))}¢</span> to ${cents(m.yes)} · you hold this market`, href: '#/market/' + m.id, setting: 'notifyMoves' }); } }); },
  start() { this.watchMoves(); Poller(() => Auth.user && primaryWallet() && Panta.state !== 'unconfigured' ? this.load(true).catch(() => {}) : null, 20000); },
};
function positionRowCompact(p) { const v = Portfolio.value(p), c = Portfolio.cost(p); return `<div class="row" style="padding:12px 18px;border-bottom:1px solid var(--line)"><span class="tag ${p.side === 'YES' ? 'green' : 'red'}">${p.side}</span><span class="num">${fmtNum(p.shares, 2)} sh</span>${p.claimable && !p.claimed ? `<button class="btn btn-yes on sm" data-action="claim" data-id="${p.marketId}" style="margin-left:auto">Claim</button>` : `<span class="num" style="margin-left:auto">${v != null ? usd(v) : '—'}</span>${c != null && v != null ? `<span class="num ${v - c >= 0 ? 'up' : 'down'}">${sUsd(v - c)}</span>` : ''}`}</div>`; }
Views.portfolio = async (params) => {
  if (params.get('tab')) UI.portfolio.tab = params.get('tab'); const tab = UI.portfolio.tab; const w = primaryWallet();
  if (!w) return `<div class="page"><div class="page-head"><div><h1>Portfolio</h1></div></div><div class="card">${emptyState({ icon: 'wallet', title: 'Link a Solana wallet', body: 'Your portfolio is read from your wallet: USDC balance on Solana and positions on Panta.', cta: '<button class="btn btn-primary" data-action="linkWallet">Link wallet</button>' })}</div></div>`;
  const blocked = pantaState('your positions');
  let posErr = null; if (!blocked) { try { await Portfolio.load(); } catch (e) { posErr = e; } }
  const b = Balances.v; const T = Portfolio.totals(); const P = Portfolio.pos || [];
  const rows = P.map(p => { const m = Panta.markets.get(p.marketId); const v = Portfolio.value(p), c = Portfolio.cost(p); const px = m ? (p.side === 'YES' ? m.yes : m.no) : null;
    return `<tr class="click" data-href="#/market/${p.marketId}"><td class="q">${esc(m ? m.title : shortW(p.marketId))}<div class="mut" style="font-size:11.5px">${esc(p.phase || '')}${p.outcome ? ' · resolved ' + esc(p.outcome) : ''}</div></td><td><span class="tag ${p.side === 'YES' ? 'green' : 'red'}">${p.side}</span></td><td class="r num">${fmtNum(p.shares, 2)}</td><td class="r num">${c != null && p.shares ? cents(c / p.shares) : '—'}</td><td class="r num" ${m ? `data-p${p.side === 'YES' ? 'y' : 'n'}="${m.id}"` : ''}>${px != null ? cents(px) : '—'}</td><td class="r num">${v != null ? usd(v) : '—'}</td><td class="r num ${c != null && v != null ? (v - c >= 0 ? 'up' : 'down') : 'mut'}">${c != null && v != null ? sUsd(v - c) : '—'}</td><td class="r">${p.claimable && !p.claimed ? `<button class="btn btn-yes on sm" data-action="claim" data-id="${p.marketId}">Claim</button>` : p.claimed ? '<span class="tag">Claimed</span>' : m && m.tradable ? `<button class="btn btn-ghost sm" data-action="quickTrade" data-id="${m.id}" data-side="${p.side}">Buy more</button>` : ''}</td></tr>`; }).join('');
  return `<div class="page">${pantaModeBanner()}<div class="page-head"><div><h1>Portfolio</h1><p>${esc(w.label)} · <span class="num">${shortAddr(w.address)}</span> · balances from Solana, positions from Panta.</p></div><span class="row">${srcBadge('chain')}${srcBadge('panta')}</span></div>
    <div class="stats-strip"><div class="stat"><div class="k">USDC balance</div><div class="v" data-usdc>${b ? fmtNum(b.usdc, 2) : Balances.err ? '—' : '…'}</div><div class="s mut">${Balances.err ? 'RPC unavailable' : 'On-chain'}</div></div><div class="stat"><div class="k">SOL balance</div><div class="v" data-sol>${b ? fmtNum(b.sol, 4) : '—'}</div><div class="s mut">For network fees</div></div><div class="stat"><div class="k">Positions value</div><div class="v" data-pfval>${P.length ? usd(T.val) : '—'}</div><div class="s mut">${T.missing ? `${T.missing} without a price` : 'At current Panta prices'}</div></div><div class="stat"><div class="k">P&amp;L</div><div class="v ${T.pnl >= 0 ? 'up' : 'down'}" data-pfpnl>${T.hasPnl ? sUsd(T.pnl) : '—'}</div><div class="s mut">${T.hasPnl ? 'On positions opened in Nexis' : 'Available for trades placed in Nexis'}</div></div></div>
    <div class="tabs" style="margin-top:22px">${['Positions', 'Transactions', 'On-chain'].map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-action="pfTab" data-t="${k}">${k}${k === 'Positions' && P.length ? ` <span class="mut num">${P.length}</span>` : ''}</button>`).join('')}</div>
    <div style="margin-top:16px">
    ${tab === 'Positions' ? (blocked ? blocked : posErr ? unavailable('Positions unavailable', esc(posErr.message)) : P.length ? `<div class="card table-wrap"><table class="t"><thead><tr><th>Market</th><th>Side</th><th class="r">Shares</th><th class="r">Avg entry</th><th class="r">Price</th><th class="r">Value</th><th class="r">P&amp;L</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="mut" style="font-size:12px;margin-top:8px">Entry and P&amp;L use the quotes of trades you placed through Nexis. Panta doesn’t publish cost basis.</p>` : `<div class="card">${emptyState({ icon: 'brief', title: 'No open positions', body: 'Positions you hold on Panta appear here automatically.', cta: '<a class="btn btn-primary sm" href="#/markets">Explore markets</a>' })}</div>`) : ''}
    ${tab === 'Transactions' ? txTable() : ''}
    ${tab === 'On-chain' ? `<div class="card"><div class="card-head"><h3>Wallet history</h3><a class="link" href="${explorerAddr(w.address)}" target="_blank" rel="noopener">Solscan ${ic('ext', 'sm')}</a></div><div id="chain-hist"><p class="mut" style="padding:14px 18px;font-size:13px">Loading from Solana…</p></div></div>` : ''}
    </div></div>`;
};
function txRows(list) { return list.map(t => `<tr><td class="mut" style="white-space:nowrap">${ago(t.t)}</td><td><b style="font-weight:550">${esc(t.kind)}</b></td><td class="q" style="min-width:200px">${esc(t.desc || '')}</td><td class="r num">${t.amount ? (t.amount > 0 ? '+' : '−') + fmtNum(Math.abs(t.amount), 2) + ' USDC' : '—'}</td><td><span class="tag ${TX_ST[t.status][0]}">${['signing', 'submitted', 'processed', 'checking'].includes(t.status) ? '<span class="spin" style="width:9px;height:9px;border-width:1.5px"></span>' : ''}${TX_ST[t.status][1]}</span></td><td>${t.sig ? `<a class="link num" style="display:inline;font-size:12px" href="${explorerTx(t.sig)}" target="_blank" rel="noopener">${shortW(t.sig)}</a>` : '<span class="mut">—</span>'}</td></tr>`).join(''); }
function txTable() { const L = Store.s.txs; if (!L.length) return `<div class="card">${emptyState({ icon: 'dollar', title: 'No transactions yet', body: 'Trades, claims and market creations you sign in Nexis appear here with their on-chain status.' })}</div>`; return `<div class="card table-wrap"><table class="t"><thead><tr><th>Time</th><th>Type</th><th>Details</th><th class="r">Amount</th><th>Status</th><th>Signature</th></tr></thead><tbody data-txrows>${txRows(L.slice(0, 60))}</tbody></table></div>`; }

/* ---------------- CREATE MARKET (Panta) ---------------- */
const isoLocal = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
Views.create = async () => {
  const blocked = pantaState('market creation'); await Panta.loadCategories();
  const d = UI.draft = UI.draft || { question: '', description: '', rule: '', sources: '', category: 'crypto', type: 'standard', start: now() + 2 * HOUR, end: now() + 14 * DAY, resolve: now() + 14 * DAY + 6 * HOUR, image: '', region: 'Global' };
  return `<div class="page">${pantaModeBanner()}
    <div class="page-head"><div><h1>Create a market on Panta</h1><p>Anyone can create a market. Panta charges a USDC creation fee (quoted before you sign) and market creators earn from the activity their market generates.</p></div>${srcBadge('panta')}</div>
    ${blocked || ''}
    <div class="create-layout"><div class="stack" style="gap:16px;min-width:0">
      <div class="create-hero"><div class="label" style="margin-bottom:8px">${ic('spark', 'sm')} Draft from a post or idea <span class="mut">(${esc(AI.label())})</span></div><textarea class="textarea" id="ai-in" placeholder="Paste a post, headline or prediction — e.g. “SOL will hit $300 before December.”"></textarea><div class="row wrap" style="margin-top:12px;gap:8px"><button class="btn btn-blue" data-action="draftAi">${ic('spark', 'sm')}Draft market</button><span class="mut" style="font-size:12px" id="ai-note"></span></div></div>
      <form class="card" data-form2="create" id="create-form"><div class="card-head"><h3>${ic('edit', 'sm')}Market details</h3><span class="mut" style="font-size:12px">Validated by Panta when you request a quote</span></div><div class="card-pad stack" style="gap:14px">
        <label class="field"><span>Question (max 512)</span><input class="input" name="question" maxlength="512" value="${esc(d.question)}" placeholder="Will … before …?" required></label>
        <label class="field"><span>Description</span><textarea class="textarea" name="description" maxlength="2000" placeholder="Context traders should know">${esc(d.description)}</textarea></label>
        <label class="field"><span>Resolution rule (max 2048)</span><textarea class="textarea" name="rule" maxlength="2048" placeholder="Exactly what makes this resolve YES" required>${esc(d.rule)}</textarea></label>
        <label class="field"><span>Sources of truth (one per line, max 20)</span><textarea class="textarea" name="sources" style="min-height:64px" placeholder="https://www.coingecko.com/en/coins/solana" required>${esc(d.sources)}</textarea></label>
        <div class="grid g3"><label class="field"><span>Category</span><select class="select" name="category">${Panta.categories.map(c => `<option value="${esc(c)}" ${c === d.category ? 'selected' : ''}>${esc(catLabel(c))}</option>`).join('')}</select></label>
          <label class="field"><span>Market type</span><select class="select" name="type"><option value="standard" ${d.type === 'standard' ? 'selected' : ''}>Standard</option><option value="breaking" ${d.type === 'breaking' ? 'selected' : ''}>Breaking</option></select></label>
          <label class="field"><span>Region</span><input class="input" name="region" value="${esc(d.region)}"></label></div>
        <div class="grid g3"><label class="field"><span>Trading starts</span><input type="datetime-local" class="input" name="start" value="${isoLocal(d.start)}"></label><label class="field"><span>Trading ends</span><input type="datetime-local" class="input" name="end" value="${isoLocal(d.end)}"></label><label class="field"><span>Resolution time</span><input type="datetime-local" class="input" name="resolve" value="${isoLocal(d.resolve)}"></label></div>
        <label class="field"><span>Image URL (required by Panta, https)</span><input class="input" name="image" value="${esc(d.image)}" placeholder="https://…/image.png" required></label>
        <div data-err></div>
        <button type="button" class="btn btn-primary lg" data-action="quoteCreate" ${blocked ? 'disabled' : ''}>${ic('dollar', 'sm')}Get creation quote</button>
      </div></form>
    </div>
    <aside class="preview-card"><div class="card"><div class="card-head"><h3>How creation works</h3></div><div class="card-pad stack" style="gap:10px;font-size:13px" class="dim">
      ${['Panta validates your market and quotes the USDC fee (the quote holds for ~5 minutes).', 'Panta builds the creation transaction. You sign it in your wallet — Nexis never holds keys.', 'After Solana confirms it, Nexis registers the market with Panta and it appears in Markets.', 'When the event ends, Panta’s Resolution Agent resolves the market against your sources of truth.'].map((s, i) => `<div class="row" style="align-items:flex-start;gap:10px"><span class="gi num">${i + 1}</span><span class="dim">${s}</span></div>`).join('')}
    </div></div></aside></div></div>`;
};
function readCreateForm() {
  const f = $('#create-form'); const g = (n) => f.elements[n].value.trim(); const ts = (n) => Math.floor(new Date(g(n)).getTime() / 1000);
  const d = { question: g('question'), description: g('description'), rule: g('rule'), sources: g('sources'), category: g('category'), type: g('type'), region: g('region') || 'Global', image: g('image'), start: new Date(g('start')).getTime(), end: new Date(g('end')).getTime(), resolve: new Date(g('resolve')).getTime() };
  UI.draft = d;
  const err = !d.question ? 'Add a question.' : !d.rule ? 'Add a resolution rule.' : !d.sources ? 'Add at least one source of truth.' : !/^https?:\/\//.test(d.image) ? 'Add an https image URL (Panta requires one).' : !(d.start < d.end && d.end <= d.resolve) ? 'Times must satisfy start < end ≤ resolution.' : d.start < now() && d.type !== 'breaking' ? 'The start time must be in the future.' : null;
  return { d, err, body: { question: d.question, resolutionRule: d.rule, sourcesOfTruth: d.sources.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 20), category: d.category, startTime: ts('start'), endTime: ts('end'), resolutionTime: ts('resolve'), marketType: d.type, title: d.question, description: d.description || undefined, imageUrl: d.image, region: d.region } };
}
async function quoteCreate(btn) {
  const f = $('#create-form'); const { err, body } = readCreateForm(); const box = f.querySelector('[data-err]'); box.innerHTML = '';
  if (err) return box.innerHTML = authErrorHtml(err);
  if (!Auth.user) return requireAuth(() => {}, 'Log in to create a market'); const w = primaryWallet(); if (!w) return openWalletFlow({ mode: 'link' });
  setBusy(btn, true, 'Getting quote…');
  let q; try { q = await Panta.quoteCreate({ ...body, wallet: w.address }); } catch (e) { setBusy(btn, false); return box.innerHTML = authErrorHtml(e.message + (e.body && e.body.field ? ` (${e.body.field})` : '')); }
  setBusy(btn, false); UI.pendingCreate = { q, body, wallet: w };
  const usdcOf = (x) => x != null ? fmtNum(nz(x) / 1e6, 2) + ' USDC' : '—';
  openModal(`${modalHead('Create market', esc(body.question))}<div class="modal-body"><div class="order-sum"><div><span>Creation payment</span><span>${usdcOf(q.paymentUsdc)}</span></div><div><span>Liquidity injection</span><span>${usdcOf(q.liquidityInjectionUsdc)}</span></div><div><span>Platform revenue</span><span>${usdcOf(q.platformRevenueUsdc)}</span></div><div><span>Type</span><span>${esc(q.marketType || body.marketType)}</span></div><div><span>Market address</span><span class="num">${shortW(q.expectedEventPda)}</span></div><div><span>Signer</span><span>${esc(w.label)} · ${shortAddr(w.address)}</span></div></div><p class="mut" style="font-size:12.5px">This quote holds until ${q.expiresAt ? new Date(q.expiresAt).toLocaleTimeString() : 'about 5 minutes from now'}.</p>${Panta.mode === 'test' ? infoNote('Test mode: Panta returns sandbox fixtures. Nothing can be signed.') : ''}</div><div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn btn-primary" data-action="confirmCreate" ${Panta.mode === 'test' ? 'disabled' : ''}>Create in ${esc(w.label)}</button></div>`);
}
async function confirmCreate() {
  const C = UI.pendingCreate; if (!C) return; const { q, body, wallet } = C;
  const steps = ['Building the creation transaction', `Signing in ${wallet.label}`, 'Waiting for Solana confirmation', 'Registering the market with Panta'];
  const show = (i, extra = '', failAt) => setModal(`${modalHead('Creating market', esc(body.question))}<div class="modal-body">${pipe(steps, i, failAt)}${extra}</div>`);
  show(0);
  let b; try { b = await Panta.buildCreate({ createId: q.createId, wallet: wallet.address }); if (!b.transaction) throw new Error(b.disclaimer || 'Panta returned no transaction to sign.'); } catch (e) { return show(0, emptyState({ icon: 'alert', title: 'Build failed', body: esc(e.message) }), 0); }
  let prov, tx; try { prov = await Wallets.provider(wallet); tx = await Chain.txFromBase64(b.transaction); } catch (e) { return show(1, emptyState({ icon: 'alert', title: 'Wallet unavailable', body: esc(e.message) }), 1); }
  show(1);
  let rec; try { rec = await Tx.run({ kind: 'Create market', desc: body.question, marketId: b.expectedEventPda || q.expectedEventPda, amount: -nz(b.paymentUsdc || q.paymentUsdc) / 1e6, prov, tx, lastValidBlockHeight: b.lastValidBlockHeight }); } catch (e) { return show(1, emptyState({ icon: 'alert', title: 'Not sent', body: esc(e.message) }), 1); }
  if (!Tx.ok(rec)) return show(2, emptyState({ icon: 'alert', title: TX_ST[rec.status][1], body: 'The market was not created. No registration was sent.' }) + `<a class="btn btn-ghost block" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">View on Solscan</a>`, 2);
  show(3);
  try { await Panta.registerCreate({ createId: q.createId, signature: rec.sig }); } catch (e) { return show(3, emptyState({ icon: 'alert', title: 'Created on-chain, registration failed', body: esc(e.message) + ' Your market exists on Solana; retry registration from Panta or contact support with the signature.' }) + `<a class="btn btn-ghost block" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">View on Solscan</a>`, 3); }
  UI.draft = null; UI.pendingCreate = null; Panta.loadCatalog(); Balances.refresh();
  const id = b.expectedEventPda || q.expectedEventPda;
  setModal(`${modalHead('Market created')}<div class="modal-body"><div class="receipt"><div class="okc">${ic('check', 'lg')}</div><h3 style="font-size:18px">${esc(body.question)}</h3><p class="dim" style="margin-top:4px">Confirmed on Solana and registered with Panta.</p></div><a class="btn btn-ghost block" href="${explorerTx(rec.sig)}" target="_blank" rel="noopener">View on Solscan</a></div><div class="modal-foot"><a class="btn btn-primary" href="#/market/${esc(id)}" data-action="closeModal">Open market</a></div>`);
}
async function draftAi(btn) {
  const text = ($('#ai-in').value || '').trim(); const note = $('#ai-note'); if (!text) return note.textContent = 'Paste a post or idea first.';
  setBusy(btn, true, 'Drafting…'); const r = await AI.extract(text); setBusy(btn, false);
  if (!r.isPrediction) { note.textContent = 'No clear, checkable prediction found. Fill in the details manually.'; return; }
  readCreateForm(); Object.assign(UI.draft, { question: r.question, rule: r.rule || UI.draft.rule, sources: r.source && /^https?:/.test(r.source) ? r.source : UI.draft.sources, description: [r.source ? 'Source: ' + r.source : '', r.assumption].filter(Boolean).join(' · ') || UI.draft.description, category: r.category, end: r.end, resolve: r.end + 6 * HOUR });
  await refresh(); const n = $('#ai-note'); if (n) n.textContent = `Drafted by ${r.engine === 'ai' ? AI.label() : 'the on-device parser'} · ${r.confidence}% confidence${r.aiError ? ' (AI unavailable: ' + r.aiError + ')' : ''}. Review every field before requesting a quote.`;
}
