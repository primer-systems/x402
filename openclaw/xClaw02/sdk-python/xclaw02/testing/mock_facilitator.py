# xClaw02 - Mock Facilitator
# A fake facilitator server for testing x402 integrations
# https://primer.systems

import json
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field


@dataclass
class MockRequest:
    """A recorded request to the mock facilitator."""
    timestamp: float
    payload: Dict[str, Any]


@dataclass
class MockFacilitator:
    """Mock facilitator server instance."""
    url: str
    port: int
    requests: List[MockRequest] = field(default_factory=list)
    _server: HTTPServer = field(default=None, repr=False)
    _thread: threading.Thread = field(default=None, repr=False)

    def close(self):
        """Stop the server."""
        if self._server:
            self._server.shutdown()
        if self._thread:
            self._thread.join(timeout=5)

    def clear_requests(self):
        """Clear recorded requests."""
        self.requests.clear()

    def last_request(self) -> Optional[MockRequest]:
        """Get the last request received."""
        return self.requests[-1] if self.requests else None


def create_mock_facilitator(
    port: int = 0,
    mode: str = "approve",
    handler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
    latency_ms: int = 0
) -> MockFacilitator:
    """
    Create a mock facilitator server for testing.

    Args:
        port: Port to listen on (0 = random available port)
        mode: Behavior mode: 'approve', 'reject', or 'custom'
        handler: Custom handler for 'custom' mode
        latency_ms: Artificial latency to simulate network delay

    Returns:
        MockFacilitator instance

    Example:
        >>> # Basic usage - auto-approve all payments
        >>> mock = create_mock_facilitator(port=3001)
        >>> print(mock.url)  # http://127.0.0.1:3001
        >>>
        >>> # Use with middleware
        >>> middleware = x402_flask(pay_to, routes, facilitator=mock.url)
        >>>
        >>> # Clean up when done
        >>> mock.close()

    Example:
        >>> # Reject all payments
        >>> mock = create_mock_facilitator(mode='reject')

    Example:
        >>> # Custom logic
        >>> def my_handler(payload):
        ...     if int(payload['paymentRequirements']['maxAmountRequired']) > 100000:
        ...         return {'success': False, 'error': 'Amount too high'}
        ...     return {'success': True, 'transaction': '0x...'}
        >>> mock = create_mock_facilitator(mode='custom', handler=my_handler)
    """
    requests: List[MockRequest] = []

    class FacilitatorHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Suppress logging
            pass

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if self.path == "/contracts":
                # Return mock contract addresses
                self._send_json({
                    "base": {"prism": "0x0000000000000000000000000000000000000001"},
                    "base-sepolia": {"prism": "0x0000000000000000000000000000000000000002"},
                    "ethereum": {"prism": "0x0000000000000000000000000000000000000003"},
                    "sepolia": {"prism": "0x0000000000000000000000000000000000000004"},
                    "arbitrum": {"prism": "0x0000000000000000000000000000000000000005"},
                    "optimism": {"prism": "0x0000000000000000000000000000000000000006"},
                    "polygon": {"prism": "0x0000000000000000000000000000000000000007"},
                })
            else:
                self._send_json({"error": "Not found"}, 404)

        def do_POST(self):
            # Add artificial latency
            if latency_ms > 0:
                time.sleep(latency_ms / 1000)

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)

            if self.path == "/settle" or self.path == "/verify":
                try:
                    payload = json.loads(body.decode("utf-8"))
                    requests.append(MockRequest(
                        timestamp=time.time(),
                        payload=payload
                    ))

                    if mode == "approve":
                        response = _create_approval_response(payload)
                    elif mode == "reject":
                        response = _create_rejection_response("Payment rejected by mock facilitator")
                    elif mode == "custom" and handler:
                        response = handler(payload)
                    else:
                        response = _create_approval_response(payload)

                    if response.get("success") is False:
                        self._send_json(response, 400)
                    else:
                        self._send_json(response, 200)

                except json.JSONDecodeError:
                    self._send_json({"success": False, "error": "Invalid JSON"}, 400)
            else:
                self._send_json({"error": "Not found"}, 404)

        def _send_json(self, data: Dict[str, Any], status: int = 200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))

    # Create server
    server = HTTPServer(("127.0.0.1", port), FacilitatorHandler)
    actual_port = server.server_address[1]
    url = f"http://127.0.0.1:{actual_port}"

    # Start in a thread
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    return MockFacilitator(
        url=url,
        port=actual_port,
        requests=requests,
        _server=server,
        _thread=thread
    )


def _create_approval_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a successful approval response."""
    tx_hash = "0x" + "f" * 64  # Fake transaction hash

    payment_req = payload.get("paymentRequirements", {})
    payment_payload = payload.get("paymentPayload", {})
    auth = payment_payload.get("payload", {}).get("authorization", {})

    return {
        "success": True,
        "transaction": tx_hash,
        "network": payment_req.get("network", "base"),
        "payer": auth.get("from", "0x" + "0" * 40)
    }


def _create_rejection_response(reason: str) -> Dict[str, Any]:
    """Create a rejection response."""
    return {
        "success": False,
        "error": reason
    }
