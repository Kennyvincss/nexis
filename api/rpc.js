// Solana JSON-RPC proxy for balances, token accounts and transaction confirmation.
//   POST /api/rpc  { jsonrpc, id, method, params }
// Environment variables:
//   SOLANA_RPC_URL  recommended. A private mainnet RPC (Helius, Triton, QuickNode...). The public
//                   endpoint below is heavily rate-limited and blocks many server IPs.
const { send, env, readJson } = require('./_util');

const RPC = env('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const METHODS = new Set(['getBalance', 'getTokenAccountsByOwner', 'getSignatureStatuses', 'getSignaturesForAddress', 'getTransaction', 'getLatestBlockhash', 'getBlockHeight', 'sendTransaction', 'getAccountInfo']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const body = await readJson(req);
  const calls = Array.isArray(body) ? body : [body];
  if (!body || !calls.every(c => c && METHODS.has(c.method))) return send(res, 400, { error: 'Method not allowed' });
  try {
    const up = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    return send(res, up.status, await up.text(), { 'cache-control': 'no-store', 'x-rpc-custom': env('SOLANA_RPC_URL') ? '1' : '0' });
  } catch (e) {
    return send(res, 502, { error: 'RPC unreachable' });
  }
};
