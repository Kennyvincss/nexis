// Tells the browser which integrations are configured — never the secrets themselves.
const { send, env } = require('./_util');
const { available } = require('./_store');

module.exports = async (req, res) => {
  const panta = env('PANTA_API_KEY');
  send(res, 200, {
    panta: { configured: !!panta, mode: !panta ? 'unconfigured' : panta.startsWith('pk_test_') ? 'test' : 'live' },
    rpc: { custom: !!env('SOLANA_RPC_URL') },
    google: { clientId: env('GOOGLE_CLIENT_ID') },
    email: { configured: !!(env('RESEND_API_KEY') && env('EMAIL_FROM') && env('AUTH_SECRET')) },
    ai: { configured: !!env('ANTHROPIC_API_KEY') },
    coingecko: { key: !!env('COINGECKO_API_KEY') },
    accounts: { server: available() },
  }, { 'cache-control': 'no-store' });
};
