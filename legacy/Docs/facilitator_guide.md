# Primer x402 Facilitator Guide

**Production Endpoint:** `https://x402.primersystems.ai`

The Primer x402 Facilitator is an x402 spec-compliant service that verifies and settles gasless token payments. It supports both EIP-3009 tokens (like USDC) and standard ERC-20 tokens (via our Stargate proxy).

---

## What Does It Do?

The facilitator acts as a trusted intermediary that:

1. **Verifies** payment signatures are valid and secure
2. **Settles** payments on-chain by broadcasting transactions
3. **Pays gas fees** so users don't need native tokens (ETH)
4. **Auto-detects** token types and routes appropriately

**You sign. We settle. Zero gas.**

---

## Supported Networks

| Network | Chain ID | Name |
|---------|----------|------|
| `base` | 8453 | Base Mainnet |
| `base-sepolia` | 84532 | Base Sepolia Testnet |

Always use **text network names** (e.g., `"base"`, `"base-sepolia"`), not numeric chain IDs.

---

## API Endpoints

### POST `/verify`

Verifies a payment signature without settling it on-chain.

**Use case:** Check if payment is valid before providing a resource/service.

**Request:**
```json
{
  "x402Version": 1,                           // Always 1
  "paymentPayload": {
    "x402Version": 1,                         // Always 1
    "scheme": "exact",                        // Always "exact"
    "network": "base",                         // Network name (see Supported Networks)
    "payload": {
      "signature": "0x...",                   // Your EIP-712 signature
      "authorization": {
        "from": "0xPayerAddress",             // Your address
        "to": "0xRecipientAddress",           // Recipient address
        "value": "1000000",                   // Amount in token base units
        "validAfter": 1730000000,             // Unix timestamp
        "validBefore": 1730003600,            // Unix timestamp
        "nonce": "0x..."                      // Random bytes32 (EIP-3009) or uint256 string (ERC-20)
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",                        // Must match payload
    "network": "base",                         // Must match payload
    "maxAmountRequired": "1000000",           // Maximum amount (must match or be less than value)
    "resource": "/api/premium",               // What's being paid for - URL, file, etc.
    "description": "Payment for data access", // Human-readable description
    "mimeType": "application/json",           // Response content type
    "outputSchema": { "data": "string" },     // Expected response schema
    "payTo": "0xRecipientAddress",            // Must match authorization.to
    "maxTimeoutSeconds": 30,                  // Settlement timeout
    "asset": "0xTokenAddress",                // Token contract address
    "extra": {                                // Token metadata for EIP-712 domain (optional)
      "name": "USD Coin",                     // Token name (avoids RPC call)
      "version": "2"                          // Token version (avoids RPC call)
    }
  }
}
```

**Success Response (200):**
```json
{
  "isValid": true
}
```

**Error Response (400):**
```json
{
  "isValid": false,
  "invalidReason": "Authorization expired"
}
```

---

### POST `/settle`

Verifies and settles a payment on-chain.

**Use case:** Execute the actual token transfer.

**Request:** Same format as `/verify`

**Success Response (200):**
```json
{
  "txHash": "0x1234...",
  "blockNumber": 12345678,
  "gasUsed": "150000",
  "status": "confirmed"
}
```

**Error Response (500):**
```json
{
  "error": "Insufficient balance",
  "code": "SETTLEMENT_FAILED"
}
```

---

### GET `/supported`

Lists supported scheme/network combinations.

**Use case:** Discover which networks are available before making payment requests.

**Response:**
```json
{
  "supportedNetworks": [
    {
      "network": "base",
      "schemes": ["exact"],
      "autoDetect": true
    },
    {
      "network": "base-sepolia",
      "schemes": ["exact"],
      "autoDetect": true
    },
    {
      "network": "base",
      "schemes": ["exact"],
      "autoDetect": true
    },
    {
      "network": "base-sepolia",
      "schemes": ["exact"],
      "autoDetect": true
    }
  ]
}
```

The `autoDetect` field indicates the facilitator can automatically detect whether a token uses EIP-3009 or requires the Stargate proxy.

---

### GET `/health`

Health check and capability discovery.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "facilitator": "Primer x402 Facilitator",
  "spec": "https://x402.org",
  "supportedSchemes": ["exact"],
  "networks": {
    "base": {
      "name": "Base Mainnet",
      "chainId": 56,
      "rpcConfigured": true,
      "keyConfigured": true,
      "facilitatorContract": "0x...",
      "supportsEIP3009": true,
      "supportsExact": true,
      "supportsAutoDetection": true
    },
    "base-sepolia": {
      "name": "Base Sepolia",
      "chainId": 97,
      "rpcConfigured": true,
      "keyConfigured": true,
      "facilitatorContract": "0x...",
      "supportsEIP3009": true,
      "supportsExact": true,
      "supportsAutoDetection": true
    }
  },
  "security": {
    "payloadValidation": true,
    "requirementsMatching": true
  }
}
```

---

### GET `/contracts`

Returns Stargate contract addresses for each network.

**Response:**
```json
{
  "base": {
    "stargate": "0x...",
    "version": "1.0.0",
    "network": "Base Mainnet",
    "chainId": 56
  },
  "base-sepolia": {
    "stargate": "0x...",
    "version": "1.0.0",
    "network": "Base Sepolia",
    "chainId": 97
  }
}
```

---

## Payload Format Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x402Version` | number | Yes | Protocol version (always `1`) |
| `paymentPayload` | object | Yes | Signed payment authorization |
| `paymentRequirements` | object | Yes | Payment metadata and validation |

### Payment Payload

| Field | Type | Description |
|-------|------|-------------|
| `x402Version` | number | Protocol version (always `1`) |
| `scheme` | string | Payment scheme (always `"exact"`) |
| `network` | string | Network name (`"base"`, `"base-sepolia"`, `"base"`, `"base-sepolia"`) |
| `payload.signature` | string | Full EIP-712 signature as hex string |
| `payload.authorization.from` | address | Payer address |
| `payload.authorization.to` | address | Recipient address |
| `payload.authorization.value` | string | Amount in token base units |
| `payload.authorization.validAfter` | number | Unix timestamp - valid after |
| `payload.authorization.validBefore` | number | Unix timestamp - expires |
| `payload.authorization.nonce` | string | Anti-replay nonce (see Token Support section) |

### Payment Requirements

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scheme` | string | Yes | Must match payload scheme (always `"exact"`) |
| `network` | string | Yes | Must match payload network |
| `maxAmountRequired` | string | Yes | Maximum chargeable amount |
| `resource` | string | Yes | What's being paid for - URL, file, description, etc. (metadata only) |
| `description` | string | Yes | Human-readable description |
| `mimeType` | string | Yes | Response content type |
| `outputSchema` | object | Yes | Expected response schema |
| `payTo` | address | Yes | Must match authorization.to |
| `maxTimeoutSeconds` | number | Yes | Settlement timeout |
| `asset` | address | Yes | Token contract address |
| `extra` | object | No | Token metadata (`name`, `version`) for EIP-712 domain - avoids RPC calls |

---

## Token Support: EIP-3009 vs Standard ERC-20

The facilitator supports two types of tokens with different requirements:

### EIP-3009 Tokens (Native Gasless)

**Examples:** USDC, EURC, and other Coinbase-issued stablecoins

**Features:**
- ✅ Native gasless transfer support via `transferWithAuthorization()`
- ✅ No pre-approval required
- ✅ Direct settlement - no proxy needed

**Nonce Format:** Random `bytes32` hex string
```json
"nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
```

**How It Works:**
1. User signs authorization with EIP-712 (token's domain)
2. Facilitator calls `token.transferWithAuthorization()` with signature
3. Token verifies signature and transfers directly

**Signature Domain:**
```javascript
{
  name: "USD Coin",           // Token's name
  version: "2",               // Token's version
  chainId: 56,                // Base mainnet (or your target chain)
  verifyingContract: "0x..."  // Token address
}
```

**EIP-712 Types:**
```javascript
{
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
}
```

---

### Standard ERC-20 Tokens (via Stargate)

**Examples:** USDT, BUSD, DAI, custom tokens

**Features:**
- ⚠️ Requires one-time token approval
- 🔄 Uses Stargate proxy for gasless transfers
- ✅ Works with ANY ERC-20 token

**Nonce Format:** Sequential `uint256` as string
```json
"nonce": "8"
```

**How It Works:**
1. User approves Stargate: `token.approve(stargateAddress, amount)` (one-time)
2. User signs authorization with EIP-712 (Stargate's domain)
3. Facilitator calls `stargate.settleERC20()` with signature
4. Stargate calls `token.transferFrom()` using the approval

**Signature Domain:**
```javascript
{
  name: "Primer",           // Stargate name
  version: "1",
  chainId: 56,                // Base mainnet (or your target chain)
  verifyingContract: "0x..."  // Stargate address (from /contracts)
}
```

**EIP-712 Types:**
```javascript
{
  ERC20Payment: [
    { name: 'token', type: 'address' },
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' }
  ]
}
```

**Fetching Current Nonce:**
```javascript
const stargate = new ethers.Contract(stargateAddress, abi, provider);
const nonce = await stargate.getNonce(userAddress, tokenAddress);
```

**Important:** Always fetch nonce immediately before signing. Using an old nonce will fail.

---

## What is Stargate?

**PrimerStargate** is our proxy contract that adds gasless transfer capabilities to standard ERC-20 tokens.

### Why Stargate?

Most ERC-20 tokens don't have native gasless transfer support like EIP-3009 tokens do. Stargate bridges this gap by:

1. Accepting EIP-712 signed authorizations
2. Verifying signatures match the payer
3. Using the token approval to pull funds
4. Enabling facilitators to pay gas fees

### Trust Model

**You trust:**
- Stargate contract (audited, non-custodial, open source)
- Your own signature (you control the private key)

**You don't trust:**
- The facilitator (can't move funds without your signature)
- The recipient (can't pull funds, only receive what you authorize)

### Stargate vs EIP-3009

| Feature | EIP-3009 | Stargate |
|---------|----------|----------|
| Pre-approval | ❌ Not needed | ✅ Required |
| Nonce type | Random bytes32 | Sequential uint256 |
| Domain | Token itself | Stargate contract |
| Settlement | Direct | Via proxy |
| Gas savings | Native | Proxied |
| Token support | USDC, EURC | Any ERC-20 |

Both result in **gasless transfers for users**. The difference is implementation.

---

## Auto-Detection

The facilitator automatically detects which type of token you're using:

1. Checks if token has `authorizationState()` function
2. **If yes** → Routes to EIP-3009 path
3. **If no** → Routes to Stargate path

**You always use `scheme: "exact"`** - the facilitator handles routing.

---

## Security Features

### Payload Validation

The facilitator validates that `paymentPayload` and `paymentRequirements` match:

✅ **Recipient match:** `authorization.to === paymentRequirements.payTo`  
✅ **Amount sufficient:** `authorization.value >= maxAmountRequired`  
✅ **Network match:** `paymentPayload.network === paymentRequirements.network`  
✅ **Scheme match:** `paymentPayload.scheme === paymentRequirements.scheme`  
✅ **Asset verified:** Signature fails if wrong token

This prevents tampering attacks where someone modifies requirements after signing.

### Signature Verification

- EIP-712 typed data signatures
- Recovers signer from signature
- Verifies signer matches `authorization.from`
- Prevents cross-chain replay (chainId in domain)

### Time Validation

- Checks `now > validAfter` (authorization active)
- Checks `now < validBefore` (authorization not expired)
- Default validity: 1 hour from signing

### Nonce Protection

- **EIP-3009:** Checks `authorizationState(from, nonce) == false`
- **Stargate:** Checks `getNonce(from, token) == expectedNonce`
- Prevents replay attacks and double-spending

---

## Common Errors

### "Recipient mismatch"
`authorization.to` doesn't match `paymentRequirements.payTo`. Don't tamper with the payload.

### "Amount insufficient"
`authorization.value` is less than `maxAmountRequired`. Sign for the correct amount.

### "Network mismatch"
`paymentPayload.network` and `paymentRequirements.network` differ. Use consistent network names.

### "Scheme mismatch"
`paymentPayload.scheme` and `paymentRequirements.scheme` differ. Both should be `"exact"`.

### "Invalid nonce"
**ERC-20 tokens:** The nonce changed between signing and verification. Fetch fresh nonce immediately before signing.

### "Authorization expired"
The current time is past `validBefore`. Create a new authorization.

### "Invalid signature"
Signature verification failed. Possible causes:
- Wrong domain used for signing
- Modified payload after signing
- Incorrect private key

### "Insufficient allowance" (ERC-20 only)
User hasn't approved Stargate contract. Call:
```javascript
await token.approve(stargateAddress, ethers.MaxUint256);
```

---

## Integration Examples

> **Tip:** For a simpler integration experience, use the [@primersystems/x402 SDK](../sdk/README.md) which handles all the details below automatically.

### Creating a Payment (Client Side)

```javascript
const { ethers } = require('ethers');

// 1. Connect to network
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const wallet = new ethers.Wallet(privateKey, provider);

// 2. Get token and amount
const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const token = new ethers.Contract(tokenAddress, abi, provider);
const amount = ethers.parseUnits('1.0', 18); // 1 USDT

// 3. Create authorization
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: wallet.address,
  to: recipientAddress,
  value: amount,
  validAfter: now - 60,
  validBefore: now + 3600,
  nonce: ethers.hexlify(ethers.randomBytes(32)) // EIP-3009 random nonce
};

// 4. Sign with EIP-712
const domain = {
  name: await token.name(),
  version: await token.version(),
  chainId: 56, // Base mainnet
  verifyingContract: tokenAddress
};

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

const signature = await wallet.signTypedData(domain, types, authorization);

// 5. Build payload
const payload = {
  x402Version: 1,
  paymentPayload: {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature,
      authorization
    }
  },
  paymentRequirements: {
    scheme: "exact",
    network: "base",
    maxAmountRequired: amount.toString(),
    resource: "/api/data",
    description: "API access payment",
    mimeType: "application/json",
    outputSchema: { data: "string" },
    payTo: recipientAddress,
    maxTimeoutSeconds: 30,
    asset: tokenAddress,
    extra: {
      name: "Tether USD",  // Token metadata
      version: "1"
    }
  }
};

// 6. Send to facilitator
const response = await fetch('https://x402.primersystems.ai/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log(result); // { isValid: true }
```

### Verifying Before Service Delivery (Server Side)

```javascript
app.get('/api/premium-data', async (req, res) => {
  // 1. Get payment from request
  const payment = JSON.parse(req.headers['x-payment']);
  
  // 2. Verify with facilitator
  const verifyResponse = await fetch('https://x402.primersystems.ai/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payment)
  });
  
  const { isValid, invalidReason } = await verifyResponse.json();
  
  if (!isValid) {
    return res.status(402).json({ error: invalidReason });
  }
  
  // 3. Payment valid - settle and deliver service
  const settleResponse = await fetch('https://x402.primersystems.ai/settle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payment)
  });
  
  const { txHash } = await settleResponse.json();
  
  // 4. Deliver premium data
  res.json({
    data: "Premium data here",
    paymentTx: txHash
  });
});
```

---

## Best Practices

### For Clients

1. **Always fetch fresh nonces** for ERC-20 tokens immediately before signing
2. **Use reasonable validity windows** (1 hour is standard)
3. **Store signatures securely** until needed
4. **Don't reuse nonces** - each payment needs a unique nonce
5. **Verify amounts** in human-readable format before signing

### For Servers

1. **Always call /verify first** before delivering services
2. **Check txHash** in /settle response to confirm settlement
3. **Handle 402 responses** properly to request payment
4. **Store txHash** for audit trails
5. **Don't trust client-provided amounts** - validate against your pricing

### For Both

1. **Use text network names** (`"base"`, `"base-sepolia"`) not chain IDs (`56`, `97`)
2. **Keep paymentRequirements consistent** with paymentPayload
3. **Handle errors gracefully** with clear messages
4. **Monitor /health endpoint** for facilitator status
5. **Test on testnet first** (`base-sepolia`) before mainnet

---

## Rate Limits

Currently no rate limits enforced. Fair use expected.

---

## Support

- **Documentation:** https://github.com/PrimerSystems/x402
- **Protocol Spec:** https://x402.org
- **Email:** support@primersystems.ai
- **Facilitator Status:** https://x402.primersystems.ai/health

---

## Version History

**v1.0.0 (Current)**
- x402 spec compliance
- EIP-3009 and ERC-20 support via Stargate
- Payload/requirements validation
- Auto-detection for token types
- Base mainnet and testnet, and Base Mainnet and Sepolia
