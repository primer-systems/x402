// Tests for utils.js
// Run with: npm test

const {
  base64Encode,
  base64Decode,
  parsePaymentHeader,
  createBoundedCache,
  NETWORKS,
  DEFAULT_FACILITATOR
} = require('../utils');

// ============================================
// Base64 Encoding/Decoding
// ============================================

describe('base64Encode / base64Decode', () => {
  test('encodes and decodes simple string', () => {
    const original = 'hello world';
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    expect(decoded).toBe(original);
  });

  test('encodes and decodes JSON', () => {
    const original = JSON.stringify({ x402Version: 1, scheme: 'exact' });
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    expect(decoded).toBe(original);
    expect(JSON.parse(decoded)).toEqual({ x402Version: 1, scheme: 'exact' });
  });

  test('handles unicode characters', () => {
    const original = 'Hello 世界 🌍';
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    expect(decoded).toBe(original);
  });

  test('handles empty string', () => {
    const encoded = base64Encode('');
    const decoded = base64Decode(encoded);
    expect(decoded).toBe('');
  });
});

// ============================================
// Payment Header Parsing
// ============================================

describe('parsePaymentHeader', () => {
  // Helper to create a valid payment header
  const createValidHeader = (overrides = {}) => {
    const payment = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: {
        signature: '0x1234567890abcdef',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000'
        }
      },
      ...overrides
    };
    return base64Encode(JSON.stringify(payment));
  };

  describe('invalid inputs', () => {
    test('rejects null header', () => {
      const result = parsePaymentHeader(null);
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing X-PAYMENT header');
    });

    test('rejects undefined header', () => {
      const result = parsePaymentHeader(undefined);
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing X-PAYMENT header');
    });

    test('rejects empty string', () => {
      const result = parsePaymentHeader('');
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing X-PAYMENT header');
    });

    test('rejects non-string input', () => {
      const result = parsePaymentHeader(12345);
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing X-PAYMENT header');
    });

    test('rejects invalid base64 / garbage input', () => {
      // Note: Node's Buffer.from is permissive with base64, so garbage
      // input often becomes garbage JSON rather than a base64 error
      const result = parsePaymentHeader('not-valid-base64!!!');
      expect(result.payment).toBeNull();
      expect(result.error).toBeDefined();
    });

    test('rejects valid base64 but invalid JSON', () => {
      const header = base64Encode('not json at all');
      const result = parsePaymentHeader(header);
      expect(result.payment).toBeNull();
      expect(result.error).toContain('not valid JSON');
    });
  });

  describe('missing required fields', () => {
    test('rejects missing x402Version', () => {
      const payment = { scheme: 'exact', network: 'base', payload: {} };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing x402Version');
    });

    test('rejects unsupported x402Version', () => {
      const header = createValidHeader({ x402Version: 99 });
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('Unsupported x402Version');
    });

    test('rejects missing scheme', () => {
      const payment = { x402Version: 1, network: 'base', payload: {} };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing scheme');
    });

    test('rejects missing network', () => {
      const payment = { x402Version: 1, scheme: 'exact', payload: {} };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing network');
    });

    test('rejects missing payload', () => {
      const payment = { x402Version: 1, scheme: 'exact', network: 'base' };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing payload');
    });

    test('rejects missing payload.signature', () => {
      const payment = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base',
        payload: { authorization: {} }
      };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing payload.signature');
    });

    test('rejects missing payload.authorization', () => {
      const payment = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base',
        payload: { signature: '0x123' }
      };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing payload.authorization');
    });
  });

  describe('valid payments', () => {
    test('accepts valid payment header', () => {
      const header = createValidHeader();
      const result = parsePaymentHeader(header);
      expect(result.error).toBeNull();
      expect(result.payment).not.toBeNull();
      expect(result.payment.x402Version).toBe(1);
      expect(result.payment.scheme).toBe('exact');
      expect(result.payment.network).toBe('base');
    });

    test('preserves all payment fields', () => {
      const header = createValidHeader();
      const result = parsePaymentHeader(header);
      expect(result.payment.payload.signature).toBe('0x1234567890abcdef');
      expect(result.payment.payload.authorization.from).toBe('0x1111111111111111111111111111111111111111');
      expect(result.payment.payload.authorization.value).toBe('1000000');
    });
  });
});

// ============================================
// Bounded Cache
// ============================================

describe('createBoundedCache', () => {
  test('stores and retrieves values', () => {
    const cache = createBoundedCache(10);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('returns undefined for missing keys', () => {
    const cache = createBoundedCache(10);
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('has() returns correct boolean', () => {
    const cache = createBoundedCache(10);
    expect(cache.has('key1')).toBe(false);
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
  });

  test('evicts oldest entry when at capacity', () => {
    const cache = createBoundedCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Cache is now full: [a, b, c]

    cache.set('d', 4);
    // Should evict 'a': [b, c, d]

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('accessing a key moves it to most recent', () => {
    const cache = createBoundedCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' to make it most recent
    cache.get('a');

    // Add new item - should evict 'b' (now oldest)
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1);  // Still there
    expect(cache.get('b')).toBeUndefined();  // Evicted
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('clear() removes all entries', () => {
    const cache = createBoundedCache(10);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  test('size() returns correct count', () => {
    const cache = createBoundedCache(10);
    expect(cache.size()).toBe(0);
    cache.set('a', 1);
    expect(cache.size()).toBe(1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
  });

  test('updating existing key does not increase size', () => {
    const cache = createBoundedCache(10);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.size()).toBe(1);
    expect(cache.get('a')).toBe(2);
  });
});

// ============================================
// Constants
// ============================================

describe('constants', () => {
  test('NETWORKS contains base', () => {
    expect(NETWORKS['base']).toBeDefined();
    expect(NETWORKS['base'].chainId).toBe(8453);
  });

  test('NETWORKS contains base-sepolia', () => {
    expect(NETWORKS['base-sepolia']).toBeDefined();
    expect(NETWORKS['base-sepolia'].chainId).toBe(84532);
  });

  test('DEFAULT_FACILITATOR is set', () => {
    expect(DEFAULT_FACILITATOR).toBe('https://x402.primer.systems');
  });
});
