# @primersystems/x402

JavaScript SDK for x402 payments. Pay for APIs and charge for APIs with stablecoins.

**x402** is an open protocol for internet-native payments using HTTP 402 status codes.

Learn more: [x402.org](https://x402.org) | [Primer Systems](https://primersystems.ai)

---

## Installation

```bash
npm install @primersystems/x402
```

**For viem WalletClient support** (hardware wallets, WalletConnect, etc.):

```bash
npm install @primersystems/x402 viem
```

> **Note:** viem is an optional peer dependency. Only install it if you need WalletClient support for hardware wallets, WalletConnect, or other advanced wallet integrations. The simple approach using private keys works with just ethers (included by default).

---

## Quick Start

### Paying for APIs (Payer)

**Simple approach (private key):**

```javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');

// Create signer with your wallet
const signer = await createSigner('base', process.env.PRIVATE_KEY);

// Wrap fetch to auto-handle 402 responses
const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });

// Use it like normal fetch - payments happen automatically
const response = await fetchWithPay('https://api.example.com/premium-data');
const data = await response.json();
```

**Advanced approach (viem wallet client):**

> **Requires viem:** Run `npm install viem` first.

```javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');
const { createWalletClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// Create viem wallet client (supports hardware wallets, WalletConnect, etc.)
const walletClient = createWalletClient({
  account: privateKeyToAccount(process.env.PRIVATE_KEY),
  chain: base,
  transport: http()
});

// Pass the wallet client directly
const signer = await createSigner(walletClient);

// Same usage from here
const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });
const response = await fetchWithPay('https://api.example.com/premium-data');
```

### Charging for APIs (Payee)

```javascript
const express = require('express');
const { x402Express } = require('@primersystems/x402');

const app = express();

// USDC on Base
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Add payment requirement to routes
app.use(x402Express('0xYourWalletAddress', {
  '/api/premium': {
    amount: '0.01',      // 0.01 USDC (human-readable)
    asset: USDC,         // Token address
    network: 'base'      // Network
  }
}));

app.get('/api/premium', (req, res) => {
  res.json({ data: 'premium content' });
});

app.listen(3000);
```

---

## API Reference

### createSigner(network, privateKey) OR createSigner(walletClient)

Create a signer for x402 payments. Supports two approaches:

**Simple approach (private key):**

```javascript
const signer = await createSigner('base', '0xabc123...');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `network` | string |`'base'`, `'base-sepolia'`  |
| `privateKey` | string | Wallet private key (hex string) |

**Advanced approach (viem wallet client):**

> **Requires viem:** Run `npm install viem` first.

```javascript
const { createWalletClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// With private key
const walletClient = createWalletClient({
  account: privateKeyToAccount('0xabc123...'),
  chain: base,
  transport: http()
});

// With hardware wallet (Ledger)
const walletClient = createWalletClient({
  account: await ledger.getAccount(),
  chain: base,
  transport: http()
});

// With WalletConnect
const walletClient = createWalletClient({
  account: walletConnectAccount,
  chain: base,
  transport: http()
});

const signer = await createSigner(walletClient);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `walletClient` | WalletClient | viem WalletClient with account and chain configured |

The viem approach supports:
- Hardware wallets (Ledger, Trezor)
- WalletConnect
- Smart contract wallets
- MPC wallets
- Browser extension wallets

---

### x402Fetch(fetch, signer, options)

Wrap fetch to automatically handle 402 Payment Required responses.

```javascript
const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });
const response = await fetchWithPay('https://api.example.com/data');
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `maxAmount` | string | **Yes** | Maximum payment per request (e.g., `'0.50'`) |
| `facilitator` | string | No | Custom facilitator URL (default: Primer) |

---

### x402Axios(axiosInstance, signer, options)

Wrap axios to automatically handle 402 Payment Required responses.

```javascript
const axios = require('axios');
const axiosWithPay = x402Axios(axios.create(), signer, { maxAmount: '0.50' });
const response = await axiosWithPay.get('https://api.example.com/data');
```

Same options as `x402Fetch`.

---

### x402Express(payTo, routes, options)

Express middleware to require payment for routes.

```javascript
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

app.use(x402Express('0xYourAddress', {
  '/api/premium': { amount: '0.01', asset: USDC, network: 'base' },
  '/api/expensive': { amount: '1.00', asset: USDC, network: 'base' }
}));
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `payTo` | string | Address to receive payments |
| `routes` | object | Route → config mapping |
| `options.facilitator` | string | Custom facilitator URL |

**Route config:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | Yes | Amount in tokens (e.g., `'0.01'`) - human-readable |
| `asset` | string | Yes | Token contract address |
| `network` | string | Yes | Blockchain network |
| `description` | string | No | Human-readable description |

The SDK automatically fetches the token's decimals from the blockchain to convert your human-readable amount to atomic units.

---

### x402Hono(payTo, routes, options)

Hono middleware to require payment for routes.

```javascript
const { Hono } = require('hono');
const { x402Hono } = require('@primersystems/x402');

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const app = new Hono();

app.use('*', x402Hono('0xYourAddress', {
  '/api/premium': { amount: '0.01', asset: USDC, network: 'base' }
}));
```

Same parameters as `x402Express`.

---

### x402Next(handler, config, options)

Wrap Next.js API route handlers with payment requirement.

```javascript
// pages/api/premium.js
const { x402Next } = require('@primersystems/x402');

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export default x402Next(
  async (req, res) => {
    res.json({ data: 'premium content' });
  },
  {
    payTo: '0xYourAddress',
    amount: '0.01',
    asset: USDC,
    network: 'base'
  }
);
```

---

## Supported Networks

| Network | Chain ID | Description |
|---------|----------|-------------|
| `base` | 8453 | Base Mainnet |
| `base-sepolia` | 84532 | Base Testnet |


---

## How It Works

### Payer Flow

1. Your code calls `fetchWithPay('https://api.example.com/data')`
2. API returns `402 Payment Required` with payment requirements
3. SDK reads requirements, signs payment with your wallet
4. SDK retries request with `X-PAYMENT` header
5. API verifies payment, returns data

### Payee Flow

1. Request arrives at your Express/Hono/Next server
2. Middleware checks if route requires payment
3. No `X-PAYMENT` header? Return 402 with requirements
4. Has payment? Verify and settle via facilitator
5. Payment confirmed? Continue to your route handler

---

## CLI Tools

For manual testing and learning, standalone CLI tools are available in the [x402 repository](https://github.com/PrimerSystems/x402):

```bash
git clone https://github.com/PrimerSystems/x402.git
cd x402/tools

# Create payment authorization (interactive)
node signer.js

# Approve Stargate for ERC-20 tokens
node approve.js
```

See `/tools/README.md` in the repository for details.

---

## Debugging

The SDK includes debug logging powered by the `debug` package. Enable it by setting the `DEBUG` environment variable:

```bash
# Enable all x402 debug output
DEBUG=x402:* node app.js

# Enable only payer debug (client-side)
DEBUG=x402:payer node app.js

# Enable only payee debug (server-side)
DEBUG=x402:payee node app.js

# Enable multiple namespaces
DEBUG=x402:payer,x402:signer node app.js

# Save debug output to a file
DEBUG=x402:* node app.js 2> debug.log
```

**Example output:**
```
x402:payer Request to https://api.example.com/premium +0ms
x402:payer Got 402 Payment Required +125ms
x402:payer Payment requirements: { scheme: 'exact', network: 'base', ... } +2ms
x402:payer Creating payment... +0ms
x402:payer Payment created, signature: 0x1a2b3c... +340ms
x402:payer Verifying payment with facilitator: https://x402.primersystems.ai +0ms
x402:payer Payment verified successfully +89ms
x402:payer Retrying request with X-PAYMENT header +0ms
x402:payer Final response: 200 +201ms
```

**Available namespaces:**
- `x402:payer` - Client-side payment flow (fetch/axios wrappers)
- `x402:payee` - Server-side middleware (Express/Hono/Next.js)
- `x402:signer` - Wallet signer initialization

---

## Support

- Website: https://primersystems.ai
- x402 Protocol: https://x402.org
- Issues: https://github.com/PrimerSystems/x402/issues
- Email: support@primersystems.ai

---

## License

MIT License
