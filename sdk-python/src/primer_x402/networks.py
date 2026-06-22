"""SKALE network constants.

Provides CAIP-2 network identifiers for SKALE chains supported by Primer.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SkaleNetworks:
    """SKALE network identifiers in CAIP-2 format."""

    base: str = "eip155:1187947933"
    base_sepolia: str = "eip155:324705682"


@dataclass(frozen=True)
class SkaleRpcUrls:
    """SKALE RPC endpoints."""

    base: str = "https://skale-base.skalenodes.com/v1/base"
    base_sepolia: str = "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha"


skale_networks = SkaleNetworks()
skale_rpc_urls = SkaleRpcUrls()
