// Primer x402 - Payer Functions
// Wrap HTTP clients to automatically handle 402 Payment Required responses
// Supports both ethers and viem signers
// https://primer.systems

const { ethers } = require('ethers');
const {
  createDebugLogger,
  createBoundedCache,
  DEFAULT_FACILITATOR,
  FACILITATOR_TIMEOUT_MS,
  base64Encode,
  TOKEN_ABI_ETHERS,
  TOKEN_ABI_VIEM
} = require('./utils');

const debug = createDebugLogger('payer');

/**
 * Parse payment requirements from 402 response
 * Expects x402 format: { x402Version: 1, accepts: [...] }
 * @private
 */
function parsePaymentRequirements(responseData) {
  if (!responseData.x402Version) {
    throw new Error('Invalid 402 response: missing x402Version');
  }
  if (!Array.isArray(responseData.accepts) || responseData.accepts.length === 0) {
    throw new Error('Invalid 402 response: missing or empty accepts array');
  }
  // Return the first accepted payment scheme
  return responseData.accepts[0];
}

/**
 * Verify a payment with the facilitator before submitting
 * This is optional but recommended to catch errors early
 * @private
 */
async function verifyPayment(payment, requirements, facilitator, timeoutMs = FACILITATOR_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      x402Version: 1,
      paymentPayload: payment,
      paymentRequirements: {
        scheme: requirements.scheme || 'exact',
        network: requirements.network,
        maxAmountRequired: requirements.maxAmountRequired,
        asset: requirements.asset,
        payTo: requirements.payTo
      }
    };

    const response = await fetch(`${facilitator}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.json();
      const err = new Error(error.error || `Payment verification failed: ${response.status}`);
      err.code = 'VERIFY_FAILED';
      err.details = error;
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const err = new Error(`Facilitator verify request timed out after ${timeoutMs}ms. The facilitator may be temporarily unavailable - please retry.`);
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

// Token ABIs are imported from utils.js as TOKEN_ABI_ETHERS and TOKEN_ABI_VIEM

/**
 * Wrap fetch to automatically handle 402 Payment Required responses
 *
 * @param {Function} fetch - The fetch function to wrap
 * @param {Object} signer - Signer created by createSigner()
 * @param {Object} options - Options
 * @param {string} options.maxAmount - Maximum amount to pay per request (e.g., '0.50') - REQUIRED
 * @param {string} options.facilitator - Custom facilitator URL
 * @param {boolean} options.verify - Verify payment with facilitator before sending (default: true)
 * @returns {Function} Wrapped fetch function
 *
 * @example
 * const signer = await createSigner('base', privateKey);
 * const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });
 * const response = await fetchWithPay('https://api.example.com/data');
 */
function x402Fetch(fetch, signer, options = {}) {
  if (!options.maxAmount) {
    throw new Error('maxAmount is required. Specify the maximum amount you are willing to pay per request (e.g., { maxAmount: "0.50" })');
  }
  const maxAmount = parseFloat(options.maxAmount);
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;
  const shouldVerify = options.verify !== false; // Default to true

  return async function fetchWithPayment(url, init = {}) {
    debug('Request to %s', url);

    // Make initial request
    let response = await fetch(url, init);

    // If not 402, return as-is
    if (response.status !== 402) {
      debug('Response %d - no payment required', response.status);
      return response;
    }

    debug('Got 402 Payment Required');

    // Parse payment requirements from x402 response
    const paymentRequired = await response.json();
    const requirements = parsePaymentRequirements(paymentRequired);
    debug('Payment requirements: %O', {
      scheme: requirements.scheme,
      network: requirements.network,
      asset: requirements.asset,
      maxAmountRequired: requirements.maxAmountRequired
    });

    // Get token decimals and validate amount
    const decimals = await getTokenDecimals(signer, requirements.asset);
    const amount = parseFloat(ethers.formatUnits(requirements.maxAmountRequired || '0', decimals));
    debug('Amount: %s (max allowed: %s)', amount, maxAmount);

    if (amount > maxAmount) {
      throw new Error(`Payment amount ${amount} exceeds maxAmount ${maxAmount}`);
    }

    // Create payment
    debug('Creating payment...');
    const payment = await createPayment(signer, requirements, facilitator);
    debug('Payment created, signature: %s...', payment.payload.signature.slice(0, 20));

    // Verify payment before sending (optional but recommended)
    if (shouldVerify) {
      debug('Verifying payment with facilitator: %s', facilitator);
      await verifyPayment(payment, requirements, facilitator);
      debug('Payment verified successfully');
    }

    // Retry with payment header
    debug('Retrying request with X-PAYMENT header');
    const paymentHeader = base64Encode(JSON.stringify(payment));
    const newInit = {
      ...init,
      headers: {
        ...init.headers,
        'X-PAYMENT': paymentHeader
      }
    };

    const finalResponse = await fetch(url, newInit);
    debug('Final response: %d', finalResponse.status);
    return finalResponse;
  };
}

/**
 * Wrap axios to automatically handle 402 Payment Required responses
 *
 * @param {Object} axios - Axios instance to wrap
 * @param {Object} signer - Signer created by createSigner()
 * @param {Object} options - Options
 * @param {string} options.maxAmount - Maximum amount to pay per request - REQUIRED
 * @param {string} options.facilitator - Custom facilitator URL
 * @param {boolean} options.verify - Verify payment with facilitator before sending (default: true)
 * @returns {Object} Axios instance with payment interceptor
 *
 * @example
 * const signer = await createSigner('base', privateKey);
 * const axiosWithPay = x402Axios(axios.create(), signer, { maxAmount: '0.50' });
 * const response = await axiosWithPay.get('https://api.example.com/data');
 */
function x402Axios(axiosInstance, signer, options = {}) {
  if (!options.maxAmount) {
    throw new Error('maxAmount is required. Specify the maximum amount you are willing to pay per request (e.g., { maxAmount: "0.50" })');
  }
  const maxAmount = parseFloat(options.maxAmount);
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;
  const shouldVerify = options.verify !== false; // Default to true

  // Add response interceptor to handle 402
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status !== 402) {
        throw error;
      }

      debug('Axios got 402 Payment Required for %s', error.config?.url);

      // Parse requirements from x402 response
      const requirements = parsePaymentRequirements(error.response.data);
      debug('Payment requirements: %O', {
        scheme: requirements.scheme,
        network: requirements.network,
        asset: requirements.asset,
        maxAmountRequired: requirements.maxAmountRequired
      });

      // Get token decimals and validate amount
      const decimals = await getTokenDecimals(signer, requirements.asset);
      const amount = parseFloat(ethers.formatUnits(requirements.maxAmountRequired || '0', decimals));
      debug('Amount: %s (max allowed: %s)', amount, maxAmount);

      if (amount > maxAmount) {
        throw new Error(`Payment amount ${amount} exceeds maxAmount ${maxAmount}`);
      }

      // Create payment
      debug('Creating payment...');
      const payment = await createPayment(signer, requirements, facilitator);
      debug('Payment created');

      // Verify payment before sending (optional but recommended)
      if (shouldVerify) {
        debug('Verifying payment with facilitator');
        await verifyPayment(payment, requirements, facilitator);
        debug('Payment verified');
      }

      // Retry with payment header
      debug('Retrying request with X-PAYMENT header');
      const paymentHeader = base64Encode(JSON.stringify(payment));
      const config = error.config;
      config.headers['X-PAYMENT'] = paymentHeader;

      return axiosInstance.request(config);
    }
  );

  return axiosInstance;
}

/**
 * Create a signed payment for the given requirements
 * @private
 */
async function createPayment(signer, requirements, facilitator) {
  const network = signer.getNetwork();
  const address = signer.getAddress();

  const tokenAddress = requirements.asset;
  const payTo = requirements.payTo;
  const value = requirements.maxAmountRequired;

  // Get token details - prefer extra field from server to avoid RPC calls
  let tokenName, tokenVersion, isEIP3009;

  // Use extra field if provided by the server (recommended)
  if (requirements.extra?.name && requirements.extra?.version) {
    debug('Using token metadata from extra field: %s v%s', requirements.extra.name, requirements.extra.version);
    tokenName = requirements.extra.name;
    tokenVersion = requirements.extra.version;

    // Still need to detect if EIP-3009 token
    if (signer.isViem) {
      const result = await checkEIP3009Viem(signer, tokenAddress, address);
      isEIP3009 = result;
    } else {
      const result = await checkEIP3009Ethers(signer, tokenAddress, address);
      isEIP3009 = result;
    }
  } else {
    // Fallback: fetch from chain if extra field not provided
    debug('No extra field, fetching token metadata from chain');
    if (signer.isViem) {
      const result = await getTokenDetailsViem(signer, tokenAddress, address);
      tokenName = result.tokenName;
      tokenVersion = result.tokenVersion;
      isEIP3009 = result.isEIP3009;
    } else {
      const result = await getTokenDetailsEthers(signer, tokenAddress, address);
      tokenName = result.tokenName;
      tokenVersion = result.tokenVersion;
      isEIP3009 = result.isEIP3009;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + 3600;

  let signature, authorization;

  if (isEIP3009) {
    // EIP-3009 token (USDC, EURC)
    const nonce = generateRandomBytes32();

    const domain = {
      name: tokenName,
      version: tokenVersion,
      chainId: network.chainId,
      verifyingContract: tokenAddress
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    const message = {
      from: address,
      to: payTo,
      value: BigInt(value),
      validAfter,
      validBefore,
      nonce
    };

    signature = await signer.signTypedData(domain, types, message, 'TransferWithAuthorization');
    authorization = {
      from: address,
      to: payTo,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce
    };
  } else {
    // Standard ERC-20 via Prism
    const prismAddress = await fetchPrismAddress(network.name, facilitator);

    // Check allowance before proceeding
    const allowance = await checkAllowance(signer, tokenAddress, address, prismAddress);
    if (allowance < BigInt(value)) {
      const error = new Error(
        `Insufficient allowance for ${tokenAddress}. ` +
        `Required: ${value}, Current: ${allowance.toString()}. ` +
        `Use approveToken() to approve the Prism contract.`
      );
      error.code = 'INSUFFICIENT_ALLOWANCE';
      error.required = value;
      error.current = allowance.toString();
      error.token = tokenAddress;
      error.spender = prismAddress;
      throw error;
    }

    const nonce = await getPrismNonce(signer, prismAddress, address, tokenAddress);

    const domain = {
      name: 'Primer',
      version: '1',
      chainId: network.chainId,
      verifyingContract: prismAddress
    };

    const types = {
      ERC20Payment: [
        { name: 'token', type: 'address' },
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' }
      ]
    };

    const message = {
      token: tokenAddress,
      from: address,
      to: payTo,
      value: BigInt(value),
      nonce,
      validAfter,
      validBefore
    };

    signature = await signer.signTypedData(domain, types, message, 'ERC20Payment');
    authorization = {
      from: address,
      to: payTo,
      value: value.toString(),
      validAfter,
      validBefore,
      nonce: nonce.toString()
    };
  }

  // Format as x402 payload
  return {
    x402Version: 1,
    scheme: 'exact',
    network: network.name,
    payload: {
      signature,
      authorization
    }
  };
}

/**
 * Check if token supports EIP-3009 using ethers provider
 * @private
 */
async function checkEIP3009Ethers(signer, tokenAddress, address) {
  const provider = signer.getProvider();
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, provider);

  try {
    const testNonce = ethers.hexlify(ethers.randomBytes(32));
    await token.authorizationState(address, testNonce);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if token supports EIP-3009 using viem public client
 * @private
 */
async function checkEIP3009Viem(signer, tokenAddress, address) {
  const publicClient = signer.getPublicClient();

  try {
    const testNonce = generateRandomBytes32();
    await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'authorizationState',
      args: [address, testNonce]
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get token details using ethers provider
 * @private
 */
async function getTokenDetailsEthers(signer, tokenAddress, address) {
  const provider = signer.getProvider();
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, provider);

  let tokenName, tokenVersion;

  try {
    tokenName = await token.name();
  } catch (e) {
    throw new Error('Failed to get token name');
  }

  try {
    tokenVersion = await token.version();
  } catch (e) {
    tokenVersion = '1';
  }

  // Check if EIP-3009 token
  let isEIP3009 = false;
  try {
    const testNonce = ethers.hexlify(ethers.randomBytes(32));
    await token.authorizationState(address, testNonce);
    isEIP3009 = true;
  } catch (e) {
    isEIP3009 = false;
  }

  return { tokenName, tokenVersion, isEIP3009 };
}

/**
 * Get token details using viem public client
 * @private
 */
async function getTokenDetailsViem(signer, tokenAddress, address) {
  const publicClient = signer.getPublicClient();

  let tokenName, tokenVersion;

  try {
    tokenName = await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'name'
    });
  } catch (e) {
    throw new Error('Failed to get token name');
  }

  try {
    tokenVersion = await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'version'
    });
  } catch (e) {
    tokenVersion = '1';
  }

  // Check if EIP-3009 token
  let isEIP3009 = false;
  try {
    const testNonce = generateRandomBytes32();
    await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'authorizationState',
      args: [address, testNonce]
    });
    isEIP3009 = true;
  } catch (e) {
    isEIP3009 = false;
  }

  return { tokenName, tokenVersion, isEIP3009 };
}

// Bounded decimals cache to avoid repeated RPC calls (max 100 tokens)
const decimalsCache = createBoundedCache(100);

/**
 * Get token decimals (with caching)
 * @private
 */
async function getTokenDecimals(signer, tokenAddress) {
  const cached = decimalsCache.get(tokenAddress);
  if (cached !== undefined) {
    return cached;
  }

  let decimals;
  if (signer.isViem) {
    const publicClient = signer.getPublicClient();
    decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'decimals'
    });
  } else {
    const provider = signer.getProvider();
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, provider);
    decimals = await token.decimals();
  }

  const result = Number(decimals);
  decimalsCache.set(tokenAddress, result);
  return result;
}

/**
 * Check token allowance for Prism contract
 * @private
 */
async function checkAllowance(signer, tokenAddress, ownerAddress, spenderAddress) {
  if (signer.isViem) {
    const publicClient = signer.getPublicClient();
    return await publicClient.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'allowance',
      args: [ownerAddress, spenderAddress]
    });
  } else {
    const provider = signer.getProvider();
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, provider);
    return await token.allowance(ownerAddress, spenderAddress);
  }
}

/**
 * Approve a token for use with x402 payments
 *
 * Required for standard ERC-20 tokens (not needed for EIP-3009 tokens like USDC)
 *
 * @param {Object} signer - Signer created by createSigner()
 * @param {string} tokenAddress - Token contract address
 * @param {Object} options - Options
 * @param {string} options.amount - Amount to approve (default: unlimited)
 * @param {string} options.facilitator - Custom facilitator URL
 * @returns {Promise<Object>} Transaction receipt
 *
 * @example
 * // Approve unlimited
 * const receipt = await approveToken(signer, '0x...');
 *
 * // Approve specific amount
 * const receipt = await approveToken(signer, '0x...', { amount: '1000000000' });
 */
async function approveToken(signer, tokenAddress, options = {}) {
  const facilitator = options.facilitator || DEFAULT_FACILITATOR;
  const network = signer.getNetwork();
  const address = signer.getAddress();

  // Get Prism address
  const prismAddress = await fetchPrismAddress(network.name, facilitator);

  // Determine approval amount (default: unlimited)
  const amount = options.amount ? BigInt(options.amount) : ethers.MaxUint256;

  if (signer.isViem) {
    // viem approach - need wallet client with writeContract
    const walletClient = signer.getWalletClient();
    const publicClient = signer.getPublicClient();

    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: TOKEN_ABI_VIEM,
      functionName: 'approve',
      args: [prismAddress, amount]
    });

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 1 : 0,
      spender: prismAddress,
      amount: amount.toString()
    };
  } else {
    // ethers approach
    const wallet = signer.getWallet();
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI_ETHERS, wallet);

    const tx = await token.approve(prismAddress, amount);
    const receipt = await tx.wait();

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      spender: prismAddress,
      amount: amount.toString()
    };
  }
}

/**
 * Get Prism nonce for ERC-20 payments
 * @private
 */
async function getPrismNonce(signer, prismAddress, userAddress, tokenAddress) {
  if (signer.isViem) {
    const publicClient = signer.getPublicClient();
    return await publicClient.readContract({
      address: prismAddress,
      abi: [{
        name: 'getNonce',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'user', type: 'address' },
          { name: 'token', type: 'address' }
        ],
        outputs: [{ type: 'uint256' }]
      }],
      functionName: 'getNonce',
      args: [userAddress, tokenAddress]
    });
  } else {
    const provider = signer.getProvider();
    const prismABI = ['function getNonce(address user, address token) view returns (uint256)'];
    const prism = new ethers.Contract(prismAddress, prismABI, provider);
    return await prism.getNonce(userAddress, tokenAddress);
  }
}

/**
 * Generate random 32 bytes as hex string
 * @private
 */
function generateRandomBytes32() {
  // Use crypto if available, otherwise ethers
  try {
    const crypto = require('crypto');
    return '0x' + crypto.randomBytes(32).toString('hex');
  } catch (e) {
    return ethers.hexlify(ethers.randomBytes(32));
  }
}

/**
 * Fetch Prism contract address from facilitator
 * @private
 */
async function fetchPrismAddress(network, facilitator, timeoutMs = FACILITATOR_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${facilitator}/contracts`, {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Prism address: ${response.status}`);
    }
    const contracts = await response.json();
    if (!contracts[network]) {
      throw new Error(`Network ${network} not supported`);
    }
    return contracts[network].prism;
  } catch (error) {
    if (error.name === 'AbortError') {
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

module.exports = {
  x402Fetch,
  x402Axios,
  approveToken,
  DEFAULT_FACILITATOR
};
