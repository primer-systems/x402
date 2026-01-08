# Tests for x402_python.testing
# Run with: pytest tests/

import json
import time
import pytest
import requests

from x402_python.utils import parse_payment_header
from x402_python.testing import (
    create_mock_facilitator,
    create_test_payment,
    create_test_402_response,
    TEST_ADDRESSES,
    USDC_ADDRESSES,
    sample_route_config,
    sample_402_response_body,
    sample_payment_payload
)


# ============================================
# Fixtures
# ============================================

class TestFixtures:
    def test_exports_test_addresses(self):
        assert TEST_ADDRESSES is not None
        assert "payer" in TEST_ADDRESSES
        assert "payee" in TEST_ADDRESSES
        # Validate address format
        assert TEST_ADDRESSES["payer"].startswith("0x")
        assert len(TEST_ADDRESSES["payer"]) == 42

    def test_exports_usdc_addresses_for_supported_networks(self):
        assert "base" in USDC_ADDRESSES
        assert "base-sepolia" in USDC_ADDRESSES
        # Validate address format
        assert USDC_ADDRESSES["base"].startswith("0x")
        assert len(USDC_ADDRESSES["base"]) == 42

    def test_exports_sample_route_config(self):
        config = sample_route_config()
        assert config is not None
        assert "/api/premium" in config
        assert config["/api/premium"]["amount"] == "0.01"

    def test_exports_sample_402_response_body(self):
        response = sample_402_response_body()
        assert response is not None
        assert response["x402Version"] == 2
        assert isinstance(response["accepts"], list)

    def test_exports_sample_payment_payload(self):
        payload = sample_payment_payload()
        assert payload is not None
        assert payload["x402Version"] == 2
        assert payload["scheme"] == "exact"


# ============================================
# createTestPayment
# ============================================

class TestCreateTestPayment:
    def test_creates_a_valid_base64_payment_header(self):
        header = create_test_payment()
        assert isinstance(header, str)
        # Should be base64 decodable
        import base64
        base64.b64decode(header)

    def test_creates_parseable_payment_header(self):
        header = create_test_payment()
        result = parse_payment_header(header)
        assert result.error is None
        assert result.payment is not None
        assert result.payment["x402Version"] == 2
        assert result.payment["scheme"] == "exact"

    def test_uses_default_test_addresses(self):
        header = create_test_payment()
        result = parse_payment_header(header)
        assert result.payment["payload"]["authorization"]["from"] == TEST_ADDRESSES["payer"]
        assert result.payment["payload"]["authorization"]["to"] == TEST_ADDRESSES["payee"]

    def test_accepts_custom_amount(self):
        header = create_test_payment(amount="50000")
        result = parse_payment_header(header)
        assert result.payment["payload"]["authorization"]["value"] == "50000"

    def test_accepts_custom_addresses(self):
        custom_from = "0x1111111111111111111111111111111111111111"
        custom_to = "0x2222222222222222222222222222222222222222"
        header = create_test_payment(from_address=custom_from, to_address=custom_to)
        result = parse_payment_header(header)
        assert result.payment["payload"]["authorization"]["from"] == custom_from
        assert result.payment["payload"]["authorization"]["to"] == custom_to

    def test_accepts_custom_network(self):
        header = create_test_payment(network="base-sepolia")
        result = parse_payment_header(header)
        assert result.payment["network"] == "eip155:84532"  # v2 uses CAIP-2 format

    def test_sets_valid_time_window(self):
        header = create_test_payment(valid_for_seconds=7200)
        result = parse_payment_header(header)
        now = int(time.time())
        valid_before = int(result.payment["payload"]["authorization"]["validBefore"])
        # Should be approximately 2 hours from now
        assert valid_before > now + 7000
        assert valid_before < now + 7400


# ============================================
# createTest402Response
# ============================================

class TestCreateTest402Response:
    def test_creates_valid_402_response_structure(self):
        response = create_test_402_response()
        assert response["x402Version"] == 2
        assert isinstance(response["accepts"], list)
        assert len(response["accepts"]) == 1

    def test_includes_required_fields(self):
        response = create_test_402_response()
        accept = response["accepts"][0]
        assert accept["scheme"] == "exact"
        assert "network" in accept
        assert "maxAmountRequired" in accept
        assert "payTo" in accept
        assert "asset" in accept

    def test_accepts_custom_options(self):
        response = create_test_402_response(
            amount="50000",
            network="base-sepolia",
            resource="/api/custom"
        )
        accept = response["accepts"][0]
        assert accept["maxAmountRequired"] == "50000"
        assert accept["network"] == "eip155:84532"  # v2 uses CAIP-2 format
        assert accept["resource"] == "/api/custom"


# ============================================
# createMockFacilitator
# ============================================

class TestCreateMockFacilitator:
    @pytest.fixture(autouse=True)
    def setup_and_teardown(self):
        """Setup and teardown for each test."""
        self.mock = None
        yield
        if self.mock:
            self.mock.close()

    def test_starts_server_on_available_port(self):
        self.mock = create_mock_facilitator()
        assert self.mock.port > 0
        assert self.mock.url == f"http://127.0.0.1:{self.mock.port}"

    def test_starts_server_on_specified_port(self):
        self.mock = create_mock_facilitator(port=19402)
        assert self.mock.port == 19402

    def test_approves_payments_in_approve_mode(self):
        self.mock = create_mock_facilitator(mode="approve")

        response = requests.post(
            f"{self.mock.url}/settle",
            json={
                "x402Version": 2,
                "paymentPayload": {"payload": {"authorization": {"from": "0xabc"}}},
                "paymentRequirements": {"network": "eip155:8453"}
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "transaction" in data

    def test_rejects_payments_in_reject_mode(self):
        self.mock = create_mock_facilitator(mode="reject")

        response = requests.post(
            f"{self.mock.url}/settle",
            json={
                "x402Version": 2,
                "paymentPayload": {},
                "paymentRequirements": {}
            }
        )

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "error" in data

    def test_supports_custom_handler(self):
        def custom_handler(payload):
            if payload.get("paymentRequirements", {}).get("maxAmountRequired") == "999":
                return {"success": False, "error": "Custom rejection"}
            return {"success": True, "transaction": "0xcustom", "custom": True}

        self.mock = create_mock_facilitator(mode="custom", handler=custom_handler)

        # Test approval
        res1 = requests.post(
            f"{self.mock.url}/settle",
            json={"paymentRequirements": {"maxAmountRequired": "100"}}
        )
        data1 = res1.json()
        assert data1["success"] is True
        assert data1["custom"] is True

        # Test rejection
        res2 = requests.post(
            f"{self.mock.url}/settle",
            json={"paymentRequirements": {"maxAmountRequired": "999"}}
        )
        data2 = res2.json()
        assert data2["success"] is False
        assert data2["error"] == "Custom rejection"

    def test_tracks_requests(self):
        self.mock = create_mock_facilitator()
        assert len(self.mock.requests) == 0

        requests.post(
            f"{self.mock.url}/settle",
            json={"test": "data"}
        )

        assert len(self.mock.requests) == 1
        assert self.mock.requests[0].payload["test"] == "data"
        assert self.mock.last_request().payload["test"] == "data"

    def test_clears_requests(self):
        self.mock = create_mock_facilitator()

        requests.post(
            f"{self.mock.url}/settle",
            json={"test": "data"}
        )

        assert len(self.mock.requests) == 1
        self.mock.clear_requests()
        assert len(self.mock.requests) == 0

    def test_returns_404_for_unknown_endpoints(self):
        self.mock = create_mock_facilitator()

        response = requests.get(f"{self.mock.url}/unknown")
        assert response.status_code == 404

    def test_adds_latency_when_configured(self):
        self.mock = create_mock_facilitator(latency_ms=100)

        start = time.time()
        requests.post(
            f"{self.mock.url}/settle",
            json={}
        )
        elapsed_ms = (time.time() - start) * 1000

        assert elapsed_ms >= 90  # Allow some timing variance
