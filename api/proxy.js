// Same-origin proxy for Nexis' public data feeds (Vercel serverless function).
// The browser calls /api/proxy?url=<encoded upstream URL>; only the hosts below are allowed.
// Responses are cached briefly at the edge so many viewers share one upstream request.
const ALLOWED = new Set([
  'gamma-api.polymarket.com',
  'data-api.polymarket.com',
  'clob.polymarket.com',
  'site.api.espn.com',
]);

module.exports = async (req, res) => {
  res.setHeader('x-nexis-proxy', '1');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch (e) {
    res.status(400).send(JSON.stringify({ error: 'Invalid url' }));
    return;
  }
  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) {
    res.status(403).send(JSON.stringify({ error: 'Host not allowed' }));
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: { accept: 'application/json', 'user-agent': 'Nexis/1.0 (+https://vercel.com)' },
      signal: AbortSignal.timeout(9000),
    });
    const body = await upstream.text();
    const ttl = target.hostname === 'site.api.espn.com' ? 8 : 4;
    res.setHeader('cache-control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: 'Upstream unavailable' }));
  }
};
