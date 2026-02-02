# xClaw02 - Error Classes
# Structured errors for better agent/programmatic handling
# https://primer.systems

from typing import Dict, Any, Optional, List


class ErrorCodes:
    """Error codes for x402 operations."""

    # Configuration errors
    INVALID_CONFIG = "INVALID_CONFIG"
    MISSING_PRIVATE_KEY = "MISSING_PRIVATE_KEY"
    UNSUPPORTED_NETWORK = "UNSUPPORTED_NETWORK"

    # Payment errors
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    AMOUNT_EXCEEDS_MAX = "AMOUNT_EXCEEDS_MAX"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    SETTLEMENT_FAILED = "SETTLEMENT_FAILED"

    # Protocol errors
    INVALID_RESPONSE = "INVALID_RESPONSE"
    MISSING_PAYMENT_HEADER = "MISSING_PAYMENT_HEADER"
    UNSUPPORTED_VERSION = "UNSUPPORTED_VERSION"

    # Network errors
    NETWORK_ERROR = "NETWORK_ERROR"
    FACILITATOR_ERROR = "FACILITATOR_ERROR"
    RPC_ERROR = "RPC_ERROR"


class X402Error(Exception):
    """
    Base error class for x402 SDK.

    Provides structured error information for programmatic handling.

    Attributes:
        code: Error code from ErrorCodes
        message: Human-readable error message
        details: Additional error details dict
    """

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for logging/serialization."""
        return {
            "name": self.__class__.__name__,
            "code": self.code,
            "message": self.message,
            "details": self.details
        }

    def __repr__(self) -> str:
        return f"X402Error(code={self.code!r}, message={self.message!r})"


class InsufficientFundsError(X402Error):
    """Insufficient funds error."""

    def __init__(
        self,
        required: str,
        available: str,
        token: str,
        address: str
    ):
        super().__init__(
            ErrorCodes.INSUFFICIENT_FUNDS,
            f"Insufficient {token} balance: required {required}, available {available}",
            {"required": required, "available": available, "token": token, "address": address}
        )


class AmountExceedsMaxError(X402Error):
    """Amount exceeds maximum allowed."""

    def __init__(self, amount: str, max_amount: str, token: str):
        super().__init__(
            ErrorCodes.AMOUNT_EXCEEDS_MAX,
            f"Payment amount {amount} {token} exceeds maximum allowed {max_amount} {token}",
            {"amount": amount, "max_amount": max_amount, "token": token}
        )


class ConfigError(X402Error):
    """Invalid configuration error."""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            ErrorCodes.INVALID_CONFIG,
            message,
            {"field": field}
        )


class UnsupportedNetworkError(X402Error):
    """Network not supported error."""

    def __init__(self, network: str, supported_networks: List[str]):
        super().__init__(
            ErrorCodes.UNSUPPORTED_NETWORK,
            f"Network '{network}' is not supported. Supported networks: {', '.join(supported_networks)}",
            {"network": network, "supported_networks": supported_networks}
        )


class SettlementError(X402Error):
    """Settlement failed error."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response: Optional[Any] = None
    ):
        super().__init__(
            ErrorCodes.SETTLEMENT_FAILED,
            message,
            {"status_code": status_code, "response": response}
        )


class InvalidResponseError(X402Error):
    """Invalid 402 response error."""

    def __init__(self, message: str, response: Optional[Any] = None):
        super().__init__(
            ErrorCodes.INVALID_RESPONSE,
            message,
            {"response": response}
        )
