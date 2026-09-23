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
  };
}

let blobs = null;
function netlifyStore() {
  if (!process.env.NEXIS_NETLIFY) return null;
  if (!blobs) { const { getStore } = require('@netlify/blobs'); blobs = getStore({ name: 'nexis-accounts', consistency: 'strong' }); }
  return {
    async get(k) { return (await blobs.get(k, { type: 'json' })) ?? null; },
    async set(k, v) { await blobs.setJSON(k, v); },
    async del(k) { await blobs.delete(k); },
  };
}
function fileStore() {
  const dir = process.env.NEXIS_STORE_DIR; if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const f = (k) => path.join(dir, encodeURIComponent(k) + '.json');
  return {
    async get(k) { try { return JSON.parse(fs.readFileSync(f(k), 'utf8')); } catch (e) { return null; } },
    async set(k, v) { fs.writeFileSync(f(k), JSON.stringify(v)); },
    async del(k) { try { fs.unlinkSync(f(k)); } catch (e) {} },
  };
}
function store() { return redisStore() || netlifyStore() || fileStore(); }
const available = () => !!(redisCfg() || process.env.NEXIS_NETLIFY || process.env.NEXIS_STORE_DIR);

module.exports = { store, available };
