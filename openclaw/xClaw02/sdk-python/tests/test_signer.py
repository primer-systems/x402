# Tests for xclaw02.signer
# Run with: pytest tests/

import re
import pytest

from xclaw02 import create_signer, Signer, NETWORKS


# Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


# ============================================
# Signer Creation
# ============================================

class TestCreateSigner:
    def test_creates_signer_for_base_network(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)
        assert signer is not None
        assert signer.get_address() == TEST_ADDRESS

    def test_creates_signer_for_base_sepolia_network(self):
        signer = create_signer("base-sepolia", TEST_PRIVATE_KEY)
        assert signer is not None
        assert signer.get_address() == TEST_ADDRESS

    def test_get_network_returns_correct_info_for_base(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)
        network = signer.get_network()
        assert network.name == "eip155:8453"  # v2 uses CAIP-2 format
        assert network.chain_id == 8453

    def test_get_network_returns_correct_info_for_base_sepolia(self):
        signer = create_signer("base-sepolia", TEST_PRIVATE_KEY)
        network = signer.get_network()
        assert network.name == "eip155:84532"  # v2 uses CAIP-2 format
        assert network.chain_id == 84532

    def test_address_property(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)
        assert signer.address == TEST_ADDRESS

    def test_chain_id_property(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)
        assert signer.chain_id == 8453


class TestSignerInvalidInputs:
    def test_throws_for_unsupported_network(self):
        with pytest.raises(ValueError, match="Invalid network"):
            create_signer("unsupported-network", TEST_PRIVATE_KEY)

    def test_throws_for_invalid_private_key_format(self):
        with pytest.raises(ValueError):
            create_signer("base", "not-a-valid-key")

    def test_accepts_private_key_without_0x_prefix(self):
        # eth_account should handle keys without 0x prefix
        key_without_prefix = TEST_PRIVATE_KEY[2:]
        signer = create_signer("base", key_without_prefix)
        assert signer.get_address() == TEST_ADDRESS


class TestSignerCustomRPC:
    def test_accepts_custom_rpc_url(self):
        signer = create_signer(
            "base",
            TEST_PRIVATE_KEY,
            rpc_url="https://custom-rpc.example.com"
        )
        assert signer is not None


# ============================================
# signTypedData
# ============================================

class TestSignTypedData:
    def test_signs_eip712_typed_data(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)

        domain = {
            "name": "Test",
            "version": "1",
            "chainId": 8453,
            "verifyingContract": "0x0000000000000000000000000000000000000001"
        }

        types = {
            "Message": [
                {"name": "content", "type": "string"}
            ]
        }

        message = {
            "content": "Hello, world!"
        }

        signature = signer.sign_typed_data(domain, types, message, "Message")

        # Signature should be a hex string starting with 0x
        assert re.match(r"^0x[a-fA-F0-9]+$", signature)
        # EIP-712 signatures are 65 bytes = 130 hex chars + 0x prefix
        assert len(signature) == 132

    def test_produces_consistent_signatures_for_same_input(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)

        domain = {
            "name": "Test",
            "version": "1",
            "chainId": 8453,
            "verifyingContract": "0x0000000000000000000000000000000000000001"
        }

        types = {
            "Message": [{"name": "content", "type": "string"}]
        }

        message = {"content": "Hello"}

        sig1 = signer.sign_typed_data(domain, types, message, "Message")
        sig2 = signer.sign_typed_data(domain, types, message, "Message")

        assert sig1 == sig2

    def test_produces_different_signatures_for_different_messages(self):
        signer = create_signer("base", TEST_PRIVATE_KEY)

        domain = {
            "name": "Test",
            "version": "1",
            "chainId": 8453,
            "verifyingContract": "0x0000000000000000000000000000000000000001"
        }

        types = {
            "Message": [{"name": "content", "type": "string"}]
        }

        sig1 = signer.sign_typed_data(domain, types, {"content": "Hello"}, "Message")
        sig2 = signer.sign_typed_data(domain, types, {"content": "World"}, "Message")

        assert sig1 != sig2


# ============================================
# NETWORKS constant
# ============================================

class TestNetworksConstant:
    def test_exports_networks_object(self):
        assert NETWORKS is not None
        assert isinstance(NETWORKS, dict)

    def test_contains_expected_networks(self):
        assert "eip155:8453" in NETWORKS      # Base (CAIP-2)
        assert "eip155:84532" in NETWORKS     # Base Sepolia (CAIP-2)

    def test_each_network_has_required_properties(self):
        for name, config in NETWORKS.items():
            assert hasattr(config, "chain_id")
            assert isinstance(config.chain_id, int)
            assert hasattr(config, "rpc_url")
            assert isinstance(config.rpc_url, str)
