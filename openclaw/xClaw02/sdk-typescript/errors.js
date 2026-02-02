// xClaw02 - Error Classes
// Structured errors for better agent/programmatic handling
// https://primer.systems

/**
 * Error codes for x402 operations
 */
const ErrorCodes = {
  // Configuration errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  MISSING_PRIVATE_KEY: 'MISSING_PRIVATE_KEY',
  UNSUPPORTED_NETWORK: 'UNSUPPORTED_NETWORK',

  // Payment errors
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  AMOUNT_EXCEEDS_MAX: 'AMOUNT_EXCEEDS_MAX',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED',

  // Protocol errors
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  MISSING_PAYMENT_HEADER: 'MISSING_PAYMENT_HEADER',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  FACILITATOR_ERROR: 'FACILITATOR_ERROR',
  RPC_ERROR: 'RPC_ERROR'
};

/**
 * Base error class for x402 SDK
 * Provides structured error information for programmatic handling
 */
class X402Error extends Error {
  /**
   * @param {string} code - Error code from ErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object} [details={}] - Additional error details
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'X402Error';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, X402Error);
    }
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

/**
 * Insufficient funds error
 */
class InsufficientFundsError extends X402Error {
  constructor(required, available, token, address) {
    super(
      ErrorCodes.INSUFFICIENT_FUNDS,
      `Insufficient ${token} balance: required ${required}, available ${available}`,
      { required, available, token, address }
    );
    this.name = 'InsufficientFundsError';
  }
}

/**
 * Amount exceeds maximum allowed
 */
class AmountExceedsMaxError extends X402Error {
  constructor(amount, maxAmount, token) {
    super(
      ErrorCodes.AMOUNT_EXCEEDS_MAX,
      `Payment amount ${amount} ${token} exceeds maximum allowed ${maxAmount} ${token}`,
      { amount, maxAmount, token }
    );
    this.name = 'AmountExceedsMaxError';
  }
}

/**
 * Invalid configuration error
 */
class ConfigError extends X402Error {
  constructor(message, field) {
    super(
      ErrorCodes.INVALID_CONFIG,
      message,
      { field }
    );
    this.name = 'ConfigError';
  }
}

/**
 * Network not supported error
 */
class UnsupportedNetworkError extends X402Error {
  constructor(network, supportedNetworks) {
    super(
      ErrorCodes.UNSUPPORTED_NETWORK,
      `Network '${network}' is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
      { network, supportedNetworks }
    );
    this.name = 'UnsupportedNetworkError';
  }
}

/**
 * Settlement failed error
 */
class SettlementError extends X402Error {
  constructor(message, statusCode, response) {
    super(
      ErrorCodes.SETTLEMENT_FAILED,
      message,
      { statusCode, response }
    );
    this.name = 'SettlementError';
  }
}

/**
 * Invalid 402 response error
 */
class InvalidResponseError extends X402Error {
  constructor(message, response) {
    super(
      ErrorCodes.INVALID_RESPONSE,
      message,
      { response }
    );
    this.name = 'InvalidResponseError';
  }
}

module.exports = {
  ErrorCodes,
  X402Error,
  InsufficientFundsError,
  AmountExceedsMaxError,
  ConfigError,
  UnsupportedNetworkError,
  SettlementError,
  InvalidResponseError
};
