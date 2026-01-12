# @primersystems/x402

[![npm version](https://img.shields.io/npm/v/@primersystems/x402.svg)](https://www.npmjs.com/package/@primersystems/x402)
[![Tests](https://github.com/Primer-Systems/x402/actions/workflows/test.yml/badge.svg)](https://github.com/Primer-Systems/x402/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**TypeScript SDK for x402 HTTP payments by [Primer](https://primer.systems).**

Easily add pay-per-request monetization to your JavaScript/TypeScript APIs using the [x402 protocol](https://x402.org). Accept stablecoin payments (USDC, EURC) or any ERC-20 token with gasless transactions—payers never pay gas fees.

## Why x402?

- **HTTP-native payments** - Uses the standard HTTP 402 Payment Required status code
- **Gasless for payers** - Payments are authorized via EIP-712 signatures; facilitators handle gas
- **Stablecoin support** - Native support for USDC/EURC via EIP-3009 `transferWithAuthorization`
- **Any ERC-20 token** - Support for other tokens via Primer's *Prism* settlement contract
- **Multi-chain** - Base, Ethereum, Arbitrum, Optimism, Polygon (mainnet + testnet)
- **Framework integrations** - Express, Hono, Next.js middleware included
- **Testing utilities** - Mock facilitator for integration testing

## Installation

```bash
npm install @primersystems/x402
```

## Payer (Client)

Wrap fetch or axios to automatically handle 402 responses:

```javascript
const { createSigner, x402Fetch, x402Axios } = require('@primersystems/x402');

// Create a signer (use CAIP-2 network format)
const signer = await createSigner('eip155:8453', process.env.PRIVATE_KEY);

// Wrap fetch
const fetch402 = x402Fetch(fetch, signer, { maxAmount: '1.00' });
const response = await fetch402('https://example.com/api/paywall');

// Or wrap axios
const axios402 = x402Axios(axios.create(), signer, { maxAmount: '1.00' });
const response = await axios402.get('https://example.com/api/paywall');
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `maxAmount` | Yes | Maximum payment per request (e.g., '1.00') |
| `facilitator` | No | Custom facilitator URL |
| `verify` | No | Verify payment before sending (default: true) |

## Payee (Server)

Middleware for Express, Hono, and Next.js:

### Express

```javascript
const { x402Express } = require('@primersystems/x402');

app.use(x402Express('0xYourAddress', {
  '/api/paywall': {
    amount: '0.01',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    network: 'eip155:8453'  // CAIP-2 format
  },
  '/api/data/*': {
    amount: '0.001',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    network: 'eip155:8453'  // CAIP-2 format
  }
}));
```

### Hono

```javascript
const { x402Hono } = require('@primersystems/x402');

app.use('*', x402Hono('0xYourAddress', {
  '/api/paywall': { amount: '0.01', asset: '0x...', network: 'eip155:8453' }
}));
```

### Next.js

```javascript
// App Router (Next.js 13+)
import { x402Next } from '@primersystems/x402';

async function handler(req) {
  return Response.json({ data: 'paywall' });
}

export const GET = x402Next(handler, {
  payTo: '0xYourAddress',
  amount: '0.01',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  network: 'eip155:8453'  // CAIP-2 format
});
```

## Token Types

### EIP-3009 Tokens (USDC, EURC)

These tokens support gasless transfers natively via `transferWithAuthorization`. The payer signs an authorization, and the facilitator executes the transfer—payer pays zero gas.

### Standard ERC-20 Tokens

For other ERC-20 tokens, Primer's *Prism* contract enables gasless payments:

1. **One-time approval** - Approve the Prism contract to spend your tokens
2. **Gasless payments** - Sign authorizations; Prism handles the transfers

```javascript
const { createSigner, approveToken } = require('@primersystems/x402');

const signer = await createSigner('eip155:8453', process.env.PRIVATE_KEY);

// One-time approval (this transaction requires gas)
await approveToken(signer, '0xTokenAddress');

// Now you can make gasless payments with this token
```

## Networks

Networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) identifiers (e.g., `eip155:8453` for Base).

| Network (CAIP-2) | Chain ID | Legacy Name | Default Facilitator |
|------------------|----------|-------------|---------------------|
| eip155:8453 | 8453 | base | ✓ Primer |
| eip155:84532 | 84532 | base-sepolia | ✓ Primer |
| eip155:1 | 1 | ethereum | Custom required |
| eip155:11155111 | 11155111 | sepolia | Custom required |
| eip155:42161 | 42161 | arbitrum | Custom required |
| eip155:421614 | 421614 | arbitrum-sepolia | Custom required |
| eip155:10 | 10 | optimism | Custom required |
| eip155:11155420 | 11155420 | optimism-sepolia | Custom required |
| eip155:137 | 137 | polygon | Custom required |
| eip155:80002 | 80002 | polygon-amoy | Custom required |

> **Note:** Legacy network names (e.g., `'base'`) are still accepted for backward compatibility but CAIP-2 format is recommended.

### Custom Facilitator

For non-Base networks, you must provide your own facilitator:

```javascript
// Payee
app.use(x402Express('0xYourAddress', {
  '/api/paywall': { amount: '0.01', asset: '0x...', network: 'eip155:1' }
}, { facilitator: 'https://your-facilitator.com' }));

// Payer
const fetch402 = x402Fetch(fetch, signer, {
  maxAmount: '1.00',
  facilitator: 'https://your-facilitator.com'
});
```

## Debug Logging

```bash
DEBUG=x402:* node app.js
DEBUG=x402:payer,x402:payee node app.js
```

## Testing Your Integration

The SDK provides testing utilities to help you test your x402 integration without making real payments. Import from `@primersystems/x402/testing`:

```javascript
const {
  createMockFacilitator,
  createTestPayment,
  createTest402Response,
  fixtures
} = require('@primersystems/x402/testing');
```

### What's Provided

| Utility | Purpose |
|---------|---------|
| `createMockFacilitator()` | Fake payment server that approves/rejects without blockchain |
| `createTestPayment()` | Generate valid X-PAYMENT headers without a real wallet |
| `createTest402Response()` | Generate 402 responses for testing client code |
| `fixtures` | Pre-built test addresses, route configs, and sample payloads |

### Testing a Payee (Server)

If you've built an API with x402 payments, test it like this:

```javascript
// my-api.test.js
const request = require('supertest');
const app = require('./my-app');
const { createMockFacilitator, createTestPayment } = require('@primersystems/x402/testing');

describe('My Paid API', () => {
  let mockFac;

  beforeAll(async () => {
    // Start a fake facilitator on port 3001
    mockFac = await createMockFacilitator({ port: 3001 });
  });

  afterAll(async () => {
    await mockFac.close();
  });

  test('returns 402 when no payment provided', async () => {
    const res = await request(app).get('/api/premium');
    expect(res.status).toBe(402);
    expect(res.headers['payment-required']).toBeDefined();
  });

  test('returns 200 when valid payment provided', async () => {
    const payment = createTestPayment({ amount: '10000' }); // 0.01 USDC

    const res = await request(app)
      .get('/api/premium')
      .set('X-PAYMENT', payment);

    expect(res.status).toBe(200);
  });

  test('rejects insufficient payment', async () => {
    const payment = createTestPayment({ amount: '1' }); // way too little

    const res = await request(app)
      .get('/api/premium')
      .set('X-PAYMENT', payment);

    expect(res.status).toBe(402);
  });
});
```

**Important:** Point your middleware at the mock facilitator during tests:

```javascript
// In your app setup for tests
const middleware = x402Express(payTo, routes, {
  facilitator: 'http://127.0.0.1:3001'  // Mock facilitator URL
});
```

### Testing a Payer (Client)

If you've built a client that pays for APIs, test the 402 handling:

```javascript
const { createTest402Response, fixtures } = require('@primersystems/x402/testing');

test('client handles 402 response', async () => {
  // Create a mock server that returns 402
  const server = setupMockServer((req, res) => {
    const body = createTest402Response({
      amount: '10000',
      payTo: fixtures.TEST_ADDRESSES.payee,
      resource: '/api/data'
    });
    res.status(402)
       .set('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(body)).toString('base64'))
       .end();
  });

  // Test your client handles it correctly
  const result = await myClient.fetchWithPayment('/api/data');
  expect(result).toBeDefined();
});
```

### Mock Facilitator Options

```javascript
// Auto-approve all payments (default)
const mock = await createMockFacilitator({ mode: 'approve' });

// Reject all payments
const mock = await createMockFacilitator({ mode: 'reject' });

// Custom logic
const mock = await createMockFacilitator({
  mode: 'custom',
  handler: (payload) => {
    const amount = payload.paymentRequirements?.maxAmountRequired;
    if (parseInt(amount) > 1000000) {
      return { success: false, error: 'Amount too high for test' };
    }
    return { success: true, transaction: '0x' + 'f'.repeat(64) };
  }
});

// Add artificial latency (for timeout testing)
const mock = await createMockFacilitator({ latencyMs: 5000 });
```

### Inspecting Requests

The mock facilitator records all requests for assertions:

```javascript
const mock = await createMockFacilitator();

// ... run your test ...

// Check what was sent to the facilitator
expect(mock.requests.length).toBe(1);
expect(mock.lastRequest().payload.paymentRequirements.network).toBe('eip155:8453');

// Clear between tests
mock.clearRequests();
```

### createTestPayment Options

```javascript
createTestPayment({
  amount: '10000',             // Amount in smallest units (default: '10000')
  from: '0x...',               // Payer address (default: test address)
  to: '0x...',                 // Payee address (default: test address)
  network: 'eip155:84532',     // Network in CAIP-2 format (default: 'eip155:8453')
  validForSeconds: 7200        // Validity window (default: 3600)
});
```

### Available Fixtures

```javascript
const { fixtures } = require('@primersystems/x402/testing');

fixtures.TEST_ADDRESSES.payer   // '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
fixtures.TEST_ADDRESSES.payee   // '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

fixtures.USDC_ADDRESSES['eip155:8453']   // USDC on Base mainnet
fixtures.USDC_ADDRESSES['eip155:84532']  // USDC on Base Sepolia

fixtures.sampleRouteConfig      // Example route config for middleware
fixtures.sample402ResponseBody  // Example 402 response structure
fixtures.samplePaymentPayload   // Example payment payload structure
```

## Changelog

### v0.4.3
- Cleaned up legacy v1 protocol remnants for pure v2 compliance

### v0.4.2
- **Bug fix**: 402 Payment Required responses now include JSON body (`{}`) instead of empty body
- Fixes Chrome content script injection blocking issue
- Aligns with Coinbase x402 specification

### v0.4.0
- **x402 v2 protocol**: Full upgrade to x402 v2 specification with `x402Version: 2`
- **CAIP-2 network identifiers**: All networks now use CAIP-2 format (e.g., `'eip155:8453'` instead of `'base'`)
- **Multi-chain support**: Base, Ethereum, Arbitrum, Optimism, and Polygon (mainnets + testnets)
- **Network utilities**: New functions `toCaipNetwork()`, `fromCaipNetwork()`, `chainIdToCaip()`, `caipToChainId()`
- **Facilitator validation**: SDK requires custom facilitator for non-Base networks
- **Legacy compatibility**: Legacy network names still accepted as input but CAIP-2 is used internally
- **Testing fixtures**: Updated to v2 format with CAIP-2 network identifiers

### v0.3.0
- **Testing utilities**: New `@primersystems/x402/testing` module with mock facilitator, test payment generator, and fixtures
- **Internal test suite**: 112 tests covering utils, signer, payer, payee, and testing modules
- **CI pipeline**: GitHub Actions runs tests on all pushes and PRs

### v0.2.0
- Initial public release
- Payer: `createSigner`, `x402Fetch`, `x402Axios`
- Payee: `x402Express`, `x402Hono`, `x402Next` middleware
- Support for Base mainnet and Base Sepolia
- EIP-3009 (USDC/EURC) and standard ERC-20 tokens

## Links

- [x402 Protocol Specification](https://x402.org)
- [Primer Systems](https://primer.systems)
- [GitHub Repository](https://github.com/Primer-Systems/x402)
- [Python SDK](https://pypi.org/project/primer-x402/)

## License

MIT - [Primer Systems](https://primer.systems)

