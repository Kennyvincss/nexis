/* =====================================================================
   CRYPTO PRICES — list + asset detail
   Prices from CoinGecko (polled) and Coinbase (tick-by-tick WebSocket for
   listed assets). Related markets are real Panta / Polymarket markets whose
   titles mention the asset.
   ===================================================================== */
const chgCell = (n) => n == null ? '<span class="mut">—</span>' : chgHtml(n);
function cryptoSrc(c) { return c && c.src === 'Coinbase' && now() - (c.tickAt || 0) < 60000 ? srcBadge('coinbase', true) : srcBadge('coingecko', true); }
function cryptoState() {
  if (Crypto.coins.length) return null;
  if (Crypto.state === 'offline') return unavailable('Crypto prices unavailable', `Nexis couldn’t reach CoinGecko${Crypto.error ? ': ' + esc(Crypto.error.message) : ''}. It retries every 30 seconds. On a busy shared deployment, add <code>COINGECKO_API_KEY</code> for higher limits.`, '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>');
  return skeletonCards(3);
}
function coinImg(c, size = 28) { return c.image ? `<img src="${esc(c.image)}" alt="" width="${size}" height="${size}" style="border-radius:50%;flex:none" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="avatar sm">${esc(c.sym.slice(0, 3))}</span>`; }
function cryptoList({ q = '', sort = 'mcap' } = {}) {
  let l = Crypto.coins.slice();
  if (q) { const s = q.toLowerCase(); l = l.filter(c => c.name.toLowerCase().includes(s) || c.sym.toLowerCase().includes(s)); }
  const k = { mcap: (c) => -(c.mcap || 0), chg: (c) => -(c.chg24 ?? -1e9), loss: (c) => (c.chg24 ?? 1e9), vol: (c) => -(c.vol || 0), price: (c) => -(c.price || 0) }[sort] || (() => 0);
  return l.sort((a, b) => k(a) - k(b));
}
/** Real prediction markets that mention the asset (symbol as a word, or its name). */
function cryptoRelated(c) {
  const sym = new RegExp(`(^|[^A-Za-z$])\\$?${c.sym.replace(/[^A-Z0-9]/gi, '')}(?![A-Za-z])`);
  const name = c.name.length >= 4 ? new RegExp(`\\b${c.name.replace(/[^\w ]/g, '')}\\b`, 'i') : null;
  const hit = (t) => !!t && (sym.test(t) || (name && name.test(t)));
  return { panta: [...Panta.markets.values()].filter(m => !m.cancelled && hit(m.title)).slice(0, 8), poly: [...Poly.markets.values()].filter(m => hit(m.q)).sort((a, b) => b.vol - a.vol).slice(0, 6) };
}
function pantaRow(m) {
  return `<div class="mrow"><a class="mrow-l" href="#/market/${m.id}"><b>${esc(m.title)}</b><span class="mut" style="font-size:11.5px">${esc(endsLabel(m))}</span></a><div class="mrow-p"><span class="num" data-ppct="${m.id}">${m.yes != null ? Math.round(m.yes * 100) + '%' : '—'}</span></div>
    ${m.tradable ? `<div class="mrow-b"><button class="btn btn-yes sm" data-action="quickTrade" data-id="${m.id}" data-side="YES">Yes <span class="num" data-py="${m.id}">${m.yes != null ? cents(m.yes) : '—'}</span></button><button class="btn btn-no sm" data-action="quickTrade" data-id="${m.id}" data-side="NO">No <span class="num" data-pn="${m.id}">${m.no != null ? cents(m.no) : '—'}</span></button></div>` : phaseTag(m) || '<span class="tag">Closed</span>'}
    <span class="mrow-v num mut">${m.volume != null ? kusd(m.volume) : '—'}</span></div>`;
}
function polyRow(m) { return `<div class="mrow"><a class="mrow-l" href="#/market/${m.id}"><b>${esc(m.q)}</b><span class="mut" style="font-size:11.5px">Polymarket · view only</span></a><div class="mrow-p"><span class="num" data-lpct="${m.id}">${Math.round(m.yes * 100)}%</span></div><a class="btn btn-ghost sm" href="${Poly.url(m)}" target="_blank" rel="noopener">Polymarket ${ic('ext', 'sm')}</a><span class="mrow-v num mut">${kusd(m.vol)}</span></div>`; }
function relatedMarketsCard(rel, emptyText) {
  const blocked = pantaState('related markets');
  return `<div class="card"><div class="card-head"><h3>Related prediction markets</h3>${srcBadge('panta', true)}</div>
    ${rel.panta.length ? rel.panta.map(pantaRow).join('') : `<p class="mut" style="padding:14px 18px;font-size:13px">${blocked && !Panta.markets.size ? 'Panta isn’t connected on this server, so tradable markets can’t be listed.' : esc(emptyText)} <a class="link" style="display:inline" href="#/create">Create one</a></p>`}
    ${rel.poly.length ? `<div class="card-head" style="border-top:1px solid var(--line)"><h3 style="font-size:13px">On Polymarket</h3>${srcBadge('poly', true)}</div>${rel.poly.map(polyRow).join('')}` : ''}</div>`;
}

Views.crypto = async (params, id) => id ? cryptoDetail(id) : cryptoIndex();
async function cryptoIndex() {
  const st = UI.crypto; const blocked = cryptoState();
  const head = `<div class="page-head"><div><h1>Crypto prices</h1><p>Live prices, 24h change, high/low, volume and market cap. Updated tick-by-tick where Coinbase lists the asset, otherwise every 30 seconds.</p></div><span class="row">${srcBadge('coinbase')}${srcBadge('coingecko')}</span></div>`;
  if (blocked) return `<div class="page">${head}${blocked}</div>`;
  const list = cryptoList(st);
  return `<div class="page">${head}
    <div class="row wrap" style="gap:10px;margin-bottom:14px"><label class="search-trigger" style="max-width:none;flex:1;min-width:220px;cursor:text">${ic('search', 'sm')}<input id="cr-q" value="${esc(st.q)}" placeholder="Search assets" style="background:none;border:0;outline:none;flex:1;height:100%;color:var(--text)" aria-label="Search assets"></label>
      <label class="row" style="gap:8px"><span class="mut" style="font-size:13px">Sort</span><select class="select" id="cr-sort" style="width:auto;height:38px;padding:0 10px">${[['mcap', 'Market cap'], ['chg', 'Top gainers'], ['loss', 'Top losers'], ['vol', '24h volume'], ['price', 'Price']].map(([k, l]) => `<option value="${k}" ${k === st.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${Crypto.state === 'stale' ? `<div class="sim-note" style="margin-bottom:12px">${ic('alert', 'sm')}<span>CoinGecko didn’t respond to the last refresh. Showing prices from ${agoT(Crypto.updatedAt)}; streamed prices still update.</span></div>` : ''}
    <div class="card table-wrap"><table class="t crypto-t"><thead><tr><th>#</th><th>Asset</th><th class="r">Price</th><th class="r">1h</th><th class="r">24h</th><th class="r">7d</th><th class="r">24h high / low</th><th class="r">24h volume</th><th class="r">Market cap</th><th class="r">7 days</th></tr></thead><tbody>
      ${list.length ? list.map(c => `<tr class="click" data-href="#/crypto/${esc(c.id)}"><td class="mut num">${c.rank || ''}</td><td><span class="row" style="gap:10px">${coinImg(c)}<span><b style="font-weight:600">${esc(c.name)}</b> <span class="mut num" style="font-size:12px">${esc(c.sym)}</span></span></span></td><td class="r num" data-cpx="${esc(c.id)}">${fmtPx(c.price)}</td><td class="r">${chgCell(c.chg1h)}</td><td class="r" data-cchg="${esc(c.id)}">${chgCell(c.chg24)}</td><td class="r">${chgCell(c.chg7d)}</td><td class="r num" style="font-size:12.5px"><span data-chi="${esc(c.id)}">${fmtPx(c.high)}</span> <span class="mut">/</span> <span data-clo="${esc(c.id)}">${fmtPx(c.low)}</span></td><td class="r num">${c.vol != null ? kusd(c.vol) : '—'}</td><td class="r num">${c.mcap != null ? kusd(c.mcap) : '—'}</td><td class="r" style="width:120px">${c.spark.length > 2 ? sparkSvg(c.spark, { w: 110, h: 34 }) : '<span class="mut">—</span>'}</td></tr>`).join('') : `<tr><td colspan="10">${emptyState({ title: 'No assets match', body: `Nothing matches “${esc(st.q)}”.` })}</td></tr>`}
    </tbody></table></div>
    <p class="mut" style="font-size:12px;margin-top:8px">Top ${Crypto.coins.length} assets by market cap · CoinGecko updated ${agoT(Crypto.updatedAt)}.</p></div>`;
}
async function cryptoDetail(id) {
  if (!Crypto.coins.length && Crypto.state !== 'offline') await Crypto.load();
  const c = Crypto.byId.get(id) || Crypto.find(id);
  if (!c) { const b = cryptoState(); if (b && Crypto.state === 'offline') return `<div class="page"><a class="link" href="#/crypto">${ic('chevLeft', 'sm')}Crypto</a><div style="margin-top:14px">${b}</div></div>`; throw new Error('This asset isn’t in the top ' + Crypto.coins.length + ' by market cap.'); }
  const r = UI.chartRange[c.id] || '1'; const rel = cryptoRelated(c);
  return `<div class="page"><a class="link" href="#/crypto">${ic('chevLeft', 'sm')}Crypto prices</a>
    <div class="mkt-layout" style="margin-top:12px"><div style="min-width:0">
      <div class="mkt-head">${coinImg(c, 44)}<div style="min-width:0"><h1>${esc(c.name)} <span class="mut num" style="font-size:.6em">${esc(c.sym)}</span></h1><div class="mkt-meta"><span class="tag">Rank #${c.rank || '—'}</span><span data-csrc="${esc(c.id)}">${cryptoSrc(c)}</span></div></div></div>
      <div class="price-row"><div><div class="lbl">Price (USD)</div><div class="big" data-cpx="${esc(c.id)}">${fmtPx(c.price)}</div></div><div><div class="lbl">24h</div><div style="font-size:18px" data-cchg="${esc(c.id)}">${chgCell(c.chg24)}</div></div><div><div class="lbl">7d</div><div style="font-size:18px">${chgCell(c.chg7d)}</div></div>
        <div class="seg" style="margin-left:auto">${[['1', '24H'], ['7', '7D'], ['30', '1M'], ['365', '1Y']].map(([k, l]) => `<button class="${k === r ? 'on' : ''}" data-action="cRange" data-id="${esc(c.id)}" data-r="${k}">${l}</button>`).join('')}</div></div>
      <div class="chart-box" data-chart="crypto" data-id="${esc(c.id)}" data-r="${r}"></div>
      <div class="card" style="margin-top:20px"><div class="info-grid">
        <div><div class="k">24h high</div><div class="v" data-chi="${esc(c.id)}">${fmtPx(c.high)}</div></div><div><div class="k">24h low</div><div class="v" data-clo="${esc(c.id)}">${fmtPx(c.low)}</div></div><div><div class="k">24h volume</div><div class="v">${c.vol != null ? usd(c.vol, 0) : '—'}</div></div><div><div class="k">Market cap</div><div class="v">${c.mcap != null ? usd(c.mcap, 0) : '—'}</div></div>
        <div><div class="k">Circulating supply</div><div class="v">${c.supply != null ? kfmt(c.supply) + ' ' + esc(c.sym) : '—'}</div></div><div><div class="k">All-time high</div><div class="v">${fmtPx(c.ath)}</div></div><div><div class="k">1h change</div><div class="v">${pctOrDash(c.chg1h)}</div></div><div><div class="k">Fully diluted value</div><div class="v" id="cr-fdv">…</div></div>
      </div><div class="rules"><div style="grid-column:1/-1"><h4>About ${esc(c.name)}</h4><p id="cr-about" class="mut">Loading from CoinGecko…</p></div></div></div>
    </div><aside>
      ${relatedMarketsCard(rel, `No open Panta markets mention ${c.sym} right now.`)}
    </aside></div></div>`;
}
async function paintCryptoAbout(id) {
  try { const d = await Crypto.details(id); if (current.arg !== id) return; const a = $('#cr-about'); if (a) { a.classList.remove('mut'); a.innerHTML = (d.desc ? esc(d.desc) : '<span class="mut">No description published.</span>') + (d.home ? `<br><a class="link" style="display:inline-flex;margin-top:6px" href="${esc(d.home)}" target="_blank" rel="noopener">Website ${ic('ext', 'sm')}</a>` : ''); } const f = $('#cr-fdv'); if (f) f.textContent = d.fdv != null ? usd(d.fdv, 0) : '—'; }
  catch (e) { const a = $('#cr-about'); if (a) a.textContent = 'Details unavailable right now.'; const f = $('#cr-fdv'); if (f) f.textContent = '—'; }
}
ChartKinds.crypto = (el) => {
  const id = el.dataset.id, r = el.dataset.r || '1'; const pts = Crypto.charts[id] && Crypto.charts[id][r];
  if (!pts || pts.length < 2) {
    el.innerHTML = '<p class="mut" style="padding:40px;text-align:center;font-size:13px">Loading chart…</p>';
    if (!el._loading) { el._loading = true; Crypto.chart(id, r).then(() => { el._loading = false; if (el.isConnected) drawCryptoChart(el); }).catch(e => { el._loading = false; el.innerHTML = `<p class="mut" style="padding:40px;text-align:center;font-size:13px">Chart unavailable: ${esc(e.message)}</p>`; }); }
    return;
  }
  drawCryptoChart(el);
};
function drawCryptoChart(el) {
  const id = el.dataset.id, r = el.dataset.r || '1'; const pts = Crypto.charts[id] && Crypto.charts[id][r]; if (!pts || pts.length < 2) return;
  const c = Crypto.byId.get(id); const list = pts.slice(); if (c && c.price != null && r === '1') list[list.length - 1] = [now(), c.price];
  const up = list[list.length - 1][1] >= list[0][1];
  lineChart(el, { values: list.map(x => x[1]), times: list.map(x => x[0]), fmt: (v) => v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : fmtPx(v), color: up ? 'var(--green)' : 'var(--red)' });
}
