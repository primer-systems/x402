// xClaw02 - Shared Utilities
// Common functions and constants used across the SDK
// x402 v2 - CAIP-2 network format support
// https://primer.systems

const debug = require('debug');

// ============================================
// Constants
// ============================================

// x402 protocol version
const XCLAW02_VERSION = 2;

// Default timeout for facilitator requests (10 seconds)
const FACILITATOR_TIMEOUT_MS = 10000;

// Default facilitator URL
const DEFAULT_FACILITATOR = 'https://x402.primer.systems';

// Networks with default facilitator support (Primer facilitator)
// Uses CAIP-2 format for v2 compatibility
const BASE_NETWORKS = ['eip155:8453', 'eip155:84532'];

// Legacy network name mapping (for backward compatibility during transition)
const LEGACY_NETWORK_NAMES = ['base', 'base-sepolia'];

// Network configurations with CAIP-2 identifiers
// CAIP-2 format: namespace:reference (e.g., eip155:8453 for Base)
const NETWORKS = {
  // Base (default facilitator supported)
  'eip155:8453': {
    name: 'Base',
    chainId: 8453,
    caipId: 'eip155:8453',
    legacyName: 'base',
    rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org/'
  },
  'eip155:84532': {
    name: 'Base Sepolia',
    chainId: 84532,
    caipId: 'eip155:84532',
    legacyName: 'base-sepolia',
    rpcUrl: process.env.RPC_BASE_SEPOLIA || 'https://sepolia.base.org/'
  },
  // Ethereum
  'eip155:1': {
    name: 'Ethereum',
    chainId: 1,
    caipId: 'eip155:1',
    legacyName: 'ethereum',
    rpcUrl: process.env.RPC_ETHEREUM || 'https://eth.llamarpc.com'
  },
  'eip155:11155111': {
    name: 'Sepolia',
    chainId: 11155111,
    caipId: 'eip155:11155111',
    legacyName: 'sepolia',
    rpcUrl: process.env.RPC_SEPOLIA || 'https://rpc.sepolia.org'
  },
  // Arbitrum
  'eip155:42161': {
    name: 'Arbitrum One',
    chainId: 42161,
    caipId: 'eip155:42161',
    legacyName: 'arbitrum',
    rpcUrl: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc'
  },
  'eip155:421614': {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    caipId: 'eip155:421614',
    legacyName: 'arbitrum-sepolia',
    rpcUrl: process.env.RPC_ARBITRUM_SEPOLIA || 'https://sepolia-rollup.arbitrum.io/rpc'
  },
  // Optimism
  'eip155:10': {
    name: 'Optimism',
    chainId: 10,
    caipId: 'eip155:10',
    legacyName: 'optimism',
    rpcUrl: process.env.RPC_OPTIMISM || 'https://mainnet.optimism.io'
  },
  'eip155:11155420': {
    name: 'Optimism Sepolia',
    chainId: 11155420,
    caipId: 'eip155:11155420',
    legacyName: 'optimism-sepolia',
    rpcUrl: process.env.RPC_OPTIMISM_SEPOLIA || 'https://sepolia.optimism.io'
  },
  // Polygon
  'eip155:137': {
    name: 'Polygon',
    chainId: 137,
    caipId: 'eip155:137',
    legacyName: 'polygon',
    rpcUrl: process.env.RPC_POLYGON || 'https://polygon-rpc.com'
  },
  'eip155:80002': {
    name: 'Polygon Amoy',
    chainId: 80002,
    caipId: 'eip155:80002',
    legacyName: 'polygon-amoy',
    rpcUrl: process.env.RPC_POLYGON_AMOY || 'https://rpc-amoy.polygon.technology'
  }
};

// ============================================
// CAIP-2 Network Utilities
// ============================================

/**
 * Convert a legacy network name to CAIP-2 format
 * @param {string} network - Network name (legacy or CAIP-2)
 * @returns {string} CAIP-2 network identifier
 */
function toCaipNetwork(network) {
  // Already in CAIP-2 format
  if (network.startsWith('eip155:')) {
    return network;
  }
  // Look up by legacy name
  for (const [caipId, config] of Object.entries(NETWORKS)) {
    if (config.legacyName === network) {
      return caipId;
    }
  }
  throw new Error(`Unknown network: ${network}. Use CAIP-2 format (e.g., eip155:8453) or supported name.`);
}

/**
 * Convert a CAIP-2 network identifier to legacy name
 * @param {string} caipId - CAIP-2 network identifier
 * @returns {string} Legacy network name
 */
function fromCaipNetwork(caipId) {
  // Already a legacy name
  if (!caipId.startsWith('eip155:')) {
    return caipId;
  }
  const config = NETWORKS[caipId];
  if (config) {
    return config.legacyName;
  }
  throw new Error(`Unknown CAIP-2 network: ${caipId}`);
}

/**
 * Get network configuration by any identifier (CAIP-2 or legacy)
 * @param {string} network - Network identifier
 * @returns {Object} Network configuration
 */
function getNetworkConfig(network) {
  // Try direct lookup first (CAIP-2 format)
  if (NETWORKS[network]) {
    return NETWORKS[network];
  }
  // Try legacy name lookup
  const caipId = toCaipNetwork(network);
  return NETWORKS[caipId];
}

/**
 * Create CAIP-2 identifier from chain ID
 * @param {number} chainId - EVM chain ID
 * @returns {string} CAIP-2 identifier
 */
function chainIdToCaip(chainId) {
  return `eip155:${chainId}`;
}

/**
 * Extract chain ID from CAIP-2 identifier
 * @param {string} caipId - CAIP-2 identifier
 * @returns {number} Chain ID
 */
function caipToChainId(caipId) {
  if (!caipId.startsWith('eip155:')) {
    throw new Error(`Invalid EVM CAIP-2 identifier: ${caipId}`);
  }
  return parseInt(caipId.split(':')[1], 10);
}

// ============================================
// Debug Loggers
// ============================================
// Enable with: DEBUG=x402:* node app.js
// Or selectively: DEBUG=x402:payer,x402:payee node app.js

const createDebugLogger = (namespace) => debug(`x402:${namespace}`);

// ============================================
// Token ABIs
// ============================================

// Viem-style ABI for token operations
const TOKEN_ABI_VIEM = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }]
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
];

// Ethers-style ABI for token operations
const TOKEN_ABI_ETHERS = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function version() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function authorizationState(address, bytes32) view returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// ============================================
// Bounded Cache
// ============================================

/**
 * Create a simple bounded cache with LRU-like eviction
 * When cache exceeds maxSize, oldest entries are removed
 * @param {number} maxSize - Maximum number of entries (default: 100)
 * @returns {Object} Cache object with get, set, has methods
 */
function createBoundedCache(maxSize = 100) {
  const cache = new Map();

  return {
    has(key) {
      return cache.has(key);
    },

    get(key) {
      const value = cache.get(key);
      if (value !== undefined) {
        // Move to end (most recently used)
        cache.delete(key);
        cache.set(key, value);
      }
      return value;
    },

    set(key, value) {
      // Remove if exists (to update position)
      if (cache.has(key)) {
        cache.delete(key);
      }
      // Evict oldest if at capacity
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }
      cache.set(key, value);
    },

    clear() {
      cache.clear();
    },

    size() {
      return cache.size;
    }
  };
}

// ============================================
// Retry with Exponential Backoff
// ============================================

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=4] - Maximum number of retries
 * @param {number} [options.baseDelayMs=2000] - Initial delay in milliseconds
 * @param {number} [options.maxDelayMs=16000] - Maximum delay cap
 * @param {Function} [options.isRetryable] - Function to check if error is retryable
 * @returns {Promise<any>} Result of the function
 * @throws {Error} Last error if all retries fail
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 4,
    baseDelayMs = 2000,
    maxDelayMs = 16000,
    isRetryable = (err) => {
      // Default: retry on network errors and 5xx status codes
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
        return true;
      }
      if (err.status >= 500 && err.status < 600) {
        return true;
      }
      return false;
    }
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================
// Base64 Encoding/Decoding
// ============================================

/**
 * Cross-platform base64 decode (works in Node.js and browsers)
 * @param {string} str - Base64 string to decode
 * @returns {string} Decoded string
 */
function base64Decode(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString();
  }
  return atob(str);
}

/**
 * Cross-platform base64 encode (works in Node.js and browsers)
 * @param {string} str - String to encode
 * @returns {string} Base64 encoded string
 */
function base64Encode(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  return btoa(str);
}

// ============================================
// Payment Header Validation
// ============================================

/**
 * Parse and validate a PAYMENT-SIGNATURE header from a client
 * x402 v2 format
 * @param {string} paymentHeader - Base64-encoded payment header
 * @returns {{ payment: object, error: null } | { payment: null, error: string }}
 */
function parsePaymentHeader(paymentHeader) {
  if (!paymentHeader || typeof paymentHeader !== 'string') {
    return { payment: null, error: 'Missing PAYMENT-SIGNATURE header' };
  }

  // Decode base64
  let decoded;
  try {
    decoded = base64Decode(paymentHeader);
  } catch (e) {
    return { payment: null, error: 'Invalid PAYMENT-SIGNATURE header: not valid base64' };
  }

  // Parse JSON
  let payment;
  try {
    payment = JSON.parse(decoded);
  } catch (e) {
    return { payment: null, error: 'Invalid PAYMENT-SIGNATURE header: not valid JSON' };
  }

  // Validate required fields
  if (!payment.x402Version) {
    return { payment: null, error: 'Invalid payment: missing x402Version' };
  }
  if (payment.x402Version !== 2) {
    return { payment: null, error: `Unsupported x402Version: ${payment.x402Version}. Expected version 2.` };
  }
  if (!payment.scheme) {
    return { payment: null, error: 'Invalid payment: missing scheme' };
  }
  if (!payment.network) {
    return { payment: null, error: 'Invalid payment: missing network' };
  }
  if (!payment.payload) {
    return { payment: null, error: 'Invalid payment: missing payload' };
  }
  if (!payment.payload.signature) {
    return { payment: null, error: 'Invalid payment: missing payload.signature' };
  }
  if (!payment.payload.authorization) {
    return { payment: null, error: 'Invalid payment: missing payload.authorization' };
  }

  // Normalize network to CAIP-2 format if needed
  if (!payment.network.startsWith('eip155:')) {
    try {
      payment.network = toCaipNetwork(payment.network);
    } catch (e) {
      return { payment: null, error: `Invalid payment: unknown network ${payment.network}` };
    }
  }

  return { payment, error: null };
}

// ============================================
// Exports
// ============================================

module.exports = {
  // ABIs
  TOKEN_ABI_VIEM,
  TOKEN_ABI_ETHERS,

  // Cache
  createBoundedCache,

  // Constants
  XCLAW02_VERSION,
  NETWORKS,
  BASE_NETWORKS,
  LEGACY_NETWORK_NAMES,
  DEFAULT_FACILITATOR,
  FACILITATOR_TIMEOUT_MS,

  // CAIP-2 Network Utilities
  toCaipNetwork,
  fromCaipNetwork,
  getNetworkConfig,
  chainIdToCaip,
  caipToChainId,

  // Debug
  createDebugLogger,

  // Encoding
  base64Decode,
  base64Encode,

  // Retry
  sleep,
  retryWithBackoff,

  // Validation
  parsePaymentHeader
};
