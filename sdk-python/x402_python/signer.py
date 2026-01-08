# Primer x402 - Signer
# Creates a wallet signer for x402 payments
# x402 v2 - CAIP-2 network format
# https://primer.systems

from typing import Dict, Any, Optional
from dataclasses import dataclass
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from .utils import NETWORKS, get_logger, NetworkConfig, get_network_config

logger = get_logger("signer")


@dataclass
class NetworkInfo:
    """Network information for a signer."""
    name: str
    chain_id: int
    display_name: str


class Signer:
    """
    A signer for x402 payments.

    Handles EIP-712 typed data signing for payment authorizations.
    Returns CAIP-2 format network identifiers for v2 compatibility.
    """

    def __init__(
        self,
        private_key: str,
        network: str,
        rpc_url: Optional[str] = None
    ):
        """
        Create a new signer.

        Args:
            private_key: Ethereum private key (with or without 0x prefix)
            network: Network identifier (CAIP-2 format like 'eip155:8453' or legacy like 'base')
            rpc_url: Optional custom RPC URL (overrides default)

        Raises:
            ValueError: If network is not supported or private key is invalid
        """
        # Get network config (accepts both CAIP-2 and legacy names)
        try:
            self._network_config = get_network_config(network)
        except ValueError:
            supported = ", ".join(NETWORKS.keys())
            raise ValueError(f"Invalid network: {network}. Supported: {supported}")

        # Always use CAIP-2 format internally
        self._caip_network = self._network_config.caip_id
        self._rpc_url = rpc_url or self._network_config.rpc_url

        # Create account from private key
        if not private_key.startswith("0x"):
            private_key = "0x" + private_key

        try:
            self._account = Account.from_key(private_key)
        except Exception as e:
            raise ValueError(f"Invalid private key: {e}")

        # Create web3 instance for RPC calls if needed
        self._web3 = Web3(Web3.HTTPProvider(self._rpc_url))

        logger.debug(
            f"Created signer: network={self._caip_network}, "
            f"chain_id={self._network_config.chain_id}, "
            f"address={self._account.address}"
        )

    def sign_typed_data(
        self,
        domain: Dict[str, Any],
        types: Dict[str, Any],
        message: Dict[str, Any],
        primary_type: Optional[str] = None
    ) -> str:
        """
        Sign EIP-712 typed data.

        Args:
            domain: EIP-712 domain separator
            types: Type definitions
            message: The message to sign
            primary_type: Primary type name (auto-detected if not provided)

        Returns:
            Hex-encoded signature
        """
        # Auto-detect primary type if not provided
        if primary_type is None:
            # Filter out EIP712Domain if present
            type_names = [t for t in types.keys() if t != "EIP712Domain"]
            if type_names:
                primary_type = type_names[0]
            else:
                raise ValueError("Could not auto-detect primary type")

        # Build the typed data structure
        typed_data = {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                **types
            },
            "primaryType": primary_type,
            "domain": domain,
            "message": message
        }

        # Encode and sign
        encoded = encode_typed_data(full_message=typed_data)
        signed = self._account.sign_message(encoded)

        # Ensure signature has 0x prefix
        sig_hex = signed.signature.hex()
        if not sig_hex.startswith("0x"):
            sig_hex = "0x" + sig_hex
        return sig_hex

    def get_address(self) -> str:
        """Get the wallet address."""
        return self._account.address

    def get_network(self) -> NetworkInfo:
        """Get network information (returns CAIP-2 format for v2 compatibility)."""
        return NetworkInfo(
            name=self._caip_network,  # CAIP-2 format (e.g., 'eip155:8453')
            chain_id=self._network_config.chain_id,
            display_name=self._network_config.name
        )

    def get_web3(self) -> Web3:
        """Get the Web3 instance for RPC calls."""
        return self._web3

    @property
    def address(self) -> str:
        """Wallet address (convenience property)."""
        return self._account.address

    @property
    def chain_id(self) -> int:
        """Chain ID (convenience property)."""
        return self._network_config.chain_id


def create_signer(
    network: str,
    private_key: str,
    rpc_url: Optional[str] = None
) -> Signer:
    """
    Create a signer for x402 payments.

    Args:
        network: Network identifier (CAIP-2 like 'eip155:8453' or legacy like 'base')
        private_key: Ethereum private key
        rpc_url: Optional custom RPC URL

    Returns:
        Signer instance (returns CAIP-2 format from get_network())

    Example:
        >>> # Using CAIP-2 format (recommended)
        >>> signer = create_signer('eip155:8453', os.environ['PRIVATE_KEY'])
        >>> print(signer.get_network().name)
        eip155:8453

        >>> # Legacy network name (still supported)
        >>> signer = create_signer('base', os.environ['PRIVATE_KEY'])
        >>> print(signer.get_network().name)
        eip155:8453

        >>> # With custom RPC
        >>> signer = create_signer('eip155:8453', key, rpc_url='https://my-rpc.com')
    """
    return Signer(private_key=private_key, network=network, rpc_url=rpc_url)
