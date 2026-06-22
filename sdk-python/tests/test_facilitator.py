"""Tests for facilitator module."""

import pytest

from primer_x402 import (
    PRIMER_FACILITATOR_URL,
    primer_facilitator,
    primer_facilitator_sync,
)


def test_primer_facilitator_url():
    """Test that facilitator URL is correct."""
    assert PRIMER_FACILITATOR_URL == "https://x402.primer.systems"


def test_primer_facilitator_returns_client():
    """Test that primer_facilitator returns an HTTPFacilitatorClient."""
    from x402.http import HTTPFacilitatorClient

    client = primer_facilitator()
    assert isinstance(client, HTTPFacilitatorClient)


def test_primer_facilitator_sync_returns_client():
    """Test that primer_facilitator_sync returns an HTTPFacilitatorClientSync."""
    from x402.http import HTTPFacilitatorClientSync

    client = primer_facilitator_sync()
    assert isinstance(client, HTTPFacilitatorClientSync)


def test_primer_facilitator_accepts_timeout():
    """Test that primer_facilitator accepts timeout parameter."""
    client = primer_facilitator(timeout=60.0)
    assert client is not None


def test_primer_facilitator_sync_accepts_timeout():
    """Test that primer_facilitator_sync accepts timeout parameter."""
    client = primer_facilitator_sync(timeout=60.0)
    assert client is not None
