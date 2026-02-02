# xClaw02 - Testing Utilities
# Tools to help test x402 integrations without real payments
# https://primer.systems
#
# Usage:
#   from xclaw02.testing import (
#       create_mock_facilitator,
#       create_test_payment,
#       create_test_402_response,
#       TEST_ADDRESSES,
#       USDC_ADDRESSES
#   )

from .mock_facilitator import create_mock_facilitator, MockFacilitator
from .test_payment import create_test_payment, create_test_402_response
from .fixtures import (
    TEST_ADDRESSES,
    USDC_ADDRESSES,
    sample_route_config,
    sample_402_response_body,
    sample_payment_payload
)

__all__ = [
    # Mock facilitator server
    "create_mock_facilitator",
    "MockFacilitator",

    # Test payment generators
    "create_test_payment",
    "create_test_402_response",

    # Pre-built test data
    "TEST_ADDRESSES",
    "USDC_ADDRESSES",
    "sample_route_config",
    "sample_402_response_body",
    "sample_payment_payload",
]
