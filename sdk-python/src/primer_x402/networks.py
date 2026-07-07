"""Network constants for chains supported by Primer.

Provides CAIP-2 network identifiers and RPC URLs for SKALE and Robinhood Chain.
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


@dataclass(frozen=True)
class RobinhoodNetworks:
    """Robinhood Chain network identifiers in CAIP-2 format."""

    mainnet: str = "eip155:4663"
    testnet: str = "eip155:46630"


@dataclass(frozen=True)
class RobinhoodRpcUrls:
    """Robinhood Chain RPC endpoints."""

    mainnet: str = "https://rpc.mainnet.chain.robinhood.com"
    testnet: str = "https://rpc.testnet.chain.robinhood.com"


skale_networks = SkaleNetworks()
skale_rpc_urls = SkaleRpcUrls()
robinhood_networks = RobinhoodNetworks()
robinhood_rpc_urls = RobinhoodRpcUrls()
