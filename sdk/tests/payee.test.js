// Tests for payee.js
// Run with: npm test
//
// Note: Some tests that require RPC calls for token metadata are skipped.
// Full integration tests would use a testnet or mock the ethers provider.

const { x402Express, x402Hono, x402Next } = require('../payee');
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
    test('rejects invalid X-PAYMENT header (bad base64)', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({
        path: '/api/data',
        headers: { 'x-payment': 'not-valid-base64!!!' }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects X-PAYMENT header with invalid JSON', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const req = createMockReq({
        path: '/api/data',
        headers: { 'x-payment': base64Encode('not json') }
      });
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toContain('not valid JSON');
    });

    test('rejects X-PAYMENT header missing x402Version', async () => {
      const middleware = x402Express(VALID_PAY_TO, {
        '/api/data': { amount: '0.01', asset: USDC_BASE, network: 'base' }
      });

      const payment = { scheme: 'exact', network: 'base', payload: {} };
      const req = createMockReq({
        path: '/api/data',
        headers: { 'x-payment': base64Encode(JSON.stringify(payment)) }
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
