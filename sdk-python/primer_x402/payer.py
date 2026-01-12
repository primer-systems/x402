# Primer x402 - Payer Functions
# Wrap HTTP clients to automatically handle 402 Payment Required responses
# x402 v2 - CAIP-2 network format
# https://primer.systems

import os
import json
import secrets
from typing import Dict, Any, Optional, Union, Callable
from dataclasses import dataclass

import requests
from web3 import Web3
from eth_account import Account

from .utils import (
    NETWORKS,
    DEFAULT_FACILITATOR,
    FACILITATOR_TIMEOUT_MS,
    X402_VERSION,
    base64_encode,
    base64_decode,
    get_logger,
    validate_network_facilitator,
    create_bounded_cache,
    to_caip_network,
    get_network_config
)
from .signer import Signer

logger = get_logger("payer")

# ERC-20 Token ABI (minimal for what we need)
TOKEN_ABI = [
    {
        "name": "name",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}]
    },
    {
        "name": "version",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}]
    },
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint8"}]
    },
    {
        "name": "allowance",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"}
        ],
        "outputs": [{"type": "uint256"}]
    },
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "outputs": [{"type": "bool"}]
    },
    {
        "name": "authorizationState",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "authorizer", "type": "address"},
            {"name": "nonce", "type": "bytes32"}
        ],
        "outputs": [{"type": "bool"}]
    }
]

# Prism contract ABI (for nonce)
PRISM_ABI = [
    {
        "name": "getNonce",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "token", "type": "address"}
        ],
        "outputs": [{"type": "uint256"}]
    }
]


# Bounded decimals cache to avoid repeated RPC calls (max 100 tokens)
_decimals_cache = create_bounded_cache(100)


@dataclass
class PaymentRequirements:
    """Payment requirements from a 402 response."""
    scheme: str
    network: str
    max_amount_required: str
    asset: str
    pay_to: str
    resource: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


def parse_payment_requirements(response_data: Dict[str, Any]) -> PaymentRequirements:
    """
    Parse payment requirements from 402 response.
    Expects x402 v2 format: { x402Version: 2, accepts: [...] }
    Also normalizes network to CAIP-2 format.
    """
    if not response_data.get("x402Version"):
        raise ValueError("Invalid 402 response: missing x402Version")

    if response_data.get("x402Version") != 2:
        raise ValueError(
            f"Unsupported x402Version: {response_data.get('x402Version')}. Expected version 2."
        )

    accepts = response_data.get("accepts", [])
    if not isinstance(accepts, list) or len(accepts) == 0:
        raise ValueError("Invalid 402 response: missing or empty accepts array")

    # Return the first accepted payment scheme, normalizing network to CAIP-2
    req = accepts[0]
    network = req.get("network", "")
    if network and not network.startswith("eip155:"):
        network = to_caip_network(network)

    return PaymentRequirements(
        scheme=req.get("scheme", "exact"),
        network=network,
        max_amount_required=str(req.get("maxAmountRequired", "0")),
        asset=req.get("asset", ""),
        pay_to=req.get("payTo", ""),
        resource=req.get("resource"),
        extra=req.get("extra")
    )


def verify_payment(
    payment: Dict[str, Any],
    requirements: PaymentRequirements,
    facilitator: str,
    timeout_ms: int = FACILITATOR_TIMEOUT_MS
) -> Dict[str, Any]:
    """
    Verify a payment with the facilitator before submitting.
    This is optional but recommended to catch errors early.
    x402 v2 format.
    """
    payload = {
        "x402Version": X402_VERSION,
        "paymentPayload": payment,
        "paymentRequirements": {
            "scheme": requirements.scheme,
            "network": requirements.network,  # Already in CAIP-2 format
            "maxAmountRequired": requirements.max_amount_required,
            "asset": requirements.asset,
            "payTo": requirements.pay_to
        }
    }

    timeout_sec = timeout_ms / 1000

    try:
        response = requests.post(
            f"{facilitator}/verify",
            json=payload,
            timeout=timeout_sec
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", f"Payment verification failed: {response.status_code}")
            except Exception:
                error_msg = f"Payment verification failed: {response.status_code}"
            raise PaymentError(error_msg, code="VERIFY_FAILED")

        return response.json()

    except requests.exceptions.Timeout:
        raise PaymentError(
            f"Facilitator verify request timed out after {timeout_ms}ms. "
            "The facilitator may be temporarily unavailable - please retry.",
            code="FACILITATOR_TIMEOUT",
            retryable=True
        )
    except requests.exceptions.ConnectionError as e:
        raise PaymentError(
            f"Failed to connect to facilitator: {e}",
            code="CONNECTION_ERROR",
            retryable=True
        )


class PaymentError(Exception):
    """Error during payment processing."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.details = details


def get_token_decimals(web3: Web3, token_address: str) -> int:
    """Get token decimals with caching."""
    cached = _decimals_cache.get(token_address)
    if cached is not None:
        return cached

    token = web3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=TOKEN_ABI
    )
    decimals = token.functions.decimals().call()
    result = int(decimals)
    _decimals_cache.set(token_address, result)
    return result


def check_eip3009(web3: Web3, token_address: str, address: str) -> bool:
    """Check if token supports EIP-3009 (transferWithAuthorization)."""
    token = web3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=TOKEN_ABI
    )

    try:
        test_nonce = "0x" + secrets.token_hex(32)
        token.functions.authorizationState(
            Web3.to_checksum_address(address),
            bytes.fromhex(test_nonce[2:])
        ).call()
        return True
    except Exception:
        return False


def get_token_details(
    web3: Web3,
    token_address: str,
    address: str
) -> Dict[str, Any]:
    """Get token name, version, and EIP-3009 support."""
    token = web3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=TOKEN_ABI
    )

    try:
        token_name = token.functions.name().call()
    except Exception:
        raise ValueError("Failed to get token name")

    try:
        token_version = token.functions.version().call()
    except Exception:
        token_version = "1"

    is_eip3009 = check_eip3009(web3, token_address, address)

    return {
        "token_name": token_name,
        "token_version": token_version,
        "is_eip3009": is_eip3009
    }


def fetch_prism_address(
    network: str,
    facilitator: str,
    timeout_ms: int = FACILITATOR_TIMEOUT_MS
) -> str:
    """Fetch Prism contract address from facilitator."""
    timeout_sec = timeout_ms / 1000

    try:
        response = requests.get(
            f"{facilitator}/contracts",
            timeout=timeout_sec
        )

        if not response.ok:
            raise PaymentError(
                f"Failed to fetch Prism address: {response.status_code}",
                code="FACILITATOR_ERROR"
            )

        contracts = response.json()
        if network not in contracts:
            raise PaymentError(
                f"Network {network} not supported",
                code="UNSUPPORTED_NETWORK"
            )

        return contracts[network]["prism"]

    except requests.exceptions.Timeout:
        raise PaymentError(
            f"Facilitator request timed out after {timeout_ms}ms. "
            "The facilitator may be temporarily unavailable - please retry.",
            code="FACILITATOR_TIMEOUT",
            retryable=True
        )
    except requests.exceptions.ConnectionError as e:
        raise PaymentError(
            f"Failed to connect to facilitator: {e}",
            code="CONNECTION_ERROR",
            retryable=True
        )


def check_allowance(
    web3: Web3,
    token_address: str,
    owner_address: str,
    spender_address: str
) -> int:
    """Check token allowance."""
    token = web3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=TOKEN_ABI
    )

    return token.functions.allowance(
        Web3.to_checksum_address(owner_address),
        Web3.to_checksum_address(spender_address)
    ).call()


def get_prism_nonce(
    web3: Web3,
    prism_address: str,
    user_address: str,
    token_address: str
) -> int:
    """Get Prism nonce for ERC-20 payments."""
    prism = web3.eth.contract(
        address=Web3.to_checksum_address(prism_address),
        abi=PRISM_ABI
    )

    return prism.functions.getNonce(
        Web3.to_checksum_address(user_address),
        Web3.to_checksum_address(token_address)
    ).call()


def generate_random_bytes32() -> str:
    """Generate random 32 bytes as hex string."""
    return "0x" + secrets.token_hex(32)


def create_payment(
    signer: Signer,
    requirements: PaymentRequirements,
    facilitator: str
) -> Dict[str, Any]:
    """Create a signed payment for the given requirements."""
    import time

    network = signer.get_network()
    address = signer.get_address()
    web3 = signer.get_web3()

    token_address = requirements.asset
    pay_to = requirements.pay_to
    value = requirements.max_amount_required

    # Get token details - prefer extra field to avoid RPC calls
    if requirements.extra and requirements.extra.get("name") and requirements.extra.get("version"):
        logger.debug(
            f"Using token metadata from extra field: "
            f"{requirements.extra['name']} v{requirements.extra['version']}"
        )
        token_name = requirements.extra["name"]
        token_version = requirements.extra["version"]
        is_eip3009 = check_eip3009(web3, token_address, address)
    else:
        logger.debug("No extra field, fetching token metadata from chain")
        details = get_token_details(web3, token_address, address)
        token_name = details["token_name"]
        token_version = details["token_version"]
        is_eip3009 = details["is_eip3009"]

    now = int(time.time())
    valid_after = now - 60
    valid_before = now + 3600

    if is_eip3009:
        # EIP-3009 token (USDC, EURC)
        nonce = generate_random_bytes32()

        domain = {
            "name": token_name,
            "version": token_version,
            "chainId": network.chain_id,
            "verifyingContract": Web3.to_checksum_address(token_address)
        }

        types = {
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"}
            ]
        }

        message = {
            "from": Web3.to_checksum_address(address),
            "to": Web3.to_checksum_address(pay_to),
            "value": int(value),
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": bytes.fromhex(nonce[2:])
        }

        signature = signer.sign_typed_data(domain, types, message, "TransferWithAuthorization")

        authorization = {
            "from": address,
            "to": pay_to,
            "value": str(value),
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": nonce
        }
    else:
        # Standard ERC-20 via Prism
        prism_address = fetch_prism_address(network.name, facilitator)

        # Check allowance before proceeding
        allowance = check_allowance(web3, token_address, address, prism_address)
        if allowance < int(value):
            raise PaymentError(
                f"Insufficient allowance for {token_address}. "
                f"Required: {value}, Current: {allowance}. "
                f"Use approve_token() to approve the Prism contract.",
                code="INSUFFICIENT_ALLOWANCE",
                details={
                    "required": value,
                    "current": str(allowance),
                    "token": token_address,
                    "spender": prism_address
                }
            )

        nonce = get_prism_nonce(web3, prism_address, address, token_address)

        domain = {
            "name": "Primer",
            "version": "1",
            "chainId": network.chain_id,
            "verifyingContract": Web3.to_checksum_address(prism_address)
        }

        types = {
            "ERC20Payment": [
                {"name": "token", "type": "address"},
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "nonce", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"}
            ]
        }

        message = {
            "token": Web3.to_checksum_address(token_address),
            "from": Web3.to_checksum_address(address),
            "to": Web3.to_checksum_address(pay_to),
            "value": int(value),
            "nonce": nonce,
            "validAfter": valid_after,
            "validBefore": valid_before
        }

        signature = signer.sign_typed_data(domain, types, message, "ERC20Payment")

        authorization = {
            "from": address,
            "to": pay_to,
            "value": str(value),
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": str(nonce)
        }

    # Format as x402 v2 payload
    # Network is already in CAIP-2 format from signer.get_network()
    return {
        "x402Version": X402_VERSION,
        "scheme": "exact",
        "network": network.name,  # CAIP-2 format (e.g., 'eip155:8453')
        "payload": {
            "signature": signature,
            "authorization": authorization
        }
    }


def x402_requests(
    signer: Signer,
    max_amount: str,
    facilitator: Optional[str] = None,
    verify: bool = True,
    timeout: Optional[float] = None
) -> "X402Session":
    """
    Create a requests session that handles 402 Payment Required responses.

    Args:
        signer: Signer created by create_signer()
        max_amount: Maximum amount to pay per request (e.g., '0.50')
        facilitator: Custom facilitator URL
        verify: Verify payment with facilitator before sending (default: True)
        timeout: Request timeout in seconds

    Returns:
        X402Session that wraps requests

    Example:
        >>> signer = create_signer('base', os.environ['PRIVATE_KEY'])
        >>> session = x402_requests(signer, max_amount='0.50')
        >>> response = session.get('https://example.com/api/paywall')
    """
    return X402Session(
        signer=signer,
        max_amount=max_amount,
        facilitator=facilitator or DEFAULT_FACILITATOR,
        verify=verify,
        timeout=timeout
    )


class X402Session:
    """
    A requests-like session that automatically handles 402 Payment Required.
    """

    def __init__(
        self,
        signer: Signer,
        max_amount: str,
        facilitator: str = DEFAULT_FACILITATOR,
        verify: bool = True,
        timeout: Optional[float] = None
    ):
        if not max_amount:
            raise ValueError(
                "max_amount is required. Specify the maximum amount you are "
                "willing to pay per request (e.g., max_amount='0.50')"
            )

        self.signer = signer
        self.max_amount = float(max_amount)
        self.facilitator = facilitator
        self.should_verify = verify
        self.timeout = timeout
        self._session = requests.Session()

    def request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> requests.Response:
        """Make a request with automatic 402 handling."""
        if self.timeout and "timeout" not in kwargs:
            kwargs["timeout"] = self.timeout

        logger.debug(f"Request to {url}")

        # Make initial request
        response = self._session.request(method, url, **kwargs)

        # If not 402, return as-is
        if response.status_code != 402:
            logger.debug(f"Response {response.status_code} - no payment required")
            return response

        logger.debug("Got 402 Payment Required")

        # Parse payment requirements from PAYMENT-REQUIRED header
        payment_required_header = response.headers.get("payment-required")
        if not payment_required_header:
            raise PaymentError("402 response missing PAYMENT-REQUIRED header")

        try:
            payment_required = json.loads(base64_decode(payment_required_header))
        except Exception as e:
            raise PaymentError(f"Failed to parse PAYMENT-REQUIRED header: {e}")

        requirements = parse_payment_requirements(payment_required)
        logger.debug(
            f"Payment requirements: scheme={requirements.scheme}, "
            f"network={requirements.network}, asset={requirements.asset}, "
            f"maxAmountRequired={requirements.max_amount_required}"
        )

        # Get token decimals and validate amount
        web3 = self.signer.get_web3()
        decimals = get_token_decimals(web3, requirements.asset)
        amount = int(requirements.max_amount_required) / (10 ** decimals)
        logger.debug(f"Amount: {amount} (max allowed: {self.max_amount})")

        if amount > self.max_amount:
            raise PaymentError(
                f"Payment amount {amount} exceeds maxAmount {self.max_amount}",
                code="AMOUNT_EXCEEDED"
            )

        # Create payment
        logger.debug("Creating payment...")
        payment = create_payment(self.signer, requirements, self.facilitator)
        logger.debug(f"Payment created, signature: {payment['payload']['signature'][:20]}...")

        # Verify payment before sending (optional but recommended)
        if self.should_verify:
            logger.debug(f"Verifying payment with facilitator: {self.facilitator}")
            verify_payment(payment, requirements, self.facilitator)
            logger.debug("Payment verified successfully")

        # Retry with payment header (x402 v2 uses PAYMENT-SIGNATURE)
        logger.debug("Retrying request with PAYMENT-SIGNATURE header")
        payment_header = base64_encode(json.dumps(payment))

        headers = kwargs.get("headers", {}).copy()
        headers["PAYMENT-SIGNATURE"] = payment_header
        kwargs["headers"] = headers

        final_response = self._session.request(method, url, **kwargs)
        logger.debug(f"Final response: {final_response.status_code}")
        return final_response

    def get(self, url: str, **kwargs) -> requests.Response:
        """Make a GET request."""
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> requests.Response:
        """Make a POST request."""
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs) -> requests.Response:
        """Make a PUT request."""
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs) -> requests.Response:
        """Make a PATCH request."""
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs) -> requests.Response:
        """Make a DELETE request."""
        return self.request("DELETE", url, **kwargs)

    def close(self):
        """Close the session."""
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def approve_token(
    signer: Signer,
    token_address: str,
    amount: Optional[str] = None,
    facilitator: Optional[str] = None
) -> Dict[str, Any]:
    """
    Approve a token for use with x402 payments.

    Required for standard ERC-20 tokens (not needed for EIP-3009 tokens like USDC).

    Args:
        signer: Signer created by create_signer()
        token_address: Token contract address
        amount: Amount to approve (default: unlimited)
        facilitator: Custom facilitator URL

    Returns:
        Transaction receipt dict

    Example:
        >>> # Approve unlimited
        >>> receipt = approve_token(signer, '0x...')
        >>>
        >>> # Approve specific amount
        >>> receipt = approve_token(signer, '0x...', amount='1000000000')
    """
    facilitator = facilitator or DEFAULT_FACILITATOR
    network = signer.get_network()
    address = signer.get_address()
    web3 = signer.get_web3()

    # Get Prism address
    prism_address = fetch_prism_address(network.name, facilitator)

    # Determine approval amount (default: unlimited = 2^256 - 1)
    MAX_UINT256 = 2**256 - 1
    approval_amount = int(amount) if amount else MAX_UINT256

    # Get the private key from signer (we need to sign a transaction)
    # This requires the signer to expose the account or wallet
    token = web3.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=TOKEN_ABI
    )

    # Build and sign the transaction
    tx = token.functions.approve(
        Web3.to_checksum_address(prism_address),
        approval_amount
    ).build_transaction({
        'from': Web3.to_checksum_address(address),
        'nonce': web3.eth.get_transaction_count(Web3.to_checksum_address(address)),
        'gas': 100000,
        'gasPrice': web3.eth.gas_price
    })

    # Sign with the account from signer
    signed_tx = signer._account.sign_transaction(tx)

    # Send transaction
    tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)

    # Wait for receipt
    receipt = web3.eth.wait_for_transaction_receipt(tx_hash)

    return {
        "hash": receipt.transactionHash.hex(),
        "block_number": receipt.blockNumber,
        "status": receipt.status,
        "spender": prism_address,
        "amount": str(approval_amount)
    }


# Optional httpx support
try:
    import httpx

    async def verify_payment_async(
        payment: Dict[str, Any],
        requirements: PaymentRequirements,
        facilitator: str,
        timeout_ms: int = FACILITATOR_TIMEOUT_MS
    ) -> Dict[str, Any]:
        """
        Async version of verify_payment using httpx.
        Verify a payment with the facilitator before submitting.
        x402 v2 format.
        """
        payload = {
            "x402Version": X402_VERSION,
            "paymentPayload": payment,
            "paymentRequirements": {
                "scheme": requirements.scheme,
                "network": requirements.network,  # Already in CAIP-2 format
                "maxAmountRequired": requirements.max_amount_required,
                "asset": requirements.asset,
                "payTo": requirements.pay_to
            }
        }

        timeout_sec = timeout_ms / 1000

        try:
            async with httpx.AsyncClient(timeout=timeout_sec) as client:
                response = await client.post(
                    f"{facilitator}/verify",
                    json=payload
                )

                if response.status_code >= 400:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", f"Payment verification failed: {response.status_code}")
                    except Exception:
                        error_msg = f"Payment verification failed: {response.status_code}"
                    raise PaymentError(error_msg, code="VERIFY_FAILED")

                return response.json()

        except httpx.TimeoutException:
            raise PaymentError(
                f"Facilitator verify request timed out after {timeout_ms}ms. "
                "The facilitator may be temporarily unavailable - please retry.",
                code="FACILITATOR_TIMEOUT",
                retryable=True
            )
        except httpx.ConnectError as e:
            raise PaymentError(
                f"Failed to connect to facilitator: {e}",
                code="CONNECTION_ERROR",
                retryable=True
            )

    def x402_httpx(
        signer: Signer,
        max_amount: str,
        facilitator: Optional[str] = None,
        verify: bool = True,
        timeout: Optional[float] = None
    ) -> "X402AsyncClient":
        """
        Create an httpx async client that handles 402 Payment Required responses.

        Args:
            signer: Signer created by create_signer()
            max_amount: Maximum amount to pay per request (e.g., '0.50')
            facilitator: Custom facilitator URL
            verify: Verify payment with facilitator before sending (default: True)
            timeout: Request timeout in seconds

        Returns:
            X402AsyncClient that wraps httpx

        Example:
            >>> signer = create_signer('base', os.environ['PRIVATE_KEY'])
            >>> async with x402_httpx(signer, max_amount='0.50') as client:
            ...     response = await client.get('https://example.com/api/paywall')
        """
        return X402AsyncClient(
            signer=signer,
            max_amount=max_amount,
            facilitator=facilitator or DEFAULT_FACILITATOR,
            verify=verify,
            timeout=timeout
        )

    class X402AsyncClient:
        """An httpx async client that automatically handles 402 Payment Required."""

        def __init__(
            self,
            signer: Signer,
            max_amount: str,
            facilitator: str = DEFAULT_FACILITATOR,
            verify: bool = True,
            timeout: Optional[float] = None
        ):
            if not max_amount:
                raise ValueError(
                    "max_amount is required. Specify the maximum amount you are "
                    "willing to pay per request (e.g., max_amount='0.50')"
                )

            self.signer = signer
            self.max_amount = float(max_amount)
            self.facilitator = facilitator
            self.should_verify = verify
            self.timeout = timeout
            self._client = httpx.AsyncClient(timeout=timeout)

        async def request(
            self,
            method: str,
            url: str,
            **kwargs
        ) -> httpx.Response:
            """Make an async request with automatic 402 handling."""
            logger.debug(f"Async request to {url}")

            # Make initial request
            response = await self._client.request(method, url, **kwargs)

            # If not 402, return as-is
            if response.status_code != 402:
                logger.debug(f"Response {response.status_code} - no payment required")
                return response

            logger.debug("Got 402 Payment Required")

            # Parse payment requirements
            payment_required_header = response.headers.get("payment-required")
            if not payment_required_header:
                raise PaymentError("402 response missing PAYMENT-REQUIRED header")

            try:
                payment_required = json.loads(base64_decode(payment_required_header))
            except Exception as e:
                raise PaymentError(f"Failed to parse PAYMENT-REQUIRED header: {e}")

            requirements = parse_payment_requirements(payment_required)

            # Get token decimals and validate amount
            web3 = self.signer.get_web3()
            decimals = get_token_decimals(web3, requirements.asset)
            amount = int(requirements.max_amount_required) / (10 ** decimals)

            if amount > self.max_amount:
                raise PaymentError(
                    f"Payment amount {amount} exceeds maxAmount {self.max_amount}",
                    code="AMOUNT_EXCEEDED"
                )

            # Create payment
            payment = create_payment(self.signer, requirements, self.facilitator)

            # Verify payment asynchronously
            if self.should_verify:
                await verify_payment_async(payment, requirements, self.facilitator)

            # Retry with payment header (x402 v2 uses PAYMENT-SIGNATURE)
            payment_header = base64_encode(json.dumps(payment))
            headers = dict(kwargs.get("headers", {}))
            headers["PAYMENT-SIGNATURE"] = payment_header
            kwargs["headers"] = headers

            return await self._client.request(method, url, **kwargs)

        async def get(self, url: str, **kwargs) -> httpx.Response:
            return await self.request("GET", url, **kwargs)

        async def post(self, url: str, **kwargs) -> httpx.Response:
            return await self.request("POST", url, **kwargs)

        async def put(self, url: str, **kwargs) -> httpx.Response:
            return await self.request("PUT", url, **kwargs)

        async def patch(self, url: str, **kwargs) -> httpx.Response:
            return await self.request("PATCH", url, **kwargs)

        async def delete(self, url: str, **kwargs) -> httpx.Response:
            return await self.request("DELETE", url, **kwargs)

        async def aclose(self):
            await self._client.aclose()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            await self.aclose()

except ImportError:
    # httpx not installed - that's fine, it's optional
    x402_httpx = None
    X402AsyncClient = None
