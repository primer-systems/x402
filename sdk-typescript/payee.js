// Primer x402 - Payee Middleware
// Middleware to charge for API access via x402 payments
// x402 v2 - CAIP-2 network format
// https://primer.systems

const { ethers } = require('ethers');
const {
  createDebugLogger,
  createBoundedCache,
  DEFAULT_FACILITATOR,
  FACILITATOR_TIMEOUT_MS,
  X402_VERSION,
  NETWORKS,
  BASE_NETWORKS,
  base64Encode,
  parsePaymentHeader,
  TOKEN_ABI_ETHERS,
  toCaipNetwork,
  getNetworkConfig
} = require('./utils');

const debug = createDebugLogger('payee');

// Bounded caches to avoid repeated RPC calls (max 100 tokens each)
const decimalsCache = createBoundedCache(100);
const tokenMetadataCache = createBoundedCache(100);

/**
 * Validate Ethereum address format
 * @private
 */
function isValidAddress(address) {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if routes use non-Base networks that require a custom facilitator
 * Accepts both CAIP-2 format and legacy network names
 * @private
 */
function validateNetworkFacilitator(routes, facilitator) {
  const nonBaseNetworks = [];
  for (const [path, config] of Object.entries(routes)) {
    if (config.network) {
      // Normalize to CAIP-2 format for comparison
      const caipNetwork = config.network.startsWith('eip155:')
        ? config.network
        : toCaipNetwork(config.network);
      if (!BASE_NETWORKS.includes(caipNetwork)) {
        nonBaseNetworks.push({ path, network: caipNetwork });
      }
    }
  }

  if (nonBaseNetworks.length > 0 && facilitator === DEFAULT_FACILITATOR) {
    const networks = [...new Set(nonBaseNetworks.map(r => r.network))].join(', ');
    throw new Error(
      `Routes use non-Base networks (${networks}) which require a custom facilitator. ` +
      `The default Primer facilitator only supports Base (eip155:8453, eip155:84532). ` +
      `Specify options.facilitator for your network's facilitator.`
    );
  }
}

/**
 * Fetch token metadata (name, version) from blockchain (with caching)
 * Required for EIP-712 domain in the extra field
 * Accepts both CAIP-2 format and legacy network names
 * @private
 */
async function getTokenMetadata(asset, network) {
  // Normalize network to CAIP-2 format for cache key consistency
  const caipNetwork = network.startsWith('eip155:') ? network : toCaipNetwork(network);
  const cacheKey = `${caipNetwork}:${asset}`;
  const cached = tokenMetadataCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const networkConfig = getNetworkConfig(network);
  if (!networkConfig) {
    throw new Error(`Unknown network: ${network}. Supported: ${Object.keys(NETWORKS).join(', ')}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const token = new ethers.Contract(asset, TOKEN_ABI_ETHERS, provider);

  try {
    // Fetch name and version in parallel
    const [name, version] = await Promise.all([
      token.name().catch(() => 'Unknown Token'),
      token.version().catch(() => '1') // Default to '1' if not implemented
    ]);

    const result = { name, version };
    tokenMetadataCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // Fallback if both fail
    const fallback = { name: 'Unknown Token', version: '1' };
    tokenMetadataCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Fetch token decimals from blockchain (with caching)
 * Accepts both CAIP-2 format and legacy network names
 * @private
 */
async function getTokenDecimals(asset, network) {
  // Normalize network to CAIP-2 format for cache key consistency
  const caipNetwork = network.startsWith('eip155:') ? network : toCaipNetwork(network);
  const cacheKey = `${caipNetwork}:${asset}`;
  const cached = decimalsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const networkConfig = getNetworkConfig(network);
  if (!networkConfig) {
    throw new Error(`Unknown network: ${network}. Supported: ${Object.keys(NETWORKS).join(', ')}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const token = new ethers.Contract(asset, TOKEN_ABI_ETHERS, provider);

  try {
    const decimals = await token.decimals();
    const result = Number(decimals);
    decimalsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(`Failed to fetch decimals for token ${asset}: ${error.message}`);
  }
}

/**
 * Convert human-readable amount to atomic units
 * @private
 */
async function toAtomicUnits(amount, asset, network) {
  const decimals = await getTokenDecimals(asset, network);
  return ethers.parseUnits(amount.toString(), decimals).toString();
}

/**
 * Express middleware to require x402 payment for routes
 *
 * @param {string} payTo - Address to receive payments
 * @param {Object} routes - Route configuration { '/path': { amount: '0.01', asset: '0x...', network: 'base' } }
 * @param {Object} options - Options
 * @param {string} options.facilitator - Custom facilitator URL
 * @returns {Function} Express middleware
 *
 * @example
 * const app = express();
 * app.use(x402Express('0xYourAddress', {
 *   '/api/paywall': {
 *     amount: '0.01',           // 0.01 tokens (human-readable)
 *     asset: '0x...',     // token on Base
 *     network: 'base'
 *   }
 * }));
 */
function x402Express(payTo, routes, options = {}) {
  if (!isValidAddress(payTo)) {
    throw new Error(`Invalid payTo address: ${payTo}. Must be a valid Ethereum address (0x followed by 40 hex characters).`);
  }
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;
  validateNetworkFacilitator(routes, facilitator);
  const routePatterns = compileRoutes(routes);

  return async function middleware(req, res, next) {
    // Check if route requires payment
    const matchedRoute = findMatchingRoute(req.path, routePatterns);
    if (!matchedRoute) {
      return next();
    }

    debug('Express: Payment required for %s', req.path);
    const config = matchedRoute.config;

    // Check for payment header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader) {
      debug('Express: No X-PAYMENT header, returning 402');
      // Return 402 with payment requirements via PAYMENT-REQUIRED header (x402 spec)
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, req.path);
        const encoded = base64Encode(JSON.stringify(x402Response));
        return res.status(402).set('PAYMENT-REQUIRED', encoded).end();
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // Parse and validate payment header
    const { payment, error: parseError } = parsePaymentHeader(paymentHeader);
    if (parseError) {
      debug('Express: Invalid payment header: %s', parseError);
      return res.status(400).json({ error: parseError });
    }

    debug('Express: Payment header validated, settling with facilitator');

    // Verify and settle payment
    try {
      const result = await settlePayment(payment, payTo, config, facilitator);
      debug('Express: Settlement successful, txHash: %s', result.transactionHash || 'N/A');

      // Add payment response header
      res.setHeader('X-PAYMENT-RESPONSE', base64Encode(JSON.stringify(result)));

      // Continue to route handler
      next();
    } catch (error) {
      debug('Express: Settlement failed: %s', error.message);
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, req.path);
        x402Response.error = error.message;
        const encoded = base64Encode(JSON.stringify(x402Response));
        return res.status(402).set('PAYMENT-REQUIRED', encoded).end();
      } catch (reqError) {
        return res.status(500).json({ error: reqError.message });
      }
    }
  };
}

/**
 * Hono middleware to require x402 payment for routes
 *
 * @param {string} payTo - Address to receive payments
 * @param {Object} routes - Route configuration
 * @param {Object} options - Options
 * @returns {Function} Hono middleware
 *
 * @example
 * const app = new Hono();
 * app.use('*', x402Hono('0xYourAddress', {
 *   '/api/paywall': { amount: '0.01', asset: '0x...', network: 'base' }
 * }));
 */
function x402Hono(payTo, routes, options = {}) {
  if (!isValidAddress(payTo)) {
    throw new Error(`Invalid payTo address: ${payTo}. Must be a valid Ethereum address (0x followed by 40 hex characters).`);
  }
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;
  validateNetworkFacilitator(routes, facilitator);
  const routePatterns = compileRoutes(routes);

  return async function middleware(c, next) {
    // Check if route requires payment
    const matchedRoute = findMatchingRoute(c.req.path, routePatterns);
    if (!matchedRoute) {
      return await next();
    }

    debug('Hono: Payment required for %s', c.req.path);
    const config = matchedRoute.config;

    // Check for payment header
    const paymentHeader = c.req.header('x-payment');
    if (!paymentHeader) {
      debug('Hono: No X-PAYMENT header, returning 402');
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, c.req.path);
        const encoded = base64Encode(JSON.stringify(x402Response));
        return new Response(null, {
          status: 402,
          headers: { 'PAYMENT-REQUIRED': encoded }
        });
      } catch (error) {
        return c.json({ error: error.message }, 500);
      }
    }

    // Parse and validate payment header
    const { payment, error: parseError } = parsePaymentHeader(paymentHeader);
    if (parseError) {
      debug('Hono: Invalid payment header: %s', parseError);
      return c.json({ error: parseError }, 400);
    }

    debug('Hono: Payment header validated, settling with facilitator');

    // Verify and settle payment
    try {
      const result = await settlePayment(payment, payTo, config, facilitator);
      debug('Hono: Settlement successful');

      c.header('X-PAYMENT-RESPONSE', base64Encode(JSON.stringify(result)));

      await next();
    } catch (error) {
      debug('Hono: Settlement failed: %s', error.message);
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, c.req.path);
        x402Response.error = error.message;
        const encoded = base64Encode(JSON.stringify(x402Response));
        return new Response(null, {
          status: 402,
          headers: { 'PAYMENT-REQUIRED': encoded }
        });
      } catch (reqError) {
        return c.json({ error: reqError.message }, 500);
      }
    }
  };
}

/**
 * Next.js wrapper to require x402 payment for API routes
 * Supports both App Router (Next.js 13+) and Pages Router
 *
 * @param {Function} handler - Next.js API route handler
 * @param {Object} config - Payment configuration { payTo, amount, asset, network }
 * @param {Object} options - Options
 * @returns {Function} Wrapped handler
 *
 * @example App Router (Next.js 13+)
 * // app/api/paywall/route.js
 * import { x402Next } from '@primersystems/x402';
 *
 * async function handler(req) {
 *   return Response.json({ data: 'paywall content' });
 * }
 *
 * export const GET = x402Next(handler, {
 *   payTo: '0xYourAddress',
 *   amount: '0.01',
 *   asset: '0x...',
 *   network: 'base'
 * });
 *
 * @example Pages Router (legacy)
 * // pages/api/paywall.js
 * export default x402Next(
 *   async (req, res) => {
 *     res.json({ data: 'paywall content' });
 *   },
 *   { payTo: '0x...', amount: '0.01', asset: '0x...', network: 'base' }
 * );
 */
function x402Next(handler, config, options = {}) {
  if (!isValidAddress(config.payTo)) {
    throw new Error(`Invalid payTo address: ${config.payTo}. Must be a valid Ethereum address (0x followed by 40 hex characters).`);
  }
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;

  // Normalize network to CAIP-2 format for comparison
  const caipNetwork = config.network.startsWith('eip155:')
    ? config.network
    : toCaipNetwork(config.network);

  // Check if non-Base network requires custom facilitator
  if (config.network && !BASE_NETWORKS.includes(caipNetwork) && facilitator === DEFAULT_FACILITATOR) {
    throw new Error(
      `Network "${caipNetwork}" requires a custom facilitator. ` +
      `The default Primer facilitator only supports Base (eip155:8453, eip155:84532). ` +
      `Specify options.facilitator for your network's facilitator.`
    );
  }

  return async function wrappedHandler(req, resOrContext) {
    // Detect if App Router (req is Request object) or Pages Router (req has headers object)
    const isAppRouter = req instanceof Request || (req.constructor && req.constructor.name === 'Request');

    if (isAppRouter) {
      return handleAppRouter(req, handler, config, facilitator);
    } else {
      return handlePagesRouter(req, resOrContext, handler, config, facilitator);
    }
  };
}

/**
 * Handle App Router (Next.js 13+) requests
 * @private
 */
async function handleAppRouter(req, handler, config, facilitator) {
  const url = new URL(req.url);
  debug('Next.js App Router: Payment required for %s', url.pathname);

  const paymentHeader = req.headers.get('x-payment');

  if (!paymentHeader) {
    debug('Next.js App Router: No X-PAYMENT header, returning 402');
    try {
      const x402Response = await buildPaymentRequirements(config.payTo, config, url.pathname);
      const encoded = base64Encode(JSON.stringify(x402Response));
      return new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': encoded }
      });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // Parse and validate payment header
  const { payment, error: parseError } = parsePaymentHeader(paymentHeader);
  if (parseError) {
    debug('Next.js App Router: Invalid payment header: %s', parseError);
    return Response.json({ error: parseError }, { status: 400 });
  }

  debug('Next.js App Router: Payment header validated, settling with facilitator');

  try {
    const result = await settlePayment(payment, config.payTo, config, facilitator);
    debug('Next.js App Router: Settlement successful');

    // Call original handler and add payment response header
    const response = await handler(req);

    // Clone response to add header
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-PAYMENT-RESPONSE', base64Encode(JSON.stringify(result)));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    debug('Next.js App Router: Settlement failed: %s', error.message);
    try {
      const x402Response = await buildPaymentRequirements(config.payTo, config, url.pathname);
      x402Response.error = error.message;
      const encoded = base64Encode(JSON.stringify(x402Response));
      return new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': encoded }
      });
    } catch (reqError) {
      return Response.json({ error: reqError.message }, { status: 500 });
    }
  }
}

/**
 * Handle Pages Router (legacy) requests
 * @private
 */
async function handlePagesRouter(req, res, handler, config, facilitator) {
  debug('Next.js Pages Router: Payment required for %s', req.url);

  const paymentHeader = req.headers['x-payment'];

  if (!paymentHeader) {
    debug('Next.js Pages Router: No X-PAYMENT header, returning 402');
    try {
      const x402Response = await buildPaymentRequirements(config.payTo, config, req.url);
      const encoded = base64Encode(JSON.stringify(x402Response));
      return res.status(402).setHeader('PAYMENT-REQUIRED', encoded).end();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Parse and validate payment header
  const { payment, error: parseError } = parsePaymentHeader(paymentHeader);
  if (parseError) {
    debug('Next.js Pages Router: Invalid payment header: %s', parseError);
    return res.status(400).json({ error: parseError });
  }

  debug('Next.js Pages Router: Payment header validated, settling with facilitator');

  try {
    const result = await settlePayment(payment, config.payTo, config, facilitator);
    debug('Next.js Pages Router: Settlement successful');

    res.setHeader('X-PAYMENT-RESPONSE', base64Encode(JSON.stringify(result)));

    return await handler(req, res);
  } catch (error) {
    debug('Next.js Pages Router: Settlement failed: %s', error.message);
    try {
      const x402Response = await buildPaymentRequirements(config.payTo, config, req.url);
      x402Response.error = error.message;
      const encoded = base64Encode(JSON.stringify(x402Response));
      return res.status(402).setHeader('PAYMENT-REQUIRED', encoded).end();
    } catch (reqError) {
      return res.status(500).json({ error: reqError.message });
    }
  }
}

/**
 * Build payment requirements object
 * Returns the full x402 v2-compliant response with accepts array
 * Network is normalized to CAIP-2 format
 * @private
 */
async function buildPaymentRequirements(payTo, config, resource) {
  // Validate required fields
  if (!config.amount) {
    throw new Error('amount is required in route config');
  }
  if (!config.asset) {
    throw new Error('asset (token address) is required in route config');
  }
  if (!config.network) {
    throw new Error('network is required in route config');
  }

  // Normalize network to CAIP-2 format
  const caipNetwork = config.network.startsWith('eip155:')
    ? config.network
    : toCaipNetwork(config.network);

  // Fetch token decimals and metadata in parallel
  const [maxAmountRequired, tokenMetadata] = await Promise.all([
    toAtomicUnits(config.amount, config.asset, config.network),
    getTokenMetadata(config.asset, config.network)
  ]);

  // Build the payment requirement object (goes in accepts array)
  // Uses CAIP-2 network format for v2 compatibility
  const requirement = {
    scheme: 'exact',
    network: caipNetwork,  // CAIP-2 format (e.g., 'eip155:8453')
    maxAmountRequired,
    resource,
    description: config.description || `Payment of ${config.amount} tokens for ${resource}`,
    mimeType: 'application/json',
    payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds || 30,
    asset: config.asset,
    // Extra field contains token metadata for EIP-712 domain
    extra: {
      name: tokenMetadata.name,
      version: tokenMetadata.version
    }
  };

  // Return full x402 v2-compliant response structure
  return {
    x402Version: X402_VERSION,
    accepts: [requirement]
  };
}

/**
 * Compile route patterns for matching
 * Escapes special regex characters except * (wildcard) and :param (path params)
 * @private
 */
function compileRoutes(routes) {
  return Object.entries(routes).map(([pattern, config]) => {
    // Escape special regex characters, but preserve * and :param syntax
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars (except *)
      .replace(/\*/g, '.*')                    // Convert * to .*
      .replace(/:[^/]+/g, '[^/]+');            // Convert :param to [^/]+
    return {
      pattern,
      regex: new RegExp('^' + escaped + '$'),
      config
    };
  });
}

/**
 * Find matching route for a path
 * @private
 */
function findMatchingRoute(path, routePatterns) {
  for (const route of routePatterns) {
    if (route.regex.test(path)) {
      return route;
    }
  }
  return null;
}

/**
 * Settle payment with facilitator
 * x402 v2 format with CAIP-2 network
 * @private
 */
async function settlePayment(payment, payTo, config, facilitator, timeoutMs = FACILITATOR_TIMEOUT_MS) {
  debug('Settling payment with facilitator: %s', facilitator);

  // Normalize network to CAIP-2 format
  const configNetwork = config.network.startsWith('eip155:')
    ? config.network
    : toCaipNetwork(config.network);

  // Build full payload for facilitator
  const maxAmountRequired = await toAtomicUnits(config.amount, config.asset, config.network);

  const payload = {
    x402Version: X402_VERSION,
    paymentPayload: payment,
    paymentRequirements: {
      scheme: 'exact',
      network: payment.network || configNetwork,  // CAIP-2 format
      maxAmountRequired,
      asset: config.asset,
      payTo: payTo
    }
  };

  debug('Settlement payload: network=%s, asset=%s, amount=%s',
    payload.paymentRequirements.network,
    payload.paymentRequirements.asset,
    payload.paymentRequirements.maxAmountRequired
  );

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${facilitator}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.json();
      debug('Settlement failed: %s', error.error || response.status);
      throw new Error(error.error || `Settlement failed: ${response.status}`);
    }

    const result = await response.json();
    debug('Settlement response: %O', result);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      debug('Settlement timed out after %dms', timeoutMs);
      const err = new Error(`Facilitator request timed out after ${timeoutMs}ms. The facilitator may be temporarily unavailable - please retry.`);
      err.code = 'FACILITATOR_TIMEOUT';
      err.retryable = true;
      throw err;
    }
    // Network errors are typically retryable
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.cause?.code === 'ECONNREFUSED') {
      error.retryable = true;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Simple wrapper to protect any Express route handler with x402 payment
 * Equivalent to Python's @x402_protect decorator
 *
 * @param {string} payTo - Address to receive payments
 * @param {string} amount - Amount to charge (human-readable, e.g., '0.01')
 * @param {string} asset - Token address
 * @param {string} network - Network name
 * @param {Object} options - Optional settings
 * @param {string} options.facilitator - Custom facilitator URL
 * @param {string} options.description - Description for the payment
 * @returns {Function} Express middleware for a single route
 *
 * @example
 * app.get('/api/premium', x402Protect('0xPayee', '0.01', '0xUSDC', 'base'), (req, res) => {
 *   res.json({ data: 'premium content' });
 * });
 */
function x402Protect(payTo, amount, asset, network, options = {}) {
  if (!isValidAddress(payTo)) {
    throw new Error(`Invalid payTo address: ${payTo}. Must be a valid Ethereum address (0x followed by 40 hex characters).`);
  }

  const facilitator = options.facilitator || DEFAULT_FACILITATOR;

  // Normalize network to CAIP-2 format for comparison
  const caipNetwork = network.startsWith('eip155:') ? network : toCaipNetwork(network);

  // Check if non-Base network requires custom facilitator
  if (network && !BASE_NETWORKS.includes(caipNetwork) && facilitator === DEFAULT_FACILITATOR) {
    throw new Error(
      `Network "${caipNetwork}" requires a custom facilitator. ` +
      `The default Primer facilitator only supports Base (eip155:8453, eip155:84532). ` +
      `Specify options.facilitator for your network's facilitator.`
    );
  }

  const config = {
    amount,
    asset,
    network,
    description: options.description
  };

  return async function protectedHandler(req, res, next) {
    debug('x402Protect: Payment required for %s', req.path);

    // Check for payment header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader) {
      debug('x402Protect: No X-PAYMENT header, returning 402');
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, req.path);
        const encoded = base64Encode(JSON.stringify(x402Response));
        return res.status(402).set('PAYMENT-REQUIRED', encoded).end();
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // Parse and validate payment header
    const { payment, error: parseError } = parsePaymentHeader(paymentHeader);
    if (parseError) {
      debug('x402Protect: Invalid payment header: %s', parseError);
      return res.status(400).json({ error: parseError });
    }

    debug('x402Protect: Payment header validated, settling with facilitator');

    // Verify and settle payment
    try {
      const result = await settlePayment(payment, payTo, config, facilitator);
      debug('x402Protect: Settlement successful, txHash: %s', result.transactionHash || 'N/A');

      // Store settlement result on request
      req.x402Settlement = result;

      // Add payment response header
      res.setHeader('X-PAYMENT-RESPONSE', base64Encode(JSON.stringify(result)));

      // Continue to route handler
      next();
    } catch (error) {
      debug('x402Protect: Settlement failed: %s', error.message);
      try {
        const x402Response = await buildPaymentRequirements(payTo, config, req.path);
        x402Response.error = error.message;
        const encoded = base64Encode(JSON.stringify(x402Response));
        return res.status(402).set('PAYMENT-REQUIRED', encoded).end();
      } catch (reqError) {
        return res.status(500).json({ error: reqError.message });
      }
    }
  };
}

module.exports = {
  x402Express,
  x402Hono,
  x402Next,
  x402Protect,
  DEFAULT_FACILITATOR
};
