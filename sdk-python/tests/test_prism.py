"""Tests for Prism module."""

import pytest
from unittest.mock import MagicMock, patch

from primer_x402.prism import (
    PRISM_CONTRACT_ADDRESS,
    PRISM_ABI,
    ERC20_PAYMENT_TYPES,
    PrismPaymentParams,
    get_prism_nonce,
    create_prism_payload,
)


def test_prism_contract_address():
    """Test Prism contract address is correct."""
    assert PRISM_CONTRACT_ADDRESS == "0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86"


def test_prism_abi_has_get_nonce():
    """Test Prism ABI includes getNonce function."""
    get_nonce = next((f for f in PRISM_ABI if f["name"] == "getNonce"), None)
    assert get_nonce is not None
    assert get_nonce["type"] == "function"
    assert get_nonce["stateMutability"] == "view"
    assert len(get_nonce["inputs"]) == 2


def test_prism_abi_has_domain_separator():
    """Test Prism ABI includes DOMAIN_SEPARATOR function."""
    domain_sep = next((f for f in PRISM_ABI if f["name"] == "DOMAIN_SEPARATOR"), None)
    assert domain_sep is not None
    assert domain_sep["type"] == "function"


def test_erc20_payment_types_structure():
    """Test ERC20Payment type definition."""
    assert "ERC20Payment" in ERC20_PAYMENT_TYPES
    fields = ERC20_PAYMENT_TYPES["ERC20Payment"]
    field_names = [f["name"] for f in fields]
    assert field_names == [
        "token",
        "from",
        "to",
        "value",
        "nonce",
        "validAfter",
        "validBefore",
    ]


def test_prism_payment_params_dataclass():
    """Test PrismPaymentParams can be instantiated."""
    params = PrismPaymentParams(
        token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to="0x1234567890123456789012345678901234567890",
        value=1000000,
    )
    assert params.token == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    assert params.to == "0x1234567890123456789012345678901234567890"
    assert params.value == 1000000
    assert params.valid_after is None
    assert params.valid_before is None


def test_prism_payment_params_with_validity():
    """Test PrismPaymentParams with validity window."""
    params = PrismPaymentParams(
        token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to="0x1234567890123456789012345678901234567890",
        value=1000000,
        valid_after=1000,
        valid_before=2000,
    )
    assert params.valid_after == 1000
    assert params.valid_before == 2000


def test_get_prism_nonce():
    """Test get_prism_nonce calls contract correctly."""
    mock_web3 = MagicMock()
    mock_contract = MagicMock()
    mock_web3.eth.contract.return_value = mock_contract
    mock_contract.functions.getNonce.return_value.call.return_value = 42

    nonce = get_prism_nonce(
        mock_web3,
        "0x1234567890123456789012345678901234567890",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    )

    assert nonce == 42
    mock_contract.functions.getNonce.assert_called_once()


def test_create_prism_payload_requires_account():
    """Test create_prism_payload raises error without account."""
    mock_web3 = MagicMock()
    params = PrismPaymentParams(
        token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to="0x1234567890123456789012345678901234567890",
        value=1000000,
    )

    with pytest.raises(ValueError, match="Account is required"):
        create_prism_payload(None, mock_web3, params, "eip155:8453")


def test_create_prism_payload_structure():
    """Test create_prism_payload returns correct structure."""
    from eth_account import Account

    # Create a test account
    test_account = Account.from_key(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
    )

    # Mock web3
    mock_web3 = MagicMock()
    mock_web3.eth.chain_id = 8453
    mock_contract = MagicMock()
    mock_web3.eth.contract.return_value = mock_contract
    mock_contract.functions.getNonce.return_value.call.return_value = 0

    params = PrismPaymentParams(
        token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to="0x1234567890123456789012345678901234567890",
        value=1000000,
        valid_after=1000,
        valid_before=2000,
    )

    payload = create_prism_payload(test_account, mock_web3, params, "eip155:8453")

    # Check top-level structure
    assert payload["x402Version"] == 2
    assert payload["scheme"] == "exact"
    assert payload["network"] == "eip155:8453"

    # Check payload data
    assert "signature" in payload["payload"]
    assert payload["payload"]["signature"].startswith("0x")
    assert "authorization" in payload["payload"]

    # Check authorization
    auth = payload["payload"]["authorization"]
    # Critical: must use "from" not "from_address" for x402 protocol compatibility
    assert "from" in auth, "Authorization must use 'from' key, not 'from_address'"
    assert "from_address" not in auth, "Authorization must not use 'from_address'"
    assert auth["from"] == test_account.address
    assert auth["to"] == "0x1234567890123456789012345678901234567890"
    assert auth["value"] == "1000000"
    assert auth["nonce"] == "0"
    assert auth["validAfter"] == 1000
    assert auth["validBefore"] == 2000


def test_create_prism_payload_default_validity():
    """Test create_prism_payload uses default validity window."""
    from eth_account import Account
    import time

    test_account = Account.from_key(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
    )

    mock_web3 = MagicMock()
    mock_web3.eth.chain_id = 8453
    mock_contract = MagicMock()
    mock_web3.eth.contract.return_value = mock_contract
    mock_contract.functions.getNonce.return_value.call.return_value = 0

    params = PrismPaymentParams(
        token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to="0x1234567890123456789012345678901234567890",
        value=1000000,
    )

    now = int(time.time())
    payload = create_prism_payload(test_account, mock_web3, params, "eip155:8453")

    auth = payload["payload"]["authorization"]
    # validAfter should be now - 60 (within a reasonable range)
    assert auth["validAfter"] >= now - 120
    assert auth["validAfter"] <= now
    # validBefore should be now + 3600 (within a reasonable range)
    assert auth["validBefore"] >= now + 3540
    assert auth["validBefore"] <= now + 3660
