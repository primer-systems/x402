# Chutes x402 Proxy

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
3. **Node.js 18+** or Cloudflare Workers account (for deployment)

## Quick Start

### 1. Install dependencies

```bash
npm install
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
npm run dev
```

Server starts at `http://localhost:8787`

### 4. Test it

```bash
# Should return 402 Payment Required
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Deployment

### Cloudflare Workers (Free)

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Set secrets:
   ```bash
   wrangler secret put CHUTES_API_KEY
   wrangler secret put WALLET_ADDRESS
   ```

3. Deploy:
   ```bash
   npm run deploy
   ```

Your proxy will be live at `https://your-project.your-subdomain.workers.dev`

### Other Platforms

The proxy is a standard Hono app and can run anywhere:
- **Vercel Edge Functions**: `npm run build` then deploy
- **Deno Deploy**: Minor modifications needed
- **Node.js server**: Use `@hono/node-server`

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CHUTES_API_KEY` | Your Chutes API key | Required |
| `WALLET_ADDRESS` | Address to receive payments | Required |
| `PRICE_PER_1K_TOKENS` | USD price per 1K tokens | `0.001` |
| `NETWORK` | Blockchain network | `base` |
| `FACILITATOR_URL` | x402 facilitator | `https://x402.primer.systems` |

## API Endpoints

### `GET /`
Health check. Returns `{ "status": "ok", "service": "chutes-x402-proxy" }`

### `POST /v1/chat/completions`
OpenAI-compatible chat completions endpoint.

**Without payment**: Returns HTTP 402 with x402 payment requirements.

**With valid x402 payment**: Forwards to Chutes and returns response.

Request body (OpenAI format):
```json
{
  "model": "deepseek-ai/DeepSeek-V3",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ]
}
```

## Pricing Model

The proxy estimates token count from the request and charges accordingly:

- Input tokens: ~4 characters per token
- Output estimate: Assumes output ≈ input length
- Price: `(estimated_tokens / 1000) * PRICE_PER_1K_TOKENS`

Adjust `PRICE_PER_1K_TOKENS` to set your margin above Chutes' cost.

## Limitations

**Streaming not supported**: This template does not handle `stream: true` requests. Streaming complicates payment because the final token count is unknown until completion. Options for streaming support:
- Flat-rate pricing per request
- Price based on `max_tokens` parameter
- Post-payment settlement (requires trust/escrow)

**Token estimation is approximate**: The 4 chars/token heuristic and output=input assumption are rough estimates. For production, consider using a proper tokenizer library.

## For Clients

To pay for this API, use any x402-compatible client:

### Using x402 CLI
```bash
npx @primersystems/x402 pay https://your-proxy.workers.dev/v1/chat/completions \
  --max-amount 0.01
```

### Using x402 SDK (Node.js)
```javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');

const signer = await createSigner('base', process.env.PRIVATE_KEY);
const response = await x402Fetch(
  'https://your-proxy.workers.dev/v1/chat/completions',
  signer,
  {
    maxAmount: '0.01',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [{ role: 'user', content: 'Hello!' }]
    })
  }
);

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Using Primer Pay (Browser)
Install the [Primer Pay extension](https://primer.systems/primer-pay) and payments are handled automatically.

## Supported Models

Any model available on Chutes, including:
- `deepseek-ai/DeepSeek-V3`
- `Qwen/Qwen3-235B-A22B`
- `meta-llama/Llama-3.1-70B-Instruct`
- See [chutes.ai](https://chutes.ai/) for full list

## Links

- [x402 Protocol](https://x402.org)
- [Primer Systems](https://primer.systems)
- [Chutes AI](https://chutes.ai)
- [Bittensor](https://bittensor.com)

## License

MIT
