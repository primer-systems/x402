# primer-x402

[![PyPI version](https://img.shields.io/pypi/v/primer-x402.svg)](https://pypi.org/project/primer-x402/)
[![Python](https://img.shields.io/pypi/pyversions/primer-x402.svg)](https://pypi.org/project/primer-x402/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Python SDK for x402 HTTP payments by [Primer](https://primer.systems).** OpenClaw compatible 🦞

Easily add pay-per-request monetization to your Python APIs using the [x402 protocol](https://x402.org). Accept stablecoin payments (USDC, EURC) or any ERC-20 token with gasless transactions—payers never pay gas fees.

## Quick Start (CLI)

```bash
# Create a new wallet
x402 wallet create

# Check balance
x402 wallet balance 0xYourAddress

# Probe a URL for x402 support
x402 probe https://api.example.com/paid

# Set up for OpenClaw
x402 openclaw init
```

## Why x402?

- **HTTP-native payments** - Uses the standard HTTP 402 Payment Required status code
- **Gasless for payers** - Payments are authorized via EIP-712 signatures; facilitators handle gas
- **Stablecoin support** - Native support for USDC/EURC via EIP-3009 `transferWithAuthorization`
- **Any ERC-20 token** - Support for other tokens via Primer's *Prism* settlement contract
- **Multi-chain** - Base, Ethereum, Arbitrum, Optimism, Polygon (mainnet + testnet)
- **Framework integrations** - Flask, FastAPI middleware included
- **Testing utilities** - Mock facilitator for integration testing

## Installation

```bash
pip install primer-x402
```

With optional dependencies:

```bash
pip install primer-x402[flask]     # Flask middleware
pip install primer-x402[fastapi]   # FastAPI middleware
pip install primer-x402[httpx]     # Async HTTP client
pip install primer-x402[all]       # All optional dependencies
```

## Quick Start

### Payer (Client)

Wrap your HTTP client to automatically handle 402 responses:

```python
import os
from primer_x402 import create_signer, x402_requests

# Create a signer with your wallet
signer = create_signer('eip155:8453', os.environ['PRIVATE_KEY'])

# Create a session that handles 402 payments automatically
with x402_requests(signer, max_amount='1.00') as session:
    response = session.get('https://api.example.com/paid-endpoint')
    print(response.json())
```

When the server returns `402 Payment Required`, the SDK automatically:
1. Parses the payment requirements from the response
2. Creates a signed payment authorization (no gas required)
3. Retries the request with the payment header
4. Returns the successful response

### Payee (Server)

Add payment requirements to your API routes:

```python
from flask import Flask, jsonify
from primer_x402 import x402_flask

app = Flask(__name__)

@app.before_request
@x402_flask('0xYourWalletAddress', {
    '/api/premium': {
        'amount': '0.01',                                    # $0.01 USDC
        'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  # USDC on Base
        'network': 'eip155:8453'                             # Base mainnet
    }
})
def require_payment():
    pass

@app.route('/api/premium')
def premium_content():
    return jsonify({'data': 'premium content'})
```

## Token Types

### EIP-3009 Tokens (USDC, EURC)

These tokens support gasless transfers natively via `transferWithAuthorization`. The payer signs an authorization, and the facilitator executes the transfer—payer pays zero gas.

### Standard ERC-20 Tokens

For other ERC-20 tokens, Primer's *Prism* contract enables gasless payments:

1. **One-time approval** - Approve the Prism contract to spend your tokens
2. **Gasless payments** - Sign authorizations; Prism handles the transfers

```python
from primer_x402 import create_signer, approve_token

signer = create_signer('eip155:8453', os.environ['PRIVATE_KEY'])

# One-time approval (this transaction requires gas)
receipt = approve_token(signer, '0xTokenAddress')

# Now you can make gasless payments with this token
```

## Supported Networks

Networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) identifiers.

| Network | CAIP-2 ID | Default Facilitator |
|---------|-----------|---------------------|
| Base | `eip155:8453` | Primer |
| Base Sepolia | `eip155:84532` | Primer |
| Ethereum | `eip155:1` | Custom required |
| Arbitrum | `eip155:42161` | Custom required |
| Optimism | `eip155:10` | Custom required |
| Polygon | `eip155:137` | Custom required |

> Legacy network names (`'base'`, `'ethereum'`) are accepted for compatibility but CAIP-2 is recommended.

### Custom Facilitator

For non-Base networks, provide your own facilitator:

```python
# Payer
session = x402_requests(signer, max_amount='1.00', facilitator='https://your-facilitator.com')

# Payee
@x402_flask('0xAddress', routes, facilitator='https://your-facilitator.com')
```

## FastAPI Example

```python
from fastapi import FastAPI
from primer_x402 import x402_fastapi

app = FastAPI()

app.add_middleware(x402_fastapi(
    '0xYourWalletAddress',
    {
        '/api/premium': {
            'amount': '0.01',
            'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            'network': 'eip155:8453'
        }
    }
))

@app.get('/api/premium')
async def premium():
    return {'data': 'premium content'}
```

## Testing

The SDK includes utilities for testing your integration without real payments:

```python
import pytest
from primer_x402.testing import create_mock_facilitator, create_test_payment

@pytest.fixture
def mock_facilitator():
    mock = create_mock_facilitator(mode='approve')
    yield mock
    mock.close()

def test_paid_endpoint(client, mock_facilitator):
    payment = create_test_payment(amount='10000')  # 0.01 USDC

    response = client.get(
        '/api/premium',
        headers={'X-PAYMENT': payment}
    )

    assert response.status_code == 200
```

## Debug Logging

```python
import logging
logging.getLogger('x402').setLevel(logging.DEBUG)
```

## CLI Reference

```bash
x402 <command> [options]
```

| Command | Description |
|---------|-------------|
| `wallet create` | Create a new wallet |
| `wallet balance <address>` | Check USDC/ETH balance |
| `wallet from-mnemonic` | Restore wallet from mnemonic |
| `probe <url>` | Check if URL supports x402 |
| `pay <url>` | Make a payment to a 402 endpoint |
| `pay <url> --dry-run` | Preview payment without paying |
| `networks` | List supported networks |
| `facilitator` | Show facilitator info |
| `openclaw init` | Set up x402 for OpenClaw |
| `openclaw status` | Check OpenClaw status |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `X402_PRIVATE_KEY` | Wallet private key |
| `X402_NETWORK` | Default network (default: base) |
| `X402_MAX_AMOUNT` | Default max payment amount |
| `X402_FACILITATOR` | Facilitator URL override |

### Examples

```bash
# Create wallet and save output
x402 wallet create --json > wallet.json

# Check balance on Arbitrum
x402 wallet balance 0x... --network arbitrum

# Preview payment (dry run)
x402 pay https://api.example.com/data --dry-run

# Pay for an API
X402_PRIVATE_KEY=0x... x402 pay https://api.example.com/data --max-amount 0.10
```

## Wallet Utilities

```python
from primer_x402 import create_wallet, get_balance, x402_probe

# Create wallet
wallet = create_wallet()
print(wallet.address, wallet.private_key, wallet.mnemonic)

# Check balance
balance = get_balance('0x...', 'base', 'USDC')
print(f"{balance.balance} {balance.token}")

# Probe URL
probe = x402_probe('https://api.example.com/paid')
if probe.supports_402:
    print(probe.requirements)
```

## Error Handling

```python
from primer_x402 import X402Error, ErrorCodes

try:
    response = session.get(url)
except X402Error as e:
    if e.code == ErrorCodes.INSUFFICIENT_FUNDS:
        print(f"Need more funds: {e.details}")
```

## OpenClaw Integration

```bash
pip install primer-x402
x402 openclaw init
```

Or install skill from ClawHub: `clawhub install primer/x402`

## Changelog

### v0.5.0
- **CLI**: New command-line interface (`x402 ...`)
- **Wallet utilities**: `create_wallet()`, `get_balance()`, `x402_probe()`
- **Structured errors**: `X402Error` class with error codes
- **OpenClaw integration**: `openclaw init` and `openclaw status` commands

### v0.4.3
- Cleaned up legacy v1 protocol remnants for pure v2 compliance

### v0.4.2
- **Bug fix**: 402 Payment Required responses now include JSON body (`{}`) instead of empty body
- Fixes Chrome content script injection blocking issue
- Aligns with Coinbase x402 specification

### v0.4.1
- Updated package name to `primer-x402`
- Renamed module to `primer_x402`

### v0.4.0
- **x402 v2 protocol**: Full upgrade to x402 v2 specification
- **CAIP-2 network identifiers**: All networks now use CAIP-2 format (e.g., `'eip155:8453'`)
- **Multi-chain support**: Base, Ethereum, Arbitrum, Optimism, and Polygon
- **Testing utilities**: Mock facilitator and test helpers

## Links

- [x402 Protocol Specification](https://x402.org)
- [Primer Systems](https://primer.systems)
- [GitHub Repository](https://github.com/Primer-Systems/x402)
- [TypeScript SDK](https://www.npmjs.com/package/@primersystems/x402)

## License

MIT - [Primer Systems](https://primer.systems)
