/* =====================================================================
   REWARDS VIEWS — Membership hub (#/rewards), leaderboard (#/leaderboard),
   referral landing (#/join?ref=N), public card (#/member/N), admin
   (#/admin), the member-number / credit reveal, the shareable Member Card,
   and small cards used on Home, Profile and the landing page.
   ===================================================================== */
const rwMoney = (n, dp = 0) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const rwBrand = () => (Rewards.cfg && Rewards.cfg.brand) || 'Nexis';
const rwJoinLink = (n) => `${location.origin}/join?ref=${n}`;
const rwXHandle = () => { const x = Rewards.cfg && Rewards.cfg.social && Rewards.cfg.social.x; return x ? '@' + x.replace(/^@/, '') : ''; };
function rwDemoNote() { return Rewards.demo ? `<div class="rw-demo">${ic('info', 'sm')}<span><b>Demo data.</b> The rewards server isn’t connected on this deployment, so member numbers, counts and rankings here are examples, not real members.</span></div>` : ''; }
function rwPhasePill() { const p = Rewards.phase; return `<span class="rw-phase"><i></i>Phase ${p} · ${esc(RW_PHASES[p] || '')}</span>`; }
function rwStatePill(cls = '') { const s = Rewards.creditState(); return `<span class="rw-state ${s.key} ${cls}">${ic(s.icon, 'sm')}${esc(s.label.toUpperCase())}</span>`; }
const rwCreditsText = (m) => !m.credits || m.credits.hidden ? null : rwMoney(m.credits.amount);
const rwMedal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="num">${i + 1}</span>`;

/* ---------- Member Card ---------- */
function rwMemberCard(m, { compact = false } = {}) {
  const credits = rwCreditsText(m); const st = m.status || rwStatusOf(m.xp || 0);
  return `<div class="rw-card ${compact ? 'compact' : ''}" aria-label="Member card"><div class="rw-card-glow"></div><div class="rw-card-shine"></div>
    <div class="rw-card-top"><span class="rw-card-brand">${logoMark}<span>${esc(rwBrand().toUpperCase())}</span></span><span class="rw-pill">${m.early !== false ? 'EARLY MEMBER' : 'MEMBER'}</span></div>
    <div class="rw-card-mid"><div class="rw-card-label">MEMBER</div><div class="rw-card-num num">#${m.n}</div><div class="rw-card-handle">@${esc(m.handle || 'you')}</div></div>
    <div class="rw-card-stats"><div><span>CREDITS</span><b class="num">${credits || '🔒'}</b></div><div><span>REFERRALS</span><b class="num">${(m.refs && m.refs.qualified) || 0}</b></div><div><span>STATUS</span><b>${esc(st.name)}</b></div></div>
    ${compact ? '' : `<div class="rw-card-foot num">${esc(location.host)}/join?ref=${m.n}</div>`}</div>`;
}
/** The card as a 1200×675 PNG (good on X), drawn on a canvas. */
async function rwCardBlob(m) {
  const W = 1200, Hh = 675, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, Hh); g.addColorStop(0, '#0B1020'); g.addColorStop(.55, '#0A0D18'); g.addColorStop(1, '#140C2A'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  const glow = (cx, cy, r, col) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, Hh); };
  glow(980, 120, 520, 'rgba(142,107,255,.35)'); glow(160, 620, 520, 'rgba(61,123,255,.28)');
  x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 2; x.strokeRect(28, 28, W - 56, Hh - 56);
  const F = (w, s) => `${w} ${s}px Geist, Inter, system-ui, -apple-system, Segoe UI, sans-serif`, M = (w, s) => `${w} ${s}px "Geist Mono", ui-monospace, Menlo, monospace`;
  x.fillStyle = '#F2F4F8'; x.font = F(700, 34); x.fillText(rwBrand().toUpperCase(), 80, 112);
  const pill = m.early !== false ? 'EARLY MEMBER' : 'MEMBER'; x.font = F(700, 22); const pw = x.measureText(pill).width + 44;
  x.fillStyle = 'rgba(242,181,68,.16)'; x.beginPath(); x.roundRect(W - 80 - pw, 78, pw, 46, 23); x.fill(); x.fillStyle = '#F2B544'; x.fillText(pill, W - 80 - pw + 22, 109);
  x.fillStyle = '#A7AEBD'; x.font = F(600, 26); x.fillText('MEMBER', 80, 250);
  const ng = x.createLinearGradient(80, 0, 760, 0); ng.addColorStop(0, '#FFFFFF'); ng.addColorStop(1, '#B8A4FF'); x.fillStyle = ng; x.font = M(700, 150); x.fillText('#' + m.n, 72, 385);
  x.fillStyle = '#F2F4F8'; x.font = F(600, 40); x.fillText('@' + (m.handle || 'you'), 80, 450);
  const credits = rwCreditsText(m) || 'LOCKED', refs = String((m.refs && m.refs.qualified) || 0), st = (m.status || rwStatusOf(m.xp || 0)).name;
  [['CREDITS', credits], ['REFERRALS', refs], ['STATUS', st]].forEach(([k, v], i) => { const bx = 80 + i * 300; x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(bx, 492, 270, 96, 14); x.fill(); x.fillStyle = '#6C7488'; x.font = F(600, 18); x.fillText(k, bx + 22, 529); x.fillStyle = '#F2F4F8'; let fs = k === 'STATUS' ? 28 : 34; x.font = k === 'STATUS' ? F(700, fs) : M(700, fs); while (x.measureText(v).width > 226 && fs > 16) { fs -= 2; x.font = k === 'STATUS' ? F(700, fs) : M(700, fs); } x.fillText(v, bx + 22, 571); });
  x.fillStyle = '#6C7488'; x.font = M(500, 20); x.fillText(`${location.host}/join?ref=${m.n}`, 80, 626);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function rwDownloadCard() {
  const m = Rewards.me; if (!m) return; const blob = await rwCardBlob(m); if (!blob) return toast({ title: 'Couldn’t create the image', kind: 'warn' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${rwBrand().toLowerCase()}-member-${m.n}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function rwShareText(m) {
  const credits = Rewards.creditsVisible && m.credits && !m.credits.hidden && m.credits.status === 'granted' && m.credits.amount ? `\n${rwMoney(m.credits.amount)} in credits waiting for me.` : '';
  return `I'm officially Member #${m.n} of ${rwBrand()} 👀${credits}${rwXHandle() ? '\n' + rwXHandle() : ''}\n\n${rwJoinLink(m.n)}`;
}
function rwShare() {
  const m = Rewards.me; if (!m) return;
  openModal(`${modalHead('Share your Member Card', 'Edit the post, then publish it on X')}<div class="modal-body">
    <div style="max-width:420px;margin:0 auto;width:100%">${rwMemberCard(m, { compact: true })}</div>
    <label class="field"><span>Your post</span><textarea class="textarea" id="rw-share-text" maxlength="280" style="min-height:120px">${esc(rwShareText(m))}</textarea></label>
    <p class="mut" style="font-size:12px">X opens with this text so you can change it again before posting. Download the card to attach it as an image.</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-action="rwDownload">${ic('download', 'sm')}Download card</button><button class="btn btn-primary" data-action="rwPostX">Post on X</button></div>`, { label: 'Share Member Card' });
}

/* ---------- reveal flow ---------- */
function rwCountUp(el, to, ms = 1400, fmt = (v) => String(v), from = 0) {
  if (!el) return; const t0 = performance.now(); let end = false;
  const fin = () => { if (end) return; end = true; el.textContent = fmt(to); el.classList.add('done'); };
  const step = (t) => { if (end) return; const k = Math.min(1, Math.max(0, (t - t0) / ms)); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); else fin(); };
  requestAnimationFrame(step); setTimeout(fin, ms + 250); // lands on the real value even if animation frames are paused
}
const rwReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
/** Slot-machine reel: flicks through possible amounts, slows down and lands on the real one. Never shows $0. */
function rwSpin(el, final, done) {
  if (!el) return done && done();
  const pool = [...new Set([...(((Rewards.cfg && Rewards.cfg.credits) || []).filter(a => a >= 20)), 20, 25, 30, 37, 50, 100, 250, 500])];
  if (rwReduced()) { el.textContent = rwMoney(final); return done && done(); }
  let i = 0, last = null; const N = 24;
  const tick = () => {
    i++; let v = final;
    if (i < N) { const opts = pool.filter(a => a !== last && a !== final); v = opts[Math.floor(Math.random() * opts.length)] || final; }
    last = v; el.textContent = rwMoney(v); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    if (i < N) setTimeout(tick, 45 + Math.pow(i / N, 3) * 380); else { el.classList.add('landed'); done && done(); }
  };
  tick();
}
/** Confetti burst over the page (skipped when the visitor prefers reduced motion). */
function rwConfetti(n = 90) {
  if (rwReduced()) return; const box = document.createElement('div'); box.className = 'rw-confetti'; box.setAttribute('aria-hidden', 'true');
  const C = ['#F2B544', '#FFE7B0', '#8E6BFF', '#3D7BFF', '#1FCB7C', '#FF5C8A', '#FFFFFF'];
  for (let i = 0; i < n; i++) { const p = document.createElement('i'); const w = 6 + Math.random() * 6; p.style.cssText = `left:${Math.random() * 100}%;background:${C[i % C.length]};width:${w}px;height:${w * (1.2 + Math.random())}px;--dx:${Math.round((Math.random() - .5) * 260)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;animation-delay:${(Math.random() * .3).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s;${i % 3 ? '' : 'border-radius:50%;'}`; box.appendChild(p); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3800);
}
/** Plays an entrance animation the first time a page is shown in this visit, not on every refresh. */
function rwOnce(key) { UI.rwSeen = UI.rwSeen || {}; if (UI.rwSeen[key]) return ''; UI.rwSeen[key] = true; return 'rw-stagger'; }
/** Counts up elements marked data-count (member counter, referral stats) the first time they appear. */
function rwAnimate(root) {
  if (!root || rwReduced()) return; UI.rwCounted = UI.rwCounted || {};
  root.querySelectorAll('[data-count]').forEach(el => { const k = el.dataset.ck || ''; const to = +el.dataset.count || 0; if (!k || UI.rwCounted[k] === to || to < 1) return; const from = UI.rwCounted[k] || 0; UI.rwCounted[k] = to; rwCountUp(el, to, 1100, (v) => fmtNum(v, 0), from); });
}
function rwReveal(step = 'number') {
  const m = Rewards.me; if (!m) { Rewards._revealing = false; return; }
  // One finish per reveal flow (the steps share it): marks the reveal seen right away, then on the server.
  const finish = UI.rwRevealDone || (UI.rwRevealDone = () => { UI.rwRevealDone = null; if (Rewards.me) Object.assign(Rewards.me, { revealed: true, revealedPhase: Rewards.phase }); Rewards._revealing = false; Rewards.act('reveal').catch(() => {}); });
  if (step === 'number') {
    openModal(`<div class="rw-reveal"><div class="rw-burst"></div><div class="rw-kicker">WELCOME TO ${esc(rwBrand().toUpperCase())}</div><div class="rw-reveal-label">YOUR MEMBER NUMBER</div>
      <div class="rw-big-num num" id="rw-num">#${m.n}</div><div class="row" style="justify-content:center;gap:8px"><span class="rw-pill">${m.early !== false ? 'EARLY MEMBER' : 'MEMBER'}</span>${Rewards.demo ? '<span class="tag">DEMO</span>' : ''}</div>
      <p class="dim" style="margin-top:14px">This number is yours permanently. Nobody else will ever be Member #${m.n}.</p>
      <button class="btn btn-primary lg block" style="margin-top:18px" data-action="rwRevealNext" data-step="${Rewards.creditsVisible && m.credits && !m.credits.hidden ? 'credits' : 'done'}">${Rewards.creditsVisible && m.credits && !m.credits.hidden ? 'Reveal my reward' : 'Continue'}</button></div>`, { label: 'Your member number', onClose: finish });
    if (!rwReduced()) rwCountUp($('#rw-num'), m.n, 1500, (v) => '#' + Math.max(1, v)); setTimeout(() => rwConfetti(50), 1300);
  } else if (step === 'credits') {
    const amt = m.credits.amount;
    setModalOrOpen(`<div class="rw-reveal"><div class="rw-burst gold"></div><div class="rw-kicker">MYSTERY REWARD</div>
      <div class="rw-box-wrap"><div class="rw-rays"></div><button class="rw-box" data-action="rwOpenBox" aria-label="Open your reward">${ic('gift', 'lg')}<span>Tap to open</span></button></div>
      <div id="rw-credit" class="hide"><div class="rw-reveal-label" id="rw-amt-label">SPINNING…</div><div class="rw-slot-win"><div class="rw-big-num num gold" id="rw-amt">${rwMoney(Math.max(20, ((Rewards.cfg && Rewards.cfg.credits) || [20])[0] || 20))}</div></div><div class="rw-reveal-label">IN CREDITS</div>
      <div id="rw-credit-more" class="hide">
      ${m.credits.status === 'held' ? `<div class="rw-note warn">${ic('shield', 'sm')}<span>Your credits are under review while we verify your account. This is routine and protects the program from duplicate accounts.</span></div>` : ''}
      <div class="rw-note">${ic('info', 'sm')}<span><b>Promotional platform credits, not cash.</b> They’re already in your account and can be used on eligible ${esc(rwBrand())} products once the Credit Guide drops. They can’t be withdrawn.</span></div>
      <div class="rw-uses">${(Rewards.cfg.uses || []).map(u => `<span class="tag">${esc(u.label)}</span>`).join('')}</div>
      <button class="btn btn-primary lg block" style="margin-top:16px" data-action="rwRevealNext" data-step="waiting">Continue</button></div></div></div>`, 'Your reward', finish);
    UI.rwAmt = amt;
  } else if (step === 'waiting') {
    setModalOrOpen(`<div class="rw-reveal">${Rewards.guidePublished ? `<div class="rw-kicker">THE GUIDE IS LIVE</div><h2 class="rw-h">HOW TO USE YOUR CREDITS</h2><p class="dim">The Credit Guide explains exactly where and how your credits work.</p>`
      : `<div class="rw-kicker">YOUR CREDITS ARE WAITING</div><h2 class="rw-h">We’ll drop a full guide on how to use your credits soon.</h2><div class="rw-guide-lock">${ic('lock', 'sm')}CREDIT GUIDE — COMING SOON</div>${rwCountdownBlock()}`}
      <p class="mut" style="font-size:12.5px;margin-top:10px">Meanwhile: get your Member Card, complete your launch missions and invite friends to climb the leaderboard.</p>
      <a class="btn btn-primary lg block" style="margin-top:16px" href="${Rewards.home()}" data-action="rwRevealClose">${Rewards.guidePublished ? 'Read the Credit Guide' : 'Get my Member Card'}</a></div>`, 'Credit guide', finish);
  } else { if ($('.overlay .modal')) closeModal(); else finish(); }
}
function setModalOrOpen(html, label, onClose) { if ($('.overlay .modal')) setModal(html); else openModal(html, { label, onClose }); }
function rwCountdownBlock() { const t = Rewards.cfg && Rewards.cfg.countdownAt; return t && t > Date.now() ? `<div class="rw-countdown"><span class="mut">Guide drops in</span><b class="num" data-rwcd="${t}">${rwCountdownText(t - Date.now())}</b></div>` : ''; }

/* ---------- panels ---------- */
function rwCreditPanel(m) {
  const credits = rwCreditsText(m);
  return `<div class="card rw-credit"><div class="rw-credit-head"><span class="rw-eyebrow">CREDIT BALANCE</span>${rwStatePill()}</div>
    ${credits ? `<div class="rw-credit-amt num">${rwMoney(m.credits.amount, 2)}</div><div class="rw-eyebrow mut">PROMOTIONAL CREDITS</div>` : `<div class="rw-credit-amt num locked">$•••</div><div class="rw-eyebrow mut">MYSTERY REWARD · REVEALED IN PHASE 2</div>`}
    ${m.credits && m.credits.status === 'held' ? `<div class="rw-note warn" style="margin-top:12px">${ic('shield', 'sm')}<span>Under review: we’re verifying this account before its credits are confirmed.</span></div>` : ''}
    <p class="mut" style="font-size:12px;margin-top:12px">Promotional platform credits for eligible ${esc(rwBrand())} products. Not cash and not withdrawable.</p></div>`;
}
function rwGuideBody(text) {
  const lines = String(text || '').split(/\n/); let html = '', list = false;
  for (const l of lines) { const t = l.trim(); if (/^[-*•]\s+/.test(t)) { if (!list) { html += '<ul>'; list = true; } html += `<li>${esc(t.replace(/^[-*•]\s+/, ''))}</li>`; continue; } if (list) { html += '</ul>'; list = false; } if (!t) continue; html += /^#{1,3}\s/.test(t) ? `<h4>${esc(t.replace(/^#+\s*/, ''))}</h4>` : `<p>${esc(t)}</p>`; }
  return html + (list ? '</ul>' : '');
}
function rwGuidePanel() {
  const cfg = Rewards.cfg || {}; const uses = cfg.uses || [];
  if (Rewards.guidePublished) return `<div class="card rw-guide open"><div class="card-head"><h3>${ic('check', 'sm')}${esc((cfg.guide && cfg.guide.title) || 'How to use your credits').toUpperCase()}</h3>${rwStatePill()}</div><div class="card-pad rw-guide-body">${rwGuideBody(cfg.guide.body) || '<p class="mut">The guide is live. Details below.</p>'}
    <h4>Where credits work</h4><div class="rw-use-list">${uses.map(u => `<div class="rw-use ${u.active ? 'on' : ''}"><b>${esc(u.label)}</b><span class="mut">${esc(u.desc)}</span><span class="tag ${u.active ? 'green' : ''}">${u.active ? 'Available' : 'Coming soon'}</span></div>`).join('')}</div>
    <p class="mut" style="font-size:12px">Credits are promotional and can’t be withdrawn as cash.</p></div></div>`;
  return `<div class="card rw-guide"><div class="rw-guide-inner"><span class="rw-eyebrow">YOUR CREDITS ARE WAITING</span><h3 class="rw-h">We’ll drop a full guide on how to use your credits soon.</h3>
    <div class="rw-guide-lock">${ic('lock', 'sm')}CREDIT GUIDE — COMING SOON</div>${rwCountdownBlock()}
    <div class="rw-eyebrow mut" style="margin-top:14px">PLANNED USES · CONFIRMED IN THE GUIDE</div><div class="rw-uses">${uses.map(u => `<span class="tag">${esc(u.label)}</span>`).join('')}</div>
    <p class="mut" style="font-size:12px;margin-top:10px">Credits are promotional, can’t be withdrawn, and only work where the guide says.</p></div></div>`;
}
function rwMissionsPanel(m) {
  const L = (Rewards.cfg && Rewards.cfg.missions) || []; const done = L.filter(x => m.missions && m.missions[x.id]).length;
  const row = (x) => { const d = !!(m.missions && m.missions[x.id]); let act = '';
    if (!d && x.kind === 'link') act = x.url ? `<a class="btn btn-ghost sm" href="${esc(x.url)}" target="_blank" rel="noopener" data-action="rwMissionOpen" data-id="${esc(x.id)}">Open ${ic('ext', 'sm')}</a><button class="btn btn-ghost sm" data-action="rwMissionDone" data-id="${esc(x.id)}" ${UI.rwOpened && UI.rwOpened[x.id] ? '' : 'disabled'} title="Self-reported">Done</button>` : '<span class="mut" style="font-size:12px">Link coming soon</span>';
    if (!d && x.kind === 'share') act = `<button class="btn btn-ghost sm" data-action="rwShare">Share card</button>`;
    if (!d && x.kind === 'referrals') act = `<span class="num mut" style="font-size:12.5px">${Math.min((m.refs && m.refs.qualified) || 0, x.target)} / ${x.target}</span>`;
    return `<div class="rw-mission ${d ? 'done' : ''}"><span class="rw-check">${d ? ic('check', 'sm') : ''}</span><div style="flex:1;min-width:0"><b>${esc(x.title)}</b><div class="mut" style="font-size:12px">+${x.xp} XP${x.kind === 'link' ? ' · self-reported' : ''}</div></div>${act}</div>`; };
  return `<div class="card"><div class="card-head"><h3>${ic('target', 'sm')}COMPLETE YOUR LAUNCH MISSIONS</h3><span class="num mut" style="font-size:12.5px">${done} / ${L.length} COMPLETED</span></div>
    <div class="card-pad" style="padding-bottom:6px"><div class="rw-bar"><i style="width:${L.length ? done / L.length * 100 : 0}%"></i></div></div>${L.map(row).join('')}</div>`;
}
function rwXpPanel(m) {
  const st = m.status || rwStatusOf(m.xp); const S = (Rewards.cfg && Rewards.cfg.statuses) || []; const pct = st.next ? (m.xp - st.at) / (st.next.at - st.at) * 100 : 100;
  return `<div class="card"><div class="card-head"><h3>${ic('flame', 'sm')}MEMBER STATUS</h3><span class="num" style="font-size:13px">${fmtNum(m.xp, 0)} XP</span></div><div class="card-pad">
    <div class="rw-status-name">${esc(st.name)}</div><div class="rw-bar xp"><i style="width:${Math.max(3, Math.min(100, pct))}%"></i></div>
    <div class="mut" style="font-size:12px;margin-top:6px">${st.next ? `${fmtNum(st.next.at - m.xp, 0)} XP to ${esc(st.next.name)}` : 'Top status reached'}</div>
    <div class="rw-ladder">${S.map(s => `<span class="${m.xp >= s[1] ? 'on' : ''}">${esc(s[0])}</span>`).join('<i>→</i>')}</div>
    <div class="rw-xplog">${(m.xpLog || []).slice().reverse().slice(0, 8).map(e => `<div><span>${esc(e.label)}</span><b class="num up">+${e.xp} XP</b></div>`).join('')}</div></div></div>`;
}
function rwInvitePanel(m) {
  const q = (m.refs && m.refs.qualified) || 0; const ms = (Rewards.cfg && Rewards.cfg.milestones) || [1, 3, 10, 25, 50, 100]; const next = ms.find(x => x > q) || null; const prev = [...ms].reverse().find(x => x <= q) || 0;
  return `<div class="card"><div class="card-head"><h3>${ic('userPlus', 'sm')}INVITE FRIENDS</h3>${m.rank && m.rank.refs ? (Rewards.gated() ? `<span class="mut num" style="font-size:12.5px">Rank #${m.rank.refs}</span>` : `<a class="link" href="#/leaderboard">Rank #${m.rank.refs}</a>`) : ''}</div><div class="card-pad stack" style="gap:12px">
    <div class="rw-refs"><div><b class="num">${q}</b><span>REFERRALS</span></div><div><b class="num">${(m.refs && m.refs.pending) || 0}</b><span>PENDING</span></div>${m.refs && m.refs.review ? `<div><b class="num">${m.refs.review}</b><span>IN REVIEW</span></div>` : ''}</div>
    ${next ? `<div><div class="row" style="justify-content:space-between;font-size:12.5px"><span class="mut">NEXT MILESTONE</span><b class="num">${q} / ${next}</b></div><div class="rw-bar" style="margin-top:6px"><i style="width:${(q - prev) / (next - prev) * 100}%"></i></div></div>` : '<div class="mut" style="font-size:12.5px">Every milestone reached. Legend.</div>'}
    <label class="field"><span>Your referral link</span><div class="row" style="gap:8px"><input class="input num" readonly value="${esc(rwJoinLink(m.n))}" id="rw-link" style="flex:1;min-width:0"><button class="btn btn-ghost" data-action="rwCopyLink">${ic('copy', 'sm')}Copy</button></div></label>
    <div class="row wrap" style="gap:8px"><a class="btn btn-primary" href="#/referrals">${ic('chart', 'sm')}Referral dashboard</a><button class="btn btn-ghost" data-action="rwInviteX">${xLogoSvg}Invite on X</button></div>
    <p class="mut" style="font-size:12px">${Rewards.gated() ? 'A friend counts once they’ve joined the waitlist with X. Referrals help you climb the ranks. They’re never paid out as cash.' : 'A friend counts once they’ve joined, finished setting up their account and verified X, an email or a wallet. Referrals earn XP and leaderboard rank, not cash.'}</p></div></div>`;
}

/* ---------- MEMBERSHIP HUB ---------- */
Views.rewards = async () => {
  const cfg = Rewards.cfg || await Rewards.loadConfig();
  if (!Auth.user) return `<div class="page">${rwJoinHero(null)}</div>`;
  if (!Rewards.me) { if (Rewards.state !== 'loading') Rewards.sync(); return `<div class="page">${Rewards.err ? unavailable('Membership unavailable', esc(Rewards.err.message), '<button class="btn btn-ghost sm" data-action="rwRetry">Retry</button>') : skeletonCards(3)}</div>`; }
  const m = Rewards.me;
  return `<div class="page rw-page">
    <div class="page-head"><div><h1>Membership</h1><p>Your Member Card, credits, missions and invites. ${rwPhasePill()}</p></div><div class="row wrap" style="gap:8px"><a class="btn btn-ghost" href="#/referrals">${ic('chart', 'sm')}Referrals</a><a class="btn btn-ghost" href="#/leaderboard">${ic('trophy', 'sm')}Leaderboard</a>${Rewards.isAdmin ? `<a class="btn btn-ghost" href="#/admin">${ic('sliders', 'sm')}Admin</a>` : ''}</div></div>
    ${rwDemoNote()}
    <div class="rw-grid rw-main ${rwOnce('hub')}">
      <div class="stack" style="gap:16px;min-width:0"><div class="rw-o1">${rwMemberCard(m)}</div>
        <div class="row wrap rw-o2" style="gap:8px"><button class="btn btn-primary" data-action="rwShare">${ic('send', 'sm')}Share on X</button><button class="btn btn-ghost" data-action="rwDownload">${ic('download', 'sm')}Download card</button><button class="btn btn-ghost" data-action="rwReplay">${ic('play', 'sm')}Replay reveal</button></div>
        <div class="rw-o6">${rwXpPanel(m)}</div><div class="rw-o7">${rwMissionsPanel(m)}</div></div>
      <div class="stack" style="gap:16px;min-width:0"><div class="rw-o3">${rwCreditPanel(m)}</div>${Rewards.creditsVisible ? `<div class="rw-o4">${rwGuidePanel()}</div>` : ''}<div class="rw-o5">${rwInvitePanel(m)}</div><div class="card rw-o8"><div class="card-head"><h3>${ic('trophy', 'sm')}LEADERBOARD</h3><a class="link" href="#/leaderboard">Open</a></div><div class="card-pad">
      <div class="rw-you">YOU ARE <b class="num">#${(m.rank && m.rank.refs) || '—'}</b><span class="mut">in referrals · #${(m.rank && m.rank.xp) || '—'} in XP${m.rank && m.rank.total ? ` · ${fmtNum(m.rank.total, 0)} members` : ''}</span></div>
      <p class="mut" style="font-size:12.5px;margin-top:8px">Rankings refresh every 30 seconds. Invite friends and complete missions to climb.</p></div></div></div>
    </div>
  </div>`;
};
function rwJoinHero(ref) {
  const cfg = Rewards.cfg || RW_DEMO_CFG;
  return `<div class="rw-join">${rwDemoNote()}<div class="rw-kicker">${ref ? `MEMBER #${esc(ref)} INVITED YOU` : 'EARLY ROLLOUT'}</div>
    <h1>Become a ${esc(rwBrand())} member.</h1><p class="dim">Get a permanent member number, a mystery credit reward and your own Member Card. Early spots are limited.</p>
    ${rwCounter()}
    <div class="row wrap" style="gap:10px;justify-content:center;margin-top:18px">${Auth.user ? `<a class="btn btn-primary lg" href="#/rewards">Open my membership</a>` : `<a class="btn btn-primary lg" href="#/signup">Join now</a><a class="btn btn-ghost lg" href="#/login">Log in</a>`}</div>
    <p class="mut" style="font-size:12px;margin-top:14px">Credits are promotional platform credits, not cash. One membership per person.</p></div>`;
}
function rwCounter() {
  const cfg = Rewards.cfg; if (!cfg) return '';
  const n = cfg.memberCount || 0, cap = cfg.memberCap || 10000, pct = Math.min(100, n / cap * 100);
  return `<div class="rw-counter"><div class="row" style="justify-content:space-between;align-items:baseline;gap:10px"><b class="num"><span data-rwcount data-count="${n}" data-ck="members">${fmtNum(n, 0)}</span> / ${fmtNum(cap, 0)}</b><span class="rw-eyebrow">${n >= cap ? 'ROLLOUT FULL' : 'MEMBERS'}${Rewards.demo ? ' · DEMO' : ''}</span></div><div class="rw-bar gold"><i style="width:${pct}%"></i></div></div>`;
}

/* ---------- LEADERBOARD ---------- */
Views.leaderboard = async () => {
  if (!Rewards.cfg) await Rewards.loadConfig();
  const tab = UI.rwTab || 'refs'; let lb; try { lb = await Rewards.leaderboard(); } catch (e) { return `<div class="page">${unavailable('Leaderboard unavailable', esc(e.message))}</div>`; }
  const rows = (lb.top && lb.top[tab]) || []; const me = Rewards.me; const you = (lb.you && lb.you[tab]) || (me && me.rank && me.rank[tab]);
  const val = (r) => tab === 'refs' ? `${fmtNum(r.r, 0)} referral${r.r === 1 ? '' : 's'}` : tab === 'xp' ? `${fmtNum(r.x, 0)} XP` : `Member #${r.n}`;
  return `<div class="page rw-page"><div class="page-head"><div><h1>Leaderboard</h1><p>Top members of the ${esc(rwBrand())} rollout. Updates as activity happens.</p></div>${me ? `<div class="rw-you big">YOU ARE <b class="num">#${you || '—'}</b></div>` : `<a class="btn btn-primary" href="#/signup">Join to rank</a>`}</div>
    ${rwDemoNote()}
    <div class="tabs">${[['refs', 'TOP REFERRERS'], ['xp', 'TOP XP'], ['early', 'EARLY MEMBERS']].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-action="rwTab" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="card" style="margin-top:14px">${rows.length ? rows.slice(0, 50).map((r, i) => `<a class="rw-lb-row ${me && r.n === me.n ? 'me' : ''} ${i < 3 ? 'top' : ''}" href="#/member/${r.n}"><span class="rw-rank">${rwMedal(i)}</span><span class="rw-lb-name">@${esc(r.h || 'member')}<span class="mut num">#${r.n}</span></span><b class="num">${val(r)}</b></a>`).join('')
      : emptyState({ icon: 'trophy', title: 'No rankings yet', body: 'Be the first: join, complete missions and invite friends.' })}</div>
    ${me && you && you > 50 ? `<div class="card rw-lb-row me" style="margin-top:10px"><span class="rw-rank num">${you}</span><span class="rw-lb-name">@${esc(me.handle || 'you')}<span class="mut num">#${me.n}</span></span><b class="num">${tab === 'refs' ? fmtNum(me.refs.qualified, 0) + ' referrals' : tab === 'xp' ? fmtNum(me.xp, 0) + ' XP' : 'Member #' + me.n}</b></div>` : ''}
    <p class="mut" style="font-size:12px;margin-top:10px">${lb.at ? `Updated ${agoT(lb.at)}. ` : ''}Accounts under review are hidden from rankings.</p></div>`;
};

/* ---------- referral landing + public card ---------- */
Views.join = async (params) => {
  Rewards.captureRef(); if (!Rewards.cfg) await Rewards.loadConfig();
  if (Auth.user) { location.replace('#/rewards'); return '<div class="page"></div>'; }
  return `<div class="page">${rwJoinHero(params.get('ref') || Rewards.refCode())}</div>`;
};
Views.member = async (params, n) => {
  if (!Rewards.cfg) await Rewards.loadConfig();
  let card = null; if (Rewards.me && String(Rewards.me.n) === String(n)) card = Rewards.me;
  else if (!Rewards.demo) { try { const r = await Rewards.call('card', { n }); card = { ...r.card, refs: { qualified: r.card.refs }, credits: { hidden: true }, status: { name: r.card.status } }; } catch (e) { return `<div class="page">${emptyState({ icon: 'user', title: 'Member not found', body: 'No member has that number.', cta: '<a class="btn btn-primary sm" href="#/leaderboard">Leaderboard</a>' })}</div>`; } }
  if (!card) return `<div class="page">${rwDemoNote()}${emptyState({ icon: 'user', title: 'Member cards need the rewards server', body: 'Public cards appear once the rewards server is connected.' })}</div>`;
  return `<div class="page rw-page"><div style="max-width:560px;margin:0 auto">${rwMemberCard(card)}<div class="row wrap" style="gap:8px;justify-content:center;margin-top:16px">${Auth.user ? '<a class="btn btn-ghost" href="#/rewards">My membership</a>' : `<a class="btn btn-primary" href="#/join?ref=${esc(n)}">Join with this invite</a>`}<a class="btn btn-ghost" href="#/leaderboard">Leaderboard</a></div></div></div>`;
};

/* ---------- small cards for Home, Profile and the landing page ---------- */
function rwHomeCard() {
  if (!Auth.user) return ''; const m = Rewards.me; if (!m) return '';
  const credits = rwCreditsText(m); const st = m.status || rwStatusOf(m.xp);
  return `<a class="card rw-home" href="#/rewards"><div class="rw-home-l"><span class="rw-eyebrow">CREDIT BALANCE</span><div class="rw-home-amt num">${credits ? rwMoney(m.credits.amount, 2) : '$•••'}</div><span class="rw-eyebrow mut">${credits ? 'PROMOTIONAL CREDITS' : 'MYSTERY REWARD'}</span></div>
    <div class="rw-home-r"><span class="rw-home-num num">MEMBER #${m.n}</span><span class="rw-pill sm">${esc(st.name)}</span>${rwStatePill('sm')}${Rewards.demo ? '<span class="tag">DEMO</span>' : ''}</div>${ic('chevRight', 'sm')}</a>`;
}
function rwProfileSection() {
  const m = Rewards.me; if (!m) return '';
  return `<div class="card rw-profile" style="margin-top:16px"><div class="card-head"><h3>${ic('gift', 'sm')}Membership</h3><a class="link" href="#/rewards">Member Card</a></div>
    <div class="rw-profile-grid"><div><span class="rw-eyebrow">MEMBER</span><b class="num">#${m.n}</b><span class="mut">@${esc(m.handle || meHandle())}</span></div><div><span class="rw-eyebrow">STATUS</span><b>${m.early !== false ? 'EARLY MEMBER' : 'MEMBER'}</b><span class="mut">${esc((m.status || rwStatusOf(m.xp)).name)} · ${fmtNum(m.xp, 0)} XP</span></div>
    <div><span class="rw-eyebrow">CREDIT BALANCE</span><b class="num">${rwCreditsText(m) || '🔒'}</b><span class="mut">${esc(Rewards.creditState().label)}</span></div><div><span class="rw-eyebrow">REFERRALS</span><b class="num">${m.refs.qualified}</b><span class="mut">${m.refs.pending ? m.refs.pending + ' pending' : 'Qualified'}</span></div><div><span class="rw-eyebrow">RANK</span><b class="num">#${(m.rank && m.rank.refs) || '—'}</b><span class="mut">Referrals</span></div></div>${Rewards.demo ? '<p class="mut" style="font-size:12px;padding:0 18px 14px">Demo data: the rewards server isn’t connected.</p>' : ''}</div>`;
}
function rwLandingCounter() { if (!Rewards.cfg) return ''; return `<div class="rw-land">${rwCounter()}<a class="link" href="${Auth.user ? '#/rewards' : '#/signup'}" style="font-size:13px">${Auth.user ? 'Your membership' : 'Claim your member number'} ${ic('chevRight', 'sm')}</a></div>`; }

/* ---------- ADMIN ---------- */
Views.admin = async () => {
  if (!Rewards.me && Auth.user) await Rewards.sync();
  if (Rewards.demo) return `<div class="page">${unavailable('Admin needs the rewards server', 'Connect server storage (Upstash Redis) so members, credits and referrals are stored on the server.')}</div>`;
  if (!Rewards.isAdmin) return `<div class="page">${emptyState({ icon: 'shield', title: 'Admins only', body: 'Add your email or @handle to ADMIN_EMAILS or ADMIN_HANDLES in the server’s environment variables, then redeploy.' })}</div>`;
  const A = UI.rwAdmin = UI.rwAdmin || {}; if (!A.ov || A.stale) { try { A.ov = await Rewards.call('admin_overview'); A.rev = (await Rewards.call('admin_review')).items; A.stale = false; } catch (e) { return `<div class="page">${unavailable('Admin unavailable', esc(e.message))}</div>`; } }
  const c = A.ov.config, s = A.ov.stats; const dt = c.countdownAt ? isoLocal(c.countdownAt) : '';
  const field = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;
  return `<div class="page rw-page"><div class="page-head"><div><h1>Rollout admin</h1><p>Phase, credits, missions, guide and member review. Changes apply immediately.</p></div><button class="btn btn-ghost sm" data-action="rwAdminReload">${ic('refresh', 'sm')}Reload</button></div>
    <div class="stats-strip"><div class="stat"><div class="k">Members</div><div class="v num">${fmtNum(s.members, 0)} / ${fmtNum(c.memberCap, 0)}</div></div><div class="stat"><div class="k">Credits issued</div><div class="v num">${rwMoney(s.credits)}</div><div class="s mut">${c.credits.budget != null ? 'Budget ' + rwMoney(c.credits.budget) : 'No budget cap'}</div></div><div class="stat"><div class="k">Phase</div><div class="v">${c.phase} · ${esc(RW_PHASES[c.phase])}</div></div><div class="stat"><div class="k">Review queue</div><div class="v num">${s.review}</div></div></div>
    <div class="card rw-access ${c.gate === 'open' ? 'open' : ''}" style="margin-top:16px"><div class="card-pad row wrap" style="gap:16px;align-items:center">
      <div style="flex:1;min-width:240px"><span class="rw-eyebrow">WEBSITE ACCESS</span><h3 style="font-size:18px;margin-top:4px">${c.gate === 'open' ? 'The full website is open to everyone.' : 'Waitlist mode: visitors only see the waitlist site.'}</h3>
        <p class="mut" style="font-size:12.5px;margin-top:4px">${c.gate === 'open' ? 'Members see the full Nexis site, with Membership, missions and the leaderboard.' : 'Visitors see the waitlist, Connect with X, their member number, credits, Member Card and invite link. Admins still see everything.'}</p>
        <p style="font-size:12.5px;margin-top:6px">${(Config.c && Config.c.x && Config.c.x.configured) ? '<span class="tag green">Connect with X: on</span>' : `<span class="tag amber">Connect with X: off</span> <span class="mut">Add X_CLIENT_ID and X_CLIENT_SECRET (callback ${esc(location.origin)}/api/xauth), then redeploy.</span>`}</p></div>
      <button class="btn ${c.gate === 'open' ? 'btn-ghost' : 'btn-primary'}" data-action="rwAdminGate" data-v="${c.gate === 'open' ? 'waitlist' : 'open'}">${c.gate === 'open' ? 'Back to waitlist mode' : 'Open the website'}</button></div></div>
    <div class="rw-grid" style="margin-top:16px">
      <form class="card" id="rw-adm-rollout"><div class="card-head"><h3>Rollout</h3><button type="button" class="btn btn-primary sm" data-action="rwAdminSave" data-form="rollout">Save</button></div><div class="card-pad stack" style="gap:12px">
        ${field('Phase', `<select class="select" name="phase">${[1, 2, 3, 4, 5, 6].map(p => `<option value="${p}" ${p === c.phase ? 'selected' : ''}>${p} — ${RW_PHASES[p]}</option>`).join('')}</select>`)}
        <div class="grid g2">${field('Member cap (early spots)', `<input class="input" name="memberCap" inputmode="numeric" value="${c.memberCap}">`)}${field('Guide countdown (your time)', `<input type="datetime-local" class="input" name="countdownAt" value="${dt}">`)}</div>
        <div class="grid g3">${field('Brand', `<input class="input" name="brand" value="${esc(c.brand)}">`)}${field('X handle', `<input class="input" name="x" value="${esc(c.social.x)}" placeholder="nexis">`)}${field('Credit budget ($, blank = none)', `<input class="input" name="budget" inputmode="numeric" value="${c.credits.budget ?? ''}">`)}</div>
        ${field('Launch announcement URL', `<input class="input" name="announcement" value="${esc(c.social.announcement)}" placeholder="https://x.com/…/status/…">`)}${field('Community URL', `<input class="input" name="community" value="${esc(c.social.community)}" placeholder="https://discord.gg/…">`)}
        <div class="grid g2">${field('New members per network per day before review', `<input class="input" name="perNetworkPerDay" value="${c.antiAbuse.perNetworkPerDay}">`)}${field('Qualified referrals per referrer per day', `<input class="input" name="refDailyCap" value="${c.antiAbuse.refDailyCap}">`)}</div>
        ${field('Hold credits for X accounts younger than (days, 0 = off)', `<input class="input" name="minXAgeDays" value="${c.antiAbuse.minXAgeDays ?? 30}">`)}</div></form>
      <form class="card" id="rw-adm-guide"><div class="card-head"><h3>Credit Guide</h3><button type="button" class="btn btn-primary sm" data-action="rwAdminSave" data-form="guide">Save</button></div><div class="card-pad stack" style="gap:12px">
        <p class="mut" style="font-size:12.5px">Members see this from phase 5. Lines starting with “- ” become bullets, “# ” a heading.</p>
        ${field('Title', `<input class="input" name="title" value="${esc(c.guide.title)}">`)}${field('Guide', `<textarea class="textarea" name="body" style="min-height:180px">${esc(c.guide.body)}</textarea>`)}
        <div class="rw-eyebrow">ELIGIBLE USES (ACTIVE = CREDITS CAN REALLY BE SPENT THERE, PHASE 6)</div>
        ${c.uses.map((u, i) => `<div class="rw-adm-use"><input class="input" name="use_label_${i}" value="${esc(u.label)}"><input class="input" name="use_desc_${i}" value="${esc(u.desc)}"><label class="row" style="gap:6px;font-size:12.5px"><input type="checkbox" name="use_active_${i}" ${u.active ? 'checked' : ''}>Active</label><input type="hidden" name="use_id_${i}" value="${esc(u.id)}"></div>`).join('')}</div></form>
    </div>
    <div class="rw-grid" style="margin-top:16px">
      <form class="card" id="rw-adm-credits"><div class="card-head"><h3>Credit distribution</h3><button type="button" class="btn btn-primary sm" data-action="rwAdminSave" data-form="credits">Save</button></div><div class="card-pad stack" style="gap:8px">
        <p class="mut" style="font-size:12.5px">Each new early member draws one amount. Weight = relative chance.</p>
        ${c.credits.table.map((r, i) => `<div class="row" style="gap:8px"><input class="input" name="amt_${i}" value="${r[0]}" style="width:110px"><input class="input" name="w_${i}" value="${r[1]}" style="width:110px"><span class="mut num" style="font-size:12px">${(r[1] / c.credits.table.reduce((a, x) => a + x[1], 0) * 100).toFixed(1)}%</span></div>`).join('')}
        <div class="row" style="gap:8px"><input class="input" name="amt_new" placeholder="Amount" style="width:110px"><input class="input" name="w_new" placeholder="Weight" style="width:110px"><span class="mut" style="font-size:12px">Add a row (blank weight removes a row)</span></div></div></form>
      <form class="card" id="rw-adm-missions"><div class="card-head"><h3>Missions & XP</h3><button type="button" class="btn btn-primary sm" data-action="rwAdminSave" data-form="missions">Save</button></div><div class="card-pad stack" style="gap:10px">
        ${field('Missions (JSON: id, title, xp, kind link|share|referrals, url = x|announcement|community|https://…, target, enabled)', `<textarea class="textarea num" name="missions" style="min-height:160px;font-size:12px">${esc(JSON.stringify(c.missions, null, 1))}</textarea>`)}
        <div class="grid g3">${field('XP: joined', `<input class="input" name="xp_join" value="${c.xp.join}">`)}${field('XP: profile', `<input class="input" name="xp_profile" value="${c.xp.profile}">`)}${field('XP: per referral', `<input class="input" name="xp_referral" value="${c.xp.referral}">`)}</div>
        ${field('Statuses (JSON: [name, XP needed])', `<textarea class="textarea num" name="statuses" style="min-height:70px;font-size:12px">${esc(JSON.stringify(c.statuses))}</textarea>`)}</div></form>
    </div>
    <div class="rw-grid" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>Member lookup</h3></div><div class="card-pad stack" style="gap:10px"><div class="row" style="gap:8px"><input class="input" id="rw-adm-q" placeholder="#2847, @handle or usr_…" style="flex:1"><button class="btn btn-ghost" data-action="rwAdminFind">Find</button></div><div id="rw-adm-member">${A.member ? rwAdminMember(A.member) : ''}</div></div></div>
      <div class="card"><div class="card-head"><h3>Review queue · suspicious accounts & referrals</h3><button class="link" data-action="rwAdminLb">Refresh leaderboard</button></div>${A.rev && A.rev.length ? A.rev.map(r => `<button class="rw-mission" style="width:100%;text-align:left" data-action="rwAdminOpen" data-q="${esc(r.uid)}"><span class="rw-check">${ic('alert', 'sm')}</span><div style="flex:1;min-width:0"><b class="num">Member #${r.n}</b><div class="mut" style="font-size:12px">${esc(r.reason)} · ${agoT(r.t)}</div></div>${ic('chevRight', 'sm')}</button>`).join('') : '<p class="mut" style="padding:14px 18px;font-size:13px">Nothing to review.</p>'}</div>
    </div></div>`;
};
function rwAdminMember(m) {
  return `<div class="stack" style="gap:8px;font-size:13px"><div class="row wrap" style="gap:8px"><b class="num">#${m.n}</b><span>@${esc(m.handle || '—')}</span><span class="mut">${esc(m.email || '')}</span>${m.verified ? '<span class="tag green">Verified</span>' : '<span class="tag">Unverified</span>'}${m.flags.length ? `<span class="tag red">Flagged</span>` : ''}</div>
    <div class="mut">Joined ${fmtDate(m.joinedAt)} · XP ${fmtNum(m.xp, 0)} · referrals ${m.refs.qualified} qualified / ${m.refs.pending} pending / ${m.refs.review} in review</div>
    <div>Credits <b class="num">${rwMoney(m.credits.amount)}</b> · <span class="tag">${esc(m.credits.status)}</span>${m.referredBy ? ` · referred by #${m.referredBy} (${esc(m.referral.status)}${m.referral.reason ? ': ' + esc(m.referral.reason) : ''})` : ''}</div>
    ${m.flags.length ? `<div class="down" style="font-size:12.5px">${m.flags.map(esc).join(' · ')}</div>` : ''}
    <div class="row wrap" style="gap:6px"><input class="input" id="rw-adm-amt" placeholder="Amount" style="width:100px"><input class="input" id="rw-adm-note" placeholder="Note / reason" style="flex:1;min-width:140px"></div>
    <div class="row wrap" style="gap:6px">${[['credits_set', 'Set credits'], ['credits_add', 'Add credits'], ['xp_add', 'Add XP'], [m.credits.status === 'held' ? 'credits_release' : 'credits_hold', m.credits.status === 'held' ? 'Release credits' : 'Hold credits'], [m.flags.length ? 'unflag' : 'flag', m.flags.length ? 'Clear flags' : 'Flag account']].map(([op, l]) => `<button class="btn btn-ghost sm" data-action="rwAdminOp" data-op="${op}" data-uid="${esc(m.uid)}">${l}</button>`).join('')}
    ${m.referral && m.referral.status !== 'qualified' ? `<button class="btn btn-ghost sm" data-action="rwAdminOp" data-op="referral" data-status="qualified" data-uid="${esc(m.uid)}">Approve referral</button>` : ''}${m.referral && m.referral.status !== 'rejected' ? `<button class="btn btn-ghost sm" data-action="rwAdminOp" data-op="referral" data-status="rejected" data-uid="${esc(m.uid)}">Reject referral</button>` : ''}</div>
    ${m.refs.list.length ? `<div class="mut" style="font-size:12px">Invited: ${m.refs.list.slice(0, 20).map(r => `#${r.n} (${esc(r.status)})`).join(', ')}</div>` : ''}</div>`;
}
function rwAdminPatch(form) {
  const f = $('#rw-adm-' + form); const v = (n) => f.elements[n] ? f.elements[n].value.trim() : '';
  if (form === 'rollout') return { phase: +v('phase'), memberCap: +v('memberCap'), countdownAt: v('countdownAt') ? new Date(v('countdownAt')).getTime() : null, brand: v('brand'), social: { x: v('x').replace(/^@/, ''), announcement: v('announcement'), community: v('community') }, credits: { table: UI.rwAdmin.ov.config.credits.table, budget: v('budget') }, antiAbuse: { perNetworkPerDay: v('perNetworkPerDay'), refDailyCap: v('refDailyCap'), minXAgeDays: v('minXAgeDays') } };
  if (form === 'guide') { const uses = UI.rwAdmin.ov.config.uses.map((u, i) => ({ id: v('use_id_' + i), label: v('use_label_' + i), desc: v('use_desc_' + i), active: f.elements['use_active_' + i].checked })); return { guide: { title: v('title'), body: f.elements.body.value }, uses }; }
  if (form === 'credits') { const t = UI.rwAdmin.ov.config.credits.table.map((r, i) => [v('amt_' + i), v('w_' + i)]).filter(r => r[1] !== '' && +r[1] > 0); if (v('amt_new') && v('w_new')) t.push([v('amt_new'), v('w_new')]); return { credits: { table: t.map(r => [+r[0], +r[1]]), budget: UI.rwAdmin.ov.config.credits.budget } }; }
  if (form === 'missions') return { missions: JSON.parse(v('missions')), xp: { join: v('xp_join'), profile: v('xp_profile'), referral: v('xp_referral') }, statuses: JSON.parse(v('statuses')) };
}

/* =====================================================================
   WAITLIST MODE — a standalone site shown to everyone except admins until
   an admin opens the website (rollout admin → Website access).
   Pages: waitlist (#/, #/join?ref=N) · my membership (#/me) · public card.
   ===================================================================== */
const xLogoSvg = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58l11.09 14.47Z"/></svg>';
function wlShell(inner, { me } = {}) {
  return `<div class="wl"><header class="wl-nav"><a class="logo" href="#/">${logoMark}<span class="wm">${esc(rwBrand().toUpperCase())}</span></a><span class="spacer"></span>
    ${me ? `<nav class="wl-links"><a href="#/me" class="${current.route === 'me' ? 'on' : ''}">Membership</a><a href="#/referrals" class="${current.route === 'referrals' ? 'on' : ''}">Referrals</a></nav><span class="mut wl-user">@${esc(me)}</span><button class="btn btn-ghost sm" data-action="logout">Log out</button>` : ''}</header>
    <main class="wl-main">${inner}</main>
    <footer class="wl-foot"><span>${esc(rwBrand())} · launching soon</span><span class="mut">Credits are promotional platform credits, not cash, and can’t be withdrawn.</span></footer></div>`;
}
function wlWaitlist(params) {
  const cfg = Rewards.cfg || {}; const ref = params.get('ref') || Rewards.refCode(); const err = params.get('xerr');
  return wlShell(`<section class="wl-hero ${rwOnce('wl')}"><div class="wl-glow"></div><div class="wl-orb a"></div><div class="wl-orb b"></div>
    <div class="rw-kicker">${ref ? `MEMBER #${esc(ref)} INVITED YOU` : 'EARLY ACCESS · LIMITED SPOTS'}</div>
    <h1>Claim your<br>member number.</h1>
    <p class="dim">${esc(rwBrand())} is launching soon. Join the waitlist with X to get a permanent member number, a mystery credit reward and your own Member Card.</p>
    ${rwCounter()}
    ${err ? `<div class="rw-note warn" style="max-width:440px;margin:14px auto 0">${ic('alert', 'sm')}<span>${esc(err)}</span></div>` : ''}
    <div style="margin-top:20px">${cfg.xLogin ? `<a class="btn btn-primary lg wl-x" href="/api/xauth?action=start">${xLogoSvg}Connect with X</a>` : `<button class="btn btn-primary lg wl-x" disabled>Sign-up opens soon</button>`}</div>
    <p class="mut" style="font-size:12px;margin-top:10px">${cfg.xLogin ? 'We only read your public X profile. We never post for you.' : 'Sign-up with X isn’t switched on yet. Check back shortly.'}</p>
    <ol class="wl-steps"><li><b>Connect X</b><span>One click, no password.</span></li><li><b>Get your number</b><span>Permanent. Only you will ever have it.</span></li><li><b>Reveal your credits</b><span>A mystery amount from $20 up, already in your account.</span></li><li><b>Credit guide drops</b><span>Learn exactly how to use them.</span></li></ol></section>`);
}
function wlMe() {
  const m = Rewards.me; const u = Auth.user;
  if (!m) { if (Rewards.state !== 'loading') Rewards.sync(); return wlShell(Rewards.err ? unavailable('Membership unavailable', esc(Rewards.err.message), '<button class="btn btn-ghost sm" data-action="rwRetry">Retry</button>') : `<div class="wl-load"><span class="spin lg"></span><p class="mut">Loading your membership…</p></div>`, { me: u && u.handle }); }
  return wlShell(`${rwDemoNote()}<div class="wl-me-head"><div class="rw-kicker">YOU’RE IN</div><h1>Welcome, Member #${m.n}.</h1><p class="dim">Your spot is locked in. Share your card and invite friends while the Credit Guide gets ready.</p></div>
    <div class="rw-page"><div class="rw-grid ${rwOnce('wlme')}">
      <div class="stack" style="gap:14px;min-width:0">${rwMemberCard(m)}<div class="row wrap" style="gap:8px"><button class="btn btn-primary" data-action="rwShare">${ic('send', 'sm')}Share on X</button><button class="btn btn-ghost" data-action="rwDownload">${ic('download', 'sm')}Download card</button><button class="btn btn-ghost" data-action="rwReplay">${ic('play', 'sm')}Replay reveal</button></div>${rwInvitePanel(m)}</div>
      <div class="stack" style="gap:14px;min-width:0">${rwCreditPanel(m)}${Rewards.creditsVisible ? rwGuidePanel() : ''}</div>
    </div></div>
    <p class="mut wl-end">That’s everything for now. We’ll let you know when the Credit Guide drops.</p>`, { me: u && u.handle });
}
async function wlRoute(route, params, arg) {
  if (route === 'me') return wlMe();
  if (route === 'referrals') return wlShell(await rwReferralsPage(), { me: Auth.user && Auth.user.handle });
  if (route === 'member') { const html = await Views.member(params, arg); return wlShell(html); }
  return wlWaitlist(params);
}
/** Finishes "Connect with X": trades the one-time code for a session. */
async function xDone(params) {
  const app = $('#app'); document.body.classList.add('is-landing');
  app.innerHTML = wlShell(`<div class="wl-load"><span class="spin lg"></span><p class="mut">Signing you in with X…</p></div>`); hydrate(app);
  try {
    if (Auth.mode !== 'remote') Auth.setMode('remote');
    const r = await Net.api('auth', { method: 'POST', timeout: 20000, body: { action: 'xclaim', code: params.get('c'), device: deviceLabel() } });
    const res = RemoteAccounts.take(r); Store.init(res.user.id); Rewards.me = null; Rewards.state = 'idle';
    setTimeout(() => { Wallets.watch(); Balances.refresh(); }, 300);
    toast({ title: res.isNew ? `Welcome to ${rwBrand()}, @${res.user.handle}` : `Welcome back, @${res.user.handle}`, body: 'Signed in with X.' });
    await Rewards.sync(); location.replace(Rewards.home());
  } catch (e) { location.replace('#/?xerr=' + encodeURIComponent(e.message || 'X sign-in didn’t complete. Try again.')); }
}

/* =====================================================================
   REFERRAL DASHBOARD (#/referrals) — everyone you invited, their status,
   invites over the last 14 days, milestones and the top referrers.
   Referrals earn XP and rank only, never cash.
   ===================================================================== */
const RW_REF_STATUS = { qualified: ['Counted', 'green', 'Joined and verified'], pending: ['Waiting', 'amber', 'Needs to finish setting up'], review: ['In review', '', 'We’re checking this one'], rejected: ['Not counted', 'red', 'Didn’t pass review'] };
function rwMilestones(q) {
  const ms = (Rewards.cfg && Rewards.cfg.milestones) || [1, 3, 10, 25, 50, 100]; const next = ms.find(x => x > q) || null; const prev = [...ms].reverse().find(x => x <= q) || 0;
  const pct = next ? (q - prev) / (next - prev) : 1;
  return `<div class="card"><div class="card-head"><h3>${ic('flag', 'sm')}MILESTONES</h3><span class="mut num" style="font-size:12.5px">${next ? `${next - q} more to ${next}` : 'All reached'}</span></div><div class="card-pad">
    <div class="rw-ms">${ms.map((x, i) => { const done = q >= x, cur = x === next; const seg = i === 0 ? 0 : q >= x ? 1 : q > ms[i - 1] ? (q - ms[i - 1]) / (x - ms[i - 1]) : 0;
      return `${i ? `<div class="rw-ms-seg"><i style="width:${Math.round(seg * 100)}%"></i></div>` : ''}<div class="rw-ms-node ${done ? 'done' : ''} ${cur ? 'cur' : ''}" title="${x} referral${x === 1 ? '' : 's'}"><span>${done ? ic('check', 'sm') : x}</span>${done ? `<b class="num">${x}</b>` : ''}</div>`; }).join('')}</div>
    <p class="mut" style="font-size:12.5px;margin-top:12px">${next ? `${q} of ${next} counted referrals${pct > .5 ? ' — almost there.' : '.'} Each one adds +${(Rewards.cfg && Rewards.cfg.xp && Rewards.cfg.xp.referral) || 50} XP and moves you up the leaderboard.` : 'You’ve reached every milestone. Legend.'}</p></div></div>`;
}
function rwRefChart(daily) {
  const max = Math.max(1, ...daily.map(x => x.c)); const total = daily.reduce((s, x) => s + x.c, 0);
  const day = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<div class="card"><div class="card-head"><h3>${ic('chart', 'sm')}INVITES · LAST 14 DAYS</h3><span class="num" style="font-size:13px">${fmtNum(total, 0)}</span></div><div class="card-pad">
    <div class="rw-chart-wrap">${total ? '' : '<div class="rw-chart-empty">No one has joined with your link yet</div>'}<div class="rw-chart" role="img" aria-label="Friends who joined with your link per day over the last 14 days: ${total} in total">
      ${daily.map((x, i) => `<div class="rw-col ${i === daily.length - 1 ? 'today' : ''}" tabindex="0" data-tip="${esc(day(x.d))} · ${x.c} joined"><i style="height:${x.c ? Math.max(6, x.c / max * 100) : 0}%"></i></div>`).join('')}
    </div></div><div class="rw-chart-x mut num"><span>${esc(day(daily[0].d))}</span><span>Today</span></div>
    <table class="sr-only"><caption>Joins per day</caption><tbody>${daily.map(x => `<tr><td>${esc(day(x.d))}</td><td>${x.c}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function rwReferralsPage() {
  if (!Auth.user) { location.replace('#/'); return ''; }
  if (!Rewards.me) await Rewards.sync(); const m = Rewards.me;
  if (!m) return `<div class="page">${unavailable('Referrals unavailable', esc((Rewards.err && Rewards.err.message) || 'Your membership couldn’t be loaded.'), '<button class="btn btn-ghost sm" data-action="rwRetry">Retry</button>')}</div>`;
  let d; try { d = await Rewards.referrals(); } catch (e) { return `<div class="page">${unavailable('Referrals unavailable', esc(e.message), '<button class="btn btn-ghost sm" data-action="rwRetry">Retry</button>')}</div>`; }
  const tile = (k, v, s, ck, cls = '') => `<div class="rw-tile ${cls}"><span class="rw-eyebrow">${k}</span><b class="num" ${ck ? `data-count="${v}" data-ck="${ck}"` : ''}>${typeof v === 'number' ? fmtNum(v, 0) : v}</b><span class="mut">${s}</span></div>`;
  const back = Rewards.gated() ? '#/me' : '#/rewards';
  return `<div class="page rw-page rw-refs-page"><div class="page-head"><div><a class="link" href="${back}" style="font-size:12.5px">${ic('chevLeft', 'sm')}Membership</a><h1>Referral dashboard</h1><p>Everyone who joined with your link, and how close you are to your next milestone.</p></div>
      <div class="row wrap" style="gap:8px"><button class="btn btn-primary" data-action="rwInviteX">${xLogoSvg}Invite on X</button><button class="btn btn-ghost" data-action="rwCopyLink">${ic('copy', 'sm')}Copy link</button></div></div>
    ${d.demo ? rwDemoNote() : ''}
    <div class="${rwOnce('refs')}">
    <div class="rw-linkbar card"><span class="rw-eyebrow">YOUR LINK</span><input class="input num" readonly value="${esc(rwJoinLink(m.n))}" id="rw-link"><button class="btn btn-ghost sm" data-action="rwCopyLink">${ic('copy', 'sm')}Copy</button></div>
    <div class="rw-tiles">
      ${tile('FRIENDS INVITED', d.total, 'joined with your link', 'rf-total', 'hero')}
      ${tile('COUNTED', d.qualified, 'verified referrals', 'rf-q')}
      ${tile('WAITING', d.pending + d.review, d.review ? `${d.review} in review` : 'not verified yet', 'rf-p')}
      ${tile('XP EARNED', d.xp, `+${d.perReferral} XP each`, 'rf-xp')}
      ${tile('YOUR RANK', d.qualified && d.rank ? '#' + d.rank : '—', d.qualified ? `of ${fmtNum(d.members || 0, 0)} members` : 'first counted invite ranks you')}
    </div>
    ${rwMilestones(d.qualified)}
    <div class="rw-grid" style="margin-top:16px">${rwRefChart(d.daily)}
      <div class="card"><div class="card-head"><h3>${ic('trophy', 'sm')}TOP REFERRERS</h3>${Rewards.gated() ? '' : '<a class="link" href="#/leaderboard">Leaderboard</a>'}</div>
        ${d.top.length ? d.top.map((r, i) => `<div class="rw-lb-row ${r.n === m.n ? 'me' : ''} ${i < 3 ? 'top' : ''}"><span class="rw-rank">${rwMedal(i)}</span><span class="rw-lb-name">@${esc(r.h || 'member')}<span class="mut num">#${r.n}</span></span><b class="num">${fmtNum(r.r, 0)}</b></div>`).join('') : '<p class="mut" style="padding:14px 18px;font-size:13px">No referrals counted yet. The first one takes the top spot.</p>'}
        ${d.qualified && d.rank && d.rank > 5 ? `<div class="rw-lb-row me"><span class="rw-rank num">${d.rank}</span><span class="rw-lb-name">@${esc(m.handle || 'you')}<span class="mut num">#${m.n}</span></span><b class="num">${fmtNum(d.qualified, 0)}</b></div>` : ''}</div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>${ic('userPlus', 'sm')}YOUR INVITES</h3><span class="mut num" style="font-size:12.5px">${fmtNum(d.total, 0)}</span></div>
      ${d.list.length ? `<div class="rw-reflist">${d.list.map(r => { const s = RW_REF_STATUS[r.status] || [r.status, '', '']; return `<div class="rw-refrow"><span class="rw-avatar">${esc((r.h || '#').slice(0, 1).toUpperCase())}</span><div style="flex:1;min-width:0"><b>${r.h ? '@' + esc(r.h) : 'Member'}</b> <span class="mut num">#${r.n}</span><div class="mut" style="font-size:12px">Joined ${agoT(r.t)} · ${esc(s[2])}</div></div><span class="tag ${s[1]}">${esc(s[0])}</span></div>`; }).join('')}</div>`
        : `<div class="rw-empty">${ic('send', 'lg')}<b>No invites yet</b><p class="mut">Share your link. Friends who join with it show up here.</p><button class="btn btn-primary" data-action="rwInviteX">${xLogoSvg}Invite on X</button></div>`}</div>
    <div class="card rw-how" style="margin-top:16px"><div class="card-pad"><ol><li><b>Share your link</b><span>Post it on X or send it to friends.</span></li><li><b>They join</b><span>They connect X and claim their own member number.</span></li><li><b>It counts</b><span>Once they’re verified, you get +${d.perReferral} XP and climb the leaderboard.</span></li></ol>
      <p class="mut" style="font-size:12px;margin-top:10px">Referrals earn XP and rank, not cash. Self-referrals and duplicate accounts don’t count.</p></div></div>
    </div></div>`;
}
Views.referrals = async () => rwReferralsPage();
