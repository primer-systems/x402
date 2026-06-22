"""Primer facilitator configuration.

Provides pre-configured HTTPFacilitatorClient for x402.primer.systems.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    HTTPFacilitatorClientSync,
)

if TYPE_CHECKING:
    from x402.http import AuthProvider

PRIMER_FACILITATOR_URL = "https://x402.primer.systems"


def primer_facilitator(
    *,
    timeout: float = 30.0,
    auth_provider: "AuthProvider | None" = None,
    http_client: Any = None,
) -> HTTPFacilitatorClient:
    """Create an async HTTPFacilitatorClient pre-configured for Primer.

    Args:
        timeout: Request timeout in seconds (default: 30.0)
        auth_provider: Optional authentication provider
        http_client: Optional httpx.AsyncClient to use

    Returns:
        HTTPFacilitatorClient pointing to x402.primer.systems

    Example:
        ```python
        from primer_x402 import primer_facilitator

        facilitator = primer_facilitator()
        result = await facilitator.verify(payload, requirements)
        ```
    """
    config = FacilitatorConfig(
        url=PRIMER_FACILITATOR_URL,
        timeout=timeout,
        auth_provider=auth_provider,
        http_client=http_client,
    )
    return HTTPFacilitatorClient(config)


def primer_facilitator_sync(
    *,
    timeout: float = 30.0,
    auth_provider: "AuthProvider | None" = None,
    http_client: Any = None,
) -> HTTPFacilitatorClientSync:
    """Create a sync HTTPFacilitatorClientSync pre-configured for Primer.

    Args:
        timeout: Request timeout in seconds (default: 30.0)
        auth_provider: Optional authentication provider
        http_client: Optional httpx.Client to use

    Returns:
        HTTPFacilitatorClientSync pointing to x402.primer.systems

    Example:
        ```python
        from primer_x402 import primer_facilitator_sync

        facilitator = primer_facilitator_sync()
        result = facilitator.verify(payload, requirements)
        ```
    """
    config = FacilitatorConfig(
        url=PRIMER_FACILITATOR_URL,
        timeout=timeout,
        auth_provider=auth_provider,
        http_client=http_client,
    )
    return HTTPFacilitatorClientSync(config)
