// xClaw02 - Signer
// Creates a wallet signer for x402 payments
// Supports both simple private key and viem wallet clients
// x402 v2 - CAIP-2 network format
// https://primer.systems

const { ethers } = require('ethers');
const {
  NETWORKS,
  createDebugLogger,
  getNetworkConfig,
  toCaipNetwork,
  chainIdToCaip
} = require('./utils');

const debug = createDebugLogger('signer');

/**
 * Create a signer for x402 payments
 *
 * Supports two approaches:
 * 1. Simple: Pass network name + private key (+ optional options)
 * 2. Advanced: Pass a viem WalletClient (for hardware wallets, WalletConnect, etc.)
 *
 * @param {string|Object} networkOrWalletClient - Network name OR viem WalletClient
 * @param {string} [privateKey] - Private key (only if first arg is network name)
 * @param {Object} [options] - Options (only if first arg is network name)
 * @param {string} [options.rpcUrl] - Custom RPC URL (overrides env var and default)
 * @returns {Promise<Object>} Signer object
 *
 * @example Simple approach with CAIP-2 network (recommended)
 * const signer = await createSigner('eip155:8453', '0xabc123...');
 *
 * @example Legacy network name (still supported)
 * const signer = await createSigner('base', '0xabc123...');
 *
 * @example With custom RPC
 * const signer = await createSigner('eip155:8453', '0xabc123...', {
 *   rpcUrl: 'https://my-private-node.com'
 * });
 *
 * @example Using environment variables
 * // Set RPC_BASE=https://my-private-node.com in .env
 * const signer = await createSigner('eip155:8453', '0xabc123...');
 *
 * @example Advanced approach (viem wallet client)
 * import { createWalletClient, http } from 'viem';
 * import { base } from 'viem/chains';
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * const walletClient = createWalletClient({
 *   account: privateKeyToAccount('0x...'),
 *   chain: base,
 *   transport: http('https://my-private-node.com')  // Custom RPC here
 * });
 * const signer = await createSigner(walletClient);
 */
async function createSigner(networkOrWalletClient, privateKey, options = {}) {
  // Detect if first argument is a viem WalletClient
  if (isViemWalletClient(networkOrWalletClient)) {
    debug('Creating signer from viem WalletClient');
    return createSignerFromViemClient(networkOrWalletClient);
  }

  // Otherwise, treat as network + privateKey approach
  debug('Creating signer from private key for network: %s', networkOrWalletClient);
  return createSignerFromPrivateKey(networkOrWalletClient, privateKey, options);
}

/**
 * Check if object is a viem WalletClient
 * @private
 */
function isViemWalletClient(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.signTypedData === 'function' &&
    obj.account &&
    obj.chain
  );
}

/**
 * Create signer from viem WalletClient
 * @private
 */
async function createSignerFromViemClient(walletClient) {
  // Lazy-load viem - it's an optional peer dependency
  let viem;
  try {
    viem = require('viem');
  } catch (e) {
    throw new Error(
      'viem is required for WalletClient support but is not installed. ' +
      'Install it with: npm install viem'
    );
  }
  const { createPublicClient, http } = viem;

  const account = walletClient.account;
  const chain = walletClient.chain;
  const transport = walletClient.transport;

  if (!account) {
    throw new Error('WalletClient must have an account configured');
  }
  if (!chain) {
    throw new Error('WalletClient must have a chain configured');
  }

  // Map viem chain to CAIP-2 network identifier
  const caipNetwork = chainIdToCaip(chain.id);
  debug('viem: Network=%s, Chain ID=%d, Address=%s', caipNetwork, chain.id, account.address);

  // Create public client for read operations, using same transport as wallet client
  // This ensures we use the same RPC endpoint for consistency
  const publicClient = createPublicClient({
    chain,
    transport: transport || http()
  });

  return {
    /**
     * Sign an EIP-712 typed data payment
     * @param {object} domain - EIP-712 domain
     * @param {object} types - EIP-712 types
     * @param {object} message - Message to sign
     * @param {string} [primaryType] - Primary type name (auto-detected if not provided)
     */
    async signTypedData(domain, types, message, primaryType) {
      // Use provided primaryType, or detect from types object
      // Note: Object.keys order is reliable in modern JS engines for string keys,
      // but explicit is better than implicit
      if (!primaryType) {
        const typeNames = Object.keys(types);
        primaryType = typeNames[0];
      }

      return await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType,
        message
      });
    },

    /**
     * Get the wallet address
     */
    getAddress() {
      return account.address;
    },

    /**
     * Get network info (returns CAIP-2 format for v2 compatibility)
     */
    getNetwork() {
      return {
        name: caipNetwork,  // CAIP-2 format (e.g., 'eip155:8453')
        chainId: chain.id,
        displayName: chain.name
      };
    },

    /**
     * Get the underlying viem wallet client (advanced use)
     */
    getWalletClient() {
      return walletClient;
    },

    /**
     * Get the public client for read operations
     */
    getPublicClient() {
      return publicClient;
    },

    /**
     * Get a provider-like interface for ethers compatibility
     */
    getProvider() {
      // Return a minimal ethers-compatible provider wrapper
      return {
        async call(tx) {
          return await publicClient.call({
            to: tx.to,
            data: tx.data
          });
        },
        getNetwork() {
          return { chainId: chain.id };
        }
      };
    },

    /**
     * Indicates this signer uses viem
     */
    isViem: true
  };
}

/**
 * Create signer from private key (original simple approach)
 * Accepts both CAIP-2 format (eip155:8453) and legacy names (base)
 * @private
 */
async function createSignerFromPrivateKey(network, privateKey, options = {}) {
  if (!network) {
    throw new Error('network is required');
  }
  if (!privateKey) {
    throw new Error('privateKey is required');
  }

  // Get network config (accepts both CAIP-2 and legacy names)
  let networkConfig;
  try {
    networkConfig = getNetworkConfig(network);
  } catch (e) {
    throw new Error(`Invalid network: ${network}. Supported: ${Object.keys(NETWORKS).join(', ')}`);
  }

  // Always use CAIP-2 format internally
  const caipNetwork = networkConfig.caipId;

  // Priority: explicit option > env var > default
  const rpcUrl = options.rpcUrl || networkConfig.rpcUrl;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  debug('ethers: Network=%s, Chain ID=%d, Address=%s', caipNetwork, networkConfig.chainId, wallet.address);
  // Redact RPC URL to avoid leaking API keys (many providers embed keys in URLs)
  const redactedUrl = rpcUrl.replace(/([?&])(api[_-]?key|key|token|secret|password|auth)=[^&]+/gi, '$1$2=***');
  debug('ethers: RPC URL=%s', redactedUrl);

  return {
    /**
     * Sign an EIP-712 typed data payment
     * @param {object} domain - EIP-712 domain
     * @param {object} types - EIP-712 types
     * @param {object} message - Message to sign
     * @param {string} [primaryType] - Primary type name (unused for ethers, included for API consistency)
     */
    async signTypedData(domain, types, message, primaryType) {
      // ethers infers primaryType automatically, but we accept it for API consistency
      return await wallet.signTypedData(domain, types, message);
    },

    /**
     * Get the wallet address
     */
    getAddress() {
      return wallet.address;
    },

    /**
     * Get network info (returns CAIP-2 format for v2 compatibility)
     */
    getNetwork() {
      return {
        name: caipNetwork,  // CAIP-2 format (e.g., 'eip155:8453')
        chainId: networkConfig.chainId,
        displayName: networkConfig.name
      };
    },

    /**
     * Get the underlying ethers wallet (advanced use)
     */
    getWallet() {
      return wallet;
    },

    /**
     * Get the provider
     */
    getProvider() {
      return provider;
    },

    /**
     * Indicates this signer uses ethers
     */
    isViem: false
  };
}

module.exports = {
  createSigner,
  NETWORKS
};
