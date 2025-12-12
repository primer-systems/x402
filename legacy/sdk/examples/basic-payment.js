// Basic x402 Payment Example
// Demonstrates using x402Fetch to pay for an API
//
// Usage:
//   PRIVATE_KEY=0x... NETWORK=bsc MAX_AMOUNT=0.10 API_URL=https://api.example.com node basic-payment.js
//
// Or with dotenv (install separately: npm install dotenv):
//   Create .env file, then: node -r dotenv/config basic-payment.js

const { createSigner, x402Fetch } = require('../');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const NETWORK = process.env.NETWORK || 'bsc';
const API_URL = process.env.API_URL;
const MAX_AMOUNT = process.env.MAX_AMOUNT;

async function main() {
  if (!PRIVATE_KEY) {
    console.error('Missing PRIVATE_KEY environment variable');
    console.error('');
    console.error('Usage:');
    console.error('  PRIVATE_KEY=0x... NETWORK=bsc MAX_AMOUNT=0.10 API_URL=https://api.example.com node basic-payment.js');
    console.error('');
    console.error('Environment variables:');
    console.error('  PRIVATE_KEY  - Your wallet private key (required)');
    console.error('  NETWORK      - Network name: bsc, bsc-testnet (default: bsc)');
    console.error('  MAX_AMOUNT   - Maximum tokens to pay per request (required)');
    console.error('  API_URL      - The paid API endpoint to call (required)');
    process.exit(1);
  }

  if (!MAX_AMOUNT) {
    console.error('Missing MAX_AMOUNT environment variable');
    console.error('You must specify the maximum amount you are willing to pay per request.');
    console.error('Example: MAX_AMOUNT=0.10');
    process.exit(1);
  }

  if (!API_URL) {
    console.error('Missing API_URL environment variable');
    console.error('Specify the paid API endpoint to call.');
    console.error('Example: API_URL=https://api.example.com/premium');
    process.exit(1);
  }

  console.log('=== x402 Payment Example ===\n');

  // Step 1: Create signer
  console.log('Creating signer...');
  const signer = await createSigner(NETWORK, PRIVATE_KEY);
  console.log('  Network:', signer.getNetwork().displayName);
  console.log('  Address:', signer.getAddress());
  console.log('');

  // Step 2: Wrap fetch with payment capability
  console.log('Wrapping fetch with x402...');
  const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: MAX_AMOUNT });
  console.log('  Max amount per request:', MAX_AMOUNT, 'tokens');
  console.log('');

  // Step 3: Make request (payment happens automatically if needed)
  console.log('Fetching:', API_URL);
  console.log('');

  try {
    const response = await fetchWithPay(API_URL);

    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:');
      console.log(JSON.stringify(data, null, 2));

      // Check if payment was made
      const paymentResponse = response.headers.get('x-payment-response');
      if (paymentResponse) {
        const payment = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
        console.log('\nPayment settled:');
        console.log('  TX Hash:', payment.txHash);
      }
    } else {
      console.log('Request failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
