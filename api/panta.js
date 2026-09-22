// Panta API proxy. The browser never sees PANTA_API_KEY.
//   GET  /api/panta?path=markets/&limit=50          -> GET  https://live-api.panta.market/api/v1/markets/?limit=50
//   POST /api/panta?path=primaryorderquote/  {json} -> POST https://live-api.panta.market/api/v1/primaryorderquote/
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   PANTA_API_KEY       required. pk_live_... for mainnet, pk_test_... returns Panta's sandbox fixtures.
//   PANTA_API_BASE_URL  optional. Defaults to https://live-api.panta.market/api/v1
//   PANTA_USER_ID       optional. Attribution id sent as X-User-Id.
const { send, env, readJson } = require('./_util');

const BASE = (env('PANTA_API_BASE_URL') || 'https://live-api.panta.market/api/v1').replace(/\/+$/, '');
const ID = '[A-Za-z0-9_-]{8,64}';
const GET_PATHS = [new RegExp('^markets/$'), new RegExp(`^markets/${ID}/$`), new RegExp(`^markets/${ID}/trades/$`), /^categories\/$/, /^positions\/$/, /^trades\/status\/$/];
const POST_PATHS = ['primaryorderquote/', 'primaryorderbuild/', 'primaryordersubmit/', 'markets/create/quote/', 'markets/create/build/', 'markets/create/register/', 'claim/build/', 'claim/creator-fees/', 'trades/report/'];

module.exports = async (req, res) => {
  const key = env('PANTA_API_KEY');
  const mode = !key ? 'unconfigured' : key.startsWith('pk_test_') ? 'test' : 'live';
  res.setHeader('x-panta-mode', mode);
  if (!key) return send(res, 503, { code: 'PANTA_NOT_CONFIGURED', message: 'Add PANTA_API_KEY in Vercel → Settings → Environment Variables, then redeploy.' });

  let path = String(req.query.path || '').replace(/^\/+/, '');
  if (!path.endsWith('/')) path += '/';
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const allowed = method === 'GET' ? GET_PATHS.some(r => r.test(path)) : POST_PATHS.includes(path);
  if (!allowed) return send(res, 404, { code: 'PATH_NOT_ALLOWED', message: `${method} ${path} is not proxied.` });

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) if (k !== 'path' && v != null && v !== '') qs.set(k, String(v));
  const url = `${BASE}/${path}${qs.toString() ? '?' + qs : ''}`;
  const headers = { 'X-Api-Key': key, accept: 'application/json' };
  if (env('PANTA_USER_ID')) headers['X-User-Id'] = env('PANTA_USER_ID');
  let body;
  if (method === 'POST') { const j = await readJson(req); if (!j) return send(res, 400, { code: 'INVALID_JSON', message: 'Send a JSON body.' }); body = JSON.stringify(j); headers['content-type'] = 'application/json'; }

  try {
    const up = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
    const text = await up.text();
    const extra = {};
    const ra = up.headers.get('retry-after'); if (ra) extra['retry-after'] = ra;
    if (method === 'GET' && up.ok) extra['cache-control'] = path.startsWith('positions') || path.startsWith('trades/status') ? 'no-store' : 'public, s-maxage=3, stale-while-revalidate=10';
    else extra['cache-control'] = 'no-store';
    return send(res, up.status, text || '{}', extra);
  } catch (e) {
    return send(res, 502, { code: 'PANTA_UNREACHABLE', message: 'Could not reach the Panta API.' });
  }
};
