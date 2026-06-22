# primer-x402

[![PyPI version](https://img.shields.io/pypi/v/primer-x402.svg)](https://pypi.org/project/primer-x402/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Primer ecosystem toolkit for x402.** Built on the [official x402 SDK](https://pypi.org/project/x402/).

This package extends the official x402 SDK with Primer-specific infrastructure: our facilitator, SKALE network support, and Prism ERC-20 settlement.

## Installation

```bash
pip install primer-x402
```

This automatically installs `x402` as a dependency.

## Quick Start

### Using Primer's Facilitator

```python
from primer_x402 import primer_facilitator, primer_facilitator_sync

# Async client
facilitator = primer_facilitator()
result = await facilitator.verify(payload, requirements)

# Sync client
facilitator_sync = primer_facilitator_sync()
result = facilitator_sync.verify(payload, requirements)
```

### SKALE Networks (Gas-Free)

```python
from primer_x402 import skale_networks

# Use SKALE for gas-free transactions
network = skale_networks.base           # "eip155:1187947933"
network = skale_networks.base_sepolia   # "eip155:324705682"
```

### Prism ERC-20 Settlement

For standard ERC-20 tokens (not USDC/EURC), use Prism:

```python
from eth_account import Account
from web3 import Web3
from primer_x402 import create_prism_payload, PrismPaymentParams

web3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
account = Account.from_key("0x...")

payload = create_prism_payload(
    account,
    web3,
    PrismPaymentParams(
        token="0x...",  # ERC-20 token address
        to="0x...",     # Recipient
        value=1000000,  # Amount in smallest unit
    ),
    "eip155:8453",
)
```

> Note: Payers must first approve the Prism contract (`0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86`) to spend their tokens.

## CLI

The package includes a CLI for scaffolding new x402 projects.

### Create a Paid AI Proxy (Chutes)

Scaffold a FastAPI server that proxies [Chutes](https://chutes.ai) (Bittensor Subnet 64) AI endpoints with x402 micropayments:

```bash
primer-x402 create chutes-proxy my-ai-api
cd my-ai-api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Edit `main.py` to set your wallet address:

```python
RECIPIENT = "0xYourWalletAddress"
```

Set your Chutes API key and run:

```bash
cp .env.example .env
# Edit .env with your CHUTES_API_KEY
export $(cat .env | xargs)
uvicorn main:app --reload
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
| `primer_facilitator()` | Async client for x402.primer.systems |
| `primer_facilitator_sync()` | Sync client for x402.primer.systems |
| `PRIMER_FACILITATOR_URL` | `"https://x402.primer.systems"` |

### Networks

| Export | Value |
|--------|-------|
| `skale_networks.base` | `"eip155:1187947933"` |
| `skale_networks.base_sepolia` | `"eip155:324705682"` |
| `skale_rpc_urls.base` | `"https://skale-base.skalenodes.com/v1/base"` |
| `skale_rpc_urls.base_sepolia` | `"https://base-sepolia-testnet.skalenodes.com/v1/..."` |

### Prism Settlement

| Export | Description |
|--------|-------------|
| `create_prism_payload(account, web3, params, network)` | Create signed ERC-20 payment |
| `get_prism_nonce(web3, user, token)` | Get current nonce for user/token |
| `PrismPaymentParams` | Dataclass for payment parameters |
| `PrismPayload` | TypedDict for the resulting payload |
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

## Links

- [x402 Protocol](https://x402.org)
- [Official x402 SDK](https://pypi.org/project/x402/)
- [Primer Systems](https://primer.systems)
- [TypeScript SDK](https://www.npmjs.com/package/@primersystems/x402)

## License

Apache-2.0 — [Primer Systems](https://primer.systems)
