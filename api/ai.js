// Nexis AI: turns a post into a draft market, and summarises factors for an open market.
//   POST /api/ai { task: "extract", text }             -> draft market JSON
//   POST /api/ai { task: "analyze", market: {...} }    -> { yes: [...], no: [...], summary }
// Environment variables:
//   ANTHROPIC_API_KEY  Claude API key (https://console.anthropic.com)
const Anthropic = require('@anthropic-ai/sdk');
const { send, env, readJson } = require('./_util');

const factor = { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'], additionalProperties: false };
const SCHEMAS = {
  extract: { type: 'object', additionalProperties: false, required: ['isPrediction', 'question', 'category', 'deadlineISO', 'resolutionSource', 'resolutionRule', 'confidence', 'assumption'],
    properties: { isPrediction: { type: 'boolean' }, question: { type: 'string' }, category: { type: 'string', enum: ['sports', 'crypto', 'politics', 'entertainment', 'finance', 'science', 'world', 'other'] }, deadlineISO: { type: 'string' }, resolutionSource: { type: 'string' }, resolutionRule: { type: 'string' }, confidence: { type: 'integer' }, assumption: { type: 'string' } } },
  analyze: { type: 'object', additionalProperties: false, required: ['yes', 'no', 'summary'], properties: { yes: { type: 'array', items: factor }, no: { type: 'array', items: factor }, summary: { type: 'string' } } },
};

function prompt(task, b) {
  const today = new Date().toISOString().slice(0, 10);
  if (task === 'extract') return `Today is ${today}. Convert this social-media post into a binary YES/NO prediction market that can be verified objectively.\n\nPost: """${String(b.text || '').slice(0, 1200)}"""\n\nThe question must be resolvable with a concrete deadline (deadlineISO as YYYY-MM-DD). resolutionSource names where the answer will be checked; resolutionRule states exactly what resolves YES. confidence is 0-100 for how clearly the post makes a checkable prediction. Put any interpretation you made in assumption (empty string if none). If the post makes no prediction, set isPrediction false.`;
  const m = b.market || {};
  return `You are a neutral analyst for a prediction market. Market: "${String(m.title || '').slice(0, 512)}". Current YES price: ${m.yesPrice ?? 'unknown'}. Resolution rule: ${String(m.rule || 'not provided').slice(0, 1500)}. Today is ${today}.\nGive 3 factors that support YES and 3 that support NO, each a 2-4 word title and one sentence, plus a one-sentence balanced summary. You have no live data: reason from general knowledge and say so where it matters. Never recommend a side.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!env('ANTHROPIC_API_KEY')) return send(res, 503, { code: 'AI_NOT_CONFIGURED', message: 'Add ANTHROPIC_API_KEY to enable Nexis AI.' });
  const b = await readJson(req) || {};
  if (!SCHEMAS[b.task]) return send(res, 400, { code: 'INVALID_REQUEST', message: 'Unknown task.' });
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMAS[b.task] } },
      messages: [{ role: 'user', content: prompt(b.task, b) }],
    });
    if (response.stop_reason === 'refusal') return send(res, 422, { code: 'AI_DECLINED', message: 'Nexis AI declined this request.' });
    const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('');
    return send(res, 200, JSON.parse(text));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return send(res, 429, { code: 'AI_RATE_LIMITED', message: 'Nexis AI is busy. Try again in a minute.' });
    if (error instanceof Anthropic.AuthenticationError) return send(res, 503, { code: 'AI_NOT_CONFIGURED', message: 'ANTHROPIC_API_KEY is invalid.' });
    if (error instanceof Anthropic.APIError) return send(res, 502, { code: 'AI_ERROR', message: `Nexis AI error (${error.status}).` });
    if (error instanceof SyntaxError) return send(res, 502, { code: 'AI_BAD_OUTPUT', message: 'Nexis AI returned an unreadable answer.' });
    return send(res, 502, { code: 'AI_UNREACHABLE', message: 'Could not reach Nexis AI.' });
  }
};
