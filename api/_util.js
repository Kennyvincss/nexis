// Shared helpers for Nexis serverless functions (files starting with "_" are not routes on Vercel; Netlify uses netlify/functions/api.js).

function send(res, status, body, headers = {}) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).send(typeof body === 'string' ? body : JSON.stringify(body));
}

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
  return null;
}

module.exports = { send, env, readJson };
