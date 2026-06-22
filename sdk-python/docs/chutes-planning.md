# Chutes Integration Planning Document (Python)

## Overview

Chutes is Bittensor Subnet 64 - a decentralized AI inference network. It provides OpenAI-compatible API endpoints for various AI models (LLMs, image generation, etc.) running on distributed compute.

The goal is to provide tooling that makes it easy to build **paid AI proxies** - services that wrap Chutes endpoints with x402 micropayments. This enables developers to monetize AI access without managing subscriptions, API keys, or payment infrastructure.

## Target Use Cases

### 1. AI API Monetization
A developer wants to:
- Expose a Chutes-powered chat completion endpoint
- Charge $0.001 per request via x402
- Accept payments on SKALE (gas-free for users)
- Deploy to Railway, Render, or similar platforms

### 2. Pay-Per-Use AI Services
A startup wants to:
- Build an AI-powered tool (summarizer, translator, code assistant)
- Charge users per usage without requiring accounts
- Use Primer's facilitator for payment settlement

### 3. Multi-Model Gateway
An enterprise wants to:
- Offer access to multiple AI models through a single endpoint
- Price different models differently
- Track usage and revenue

## Functional Requirements

### Template Generation

The SDK should provide a way to scaffold a new Chutes proxy project via CLI:

```bash
primer-x402 create chutes-proxy my-project
```

The generated project should include:

1. **Web server setup** - Pre-configured FastAPI application
2. **x402 payment middleware** - Protecting specified routes with payment requirements
3. **Chutes proxy logic** - Forwarding requests to Chutes API with proper authentication
4. **Configuration** - Environment variables for:
   - Chutes API key
   - Payment recipient address
   - Pricing per endpoint
   - Network selection (Base, SKALE, etc.)
5. **Dockerfile** - Ready for container deployment

### Supported Endpoints

The template should support proxying these Chutes endpoints:

| Endpoint | Description | Suggested Default Price |
|----------|-------------|------------------------|
| `/v1/chat/completions` | Chat/conversation completions | $0.001 |
| `/v1/completions` | Text completions | $0.001 |
| `/v1/embeddings` | Text embeddings | $0.0001 |
| `/v1/images/generations` | Image generation | $0.01 |

### Payment Configuration

Each protected endpoint should be configurable with:
- **Price** - Amount to charge (e.g., "$0.001" or raw token amount)
- **Network** - Which chain to accept payment on
- **Recipient** - Wallet address to receive payments
- **Asset** - Which token to accept (USDC by default)

### Deployment Targets

The template should be deployable to:
- Docker containers (primary target)
- Railway, Render, Fly.io
- Any platform supporting Python ASGI apps
- Kubernetes

## Non-Functional Requirements

### Developer Experience
- Single command to scaffold: `primer-x402 create chutes-proxy my-project`
- Generated code should be readable and modifiable
- Clear README with setup instructions
- Type hints throughout

### Performance
- Async throughout (FastAPI + httpx)
- Streaming support for chat completions
- Minimal memory footprint

### Security
- API keys stored in environment variables only
- No secrets in generated code
- CORS configured appropriately

## Integration with Primer SDK

The generated template should use:

| From `primer_x402` | Purpose |
|--------------------|---------|
| `primer_facilitator()` | Payment verification and settlement |
| `skale_networks` | Gas-free network identifiers |
| `skale_rpc_urls` | RPC endpoints for SKALE chains |

And from the official x402 SDK:

| From `x402` | Purpose |
|-------------|---------|
| Payment middleware | Route protection |
| Client utilities | Making paid requests (for testing) |

## Example User Flow

1. Developer runs: `primer-x402 create chutes-proxy my-ai-api`
2. Project is created with all necessary files
3. Developer edits config:
   - Adds their Chutes API key
   - Sets their wallet address as recipient
   - Adjusts pricing if desired
4. Developer deploys via Docker
5. Users make requests to the proxy:
   - First request returns 402 with payment requirements
   - User signs payment with their wallet
   - Request is retried with payment header
   - Proxy verifies payment via Primer facilitator
   - Proxy forwards request to Chutes
   - Response is returned to user
   - Payment is settled on-chain

## Out of Scope (v1)

- Usage tracking/analytics dashboard
- Rate limiting beyond x402
- Multi-tenant/multi-key support
- Automatic pricing based on token count
- WebSocket streaming endpoints
- Model-specific pricing rules

## Success Criteria

1. A developer can go from zero to deployed paid AI proxy in under 10 minutes
2. The generated code requires minimal modification (just config)
3. Works out of the box with Primer facilitator
4. Supports the most common Chutes endpoints
5. Has clear documentation and examples

## Python-Specific Considerations

- Use FastAPI for async support and automatic OpenAPI docs
- Use httpx for async HTTP client
- Use Pydantic for request/response validation
- Support both sync and async patterns where appropriate
- Include uvicorn as the ASGI server
