"""Prism contract constants.

Contains the contract address, ABI, and EIP-712 type definitions.
"""

from typing import Final

# Prism contract address - same on all supported networks
PRISM_CONTRACT_ADDRESS: Final[str] = "0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86"

# Prism contract ABI (minimal, just what we need)
PRISM_ABI: Final[list] = [
    {
        "name": "getNonce",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {"name": "user", "type": "address"},
            {"name": "token", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "DOMAIN_SEPARATOR",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "bytes32"}],
    },
]

# EIP-712 type definitions for Prism ERC20Payment
ERC20_PAYMENT_TYPES: Final[dict] = {
    "ERC20Payment": [
        {"name": "token", "type": "address"},
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
    ],
}
