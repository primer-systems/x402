// xClaw02 - Wallet Utilities
// Wallet creation, balance checking, and x402 probing
// https://primer.systems

const { ethers } = require('ethers');
const {
  NETWORKS,
  DEFAULT_FACILITATOR,
  getNetworkConfig,
  toCaipNetwork,
  createDebugLogger,
  TOKEN_ABI_ETHERS
} = require('./utils');
const { X402Error, ErrorCodes } = require('./errors');

const debug = createDebugLogger('wallet');

// Well-known token addresses per network
const USDC_ADDRESSES = {
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',      // Base
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',     // Base Sepolia
  'eip155:1': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',         // Ethereum
  'eip155:11155111': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  // Sepolia
  'eip155:42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',     // Arbitrum
  'eip155:421614': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',    // Arbitrum Sepolia
  'eip155:10': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',        // Optimism
  'eip155:11155420': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',  // Optimism Sepolia
  'eip155:137': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',       // Polygon
  'eip155:80002': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'      // Polygon Amoy
};

/**
 * Create a new random wallet
 *
 * @returns {Object} Wallet details
 * @returns {string} returns.address - Wallet address
 * @returns {string} returns.privateKey - Private key (hex with 0x prefix)
 * @returns {string} returns.mnemonic - 12-word mnemonic phrase
 *
 * @example
 * const wallet = createWallet();
 * console.log(wallet.address);     // 0x...
 * console.log(wallet.privateKey);  // 0x...
 * console.log(wallet.mnemonic);    // "word1 word2 ... word12"
 */
function createWallet() {
  const wallet = ethers.Wallet.createRandom();

  debug('Created new wallet: %s', wallet.address);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
}

/**
 * Restore a wallet from a mnemonic phrase
 *
 * @param {string} mnemonic - 12 or 24 word mnemonic phrase
 * @returns {Object} Wallet details
 *
 * @example
 * const wallet = walletFromMnemonic("word1 word2 ... word12");
 */
function walletFromMnemonic(mnemonic) {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);

  debug('Restored wallet from mnemonic: %s', wallet.address);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
}

/**
 * Get token balance for an address
 *
 * @param {string} address - Wallet address to check
 * @param {string} [network='base'] - Network name or CAIP-2 identifier
 * @param {string} [token='USDC'] - Token symbol ('USDC', 'ETH') or token address
 * @returns {Promise<Object>} Balance info
 * @returns {string} returns.balance - Human-readable balance (e.g., "100.50")
 * @returns {string} returns.balanceRaw - Raw balance in smallest unit
 * @returns {number} returns.decimals - Token decimals
 * @returns {string} returns.token - Token symbol or address
 * @returns {string} returns.network - Network CAIP-2 identifier
 *
 * @example
 * const balance = await getBalance('0x...', 'base', 'USDC');
 * console.log(balance.balance); // "100.50"
 */
async function getBalance(address, network = 'base', token = 'USDC') {
  // Normalize network to CAIP-2
  const caipNetwork = toCaipNetwork(network);
  const networkConfig = getNetworkConfig(caipNetwork);

  debug('Getting balance for %s on %s, token: %s', address, caipNetwork, token);

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

  // Handle ETH/native token
  if (token.toUpperCase() === 'ETH' || token.toUpperCase() === 'NATIVE') {
    const balanceRaw = await provider.getBalance(address);
    const balance = ethers.formatEther(balanceRaw);

    return {
      balance,
      balanceRaw: balanceRaw.toString(),
      decimals: 18,
      token: 'ETH',
      network: caipNetwork
    };
  }

  // Resolve token address
  let tokenAddress = token;
  if (token.toUpperCase() === 'USDC') {
    tokenAddress = USDC_ADDRESSES[caipNetwork];
    if (!tokenAddress) {
      throw new X402Error(
        ErrorCodes.UNSUPPORTED_NETWORK,
        `USDC not configured for network ${caipNetwork}`,
        { network: caipNetwork, token }
      );
    }
  }

  // Get ERC-20 balance
  const contract = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, provider);

  const [balanceRaw, decimals, symbol] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals(),
    contract.symbol().catch(() => token) // Fallback if symbol() fails
  ]);

  const balance = ethers.formatUnits(balanceRaw, decimals);

  return {
    balance,
    balanceRaw: balanceRaw.toString(),
    decimals: Number(decimals),
    token: symbol,
    network: caipNetwork
  };
}

/**
 * Probe a URL to check if it supports x402 payments
 *
 * @param {string} url - URL to probe
 * @returns {Promise<Object>} Probe result
 * @returns {boolean} returns.supports402 - Whether the URL returns 402
 * @returns {Object|null} returns.requirements - Payment requirements if 402
 * @returns {number} returns.statusCode - HTTP status code received
 *
 * @example
 * const probe = await x402Probe('https://api.example.com/paid');
 * if (probe.supports402) {
 *   console.log('Payment required:', probe.requirements);
 * }
 */
async function x402Probe(url) {
  debug('Probing URL: %s', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const statusCode = response.status;

    if (statusCode !== 402) {
      return {
        supports402: false,
        requirements: null,
        statusCode
      };
    }

    // Parse payment requirements from header
    const paymentHeader = response.headers.get('x-payment') ||
                          response.headers.get('payment-required');

    if (!paymentHeader) {
      return {
        supports402: true,
        requirements: null,
        statusCode,
        error: 'Missing payment requirements header'
      };
    }

    // Decode base64 JSON
    let requirements;
    try {
      const decoded = Buffer.from(paymentHeader, 'base64').toString();
      requirements = JSON.parse(decoded);
    } catch (e) {
      // Try parsing as plain JSON
      try {
        requirements = JSON.parse(paymentHeader);
      } catch (e2) {
        return {
          supports402: true,
          requirements: null,
          statusCode,
          error: 'Could not parse payment requirements'
        };
      }
    }

    debug('Found x402 requirements: %O', requirements);

    return {
      supports402: true,
      requirements,
      statusCode
    };

  } catch (error) {
    debug('Probe failed: %s', error.message);

    return {
      supports402: false,
      requirements: null,
      statusCode: null,
      error: error.message
    };
  }
}

/**
 * Get facilitator information
 *
 * @param {string} [facilitatorUrl] - Facilitator URL (defaults to Primer facilitator)
 * @returns {Promise<Object>} Facilitator info
 */
async function getFacilitatorInfo(facilitatorUrl = DEFAULT_FACILITATOR) {
  debug('Getting facilitator info from: %s', facilitatorUrl);

  try {
    const response = await fetch(`${facilitatorUrl}/info`);

    if (!response.ok) {
      throw new X402Error(
        ErrorCodes.FACILITATOR_ERROR,
        `Facilitator returned ${response.status}`,
        { statusCode: response.status }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof X402Error) throw error;

    throw new X402Error(
      ErrorCodes.NETWORK_ERROR,
      `Failed to reach facilitator: ${error.message}`,
      { url: facilitatorUrl }
    );
  }
}

/**
 * List supported networks
 *
 * @returns {Array<Object>} Array of network configurations
 */
function listNetworks() {
  return Object.values(NETWORKS).map(net => ({
    name: net.name,
    caipId: net.caipId,
    legacyName: net.legacyName,
    chainId: net.chainId
  }));
}

module.exports = {
  createWallet,
  walletFromMnemonic,
  getBalance,
  x402Probe,
  getFacilitatorInfo,
  listNetworks,
  USDC_ADDRESSES
};
