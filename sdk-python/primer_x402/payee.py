# Primer x402 - Payee Middleware
# Middleware to charge for API access via x402 payments
# Flask and FastAPI support
# x402 v2 - CAIP-2 network format
# https://primer.systems

import re
import json
from typing import Dict, Any, Optional, List, Callable, Tuple
from dataclasses import dataclass
from functools import wraps

import requests
from web3 import Web3

from .utils import (
    NETWORKS,
    BASE_NETWORKS,
    DEFAULT_FACILITATOR,
    FACILITATOR_TIMEOUT_MS,
    X402_VERSION,
    base64_encode,
    parse_payment_header,
    is_valid_address,
    validate_routes_facilitator,
    get_logger,
    create_bounded_cache,
    to_caip_network,
    get_network_config
)

logger = get_logger("payee")

# Token ABI for fetching metadata
TOKEN_ABI = [
    {
        "name": "name",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}]
    },
    {
        "name": "version",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}]
    },
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint8"}]
    }
]


# Bounded caches to avoid repeated RPC calls (max 100 tokens each)
_decimals_cache = create_bounded_cache(100)
_metadata_cache = create_bounded_cache(100)


@dataclass
class RouteConfig:
    """Configuration for a paid route."""
    amount: str  # Human-readable amount (e.g., '0.01')
    asset: str   # Token address
    network: str  # Network name
    description: Optional[str] = None
    max_timeout_seconds: int = 30


@dataclass
class CompiledRoute:
    """A compiled route pattern for matching."""
    pattern: str
    regex: re.Pattern
    config: RouteConfig


def get_token_decimals(asset: str, network: str) -> int:
    """Fetch token decimals from blockchain (with caching).
    Accepts both CAIP-2 format and legacy network names.
    """
    # Normalize network to CAIP-2 for cache key consistency
    caip_network = network if network.startswith("eip155:") else to_caip_network(network)
    cache_key = f"{caip_network}:{asset}"
    cached = _decimals_cache.get(cache_key)
    if cached is not None:
        return cached

    network_config = get_network_config(network)
    if not network_config:
        raise ValueError(
            f"Unknown network: {network}. "
            f"Supported: {', '.join(NETWORKS.keys())}"
        )

    web3 = Web3(Web3.HTTPProvider(network_config.rpc_url))
    token = web3.eth.contract(
        address=Web3.to_checksum_address(asset),
        abi=TOKEN_ABI
    )

    try:
        decimals = token.functions.decimals().call()
        result = int(decimals)
        _decimals_cache.set(cache_key, result)
        return result
    except Exception as e:
        raise ValueError(f"Failed to fetch decimals for token {asset}: {e}")


def get_token_metadata(asset: str, network: str) -> Dict[str, str]:
    """Fetch token metadata (name, version) from blockchain (with caching).
    Accepts both CAIP-2 format and legacy network names.
    """
    # Normalize network to CAIP-2 for cache key consistency
    caip_network = network if network.startswith("eip155:") else to_caip_network(network)
    cache_key = f"{caip_network}:{asset}"
    cached = _metadata_cache.get(cache_key)
    if cached is not None:
        return cached

    network_config = get_network_config(network)
    if not network_config:
        raise ValueError(
            f"Unknown network: {network}. "
            f"Supported: {', '.join(NETWORKS.keys())}"
        )

    web3 = Web3(Web3.HTTPProvider(network_config.rpc_url))
    token = web3.eth.contract(
        address=Web3.to_checksum_address(asset),
        abi=TOKEN_ABI
    )

    try:
        name = token.functions.name().call()
    except Exception:
        name = "Unknown Token"

    try:
        version = token.functions.version().call()
    except Exception:
        version = "1"

    result = {"name": name, "version": version}
    _metadata_cache.set(cache_key, result)
    return result


def to_atomic_units(amount: str, asset: str, network: str) -> str:
    """Convert human-readable amount to atomic units."""
    decimals = get_token_decimals(asset, network)
    # Convert float string to atomic units
    amount_float = float(amount)
    atomic = int(amount_float * (10 ** decimals))
    return str(atomic)


def compile_routes(routes: Dict[str, Dict[str, Any]]) -> List[CompiledRoute]:
    """
    Compile route patterns for matching.
    Supports wildcards (*) and path params (:param).
    """
    compiled = []
    for pattern, config_dict in routes.items():
        # Escape special regex characters, preserve * and :param
        escaped = pattern
        escaped = re.sub(r'[.+?^${}()|[\]\\]', r'\\\g<0>', escaped)
        escaped = escaped.replace('*', '.*')
        escaped = re.sub(r':[^/]+', '[^/]+', escaped)

        config = RouteConfig(
            amount=config_dict.get("amount", "0"),
            asset=config_dict.get("asset", ""),
            network=config_dict.get("network", "base"),
            description=config_dict.get("description"),
            max_timeout_seconds=config_dict.get("maxTimeoutSeconds", 30)
        )

        compiled.append(CompiledRoute(
            pattern=pattern,
            regex=re.compile(f"^{escaped}$"),
            config=config
        ))

    return compiled


def find_matching_route(
    path: str,
    route_patterns: List[CompiledRoute]
) -> Optional[CompiledRoute]:
    """Find matching route for a path."""
    for route in route_patterns:
        if route.regex.match(path):
            return route
    return None


def build_payment_requirements(
    pay_to: str,
    config: RouteConfig,
    resource: str
) -> Dict[str, Any]:
    """Build payment requirements object for 402 response.
    Returns x402 v2 format with CAIP-2 network identifier.
    """
    # Normalize network to CAIP-2 format
    caip_network = config.network if config.network.startswith("eip155:") else to_caip_network(config.network)

    # Get token metadata
    max_amount_required = to_atomic_units(config.amount, config.asset, config.network)
    token_metadata = get_token_metadata(config.asset, config.network)

    requirement = {
        "scheme": "exact",
        "network": caip_network,  # CAIP-2 format (e.g., 'eip155:8453')
        "maxAmountRequired": max_amount_required,
        "resource": resource,
        "description": config.description or f"Payment of {config.amount} tokens for {resource}",
        "mimeType": "application/json",
        "payTo": pay_to,
        "maxTimeoutSeconds": config.max_timeout_seconds,
        "asset": config.asset,
        "extra": {
            "name": token_metadata["name"],
            "version": token_metadata["version"]
        }
    }

    # Return full x402 v2-compliant response structure
    return {
        "x402Version": X402_VERSION,
        "accepts": [requirement]
    }


def settle_payment(
    payment: Dict[str, Any],
    pay_to: str,
    config: RouteConfig,
    facilitator: str,
    timeout_ms: int = FACILITATOR_TIMEOUT_MS
) -> Dict[str, Any]:
    """Settle payment with facilitator.
    x402 v2 format with CAIP-2 network.
    """
    logger.debug(f"Settling payment with facilitator: {facilitator}")

    # Normalize network to CAIP-2 format
    config_network = config.network if config.network.startswith("eip155:") else to_caip_network(config.network)

    max_amount_required = to_atomic_units(config.amount, config.asset, config.network)

    payload = {
        "x402Version": X402_VERSION,
        "paymentPayload": payment,
        "paymentRequirements": {
            "scheme": "exact",
            "network": payment.get("network", config_network),  # CAIP-2 format
            "maxAmountRequired": max_amount_required,
            "asset": config.asset,
            "payTo": pay_to
        }
    }

    logger.debug(
        f"Settlement payload: network={payload['paymentRequirements']['network']}, "
        f"asset={payload['paymentRequirements']['asset']}, "
        f"amount={payload['paymentRequirements']['maxAmountRequired']}"
    )

    timeout_sec = timeout_ms / 1000

    try:
        response = requests.post(
            f"{facilitator}/settle",
            json=payload,
            timeout=timeout_sec
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", f"Settlement failed: {response.status_code}")
            except Exception:
                error_msg = f"Settlement failed: {response.status_code}"
            logger.debug(f"Settlement failed: {error_msg}")
            raise SettlementError(error_msg)

        result = response.json()
        logger.debug(f"Settlement response: {result}")
        return result

    except requests.exceptions.Timeout:
        logger.debug(f"Settlement timed out after {timeout_ms}ms")
        raise SettlementError(
            f"Facilitator request timed out after {timeout_ms}ms. "
            "The facilitator may be temporarily unavailable - please retry.",
            code="FACILITATOR_TIMEOUT",
            retryable=True
        )
    except requests.exceptions.ConnectionError as e:
        raise SettlementError(
            f"Failed to connect to facilitator: {e}",
            code="CONNECTION_ERROR",
            retryable=True
        )


class SettlementError(Exception):
    """Error during payment settlement."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        retryable: bool = False
    ):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


# ============================================
# Flask Middleware
# ============================================

def x402_flask(
    pay_to: str,
    routes: Dict[str, Dict[str, Any]],
    facilitator: Optional[str] = None
) -> Callable:
    """
    Flask middleware to require x402 payment for routes.

    Args:
        pay_to: Address to receive payments
        routes: Route configuration dict
        facilitator: Custom facilitator URL

    Returns:
        Flask before_request handler

    Example:
        >>> from flask import Flask
        >>> from primer_x402 import x402_flask
        >>>
        >>> app = Flask(__name__)
        >>>
        >>> @app.before_request
        >>> @x402_flask('0xYourAddress', {
        ...     '/api/premium': {
        ...         'amount': '0.01',
        ...         'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        ...         'network': 'base'
        ...     }
        ... })
        >>> def check_payment():
        ...     pass
        >>>
        >>> @app.route('/api/premium')
        >>> def premium():
        ...     return {'data': 'premium content'}
    """
    if not is_valid_address(pay_to):
        raise ValueError(
            f"Invalid payTo address: {pay_to}. "
            "Must be a valid Ethereum address (0x followed by 40 hex characters)."
        )

    fac = facilitator or DEFAULT_FACILITATOR
    validate_routes_facilitator(routes, fac)
    route_patterns = compile_routes(routes)

    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Import Flask here to avoid requiring it when not used
            from flask import request, Response, jsonify

            # Check if route requires payment
            matched_route = find_matching_route(request.path, route_patterns)
            if not matched_route:
                return f(*args, **kwargs)

            logger.debug(f"Flask: Payment required for {request.path}")
            config = matched_route.config

            # Check for payment header
            payment_header = request.headers.get("X-PAYMENT")
            if not payment_header:
                logger.debug("Flask: No X-PAYMENT header, returning 402")
                try:
                    x402_response = build_payment_requirements(pay_to, config, request.path)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        response=json.dumps({}),
                        status=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        content_type="application/json"
                    )
                except Exception as e:
                    return jsonify({"error": str(e)}), 500

            # Parse and validate payment header
            result = parse_payment_header(payment_header)
            if result.error:
                logger.debug(f"Flask: Invalid payment header: {result.error}")
                return jsonify({"error": result.error}), 400

            logger.debug("Flask: Payment header validated, settling with facilitator")

            # Settle payment
            try:
                settlement = settle_payment(result.payment, pay_to, config, fac)
                logger.debug(f"Flask: Settlement successful, txHash: {settlement.get('transactionHash', 'N/A')}")

                # Store settlement result for access in route handler
                request.x402_settlement = settlement

                # Call original handler
                response = f(*args, **kwargs)

                # Add payment response header if it's a Response object
                if isinstance(response, Response):
                    response.headers["X-PAYMENT-RESPONSE"] = base64_encode(json.dumps(settlement))
                    return response

                # If it's a tuple or other, try to handle it
                if isinstance(response, tuple):
                    resp = Response(response[0]) if len(response) > 0 else Response()
                    if len(response) > 1:
                        resp.status_code = response[1]
                    resp.headers["X-PAYMENT-RESPONSE"] = base64_encode(json.dumps(settlement))
                    return resp

                return response

            except Exception as e:
                logger.debug(f"Flask: Settlement failed: {e}")
                try:
                    x402_response = build_payment_requirements(pay_to, config, request.path)
                    x402_response["error"] = str(e)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        response=json.dumps({}),
                        status=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        content_type="application/json"
                    )
                except Exception as req_error:
                    return jsonify({"error": str(req_error)}), 500

        return wrapper
    return decorator


# ============================================
# FastAPI Middleware
# ============================================

def x402_fastapi(
    pay_to: str,
    routes: Dict[str, Dict[str, Any]],
    facilitator: Optional[str] = None
):
    """
    FastAPI middleware to require x402 payment for routes.

    Args:
        pay_to: Address to receive payments
        routes: Route configuration dict
        facilitator: Custom facilitator URL

    Returns:
        FastAPI middleware class

    Example:
        >>> from fastapi import FastAPI
        >>> from primer_x402 import x402_fastapi
        >>>
        >>> app = FastAPI()
        >>>
        >>> app.add_middleware(x402_fastapi(
        ...     '0xYourAddress',
        ...     {
        ...         '/api/premium': {
        ...             'amount': '0.01',
        ...             'asset': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        ...             'network': 'base'
        ...         }
        ...     }
        ... ))
        >>>
        >>> @app.get('/api/premium')
        >>> async def premium():
        ...     return {'data': 'premium content'}
    """
    if not is_valid_address(pay_to):
        raise ValueError(
            f"Invalid payTo address: {pay_to}. "
            "Must be a valid Ethereum address (0x followed by 40 hex characters)."
        )

    fac = facilitator or DEFAULT_FACILITATOR
    validate_routes_facilitator(routes, fac)
    route_patterns = compile_routes(routes)

    # Import Starlette/FastAPI types
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response, JSONResponse

    class X402Middleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            # Check if route requires payment
            matched_route = find_matching_route(request.url.path, route_patterns)
            if not matched_route:
                return await call_next(request)

            logger.debug(f"FastAPI: Payment required for {request.url.path}")
            config = matched_route.config

            # Check for payment header
            payment_header = request.headers.get("x-payment")
            if not payment_header:
                logger.debug("FastAPI: No X-PAYMENT header, returning 402")
                try:
                    x402_response = build_payment_requirements(pay_to, config, request.url.path)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        content=json.dumps({}),
                        status_code=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        media_type="application/json"
                    )
                except Exception as e:
                    return JSONResponse({"error": str(e)}, status_code=500)

            # Parse and validate payment header
            result = parse_payment_header(payment_header)
            if result.error:
                logger.debug(f"FastAPI: Invalid payment header: {result.error}")
                return JSONResponse({"error": result.error}, status_code=400)

            logger.debug("FastAPI: Payment header validated, settling with facilitator")

            # Settle payment
            try:
                settlement = settle_payment(result.payment, pay_to, config, fac)
                logger.debug(f"FastAPI: Settlement successful")

                # Store settlement result in request state
                request.state.x402_settlement = settlement

                # Call route handler
                response = await call_next(request)

                # Add payment response header
                response.headers["X-PAYMENT-RESPONSE"] = base64_encode(json.dumps(settlement))
                return response

            except Exception as e:
                logger.debug(f"FastAPI: Settlement failed: {e}")
                try:
                    x402_response = build_payment_requirements(pay_to, config, request.url.path)
                    x402_response["error"] = str(e)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        content=json.dumps({}),
                        status_code=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        media_type="application/json"
                    )
                except Exception as req_error:
                    return JSONResponse({"error": str(req_error)}, status_code=500)

    return X402Middleware


# ============================================
# Decorator for single route protection
# ============================================

def x402_protect(
    pay_to: str,
    amount: str,
    asset: str,
    network: str = "base",
    facilitator: Optional[str] = None,
    description: Optional[str] = None
):
    """
    Decorator to protect a single Flask/FastAPI route with x402 payment.

    This is a simpler alternative to the middleware for protecting individual routes.

    Args:
        pay_to: Address to receive payments
        amount: Amount to charge (human-readable, e.g., '0.01')
        asset: Token address
        network: Network name
        facilitator: Custom facilitator URL
        description: Optional description

    Example (Flask):
        >>> @app.route('/api/premium')
        >>> @x402_protect('0xYourAddress', '0.01', '0x...', 'base')
        >>> def premium():
        ...     return {'data': 'premium content'}

    Example (FastAPI):
        >>> @app.get('/api/premium')
        >>> @x402_protect('0xYourAddress', '0.01', '0x...', 'base')
        >>> async def premium():
        ...     return {'data': 'premium content'}
    """
    if not is_valid_address(pay_to):
        raise ValueError(
            f"Invalid payTo address: {pay_to}. "
            "Must be a valid Ethereum address (0x followed by 40 hex characters)."
        )

    fac = facilitator or DEFAULT_FACILITATOR

    # Validate network/facilitator
    if network not in BASE_NETWORKS and fac == DEFAULT_FACILITATOR:
        raise ValueError(
            f'Network "{network}" requires a custom facilitator. '
            f"The default Primer facilitator only supports Base. "
            f"Specify a facilitator URL for your network's facilitator."
        )

    config = RouteConfig(
        amount=amount,
        asset=asset,
        network=network,
        description=description
    )

    def decorator(func: Callable) -> Callable:
        import asyncio

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Flask route
            from flask import request, Response, jsonify

            resource = request.path
            logger.debug(f"x402_protect: Payment required for {resource}")

            payment_header = request.headers.get("X-PAYMENT")
            if not payment_header:
                logger.debug("x402_protect: No X-PAYMENT header, returning 402")
                try:
                    x402_response = build_payment_requirements(pay_to, config, resource)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        response=json.dumps({}),
                        status=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        content_type="application/json"
                    )
                except Exception as e:
                    return jsonify({"error": str(e)}), 500

            result = parse_payment_header(payment_header)
            if result.error:
                return jsonify({"error": result.error}), 400

            try:
                settlement = settle_payment(result.payment, pay_to, config, fac)
                request.x402_settlement = settlement
                response = func(*args, **kwargs)

                if isinstance(response, Response):
                    response.headers["X-PAYMENT-RESPONSE"] = base64_encode(json.dumps(settlement))
                return response

            except Exception as e:
                try:
                    x402_response = build_payment_requirements(pay_to, config, resource)
                    x402_response["error"] = str(e)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        response=json.dumps({}),
                        status=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        content_type="application/json"
                    )
                except Exception as req_error:
                    return jsonify({"error": str(req_error)}), 500

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # FastAPI route (async)
            from starlette.requests import Request
            from starlette.responses import Response, JSONResponse

            # Find the request object in args
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            if not request:
                # Try to get from kwargs
                request = kwargs.get('request')

            if not request:
                raise ValueError("Could not find Request object in route arguments")

            resource = request.url.path
            logger.debug(f"x402_protect: Payment required for {resource}")

            payment_header = request.headers.get("x-payment")
            if not payment_header:
                try:
                    x402_response = build_payment_requirements(pay_to, config, resource)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        content=json.dumps({}),
                        status_code=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        media_type="application/json"
                    )
                except Exception as e:
                    return JSONResponse({"error": str(e)}, status_code=500)

            result = parse_payment_header(payment_header)
            if result.error:
                return JSONResponse({"error": result.error}, status_code=400)

            try:
                settlement = settle_payment(result.payment, pay_to, config, fac)
                request.state.x402_settlement = settlement
                response = await func(*args, **kwargs)
                return response

            except Exception as e:
                try:
                    x402_response = build_payment_requirements(pay_to, config, resource)
                    x402_response["error"] = str(e)
                    encoded = base64_encode(json.dumps(x402_response))
                    return Response(
                        content=json.dumps({}),
                        status_code=402,
                        headers={"PAYMENT-REQUIRED": encoded},
                        media_type="application/json"
                    )
                except Exception as req_error:
                    return JSONResponse({"error": str(req_error)}, status_code=500)

        # Return appropriate wrapper based on whether func is async
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
