// xClaw02 - Mock Facilitator
// A fake facilitator server for testing x402 integrations
// x402 v2 - CAIP-2 network format
// https://primer.systems

const http = require('http');

/**
 * Create a mock facilitator server for testing
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.port=0] - Port to listen on (0 = random available port)
 * @param {string} [options.mode='approve'] - Behavior mode: 'approve', 'reject', or 'custom'
 * @param {Function} [options.handler] - Custom handler for 'custom' mode
 * @param {number} [options.latencyMs=0] - Artificial latency to simulate network delay
 * @returns {Promise<MockFacilitator>} Mock facilitator instance
 *
 * @example
 * // Basic usage - auto-approve all payments
 * const mock = await createMockFacilitator({ port: 3001 });
 * console.log(mock.url); // http://localhost:3001
 *
 * // Use with middleware
 * const middleware = x402Express(payTo, routes, { facilitator: mock.url });
 *
 * // Clean up when done
 * await mock.close();
 *
 * @example
 * // Reject all payments
 * const mock = await createMockFacilitator({ mode: 'reject' });
 *
 * @example
 * // Custom logic
 * const mock = await createMockFacilitator({
 *   mode: 'custom',
 *   handler: (payload) => {
 *     if (payload.paymentRequirements.maxAmountRequired > 100000) {
 *       return { success: false, error: 'Amount too high' };
 *     }
 *     return { success: true, transaction: '0x...' };
 *   }
 * });
 */
async function createMockFacilitator(options = {}) {
  const {
    port = 0,
    mode = 'approve',
    handler = null,
    latencyMs = 0
  } = options;

  // Track all received requests for assertions
  const requests = [];

  const server = http.createServer(async (req, res) => {
    // Add artificial latency if configured
    if (latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, latencyMs));
    }

    // CORS headers for browser testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/settle') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          requests.push({ timestamp: Date.now(), payload });

          let response;

          if (mode === 'approve') {
            response = createApprovalResponse(payload);
          } else if (mode === 'reject') {
            response = createRejectionResponse('Payment rejected by mock facilitator');
          } else if (mode === 'custom' && handler) {
            response = handler(payload);
          } else {
            response = createApprovalResponse(payload);
          }

          if (response.success === false) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  // Start server and wait for it to be ready
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  return {
    /** The URL to use as facilitator in middleware options */
    url,

    /** The port the server is listening on */
    port: address.port,

    /** Array of all requests received (for assertions) */
    requests,

    /** Close the server */
    close: () => new Promise(resolve => server.close(resolve)),

    /** Clear recorded requests */
    clearRequests: () => { requests.length = 0; },

    /** Get the last request received */
    lastRequest: () => requests[requests.length - 1]
  };
}

/**
 * Create a successful approval response
 * @private
 */
function createApprovalResponse(payload) {
  const txHash = '0x' + 'f'.repeat(64); // Fake transaction hash

  return {
    success: true,
    transaction: txHash,
    network: payload.paymentRequirements?.network || 'eip155:8453',  // CAIP-2 format
    payer: payload.paymentPayload?.payload?.authorization?.from || '0x0000000000000000000000000000000000000000'
  };
}

/**
 * Create a rejection response
 * @private
 */
function createRejectionResponse(reason) {
  return {
    success: false,
    error: reason
  };
}

module.exports = {
  createMockFacilitator
};
