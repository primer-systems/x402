# Primer x402 - Testing Fixtures
# Pre-built test data for x402 integrations
# x402 v2 - CAIP-2 network format
# https://primer.systems

import time
from typing import Dict, Any

from ..utils import X402_VERSION

# Well-known test addresses (Hardhat default accounts)
TEST_ADDRESSES = {
    "payer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "payee": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "facilitator": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
}

# USDC contract addresses by network (CAIP-2 format)
USDC_ADDRESSES = {
    # Base
    "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    # Ethereum
    "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "eip155:11155111": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    # Arbitrum
    "eip155:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "eip155:421614": "0xf3c3351D6Bd0098EEb33ca8f830faf2a141ea2E1",
    # Optimism
    "eip155:10": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "eip155:11155420": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    # Polygon
    "eip155:137": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "eip155:80002": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    # Legacy aliases for backward compatibility
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}


def sample_route_config() -> Dict[str, Dict[str, Any]]:
    """Sample route configuration for middleware (using CAIP-2 network)."""
    return {
        "/api/premium": {
            "amount": "0.01",
            "asset": USDC_ADDRESSES["eip155:8453"],
            "network": "eip155:8453"  # CAIP-2 format
        },
        "/api/basic": {
            "amount": "0.001",
            "asset": USDC_ADDRESSES["eip155:8453"],
            "network": "eip155:8453"  # CAIP-2 format
        }
    }


def sample_402_response_body() -> Dict[str, Any]:
    """Sample 402 response body (x402 v2 format)."""
    return {
        "x402Version": X402_VERSION,
        "accepts": [{
            "scheme": "exact",
            "network": "eip155:8453",  # CAIP-2 format
            "maxAmountRequired": "10000",  # 0.01 USDC (6 decimals)
            "resource": "/api/premium",
            "payTo": TEST_ADDRESSES["payee"],
            "asset": USDC_ADDRESSES["eip155:8453"],
            "extra": {
                "name": "USD Coin",
                "version": "2"
            }
        }]
    }


def sample_payment_payload() -> Dict[str, Any]:
    """Sample payment payload structure (x402 v2 format, before base64 encoding)."""
    now = int(time.time())
    return {
        "x402Version": X402_VERSION,
        "scheme": "exact",
        "network": "eip155:8453",  # CAIP-2 format
        "payload": {
            "signature": "0x" + "1234" * 32,  # Placeholder signature
            "authorization": {
                "from": TEST_ADDRESSES["payer"],
                "to": TEST_ADDRESSES["payee"],
                "value": "10000",
                "validAfter": "0",
                "validBefore": str(now + 3600),
                "nonce": "0x" + "00" * 32
            }
        }
    }
