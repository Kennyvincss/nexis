/* =====================================================================
   LANDING — public page. Every number on it is live; nothing is invented.
   ===================================================================== */
Views.landing = () => {
  const top = pantaList({ sort: 'volume' }).filter(m => m.tradable).slice(0, 2);
  const live = Sports.list().filter(g => g.state === 'in' && g.home).slice(0, 2);
  const coins = Crypto.coins.slice(0, 5);
  const feedsLive = Object.keys(FEEDS).filter(k => Feeds.live(k)).length;
  return `<div class="landing">
  <header class="l-nav"><a class="logo" href="#/">${logoMark}<span class="wm">NEXIS</span></a>
    <nav><a href="#/markets">Markets</a><a href="#/crypto">Crypto</a><a href="#/sports">Sports</a><a href="#/tracker">Trader Tracker</a></nav>
    <div class="spacer"></div>${Auth.user ? `<a class="btn btn-primary sm" href="#/home">Open dashboard</a>` : `<a class="btn btn-quiet sm l-launch" href="#/login">Log in</a><a class="btn btn-primary sm" href="#/signup">Sign up</a>`}</header>
  <main class="l-wrap">
    <section class="l-hero">
      <div>
        <span class="powered">${pantaMark}Prediction markets powered by Panta</span>
        <h1 style="margin-top:22px">See the signal.<span class="l2">Make the move.</span></h1>
        <p class="sub">Trade real prediction markets on Panta with your Solana wallet, follow live sports and crypto, and track what real traders are doing — all updating in real time.</p>
        <div class="ctas"><a class="btn btn-primary lg" href="#/markets">Explore markets</a><a class="btn btn-ghost lg" href="#/home">Open the live dashboard</a></div>
        <div class="trust"><div><b data-land="panta">${Panta.markets.size || '—'}</b>Panta markets loaded</div><div><b>${Sports.list().filter(g => g.state === 'in').length}</b>games live now</div><div><b>${feedsLive}/${Object.keys(FEEDS).length}</b>data feeds connected</div></div>
      </div>
      <div class="mock" aria-label="Live data">
        <div class="mp stack" style="gap:10px"><div class="mini-row"><b style="font-size:12.5px">Panta</b><span style="margin-left:auto">${srcBadge('panta', true)}</span></div>
          ${top.length ? top.map(m => `<a href="#/market/${m.id}" class="mini-row" style="gap:10px"><h4 style="flex:1;font-size:13px">${esc(m.title)}</h4><span class="mbig up" style="font-size:20px" data-py="${m.id}">${m.yes != null ? cents(m.yes) : '—'}</span></a>`).join('') : `<p class="mut" style="font-size:12.5px">${pantaState() ? 'Panta API not connected on this deployment yet.' : 'Loading Panta markets…'}</p>`}</div>
        <div class="mp stack" style="gap:8px"><div class="mini-row"><b style="font-size:12.5px">Crypto</b><span style="margin-left:auto">${srcBadge('coinbase', true)}</span></div>
          ${coins.length ? coins.map(c => `<a href="#/crypto/${esc(c.id)}" class="mini-row" style="font-size:12.5px"><b>${esc(c.sym)}</b><span class="num" style="margin-left:auto" data-cpx="${esc(c.id)}">${fmtPx(c.price)}</span><span data-cchg="${esc(c.id)}" style="width:62px;text-align:right">${chgCell(c.chg24)}</span></a>`).join('') : '<p class="mut" style="font-size:12.5px">Loading prices…</p>'}</div>
        <div class="mp stack" style="gap:8px"><div class="mini-row"><b style="font-size:12.5px">Live sports</b><span style="margin-left:auto">${srcBadge('espn', true)}</span></div>
          ${live.length ? live.map(g => `<a href="#/event/${g.id}" class="mini-row" style="font-size:12.5px;gap:6px">${crest(g.home, 'sm')}<span>${esc(g.home.abbr || g.home.short)}</span><b class="num" data-gscore="${g.id}">${scoreText(g)}</b><span>${esc(g.away.abbr || g.away.short)}</span>${crest(g.away, 'sm')}<span class="mut" style="margin-left:auto">${esc(g.clock || g.detail)}</span></a>`).join('') : `<p class="mut" style="font-size:12.5px">${Sports.games.size ? 'No games live right now.' : 'Loading scores…'} <a class="link" style="display:inline" href="#/sports">Schedule</a></p>`}</div>
      </div>
    </section>
    <section class="l-sec" id="how">
      <h2>Real markets. Real data. Your keys.</h2>
      <p class="lede">Nexis never holds funds. Every trade is quoted by Panta, signed in your wallet and shown as successful only after Solana confirms it.</p>
      <div class="steps">
        <div><span class="n">01</span><h3>Discover</h3><p>Live Panta markets with current YES/NO prices and volume.</p></div>
        <div><span class="n">02</span><h3>Quote</h3><p>Panta quotes your exact shares and fee before you sign.</p></div>
        <div><span class="n">03</span><h3>Sign</h3><p>Phantom, Backpack or Solflare signs the transaction. USDC settles on Solana.</p></div>
        <div><span class="n">04</span><h3>Track</h3><p>Follow real traders’ positions and get alerted when they move.</p></div>
        <div><span class="n">05</span><h3>Resolve</h3><p>Panta resolves markets against declared sources; you claim winnings on-chain.</p></div>
      </div>
    </section>
    <section class="l-sec l-cta"><div><h2>Where predictions become positions.</h2><p class="lede">Create an account, link a Solana wallet, and trade live Panta markets.</p></div><div class="row"><a class="btn btn-ghost lg" href="#/markets">Explore markets</a><a class="btn btn-primary lg" href="#/signup">Get started</a></div></section>
  </main>
  <footer class="l-foot"><div class="l-wrap"><div class="row"><span class="row">${logoMark.replace('<svg', '<svg width="18" height="18"')}<b style="color:var(--text);letter-spacing:.12em">NEXIS</b><span>· Markets by Panta · Data: Panta, Polymarket, ESPN, CoinGecko, Coinbase, Solana</span></span><span>Prediction markets involve risk of loss. Nothing here is financial advice.</span></div></div></footer>
  </div>`;
};
