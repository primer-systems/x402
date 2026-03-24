"""
Chutes x402 Proxy

A pay-per-inference proxy for Bittensor Chutes AI using x402 micropayments.
Accepts USDC payments on Base and forwards requests to Chutes API.

https://primer.systems
https://chutes.ai
https://bittensor.com
"""

import os
import json
import base64
from typing import List, Optional
from decimal import Decimal

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Chutes x402 Proxy",
    description="Pay-per-inference proxy for Bittensor Chutes AI",
    version="1.0.0"
)

# CORS for browser clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
CHUTES_API_KEY = os.getenv("CHUTES_API_KEY")
WALLET_ADDRESS = os.getenv("WALLET_ADDRESS")
PRICE_PER_1K_TOKENS = os.getenv("PRICE_PER_1K_TOKENS", "0.001")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://x402.primer.systems")

# USDC on Base (6 decimals)
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
X402_VERSION = 2


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    model: Optional[str] = "deepseek-ai/DeepSeek-V3"


def estimate_tokens(messages: List[Message]) -> int:
    """Estimate token count from messages."""
    text = " ".join(m.content for m in messages)
    input_tokens = len(text) // 4  # Rough: ~4 chars per token
    output_tokens = input_tokens  # Assume output ≈ input
    return input_tokens + output_tokens


def calculate_price(tokens: int) -> str:
    """Calculate price in USD."""
    price = Decimal(tokens) / 1000 * Decimal(PRICE_PER_1K_TOKENS)
    min_price = Decimal("0.0001")
    return str(max(price, min_price).quantize(Decimal("0.000001")))


def to_atomic_units(amount: str, decimals: int = 6) -> str:
    """Convert human-readable amount to atomic units."""
    d = Decimal(amount)
    return str(int(d * (10 ** decimals)))


def build_payment_requirements(pay_to: str, amount: str, resource: str) -> dict:
    """Build x402 payment requirements."""
    return {
        "x402Version": X402_VERSION,
        "accepts": [{
            "scheme": "exact",
            "network": "eip155:8453",  # Base
            "maxAmountRequired": to_atomic_units(amount),
            "resource": resource,
            "description": f"AI inference via Chutes - estimated cost: ${amount}",
            "mimeType": "application/json",
            "payTo": pay_to,
            "maxTimeoutSeconds": 60,
            "asset": USDC_BASE,
            "extra": {
                "name": "USD Coin",
                "version": "2"
            }
        }]
    }


async def verify_payment(
    payment_header: str,
    pay_to: str,
    amount: str
) -> dict:
    """Verify payment with facilitator."""
    try:
        payment = json.loads(base64.b64decode(payment_header).decode())

        payload = {
            "x402Version": X402_VERSION,
            "paymentPayload": payment,
            "paymentRequirements": {
                "scheme": "exact",
                "network": "eip155:8453",
                "maxAmountRequired": to_atomic_units(amount),
                "asset": USDC_BASE,
                "payTo": pay_to
            }
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{FACILITATOR_URL}/settle",
                json=payload,
                timeout=30.0
            )

            if response.status_code != 200:
                error = response.json().get("error", f"HTTP {response.status_code}")
                return {"success": False, "error": error}

            return {"success": True, "result": response.json()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/")
async def health():
    """Health check and service info."""
    return {
        "status": "ok",
        "service": "chutes-x402-proxy",
        "description": "Pay-per-inference proxy for Bittensor Chutes AI",
        "endpoints": {
            "/v1/chat/completions": "OpenAI-compatible chat completions (requires x402 payment)"
        },
        "pricing": {
            "token": "USDC",
            "network": "Base",
            "pricePerRequest": "Dynamic based on estimated tokens"
        },
        "links": {
            "x402": "https://x402.org",
            "chutes": "https://chutes.ai",
            "primer": "https://primer.systems"
        }
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """OpenAI-compatible chat completions with x402 payment."""

    if not CHUTES_API_KEY or not WALLET_ADDRESS:
        raise HTTPException(
            status_code=500,
            detail="Server misconfigured: missing CHUTES_API_KEY or WALLET_ADDRESS"
        )

    # Parse request body
    try:
        body = await request.json()
        messages = [Message(**m) for m in body.get("messages", [])]
        model = body.get("model", "deepseek-ai/DeepSeek-V3")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")

    if not messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    # Estimate tokens and calculate price
    estimated_tokens = estimate_tokens(messages)
    price = calculate_price(estimated_tokens)
    resource = "/v1/chat/completions"

    # Check for payment header
    payment_header = request.headers.get("payment-signature")

    if not payment_header:
        # Return 402 with payment requirements
        requirements = build_payment_requirements(WALLET_ADDRESS, price, resource)
        encoded = base64.b64encode(json.dumps(requirements).encode()).decode()

        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment required",
                "estimatedTokens": estimated_tokens,
                "priceUsd": price,
                "message": "Include PAYMENT-SIGNATURE header with signed x402 payment"
            },
            headers={"PAYMENT-REQUIRED": encoded}
        )

    # Verify payment
    verification = await verify_payment(payment_header, WALLET_ADDRESS, price)

    if not verification["success"]:
        requirements = build_payment_requirements(WALLET_ADDRESS, price, resource)
        encoded = base64.b64encode(json.dumps(requirements).encode()).decode()

        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment verification failed",
                "details": verification.get("error")
            },
            headers={"PAYMENT-REQUIRED": encoded}
        )

    # Payment verified - forward to Chutes
    try:
        async with httpx.AsyncClient() as client:
            chutes_response = await client.post(
                "https://llm.chutes.ai/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": CHUTES_API_KEY
                },
                json={
                    "model": model,
                    "messages": [{"role": m.role, "content": m.content} for m in messages]
                },
                timeout=60.0
            )

            if chutes_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Chutes API error: {chutes_response.text}"
                )

            data = chutes_response.json()

            # Return response with payment receipt
            receipt = base64.b64encode(
                json.dumps(verification.get("result", {})).encode()
            ).decode()

            return JSONResponse(
                content=data,
                headers={
                    "PAYMENT-RESPONSE": receipt,
                    "X-Estimated-Tokens": str(estimated_tokens),
                    "X-Price-USD": price
                }
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Chutes API: {e}")


@app.get("/v1/models")
async def list_models():
    """List available models (pass-through to Chutes)."""
    if not CHUTES_API_KEY:
        raise HTTPException(status_code=500, detail="Server misconfigured")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://llm.chutes.ai/v1/models",
                headers={"X-API-Key": CHUTES_API_KEY},
                timeout=30.0
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch models: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
