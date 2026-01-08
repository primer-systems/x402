// Primer x402
// TypeScript SDK for x402 payments
// https://primer.systems | https://x402.org

// Signer
const { createSigner, NETWORKS } = require('./signer');

// Payer functions (for paying for APIs)
const { x402Fetch, x402Axios, approveToken } = require('./payer');

// Payee middleware (for charging for APIs)
const { x402Express, x402Hono, x402Next, DEFAULT_FACILITATOR } = require('./payee');

module.exports = {
  // Signer
  createSigner,
  NETWORKS,

  // Payer
  x402Fetch,
  x402Axios,
  approveToken,

  // Payee
  x402Express,
  x402Hono,
  x402Next,

  // Constants
  DEFAULT_FACILITATOR
};
