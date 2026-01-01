# Primer x402

[![Tests](https://github.com/Primer-Systems/x402-private/actions/workflows/test.yml/badge.svg)](https://github.com/Primer-Systems/x402-private/actions/workflows/test.yml)

Implementation of the [x402 payment protocol](https://x402.org) for HTTP 402 payments on Base.

## Components

- **sdk/** - JavaScript SDK for payers and payees
- **tools/** - CLI tools for testing and token approval
- **Contracts/** - *Prism* smart contract for ERC-20 settlements

## Quick Start

### As a Payer (Client)

```javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');

const signer = await createSigner('base', process.env.PRIVATE_KEY);
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
    network: 'base'
  }
}));
```

## Supported Networks

| Network | Chain ID |
|---------|----------|
| Base | 8453 |
| Base Sepolia | 84532 |

## Token Types

- **EIP-3009 tokens** (USDC, EURC): Direct gasless transfers via `transferWithAuthorization`
- **Standard ERC-20**: Requires approval to *Prism* contract, then gasless via signature

## Protocol

Uses x402 v1 with the `exact` scheme. Payments are authorized via EIP-712 signatures and settled by a facilitator service.

**Facilitator:** `https://x402.primer.systems`

## License

MIT - Primer Systems
