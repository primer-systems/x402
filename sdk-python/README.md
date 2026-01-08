# x402-python

[![PyPI version](https://img.shields.io/pypi/v/x402-python.svg)](https://pypi.org/project/x402-python/)
[![Python](https://img.shields.io/pypi/pyversions/x402-python.svg)](https://pypi.org/project/x402-python/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Python SDK for x402 HTTP payments.

## Features

- **Multi-chain** - Base, Ethereum, Arbitrum, Optimism, Polygon
- **Gasless payments** - EIP-712 signatures, payers never pay gas
- **Any ERC-20 token** - USDC, EURC, or any token via Prism contract
- **Framework support** - Flask, FastAPI middleware
- **Built-in limits** - Automatic spend caps per request
- **Testing utilities** - Mock facilitator for integration tests

## Installation

```bash
pip install x402-python
```

With optional dependencies:

```bash
pip install x402-python[flask]     # Flask middleware
pip install x402-python[fastapi]   # FastAPI middleware
pip install x402-python[httpx]     # Async HTTP client
pip install x402-python[all]       # All optional dependencies
```

## Payer (Client)

Wrap requests to automatically handle 402 responses:

```python
import os
from x402_python import create_signer, x402_requests

# Create a signer (use CAIP-2 network format)
signer = create_signer('eip155:8453', os.environ['PRIVATE_KEY'])

# Create a session that handles 402 payments
with x402_requests(signer, max_amount='1.00') as session:
    response = session.get('https://example.com/api/paywall')
    print(response.json())
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `max_amount` | Yes | Maximum payment per request (e.g., '1.00') |
| `facilitator` | No | Custom facilitator URL |
| `verify` | No | Verify payment before sending (default: True) |

## Payee (Server)

Middleware for Flask and FastAPI:

### Flask

```python
from flask import Flask, jsonify
from x402_python import x402_flask

app = Flask(__name__)

# Protect routes with payment requirements
@app.before_request
@x402_flask('0xYourAddress', {
    '/api/premium': {
        'amount': '0.01',
        'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'network': 'eip155:8453'  # CAIP-2 format
    }
})
def check_payment():
    pass

@app.route('/api/premium')
def premium():
    return jsonify({'data': 'premium content'})
```

### FastAPI

```python
from fastapi import FastAPI
from x402_python import x402_fastapi

app = FastAPI()

app.add_middleware(x402_fastapi(
    '0xYourAddress',
    {
        '/api/premium': {
            'amount': '0.01',
            'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            'network': 'eip155:8453'  # CAIP-2 format
        }
    }
))

@app.get('/api/premium')
async def premium():
    return {'data': 'premium content'}
```

## Token Approval

For standard ERC-20 tokens (not USDC/EURC), approve the *Prism* contract first:

```python
from x402_python import create_signer, approve_token

signer = create_signer('eip155:8453', os.environ['PRIVATE_KEY'])
receipt = approve_token(signer, '0xTokenAddress')
```

## Networks

Networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) identifiers (e.g., `eip155:8453` for Base).

| Network (CAIP-2) | Chain ID | Legacy Name | Default Facilitator |
|------------------|----------|-------------|---------------------|
| eip155:8453 | 8453 | base | Primer |
| eip155:84532 | 84532 | base-sepolia | Primer |
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

```python
# Payee
@x402_flask('0xYourAddress', routes, facilitator='https://your-facilitator.com')

# Payer
session = x402_requests(signer, max_amount='1.00', facilitator='https://your-facilitator.com')
```

## Testing Your Integration

The SDK provides testing utilities to help you test your x402 integration without making real payments:

```python
from x402_python.testing import (
    create_mock_facilitator,
    create_test_payment,
    create_test_402_response,
    TEST_ADDRESSES,
    USDC_ADDRESSES
)
```

### Testing a Payee (Server)

```python
import pytest
from your_app import app
from x402_python.testing import create_mock_facilitator, create_test_payment

@pytest.fixture
def mock_facilitator():
    mock = create_mock_facilitator(port=3001)
    yield mock
    mock.close()

def test_returns_402_when_no_payment(client):
    response = client.get('/api/premium')
    assert response.status_code == 402

def test_returns_200_with_valid_payment(client, mock_facilitator):
    payment = create_test_payment(amount='10000')  # 0.01 USDC

    response = client.get(
        '/api/premium',
        headers={'X-PAYMENT': payment}
    )

    assert response.status_code == 200
```

### Mock Facilitator Options

```python
# Auto-approve all payments (default)
mock = create_mock_facilitator(mode='approve')

# Reject all payments
mock = create_mock_facilitator(mode='reject')

# Custom logic
def my_handler(payload):
    amount = payload.get('paymentRequirements', {}).get('maxAmountRequired')
    if int(amount) > 1000000:
        return {'success': False, 'error': 'Amount too high'}
    return {'success': True, 'transaction': '0x' + 'f' * 64}

mock = create_mock_facilitator(mode='custom', handler=my_handler)

# Add artificial latency
mock = create_mock_facilitator(latency_ms=5000)
```

## Debug Logging

```python
import logging
logging.getLogger('x402').setLevel(logging.DEBUG)
```

## Changelog

### v0.4.0
- **x402 v2 protocol**: Full upgrade to x402 v2 specification with `x402Version: 2`
- **CAIP-2 network identifiers**: All networks now use CAIP-2 format (e.g., `'eip155:8453'` instead of `'base'`)
- **Multi-chain support**: Base, Ethereum, Arbitrum, Optimism, and Polygon (mainnets + testnets)
- **Network utilities**: New functions `to_caip_network()`, `from_caip_network()`, `chain_id_to_caip()`, `caip_to_chain_id()`
- **Facilitator validation**: SDK requires custom facilitator for non-Base networks
- **Legacy compatibility**: Legacy network names still accepted as input but CAIP-2 is used internally
- **Payer**: `create_signer`, `x402_requests`, `x402_httpx`
- **Payee**: `x402_flask`, `x402_fastapi`, `x402_protect` middleware
- **Testing utilities**: `create_mock_facilitator`, `create_test_payment`, fixtures (updated to v2 format)

## License

MIT
