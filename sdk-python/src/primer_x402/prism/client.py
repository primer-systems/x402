"""Prism client for creating signed payment payloads.

Provides functions for interacting with the Prism contract and
creating EIP-712 signed payment authorizations.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, TypedDict

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from primer_x402.prism.constants import (
    PRISM_CONTRACT_ADDRESS,
    PRISM_ABI,
    ERC20_PAYMENT_TYPES,
)

if TYPE_CHECKING:
    from eth_account.signers.local import LocalAccount


@dataclass
class PrismPaymentParams:
    """Parameters for creating a Prism payment."""

    token: str
    """ERC-20 token address"""

    to: str
    """Recipient address"""

    value: int
    """Amount in token's smallest unit (e.g., wei for 18 decimals)"""

    valid_after: int | None = None
    """Unix timestamp after which the payment is valid"""

    valid_before: int | None = None
    """Unix timestamp before which the payment is valid"""


class PrismPayloadData(TypedDict):
    """Payload data structure."""

    signature: str
    authorization: dict[str, str | int]  # Contains "from", "to", "value", "nonce", "validAfter", "validBefore"


class PrismPayload(TypedDict):
    """Complete Prism payment payload for x402 facilitator."""

    x402Version: int
    scheme: str
    network: str
    payload: PrismPayloadData


def get_prism_nonce(web3: Web3, user: str, token: str) -> int:
    """Get the current nonce for a user/token pair from the Prism contract.

    Args:
        web3: Web3 instance connected to the network
        user: User address
        token: ERC-20 token address

    Returns:
        Current nonce as integer
    """
    contract = web3.eth.contract(
        address=Web3.to_checksum_address(PRISM_CONTRACT_ADDRESS),
        abi=PRISM_ABI,
    )
    return contract.functions.getNonce(
        Web3.to_checksum_address(user),
        Web3.to_checksum_address(token),
    ).call()


def create_prism_payload(
    account: LocalAccount,
    web3: Web3,
    params: PrismPaymentParams,
    network: str,
) -> PrismPayload:
    """Create a signed Prism payment payload.

    Args:
        account: eth_account LocalAccount for signing
        web3: Web3 instance connected to the network
        params: Payment parameters
        network: Network identifier (e.g., "eip155:8453")

    Returns:
        Signed payload ready for x402 facilitator

    Raises:
        ValueError: If account or parameters are invalid

    Example:
        ```python
        from eth_account import Account
        from web3 import Web3
        from primer_x402.prism import create_prism_payload, PrismPaymentParams

        web3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
        account = Account.from_key("0x...")

        payload = create_prism_payload(
            account,
            web3,
            PrismPaymentParams(
                token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                to="0x...",
                value=1000000,
            ),
            "eip155:8453",
        )
        ```
    """
    if not account:
        raise ValueError("Account is required")

    chain_id = web3.eth.chain_id
    from_address = account.address

    # Get current nonce from contract
    nonce = get_prism_nonce(web3, from_address, params.token)

    # Default validity window: now to 1 hour from now
    now = int(time.time())
    valid_after = params.valid_after if params.valid_after is not None else now - 60
    valid_before = params.valid_before if params.valid_before is not None else now + 3600

    # Build EIP-712 domain
    domain = {
        "name": "Primer",
        "version": "1",
        "chainId": chain_id,
        "verifyingContract": Web3.to_checksum_address(PRISM_CONTRACT_ADDRESS),
    }

    # Build message
    message = {
        "token": Web3.to_checksum_address(params.token),
        "from": Web3.to_checksum_address(from_address),
        "to": Web3.to_checksum_address(params.to),
        "value": params.value,
        "nonce": nonce,
        "validAfter": valid_after,
        "validBefore": valid_before,
    }

    # Encode and sign EIP-712 typed data
    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            **ERC20_PAYMENT_TYPES,
        },
        "primaryType": "ERC20Payment",
        "domain": domain,
        "message": message,
    }

    signable = encode_typed_data(full_message=typed_data)
    signed = account.sign_message(signable)
    signature = signed.signature.hex()

    # Ensure signature has 0x prefix
    if not signature.startswith("0x"):
        signature = "0x" + signature

    # Build authorization with literal "from" key (can't use Python keyword)
    authorization: dict[str, str | int] = {
        "from": from_address,
        "to": params.to,
        "value": str(params.value),
        "nonce": str(nonce),
        "validAfter": valid_after,
        "validBefore": valid_before,
    }

    return PrismPayload(
        x402Version=2,
        scheme="exact",
        network=network,
        payload=PrismPayloadData(
            signature=signature,
            authorization=authorization,
        ),
    )
