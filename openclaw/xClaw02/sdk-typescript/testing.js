// xClaw02 - Testing Utilities
// Tools to help test x402 integrations without real payments
// https://primer.systems
//
// Usage:
//   const { createMockFacilitator, createTestPayment, fixtures } = require('xclaw02/testing');

const { createMockFacilitator } = require('./testing/mock-facilitator');
const { createTestPayment, createTest402Response } = require('./testing/test-payment');
const fixtures = require('./testing/fixtures');

module.exports = {
  // Mock facilitator server
  createMockFacilitator,

  // Test payment generators
  createTestPayment,
  createTest402Response,

  // Pre-built test data
  fixtures,

  // Convenience re-exports from fixtures
  TEST_ADDRESSES: fixtures.TEST_ADDRESSES,
  USDC_ADDRESSES: fixtures.USDC_ADDRESSES
};
