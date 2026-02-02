// Tests for utils.js
// Run with: npm test

const {
  base64Encode,
  base64Decode,
  parsePaymentHeader,
  createBoundedCache,
  sleep,
  retryWithBackoff,
  NETWORKS,
  BASE_NETWORKS,
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
    const original = JSON.stringify({ x402Version: 2, scheme: 'exact' });
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    expect(decoded).toBe(original);
    expect(JSON.parse(decoded)).toEqual({ x402Version: 2, scheme: 'exact' });
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
  // Helper to create a valid payment header (x402 v2 format)
  const createValidHeader = (overrides = {}) => {
    const payment = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:8453',  // CAIP-2 format
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
      expect(result.error).toBe('Missing PAYMENT-SIGNATURE header');
    });

    test('rejects undefined header', () => {
      const result = parsePaymentHeader(undefined);
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing PAYMENT-SIGNATURE header');
    });

    test('rejects empty string', () => {
      const result = parsePaymentHeader('');
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing PAYMENT-SIGNATURE header');
    });

    test('rejects non-string input', () => {
      const result = parsePaymentHeader(12345);
      expect(result.payment).toBeNull();
      expect(result.error).toBe('Missing PAYMENT-SIGNATURE header');
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
      const payment = { x402Version: 2, network: 'eip155:8453', payload: {} };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing scheme');
    });

    test('rejects missing network', () => {
      const payment = { x402Version: 2, scheme: 'exact', payload: {} };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing network');
    });

    test('rejects missing payload', () => {
      const payment = { x402Version: 2, scheme: 'exact', network: 'eip155:8453' };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing payload');
    });

    test('rejects missing payload.signature', () => {
      const payment = {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        payload: { authorization: {} }
      };
      const header = base64Encode(JSON.stringify(payment));
      const result = parsePaymentHeader(header);
      expect(result.error).toContain('missing payload.signature');
    });

    test('rejects missing payload.authorization', () => {
      const payment = {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
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
      expect(result.payment.x402Version).toBe(2);
      expect(result.payment.scheme).toBe('exact');
      expect(result.payment.network).toBe('eip155:8453');
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
// Retry with Exponential Backoff
// ============================================

describe('sleep', () => {
  test('waits for specified duration', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);  // Allow some tolerance
    expect(elapsed).toBeLessThan(100);
  });
});

describe('retryWithBackoff', () => {
  test('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on retryable error and succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      baseDelayMs: 10,  // Short delay for testing
      maxDelayMs: 50
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws immediately on non-retryable error', async () => {
    const error = new Error('Bad request');
    error.status = 400;
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn, { baseDelayMs: 10 }))
      .rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throws after max retries exceeded', async () => {
    const error = { code: 'ECONNREFUSED' };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 20
    })).rejects.toEqual(error);

    expect(fn).toHaveBeenCalledTimes(3);  // Initial + 2 retries
  });

  test('retries on 5xx status codes', async () => {
    const error = { status: 503, message: 'Service Unavailable' };
    const fn = jest.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('recovered');

    const result = await retryWithBackoff(fn, { baseDelayMs: 10 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('uses custom isRetryable function', async () => {
    const customError = { type: 'TEMPORARY' };
    const fn = jest.fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      baseDelayMs: 10,
      isRetryable: (err) => err.type === 'TEMPORARY'
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('respects maxDelayMs cap', async () => {
    const error = { code: 'ETIMEDOUT' };
    let callTimes = [];

    const fn = jest.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.reject(error);
    });

    try {
      await retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 150  // Cap should limit delays
      });
    } catch (e) {
      // Expected to fail
    }

    // Check delays don't exceed maxDelayMs too much (with tolerance)
    for (let i = 1; i < callTimes.length; i++) {
      const delay = callTimes[i] - callTimes[i - 1];
      expect(delay).toBeLessThan(200);  // maxDelayMs + tolerance
    }
  });

  test('handles network error codes', async () => {
    const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

    for (const code of networkErrors) {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code })
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { baseDelayMs: 10 });
      expect(result).toBe('success');
    }
  });
});

// ============================================
// Constants
// ============================================

describe('constants', () => {
  // Base networks (CAIP-2 format)
  test('NETWORKS contains Base (eip155:8453)', () => {
    expect(NETWORKS['eip155:8453']).toBeDefined();
    expect(NETWORKS['eip155:8453'].chainId).toBe(8453);
  });

  test('NETWORKS contains Base Sepolia (eip155:84532)', () => {
    expect(NETWORKS['eip155:84532']).toBeDefined();
    expect(NETWORKS['eip155:84532'].chainId).toBe(84532);
  });

  // Ethereum networks (CAIP-2 format)
  test('NETWORKS contains Ethereum (eip155:1)', () => {
    expect(NETWORKS['eip155:1']).toBeDefined();
    expect(NETWORKS['eip155:1'].chainId).toBe(1);
  });

  test('NETWORKS contains Sepolia (eip155:11155111)', () => {
    expect(NETWORKS['eip155:11155111']).toBeDefined();
    expect(NETWORKS['eip155:11155111'].chainId).toBe(11155111);
  });

  // Arbitrum networks (CAIP-2 format)
  test('NETWORKS contains Arbitrum (eip155:42161)', () => {
    expect(NETWORKS['eip155:42161']).toBeDefined();
    expect(NETWORKS['eip155:42161'].chainId).toBe(42161);
  });

  test('NETWORKS contains Arbitrum Sepolia (eip155:421614)', () => {
    expect(NETWORKS['eip155:421614']).toBeDefined();
    expect(NETWORKS['eip155:421614'].chainId).toBe(421614);
  });

  // Optimism networks (CAIP-2 format)
  test('NETWORKS contains Optimism (eip155:10)', () => {
    expect(NETWORKS['eip155:10']).toBeDefined();
    expect(NETWORKS['eip155:10'].chainId).toBe(10);
  });

  test('NETWORKS contains Optimism Sepolia (eip155:11155420)', () => {
    expect(NETWORKS['eip155:11155420']).toBeDefined();
    expect(NETWORKS['eip155:11155420'].chainId).toBe(11155420);
  });

  // Polygon networks (CAIP-2 format)
  test('NETWORKS contains Polygon (eip155:137)', () => {
    expect(NETWORKS['eip155:137']).toBeDefined();
    expect(NETWORKS['eip155:137'].chainId).toBe(137);
  });

  test('NETWORKS contains Polygon Amoy (eip155:80002)', () => {
    expect(NETWORKS['eip155:80002']).toBeDefined();
    expect(NETWORKS['eip155:80002'].chainId).toBe(80002);
  });

  // BASE_NETWORKS (CAIP-2 format)
  test('BASE_NETWORKS contains only Base networks in CAIP-2 format', () => {
    expect(BASE_NETWORKS).toContain('eip155:8453');
    expect(BASE_NETWORKS).toContain('eip155:84532');
    expect(BASE_NETWORKS).not.toContain('eip155:1');
    expect(BASE_NETWORKS).not.toContain('eip155:42161');
  });

  test('DEFAULT_FACILITATOR is set', () => {
    expect(DEFAULT_FACILITATOR).toBe('https://x402.primer.systems');
  });
});
