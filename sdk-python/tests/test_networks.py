"""Tests for networks module."""

import pytest

from primer_x402 import skale_networks, skale_rpc_urls


def test_skale_base_network():
    """Test SKALE Base mainnet chain ID."""
    assert skale_networks.base == "eip155:1187947933"


def test_skale_base_sepolia_network():
    """Test SKALE Base Sepolia chain ID."""
    assert skale_networks.base_sepolia == "eip155:324705682"


def test_networks_are_caip2_format():
    """Test that network IDs are in CAIP-2 format."""
    import re

    caip2_pattern = r"^eip155:\d+$"
    assert re.match(caip2_pattern, skale_networks.base)
    assert re.match(caip2_pattern, skale_networks.base_sepolia)


def test_networks_are_frozen():
    """Test that skale_networks is immutable."""
    with pytest.raises(Exception):  # FrozenInstanceError
        skale_networks.base = "something_else"


def test_skale_base_rpc_url():
    """Test SKALE Base mainnet RPC URL."""
    assert skale_rpc_urls.base == "https://skale-base.skalenodes.com/v1/base"


def test_skale_base_sepolia_rpc_url():
    """Test SKALE Base Sepolia RPC URL."""
    assert skale_rpc_urls.base_sepolia == "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha"


def test_rpc_urls_are_https():
    """Test that RPC URLs use HTTPS."""
    assert skale_rpc_urls.base.startswith("https://")
    assert skale_rpc_urls.base_sepolia.startswith("https://")


def test_rpc_urls_are_frozen():
    """Test that skale_rpc_urls is immutable."""
    with pytest.raises(Exception):  # FrozenInstanceError
        skale_rpc_urls.base = "something_else"
