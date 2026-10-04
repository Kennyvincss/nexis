// Key-value storage for server-side accounts.
// - Vercel (or any host): Upstash Redis over its REST API. Add it in Vercel → Storage → Upstash for Redis,
//   which sets KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
// - Netlify: Netlify Blobs (store "nexis-accounts", strong consistency). Built in; no setup needed.
// - Local testing: a JSON-file store when NEXIS_STORE_DIR is set.
// - Anywhere else: unavailable, and the app falls back to browser-only accounts.
const fs = require('fs');
const path = require('path');

const redisCfg = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
};
function redisStore() {
  const c = redisCfg(); if (!c) return null;
  const cmd = async (...args) => {
    const r = await fetch(c.url, { method: 'POST', headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
    return j.result;
  };
  const K = (k) => 'nexis:' + k;
  return {
    async get(k) { const v = await cmd('GET', K(k)); return v == null ? null : JSON.parse(v); },
    async set(k, v) { await cmd('SET', K(k), JSON.stringify(v)); },
    async del(k) { await cmd('DEL', K(k)); },
    // Counters and hashes (rewards: member numbers, leaderboards). Atomic on Redis.
    async incr(k, by = 1) { return Number(await cmd('INCRBY', K(k), by)); },
    async hset(k, f, v) { await cmd('HSET', K(k), f, JSON.stringify(v)); },
    async hget(k, f) { const v = await cmd('HGET', K(k), f); return v == null ? null : JSON.parse(v); },
    async hdel(k, f) { await cmd('HDEL', K(k), f); },
    async hgetall(k) { const a = (await cmd('HGETALL', K(k))) || []; const o = {}; if (Array.isArray(a)) { for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = JSON.parse(a[i + 1]); } else Object.entries(a).forEach(([f, v]) => { o[f] = JSON.parse(v); }); return o; },
    async hmget(k, fields) { if (!fields.length) return []; return ((await cmd('HMGET', K(k), ...fields)) || []).map(v => v == null ? null : JSON.parse(v)); },
    // Sorted sets (leaderboards): rank lookups stay cheap however many members there are.
    async zadd(k, score, m) { await cmd('ZADD', K(k), score, m); },
    async zrem(k, m) { await cmd('ZREM', K(k), m); },
    async zrank(k, m, rev) { const r = await cmd(rev ? 'ZREVRANK' : 'ZRANK', K(k), m); return r == null ? null : Number(r); },
    async zrange(k, start, stop, rev) { return (await cmd(rev ? 'ZREVRANGE' : 'ZRANGE', K(k), start, stop)) || []; },
    async zcard(k) { return Number(await cmd('ZCARD', K(k))) || 0; },
  };
}
/** Counters and hashes on top of get/set, for stores without them (best effort: not atomic across instances). */
function withHashes(st) {
  return Object.assign(st, {
    async incr(k, by = 1) { const v = Number((await st.get(k)) || 0) + by; await st.set(k, v); return v; },
    async hset(k, f, v) { const o = (await st.get(k)) || {}; o[f] = v; await st.set(k, o); },
    async hget(k, f) { const o = (await st.get(k)) || {}; return o[f] ?? null; },
    async hdel(k, f) { const o = (await st.get(k)) || {}; delete o[f]; await st.set(k, o); },
    async hgetall(k) { return (await st.get(k)) || {}; },
    async hmget(k, fields) { const o = (await st.get(k)) || {}; return fields.map(f => o[f] ?? null); },
    async zadd(k, score, m) { const o = (await st.get(k)) || {}; o[m] = Number(score); await st.set(k, o); },
    async zrem(k, m) { const o = (await st.get(k)) || {}; delete o[m]; await st.set(k, o); },
    async zrank(k, m, rev) { const o = (await st.get(k)) || {}; if (!(m in o)) return null; const sorted = Object.keys(o).sort((a, b) => (o[a] - o[b]) || (a < b ? -1 : 1)); if (rev) sorted.reverse(); return sorted.indexOf(m); },
    async zrange(k, start, stop, rev) { const o = (await st.get(k)) || {}; const sorted = Object.keys(o).sort((a, b) => (o[a] - o[b]) || (a < b ? -1 : 1)); if (rev) sorted.reverse(); return sorted.slice(start, stop < 0 ? undefined : stop + 1); },
    async zcard(k) { return Object.keys((await st.get(k)) || {}).length; },
  });
}

let blobs = null;
function netlifyStore() {
  if (!process.env.NEXIS_NETLIFY) return null;
  if (!blobs) { const { getStore } = require('@netlify/blobs'); blobs = getStore({ name: 'nexis-accounts', consistency: 'strong' }); }
  return withHashes({
    async get(k) { return (await blobs.get(k, { type: 'json' })) ?? null; },
    async set(k, v) { await blobs.setJSON(k, v); },
    async del(k) { await blobs.delete(k); },
  });
}
function fileStore() {
  const dir = process.env.NEXIS_STORE_DIR; if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const f = (k) => path.join(dir, encodeURIComponent(k) + '.json');
  return withHashes({
    async get(k) { try { return JSON.parse(fs.readFileSync(f(k), 'utf8')); } catch (e) { return null; } },
    async set(k, v) { fs.writeFileSync(f(k), JSON.stringify(v)); },
    async del(k) { try { fs.unlinkSync(f(k)); } catch (e) {} },
  });
}
function store() { return redisStore() || netlifyStore() || fileStore(); }
const available = () => !!(redisCfg() || process.env.NEXIS_NETLIFY || process.env.NEXIS_STORE_DIR);

module.exports = { store, available };
