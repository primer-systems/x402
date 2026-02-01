# Primer x402 - Wallet Utilities
# Wallet creation, balance checking, and x402 probing
# https://primer.systems

import os
import json
import requests
from typing import Dict, Any, Optional
from dataclasses import dataclass
from decimal import Decimal

from eth_account import Account
from web3 import Web3

from .utils import (
    NETWORKS,
    DEFAULT_FACILITATOR,
    get_network_config,
    to_caip_network,
    get_logger,
)
from .errors import X402Error, ErrorCodes

logger = get_logger("wallet")

# Enable mnemonic features
Account.enable_unaudited_hdwallet_features()

# Well-known token addresses per network
USDC_ADDRESSES: Dict[str, str] = {
    "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",      # Base
    "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",     # Base Sepolia
    "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",         # Ethereum
    "eip155:11155111": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",  # Sepolia
    "eip155:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",     # Arbitrum
    "eip155:421614": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",    # Arbitrum Sepolia
    "eip155:10": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",        # Optimism
    "eip155:11155420": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",  # Optimism Sepolia
    "eip155:137": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",       # Polygon
    "eip155:80002": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",     # Polygon Amoy
}

# ERC-20 ABI for balance checking
ERC20_ABI = [
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"type": "uint256"}]
    },
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint8"}]
    },
    {
        "name": "symbol",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}]
    }
]


@dataclass
class WalletInfo:
    """Wallet information."""
    address: str
    private_key: str
    mnemonic: str


@dataclass
class BalanceInfo:
    """Token balance information."""
    balance: str
    balance_raw: str
    decimals: int
    token: str
    network: str


@dataclass
class ProbeResult:
    """Result of probing a URL for x402 support."""
    supports_402: bool
    requirements: Optional[Dict[str, Any]]
    status_code: Optional[int]
    error: Optional[str] = None


def create_wallet() -> WalletInfo:
    """
    Create a new random wallet.

    Returns:
        WalletInfo with address, private_key, and mnemonic

    Example:
        >>> wallet = create_wallet()
        >>> print(wallet.address)
        0x...
    """
    account, mnemonic = Account.create_with_mnemonic()

    logger.debug(f"Created new wallet: {account.address}")

    return WalletInfo(
        address=account.address,
        private_key=account.key.hex(),
        mnemonic=mnemonic
    )


def wallet_from_mnemonic(mnemonic: str) -> WalletInfo:
    """
    Restore a wallet from a mnemonic phrase.

    Args:
        mnemonic: 12 or 24 word mnemonic phrase

    Returns:
        WalletInfo with address, private_key, and mnemonic

    Example:
        >>> wallet = wallet_from_mnemonic("word1 word2 ... word12")
    """
    account = Account.from_mnemonic(mnemonic)

    logger.debug(f"Restored wallet from mnemonic: {account.address}")

    return WalletInfo(
        address=account.address,
        private_key=account.key.hex(),
        mnemonic=mnemonic
    )


def get_balance(
    address: str,
    network: str = "base",
    token: str = "USDC"
) -> BalanceInfo:
    """
    Get token balance for an address.

    Args:
        address: Wallet address to check
        network: Network name or CAIP-2 identifier (default: "base")
        token: Token symbol ("USDC", "ETH") or token address (default: "USDC")

    Returns:
        BalanceInfo with balance details

    Example:
        >>> balance = get_balance("0x...", "base", "USDC")
        >>> print(balance.balance)
        100.50
    """
    # Normalize network to CAIP-2
    caip_network = to_caip_network(network)
    network_config = get_network_config(caip_network)

    logger.debug(f"Getting balance for {address} on {caip_network}, token: {token}")

    w3 = Web3(Web3.HTTPProvider(network_config.rpc_url))

    # Handle ETH/native token
    if token.upper() in ("ETH", "NATIVE"):
        balance_raw = w3.eth.get_balance(address)
        balance = str(Decimal(balance_raw) / Decimal(10 ** 18))

        return BalanceInfo(
            balance=balance,
            balance_raw=str(balance_raw),
            decimals=18,
            token="ETH",
            network=caip_network
        )

    # Resolve token address
    token_address = token
    if token.upper() == "USDC":
        token_address = USDC_ADDRESSES.get(caip_network)
        if not token_address:
            raise X402Error(
                ErrorCodes.UNSUPPORTED_NETWORK,
                f"USDC not configured for network {caip_network}",
                {"network": caip_network, "token": token}
            )

    # Get ERC-20 balance
    token_address = Web3.to_checksum_address(token_address)
    contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)

    balance_raw = contract.functions.balanceOf(address).call()
    decimals = contract.functions.decimals().call()

    try:
        symbol = contract.functions.symbol().call()
    except Exception:
        symbol = token

    balance = str(Decimal(balance_raw) / Decimal(10 ** decimals))

    return BalanceInfo(
        balance=balance,
        balance_raw=str(balance_raw),
        decimals=decimals,
        token=symbol,
        network=caip_network
    )


def x402_probe(url: str) -> ProbeResult:
    """
    Probe a URL to check if it supports x402 payments.

    Args:
        url: URL to probe

    Returns:
        ProbeResult with supports_402, requirements, and status_code

    Example:
        >>> probe = x402_probe("https://api.example.com/paid")
        >>> if probe.supports_402:
        ...     print("Payment required:", probe.requirements)
    """
    logger.debug(f"Probing URL: {url}")

    try:
        response = requests.get(url, headers={"Accept": "application/json"}, timeout=10)
        status_code = response.status_code

        if status_code != 402:
            return ProbeResult(
                supports_402=False,
                requirements=None,
                status_code=status_code
            )

        # Parse payment requirements from header
        payment_header = (
            response.headers.get("x-payment") or
            response.headers.get("payment-required")
        )

        if not payment_header:
            return ProbeResult(
                supports_402=True,
                requirements=None,
                status_code=status_code,
                error="Missing payment requirements header"
            )

        # Decode base64 JSON
        try:
            import base64
            decoded = base64.b64decode(payment_header).decode("utf-8")
            requirements = json.loads(decoded)
        except Exception:
            # Try parsing as plain JSON
            try:
                requirements = json.loads(payment_header)
            except Exception:
                return ProbeResult(
                    supports_402=True,
                    requirements=None,
                    status_code=status_code,
                    error="Could not parse payment requirements"
                )

        logger.debug(f"Found x402 requirements: {requirements}")

        return ProbeResult(
            supports_402=True,
            requirements=requirements,
            status_code=status_code
        )

    except Exception as e:
        logger.debug(f"Probe failed: {e}")

        return ProbeResult(
            supports_402=False,
            requirements=None,
            status_code=None,
            error=str(e)
        )


def get_facilitator_info(facilitator_url: str = DEFAULT_FACILITATOR) -> Dict[str, Any]:
    """
    Get facilitator information.

    Args:
        facilitator_url: Facilitator URL (defaults to Primer facilitator)

    Returns:
        Facilitator info dict

    Raises:
        X402Error: If facilitator cannot be reached
    """
    logger.debug(f"Getting facilitator info from: {facilitator_url}")

    try:
        response = requests.get(f"{facilitator_url}/info", timeout=10)

        if not response.ok:
            raise X402Error(
                ErrorCodes.FACILITATOR_ERROR,
                f"Facilitator returned {response.status_code}",
                {"status_code": response.status_code}
            )

        return response.json()

    except X402Error:
        raise
    except Exception as e:
        raise X402Error(
            ErrorCodes.NETWORK_ERROR,
            f"Failed to reach facilitator: {e}",
            {"url": facilitator_url}
        )


def list_networks():
    """
    List supported networks.

    Returns:
        List of network configurations
    """
    return [
        {
            "name": net.name,
            "caip_id": net.caip_id,
            "legacy_name": net.legacy_name,
            "chain_id": net.chain_id
        }
        for net in NETWORKS.values()
    ]
