// Primer x402 - Testing Fixtures
// Pre-built test data for x402 integrations
// https://primer.systems

// Well-known test addresses (Hardhat default accounts)
const TEST_ADDRESSES = {
  payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  payee: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  facilitator: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
};

// USDC contract addresses by network
const USDC_ADDRESSES = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
};

// Sample route configuration for middleware
const sampleRouteConfig = {
  '/api/premium': {
    amount: '0.01',
    asset: USDC_ADDRESSES['base'],
    network: 'base'
  },
  '/api/basic': {
    amount: '0.001',
    asset: USDC_ADDRESSES['base'],
    network: 'base'
  }
};

// Sample 402 response body (what middleware returns)
const sample402ResponseBody = {
  x402Version: 1,
  accepts: [{
    scheme: 'exact',
    network: 'base',
    maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
    resource: '/api/premium',
    payTo: TEST_ADDRESSES.payee,
    asset: USDC_ADDRESSES['base'],
    extra: {
      name: 'USD Coin',
      version: '2'
    }
  }]
};

// Sample payment payload structure (before base64 encoding)
const samplePaymentPayload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base',
  payload: {
    signature: '0x' + '1234'.repeat(32), // Placeholder signature
    authorization: {
      from: TEST_ADDRESSES.payer,
      to: TEST_ADDRESSES.payee,
      value: '10000',
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: '0x' + '00'.repeat(32)
    }
  }
};

module.exports = {
  TEST_ADDRESSES,
  USDC_ADDRESSES,
  sampleRouteConfig,
  sample402ResponseBody,
  samplePaymentPayload
};
