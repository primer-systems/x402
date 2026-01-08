# Primer x402 - Test Payment Generator
# Creates valid X-PAYMENT headers for testing without a real wallet
# x402 v2 - CAIP-2 network format
# https://primer.systems

import json
import time
import uuid
from typing import Dict, Any, Optional

from ..utils import base64_encode, X402_VERSION, to_caip_network
from .fixtures import TEST_ADDRESSES, USDC_ADDRESSES


def create_test_payment(
    amount: str = "10000",
    from_address: Optional[str] = None,
    to_address: Optional[str] = None,
    network: str = "eip155:8453",
    asset: Optional[str] = None,
    signature: Optional[str] = None,
    valid_for_seconds: int = 3600
) -> str:
    """
    Generate a test X-PAYMENT header.

    Args:
        amount: Amount in smallest units (e.g., '10000' = 0.01 USDC)
        from_address: Payer address (defaults to test address)
        to_address: Payee address (defaults to test address)
        network: Network in CAIP-2 format (e.g., 'eip155:8453')
        asset: Token contract address (defaults to USDC)
        signature: Custom signature (defaults to placeholder)
        valid_for_seconds: How long the payment is valid

    Returns:
        Base64-encoded X-PAYMENT header (x402 v2 format)

    Example:
        >>> # Basic usage
        >>> header = create_test_payment(amount='10000')
        >>>
        >>> # Use in a test
        >>> response = client.get('/api/premium', headers={'X-PAYMENT': header})
    """
    from_addr = from_address or TEST_ADDRESSES["payer"]
    to_addr = to_address or TEST_ADDRESSES["payee"]

    # Normalize network to CAIP-2 format
    caip_network = network if network.startswith("eip155:") else to_caip_network(network)
    token = asset or USDC_ADDRESSES.get(caip_network, USDC_ADDRESSES.get("eip155:8453"))
    sig = signature or ("0x" + "ab" * 65)  # 130 hex chars = 65 bytes

    now = int(time.time())

    # Generate a random nonce
    nonce_uuid = uuid.uuid4().hex
    nonce = "0x" + nonce_uuid.ljust(64, "0")[:64]

    payload = {
        "x402Version": X402_VERSION,
        "scheme": "exact",
        "network": caip_network,  # CAIP-2 format
        "payload": {
            "signature": sig,
            "authorization": {
                "from": from_addr,
                "to": to_addr,
                "value": amount,
                "validAfter": str(now - 60),  # Valid from 1 minute ago
                "validBefore": str(now + valid_for_seconds),
                "nonce": nonce
            }
        }
    }

    return base64_encode(json.dumps(payload))


def create_test_402_response(
    amount: str = "10000",
    pay_to: Optional[str] = None,
    network: str = "eip155:8453",
    resource: str = "/api/test",
    asset: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a test 402 response body (what a server returns).
    Useful for testing client-side payment handling.

    Args:
        amount: Required amount
        pay_to: Payee address
        network: Network in CAIP-2 format (e.g., 'eip155:8453')
        resource: Resource path
        asset: Token address

    Returns:
        402 response body dict (x402 v2 format)
    """
    payee = pay_to or TEST_ADDRESSES["payee"]

    # Normalize network to CAIP-2 format
    caip_network = network if network.startswith("eip155:") else to_caip_network(network)
    token = asset or USDC_ADDRESSES.get(caip_network, USDC_ADDRESSES.get("eip155:8453"))

    return {
        "x402Version": X402_VERSION,
        "accepts": [{
            "scheme": "exact",
            "network": caip_network,  # CAIP-2 format
            "maxAmountRequired": amount,
            "resource": resource,
            "payTo": payee,
            "asset": token,
            "extra": {
                "name": "USD Coin",
                "version": "2"
            }
        }]
    }
