#!/usr/bin/env python3
"""CLI for scaffolding x402 projects."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ============ EMBEDDED TEMPLATES ============

MAIN_PY = '''"""Chutes AI Proxy with x402 micropayments.

A paid API proxy for Chutes (Bittensor Subnet 64) AI endpoints.
"""

import os
from dataclasses import dataclass, field

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from x402 import x402ResourceServer
from x402.http import (
    x402HTTPResourceServer,
    HTTPRequestContext,
    HTTPAdapter,
    RouteConfig,
    PaymentOption,
)
from primer_x402 import primer_facilitator

# ============ Configuration ============

# Set your wallet address before deploying
RECIPIENT = "0xYOUR_WALLET_ADDRESS"

CHUTES_API_KEY = os.environ.get("CHUTES_API_KEY", "")
CHUTES_BASE_URL = "https://llm.chutes.ai"

# ============ x402 Route Configuration ============

routes = {
    "/v1/chat/completions": RouteConfig(
        accepts=PaymentOption(
            scheme="exact",
            price="$0.001",
            network="eip155:8453",
            pay_to=RECIPIENT,
        )
    ),
    "/v1/completions": RouteConfig(
        accepts=PaymentOption(
            scheme="exact",
            price="$0.001",
            network="eip155:8453",
            pay_to=RECIPIENT,
        )
    ),
    "/v1/embeddings": RouteConfig(
        accepts=PaymentOption(
            scheme="exact",
            price="$0.0001",
            network="eip155:8453",
            pay_to=RECIPIENT,
        )
    ),
    "/v1/images/generations": RouteConfig(
        accepts=PaymentOption(
            scheme="exact",
            price="$0.01",
            network="eip155:8453",
            pay_to=RECIPIENT,
        )
    ),
}

# ============ x402 Server Setup ============

facilitator = primer_facilitator()
resource_server = x402ResourceServer(facilitator)
http_server = x402HTTPResourceServer(resource_server, routes)


# ============ FastAPI HTTP Adapter ============

@dataclass
class FastAPIAdapter:
    """HTTPAdapter implementation for FastAPI Request."""

    request: Request
    body: bytes = field(default=b"")

    def get_method(self) -> str:
        return self.request.method

    def get_path(self) -> str:
        return self.request.url.path

    def get_url(self) -> str:
        return str(self.request.url)

    def get_header(self, name: str) -> str | None:
        return self.request.headers.get(name)

    def get_accept_header(self) -> str:
        return self.request.headers.get("accept", "")

    def get_user_agent(self) -> str:
        return self.request.headers.get("user-agent", "")

    def get_query_param(self, name: str) -> str | list[str] | None:
        return self.request.query_params.get(name)

    def get_query_params(self) -> dict[str, str | list[str]] | None:
        return dict(self.request.query_params)

    def get_body(self) -> bytes:
        return self.body


# ============ FastAPI Application ============

app = FastAPI(title="Chutes AI Proxy", description="Paid AI API powered by x402")


@app.on_event("startup")
async def startup():
    """Initialize x402 server on startup."""
    await http_server.initialize()


@app.middleware("http")
async def x402_middleware(request: Request, call_next):
    """x402 payment middleware for protected routes."""
    path = request.url.path

    # Only protect /v1/* routes
    if not path.startswith("/v1/"):
        return await call_next(request)

    # Read body for adapter (needed for POST requests)
    body = await request.body()
    adapter = FastAPIAdapter(request=request, body=body)

    context = HTTPRequestContext(
        adapter=adapter,
        path=path,
        method=request.method,
        payment_header=request.headers.get("X-PAYMENT"),
    )

    result = await http_server.process_http_request(context)

    if result.type == "no-payment-required":
        return await call_next(request)

    if result.type == "payment-error":
        return JSONResponse(
            status_code=result.response.status if result.response else 402,
            content=result.response.body if result.response else {"error": "Payment required"},
            headers=dict(result.response.headers) if result.response and result.response.headers else {},
        )

    if result.type == "payment-verified":
        # Process the actual request
        response = await call_next(request)

        # Settle payment after successful response
        if result.payment_payload and result.payment_requirements:
            await http_server.process_settlement(
                result.payment_payload,
                result.payment_requirements,
                context=context,
                declared_extensions=result.declared_extensions,
            )

        return response

    # Fallback
    return await call_next(request)


# ============ Chutes Proxy Endpoints ============

@app.api_route("/v1/{path:path}", methods=["GET", "POST"])
async def proxy_to_chutes(request: Request, path: str):
    """Proxy requests to Chutes AI API."""
    if not CHUTES_API_KEY:
        return JSONResponse(
            status_code=500,
            content={"error": "CHUTES_API_KEY not configured"},
        )

    body = await request.body()

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.request(
            method=request.method,
            url=f"{CHUTES_BASE_URL}/v1/{path}",
            content=body,
            headers={
                "Content-Type": request.headers.get("Content-Type", "application/json"),
                "Authorization": f"Bearer {CHUTES_API_KEY}",
                "Accept": request.headers.get("Accept", "application/json"),
            },
        )

        # Handle streaming responses (SSE)
        content_type = response.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            return StreamingResponse(
                response.aiter_bytes(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache"},
            )

        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type=content_type.split(";")[0] if content_type else "application/json",
        )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''

REQUIREMENTS_TXT = '''fastapi>=0.110.0
uvicorn[standard]>=0.27.0
httpx>=0.27.0
primer-x402>=1.0.0
x402>=2.0.0
'''

ENV_EXAMPLE = '''# Chutes API key (get from https://chutes.ai)
CHUTES_API_KEY=your_chutes_api_key_here
'''

GITIGNORE = '''__pycache__/
*.py[cod]
*$py.class
.env
.venv/
venv/
*.egg-info/
dist/
build/
.pytest_cache/
'''

DOCKERFILE = '''FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
'''


def readme_template(name: str) -> str:
    return f'''# {name}

Paid AI proxy powered by [Chutes](https://chutes.ai) (Bittensor Subnet 64) + [x402](https://x402.org) micropayments.

## Setup

```bash
python -m venv venv
source venv/bin/activate  # or `venv\\Scripts\\activate` on Windows
pip install -r requirements.txt
```

Edit `main.py` and set your wallet address:

```python
RECIPIENT = "0xYOUR_WALLET_ADDRESS"
```

Create `.env` from the example:

```bash
cp .env.example .env
# Edit .env with your Chutes API key
```

## Run

```bash
# Load environment variables
export $(cat .env | xargs)  # or use python-dotenv

# Start the server
uvicorn main:app --reload
```

## Endpoints

| Endpoint | Price |
|----------|-------|
| `/v1/chat/completions` | $0.001 |
| `/v1/completions` | $0.001 |
| `/v1/embeddings` | $0.0001 |
| `/v1/images/generations` | $0.01 |

Payments are accepted on Base mainnet (`eip155:8453`) via the Primer facilitator.

## How It Works

1. Client makes request to your proxy
2. Proxy returns 402 Payment Required with x402 payment details
3. Client signs payment with their wallet
4. Client retries request with `X-PAYMENT` header
5. Proxy verifies payment via Primer facilitator
6. Proxy forwards request to Chutes AI
7. Response returned to client
8. Payment settled on-chain

## Docker

```bash
docker build -t {name} .
docker run -p 8000:8000 -e CHUTES_API_KEY=your_key {name}
```

## Customization

- **Pricing**: Edit the `routes` dict in `main.py`
- **Network**: Change `eip155:8453` to another network (e.g., `eip155:1187947933` for SKALE)
- **Endpoints**: Add more routes following the same pattern

## Links

- [x402 Protocol](https://x402.org)
- [Chutes AI](https://chutes.ai)
- [Primer Systems](https://primer.systems)
'''


# ============ CLI Implementation ============

def create_chutes_proxy(name: str) -> None:
    """Create a new Chutes proxy project."""
    project_dir = Path.cwd() / name

    if project_dir.exists():
        print(f"Error: Directory '{name}' already exists", file=sys.stderr)
        sys.exit(1)

    try:
        project_dir.mkdir(parents=True)

        # Write all project files
        (project_dir / "main.py").write_text(MAIN_PY)
        (project_dir / "requirements.txt").write_text(REQUIREMENTS_TXT)
        (project_dir / ".env.example").write_text(ENV_EXAMPLE)
        (project_dir / ".gitignore").write_text(GITIGNORE)
        (project_dir / "Dockerfile").write_text(DOCKERFILE)
        (project_dir / "README.md").write_text(readme_template(name))

        print(f"Created {name}/")
        print()
        print("Next steps:")
        print(f"  cd {name}")
        print("  python -m venv venv")
        print("  source venv/bin/activate  # or venv\\Scripts\\activate on Windows")
        print("  pip install -r requirements.txt")
        print("  # Edit main.py with your wallet address")
        print("  cp .env.example .env")
        print("  # Edit .env with your Chutes API key")
        print("  uvicorn main:app --reload")

    except Exception as e:
        print(f"Error creating project: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="primer-x402",
        description="Primer x402 CLI tools",
    )
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # create command
    create_parser = subparsers.add_parser(
        "create",
        help="Create a new x402 project",
    )
    create_parser.add_argument(
        "type",
        choices=["chutes-proxy"],
        help="Project type to create",
    )
    create_parser.add_argument(
        "name",
        help="Project name (directory will be created)",
    )

    args = parser.parse_args()

    if args.command == "create":
        if args.type == "chutes-proxy":
            create_chutes_proxy(args.name)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
