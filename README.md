# Primer x402

[![Tests](https://github.com/primer-systems/x402/actions/workflows/test.yml/badge.svg)](https://github.com/primer-systems/x402/actions/workflows/test.yml)

Implementation of the [x402 payment protocol](https://x402.org) for HTTP 402 payments. **OpenClaw compatible** 🦞

## Components

- **sdk-typescript/** - TypeScript SDK for payers and payees ([npm](https://www.npmjs.com/package/@primersystems/x402))
- **sdk-python/** - Python SDK for payers and payees ([pypi](https://pypi.org/project/primer-x402/))
- **openclaw/** - OpenClaw skill for AI agent payments
- **tools/** - CLI tools for testing and token approval
- **Contracts/** - *Prism* smart contract for ERC-20 settlements 

## Quick Start (CLI)

```bash
# Node.js
npx @primersystems/x402 wallet create
npx @primersystems/x402 probe https://api.example.com/paid
npx @primersystems/x402 pay https://api.example.com/paid --dry-run

# Python
pip install primer-x402
x402 wallet create
x402 probe https://api.example.com/paid
x402 pay https://api.example.com/paid --dry-run
```

## Quick Start (Code)

### As a Payer (Client)

```javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');

// Use CAIP-2 network format (eip155:chainId)
const signer = await createSigner('eip155:8453', process.env.PRIVATE_KEY);
const fetch402 = x402Fetch(fetch, signer, { maxAmount: '1.00' });

const response = await fetch402('https://example.com/api/paywall');
```

### As a Payee (Server)

```javascript
const { x402Express } = require('@primersystems/x402');

app.use(x402Express('0xYourAddress', {
  '/api/paywall': {
    amount: '0.01',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    network: 'eip155:8453'  // CAIP-2 format
  }
}));
```

## Supported Networks

Networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) identifiers.

| Network (CAIP-2) | Chain ID | Name | Default Facilitator |
|------------------|----------|------|---------------------|
| eip155:8453 | 8453 | Base | ✓ Primer |
| eip155:84532 | 84532 | Base Sepolia | ✓ Primer |
| eip155:1 | 1 | Ethereum | Custom required |
| eip155:42161 | 42161 | Arbitrum | Custom required |
| eip155:10 | 10 | Optimism | Custom required |
| eip155:137 | 137 | Polygon | Custom required |

## Token Types

- **EIP-3009 tokens** (USDC, EURC): Direct gasless transfers via `transferWithAuthorization`
- **Standard ERC-20**: Requires approval to *Prism* contract, then gasless via signature

## Protocol

Uses **x402 v2** with the `exact` scheme. Payments are authorized via EIP-712 signatures and settled by a facilitator service.

Key v2 features:
- `x402Version: 2` in all payloads
- CAIP-2 network identifiers (e.g., `eip155:8453` instead of `base`)
- Multi-chain support

**Facilitator:** `https://x402.primer.systems` (Base networks only)

## OpenClaw Integration

Set up x402 payments for your AI agent with one command:

```bash
# Node.js
npx @primersystems/x402 openclaw init

# Python
x402 openclaw init
```

This creates a wallet, configures the network, and installs the x402 skill. See [openclaw/SKILL.md](openclaw/SKILL.md) for the full skill documentation.

## Links

- [x402 Protocol Specification](https://x402.org)
- [Documentation](https://primer.systems/x402)
- [TypeScript SDK](https://www.npmjs.com/package/@primersystems/x402)
- [Python SDK](https://pypi.org/project/primer-x402/)
- [Primer Pay Browser Extension](https://chromewebstore.google.com/detail/primer-pay/bckienhfmjoolgkafljofomegfafanmh)

## License

MIT - [Primer Systems](https://primer.systems)

