# Tests for x402_python.payer
# Run with: pytest tests/test_payer.py -v

import json
import time
import pytest
from unittest.mock import Mock, patch, MagicMock
from dataclasses import dataclass

from x402_python.payer import (
    PaymentRequirements,
    PaymentError,
    parse_payment_requirements,
    verify_payment,
    get_token_decimals,
    check_eip3009,
    get_token_details,
    fetch_prism_address,
    check_allowance,
    get_prism_nonce,
    generate_random_bytes32,
    create_payment,
    x402_requests,
    X402Session,
    _decimals_cache
)
from x402_python.utils import base64_encode


# ============================================
# PaymentRequirements Parsing
# ============================================

class TestParsePaymentRequirements:
    def test_parses_valid_response(self):
        response = {
            "x402Version": 2,
            "accepts": [{
                "scheme": "exact",
                "network": "eip155:8453",
                "maxAmountRequired": "1000000",
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "payTo": "0x1111111111111111111111111111111111111111"
            }]
        }
        result = parse_payment_requirements(response)

        assert result.scheme == "exact"
        assert result.network == "eip155:8453"  # v2 uses CAIP-2 format
        assert result.max_amount_required == "1000000"
        assert result.asset == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        assert result.pay_to == "0x1111111111111111111111111111111111111111"

    def test_parses_extra_fields(self):
        response = {
            "x402Version": 2,
            "accepts": [{
                "scheme": "exact",
                "network": "eip155:8453",
                "maxAmountRequired": "1000000",
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "payTo": "0x1111111111111111111111111111111111111111",
                "resource": "/api/premium",
                "extra": {"name": "USD Coin", "version": "2"}
            }]
        }
        result = parse_payment_requirements(response)

        assert result.resource == "/api/premium"
        assert result.extra["name"] == "USD Coin"
        assert result.extra["version"] == "2"

    def test_rejects_missing_x402version(self):
        response = {"accepts": [{}]}
        with pytest.raises(ValueError, match="missing x402Version"):
            parse_payment_requirements(response)

    def test_rejects_empty_accepts(self):
        response = {"x402Version": 2, "accepts": []}
        with pytest.raises(ValueError, match="empty accepts"):
            parse_payment_requirements(response)

    def test_rejects_missing_accepts(self):
        response = {"x402Version": 2}
        with pytest.raises(ValueError, match="empty accepts"):
            parse_payment_requirements(response)

    def test_uses_first_accepts_entry(self):
        response = {
            "x402Version": 2,
            "accepts": [
                {"scheme": "exact", "network": "eip155:8453", "maxAmountRequired": "100"},
                {"scheme": "exact", "network": "ethereum", "maxAmountRequired": "200"}
            ]
        }
        result = parse_payment_requirements(response)
        assert result.network == "eip155:8453"  # v2 uses CAIP-2 format
        assert result.max_amount_required == "100"


# ============================================
# PaymentError
# ============================================

class TestPaymentError:
    def test_creates_with_message(self):
        error = PaymentError("Payment failed")
        assert str(error) == "Payment failed"

    def test_stores_code(self):
        error = PaymentError("Timeout", code="TIMEOUT")
        assert error.code == "TIMEOUT"

    def test_stores_retryable_flag(self):
        error = PaymentError("Network error", retryable=True)
        assert error.retryable is True

    def test_stores_details(self):
        error = PaymentError("Failed", details={"amount": "100"})
        assert error.details["amount"] == "100"


# ============================================
# Verify Payment
# ============================================

class TestVerifyPayment:
    @patch('x402_python.payer.requests.post')
    def test_sends_correct_payload(self, mock_post):
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"success": True}
        mock_post.return_value = mock_response

        payment = {"x402Version": 2, "scheme": "exact", "payload": {}}
        requirements = PaymentRequirements(
            scheme="exact",
            network="base",
            max_amount_required="1000000",
            asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            pay_to="0x1111111111111111111111111111111111111111"
        )

        verify_payment(payment, requirements, "https://facilitator.test")

        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[0][0] == "https://facilitator.test/verify"
        payload = call_args[1]["json"]
        assert payload["x402Version"] == 2
        assert payload["paymentPayload"] == payment
        assert payload["paymentRequirements"]["network"] == "base"

    @patch('x402_python.payer.requests.post')
    def test_raises_on_failure(self, mock_post):
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "Invalid signature"}
        mock_post.return_value = mock_response

        payment = {"x402Version": 2}
        requirements = PaymentRequirements("exact", "base", "100", "0x...", "0x...")

        with pytest.raises(PaymentError, match="Invalid signature"):
            verify_payment(payment, requirements, "https://facilitator.test")

    @patch('x402_python.payer.requests.post')
    def test_handles_timeout(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.Timeout()

        payment = {"x402Version": 2}
        requirements = PaymentRequirements("exact", "base", "100", "0x...", "0x...")

        with pytest.raises(PaymentError) as exc:
            verify_payment(payment, requirements, "https://facilitator.test")

        assert exc.value.code == "FACILITATOR_TIMEOUT"
        assert exc.value.retryable is True

    @patch('x402_python.payer.requests.post')
    def test_handles_connection_error(self, mock_post):
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError()

        payment = {"x402Version": 2}
        requirements = PaymentRequirements("exact", "base", "100", "0x...", "0x...")

        with pytest.raises(PaymentError) as exc:
            verify_payment(payment, requirements, "https://facilitator.test")

        assert exc.value.code == "CONNECTION_ERROR"
        assert exc.value.retryable is True


# ============================================
# Token Functions
# ============================================

class TestGetTokenDecimals:
    @patch('x402_python.payer.Web3')
    def test_caches_results(self, mock_web3_class):
        _decimals_cache.clear()

        mock_contract = Mock()
        mock_contract.functions.decimals.return_value.call.return_value = 6

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        # First call
        result1 = get_token_decimals(mock_web3, "0xTOKEN")
        assert result1 == 6

        # Second call should use cache
        mock_contract.functions.decimals.return_value.call.return_value = 18
        result2 = get_token_decimals(mock_web3, "0xTOKEN")
        assert result2 == 6  # Still cached value

        _decimals_cache.clear()


class TestCheckEip3009:
    @patch('x402_python.payer.Web3')
    def test_returns_true_for_eip3009_token(self, mock_web3_class):
        mock_contract = Mock()
        mock_contract.functions.authorizationState.return_value.call.return_value = False

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = check_eip3009(mock_web3, "0xTOKEN", "0xADDRESS")
        assert result is True

    @patch('x402_python.payer.Web3')
    def test_returns_false_for_non_eip3009_token(self, mock_web3_class):
        mock_contract = Mock()
        mock_contract.functions.authorizationState.return_value.call.side_effect = Exception("not supported")

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = check_eip3009(mock_web3, "0xTOKEN", "0xADDRESS")
        assert result is False


class TestGetTokenDetails:
    @patch('x402_python.payer.Web3')
    @patch('x402_python.payer.check_eip3009')
    def test_returns_token_details(self, mock_check_eip3009, mock_web3_class):
        mock_check_eip3009.return_value = True

        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "USD Coin"
        mock_contract.functions.version.return_value.call.return_value = "2"

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = get_token_details(mock_web3, "0xTOKEN", "0xADDRESS")

        assert result["token_name"] == "USD Coin"
        assert result["token_version"] == "2"
        assert result["is_eip3009"] is True

    @patch('x402_python.payer.Web3')
    @patch('x402_python.payer.check_eip3009')
    def test_defaults_version_to_1(self, mock_check_eip3009, mock_web3_class):
        mock_check_eip3009.return_value = False

        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "Token"
        mock_contract.functions.version.return_value.call.side_effect = Exception("no version")

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = get_token_details(mock_web3, "0xTOKEN", "0xADDRESS")

        assert result["token_version"] == "1"
        assert result["is_eip3009"] is False


# ============================================
# Prism Functions
# ============================================

class TestFetchPrismAddress:
    @patch('x402_python.payer.requests.get')
    def test_fetches_prism_address(self, mock_get):
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "base": {"prism": "0xPRISM"}
        }
        mock_get.return_value = mock_response

        result = fetch_prism_address("base", "https://facilitator.test")
        assert result == "0xPRISM"

    @patch('x402_python.payer.requests.get')
    def test_raises_for_unsupported_network(self, mock_get):
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"base": {"prism": "0x..."}}
        mock_get.return_value = mock_response

        with pytest.raises(PaymentError) as exc:
            fetch_prism_address("unsupported", "https://facilitator.test")
        assert exc.value.code == "UNSUPPORTED_NETWORK"


class TestCheckAllowance:
    @patch('x402_python.payer.Web3')
    def test_returns_allowance(self, mock_web3_class):
        mock_contract = Mock()
        mock_contract.functions.allowance.return_value.call.return_value = 1000000

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = check_allowance(mock_web3, "0xTOKEN", "0xOWNER", "0xSPENDER")
        assert result == 1000000


class TestGetPrismNonce:
    @patch('x402_python.payer.Web3')
    def test_returns_nonce(self, mock_web3_class):
        mock_contract = Mock()
        mock_contract.functions.getNonce.return_value.call.return_value = 5

        mock_web3 = Mock()
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3_class.to_checksum_address = lambda x: x

        result = get_prism_nonce(mock_web3, "0xPRISM", "0xUSER", "0xTOKEN")
        assert result == 5


# ============================================
# Random Bytes
# ============================================

class TestGenerateRandomBytes32:
    def test_returns_hex_string(self):
        result = generate_random_bytes32()
        assert result.startswith("0x")
        assert len(result) == 66  # 0x + 64 hex chars

    def test_returns_unique_values(self):
        results = [generate_random_bytes32() for _ in range(10)]
        assert len(set(results)) == 10  # All unique


# ============================================
# X402Session
# ============================================

class TestX402Session:
    def test_requires_max_amount(self):
        mock_signer = Mock()

        with pytest.raises(ValueError, match="max_amount is required"):
            X402Session(mock_signer, max_amount="")

    def test_stores_configuration(self):
        mock_signer = Mock()
        session = X402Session(
            signer=mock_signer,
            max_amount="0.50",
            facilitator="https://custom.facilitator",
            verify=False,
            timeout=30.0
        )

        assert session.max_amount == 0.50
        assert session.facilitator == "https://custom.facilitator"
        assert session.should_verify is False
        assert session.timeout == 30.0

    @patch('x402_python.payer.requests.Session.request')
    def test_returns_non_402_responses_directly(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        response = session.get("https://example.com")
        assert response.status_code == 200

    @patch('x402_python.payer.requests.Session.request')
    def test_raises_on_missing_payment_required_header(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 402
        mock_response.headers = {}
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        with pytest.raises(PaymentError, match="missing PAYMENT-REQUIRED header"):
            session.get("https://example.com")

    @patch('x402_python.payer.requests.Session.request')
    def test_raises_on_amount_exceeded(self, mock_request):
        # Create 402 response
        payment_required = {
            "x402Version": 2,
            "accepts": [{
                "scheme": "exact",
                "network": "eip155:8453",
                "maxAmountRequired": "10000000",  # 10 USDC (6 decimals)
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "payTo": "0x1111111111111111111111111111111111111111"
            }]
        }

        mock_response = Mock()
        mock_response.status_code = 402
        mock_response.headers = {
            "payment-required": base64_encode(json.dumps(payment_required))
        }
        mock_request.return_value = mock_response

        # Mock web3 and signer
        mock_web3 = Mock()
        mock_contract = Mock()
        mock_contract.functions.decimals.return_value.call.return_value = 6
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3.to_checksum_address = lambda x: x

        mock_signer = Mock()
        mock_signer.get_web3.return_value = mock_web3

        # Clear cache to force fresh lookup
        _decimals_cache.clear()

        session = X402Session(mock_signer, max_amount="0.50")  # Max 0.50 USDC

        with pytest.raises(PaymentError) as exc:
            session.get("https://example.com")

        assert exc.value.code == "AMOUNT_EXCEEDED"
        _decimals_cache.clear()

    def test_context_manager(self):
        mock_signer = Mock()

        with X402Session(mock_signer, max_amount="0.50") as session:
            assert session.max_amount == 0.50


class TestX402Requests:
    def test_creates_session(self):
        mock_signer = Mock()
        session = x402_requests(mock_signer, max_amount="0.50")

        assert isinstance(session, X402Session)
        assert session.max_amount == 0.50


# ============================================
# Create Payment
# ============================================

class TestCreatePayment:
    @patch('x402_python.payer.Web3')
    @patch('x402_python.payer.check_eip3009')
    def test_creates_eip3009_payment(self, mock_check_eip3009, mock_web3_class):
        mock_check_eip3009.return_value = True
        mock_web3_class.to_checksum_address = lambda x: x

        # Mock signer
        mock_network = Mock()
        mock_network.name = "base"
        mock_network.chain_id = 8453

        mock_web3 = Mock()
        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "USD Coin"
        mock_contract.functions.version.return_value.call.return_value = "2"
        mock_web3.eth.contract.return_value = mock_contract

        mock_signer = Mock()
        mock_signer.get_network.return_value = mock_network
        mock_signer.get_address.return_value = "0xADDRESS"
        mock_signer.get_web3.return_value = mock_web3
        mock_signer.sign_typed_data.return_value = "0xSIGNATURE"

        requirements = PaymentRequirements(
            scheme="exact",
            network="base",
            max_amount_required="1000000",
            asset="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            pay_to="0x1111111111111111111111111111111111111111",
            extra={"name": "USD Coin", "version": "2"}
        )

        result = create_payment(mock_signer, requirements, "https://facilitator.test")

        assert result["x402Version"] == 2
        assert result["scheme"] == "exact"
        assert result["network"] == "base"
        assert result["payload"]["signature"] == "0xSIGNATURE"
        assert result["payload"]["authorization"]["from"] == "0xADDRESS"
        assert result["payload"]["authorization"]["to"] == "0x1111111111111111111111111111111111111111"

    @patch('x402_python.payer.Web3')
    @patch('x402_python.payer.fetch_prism_address')
    @patch('x402_python.payer.check_allowance')
    @patch('x402_python.payer.get_prism_nonce')
    @patch('x402_python.payer.check_eip3009')
    def test_creates_erc20_payment(
        self,
        mock_check_eip3009,
        mock_get_prism_nonce,
        mock_check_allowance,
        mock_fetch_prism_address,
        mock_web3_class
    ):
        mock_check_eip3009.return_value = False
        mock_fetch_prism_address.return_value = "0xPRISM"
        mock_check_allowance.return_value = 10**18  # Large allowance
        mock_get_prism_nonce.return_value = 0
        mock_web3_class.to_checksum_address = lambda x: x

        # Mock signer
        mock_network = Mock()
        mock_network.name = "base"
        mock_network.chain_id = 8453

        mock_web3 = Mock()
        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "DAI"
        mock_contract.functions.version.return_value.call.return_value = "1"
        mock_web3.eth.contract.return_value = mock_contract

        mock_signer = Mock()
        mock_signer.get_network.return_value = mock_network
        mock_signer.get_address.return_value = "0xADDRESS"
        mock_signer.get_web3.return_value = mock_web3
        mock_signer.sign_typed_data.return_value = "0xSIGNATURE"

        requirements = PaymentRequirements(
            scheme="exact",
            network="base",
            max_amount_required="1000000000000000000",  # 1 DAI
            asset="0xDAITOKEN",
            pay_to="0xPAYEE"
        )

        result = create_payment(mock_signer, requirements, "https://facilitator.test")

        assert result["x402Version"] == 2
        assert result["payload"]["authorization"]["nonce"] == "0"

    @patch('x402_python.payer.Web3')
    @patch('x402_python.payer.fetch_prism_address')
    @patch('x402_python.payer.check_allowance')
    @patch('x402_python.payer.check_eip3009')
    def test_raises_on_insufficient_allowance(
        self,
        mock_check_eip3009,
        mock_check_allowance,
        mock_fetch_prism_address,
        mock_web3_class
    ):
        mock_check_eip3009.return_value = False
        mock_fetch_prism_address.return_value = "0xPRISM"
        mock_check_allowance.return_value = 100  # Small allowance
        mock_web3_class.to_checksum_address = lambda x: x

        mock_network = Mock()
        mock_network.name = "base"
        mock_network.chain_id = 8453

        mock_web3 = Mock()
        mock_contract = Mock()
        mock_contract.functions.name.return_value.call.return_value = "Token"
        mock_contract.functions.version.return_value.call.return_value = "1"
        mock_web3.eth.contract.return_value = mock_contract

        mock_signer = Mock()
        mock_signer.get_network.return_value = mock_network
        mock_signer.get_address.return_value = "0xADDRESS"
        mock_signer.get_web3.return_value = mock_web3

        requirements = PaymentRequirements(
            scheme="exact",
            network="base",
            max_amount_required="1000000",  # Much more than allowance
            asset="0xTOKEN",
            pay_to="0xPAYEE"
        )

        with pytest.raises(PaymentError) as exc:
            create_payment(mock_signer, requirements, "https://facilitator.test")

        assert exc.value.code == "INSUFFICIENT_ALLOWANCE"


# ============================================
# HTTP Methods
# ============================================

class TestHTTPMethods:
    @patch('x402_python.payer.requests.Session.request')
    def test_get_method(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        session.get("https://example.com")
        mock_request.assert_called_with("GET", "https://example.com")

    @patch('x402_python.payer.requests.Session.request')
    def test_post_method(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        session.post("https://example.com", json={"data": "test"})
        mock_request.assert_called_with("POST", "https://example.com", json={"data": "test"})

    @patch('x402_python.payer.requests.Session.request')
    def test_put_method(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        session.put("https://example.com")
        mock_request.assert_called_with("PUT", "https://example.com")

    @patch('x402_python.payer.requests.Session.request')
    def test_patch_method(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        session.patch("https://example.com")
        mock_request.assert_called_with("PATCH", "https://example.com")

    @patch('x402_python.payer.requests.Session.request')
    def test_delete_method(self, mock_request):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_request.return_value = mock_response

        mock_signer = Mock()
        session = X402Session(mock_signer, max_amount="0.50")

        session.delete("https://example.com")
        mock_request.assert_called_with("DELETE", "https://example.com")
