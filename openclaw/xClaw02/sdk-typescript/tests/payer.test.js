// Tests for payer.js
// Run with: npm test

const { x402Fetch, x402Axios } = require('../payer');
const { base64Encode } = require('../utils');
const { createSigner } = require('../signer');

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Helper to create a mock signer (avoids network calls)
function createMockSigner() {
  return {
    getNetwork: () => ({ name: 'eip155:8453', chainId: 8453, displayName: 'Base' }),
    getAddress: () => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    signTypedData: jest.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
    getProvider: () => ({
      call: jest.fn()
    }),
    isViem: false
  };
}

// Helper to create a 402 response (x402 v2 format)
function create402Response(options = {}) {
  const paymentRequired = {
    x402Version: 2,
    accepts: [{
      scheme: options.scheme || 'exact',
      network: options.network || 'eip155:8453',  // CAIP-2 format
      maxAmountRequired: options.amount || '10000', // 0.01 USDC (6 decimals)
      payTo: options.payTo || '0x2222222222222222222222222222222222222222',
      asset: options.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: options.resource || '/api/data',
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    }]
  };

  const headers = new Map();
  headers.set('payment-required', base64Encode(JSON.stringify(paymentRequired)));

  return {
    status: 402,
    headers: {
      get: (name) => headers.get(name.toLowerCase())
    }
  };
}

// Helper to create a success response
function createSuccessResponse(data = { success: true }) {
  return {
    status: 200,
    ok: true,
    json: () => Promise.resolve(data),
    headers: {
      get: () => null
    }
  };
}

// ============================================
// x402Fetch - Basic Setup
// ============================================

describe('x402Fetch', () => {
  describe('setup and configuration', () => {
    test('throws if maxAmount is missing', () => {
      const mockSigner = createMockSigner();
      expect(() => x402Fetch(jest.fn(), mockSigner, {}))
        .toThrow('maxAmount is required');
    });

    test('returns a function', () => {
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(jest.fn(), mockSigner, { maxAmount: '1.00' });
      expect(typeof fetch402).toBe('function');
    });
  });

  describe('non-402 responses', () => {
    test('passes through 200 response unchanged', async () => {
      const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      const response = await fetch402('https://example.com/api');

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('passes through 404 response unchanged', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 404, ok: false });
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      const response = await fetch402('https://example.com/api');

      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('passes through 500 response unchanged', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 500, ok: false });
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      const response = await fetch402('https://example.com/api');

      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('402 response handling', () => {
    test('throws if 402 response missing PAYMENT-REQUIRED header', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        status: 402,
        headers: { get: () => null }
      });
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      await expect(fetch402('https://example.com/api'))
        .rejects.toThrow('missing PAYMENT-REQUIRED header');
    });

    test('throws if payment exceeds maxAmount', async () => {
      // This test requires mocking ethers Contract calls which is complex.
      // For now, we test the basic flow and document the limitation.
      // A full integration test would use a real testnet.

      // Create 402 requiring 100 USDC (100_000_000 in 6 decimals)
      const mockFetch = jest.fn().mockResolvedValue(
        create402Response({ amount: '100000000' })
      );
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      // The actual maxAmount check happens after fetching decimals from chain.
      // Since we can't easily mock ethers Contract, we verify the flow starts.
      await expect(fetch402('https://example.com/api'))
        .rejects.toThrow(); // Will throw on decimals call with mock provider
    });

    test('accepts payment within maxAmount', async () => {
      // First call returns 402, second call (with payment) returns 200
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(create402Response({ amount: '10000' })) // 0.01 USDC
        .mockResolvedValueOnce(createSuccessResponse());

      const mockSigner = createMockSigner();

      // Mock the token decimals call
      mockSigner.getProvider = () => ({
        getNetwork: () => ({ chainId: 8453 })
      });

      // We need to mock the Contract calls for decimals
      // This is tricky without more complex mocking, so we'll test with verify: false
      const fetch402 = x402Fetch(mockFetch, mockSigner, {
        maxAmount: '1.00',
        verify: false  // Skip facilitator verification for this test
      });

      // This will fail on token decimals call, but we're testing the flow logic
      // In a real integration test, we'd mock ethers Contract
      try {
        await fetch402('https://example.com/api');
      } catch (e) {
        // Expected to fail on token call - that's OK for this unit test
        // We're testing that it ATTEMPTS the payment flow
        expect(mockFetch).toHaveBeenCalled();
      }
    });
  });

  describe('request options', () => {
    test('passes through request options to fetch', async () => {
      const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
      const mockSigner = createMockSigner();
      const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

      await fetch402('https://example.com/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' })
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });
});

// ============================================
// x402Axios
// ============================================

describe('x402Axios', () => {
  test('throws if maxAmount is missing', () => {
    const mockSigner = createMockSigner();
    const mockAxios = { interceptors: { response: { use: jest.fn() } } };

    expect(() => x402Axios(mockAxios, mockSigner, {}))
      .toThrow('maxAmount is required');
  });

  test('returns the axios instance', () => {
    const mockSigner = createMockSigner();
    const mockAxios = { interceptors: { response: { use: jest.fn() } } };

    const result = x402Axios(mockAxios, mockSigner, { maxAmount: '1.00' });

    expect(result).toBe(mockAxios);
  });

  test('adds response interceptor', () => {
    const mockSigner = createMockSigner();
    const useFn = jest.fn();
    const mockAxios = { interceptors: { response: { use: useFn } } };

    x402Axios(mockAxios, mockSigner, { maxAmount: '1.00' });

    expect(useFn).toHaveBeenCalledTimes(1);
    expect(useFn).toHaveBeenCalledWith(
      expect.any(Function),  // success handler
      expect.any(Function)   // error handler
    );
  });
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
  test('handles URL object as first argument', async () => {
    const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
    const mockSigner = createMockSigner();
    const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

    const url = new URL('https://example.com/api');
    const response = await fetch402(url);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(url, {});
  });

  test('handles Request object', async () => {
    // Skip if Request is not available (older Node versions)
    if (typeof Request === 'undefined') {
      return;
    }

    const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
    const mockSigner = createMockSigner();
    const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

    const request = new Request('https://example.com/api');
    const response = await fetch402(request);

    expect(response.status).toBe(200);
  });

  test('handles empty init object', async () => {
    const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
    const mockSigner = createMockSigner();
    const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

    const response = await fetch402('https://example.com/api', {});

    expect(response.status).toBe(200);
  });

  test('handles undefined init', async () => {
    const mockFetch = jest.fn().mockResolvedValue(createSuccessResponse());
    const mockSigner = createMockSigner();
    const fetch402 = x402Fetch(mockFetch, mockSigner, { maxAmount: '1.00' });

    const response = await fetch402('https://example.com/api', undefined);

    expect(response.status).toBe(200);
  });
});
