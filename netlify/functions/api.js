// Netlify adapter: runs the same /api handlers used on Vercel.
// netlify.toml rewrites /api/<name> to this function; secrets come from
// Netlify → Site configuration → Environment variables.
const ROUTES = {
  panta: () => require('../../api/panta.js'),
  data: () => require('../../api/data.js'),
  rpc: () => require('../../api/rpc.js'),
  config: () => require('../../api/config.js'),
  email: () => require('../../api/email.js'),
  ai: () => require('../../api/ai.js'),
  auth: () => require('../../api/auth.js'),
  sports: () => require('../../api/sports.js'),
  pmgames: () => require('../../api/pmgames.js'),
  book: () => require('../../api/book.js'),
};

exports.handler = async (event) => {
  const name = String(event.path || '').replace(/\/+$/, '').split('/').pop();
  const load = ROUTES[name];
  if (!load) return { statusCode: 404, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) };

  // Netlify Blobs (server-side accounts) needs the Lambda event to find its credentials.
  try { require('@netlify/blobs').connectLambda(event); process.env.NEXIS_NETLIFY = '1'; } catch (e) { /* Blobs unavailable: accounts fall back to the browser */ }

  let body = event.body || null;
  if (body && event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  if (body) { try { body = JSON.parse(body); } catch (e) { /* leave as string */ } }
  const req = { method: event.httpMethod, query: { ...(event.queryStringParameters || {}) }, headers: event.headers || {}, body, url: event.rawUrl || event.path };

  const out = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader(k, v) { out.headers[String(k).toLowerCase()] = String(v); return this; },
    getHeader(k) { return out.headers[String(k).toLowerCase()]; },
    status(s) { out.statusCode = s; return this; },
    send(b) { out.body = typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : JSON.stringify(b); return this; },
    json(o) { out.headers['content-type'] = 'application/json; charset=utf-8'; out.body = JSON.stringify(o); return this; },
    end(b) { if (b != null) out.body = String(b); return this; },
  };
  await load()(req, res);
  return out;
};
