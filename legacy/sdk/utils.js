// Megalith x402 - Shared Utilities
// Common functions and constants used across the SDK
// https://megalithlabs.ai

const debug = require('debug');

// ============================================
// Debug Loggers
// ============================================
// Enable with: DEBUG=x402:* node app.js
// Or selectively: DEBUG=x402:payer,x402:payee node app.js

const createDebugLogger = (namespace) => debug(`x402:${namespace}`);

// ============================================
// Constants
// ============================================

// Default facilitator URL
const DEFAULT_FACILITATOR = 'https://x402.megalithlabs.ai';

// Default timeout for facilitator requests (10 seconds)
const FACILITATOR_TIMEOUT_MS = 10000;

// Network configurations with env var overrides
const NETWORKS = {
  'bsc': {
    name: 'BNB Chain Mainnet',
    chainId: 56,
    rpcUrl: process.env.RPC_BSC || 'https://bsc-dataseed.binance.org/'
  },
  'bsc-testnet': {
    name: 'BNB Chain Testnet',
    chainId: 97,
    rpcUrl: process.env.RPC_BSC_TESTNET || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
  },
  'base': {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org/'
  },
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: process.env.RPC_BASE_SEPOLIA || 'https://sepolia.base.org/'
  }  
};

// ============================================
// Base64 Encoding/Decoding
// ============================================

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

// ============================================
// Payment Header Validation
// ============================================

/**
 * Parse and validate an X-PAYMENT header from a client
 * @param {string} paymentHeader - Base64-encoded payment header
 * @returns {{ payment: object, error: null } | { payment: null, error: string }}
 */
function parsePaymentHeader(paymentHeader) {
  if (!paymentHeader || typeof paymentHeader !== 'string') {
    return { payment: null, error: 'Missing X-PAYMENT header' };
  }

  // Decode base64
  let decoded;
  try {
    decoded = base64Decode(paymentHeader);
  } catch (e) {
    return { payment: null, error: 'Invalid X-PAYMENT header: not valid base64' };
  }

  // Parse JSON
  let payment;
  try {
    payment = JSON.parse(decoded);
  } catch (e) {
    return { payment: null, error: 'Invalid X-PAYMENT header: not valid JSON' };
  }

  // Validate required fields
  if (!payment.x402Version) {
    return { payment: null, error: 'Invalid payment: missing x402Version' };
  }
  if (payment.x402Version !== 1) {
    return { payment: null, error: `Unsupported x402Version: ${payment.x402Version}` };
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

  return { payment, error: null };
}

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

    has(key) {
      return cache.has(key);
    },

    size() {
      return cache.size;
    },

    clear() {
      cache.clear();
    }
  };
}

// ============================================
// Token ABIs
// ============================================

// Ethers-style ABI for token operations
const TOKEN_ABI_ETHERS = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function authorizationState(address, bytes32) view returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

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
    name: 'version',
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
    name: 'symbol',
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

// ============================================
// Exports
// ============================================

module.exports = {
  // Debug
  createDebugLogger,

  // Constants
  DEFAULT_FACILITATOR,
  FACILITATOR_TIMEOUT_MS,
  NETWORKS,

  // Encoding
  base64Encode,
  base64Decode,

  // Validation
  parsePaymentHeader,

  // Cache
  createBoundedCache,

  // ABIs
  TOKEN_ABI_ETHERS,
  TOKEN_ABI_VIEM
};
