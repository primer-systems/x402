// xClaw02
// TypeScript SDK for x402 payments
// https://primer.systems | https://x402.org

// Signer
const { createSigner, NETWORKS } = require('./signer');

// Payer functions (for paying for APIs)
const { x402Fetch, x402Axios, approveToken } = require('./payer');

// Payee middleware (for charging for APIs)
const { x402Express, x402Hono, x402Next, DEFAULT_FACILITATOR } = require('./payee');

// Wallet utilities
const {
  createWallet,
  walletFromMnemonic,
  getBalance,
  x402Probe,
  getFacilitatorInfo,
  listNetworks,
  USDC_ADDRESSES
} = require('./wallet');

// Errors
const {
  ErrorCodes,
  X402Error,
  InsufficientFundsError,
  AmountExceedsMaxError,
  ConfigError,
  UnsupportedNetworkError,
  SettlementError,
  InvalidResponseError
} = require('./errors');

module.exports = {
  // Signer
  createSigner,
  NETWORKS,

  // Payer
  x402Fetch,
  x402Axios,
  approveToken,

  // Payee
  x402Express,
  x402Hono,
  x402Next,

  // Wallet
  createWallet,
  walletFromMnemonic,
  getBalance,
  x402Probe,
  getFacilitatorInfo,
  listNetworks,
  USDC_ADDRESSES,

  // Errors
  ErrorCodes,
  X402Error,
  InsufficientFundsError,
  AmountExceedsMaxError,
  ConfigError,
  UnsupportedNetworkError,
  SettlementError,
  InvalidResponseError,

  // Constants
  DEFAULT_FACILITATOR
};
