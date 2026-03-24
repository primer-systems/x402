# Chutes x402 Proxy (Python)

A pay-per-inference proxy for [Bittensor Chutes](https://chutes.ai/) AI using x402 micropayments.

This proxy wraps the Chutes API and adds x402 payment support, allowing anyone to pay for AI inference with USDC (no subscription required).

## How It Works

```
Client Request
     ↓
[This Proxy] ←── Returns HTTP 402 + payment requirements
     ↓
Client signs x402 payment (USDC on Base)
     ↓
[This Proxy] ←── Verifies payment via Primer Facilitator
     ↓
[Chutes API] ←── Forwards request
     ↓
Response returned to client
```

## Prerequisites

1. **Chutes API Key** - Sign up at [chutes.ai](https://chutes.ai/) ($3/month base tier)
2. **Wallet Address** - Where you'll receive USDC payments
3. **Python 3.9+**

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
CHUTES_API_KEY=cpk_your_key_here
WALLET_ADDRESS=0xYourWalletAddress
PRICE_PER_1K_TOKENS=0.001
```

### 3. Run locally

```bash
uvicorn main:app --reload --port 8000
```

Server starts at `http://localhost:8000`

### 4. Test it

```bash
# Should return 402 Payment Required
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Deployment

### Docker

```bash
docker build -t chutes-x402-proxy .
docker run -p 8000:8000 --env-file .env chutes-x402-proxy
```

### fly.io

```bash
fly launch
fly secrets set CHUTES_API_KEY=cpk_xxx WALLET_ADDRESS=0x...
fly deploy
```

### Railway / Render

Connect your Git repo and set environment variables in the dashboard.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CHUTES_API_KEY` | Your Chutes API key | Required |
| `WALLET_ADDRESS` | Address to receive payments | Required |
| `PRICE_PER_1K_TOKENS` | USD price per 1K tokens | `0.001` |
| `FACILITATOR_URL` | x402 facilitator | `https://x402.primer.systems` |

## API Endpoints

### `GET /`
Health check. Returns service info and available endpoints.

### `POST /v1/chat/completions`
OpenAI-compatible chat completions endpoint.

**Without payment**: Returns HTTP 402 with x402 payment requirements.

**With valid x402 payment**: Forwards to Chutes and returns response.

## Pricing Model

The proxy estimates token count from the request and charges accordingly:

- Input tokens: ~4 characters per token
- Output estimate: Assumes output = input length
- Price: `(estimated_tokens / 1000) * PRICE_PER_1K_TOKENS`

Adjust `PRICE_PER_1K_TOKENS` to set your margin above Chutes' cost.

## Limitations

**Streaming not supported**: This template does not handle `stream: true` requests. Streaming complicates payment because the final token count is unknown until completion. Options for streaming support:
- Flat-rate pricing per request
- Price based on `max_tokens` parameter
- Post-payment settlement (requires trust/escrow)

**Token estimation is approximate**: The 4 chars/token heuristic and output=input assumption are rough estimates. For production, consider using tiktoken or similar.

## For Clients

To pay for this API, use any x402-compatible client:

### Using x402 CLI
```bash
x402 pay https://your-proxy.fly.dev/v1/chat/completions --max-amount 0.01
```

### Using x402 SDK (Python)
```python
from primer_x402 import create_signer, x402_httpx
import httpx
import os

signer = create_signer('base', os.environ['PRIVATE_KEY'])
client = x402_httpx(httpx.Client(), signer, max_amount='0.01')

response = client.post(
    'https://your-proxy.fly.dev/v1/chat/completions',
    json={
        'model': 'deepseek-ai/DeepSeek-V3',
        'messages': [{'role': 'user', 'content': 'Hello!'}]
    }
)
print(response.json())
```

## Links

- [x402 Protocol](https://x402.org)
- [Primer Systems](https://primer.systems)
- [Chutes AI](https://chutes.ai)
- [Bittensor](https://bittensor.com)

## License

MIT
