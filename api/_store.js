// Key-value storage for server-side accounts.
// - Netlify: Netlify Blobs (store "nexis-accounts", strong consistency). Built in; no setup needed.
// - Local testing: a JSON-file store when NEXIS_STORE_DIR is set.
// - Anywhere else (e.g. Vercel without a store): unavailable, and the app falls back to browser-only accounts.
const fs = require('fs');
const path = require('path');

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
function store() { return netlifyStore() || fileStore(); }
const available = () => !!(process.env.NEXIS_NETLIFY || process.env.NEXIS_STORE_DIR);

module.exports = { store, available };
