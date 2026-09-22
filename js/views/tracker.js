/* =====================================================================
   TRADER TRACKER — search, track, alerts, copy settings (real activity only)
   Tracking only watches. Copy (Panta traders only) never trades by itself:
   each new position becomes a pre-filled order you review and sign.
   ===================================================================== */
const trSrcTag = (id) => isPmId(id) ? '<span class="tag">Polymarket</span>' : '<span class="tag blue">Panta · Solana</span>';
const trExt = (id) => isPmId(id) ? `https://polymarket.com/profile/${id.slice(3)}` : explorerAddr(id.slice(4));
function trAvatar(id, size = '') { const d = Traders.data[id]; return avatarFor(Traders.name(id), d && d.img, size); }
const pnlCell = (v) => v == null ? '<span class="mut">—</span>' : `<span class="num ${v >= 0 ? 'up' : 'down'}">${sUsd(v, Math.abs(v) >= 1000 ? 0 : 2)}</span>`;
function trackBtn(id, name) { return Traders.isTracked(id) ? `<button class="btn btn-ghost sm" data-action="untrack" data-id="${esc(id)}">${ic('check', 'sm')}Tracking</button>` : `<button class="btn btn-primary sm" data-action="track" data-id="${esc(id)}" data-name="${esc(name || '')}">${ic('target', 'sm')}Track</button>`; }

Views.tracker = async (params, arg) => arg ? trackerDetail(arg) : trackerHome();
function trackerHome() {
  const T = Traders.list(); const log = (Store.s.trackerLog || []).slice(0, 25); const act = Traders.pantaActive();
  return `<div class="page"><div class="page-head"><div><h1>Trader Tracker</h1><p>Follow real traders — any Polymarket account or Solana wallet trading on Panta. Tracking only watches and alerts you; it never places trades.</p></div><span class="row">${srcBadge('poly', true)}${srcBadge('panta', true)}</span></div>
    <label class="search-trigger" style="max-width:none;cursor:text;height:44px">${ic('search', 'sm')}<input id="tr-q" value="${esc(UI.tracker.q)}" placeholder="Search a Polymarket username, 0x address or Solana wallet" style="background:none;border:0;outline:none;flex:1;height:100%;color:var(--text)" aria-label="Search traders" autocomplete="off"></label>
    <div id="tr-results" style="margin-top:10px">${trResults()}</div>
    <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:18px;margin-top:18px" id="tr-grid">
      <div class="stack" style="gap:18px">
        <div class="card"><div class="card-head"><h3>Tracked traders</h3><span class="mut num" style="font-size:12px">${T.length}</span></div>
          ${T.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Trader</th><th class="r">Portfolio</th><th class="r">Open P&amp;L</th><th class="r">Active</th><th>Alerts</th><th>Copy</th></tr></thead><tbody>${T.map(t => { const d = Traders.data[t.id] || {}; const s = d.stats || {}; const cp = Store.s.copy[t.id];
            return `<tr class="click" data-href="${Traders.href(t.id)}"><td><span class="row" style="gap:10px">${trAvatar(t.id, 'sm')}<span style="min-width:0"><b style="font-weight:600">@${esc(Traders.name(t.id))}</b><div class="mut" style="font-size:11.5px">${isPmId(t.id) ? 'Polymarket' : 'Panta'} · ${d.error ? '<span class="down">unavailable</span>' : d.t ? 'updated ' + ago(d.t) : 'loading…'}</div></span></span></td><td class="r num">${s.value != null ? usd(s.value, 0) : '—'}</td><td class="r">${pnlCell(s.unreal)}</td><td class="r num">${s.active ?? '—'}</td><td>${t.notify ? '<span class="tag green">On</span>' : '<span class="tag">Off</span>'}</td><td>${cp && cp.on ? `<span class="tag blue">≤ ${usd(cp.max, 0)}</span>` : '<span class="mut">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
            : emptyState({ icon: 'target', title: 'Not tracking anyone yet', body: 'Search above, or pick someone from the leaderboard or a market’s trades tape.' })}</div>
        <div class="card"><div class="card-head"><h3>Tracked activity</h3>${log.length ? '<span class="mut" style="font-size:12px">From real positions, detected as they change</span>' : ''}</div>
          ${log.length ? log.map(trLogRow).join('') : `<p class="mut" style="padding:14px 18px;font-size:13px">${T.length ? 'No changes detected since you started tracking. New positions, size changes and closes appear here and as notifications.' : 'Activity from traders you track appears here.'}</p>`}</div>
      </div>
      <div class="stack" style="gap:18px">
        <div class="card"><div class="card-head"><h3>Top traders this week</h3>${srcBadge('poly', true)}</div><div id="tr-lb"><p class="mut" style="padding:14px 18px;font-size:13px">Loading leaderboard…</p></div></div>
        <div class="card"><div class="card-head"><h3>Active on Panta</h3>${srcBadge('panta', true)}</div>${act.length ? act.map(r => `<a class="row" href="${Traders.href(r.id)}" style="padding:10px 18px;border-bottom:1px solid var(--line);gap:10px">${avatarFor(r.name, null, 'sm')}<span class="num" style="font-size:13px">${esc(r.name)}</span><span class="mut" style="margin-left:auto;font-size:12px">${r.n} trade${r.n === 1 ? '' : 's'} · ${fmtNum(r.amt, 0)}</span></a>`).join('') : `<p class="mut" style="padding:14px 18px;font-size:13px">${Panta.state === 'live' ? 'Wallets appear here as Nexis loads Panta trades.' : 'Needs the Panta API.'}</p>`}</div>
      </div>
    </div></div>`;
}
function trLogRow(x) { return `<a class="notif" href="${Traders.href(x.tid)}"><span class="ni">${ic(x.kind === 'open' ? 'trend' : x.kind === 'close' ? 'flag' : 'sliders', 'sm')}</span><p>${esc(x.text)}</p><span class="when">${ago(x.t)}</span></a>`; }
function trResults() {
  const q = UI.tracker.q.trim(); if (q.length < 2) return '';
  if (UI.tracker.searching && !UI.tracker.results) return '<div class="card card-pad"><span class="spin"></span> <span class="mut" style="font-size:13px">Searching…</span></div>';
  const r = UI.tracker.results || [];
  if (!r.length) return `<div class="card card-pad mut" style="font-size:13px">No traders found for “${esc(q)}”. Paste a full 0x address (Polymarket) or a Solana wallet address.</div>`;
  return `<div class="card">${r.map(x => `<div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);gap:12px">${avatarFor(x.name, x.img, 'sm')}<a href="${Traders.href(x.id)}" style="min-width:0;flex:1"><b style="font-size:13.5px">@${esc(x.name)}</b><div class="mut" style="font-size:11.5px">${esc(x.sub)} · <span class="num">${esc(shortW(x.id.split(':')[1]))}</span></div></a>${trackBtn(x.id, x.name)}</div>`).join('')}</div>`;
}
async function paintLeaderboard() {
  const box = $('#tr-lb'); if (!box) return; const lb = await Traders.leaderboard(); const b = $('#tr-lb'); if (!b) return;
  b.innerHTML = lb && lb.rows.length ? lb.rows.slice(0, 12).map((r, i) => `<div class="row" style="padding:9px 16px;border-bottom:1px solid var(--line);gap:10px"><span class="mut num" style="width:18px;font-size:12px">${i + 1}</span>${avatarFor(r.name, r.img, 'sm')}<a href="${Traders.href(r.id)}" style="min-width:0;flex:1;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@${esc(r.name)}</a>${r.pnl != null ? pnlCell(r.pnl) : r.vol != null ? `<span class="num mut" style="font-size:12px">${kusd(r.vol)}</span>` : ''}${trackBtn(r.id, r.name)}</div>`).join('') + `<p class="mut" style="padding:8px 16px;font-size:11.5px">${esc(lb.src)}</p>`
    : `<p class="mut" style="padding:14px 18px;font-size:13px">${Feeds.live('polymarket') ? 'Leaderboard unavailable right now.' : 'Polymarket data is unavailable right now.'}</p>`;
}

async function trackerDetail(id) {
  if (!isPmId(id) && !isSolId(id)) throw new Error('That isn’t a valid trader address. Use pm:0x… for Polymarket or sol:<wallet> for Panta.');
  let d = Traders.data[id]; if (!d || d.error) d = await Traders.load(id);
  const t = Traders.entry(id); const name = Traders.name(id); const tab = UI.tracker.tab; const pm = isPmId(id);
  const head = `<a class="link" href="#/tracker">${ic('chevLeft', 'sm')}Trader Tracker</a>
    <div class="card profile-hero" style="margin-top:12px;padding:20px"><div class="row wrap" style="gap:16px">${trAvatar(id, 'lg')}<div style="min-width:0;flex:1"><h1 style="font-size:24px">@${esc(name)}</h1><div class="row wrap" style="gap:8px;margin-top:6px;font-size:12.5px">${trSrcTag(id)}<button class="link num" data-action="copyAddr" data-a="${esc(id.split(':')[1])}" style="display:inline-flex">${esc(shortW(id.split(':')[1]))} ${ic('copy', 'sm')}</button><a class="link" href="${trExt(id)}" target="_blank" rel="noopener" style="display:inline-flex">${pm ? 'Polymarket profile' : 'Solscan'} ${ic('ext', 'sm')}</a>${d && d.t ? `<span class="mut">Updated ${agoT(d.t)} · refreshes every 20s</span>` : ''}</div>${d && d.bio ? `<p class="dim" style="margin-top:8px;font-size:13px">${esc(d.bio)}</p>` : ''}</div>
      <div class="row wrap" style="gap:8px">${trackBtn(id, name)}${t ? `<button class="btn btn-ghost sm" data-action="trNotify" data-id="${esc(id)}">${ic(t.notify ? 'bell' : 'bellOff', 'sm')}Alerts ${t.notify ? 'on' : 'off'}</button>` : ''}<button class="btn ${Store.s.copy[id] && Store.s.copy[id].on ? 'btn-blue' : 'btn-ghost'} sm" data-action="copySettings" data-id="${esc(id)}">${ic('copy', 'sm')}${Store.s.copy[id] && Store.s.copy[id].on ? 'Copying' : 'Copy trades'}</button></div></div></div>`;
  if (d && d.error && !d.positions) return `<div class="page">${head}<div style="margin-top:16px">${unavailable('Trader data unavailable', esc(d.error) + ' Nexis retries automatically.', '<button class="btn btn-ghost sm" data-action="retry">Retry now</button>')}</div></div>`;
  const s = d.stats || {};
  const stat = (k, v, sub = '') => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s mut">${sub}</div>` : ''}</div>`;
  const tabs = ['Positions', 'Activity', 'History'];
  return `<div class="page">${head}
    <div class="stats-strip tracker-stats" style="margin-top:16px">
      ${stat('Portfolio value', s.value != null ? usd(s.value, 0) : '—', pm ? 'Open positions' : 'At Panta prices')}
      ${stat('Open P&amp;L', s.unreal != null ? pnlCell(s.unreal) : '—', pm ? 'Unrealized' : 'Entry not published')}
      ${stat('Realized P&amp;L', s.realized != null ? pnlCell(s.realized) : '—', pm ? `${s.closedN || 0} closed` : '')}
      ${stat('Win rate', s.winRate != null ? s.winRate + '%' : '—', pm ? 'Closed positions' : '')}
      ${stat('ROI', s.roi != null ? pctOrDash(s.roi) : '—')}
      ${stat('Trades', s.trades != null ? fmtNum(s.trades, 0) : '—', pm ? 'Markets traded' : '')}
      ${stat('Recent volume', s.volume != null ? kusd(s.volume) : '—', pm ? 'Last 100 activities' : '')}
      ${stat('Active markets', s.active ?? '—', s.claimable ? `${s.claimable} claimable` : '')}
    </div>
    ${d.perf && d.perf.length >= 2 ? `<div class="card" style="margin-top:16px"><div class="card-head"><h3>Cumulative P&amp;L</h3><span class="mut" style="font-size:12px">Closed positions + current open P&amp;L</span></div><div class="chart-box" style="height:220px;margin:0 12px 12px" data-chart="trader" data-id="${esc(id)}"></div></div>` : ''}
    ${!pm ? infoNote('Panta publishes this wallet’s current positions but not its entry prices, so P&amp;L and win rate can’t be computed. Position changes are detected every 20 seconds.') : ''}
    <div class="tabs" style="margin-top:18px">${tabs.map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-action="trTab" data-t="${k}">${k}${k === 'Positions' ? ` <span class="mut num">${d.positions.length}</span>` : ''}</button>`).join('')}</div>
    <div style="margin-top:14px">${tab === 'Positions' ? trPositions(d) : tab === 'Activity' ? trActivity(d) : trHistory(d)}</div></div>`;
}
function trPositions(d) {
  if (!d.positions.length) return `<div class="card">${emptyState({ icon: 'brief', title: 'No open positions', body: 'New positions appear here within 20 seconds.' })}</div>`;
  return `<div class="card table-wrap"><table class="t"><thead><tr><th>Market</th><th>Side</th><th class="r">Entry</th><th class="r">Current</th><th class="r">Shares</th><th class="r">Value</th><th class="r">P&amp;L</th></tr></thead><tbody>${d.positions.map(p => {
    const href = p.mId ? `#/market/${p.mId}` : p.slug ? `https://polymarket.com/event/${encodeURIComponent(p.slug)}` : '';
    return `<tr ${p.mId ? `class="click" data-href="${href}"` : ''}><td class="q" style="max-width:380px;white-space:normal">${p.mId || !href ? esc(p.title) : `<a href="${href}" target="_blank" rel="noopener">${esc(p.title)}</a>`}${p.outcome && !/^(yes|no)$/i.test(p.outcome) ? `<div class="mut" style="font-size:11.5px">${esc(p.outcome)}</div>` : ''}${p.claimable && !p.claimed ? ' <span class="tag green">Claimable</span>' : ''}</td><td><span class="tag ${p.side === 'YES' ? 'green' : 'red'}">${p.side}</span></td><td class="r num">${p.entry != null ? cents(p.entry) : '—'}</td><td class="r num" ${p.mId ? `data-p${p.side === 'YES' ? 'y' : 'n'}="${p.mId}"` : ''}>${p.cur != null ? cents(p.cur) : '—'}</td><td class="r num">${fmtNum(p.shares, 2)}</td><td class="r num">${p.value != null ? usd(p.value) : '—'}</td><td class="r">${p.pnl != null ? pnlCell(p.pnl) + (p.pnlPct ? ` <span class="mut num" style="font-size:11.5px">${pct(p.pnlPct, 0)}</span>` : '') : '<span class="mut">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function trActivity(d) {
  if (d.src === 'pm') {
    const L = d.activity.filter(a => ['TRADE', 'REDEEM', 'SPLIT', 'MERGE'].includes(a.type)).slice(0, 60);
    if (!L.length) return `<div class="card">${emptyState({ icon: 'clock', title: 'No recent activity', body: 'Trades appear here as they happen.' })}</div>`;
    return `<div class="card table-wrap"><table class="t"><thead><tr><th>Time</th><th>Action</th><th>Market</th><th class="r">Price</th><th class="r">Size</th><th></th></tr></thead><tbody>${L.map(a => `<tr><td class="mut">${ago(a.t)}</td><td><span class="${a.sideTx === 'SELL' ? 'down' : 'up'}" style="font-weight:600;font-size:12.5px">${a.type === 'TRADE' ? esc(a.sideTx) : esc(a.type)}</span> <span class="tag ${a.side === 'YES' ? 'green' : 'red'}">${esc(a.outcome || a.side)}</span></td><td class="q" style="max-width:360px;white-space:normal">${esc(a.title || '')}</td><td class="r num">${a.price ? cents(a.price) : '—'}</td><td class="r num">${usd(a.usd, a.usd < 100 ? 2 : 0)}</td><td>${a.tx ? `<a href="https://polygonscan.com/tx/${esc(a.tx)}" target="_blank" rel="noopener" aria-label="View transaction">${ic('ext', 'sm')}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const L = (d.activity || []).slice(0, 60);
  return L.length ? `<div class="card">${L.map(trLogRow).join('')}</div>` : `<div class="card">${emptyState({ icon: 'clock', title: 'No changes detected yet', body: Traders.isTracked(d.id) ? 'Nexis compares this wallet’s Panta positions every 20 seconds and logs every change here.' : 'Track this wallet so Nexis can detect and log its position changes.' })}</div>`;
}
function trHistory(d) {
  const L = d.closed || [];
  if (!L.length) return `<div class="card">${emptyState({ icon: 'flag', title: 'No closed positions', body: d.src === 'pm' ? 'Closed and redeemed positions appear here.' : 'Resolved Panta positions appear here.' })}</div>`;
  return `<div class="card table-wrap"><table class="t"><thead><tr><th>Closed</th><th>Market</th><th>Side</th><th class="r">Entry</th><th class="r">Shares</th><th class="r">Realized P&amp;L</th></tr></thead><tbody>${L.slice(0, 80).map(p => `<tr><td class="mut">${p.t ? fmtDate(p.t) : '—'}</td><td class="q" style="max-width:380px;white-space:normal">${esc(p.title)}</td><td><span class="tag ${p.side === 'YES' ? 'green' : 'red'}">${esc(p.outcome || p.side)}</span>${p.result ? ` <span class="mut" style="font-size:11.5px">resolved ${esc(p.result)}</span>` : ''}</td><td class="r num">${p.entry != null ? cents(p.entry) : '—'}</td><td class="r num">${fmtNum(p.shares, 2)}</td><td class="r">${pnlCell(p.pnl ?? null)}</td></tr>`).join('')}</tbody></table></div>`;
}
ChartKinds.trader = (el) => { const d = Traders.data[el.dataset.id]; if (!d || !d.perf || d.perf.length < 2) return; lineChart(el, { values: d.perf.map(x => x[1]), times: d.perf.map(x => x[0]), fmt: (v) => (v < 0 ? '−$' : '$') + kfmt(Math.abs(v)), color: d.perf[d.perf.length - 1][1] >= 0 ? 'var(--green)' : 'var(--red)', zero: 0 }); };

/* ---------- copy settings ---------- */
function openCopyModal(id) {
  if (!Auth.user) return requireAuth(() => {}, 'Log in to copy traders');
  const name = Traders.name(id);
  if (isPmId(id)) return openModal(`${modalHead('Copy @' + esc(name))}<div class="modal-body">${emptyState({ icon: 'info', title: 'Polymarket traders can’t be copied here', body: 'Nexis trades on Panta (Solana). This trader’s positions are on Polymarket (Polygon), so there’s nothing to mirror on Panta. You can still track them and get alerts.' })}</div><div class="modal-foot">${Traders.isTracked(id) ? '' : `<button class="btn btn-primary" data-action="track" data-id="${esc(id)}">Track instead</button>`}<button class="btn btn-ghost" data-action="closeModal">Close</button></div>`);
  const cp = Store.s.copy[id] || { on: false, max: 10 };
  openModal(`${modalHead('Copy @' + esc(name), 'Panta trader · Solana')}<div class="modal-body">
    <label class="row" style="justify-content:space-between;gap:12px"><span><b>Copy new positions</b><div class="mut" style="font-size:12.5px">When @${esc(name)} opens or adds to a position, Nexis prepares the same side on the same market for you.</div></span><input type="checkbox" class="toggle" id="cp-on" ${cp.on ? 'checked' : ''}></label>
    <label class="field"><span>Maximum per copied trade (USDC)</span><input class="input" id="cp-max" inputmode="decimal" value="${esc(cp.max)}"></label>
    ${infoNote('Nothing is executed automatically. Each copy opens a Panta quote that you confirm and sign in your own wallet, so you always see the price and fee first. Copying also turns on tracking.')}
    ${!primaryWallet() ? `<p class="mut" style="font-size:12.5px">You’ll need a linked Solana wallet to sign copied trades.</p>` : ''}</div>
    <div class="modal-foot"><button class="btn btn-ghost" data-action="closeModal">Cancel</button><button class="btn btn-primary" data-action="saveCopy" data-id="${esc(id)}">Save</button></div>`);
}
function saveCopy(id) {
  const on = $('#cp-on').checked; const max = nz($('#cp-max').value, 0);
  if (on && !(max >= 1)) return toast({ title: 'Set a maximum of at least $1', kind: 'warn' });
  Store.s.copy[id] = { on, max: Math.round(max * 100) / 100, since: now() }; if (on && !Traders.isTracked(id)) Traders.track(id);
  Store.emit('copy'); closeModal(); toast({ title: on ? `Copying @${Traders.name(id)}` : 'Copy trading off', body: on ? `New positions become orders up to ${usd(max, 0)} for you to sign.` : '', kind: on ? 'ok' : 'info' }); refresh();
}
