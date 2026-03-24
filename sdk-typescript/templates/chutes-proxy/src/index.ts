/**
 * Chutes x402 Proxy
 *
 * A pay-per-inference proxy for Bittensor Chutes AI using x402 micropayments.
 * Accepts USDC payments on Base and forwards requests to Chutes API.
 *
 * Deploy to Cloudflare Workers (free tier) or run locally.
 *
 * @see https://primer.systems
 * @see https://chutes.ai
 * @see https://bittensor.com
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Environment bindings (Cloudflare Workers)
type Bindings = {
  CHUTES_API_KEY: string;
  WALLET_ADDRESS: string;
  PRICE_PER_1K_TOKENS?: string;
  NETWORK?: string;
  FACILITATOR_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// USDC on Base (6 decimals)
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_PRICE_PER_1K = '0.001'; // $0.001 per 1K tokens
const DEFAULT_FACILITATOR = 'https://x402.primer.systems';
const X402_VERSION = 2;

// Enable CORS for browser clients
app.use('*', cors());

// ============================================
// Health check
// ============================================

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'chutes-x402-proxy',
    description: 'Pay-per-inference proxy for Bittensor Chutes AI',
    endpoints: {
      '/v1/chat/completions': 'OpenAI-compatible chat completions (requires x402 payment)'
    },
    pricing: {
      token: 'USDC',
      network: 'Base',
      pricePerRequest: 'Dynamic based on estimated tokens'
    },
    links: {
      x402: 'https://x402.org',
      chutes: 'https://chutes.ai',
      primer: 'https://primer.systems'
    }
  });
});

// ============================================
// Token estimation
// ============================================

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  // Rough estimate: ~4 characters per token for English text
  const inputText = messages.map(m => m.content || '').join(' ');
  const inputTokens = Math.ceil(inputText.length / 4);

  // Estimate output as roughly equal to input (conservative)
  // Adjust this multiplier based on observed patterns
  const outputTokens = inputTokens;

  return inputTokens + outputTokens;
}

function calculatePrice(tokens: number, pricePerThousand: string): string {
  const price = (tokens / 1000) * parseFloat(pricePerThousand);
  // Minimum price to avoid dust
  const minPrice = 0.0001;
  return Math.max(price, minPrice).toFixed(6);
}

function toAtomicUnits(amount: string, decimals: number = 6): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction).toString();
}

// ============================================
// x402 Payment Handling
// ============================================

function buildPaymentRequirements(
  payTo: string,
  amount: string,
  resource: string
) {
  return {
    x402Version: X402_VERSION,
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453', // Base
      maxAmountRequired: toAtomicUnits(amount),
      resource,
      description: `AI inference via Chutes - estimated cost: $${amount}`,
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: USDC_BASE,
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    }]
  };
}

function base64Encode(str: string): string {
  return btoa(str);
}

function base64Decode(str: string): string {
  return atob(str);
}

async function verifyPayment(
  paymentHeader: string,
  payTo: string,
  amount: string,
  facilitatorUrl: string
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    // Decode payment payload
    const payment = JSON.parse(base64Decode(paymentHeader));

    // Build verification request
    const payload = {
      x402Version: X402_VERSION,
      paymentPayload: payment,
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        maxAmountRequired: toAtomicUnits(amount),
        asset: USDC_BASE,
        payTo
      }
    };

    // Call facilitator to settle
    const response = await fetch(`${facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Settlement failed' }));
      return { success: false, error: error.error || `HTTP ${response.status}` };
    }

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// Main inference endpoint
// ============================================

app.post('/v1/chat/completions', async (c) => {
  // Get configuration from environment
  const chutesApiKey = c.env.CHUTES_API_KEY;
  const walletAddress = c.env.WALLET_ADDRESS;
  const pricePerThousand = c.env.PRICE_PER_1K_TOKENS || DEFAULT_PRICE_PER_1K;
  const facilitatorUrl = c.env.FACILITATOR_URL || DEFAULT_FACILITATOR;

  if (!chutesApiKey || !walletAddress) {
    return c.json({
      error: 'Server misconfigured: missing CHUTES_API_KEY or WALLET_ADDRESS'
    }, 500);
  }

  // Parse request body
  let body: { messages?: Array<{ role: string; content: string }>; model?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  // Estimate tokens and calculate price
  const estimatedTokens = estimateTokens(body.messages);
  const price = calculatePrice(estimatedTokens, pricePerThousand);
  const resource = '/v1/chat/completions';

  // Check for payment header
  const paymentHeader = c.req.header('payment-signature');

  if (!paymentHeader) {
    // Return 402 with payment requirements
    const requirements = buildPaymentRequirements(walletAddress, price, resource);
    const encoded = base64Encode(JSON.stringify(requirements));

    return new Response(JSON.stringify({
      error: 'Payment required',
      estimatedTokens,
      priceUsd: price,
      message: 'Include PAYMENT-SIGNATURE header with signed x402 payment'
    }), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': encoded
      }
    });
  }

  // Verify payment
  const verification = await verifyPayment(
    paymentHeader,
    walletAddress,
    price,
    facilitatorUrl
  );

  if (!verification.success) {
    const requirements = buildPaymentRequirements(walletAddress, price, resource);
    const encoded = base64Encode(JSON.stringify(requirements));

    return new Response(JSON.stringify({
      error: 'Payment verification failed',
      details: verification.error
    }), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': encoded
      }
    });
  }

  // Payment verified - forward to Chutes
  try {
    const chutesResponse = await fetch('https://llm.chutes.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': chutesApiKey
      },
      body: JSON.stringify(body)
    });

    if (!chutesResponse.ok) {
      const error = await chutesResponse.text();
      return c.json({
        error: 'Chutes API error',
        status: chutesResponse.status,
        details: error
      }, 502);
    }

    const data = await chutesResponse.json();

    // Return response with payment receipt
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-RESPONSE': base64Encode(JSON.stringify(verification.result)),
        'X-Estimated-Tokens': estimatedTokens.toString(),
        'X-Price-USD': price
      }
    });
  } catch (error) {
    return c.json({
      error: 'Failed to reach Chutes API',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 502);
  }
});

// ============================================
// Model listing (pass-through to Chutes)
// ============================================

app.get('/v1/models', async (c) => {
  const chutesApiKey = c.env.CHUTES_API_KEY;

  if (!chutesApiKey) {
    return c.json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const response = await fetch('https://llm.chutes.ai/v1/models', {
      headers: { 'X-API-Key': chutesApiKey }
    });

    const data = await response.json();
    return c.json(data);
  } catch {
    return c.json({ error: 'Failed to fetch models' }, 502);
  }
});

export default app;
