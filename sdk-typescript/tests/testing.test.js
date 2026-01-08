// Tests for x402 testing utilities
const {
  createMockFacilitator,
  createTestPayment,
  createTest402Response,
  fixtures,
  TEST_ADDRESSES,
  USDC_ADDRESSES
} = require('../testing');

const { parsePaymentHeader } = require('../utils');

describe('Testing Utilities', () => {
  describe('fixtures', () => {
    test('exports TEST_ADDRESSES', () => {
      expect(fixtures.TEST_ADDRESSES).toBeDefined();
      expect(fixtures.TEST_ADDRESSES.payer).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(fixtures.TEST_ADDRESSES.payee).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('exports USDC_ADDRESSES for supported networks', () => {
      expect(fixtures.USDC_ADDRESSES['eip155:8453']).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(fixtures.USDC_ADDRESSES['eip155:84532']).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test('exports sampleRouteConfig', () => {
      expect(fixtures.sampleRouteConfig).toBeDefined();
      expect(fixtures.sampleRouteConfig['/api/premium']).toBeDefined();
      expect(fixtures.sampleRouteConfig['/api/premium'].amount).toBe('0.01');
    });

    test('exports sample402ResponseBody', () => {
      expect(fixtures.sample402ResponseBody).toBeDefined();
      expect(fixtures.sample402ResponseBody.x402Version).toBe(2);
      expect(fixtures.sample402ResponseBody.accepts).toBeInstanceOf(Array);
    });

    test('exports samplePaymentPayload', () => {
      expect(fixtures.samplePaymentPayload).toBeDefined();
      expect(fixtures.samplePaymentPayload.x402Version).toBe(2);
      expect(fixtures.samplePaymentPayload.scheme).toBe('exact');
    });

    test('re-exports TEST_ADDRESSES at top level', () => {
      expect(TEST_ADDRESSES).toEqual(fixtures.TEST_ADDRESSES);
    });

    test('re-exports USDC_ADDRESSES at top level', () => {
      expect(USDC_ADDRESSES).toEqual(fixtures.USDC_ADDRESSES);
    });
  });

  describe('createTestPayment', () => {
    test('creates a valid base64 payment header', () => {
      const header = createTestPayment();
      expect(typeof header).toBe('string');
      // Should be base64
      expect(() => Buffer.from(header, 'base64')).not.toThrow();
    });

    test('creates parseable payment header', () => {
      const header = createTestPayment();
      const { payment, error } = parsePaymentHeader(header);
      expect(error).toBeNull();
      expect(payment).toBeDefined();
      expect(payment.x402Version).toBe(2);
      expect(payment.scheme).toBe('exact');
    });

    test('uses default test addresses', () => {
      const header = createTestPayment();
      const { payment } = parsePaymentHeader(header);
      expect(payment.payload.authorization.from).toBe(TEST_ADDRESSES.payer);
      expect(payment.payload.authorization.to).toBe(TEST_ADDRESSES.payee);
    });

    test('accepts custom amount', () => {
      const header = createTestPayment({ amount: '50000' });
      const { payment } = parsePaymentHeader(header);
      expect(payment.payload.authorization.value).toBe('50000');
    });

    test('accepts custom addresses', () => {
      const customFrom = '0x1111111111111111111111111111111111111111';
      const customTo = '0x2222222222222222222222222222222222222222';
      const header = createTestPayment({ from: customFrom, to: customTo });
      const { payment } = parsePaymentHeader(header);
      expect(payment.payload.authorization.from).toBe(customFrom);
      expect(payment.payload.authorization.to).toBe(customTo);
    });

    test('accepts custom network', () => {
      const header = createTestPayment({ network: 'eip155:84532' });
      const { payment } = parsePaymentHeader(header);
      expect(payment.network).toBe('eip155:84532');
    });

    test('sets valid time window', () => {
      const header = createTestPayment({ validForSeconds: 7200 });
      const { payment } = parsePaymentHeader(header);
      const now = Math.floor(Date.now() / 1000);
      const validBefore = parseInt(payment.payload.authorization.validBefore);
      // Should be approximately 2 hours from now
      expect(validBefore).toBeGreaterThan(now + 7000);
      expect(validBefore).toBeLessThan(now + 7400);
    });
  });

  describe('createTest402Response', () => {
    test('creates valid 402 response structure', () => {
      const response = createTest402Response();
      expect(response.x402Version).toBe(2);
      expect(response.accepts).toBeInstanceOf(Array);
      expect(response.accepts.length).toBe(1);
    });

    test('includes required fields', () => {
      const response = createTest402Response();
      const accept = response.accepts[0];
      expect(accept.scheme).toBe('exact');
      expect(accept.network).toBeDefined();
      expect(accept.maxAmountRequired).toBeDefined();
      expect(accept.payTo).toBeDefined();
      expect(accept.asset).toBeDefined();
    });

    test('accepts custom options', () => {
      const response = createTest402Response({
        amount: '50000',
        network: 'eip155:84532',
        resource: '/api/custom'
      });
      const accept = response.accepts[0];
      expect(accept.maxAmountRequired).toBe('50000');
      expect(accept.network).toBe('eip155:84532');
      expect(accept.resource).toBe('/api/custom');
    });
  });

  describe('createMockFacilitator', () => {
    let mock;

    afterEach(async () => {
      if (mock) {
        await mock.close();
        mock = null;
      }
    });

    test('starts server on available port', async () => {
      mock = await createMockFacilitator();
      expect(mock.port).toBeGreaterThan(0);
      expect(mock.url).toBe(`http://127.0.0.1:${mock.port}`);
    });

    test('starts server on specified port', async () => {
      mock = await createMockFacilitator({ port: 19402 });
      expect(mock.port).toBe(19402);
    });

    test('approves payments in approve mode', async () => {
      mock = await createMockFacilitator({ mode: 'approve' });

      const response = await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload: { payload: { authorization: { from: '0xabc' } } },
          paymentRequirements: { network: 'eip155:8453' }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.transaction).toBeDefined();
    });

    test('rejects payments in reject mode', async () => {
      mock = await createMockFacilitator({ mode: 'reject' });

      const response = await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload: {},
          paymentRequirements: {}
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('supports custom handler', async () => {
      mock = await createMockFacilitator({
        mode: 'custom',
        handler: (payload) => {
          if (payload.paymentRequirements?.maxAmountRequired === '999') {
            return { success: false, error: 'Custom rejection' };
          }
          return { success: true, transaction: '0xcustom', custom: true };
        }
      });

      // Test approval
      const res1 = await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentRequirements: { maxAmountRequired: '100' }
        })
      });
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.custom).toBe(true);

      // Test rejection
      const res2 = await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentRequirements: { maxAmountRequired: '999' }
        })
      });
      const data2 = await res2.json();
      expect(data2.success).toBe(false);
      expect(data2.error).toBe('Custom rejection');
    });

    test('tracks requests', async () => {
      mock = await createMockFacilitator();

      expect(mock.requests.length).toBe(0);

      await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' })
      });

      expect(mock.requests.length).toBe(1);
      expect(mock.requests[0].payload.test).toBe('data');
      expect(mock.lastRequest().payload.test).toBe('data');
    });

    test('clears requests', async () => {
      mock = await createMockFacilitator();

      await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' })
      });

      expect(mock.requests.length).toBe(1);
      mock.clearRequests();
      expect(mock.requests.length).toBe(0);
    });

    test('returns 404 for unknown endpoints', async () => {
      mock = await createMockFacilitator();

      const response = await fetch(`${mock.url}/unknown`);
      expect(response.status).toBe(404);
    });

    test('adds latency when configured', async () => {
      mock = await createMockFacilitator({ latencyMs: 100 });

      const start = Date.now();
      await fetch(`${mock.url}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some timing variance
    });
  });
});
