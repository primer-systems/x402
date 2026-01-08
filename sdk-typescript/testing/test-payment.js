// Primer x402 - Test Payment Generator
// Creates valid X-PAYMENT headers for testing without a real wallet
// x402 v2 - CAIP-2 network format
// https://primer.systems

const { base64Encode, X402_VERSION, toCaipNetwork } = require('../utils');
const { TEST_ADDRESSES, USDC_ADDRESSES } = require('./fixtures');

/**
 * Generate a test X-PAYMENT header
 *
 * @param {Object} options - Payment options
 * @param {string} [options.amount='10000'] - Amount in smallest units (e.g., 10000 = 0.01 USDC)
 * @param {string} [options.from] - Payer address (defaults to test address)
 * @param {string} [options.to] - Payee address (defaults to test address)
 * @param {string} [options.network='eip155:8453'] - Network in CAIP-2 format
 * @param {string} [options.asset] - Token contract address (defaults to USDC)
 * @param {string} [options.signature] - Custom signature (defaults to placeholder)
 * @param {number} [options.validForSeconds=3600] - How long the payment is valid
 * @returns {string} Base64-encoded X-PAYMENT header
 *
 * @example
 * // Basic usage
 * const header = createTestPayment({ amount: '10000' });
 *
 * // Use in a test
 * const res = await fetch('/api/premium', {
 *   headers: { 'X-PAYMENT': header }
 * });
 */
function createTestPayment(options = {}) {
  const {
    amount = '10000',
    from = TEST_ADDRESSES.payer,
    to = TEST_ADDRESSES.payee,
    network: inputNetwork = 'eip155:8453',
    asset,
    signature = '0x' + 'ab'.repeat(65), // 130 hex chars = 65 bytes
    validForSeconds = 3600
  } = options;

  // Normalize network to CAIP-2 format
  const network = inputNetwork.startsWith('eip155:') ? inputNetwork : toCaipNetwork(inputNetwork);
  const tokenAsset = asset || USDC_ADDRESSES[network] || USDC_ADDRESSES['eip155:8453'];

  const now = Math.floor(Date.now() / 1000);
  const nonce = '0x' + Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex').toString('hex').padStart(64, '0').slice(0, 64);

  const payload = {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network,  // CAIP-2 format
    payload: {
      signature,
      authorization: {
        from,
        to,
        value: amount,
        validAfter: String(now - 60), // Valid from 1 minute ago
        validBefore: String(now + validForSeconds),
        nonce
      }
    }
  };

  return base64Encode(JSON.stringify(payload));
}

/**
 * Create a test 402 response body (what a server returns)
 * Useful for testing client-side payment handling
 *
 * @param {Object} options - Response options
 * @param {string} [options.amount='10000'] - Required amount
 * @param {string} [options.payTo] - Payee address
 * @param {string} [options.network='eip155:8453'] - Network in CAIP-2 format
 * @param {string} [options.resource='/api/test'] - Resource path
 * @returns {Object} 402 response body (x402 v2 format)
 */
function createTest402Response(options = {}) {
  const {
    amount = '10000',
    payTo = TEST_ADDRESSES.payee,
    network: inputNetwork = 'eip155:8453',
    resource = '/api/test',
    asset
  } = options;

  // Normalize network to CAIP-2 format
  const network = inputNetwork.startsWith('eip155:') ? inputNetwork : toCaipNetwork(inputNetwork);
  const tokenAsset = asset || USDC_ADDRESSES[network] || USDC_ADDRESSES['eip155:8453'];

  return {
    x402Version: X402_VERSION,
    accepts: [{
      scheme: 'exact',
      network,  // CAIP-2 format
      maxAmountRequired: amount,
      resource,
      payTo,
      asset: tokenAsset,
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    }]
  };
}

module.exports = {
  createTestPayment,
  createTest402Response
};
