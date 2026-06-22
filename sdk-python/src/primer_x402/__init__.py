"""Primer ecosystem toolkit for x402.

This package extends the official x402 SDK with Primer-specific infrastructure:
facilitator, SKALE networks, and Prism settlement.
"""

from primer_x402.facilitator import (
    PRIMER_FACILITATOR_URL,
    primer_facilitator,
    primer_facilitator_sync,
)
from primer_x402.networks import skale_networks, skale_rpc_urls
from primer_x402.prism import (
    PRISM_CONTRACT_ADDRESS,
    PRISM_ABI,
    ERC20_PAYMENT_TYPES,
    PrismPaymentParams,
    PrismPayload,
    get_prism_nonce,
    create_prism_payload,
)

__version__ = "1.0.0"

__all__ = [
    # Facilitator
    "PRIMER_FACILITATOR_URL",
    "primer_facilitator",
    "primer_facilitator_sync",
    # Networks
    "skale_networks",
    "skale_rpc_urls",
    # Prism
    "PRISM_CONTRACT_ADDRESS",
    "PRISM_ABI",
    "ERC20_PAYMENT_TYPES",
    "PrismPaymentParams",
    "PrismPayload",
    "get_prism_nonce",
    "create_prism_payload",
]
