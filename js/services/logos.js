/* =====================================================================
   TEAM LOGOS — a directory of club crests, so games that couldn't be
   matched to an ESPN match still show their teams' logos.
   Sources: every team in the ESPN data Nexis has loaded, plus ESPN's
   full team list for each football league with games (fetched once a
   day per league). Kept in localStorage between visits. Names are
   matched loosely (accents, "FC"/"CF"/"AFC", punctuation ignored).
   ===================================================================== */
const TeamLogos = {
  idx: new Map(), byLeague: {}, at: {}, ver: 0, busy: {},
  STOP: new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'cd', 'ud', 'sd', 'rc', 'fk', 'sk', 'if', 'bk', 'club', 'de', 'del', 'la', 'the', 'calcio', 'football', 'futbol', 'clube', 'sv', 'vfl', 'vfb', 'tsg', '1', 'ssc', 'us', 'ogc', 'losc', 'stade', 'real']),
  norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !this.STOP.has(w)).join(' '); },
  load() { try { const j = JSON.parse(localStorage.getItem('nexis-logos') || 'null'); if (j && j.v === 1) { Object.entries(j.idx || {}).forEach(([k, v]) => this.idx.set(k, v)); this.at = j.at || {}; } } catch (e) { /* storage unavailable */ } },
  save() { clearTimeout(this._st); this._st = setTimeout(() => { try { localStorage.setItem('nexis-logos', JSON.stringify({ v: 1, idx: Object.fromEntries([...this.idx].slice(-3000)), at: this.at })); } catch (e) { /* storage full or blocked */ } }, 800); },
  add(names, logo) {
    if (!/^https:\/\//.test(logo || '')) return false; let added = false;
    for (const n of names) { const k = this.norm(n); if (k.length >= 2 && this.idx.get(k) !== logo) { this.idx.set(k, logo); added = true; } }
    return added;
  },
  /** Teams in the ESPN data already loaded (scoreboards and schedules of every league). */
  harvest() {
    let added = false;
    Sports.games.forEach(g => [g.home, g.away].forEach(t => { if (t && t.logo) added = this.add([t.name, t.short], t.logo) || added; }));
    if (added) { this.ver++; this.save(); }
  },
  /** ESPN's team list for each football league (once a day per league). */
  async ensure(keys) {
    const todo = [...new Set(keys)].filter(k => /^soccer\/[a-z0-9._-]+$/i.test(k) && !this.busy[k] && Date.now() - (this.at[k] || 0) > 864e5).slice(0, 12);
    if (!todo.length) return; let added = false;
    await Promise.all(todo.map(async k => {
      this.busy[k] = true;
      try {
        const r = await Net.data(`https://site.api.espn.com/apis/site/v2/sports/soccer/${k.split('/')[1]}/teams`);
        const teams = (((r.sports || [])[0] || {}).leagues || [{}])[0].teams || [];
        teams.forEach(x => { const t = x.team || x; const logo = (t.logos && t.logos[0] && t.logos[0].href) || t.logo; added = this.add([t.displayName, t.shortDisplayName, t.name, t.nickname, t.location].filter(Boolean), logo) || added; });
        this.at[k] = Date.now();
      } catch (e) { this.at[k] = Date.now() - 864e5 + 30 * 60e3; /* retry in 30 minutes */ }
      finally { delete this.busy[k]; }
    }));
    if (added) { this.ver++; this.save(); Bus.emit('sports'); }
  },
  /** Best logo for a team name: exact match, then one name containing the other (at least 4 letters). */
  find(name) {
    const k = this.norm(name); if (!k) return null; const hit = this.idx.get(k); if (hit) return hit;
    if (k.length < 4) return null; let best = null, bl = 0;
    for (const [n, logo] of this.idx) { if (n.length < 4) continue; if ((n.startsWith(k + ' ') || k.startsWith(n + ' ') || n === k) && n.length > bl) { best = logo; bl = n.length; } }
    if (best) return best;
    const words = k.split(' '); if (words.length === 1 && k.length >= 5) for (const [n, logo] of this.idx) { if (n.split(' ').includes(k)) return logo; }
    return null;
  },
};
TeamLogos.load();
/** A crest for teams with no known logo: a coloured badge with the team's initials (same colours every time). */
function teamBadge(name, size = 36) {
  const n = String(name || '?'); let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = n.replace(/\b(FC|CF|AFC|SC|AC)\b/gi, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() || '?';
  return `<span class="team-badge" style="width:${size}px;height:${size}px;--h:${h % 360};font-size:${Math.max(9, Math.round(size * (ini.length > 2 ? .3 : .38)))}px" aria-hidden="true">${esc(ini)}</span>`;
}
