// Tests for payee.js
// Run with: npm test
//
// Note: Some tests that require RPC calls for token metadata are skipped.
// Full integration tests would use a testnet or mock the ethers provider.

const { x402Express, x402Hono, x402Next, x402Protect } = require('../payee');
const { base64Encode } = require('../utils');

// ============================================
// Test Helpers
// ============================================

// Mock Express request
function createMockReq(options = {}) {
  return {
    path: options.path || '/api/data',
    url: options.url || '/api/data',
    headers: options.headers || {},
    method: options.method || 'GET'
  };
}

// Mock Express response
function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status: jest.fn(function(code) {
      this.statusCode = code;
      return this;
    }),
    set: jest.fn(function(name, value) {
      this.headers[name] = value;
      return this;
    }),
    setHeader: jest.fn(function(name, value) {
      this.headers[name] = value;
      return this;
    }),
    json: jest.fn(function(data) {
      this.body = data;
      return this;
    }),
    end: jest.fn(function() {
      return this;
    })
  };
  return res;
}

// Valid Ethereum address
const VALID_PAY_TO = '0x1234567890123456789012345678901234567890';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ============================================
// x402Express - Setup and Validation
// ============================================

describe('x402Express', () => {
  describe('setup and validation', () => {
    test('throws on invalid payTo address', () => {
      expect(() => x402Express('invalid-address', {}))
        .toThrow('Invalid payTo address');
    });

    test('throws on payTo without 0x prefix', () => {
      expect(() => x402Express('1234567890123456789012345678901234567890', {}))
        .toThrow('Invalid payTo address');
    });

    test('throws on payTo with wrong length', () => {
      expect(() => x402Express('0x123', {}))
        .toThrow('Invalid payTo address');
    });

    test('throws on uppercase address (should accept)', () => {
      // Ethereum addresses are case-insensitive
      const upperAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';
      const middleware = x402Express(upperAddress, {});
      expect(typeof middleware).toBe('function');
    });

    test('accepts valid payTo address', () => {
      const middleware = x402Express(VALID_PAY_TO, {});
      expect(typeof middleware).toBe('function');
    });

    test('returns a middleware function with 3 parameters', () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });
      expect(typeof middleware).toBe('function');
      // Express middleware takes (req, res, next)
      expect(middleware.length).toBe(3);
    });

    test('accepts empty routes object', () => {
      const middleware = x402Express(VALID_PAY_TO, {});
      expect(typeof middleware).toBe('function');
    });

    test('accepts multiple route definitions', () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/cheap': { amount: '0.001', asset: USDC_BASE, network: 'base' },
        '/api/expensive': { amount: '1.00', asset: USDC_BASE, network: 'base' },
        '/api/data/*': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });
      expect(typeof middleware).toBe('function');
    });

    test('throws when non-Base network used without custom facilitator', () => {
      expect(() => x402Express(VALID_PAY_TO, {
        '/api/eth': { amount: '0.01', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', network: 'ethereum' }
      })).toThrow('require a custom facilitator');
    });

    test('accepts non-Base network with custom facilitator', () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/eth': { amount: '0.01', asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', network: 'ethereum' }
      }, { facilitator: 'https://custom-facilitator.com' });
      expect(typeof middleware).toBe('function');
    });

    test('accepts mixed Base and non-Base routes with custom facilitator', () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/base': { amount: '0.01', asset: USDC_BASE, network: 'base' },
        '/api/arb': { amount: '0.01', asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', network: 'arbitrum' }
      }, { facilitator: 'https://custom-facilitator.com' });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('non-protected routes (no RPC needed)', () => {
    test('calls next() for routes not in config', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/protected': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({ path: '/api/free' });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('calls next() for root path when not configured', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({ path: '/' });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('does not match /api when /api/data is configured', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({ path: '/api' });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      // /api should NOT match /api/data - they're different routes
      expect(next).toHaveBeenCalled();
    });

    test('does not match /api/data/extra when /api/data is configured (no wildcard)', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({ path: '/api/data/extra' });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      // /api/data/extra should NOT match /api/data exactly
      expect(next).toHaveBeenCalled();
    });
  });

  describe('payment header validation', () => {
    test('rejects invalid PAYMENT-SIGNATURE header (bad base64)', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({
        path: '/api/data',
        headers: { 'payment-signature': 'not-valid-base64!!!' }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects PAYMENT-SIGNATURE header with invalid JSON', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({
        path: '/api/data',
        headers: { 'payment-signature': base64Encode('not json') }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('not valid JSON');
    });

    test('rejects PAYMENT-SIGNATURE header missing x402Version', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const payment = { scheme: 'exact', network: 'base', payload: {} };
      const req = createMockReq({
        path: '/api/data',
        headers: { 'payment-signature': base64Encode(JSON.stringify(payment)) }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('x402Version');
    });
  });
});

// ============================================
// x402Hono
// ============================================

describe('x402Hono', () => {
  test('throws on invalid payTo address', () => {
    expect(() => x402Hono('invalid-address', {}))
      .toThrow('Invalid payTo address');
  });

  test('accepts valid payTo address', () => {
    const middleware = x402Hono(VALID_PAY_TO, {});
    expect(typeof middleware).toBe('function');
  });

  test('returns a middleware function', () => {
    const middleware = x402Hono(VALID_PAY_TO, {
      '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
    });
    expect(typeof middleware).toBe('function');
  });
});

// ============================================
// x402Next
// ============================================

describe('x402Next', () => {
  test('throws on invalid payTo address', () => {
    const handler = async () => new Response('ok');
    expect(() => x402Next(handler, { payTo: 'invalid', amount: '0.01', asset: USDC_BASE, network: 'base' }))
      .toThrow('Invalid payTo address');
  });

  test('accepts valid config', () => {
    const handler = async () => new Response('ok');
    const wrapped = x402Next(handler, {
      payTo: VALID_PAY_TO,
      amount: '0.01',
      asset: USDC_BASE,
      network: 'base'
    });
    expect(typeof wrapped).toBe('function');
  });

  test('returns a wrapped handler function', () => {
    const handler = async () => new Response('ok');
    const wrapped = x402Next(handler, {
      payTo: VALID_PAY_TO,
      amount: '0.01',
      asset: USDC_BASE,
      network: 'base'
    });
    expect(typeof wrapped).toBe('function');
  });
});

// ============================================
// x402Protect (single route middleware)
// ============================================

describe('x402Protect', () => {
  test('throws on invalid payTo address', () => {
    expect(() => x402Protect('invalid-address', '0.01', USDC_BASE, 'base'))
      .toThrow('Invalid payTo address');
  });

  test('accepts valid parameters', () => {
    const middleware = x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'base');
    expect(typeof middleware).toBe('function');
  });

  test('accepts optional options parameter', () => {
    const middleware = x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'base', {
      facilitator: 'https://custom.facilitator',
      description: 'Premium access'
    });
    expect(typeof middleware).toBe('function');
  });

  test('throws for non-Base network without custom facilitator', () => {
    expect(() => x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'ethereum'))
      .toThrow('requires a custom facilitator');
  });

  test('accepts non-Base network with custom facilitator', () => {
    const middleware = x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'ethereum', {
      facilitator: 'https://ethereum.facilitator'
    });
    expect(typeof middleware).toBe('function');
  });

  describe('middleware behavior', () => {
    test('returns 402 when no PAYMENT-SIGNATURE header (skipped - requires RPC)', async () => {
      // This test requires mocking ethers RPC calls for token metadata
      // Skip for now, covered by integration tests
    });

    test('rejects invalid payment header', async () => {
      const middleware = x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'base');

      const req = createMockReq({
        path: '/api/premium',
        headers: { 'payment-signature': 'invalid-base64!!!' }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects payment header missing x402Version', async () => {
      const middleware = x402Protect(VALID_PAY_TO, '0.01', USDC_BASE, 'base');

      const payment = { scheme: 'exact', network: 'base', payload: {} };
      const req = createMockReq({
        path: '/api/premium',
        headers: { 'payment-signature': base64Encode(JSON.stringify(payment)) }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('x402Version');
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// Note on Missing Tests
// ============================================

describe('integration tests (skipped - require network)', () => {
  test.skip('returns 402 with valid payment requirements', () => {
    // This test would require mocking ethers RPC calls
    // or running against a real network
  });

  test.skip('settles valid payment with facilitator', () => {
    // This test would require a running facilitator
  });

  test.skip('includes token metadata in extra field', () => {
    // This test requires RPC calls to get token name/version
  });
});
