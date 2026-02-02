# xClaw02
# Python SDK for x402 payments
# https://primer.systems | https://x402.org

from .signer import create_signer, Signer
from .payer import (
    x402_requests,
    x402_httpx,
    approve_token,
    PaymentError,
    X402Session
)
from .payee import (
    x402_flask,
    x402_fastapi,
    x402_protect,
    SettlementError
)
from .utils import (
    NETWORKS,
    BASE_NETWORKS,
    DEFAULT_FACILITATOR,
    NetworkConfig,
    is_valid_address,
    parse_payment_header
)
from .wallet import (
    create_wallet,
    wallet_from_mnemonic,
    get_balance,
    x402_probe,
    get_facilitator_info,
    list_networks,
    USDC_ADDRESSES,
    WalletInfo,
    BalanceInfo,
    ProbeResult
)
from .errors import (
    ErrorCodes,
    X402Error,
    InsufficientFundsError,
    AmountExceedsMaxError,
    ConfigError,
    UnsupportedNetworkError,
    InvalidResponseError
)

__version__ = "0.5.0"
__all__ = [
    # Signer
    "create_signer",
    "Signer",
    # Payer
    "x402_requests",
    "x402_httpx",
    "approve_token",
    "PaymentError",
    "X402Session",
    # Payee
    "x402_flask",
    "x402_fastapi",
    "x402_protect",
    "SettlementError",
    # Wallet
    "create_wallet",
    "wallet_from_mnemonic",
    "get_balance",
    "x402_probe",
    "get_facilitator_info",
    "list_networks",
    "USDC_ADDRESSES",
    "WalletInfo",
    "BalanceInfo",
    "ProbeResult",
    # Errors
    "ErrorCodes",
    "X402Error",
    "InsufficientFundsError",
    "AmountExceedsMaxError",
    "ConfigError",
    "UnsupportedNetworkError",
    "InvalidResponseError",
    # Utils
    "NETWORKS",
    "BASE_NETWORKS",
    "DEFAULT_FACILITATOR",
    "NetworkConfig",
    "is_valid_address",
    "parse_payment_header",
]
