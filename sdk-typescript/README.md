# @primersystems/x402

[![npm version](https://img.shields.io/npm/v/@primersystems/x402.svg)](https://www.npmjs.com/package/@primersystems/x402)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Primer ecosystem toolkit for x402.** Built on the [official x402 SDK](https://github.com/coinbase/x402).

This package extends the official x402 SDK with Primer-specific infrastructure: our facilitator, SKALE network support, and Prism ERC-20 settlement.

## Installation

```bash
npm install @primersystems/x402
```

This automatically installs `@x402/core` as a peer dependency.

## Quick Start

### Using Primer's Facilitator

```typescript
import { paymentMiddleware } from '@x402/express';
import { primerFacilitator } from '@primersystems/x402';

// Use Primer's facilitator (x402.primer.systems)
app.use(paymentMiddleware(routes, server, {
  facilitator: primerFacilitator()
}));
```

### SKALE Networks (Gas-Free)

```typescript
import { skaleNetworks } from '@primersystems/x402';

const routes = {
  '/api/data': {
    price: '$0.001',
    network: skaleNetworks.base,  // eip155:1187947933
    // No gas fees for payers on SKALE
  }
};
```

### Prism ERC-20 Settlement

For standard ERC-20 tokens (not USDC/EURC), use Prism:

```typescript
import { createPrismPayload, PRISM_CONTRACT_ADDRESS } from '@primersystems/x402';
import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ chain: base, transport: http(), account });

// Create a signed payment payload
const payload = await createPrismPayload(walletClient, publicClient, {
  token: '0x...', // ERC-20 token address
  to: '0x...',    // Recipient
  value: 1000000n // Amount in smallest unit
}, 'eip155:8453');
```

> Note: Payers must first approve the Prism contract (`0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86`) to spend their tokens.

## CLI

The package includes a CLI for scaffolding new x402 projects.

### Create a Paid AI Proxy (Chutes)

Scaffold a Cloudflare Worker that proxies [Chutes](https://chutes.ai) (Bittensor Subnet 64) AI endpoints with x402 micropayments:

```bash
npx @primersystems/x402 create chutes-proxy my-ai-api
cd my-ai-api
npm install
```

Edit `src/worker.ts` to set your wallet address:

```typescript
const RECIPIENT = "0xYourWalletAddress";
```

Set your Chutes API key and deploy:

```bash
wrangler secret put CHUTES_API_KEY
npm run deploy
```

The generated proxy exposes these paid endpoints:

| Endpoint | Default Price |
|----------|---------------|
| `/v1/chat/completions` | $0.001 |
| `/v1/completions` | $0.001 |
| `/v1/embeddings` | $0.0001 |
| `/v1/images/generations` | $0.01 |

Payments are verified via Primer's facilitator and accepted on Base mainnet. Edit the generated code to customize pricing, networks, or add additional endpoints.

## API Reference

### Facilitator

| Export | Description |
|--------|-------------|
| `primerFacilitator(config?)` | Returns `FacilitatorClient` for x402.primer.systems |
| `PRIMER_FACILITATOR_URL` | `"https://x402.primer.systems"` |

### Networks

| Export | Value |
|--------|-------|
| `skaleNetworks.base` | `"eip155:1187947933"` |
| `skaleNetworks.baseSepolia` | `"eip155:324705682"` |
| `skaleRpcUrls.base` | `"https://skale-base.skalenodes.com/v1/base"` |
| `skaleRpcUrls.baseSepolia` | `"https://base-sepolia-testnet.skalenodes.com/v1/..."` |

### Prism Settlement

| Export | Description |
|--------|-------------|
| `createPrismPayload(wallet, public, params, network)` | Create signed ERC-20 payment |
| `getPrismNonce(publicClient, user, token)` | Get current nonce for user/token |
| `PRISM_CONTRACT_ADDRESS` | `"0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86"` |
| `PRISM_ABI` | Contract ABI (minimal) |
| `ERC20_PAYMENT_TYPES` | EIP-712 type definitions |

## Supported Networks

| Network | Chain ID | Facilitator |
|---------|----------|-------------|
| Base | eip155:8453 | ✓ Primer |
| Base Sepolia | eip155:84532 | ✓ Primer |
| SKALE Base | eip155:1187947933 | ✓ Primer |
| SKALE Base Sepolia | eip155:324705682 | ✓ Primer |

## Architecture

This SDK is a **companion** to the official x402 SDK, not a replacement:

```
┌─────────────────────────────────────────┐
│           Your Application              │
├─────────────────────────────────────────┤
│  @x402/express, @x402/hono, etc.        │  ← Official SDK (protocol)
├─────────────────────────────────────────┤
│  @primersystems/x402                    │  ← This package (ecosystem)
│  • Primer facilitator                   │
│  • SKALE networks                       │
│  • Prism settlement                     │
│  • CLI scaffolding (Chutes proxy, etc.) │
└─────────────────────────────────────────┘
```

## Links

- [x402 Protocol](https://x402.org)
- [Official x402 SDK](https://github.com/coinbase/x402)
- [Primer Systems](https://primer.systems)
- [Documentation](https://docs.primer.systems)

## License

Apache-2.0 — [Primer Systems](https://primer.systems)
