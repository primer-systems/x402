# Tests for x402_python.utils
# Run with: pytest tests/

import json
import pytest

from x402_python.utils import (
    base64_encode,
    base64_decode,
    parse_payment_header,
    is_valid_address,
    NETWORKS,
    BASE_NETWORKS,
    DEFAULT_FACILITATOR,
    create_bounded_cache,
    BoundedCache
)


# ============================================
# Base64 Encoding/Decoding
# ============================================

class TestBase64:
    def test_encodes_and_decodes_simple_string(self):
        original = "hello world"
        encoded = base64_encode(original)
        decoded = base64_decode(encoded)
        assert decoded == original

    def test_encodes_and_decodes_json(self):
        original = json.dumps({"x402Version": 2, "scheme": "exact"})
        encoded = base64_encode(original)
        decoded = base64_decode(encoded)
        assert decoded == original
        assert json.loads(decoded) == {"x402Version": 2, "scheme": "exact"}

    def test_handles_unicode_characters(self):
        original = "Hello 世界"
        encoded = base64_encode(original)
        decoded = base64_decode(encoded)
        assert decoded == original

    def test_handles_empty_string(self):
        encoded = base64_encode("")
        decoded = base64_decode(encoded)
        assert decoded == ""


# ============================================
# Payment Header Parsing
# ============================================

class TestParsePaymentHeader:
    def create_valid_header(self, overrides=None):
        """Helper to create a valid payment header."""
        payment = {
            "x402Version": 2,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {
                "signature": "0x1234567890abcdef",
                "authorization": {
                    "from": "0x1111111111111111111111111111111111111111",
                    "to": "0x2222222222222222222222222222222222222222",
                    "value": "1000000"
                }
            }
        }
        if overrides:
            payment.update(overrides)
        return base64_encode(json.dumps(payment))

    # Invalid inputs
    def test_rejects_none_header(self):
        result = parse_payment_header(None)
        assert result.payment is None
        assert result.error == "Missing X-PAYMENT header"

    def test_rejects_empty_string(self):
        result = parse_payment_header("")
        assert result.payment is None
        assert result.error == "Missing X-PAYMENT header"

    def test_rejects_invalid_base64(self):
        result = parse_payment_header("not-valid-base64!!!")
        assert result.payment is None
        assert result.error is not None

    def test_rejects_valid_base64_but_invalid_json(self):
        header = base64_encode("not json at all")
        result = parse_payment_header(header)
        assert result.payment is None
        assert "not valid JSON" in result.error

    # Missing required fields
    def test_rejects_missing_x402version(self):
        payment = {"scheme": "exact", "network": "eip155:8453", "payload": {}}
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing x402Version" in result.error

    def test_rejects_unsupported_x402version(self):
        header = self.create_valid_header({"x402Version": 99})
        result = parse_payment_header(header)
        assert "Unsupported x402Version" in result.error

    def test_rejects_missing_scheme(self):
        payment = {"x402Version": 2, "network": "eip155:8453", "payload": {}}
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing scheme" in result.error

    def test_rejects_missing_network(self):
        payment = {"x402Version": 2, "scheme": "exact", "payload": {}}
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing network" in result.error

    def test_rejects_missing_payload(self):
        payment = {"x402Version": 2, "scheme": "exact", "network": "eip155:8453"}
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing payload" in result.error

    def test_rejects_missing_payload_signature(self):
        payment = {
            "x402Version": 2,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {"authorization": {}}
        }
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing payload.signature" in result.error

    def test_rejects_missing_payload_authorization(self):
        payment = {
            "x402Version": 2,
            "scheme": "exact",
            "network": "eip155:8453",
            "payload": {"signature": "0x123"}
        }
        header = base64_encode(json.dumps(payment))
        result = parse_payment_header(header)
        assert "missing payload.authorization" in result.error

    # Valid payments
    def test_accepts_valid_payment_header(self):
        header = self.create_valid_header()
        result = parse_payment_header(header)
        assert result.error is None
        assert result.payment is not None
        assert result.payment["x402Version"] == 2
        assert result.payment["scheme"] == "exact"
        assert result.payment["network"] == "eip155:8453"  # v2 uses CAIP-2 format

    def test_preserves_all_payment_fields(self):
        header = self.create_valid_header()
        result = parse_payment_header(header)
        assert result.payment["payload"]["signature"] == "0x1234567890abcdef"
        assert result.payment["payload"]["authorization"]["from"] == "0x1111111111111111111111111111111111111111"
        assert result.payment["payload"]["authorization"]["value"] == "1000000"


# ============================================
# Address Validation
# ============================================

class TestIsValidAddress:
    def test_accepts_valid_address(self):
        assert is_valid_address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")

    def test_rejects_address_without_0x(self):
        assert not is_valid_address("f39Fd6e51aad88F6F4ce6aB8827279cffFb92266")

    def test_rejects_short_address(self):
        assert not is_valid_address("0xf39Fd6e51aad88F6F4ce6")

    def test_rejects_long_address(self):
        assert not is_valid_address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb922661234")

    def test_rejects_non_hex_characters(self):
        assert not is_valid_address("0xg39Fd6e51aad88F6F4ce6aB8827279cffFb92266")

    def test_rejects_none(self):
        assert not is_valid_address(None)

    def test_rejects_non_string(self):
        assert not is_valid_address(12345)


# ============================================
# Constants
# ============================================

class TestConstants:
    # Base networks (CAIP-2 format)
    def test_networks_contains_base(self):
        assert "eip155:8453" in NETWORKS
        assert NETWORKS["eip155:8453"].chain_id == 8453

    def test_networks_contains_base_sepolia(self):
        assert "eip155:84532" in NETWORKS
        assert NETWORKS["eip155:84532"].chain_id == 84532

    # Ethereum networks (CAIP-2 format)
    def test_networks_contains_ethereum(self):
        assert "eip155:1" in NETWORKS
        assert NETWORKS["eip155:1"].chain_id == 1

    def test_networks_contains_sepolia(self):
        assert "eip155:11155111" in NETWORKS
        assert NETWORKS["eip155:11155111"].chain_id == 11155111

    # Arbitrum networks (CAIP-2 format)
    def test_networks_contains_arbitrum(self):
        assert "eip155:42161" in NETWORKS
        assert NETWORKS["eip155:42161"].chain_id == 42161

    def test_networks_contains_arbitrum_sepolia(self):
        assert "eip155:421614" in NETWORKS
        assert NETWORKS["eip155:421614"].chain_id == 421614

    # Optimism networks (CAIP-2 format)
    def test_networks_contains_optimism(self):
        assert "eip155:10" in NETWORKS
        assert NETWORKS["eip155:10"].chain_id == 10

    def test_networks_contains_optimism_sepolia(self):
        assert "eip155:11155420" in NETWORKS
        assert NETWORKS["eip155:11155420"].chain_id == 11155420

    # Polygon networks (CAIP-2 format)
    def test_networks_contains_polygon(self):
        assert "eip155:137" in NETWORKS
        assert NETWORKS["eip155:137"].chain_id == 137

    def test_networks_contains_polygon_amoy(self):
        assert "eip155:80002" in NETWORKS
        assert NETWORKS["eip155:80002"].chain_id == 80002

    # BASE_NETWORKS (CAIP-2 format)
    def test_base_networks_contains_only_base_networks(self):
        assert "eip155:8453" in BASE_NETWORKS
        assert "eip155:84532" in BASE_NETWORKS
        assert "eip155:1" not in BASE_NETWORKS
        assert "eip155:42161" not in BASE_NETWORKS

    def test_default_facilitator_is_set(self):
        assert DEFAULT_FACILITATOR == "https://x402.primer.systems"


# ============================================
# Bounded Cache
# ============================================

class TestBoundedCache:
    def test_stores_and_retrieves_values(self):
        cache = create_bounded_cache(10)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

    def test_returns_none_for_missing_keys(self):
        cache = create_bounded_cache(10)
        assert cache.get("nonexistent") is None

    def test_has_returns_correct_boolean(self):
        cache = create_bounded_cache(10)
        assert cache.has("key1") is False
        cache.set("key1", "value1")
        assert cache.has("key1") is True

    def test_evicts_oldest_entry_when_at_capacity(self):
        cache = create_bounded_cache(3)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        # Cache is now full: [a, b, c]

        cache.set("d", 4)
        # Should evict 'a': [b, c, d]

        assert cache.get("a") is None
        assert cache.get("b") == 2
        assert cache.get("c") == 3
        assert cache.get("d") == 4

    def test_accessing_key_moves_it_to_most_recent(self):
        cache = create_bounded_cache(3)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)

        # Access 'a' to make it most recent
        cache.get("a")

        # Add new item - should evict 'b' (now oldest)
        cache.set("d", 4)

        assert cache.get("a") == 1  # Still there
        assert cache.get("b") is None  # Evicted
        assert cache.get("c") == 3
        assert cache.get("d") == 4

    def test_clear_removes_all_entries(self):
        cache = create_bounded_cache(10)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None
        assert cache.size() == 0

    def test_size_returns_correct_count(self):
        cache = create_bounded_cache(10)
        assert cache.size() == 0
        cache.set("a", 1)
        assert cache.size() == 1
        cache.set("b", 2)
        assert cache.size() == 2

    def test_updating_existing_key_does_not_increase_size(self):
        cache = create_bounded_cache(10)
        cache.set("a", 1)
        cache.set("a", 2)
        assert cache.size() == 1
        assert cache.get("a") == 2
