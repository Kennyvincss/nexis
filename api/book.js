// Sportsbook registry: which Panta market holds each bet on each game, so every bettor finds the same market.
//   GET  /api/book?keys=<game>:<prop>,...      → { markets: { "<game>:<prop>": { marketId, question } } }   (up to 400 keys)
//   POST /api/book { action: 'register', game, prop, marketId, signature, question }
// A market is registered by whoever created it on Panta (the first bettor). Before recording it the server checks,
// on Solana, that the creation transaction succeeded, that it touches the market account and that it carries the
// question text; and, against Polymarket, that the question is about this game (both teams named, or the exact
// Polymarket question for "pm:<marketId>" props). The first registration for a key wins.
// Storage: the same store as server accounts (Upstash Redis on Vercel). Environment: SOLANA_RPC_URL (recommended).
const { send, env, readJson } = require('./_util');
const { store, available } = require('./_store');

const RPC = env('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const GAMMA = 'https://gamma-api.polymarket.com';
// Bet types: 1X2, winner, goal lines, handicaps, half-time, HT/FT, correct score, first to score, corners, cards,
// both teams to score, and mirrored Polymarket markets.
const KEY_RE = /^[A-Za-z0-9_-]{1,40}:(home|draw|away|winner|btts|ou[0-4]5|htou[0-4]5|hc_[ha][1-3]|ht_(home|draw|away)|htft_[hda][hda]|cs_[0-9]_[0-9]|fts_(home|away)|cor_o[0-9]{2,3}|cor[ha]_o[0-9]{2}|corhc_[ha]1|crd_o[0-9]{2}|crd[ha]_o[0-9]{2}|pm:[0-9]{1,20})$/;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function b58dec(str) {
  let n = 0n; for (const c of String(str)) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of String(str)) { if (c !== '1') break; bytes.unshift(0); } return Buffer.from(bytes);
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC error'); return j.result;
}
async function getJson(url) { const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

/** The creation transaction succeeded, touches the market account and carries the question. */
async function verifyTx(signature, marketId, question) {
  let tx = null;
  for (let i = 0; i < 4 && !tx; i++) { tx = await rpc('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]); if (!tx) await new Promise(r => setTimeout(r, 1500)); }
  if (!tx) return 'Transaction not found on Solana yet.';
  if (tx.meta && tx.meta.err) return 'The creation transaction failed on Solana.';
  const msg = tx.transaction && tx.transaction.message || {};
  const keys = [...(msg.accountKeys || []).map(k => typeof k === 'string' ? k : k.pubkey), ...((tx.meta && tx.meta.loadedAddresses && [...(tx.meta.loadedAddresses.writable || []), ...(tx.meta.loadedAddresses.readonly || [])]) || [])];
  if (!keys.includes(marketId)) return 'The transaction does not create this market.';
  const q = Buffer.from(question, 'utf8');
  const ixs = [...(msg.instructions || []), ...((tx.meta && tx.meta.innerInstructions) || []).flatMap(x => x.instructions || [])];
  const has = ixs.some(ix => { try { return b58dec(ix.data || '').includes(q); } catch (e) { return false; } });
  return has ? null : 'The transaction does not carry this question.';
}
/** The question is about this Polymarket game. */
async function verifyGame(game, prop, question) {
  if (prop.startsWith('pm:')) {
    const m = await getJson(`${GAMMA}/markets/${prop.slice(3)}`);
    const ev = (m.events || [])[0] || {};
    if (String(ev.id) !== String(game)) return 'That Polymarket market is not part of this game.';
    return norm(question).includes(norm(m.question)) ? null : 'Question does not match the Polymarket market.';
  }
  const e = await getJson(`${GAMMA}/events/${encodeURIComponent(game)}`);
  // Same parsing as the browser: "A vs. B: Total Runs" / "A vs. B - 1st Half" / "A - B" → [A, B].
  let t = String(e.title || '').trim(); const vs = /\s(?:vs\.?|v\.?|@)\s/i.test(t);
  t = vs ? t.replace(/\s*[:(|].*$/, '').replace(/\s+[-–]\s+.*$/, '') : t.replace(/\s*[:(|].*$/, '').replace(/\s*[-–]\s*(?:game|match)?\s*\d.*$/i, '');
  const sides = t.split(vs ? /\s+(?:vs\.?|v\.?|@)\s+/i : /\s+[-–]\s+/).map(norm).filter(Boolean);
  if (sides.length < 2) return 'Unknown game.';
  const q = norm(question); return sides.slice(0, 2).every(s => q.includes(s)) ? null : 'Question does not name both teams of this game.';
}

module.exports = async (req, res) => {
  if (!available()) return send(res, 503, { error: 'Sportsbook registry needs server storage (Upstash Redis).', code: 'NO_STORE' });
  const db = store();
  if (req.method === 'GET') {
    const keys = String((req.query && req.query.keys) || '').split(',').map(s => s.trim()).filter(k => KEY_RE.test(k)).slice(0, 400);
    const vals = await Promise.all(keys.map(k => db.get('book:' + k).catch(() => null)));
    const markets = {}; keys.forEach((k, i) => { if (vals[i]) markets[k] = { marketId: vals[i].marketId, question: vals[i].question }; });
    return send(res, 200, { markets }, { 'cache-control': 'public, s-maxage=5, stale-while-revalidate=30' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
  const b = await readJson(req) || {};
  if (b.action !== 'register') return send(res, 400, { error: 'Unknown action' });
  const key = `${b.game}:${b.prop}`;
  if (!KEY_RE.test(key)) return send(res, 400, { error: 'Bad game or bet type' });
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(b.marketId || '')) || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(b.signature || ''))) return send(res, 400, { error: 'Bad market id or signature' });
  const question = String(b.question || '').slice(0, 512); if (!question) return send(res, 400, { error: 'Missing question' });
  const existing = await db.get('book:' + key);
  if (existing) return send(res, 200, { market: { marketId: existing.marketId, question: existing.question }, existed: true });
  try {
    const bad = (await verifyGame(String(b.game), String(b.prop), question)) || (await verifyTx(b.signature, b.marketId, question));
    if (bad) return send(res, 422, { error: bad, code: 'NOT_VERIFIED' });
  } catch (e) { return send(res, 502, { error: 'Could not verify the market right now: ' + e.message, code: 'VERIFY_UNAVAILABLE' }); }
  const again = await db.get('book:' + key); // another bettor may have registered while we verified
  if (again) return send(res, 200, { market: { marketId: again.marketId, question: again.question }, existed: true });
  await db.set('book:' + key, { marketId: b.marketId, question, signature: b.signature, at: Date.now() });
  return send(res, 200, { market: { marketId: b.marketId, question }, existed: false });
};
