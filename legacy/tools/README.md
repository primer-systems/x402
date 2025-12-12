# Megalith x402 Payment Signer

Create x402-compliant payment authorizations for both EIP-3009 and standard ERC-20 tokens.

**Part of the x402 protocol**: An open standard for internet-native payments using HTTP 402 status codes.

Learn more: [x402.org](https://x402.org) | [Megalith Labs](https://megalithlabs.ai)

---

## What is x402?

x402 is an open payment protocol that enables AI agents and web services to autonomously pay for API access, data, and digital services using stablecoins like USDC. It leverages the HTTP 402 "Payment Required" status code to enable:

- 🤖 **AI-native payments** - Agents pay for APIs autonomously
- 💰 **Micropayments** - Transactions as low as $0.001
- ⚡ **Instant settlement** - ~3 seconds on BNB Chain
- 🔓 **No accounts required** - Pay-per-use without registration
- 🌐 **Chain agnostic** - Works on any blockchain

This signer creates x402-compliant payment authorizations that can be used with any x402-compatible facilitator service.

---

## Features

- ✅ **x402 Protocol Compliant**: Outputs standard x402 v1 payment payloads
- ✅ **EIP-3009 Support**: Direct authorization for USDC and other EIP-3009 tokens
- ✅ **Standard ERC-20 Support**: Works with any ERC-20 token via MegalithStargate
- ✅ **Multi-Network**: Supports BNB Chain and Base (mainnet and testnet)
- ✅ **Automatic Token Detection**: Auto-detects EIP-3009 vs ERC-20 and signs appropriately
- ✅ **API Contract Fetching**: Automatically uses latest Stargate contract version
- ✅ **Token Approval Tool**: Easy approval for standard ERC-20 tokens
- ✅ **Payload Archiving**: Keeps timestamped backups of all payments
- ✅ **Secure Signing**: All signing happens locally with your private key

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example config and add your details:

```bash
cp signer.env.example signer.env
nano signer.env
```

**Required fields:**
```bash
NETWORK=bsc             # bsc, bsc-testnet, base, base-sepolia
PAYER_KEY=0x...         # Your private key
RECIPIENT=0x...         # Token recipient
TOKEN=0x...             # Token contract address
AMOUNT=10.0             # Human-readable amount (e.g., 10.5 USDC)

# Optional - leave empty to auto-fetch from API
STARGATE_CONTRACT=
FACILITATOR_API=https://x402.megalithlabs.ai
```

### 3. Approve Token (Standard ERC-20 Only)

**If using standard ERC-20 tokens (like USDT), approve first:**

```bash
cp approve.env.example approve.env
# Edit approve.env with your details
npm run approve
```

**Skip this step** for EIP-3009 tokens (like USDC) - no approval needed!

### 4. Create Payment Authorization

```bash
npm run sign
```

This creates:
- `payload.json` - Full x402 payment payload
- `payloads/payload-TIMESTAMP.json` - Timestamped backup

### 5. Send Payment to Facilitator

**Verify the payment is valid (without executing):**

```bash
curl -X POST https://x402.megalithlabs.ai/verify \
     -H "Content-Type: application/json" \
     -d @payload.json
```

**Settle the payment on-chain:**

```bash
curl -X POST https://x402.megalithlabs.ai/settle \
     -H "Content-Type: application/json" \
     -d @payload.json
```

**Windows PowerShell users:**
```powershell
curl.exe -X POST https://x402.megalithlabs.ai/settle --% -H "Content-Type: application/json" -d @payload.json
```

---

## Supported Networks

| Network Name | Chain ID | Description |
|-------------|----------|-------------|
| `bsc` | 56 | BNB Chain Mainnet |
| `bsc-testnet` | 97 | BNB Chain Testnet |
| `base` | 8453 | Base Mainnet |
| `base-sepolia` | 84532 | Base Sepolia Testnet |

Always use **text network names** (e.g., `"bsc"`), not numeric chain IDs.

---

## Token Types

### EIP-3009 Tokens (e.g., USDC)
- ✅ **No approval required**
- ✅ Native gasless transfer via `transferWithAuthorization`
- ✅ Direct settlement by facilitator
- ✅ Examples: USDC, EURC

**How it works:**
1. Signer detects EIP-3009 support (checks for `authorizationState` function)
2. Creates authorization signed with token's EIP-712 domain
3. Facilitator calls `token.transferWithAuthorization()` directly

### Standard ERC-20 Tokens (e.g., USDT, BUSD)
- ⚠️ **Requires one-time approval** (use `npm run approve`)
- 🔄 Uses MegalithStargate proxy contract
- ✅ Works with ANY ERC-20 token
- ✅ Examples: USDT, BUSD, DAI, and any custom token

**How it works:**
1. User approves MegalithStargate: `token.approve(stargate, amount)`
2. Signer creates authorization signed with Stargate's EIP-712 domain
3. Facilitator calls `stargate.settleERC20()` which uses the approval

---

## Configuration

### Signer Configuration (signer.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NETWORK` | Yes | Network name | `bsc`, `bsc-testnet`, `base`, or `base-sepolia` |
| `PAYER_KEY` | Yes | Payer's private key | `0x1234...` |
| `RECIPIENT` | Yes | Recipient address | `0x5678...` |
| `TOKEN` | Yes | Token contract address | `0xabcd...` |
| `AMOUNT` | Yes | Amount in human-readable units | `10.5` |
| `STARGATE_CONTRACT` | No | Manual Stargate override (leave empty for auto-fetch) | `` |
| `FACILITATOR_API` | No | Facilitator endpoint | `https://x402.megalithlabs.ai` |

### Amount Format

Write amounts in **human-readable format** - the signer automatically handles decimals:

```bash
# For USDC (6 decimals)
AMOUNT=1.0      # Sends 1 USDC = 1000000 base units
AMOUNT=0.5      # Sends 0.5 USDC = 500000 base units
AMOUNT=100      # Sends 100 USDC = 100000000 base units

# For USDT (18 decimals)
AMOUNT=1.0      # Sends 1 USDT = 1000000000000000000 base units
AMOUNT=0.001    # Sends 0.001 USDT = 1000000000000000 base units
```

The script displays the base units before signing - always verify!

---

## Token Approval (ERC-20 Only)

### Quick Approval

```bash
cp approve.env.example approve.env
# Edit approve.env
npm run approve
```

### Approval Configuration (approve.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NETWORK` | Yes | Network chain ID | `56`, `97`, `8453`, or `84532` |
| `APPROVER_KEY` | Yes | Wallet holding the tokens | `0x1234...` |
| `TOKEN` | Yes | Token contract address | `0x55d3...` |
| `STARGATE_CONTRACT` | No | Manual override (leave empty) | `` |
| `AMOUNT` | No | Approval amount | `unlimited` or `1000.0` |
| `FACILITATOR_API` | No | API endpoint | `https://x402.megalithlabs.ai` |

### Approval Options

**Unlimited (Recommended):**
```bash
AMOUNT=unlimited
```
- ✅ One-time approval for all future payments
- ✅ Saves gas on subsequent transactions
- ⚠️ Only approve trusted contracts

**Specific Amount:**
```bash
AMOUNT=1000.0
```
- ✅ Limits approval to exact amount
- ❌ Needs new approval when depleted

---

## Common Token Addresses

### BNB Chain Mainnet

| Token | Type | Address |
|-------|------|---------|
| USDC | EIP-3009 | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| USDT | ERC-20 | `0x55d398326f99059fF775485246999027B3197955` |
| BUSD | ERC-20 | `0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56` |

### BNB Chain Testnet

Get testnet tokens from [BSC Testnet Faucet](https://testnet.bnbchain.org/faucet-smart)

---

## x402 Payload Structure

The signer creates Coinbase x402 spec-compliant payloads:

```json
{
  "x402Version": 1,
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "bsc",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0xPayerAddress",
        "to": "0xRecipientAddress",
        "value": "1000000",
        "validAfter": 1730304000,
        "validBefore": 1730307600,
        "nonce": "0x..." or "123"
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "bsc",
    "maxAmountRequired": "1000000",
    "resource": "/api/settlement",
    "description": "Payment of 1.0 USDC",
    "mimeType": "application/json",
    "outputSchema": {},
    "payTo": "0xRecipientAddress",
    "maxTimeoutSeconds": 30,
    "asset": "0xTokenAddress"
  }
}
```

### Key Fields

- **scheme**: Always `"exact"` - i.e. exact payment required
- **network**: Text name (`"bsc"`, `"bsc-testnet"`)
- **signature**: Full EIP-712 signature as hex string
- **nonce**: Random bytes32 (EIP-3009) or sequential uint256 (ERC-20)
- **validAfter/validBefore**: 1 hour validity window
- **maxAmountRequired**: Must match or be less than `value`

---

## Facilitator API Endpoints

### Verify Payment

Validates signature without executing:

```bash
curl -X POST https://x402.megalithlabs.ai/verify \
     -H "Content-Type: application/json" \
     -d @payload.json
```

**Response:**
```json
{
  "isValid": true
}
```

### Settle Payment

Executes payment on-chain:

```bash
curl -X POST https://x402.megalithlabs.ai/settle \
     -H "Content-Type: application/json" \
     -d @payload.json
```

**Response:**
```json
{
  "txHash": "0x456...",
  "blockNumber": 12345678,
  "gasUsed": "150000",
  "status": "confirmed"
}
```

### Get Contract Addresses

Fetch latest Stargate addresses:

```bash
curl https://x402.megalithlabs.ai/contracts
```

**Response:**
```json
{
  "bsc": {
    "stargate": "0x40200001004B5110333e4De8179426971Efd034A",
    "version": "1.0.0",
    "network": "BNB Chain Mainnet",
    "chainId": 56
  },
  "bsc-testnet": {
    "stargate": "0x40200001004B5110333e4De8179426971Efd034A",
    "version": "1.0.0",
    "network": "BNB Chain Testnet",
    "chainId": 97
  },
  "base": {
    "stargate": "0x40200001004B5110333e4De8179426971Efd034A",
    "version": "1.0.0",
    "network": "Base Mainnet",
    "chainId": 8453
  },
  "base-sepolia": {
    "stargate": "0x40200001004B5110333e4De8179426971Efd034A",
    "version": "1.0.0",
    "network": "Base Sepolia",
    "chainId": 84532
  }
}
```

### Health Check

```bash
curl https://x402.megalithlabs.ai/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "facilitator": "Megalith x402 Facilitator",
  "spec": "https://x402.org",
  "supportedSchemes": ["exact"],
  "networks": {
    "bsc": {
      "name": "BNB Chain Mainnet",
      "chainId": 56,
      "supportsEIP3009": true,
      "supportsExact": true,
      "supportsAutoDetection": true
    }
  }
}
```

---

## File Structure

```
signer/
├── signer.js                 # Payment signing script
├── signer.env                # Your config (DO NOT COMMIT)
├── signer.env.example        # Config template
├── approve.js                # Token approval script
├── approve.env               # Your approval config (DO NOT COMMIT)
├── approve.env.example       # Approval template
├── package.json              # Dependencies
├── payload.json              # Latest payment (overwrites each time)
├── payloads/                 # Timestamped backups
│   ├── payload-2025-11-01T14-23-50.json
│   └── payload-2025-11-01T15-30-12.json
└── README.md                 # This file
```

**`.gitignore` should include:**
```
signer.env
approve.env
node_modules/
payload.json
payloads/
```

---

## Security Best Practices

### 🔐 Private Key Safety
- **NEVER** commit `signer.env` or `approve.env` to git
- **NEVER** share your private key
- Use environment variables or hardware wallets for production
- The facilitator **CANNOT** move funds without your signature

### 🕒 Time Validity
- Authorizations are valid for **1 hour** by default
- Expired authorizations are automatically rejected
- Create new authorization if expired

### 💰 Amount Verification
- Always check the base units displayed before signing
- Verify `maxAmountRequired` matches your intention
- The facilitator validates `value >= maxAmountRequired`

### 🌐 Network Selection
- **bsc** / **base** = Real money (mainnet)
- **bsc-testnet** / **base-sepolia** = Test tokens only
- Always verify network before signing

### ⚠️ Token Approvals (ERC-20 Only)
- Only approve trusted contracts (MegalithStargate is audited)
- Can revoke approvals anytime via block explorer
- Unlimited approval is safe - requires your signature to use
- The contract **CANNOT** move tokens without your signed authorization

---

## Troubleshooting

### "Cannot find module 'dotenv'"
```bash
npm install
```

### "Invalid NETWORK in signer.env"
Use text names: `bsc`, `bsc-testnet`, `base`, or `base-sepolia` (not numbers)

### "Could not fetch Stargate contract from API"
Manually set in signer.env:
```bash
STARGATE_CONTRACT=0x40200001004B5110333e4De8179426971Efd034A
```

### "Insufficient allowance" (ERC-20 tokens)
Run the approval tool:
```bash
npm run approve
```

Or approve manually via BscScan:
1. Go to token contract
2. Connect wallet (Write Contract tab)
3. Call `approve`:
   - spender: `0x40200001004B5110333e4De8179426971Efd034A`
   - amount: `115792089237316195423570985008687907853269984665640564039457584007913129639935`

### "Authorization expired"
Authorizations expire after 1 hour. Create a new one:
```bash
npm run sign
```

### "Invalid signature"
- Verify `PAYER_KEY` is correct
- Don't modify `payload.json` after signing
- Ensure correct network

### "Nonce already used"
Create new payment with fresh nonce:
```bash
npm run sign
```

### Windows PowerShell curl Issues
Use `curl.exe` with `--%` flag:
```powershell
curl.exe -X POST https://x402.megalithlabs.ai/settle --% -H "Content-Type: application/json" -d @payload.json
```

---

## NPM Scripts

```bash
npm run sign      # Create payment authorization (node signer.js)
npm run approve   # Approve tokens for Stargate (node approve.js)
```

Or run directly:
```bash
node signer.js
node approve.js
```

---

## How It Works

### EIP-3009 Flow (USDC, EURC)

```
1. Signer detects EIP-3009 support
2. Signs with token's EIP-712 domain
3. Creates payload with scheme: "exact"
4. Facilitator receives payload
5. Facilitator auto-detects EIP-3009
6. Facilitator calls token.transferWithAuthorization()
7. Token verifies signature and transfers
```

### ERC-20 Flow (USDT, BUSD, etc)

```
1. User approves Stargate (one-time)
2. Signer detects standard ERC-20
3. Signs with Stargate's EIP-712 domain  
4. Creates payload with scheme: "exact"
5. Facilitator receives payload
6. Facilitator auto-detects ERC-20
7. Facilitator calls stargate.settleERC20()
8. Stargate uses approval to transfer tokens
```

Both flows:
- Use `scheme: "exact"`
- Are gasless for payer (facilitator pays gas)
- Have 1 hour validity
- Are protected by EIP-712 signature verification

---

## What is MegalithStargate?

MegalithStargate is a proxy contract that brings gasless payment capabilities to standard ERC-20 tokens.

### Why Stargate?

Most ERC-20 tokens don't have native gasless transfer support like EIP-3009 tokens. Stargate bridges this gap:

1. Accepts EIP-712 signed authorizations
2. Verifies signatures match the payer
3. Uses token approval to pull funds
4. Enables facilitators to pay gas fees

### Trust Model

**You trust:**
- ✅ MegalithStargate contract (audited, open source, non-custodial)
- ✅ Your own signature (you control the private key)

**You don't trust:**
- ❌ The facilitator (can't move funds without your signature)
- ❌ The recipient (can't pull funds, only receives what you authorize)

### Stargate vs EIP-3009

| Feature | EIP-3009 | Stargate |
|---------|----------|----------|
| Pre-approval | ❌ Not needed | ✅ Required (one-time) |
| Nonce type | Random bytes32 | Sequential uint256 |
| Domain | Token itself | Stargate contract |
| Settlement | Direct | Via proxy |
| Token support | USDC, EURC | Any ERC-20 |

Both result in **gasless transfers** - just different implementations.

---

## x402 Protocol

This implementation follows the x402 v1 specification:

### Supported Scheme
- `exact` - Exact payment amount required

### Supported Networks
- `bsc` (BNB Chain Mainnet, Chain ID 56)
- `bsc-testnet` (BNB Chain Testnet, Chain ID 97)
- `base` (Base Mainnet, Chain ID 8453)
- `base-sepolia` (Base Sepolia Testnet, Chain ID 84532)

### Signature Standard
- **EIP-712**: Typed structured data signing
- Prevents signature replay across chains and contracts

### Settlement
- Facilitator broadcasts transaction on-chain
- Instant finality (~3 seconds on BNB Chain)
- Gasless for payer (facilitator pays gas)

---

## Support

- 🌐 Website: https://megalithlabs.ai
- 🌐 x402 Protocol: https://x402.org
- 📧 Email: support@megalithlabs.ai
- 🐛 Issues: https://github.com/megalithlabs/x402/issues
- 📚 Docs: https://github.com/MegalithLabs/x402

---

## License

MIT License - see LICENSE file for details

---

## Changelog

### v1.0.0 (Current)
- x402 Protocol v1 compliance
- EIP-3009 and standard ERC-20 support
- BNB Chain and Base support (mainnet and testnet)
- Automatic token type detection
- MegalithStargate proxy for standard ERC-20 tokens
- Token approval tool
- API contract fetching
- Payload archiving with timestamps
- Security validations
