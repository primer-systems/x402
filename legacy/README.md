# Megalith x402

**x402-compliant payment system** for EVM-compatible blockchains supporting both EIP-3009 and standard ERC-20 tokens.

**Part of the x402 protocol**: An open standard for internet-native payments using HTTP 402 status codes.

Learn more: [x402.org](https://x402.org) | [Megalith Labs](https://megalithlabs.ai)

---

## What is x402?

x402 is an open payment protocol that enables AI agents and web services to autonomously pay for API access, data, and digital services using stablecoins like USDC. It leverages the HTTP 402 "Payment Required" status code to enable:

- **AI-native payments** - Agents pay for APIs autonomously
- **Micropayments** - Transactions as low as $0.001
- **Instant settlement** - ~200ms on Layer 2
- **No accounts required** - Pay-per-use without registration
- **Chain agnostic** - Works on any EVM blockchain

---

## Quick Start

### Install the SDK

```bash
npm install @megalithlabs/x402
```

### Pay for APIs (Payer)

```javascript
const { createSigner, x402Fetch } = require('@megalithlabs/x402');

// Create signer with your wallet
const signer = await createSigner('bsc', process.env.PRIVATE_KEY);

// Wrap fetch to auto-handle 402 responses
const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });

// Use it like normal fetch - payments happen automatically
const response = await fetchWithPay('https://api.example.com/premium-data');
```

### Charge for APIs (Payee)

```javascript
const express = require('express');
const { x402Express } = require('@megalithlabs/x402');

const app = express();
const USDT = '0x55d398326f99059fF775485246999027B3197955'; // USDT on BSC

// Add payment requirement to routes
app.use(x402Express('0xYourWalletAddress', {
  '/api/premium': {
    amount: '0.01',      // 0.01 USDT
    asset: USDT,
    network: 'bsc'
  }
}));

app.get('/api/premium', (req, res) => {
  res.json({ data: 'premium content' });
});
```

**Full SDK documentation:** [sdk/README.md](sdk/README.md)

---

## Repository Contents

| Folder | Description |
|--------|-------------|
| **[sdk/](sdk/)** | JavaScript SDK for payers and payees - `npm install @megalithlabs/x402` |
| **[tools/](tools/)** | CLI tools for manual testing and token approval |
| **[Contracts/](Contracts/)** | MegalithStargate smart contract source |
| **[Docs/](Docs/)** | Facilitator API guide and protocol documentation |

---

## Supported Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| **BNB Chain Mainnet** | 56 | Production |
| **BNB Chain Testnet** | 97 | Testnet |
| **Base Mainnet** | 8453 | Production |
| **Base Sepolia** | 84532 | Testnet |

---

## Token Support

### EIP-3009 Tokens (Native Support)
- **USDC** - Direct authorization, no approval needed
- **EURC** - Direct authorization, no approval needed

### Standard ERC-20 Tokens (via Stargate)
- **USDT, DAI, BUSD, any ERC-20** - Requires one-time approval

The SDK automatically detects which type of token you're using.

---

## x402 Facilitator API

**Production:** https://x402.megalithlabs.ai

| Endpoint | Description |
|----------|-------------|
| `POST /verify` | Validate payment signature |
| `POST /settle` | Execute payment on-chain |
| `GET /supported` | List supported networks |
| `GET /contracts` | Get Stargate contract addresses |
| `GET /health` | Service health check |

**Full API documentation:** [Docs/facilitator_guide.md](Docs/facilitator_guide.md)

---

## MegalithStargate Contract

Enables x402 payments with standard ERC-20 tokens that lack native EIP-3009 support.

**Deployed at:** `0x40200001004b5110333e4de8179426971efd034a` (same address on all networks)

**Source:** [Contracts/Stargate.sol](Contracts/Stargate.sol)

---

## Support

- Website: https://megalithlabs.ai
- x402 Protocol: https://x402.org
- Email: support@megalithlabs.ai
- Issues: https://github.com/megalithlabs/x402/issues

---

## License

MIT License - see [LICENSE](LICENSE)
