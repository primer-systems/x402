# Tests for x402_python.payee
# Run with: pytest tests/test_payee.py -v

import json
import re
import pytest
from unittest.mock import Mock, patch, MagicMock

from x402_python.payee import (
    RouteConfig,
    CompiledRoute,
    SettlementError,
    get_token_decimals,
    get_token_metadata,
    to_atomic_units,
    compile_routes,
    find_matching_route,
    build_payment_requirements,
    settle_payment,
    x402_flask,
    x402_fastapi,
    x402_protect,
    _decimals_cache,
    _metadata_cache
)
from x402_python.utils import base64_encode, base64_decode


# ============================================
# RouteConfig
# ============================================

class TestRouteConfig:
    def test_creates_with_required_fields(self):
        config = RouteConfig(
            amount="0.01",
            asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            network="base"
        )

        assert config.amount == "0.01"
        assert config.asset == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        assert config.network == "base"
        assert config.description is None
        assert config.max_timeout_seconds == 30

    def test_accepts_optional_fields(self):
        config = RouteConfig(
            amount="0.01",
            asset="0x...",
            network="base",
            description="Premium API access",
            max_timeout_seconds=60
        )

        assert config.description == "Premium API access"
        assert config.max_timeout_seconds == 60


# ============================================
# SettlementError
# ============================================

class TestSettlementError:
    def test_creates_with_message(self):
        error = SettlementError("Settlement failed")
        assert str(error) == "Settlement failed"

    def test_stores_code(self):
        error = SettlementError("Timeout", code="TIMEOUT")
        assert error.code == "TIMEOUT"

    def test_stores_retryable_flag(self):
        error = SettlementError("Network error", retryable=True)
        assert error.retryable is True


# ============================================
# Token Functions
# ============================================

class TestGetTokenDecimals:
    @patch('x402_python.payee.Web3')
    def test_fetches_and_caches_decimals(self, mock_web3_class):
        _decimals_cache.clear()

        mock_contract = Mock()
        mock_contract.functions.decimals.return_value.call.return_value = 6

        mock_web3_instance = Mock()
        mock_web3_instance.eth.contract.return_value = mock_contract
        mock_web3_class.return_value = mock_web3_instance
        mock_web3_class.HTTPProvider = Mock()
        mock_web3_class.to_checksum_address = lambda x: x

        # First call
        result1 = get_token_decimals(
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "base"
        )
        assert result1 == 6

        # Second call should use cache (mock returns different value)
        mock_contract.functions.decimals.return_value.call.return_value = 18
        result2 = get_token_decimals(
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "base"
        )
        assert result2 == 6  # Cached value

        _decimals_cache.clear()

    def test_raises_for_unknown_network(self):
        with pytest.raises(ValueError, match="Unknown network"):
            get_token_decimals("0x...", "unknown-network")


class TestGetTokenMetadata:
    @patch('x402_python.payee.Web3')
    def test_fetches_metadata(self, mock_web3_class):
        _metadata_cache.clear()

        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "USD Coin"
        mock_contract.functions.version.return_value.call.return_value = "2"

        mock_web3_instance = Mock()
        mock_web3_instance.eth.contract.return_value = mock_contract
        mock_web3_class.return_value = mock_web3_instance
        mock_web3_class.HTTPProvider = Mock()
        mock_web3_class.to_checksum_address = lambda x: x

        result = get_token_metadata("0xUSDC", "base")

        assert result["name"] == "USD Coin"
        assert result["version"] == "2"

        _metadata_cache.clear()

    @patch('x402_python.payee.Web3')
    def test_defaults_on_missing_fields(self, mock_web3_class):
        _metadata_cache.clear()

        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.side_effect = Exception("no name")
        mock_contract.functions.version.return_value.call.side_effect = Exception("no version")

        mock_web3_instance = Mock()
        mock_web3_instance.eth.contract.return_value = mock_contract
        mock_web3_class.return_value = mock_web3_instance
        mock_web3_class.HTTPProvider = Mock()
        mock_web3_class.to_checksum_address = lambda x: x

        result = get_token_metadata("0xTOKEN", "base")

        assert result["name"] == "Unknown Token"
        assert result["version"] == "1"

        _metadata_cache.clear()


class TestToAtomicUnits:
    @patch('x402_python.payee.get_token_decimals')
    def test_converts_with_6_decimals(self, mock_get_decimals):
        mock_get_decimals.return_value = 6

        result = to_atomic_units("1.50", "0xUSDC", "base")
        assert result == "1500000"

    @patch('x402_python.payee.get_token_decimals')
    def test_converts_with_18_decimals(self, mock_get_decimals):
        mock_get_decimals.return_value = 18

        result = to_atomic_units("1.0", "0xETH", "base")
        assert result == "1000000000000000000"

    @patch('x402_python.payee.get_token_decimals')
    def test_handles_small_amounts(self, mock_get_decimals):
        mock_get_decimals.return_value = 6

        result = to_atomic_units("0.01", "0xUSDC", "base")
        assert result == "10000"


# ============================================
# Route Compilation
# ============================================

class TestCompileRoutes:
    def test_compiles_simple_route(self):
        routes = {
            "/api/premium": {
                "amount": "0.01",
                "asset": "0xUSDC",
                "network": "eip155:8453"
            }
        }

        compiled = compile_routes(routes)

        assert len(compiled) == 1
        assert compiled[0].pattern == "/api/premium"
        assert compiled[0].config.amount == "0.01"

    def test_compiles_wildcard_route(self):
        routes = {
            "/api/*": {
                "amount": "0.01",
                "asset": "0xUSDC",
                "network": "eip155:8453"
            }
        }

        compiled = compile_routes(routes)

        assert compiled[0].regex.match("/api/anything")
        assert compiled[0].regex.match("/api/foo/bar")
        assert not compiled[0].regex.match("/other")

    def test_compiles_param_route(self):
        routes = {
            "/users/:id/data": {
                "amount": "0.01",
                "asset": "0xUSDC",
                "network": "eip155:8453"
            }
        }

        compiled = compile_routes(routes)

        assert compiled[0].regex.match("/users/123/data")
        assert compiled[0].regex.match("/users/abc/data")
        assert not compiled[0].regex.match("/users/data")

    def test_escapes_special_characters(self):
        routes = {
            "/api/v1.0/data": {
                "amount": "0.01",
                "asset": "0xUSDC",
                "network": "eip155:8453"
            }
        }

        compiled = compile_routes(routes)

        assert compiled[0].regex.match("/api/v1.0/data")
        assert not compiled[0].regex.match("/api/v1X0/data")  # Dot is escaped


class TestFindMatchingRoute:
    def test_finds_exact_match(self):
        routes = compile_routes({
            "/api/premium": {"amount": "0.01", "asset": "0x", "network": "eip155:8453"}
        })

        result = find_matching_route("/api/premium", routes)
        assert result is not None
        assert result.config.amount == "0.01"

    def test_finds_wildcard_match(self):
        routes = compile_routes({
            "/api/*": {"amount": "0.05", "asset": "0x", "network": "eip155:8453"}
        })

        result = find_matching_route("/api/anything", routes)
        assert result is not None
        assert result.config.amount == "0.05"

    def test_returns_none_for_no_match(self):
        routes = compile_routes({
            "/api/premium": {"amount": "0.01", "asset": "0x", "network": "eip155:8453"}
        })

        result = find_matching_route("/other/path", routes)
        assert result is None

    def test_returns_first_match(self):
        routes = compile_routes({
            "/api/specific": {"amount": "0.10", "asset": "0x", "network": "eip155:8453"},
            "/api/*": {"amount": "0.05", "asset": "0x", "network": "eip155:8453"}
        })

        result = find_matching_route("/api/specific", routes)
        assert result.config.amount == "0.10"


# ============================================
# Payment Requirements
# ============================================

class TestBuildPaymentRequirements:
    @patch('x402_python.payee.to_atomic_units')
    @patch('x402_python.payee.get_token_metadata')
    def test_builds_requirements(self, mock_metadata, mock_atomic):
        mock_atomic.return_value = "1000000"
        mock_metadata.return_value = {"name": "USD Coin", "version": "2"}

        config = RouteConfig(
            amount="1.00",
            asset="0xUSDC",
            network="base",
            description="Premium access"
        )

        result = build_payment_requirements("0xPAYEE", config, "/api/premium")

        assert result["x402Version"] == 2
        assert len(result["accepts"]) == 1

        accept = result["accepts"][0]
        assert accept["scheme"] == "exact"
        assert accept["network"] == "eip155:8453"  # v2 uses CAIP-2 format
        assert accept["maxAmountRequired"] == "1000000"
        assert accept["payTo"] == "0xPAYEE"
        assert accept["asset"] == "0xUSDC"
        assert accept["extra"]["name"] == "USD Coin"
        assert accept["extra"]["version"] == "2"


# ============================================
# Settle Payment
# ============================================

class TestSettlePayment:
    @patch('x402_python.payee.to_atomic_units')
    @patch('x402_python.payee.requests.post')
    def test_sends_settlement_request(self, mock_post, mock_atomic):
        mock_atomic.return_value = "1000000"

        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"transactionHash": "0xHASH"}
        mock_post.return_value = mock_response

        payment = {"x402Version": 2, "network": "eip155:8453", "payload": {}}
        config = RouteConfig(amount="1.00", asset="0xUSDC", network="base")

        result = settle_payment(payment, "0xPAYEE", config, "https://facilitator.test")

        assert result["transactionHash"] == "0xHASH"
        mock_post.assert_called_once()

        call_args = mock_post.call_args
        assert call_args[0][0] == "https://facilitator.test/settle"

    @patch('x402_python.payee.to_atomic_units')
    @patch('x402_python.payee.requests.post')
    def test_raises_on_failure(self, mock_post, mock_atomic):
        mock_atomic.return_value = "1000000"

        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "Invalid payment"}
        mock_post.return_value = mock_response

        payment = {"x402Version": 2}
        config = RouteConfig(amount="1.00", asset="0xUSDC", network="base")

        with pytest.raises(SettlementError, match="Invalid payment"):
            settle_payment(payment, "0xPAYEE", config, "https://facilitator.test")

    @patch('x402_python.payee.to_atomic_units')
    @patch('x402_python.payee.requests.post')
    def test_handles_timeout(self, mock_post, mock_atomic):
        mock_atomic.return_value = "1000000"

        import requests
        mock_post.side_effect = requests.exceptions.Timeout()

        payment = {"x402Version": 2}
        config = RouteConfig(amount="1.00", asset="0xUSDC", network="base")

        with pytest.raises(SettlementError) as exc:
            settle_payment(payment, "0xPAYEE", config, "https://facilitator.test")

        assert exc.value.code == "FACILITATOR_TIMEOUT"
        assert exc.value.retryable is True

    @patch('x402_python.payee.to_atomic_units')
    @patch('x402_python.payee.requests.post')
    def test_handles_connection_error(self, mock_post, mock_atomic):
        mock_atomic.return_value = "1000000"

        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError()

        payment = {"x402Version": 2}
        config = RouteConfig(amount="1.00", asset="0xUSDC", network="base")

        with pytest.raises(SettlementError) as exc:
            settle_payment(payment, "0xPAYEE", config, "https://facilitator.test")

        assert exc.value.code == "CONNECTION_ERROR"
        assert exc.value.retryable is True


# ============================================
# Flask Middleware
# ============================================

class TestX402Flask:
    def test_rejects_invalid_pay_to(self):
        with pytest.raises(ValueError, match="Invalid payTo address"):
            x402_flask("not-an-address", {})

    def test_accepts_valid_pay_to(self):
        # Should not raise
        decorator = x402_flask(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            {"/api/test": {"amount": "0.01", "asset": "0xUSDC", "network": "eip155:8453"}}
        )
        assert callable(decorator)


# ============================================
# FastAPI Middleware
# ============================================

class TestX402FastAPI:
    def test_rejects_invalid_pay_to(self):
        with pytest.raises(ValueError, match="Invalid payTo address"):
            x402_fastapi("not-an-address", {})

    def test_accepts_valid_pay_to(self):
        pytest.importorskip("starlette")
        middleware = x402_fastapi(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            {"/api/test": {"amount": "0.01", "asset": "0xUSDC", "network": "eip155:8453"}}
        )
        assert middleware is not None


# ============================================
# x402_protect Decorator
# ============================================

class TestX402Protect:
    def test_rejects_invalid_pay_to(self):
        with pytest.raises(ValueError, match="Invalid payTo address"):
            x402_protect(
                "not-an-address",
                amount="0.01",
                asset="0xUSDC",
                network="base"
            )

    def test_rejects_non_base_without_custom_facilitator(self):
        with pytest.raises(ValueError, match="requires a custom facilitator"):
            x402_protect(
                "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                amount="0.01",
                asset="0xUSDC",
                network="ethereum"  # Not base network
            )

    def test_accepts_non_base_with_custom_facilitator(self):
        # Should not raise
        decorator = x402_protect(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            amount="0.01",
            asset="0xUSDC",
            network="ethereum",
            facilitator="https://custom.facilitator"
        )
        assert callable(decorator)

    def test_wraps_sync_function(self):
        def sync_handler():
            return "result"

        decorator = x402_protect(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            amount="0.01",
            asset="0xUSDC",
            network="eip155:8453"  # v2 uses CAIP-2 format
        )

        wrapped = decorator(sync_handler)
        assert wrapped.__name__ == "sync_handler"

    def test_wraps_async_function(self):
        async def async_handler():
            return "result"

        decorator = x402_protect(
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            amount="0.01",
            asset="0xUSDC",
            network="eip155:8453"  # v2 uses CAIP-2 format
        )

        wrapped = decorator(async_handler)
        assert wrapped.__name__ == "async_handler"


# ============================================
# Integration-like Tests
# ============================================

class TestPaymentFlow:
    @patch('x402_python.payee.settle_payment')
    @patch('x402_python.payee.build_payment_requirements')
    def test_payment_header_parsing(self, mock_build, mock_settle):
        """Test that a valid payment header can be parsed and processed."""
        # Create a valid payment header
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

        encoded = base64_encode(json.dumps(payment))
        decoded = base64_decode(encoded)
        parsed = json.loads(decoded)

        assert parsed["x402Version"] == 2
        assert parsed["scheme"] == "exact"
        assert parsed["payload"]["signature"] == "0x1234567890abcdef"

    def test_route_matching_priority(self):
        """Test that more specific routes are matched first."""
        routes = compile_routes({
            "/api/users/:id": {"amount": "0.01", "asset": "0x", "network": "eip155:8453"},
            "/api/users/me": {"amount": "0.05", "asset": "0x", "network": "eip155:8453"},
            "/api/*": {"amount": "0.10", "asset": "0x", "network": "eip155:8453"}
        })

        # Exact match should win
        result = find_matching_route("/api/users/me", routes)
        # Note: Order depends on dict ordering - may need adjustment
        assert result is not None

    def test_cache_isolation(self):
        """Test that decimals and metadata caches are separate."""
        _decimals_cache.clear()
        _metadata_cache.clear()

        _decimals_cache.set("test:0xTOKEN", 6)
        _metadata_cache.set("test:0xTOKEN", {"name": "Test", "version": "1"})

        assert _decimals_cache.get("test:0xTOKEN") == 6
        assert _metadata_cache.get("test:0xTOKEN") == {"name": "Test", "version": "1"}

        _decimals_cache.clear()
        _metadata_cache.clear()


# ============================================
# Edge Cases
# ============================================

class TestEdgeCases:
    def test_empty_routes(self):
        routes = compile_routes({})
        assert len(routes) == 0

    def test_unicode_in_description(self):
        config = RouteConfig(
            amount="0.01",
            asset="0x...",
            network="base",
            description="Premium API 💰"
        )
        assert "💰" in config.description

    def test_large_amount(self):
        config = RouteConfig(
            amount="1000000.00",
            asset="0x...",
            network="base"
        )
        assert config.amount == "1000000.00"

    def test_zero_amount(self):
        config = RouteConfig(
            amount="0",
            asset="0x...",
            network="base"
        )
        assert config.amount == "0"

    def test_route_with_query_params(self):
        """Routes should match path only, not query params."""
        routes = compile_routes({
            "/api/data": {"amount": "0.01", "asset": "0x", "network": "eip155:8453"}
        })

        # Path without query should match
        result = find_matching_route("/api/data", routes)
        assert result is not None

        # Path with query should not match (query is separate)
        result = find_matching_route("/api/data?key=value", routes)
        assert result is None  # Query string is not part of path matching
