# @primersystems/x402

JavaScript SDK for x402 HTTP payments on Base.

## Installation

```bash
npm install @primersystems/x402
```

## Payer (Client)

Wrap fetch or axios to automatically handle 402 responses:

```javascript
const { createSigner, x402Fetch, x402Axios } = require('@primersystems/x402');

// Create a signer
const signer = await createSigner('base', process.env.PRIVATE_KEY);

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
    network: 'base'
  },
  '/api/data/*': {
    amount: '0.001',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    network: 'base'
  }
}));
```

### Hono

```javascript
const { x402Hono } = require('@primersystems/x402');

app.use('*', x402Hono('0xYourAddress', {
  '/api/paywall': { amount: '0.01', asset: '0x...', network: 'base' }
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
  network: 'base'
});
```

## Token Approval

For standard ERC-20 tokens (not USDC/EURC), approve the *Prism* contract first:

```javascript
const { createSigner, approveToken } = require('@primersystems/x402');

const signer = await createSigner('base', process.env.PRIVATE_KEY);
await approveToken(signer, '0xTokenAddress');
```

## Networks

| Network | Chain ID | RPC Env Var |
|---------|----------|-------------|
| base | 8453 | `RPC_BASE` |
| base-sepolia | 84532 | `RPC_BASE_SEPOLIA` |

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
expect(mock.lastRequest().payload.paymentRequirements.network).toBe('base');

// Clear between tests
mock.clearRequests();
```

### createTestPayment Options

```javascript
createTestPayment({
  amount: '10000',           // Amount in smallest units (default: '10000')
  from: '0x...',             // Payer address (default: test address)
  to: '0x...',               // Payee address (default: test address)
  network: 'base-sepolia',   // Network (default: 'base')
  validForSeconds: 7200      // Validity window (default: 3600)
});
```

### Available Fixtures

```javascript
const { fixtures } = require('@primersystems/x402/testing');

fixtures.TEST_ADDRESSES.payer   // '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
fixtures.TEST_ADDRESSES.payee   // '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

fixtures.USDC_ADDRESSES['base']         // USDC on Base mainnet
fixtures.USDC_ADDRESSES['base-sepolia'] // USDC on Base Sepolia

fixtures.sampleRouteConfig      // Example route config for middleware
fixtures.sample402ResponseBody  // Example 402 response structure
fixtures.samplePaymentPayload   // Example payment payload structure
```

## Changelog

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

## License

MIT

