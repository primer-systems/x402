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

## License

MIT

