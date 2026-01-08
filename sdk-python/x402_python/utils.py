# Primer x402 - Shared Utilities
# Common functions and constants used across the SDK
# x402 v2 - CAIP-2 network format support
# https://primer.systems

import base64
import json
import logging
from collections import OrderedDict
from typing import Dict, Any, Optional, Tuple, List, TypeVar, Generic
from dataclasses import dataclass

# x402 protocol version
X402_VERSION = 2

# ============================================
# Bounded LRU Cache
# ============================================

K = TypeVar('K')
V = TypeVar('V')


class BoundedCache(Generic[K, V]):
    """
    A bounded LRU (Least Recently Used) cache.

    When the cache reaches max_size, the oldest entry is evicted.
    Accessing a key moves it to the most recently used position.

    Args:
        max_size: Maximum number of entries (default: 100)

    Example:
        >>> cache = BoundedCache(max_size=100)
        >>> cache.set('key', 'value')
        >>> cache.get('key')
        'value'
    """

    def __init__(self, max_size: int = 100):
        self._max_size = max_size
        self._cache: OrderedDict[K, V] = OrderedDict()

    def has(self, key: K) -> bool:
        """Check if key exists in cache."""
        return key in self._cache

    def get(self, key: K) -> Optional[V]:
        """
        Get value for key, moving it to most recently used.
        Returns None if key doesn't exist.
        """
        if key not in self._cache:
            return None
        # Move to end (most recently used)
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: K, value: V) -> None:
        """
        Set key to value. Evicts oldest if at capacity.
        """
        # Remove if exists (to update position)
        if key in self._cache:
            del self._cache[key]
        # Evict oldest if at capacity
        if len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        # Add to end (most recently used)
        self._cache[key] = value

    def clear(self) -> None:
        """Clear all entries."""
        self._cache.clear()

    def size(self) -> int:
        """Return number of entries."""
        return len(self._cache)


def create_bounded_cache(max_size: int = 100) -> BoundedCache:
    """
    Create a bounded LRU cache.

    Args:
        max_size: Maximum number of entries (default: 100)

    Returns:
        BoundedCache instance
    """
    return BoundedCache(max_size=max_size)


# ============================================
# Retry Logic
# ============================================

import time as _time
from typing import Callable as _Callable, TypeVar as _TypeVar

_T = _TypeVar('_T')


def retry_with_backoff(
    fn: _Callable[[], _T],
    max_retries: int = 4,
    base_delay_ms: int = 2000,
    max_delay_ms: int = 16000,
    retryable_check: Optional[_Callable[[Exception], bool]] = None
) -> _T:
    """
    Retry a function with exponential backoff.

    Args:
        fn: Function to call (should take no arguments)
        max_retries: Maximum number of retries (default: 4)
        base_delay_ms: Initial delay in milliseconds (default: 2000)
        max_delay_ms: Maximum delay in milliseconds (default: 16000)
        retryable_check: Optional function to check if exception is retryable

    Returns:
        Result of fn()

    Raises:
        Exception: The last exception if all retries fail

    Example:
        >>> def call_api():
        ...     return requests.get('https://api.example.com')
        >>> result = retry_with_backoff(call_api, max_retries=3)
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            last_error = e

            # Check if error is retryable
            is_retryable = True
            if retryable_check is not None:
                is_retryable = retryable_check(e)
            elif hasattr(e, 'retryable'):
                is_retryable = getattr(e, 'retryable', False)

            # If not retryable or last attempt, raise
            if not is_retryable or attempt >= max_retries:
                raise

            # Calculate delay with exponential backoff
            delay_ms = min(base_delay_ms * (2 ** attempt), max_delay_ms)
            _time.sleep(delay_ms / 1000)

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise RuntimeError("Retry logic error")

# ============================================
# Constants
# ============================================

# Default timeout for facilitator requests (10 seconds)
FACILITATOR_TIMEOUT_MS = 10000

# Default facilitator URL
DEFAULT_FACILITATOR = "https://x402.primer.systems"

# Networks with default facilitator support (Primer facilitator)
# Uses CAIP-2 format for v2 compatibility
BASE_NETWORKS: List[str] = ["eip155:8453", "eip155:84532"]

# Legacy network name mapping (for backward compatibility during transition)
LEGACY_NETWORK_NAMES: List[str] = ["base", "base-sepolia"]


@dataclass
class NetworkConfig:
    """Configuration for a supported network with CAIP-2 identifier."""
    name: str
    chain_id: int
    caip_id: str
    legacy_name: str
    rpc_url: str


# Network configurations with CAIP-2 identifiers
# CAIP-2 format: namespace:reference (e.g., eip155:8453 for Base)
NETWORKS: Dict[str, NetworkConfig] = {
    # Base (default facilitator supported)
    "eip155:8453": NetworkConfig(
        name="Base",
        chain_id=8453,
        caip_id="eip155:8453",
        legacy_name="base",
        rpc_url="https://mainnet.base.org/"
    ),
    "eip155:84532": NetworkConfig(
        name="Base Sepolia",
        chain_id=84532,
        caip_id="eip155:84532",
        legacy_name="base-sepolia",
        rpc_url="https://sepolia.base.org/"
    ),
    # Ethereum
    "eip155:1": NetworkConfig(
        name="Ethereum",
        chain_id=1,
        caip_id="eip155:1",
        legacy_name="ethereum",
        rpc_url="https://eth.llamarpc.com"
    ),
    "eip155:11155111": NetworkConfig(
        name="Sepolia",
        chain_id=11155111,
        caip_id="eip155:11155111",
        legacy_name="sepolia",
        rpc_url="https://rpc.sepolia.org"
    ),
    # Arbitrum
    "eip155:42161": NetworkConfig(
        name="Arbitrum One",
        chain_id=42161,
        caip_id="eip155:42161",
        legacy_name="arbitrum",
        rpc_url="https://arb1.arbitrum.io/rpc"
    ),
    "eip155:421614": NetworkConfig(
        name="Arbitrum Sepolia",
        chain_id=421614,
        caip_id="eip155:421614",
        legacy_name="arbitrum-sepolia",
        rpc_url="https://sepolia-rollup.arbitrum.io/rpc"
    ),
    # Optimism
    "eip155:10": NetworkConfig(
        name="Optimism",
        chain_id=10,
        caip_id="eip155:10",
        legacy_name="optimism",
        rpc_url="https://mainnet.optimism.io"
    ),
    "eip155:11155420": NetworkConfig(
        name="Optimism Sepolia",
        chain_id=11155420,
        caip_id="eip155:11155420",
        legacy_name="optimism-sepolia",
        rpc_url="https://sepolia.optimism.io"
    ),
    # Polygon
    "eip155:137": NetworkConfig(
        name="Polygon",
        chain_id=137,
        caip_id="eip155:137",
        legacy_name="polygon",
        rpc_url="https://polygon-rpc.com"
    ),
    "eip155:80002": NetworkConfig(
        name="Polygon Amoy",
        chain_id=80002,
        caip_id="eip155:80002",
        legacy_name="polygon-amoy",
        rpc_url="https://rpc-amoy.polygon.technology"
    ),
}


# ============================================
# CAIP-2 Network Utilities
# ============================================

def to_caip_network(network: str) -> str:
    """
    Convert a legacy network name to CAIP-2 format.

    Args:
        network: Network name (legacy or CAIP-2)

    Returns:
        CAIP-2 network identifier

    Raises:
        ValueError: If network is unknown
    """
    # Already in CAIP-2 format
    if network.startswith("eip155:"):
        return network
    # Look up by legacy name
    for caip_id, config in NETWORKS.items():
        if config.legacy_name == network:
            return caip_id
    raise ValueError(
        f"Unknown network: {network}. Use CAIP-2 format (e.g., eip155:8453) or supported name."
    )


def from_caip_network(caip_id: str) -> str:
    """
    Convert a CAIP-2 network identifier to legacy name.

    Args:
        caip_id: CAIP-2 network identifier

    Returns:
        Legacy network name

    Raises:
        ValueError: If CAIP-2 identifier is unknown
    """
    # Already a legacy name
    if not caip_id.startswith("eip155:"):
        return caip_id
    config = NETWORKS.get(caip_id)
    if config:
        return config.legacy_name
    raise ValueError(f"Unknown CAIP-2 network: {caip_id}")


def get_network_config(network: str) -> NetworkConfig:
    """
    Get network configuration by any identifier (CAIP-2 or legacy).

    Args:
        network: Network identifier

    Returns:
        Network configuration

    Raises:
        ValueError: If network is unknown
    """
    # Try direct lookup first (CAIP-2 format)
    if network in NETWORKS:
        return NETWORKS[network]
    # Try legacy name lookup
    caip_id = to_caip_network(network)
    return NETWORKS[caip_id]


def chain_id_to_caip(chain_id: int) -> str:
    """
    Create CAIP-2 identifier from chain ID.

    Args:
        chain_id: EVM chain ID

    Returns:
        CAIP-2 identifier
    """
    return f"eip155:{chain_id}"


def caip_to_chain_id(caip_id: str) -> int:
    """
    Extract chain ID from CAIP-2 identifier.

    Args:
        caip_id: CAIP-2 identifier

    Returns:
        Chain ID

    Raises:
        ValueError: If not a valid EVM CAIP-2 identifier
    """
    if not caip_id.startswith("eip155:"):
        raise ValueError(f"Invalid EVM CAIP-2 identifier: {caip_id}")
    return int(caip_id.split(":")[1])


# ============================================
# Logging
# ============================================

def get_logger(name: str) -> logging.Logger:
    """Get a logger with the x402 prefix."""
    return logging.getLogger(f"x402.{name}")


# ============================================
# Base64 Encoding/Decoding
# ============================================

def base64_encode(data: str) -> str:
    """Encode a string to base64."""
    return base64.b64encode(data.encode("utf-8")).decode("utf-8")


def base64_decode(data: str) -> str:
    """Decode a base64 string."""
    return base64.b64decode(data.encode("utf-8")).decode("utf-8")


# ============================================
# Address Validation
# ============================================

def is_valid_address(address: str) -> bool:
    """Validate Ethereum address format."""
    if not isinstance(address, str):
        return False
    if not address.startswith("0x"):
        return False
    if len(address) != 42:
        return False
    try:
        int(address, 16)
        return True
    except ValueError:
        return False


# ============================================
# Payment Header Parsing
# ============================================

@dataclass
class PaymentParseResult:
    """Result of parsing a payment header."""
    payment: Optional[Dict[str, Any]]
    error: Optional[str]


def parse_payment_header(payment_header: Optional[str]) -> PaymentParseResult:
    """
    Parse and validate an X-PAYMENT header from a client.
    Supports x402 v2 format.

    Args:
        payment_header: Base64-encoded payment header

    Returns:
        PaymentParseResult with payment dict or error message
    """
    if not payment_header or not isinstance(payment_header, str):
        return PaymentParseResult(payment=None, error="Missing X-PAYMENT header")

    # Decode base64
    try:
        decoded = base64_decode(payment_header)
    except Exception:
        return PaymentParseResult(
            payment=None,
            error="Invalid X-PAYMENT header: not valid base64"
        )

    # Parse JSON
    try:
        payment = json.loads(decoded)
    except Exception:
        return PaymentParseResult(
            payment=None,
            error="Invalid X-PAYMENT header: not valid JSON"
        )

    # Validate required fields
    if not payment.get("x402Version"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing x402Version"
        )
    if payment.get("x402Version") != 2:
        return PaymentParseResult(
            payment=None,
            error=f"Unsupported x402Version: {payment.get('x402Version')}. Expected version 2."
        )
    if not payment.get("scheme"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing scheme"
        )
    if not payment.get("network"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing network"
        )
    if not payment.get("payload"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing payload"
        )

    payload = payment.get("payload", {})
    if not payload.get("signature"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing payload.signature"
        )
    if not payload.get("authorization"):
        return PaymentParseResult(
            payment=None,
            error="Invalid payment: missing payload.authorization"
        )

    # Normalize network to CAIP-2 format if needed
    network = payment.get("network", "")
    if not network.startswith("eip155:"):
        try:
            payment["network"] = to_caip_network(network)
        except ValueError:
            return PaymentParseResult(
                payment=None,
                error=f"Invalid payment: unknown network {network}"
            )

    return PaymentParseResult(payment=payment, error=None)


# ============================================
# Facilitator Validation
# ============================================

def validate_network_facilitator(
    network: str,
    facilitator: str
) -> None:
    """
    Validate that non-Base networks have a custom facilitator.
    Accepts both CAIP-2 format and legacy network names.

    Args:
        network: Network name (CAIP-2 or legacy)
        facilitator: Facilitator URL

    Raises:
        ValueError: If non-Base network uses default facilitator
    """
    if not network:
        return

    # Normalize to CAIP-2 format for comparison
    caip_network = network if network.startswith("eip155:") else to_caip_network(network)

    if caip_network not in BASE_NETWORKS and facilitator == DEFAULT_FACILITATOR:
        raise ValueError(
            f'Network "{caip_network}" requires a custom facilitator. '
            f"The default Primer facilitator only supports Base (eip155:8453, eip155:84532). "
            f"Specify a facilitator URL for your network's facilitator."
        )


def validate_routes_facilitator(
    routes: Dict[str, Dict[str, Any]],
    facilitator: str
) -> None:
    """
    Validate that routes with non-Base networks have a custom facilitator.
    Accepts both CAIP-2 format and legacy network names.

    Args:
        routes: Route configuration dict
        facilitator: Facilitator URL

    Raises:
        ValueError: If non-Base networks use default facilitator
    """
    non_base_networks = []
    for path, config in routes.items():
        network = config.get("network")
        if network:
            # Normalize to CAIP-2 format
            caip_network = network if network.startswith("eip155:") else to_caip_network(network)
            if caip_network not in BASE_NETWORKS:
                non_base_networks.append(caip_network)

    if non_base_networks and facilitator == DEFAULT_FACILITATOR:
        networks = ", ".join(set(non_base_networks))
        raise ValueError(
            f"Routes use non-Base networks ({networks}) which require a custom facilitator. "
            f"The default Primer facilitator only supports Base (eip155:8453, eip155:84532). "
            f"Specify a facilitator URL for your network's facilitator."
        )
