// Same-origin proxy for public market, sports and crypto feeds (allowlisted hosts only).
//   GET /api/data?url=<encoded https URL>
// Optional environment variables:
//   COINGECKO_API_KEY   CoinGecko key. Demo keys (CG-...) use api.coingecko.com, set COINGECKO_PRO=1 for a Pro key.
const { send, env } = require('./_util');

const ALLOWED = new Set([
  'gamma-api.polymarket.com', 'data-api.polymarket.com', 'clob.polymarket.com',
  'site.api.espn.com',
  'api.coingecko.com', 'pro-api.coingecko.com',
  'api.exchange.coinbase.com',
]);
const TTL = { 'site.api.espn.com': 8, 'api.coingecko.com': 20, 'pro-api.coingecko.com': 10, 'api.exchange.coinbase.com': 20 };

module.exports = async (req, res) => {
  res.setHeader('x-nexis-proxy', '1');
  let target;
  try { target = new URL(String(req.query.url || '')); } catch (e) { return send(res, 400, { error: 'Invalid url' }); }
  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) return send(res, 403, { error: 'Host not allowed' });
  const headers = { accept: 'application/json', 'user-agent': 'Nexis/1.0' };
  if (target.hostname.endsWith('coingecko.com')) {
    const k = env('COINGECKO_API_KEY');
    if (k && env('COINGECKO_PRO')) { target.hostname = 'pro-api.coingecko.com'; headers['x-cg-pro-api-key'] = k; }
    else if (k) headers['x-cg-demo-api-key'] = k;
  }
  try {
    const up = await fetch(target, { headers, signal: AbortSignal.timeout(10000) });
    const body = await up.text();
    const ttl = TTL[target.hostname] || 4;
    return send(res, up.status, body || '{}', { 'cache-control': up.ok ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}` : 'no-store' });
  } catch (e) {
    return send(res, 502, { error: 'Upstream unavailable' });
  }
};
