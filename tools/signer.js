// Primer x402 Signer & Payload Creator
// Version 2.0.0
// x402 v2 with CAIP-2 network format
// Supports both EIP-3009 and standard ERC-20 tokens
// Supports Base (eip155:8453, eip155:84532)
// https://primer.systems

console.log("=== Primer x402 Signer & Payload Creator ===\n");

require('dotenv').config({ path: 'signer.env' });
const { ethers } = require('ethers');

// Facilitator API
const FACILITATOR_API = process.env.FACILITATOR_API || 'https://x402.primer.systems';

// Custom JSON replacer to handle BigInt serialization
const replacer = (key, value) =>
  typeof value === 'bigint' ? value.toString() : value;

// ============================================
// HELPER FUNCTIONS
// ============================================

// Fetch latest Prism contract from API
async function fetchPrismContract(network) {
  try {
    console.log("→ Fetching latest Prism contract from API...");
    const response = await fetch(`${FACILITATOR_API}/contracts`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const contracts = await response.json();
    
    if (!contracts[network]) {
      throw new Error(`Network ${network} not supported`);
    }
    
    const { prism, version } = contracts[network];
    console.log(`✓ Prism: ${prism} (v${version})`);
    return prism;
  } catch (error) {
    console.log(`⚠️  Could not fetch from API: ${error.message}`);
    return null;
  }
}

(async () => {
  // ============================================
  // LOAD CONFIGURATION
  // ============================================
  
  const NETWORK = process.env.NETWORK || 'base';  // Text name like 'base', 'base-sepolia'
  const PAYER_KEY = process.env.PAYER_KEY;
  const RECIPIENT = process.env.RECIPIENT;
  const TOKEN = process.env.TOKEN;
  const AMOUNT = process.env.AMOUNT;
  let PRISM_CONTRACT = process.env.PRISM_CONTRACT;
  
  // Network-specific configuration - supports both CAIP-2 and legacy names
  const NETWORK_CONFIG = {
    // CAIP-2 format (recommended)
    'eip155:8453': {
      name: 'Base Mainnet',
      chainId: 8453,
      caipId: 'eip155:8453',
      rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org/'
    },
    'eip155:84532': {
      name: 'Base Sepolia',
      chainId: 84532,
      caipId: 'eip155:84532',
      rpcUrl: process.env.RPC_BASE_SEPOLIA || 'https://sepolia.base.org/'
    },
    // Legacy names (still supported for backward compatibility)
    'base': {
      name: 'Base Mainnet',
      chainId: 8453,
      caipId: 'eip155:8453',
      rpcUrl: process.env.RPC_BASE || 'https://mainnet.base.org/'
    },
    'base-sepolia': {
      name: 'Base Sepolia',
      chainId: 84532,
      caipId: 'eip155:84532',
      rpcUrl: process.env.RPC_BASE_SEPOLIA || 'https://sepolia.base.org/'
    }
  };

  // ============================================
  // VALIDATE CONFIGURATION
  // ============================================

  // Validate network
  if (!NETWORK_CONFIG[NETWORK]) {
    console.error("❌ Invalid NETWORK in signer.env");
    console.error("Supported networks: eip155:8453, eip155:84532 (or legacy: base, base-sepolia)");
    console.error("You provided:", NETWORK);
    process.exit(1);
  }

  const networkConfig = NETWORK_CONFIG[NETWORK];
  const caipNetwork = networkConfig.caipId;  // Always use CAIP-2 format in payloads

  if (!PAYER_KEY || !RECIPIENT || !TOKEN || !AMOUNT) {
    console.error("❌ Missing configuration in signer.env");
    console.error("Required: NETWORK, PAYER_KEY, RECIPIENT, TOKEN, AMOUNT");
    process.exit(1);
  }

   console.log("Network:", networkConfig.name, `(${NETWORK}, Chain ID: ${networkConfig.chainId})`);
  console.log("RPC:", networkConfig.rpcUrl);
  console.log("Token:", TOKEN);
  console.log("Recipient:", RECIPIENT);
  console.log("Amount:", AMOUNT);

  // ============================================
  // CONNECT TO NETWORK
  // ============================================
  
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const wallet = new ethers.Wallet(PAYER_KEY, provider);

  console.log("Payer address:", wallet.address);

  // Extended token ABI with EIP-3009 detection
  const tokenABI = [
    'function name() view returns (string)',
    'function version() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function authorizationState(address, bytes32) view returns (bool)', // EIP-3009 only
    'function allowance(address owner, address spender) view returns (uint256)' // Check approval for ERC-20
  ];
  
  const token = new ethers.Contract(TOKEN, tokenABI, provider);
  
  // ============================================
  // FETCH TOKEN DETAILS
  // ============================================
  
  let tokenName, tokenVersion, tokenSymbol, tokenDecimals, balance;
  try {
    tokenName = await token.name();
    console.log("Token name:", tokenName);
  } catch (e) {
    console.error("❌ Failed to fetch token name:", e.message);
    process.exit(1);
  }

  try {
    tokenVersion = await token.version();
    console.log("Token version:", tokenVersion);
  } catch (e) {
    console.log("⚠️  Token version() not available, defaulting to '1'");
    tokenVersion = '1';
  }

  try {
    tokenSymbol = await token.symbol();
    console.log("Token symbol:", tokenSymbol);
  } catch (e) {
    console.log("⚠️  Could not fetch token symbol");
  }

  try {
    tokenDecimals = await token.decimals();
    console.log("Token decimals:", tokenDecimals);
  } catch (e) {
    console.log("⚠️  Could not fetch token decimals, defaulting to 18");
    tokenDecimals = 18;
  }

  try {
    balance = await token.balanceOf(wallet.address);
    console.log("Payer balance:", ethers.formatUnits(balance, tokenDecimals), tokenSymbol || "tokens");
  } catch (e) {
    console.log("⚠️  Could not fetch balance");
  }

  // ============================================
  // DETECT TOKEN TYPE (EIP-3009 vs Standard ERC-20)
  // ============================================
  
  console.log("\n🔍 Detecting token type...");
  
  let isEIP3009 = false;
  try {
    // Try to call authorizationState - only exists on EIP-3009 tokens
    const testNonce = ethers.hexlify(ethers.randomBytes(32));
    await token.authorizationState(wallet.address, testNonce);
    isEIP3009 = true;
    console.log("✅ EIP-3009 token detected (supports transferWithAuthorization)");
  } catch (e) {
    console.log("Debug: authorizationState call failed:", e.message);
    isEIP3009 = false;
    console.log("✅ Standard ERC-20 token detected (will use PrimerPrism)");
  }

  // ============================================
  // GET PRISM CONTRACT (if needed for ERC-20)
  // ============================================

  if (!isEIP3009) {
    // Only fetch Prism if we need it (ERC-20 token)
    if (!PRISM_CONTRACT || PRISM_CONTRACT === '') {
      console.log("\n→ Standard ERC-20 detected, fetching Prism contract...");
      PRISM_CONTRACT = await fetchPrismContract(NETWORK);
      
      if (!PRISM_CONTRACT) {
        console.error("\n❌ ERROR: Could not get Prism contract address");
        console.error(`Network: ${networkConfig.name} (${NETWORK}, Chain ID: ${networkConfig.chainId})`);
        console.error("\nFor standard ERC-20 tokens, you must either:");
        console.error("  1. Let the script fetch from API (leave PRISM_CONTRACT empty)");
        console.error("  2. Set PRISM_CONTRACT manually in signer.env");
        console.error("\nExample:");
        console.error(`  PRISM_CONTRACT=0x40200001004B5110333e4De8179426971Efd034A`);
        process.exit(1);
      }
    } else {
      console.log("\n→ Using Prism from signer.env:", PRISM_CONTRACT);
      
      // Verify with API if possible
      const apiPrism = await fetchPrismContract(NETWORK);
      if (apiPrism && apiPrism.toLowerCase() !== PRISM_CONTRACT.toLowerCase()) {
        console.log(`⚠️  Warning: Your configured Prism (${PRISM_CONTRACT}) differs from API (${apiPrism})`);
        console.log("Continuing with your configured address...");
      }
    }

    // Normalize to checksum format
    try {
      PRISM_CONTRACT = ethers.getAddress(PRISM_CONTRACT);
    } catch (error) {
      console.error("❌ Invalid Prism contract address:", PRISM_CONTRACT);
      process.exit(1);
    }
  }

  // ============================================
  // CREATE AUTHORIZATION BASED ON TOKEN TYPE
  // ============================================

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;  // 60 seconds in the past to account for clock skew
  const validBefore = now + 3600;  // Valid for 1 hour
  const value = ethers.parseUnits(AMOUNT, tokenDecimals);

  console.log("\n=== Authorization Details ===");
  console.log("Valid after:", new Date(validAfter * 1000).toISOString());
  console.log("Valid before:", new Date(validBefore * 1000).toISOString());
  console.log("Value:", ethers.formatUnits(value, tokenDecimals), tokenSymbol || "tokens");
  console.log("Base units:", value.toString());

  let payload, sig, message, domain, types, nonce;

  if (isEIP3009) {
    // ============================================
    // PATH A: EIP-3009 TOKEN
    // ============================================
    
    console.log("\n=== Creating EIP-3009 Authorization ===");
    
    // Generate random bytes32 nonce for EIP-3009
    nonce = ethers.hexlify(ethers.randomBytes(32));
    console.log("Nonce (bytes32):", nonce);

    // EIP-712 domain for the token contract
    domain = { 
      name: tokenName,
      version: tokenVersion,
      chainId: networkConfig.chainId,
      verifyingContract: TOKEN 
    };

    // EIP-3009 TransferWithAuthorization type definition
    types = { 
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    message = {
      from: wallet.address,
      to: RECIPIENT,
      value: value,
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce
    };

    sig = await wallet.signTypedData(domain, types, message);

    console.log("✅ Signature created successfully");
    console.log("→ Using scheme: exact (EIP-3009 native authorization)");

    // x402 v2 compliant payload format
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: caipNetwork,  // CAIP-2 format
      payload: {
        signature: sig,
        authorization: {
          from: message.from,
          to: message.to,
          value: message.value.toString(),
          validAfter: message.validAfter,
          validBefore: message.validBefore,
          nonce: message.nonce
        }
      }
    };

    const paymentRequirements = {
      scheme: "exact",
      network: caipNetwork,  // CAIP-2 format
      maxAmountRequired: message.value.toString(),
      resource: "/api/settlement",
      description: `Payment of ${ethers.formatUnits(value, tokenDecimals)} ${tokenSymbol || 'tokens'}`,
      mimeType: "application/json",
      outputSchema: { data: "string" },
      payTo: RECIPIENT,
      maxTimeoutSeconds: 30,
      asset: TOKEN,
      extra: {
        name: tokenName,
        version: tokenVersion,
        gasLimit: "200000"
      }
    };

    payload = {
      x402Version: 2,
      paymentPayload,
      paymentRequirements
    };

  } else {
    // ============================================
    // PATH B: STANDARD ERC-20 TOKEN
    // ============================================
    
    console.log("\n=== Creating ERC-20 Authorization (PrimerPrism) ===");
    console.log("Prism contract:", PRISM_CONTRACT);

    // Check if user has approved the Prism contract
    try {
      const allowance = await token.allowance(wallet.address, PRISM_CONTRACT);
      if (allowance < value) {
        console.log("\n⚠️  WARNING: Insufficient approval!");
        console.log("Current allowance:", ethers.formatUnits(allowance, tokenDecimals), tokenSymbol);
        console.log("Required amount:", ethers.formatUnits(value, tokenDecimals), tokenSymbol);
        console.log("\n👉 You must first run: npm run approve");
        console.log("This will approve the PrimerPrism contract to spend your tokens.");
        console.log("\nContinuing anyway - settlement will fail if approval is not done...\n");
      } else {
        console.log("✅ Prism contract has sufficient approval");
      }
    } catch (e) {
      console.log("⚠️  Could not check approval status");
    }

    // Get current nonce from Prism contract
    const prismABI = [
      'function getNonce(address user, address token) view returns (uint256)'
    ];
    const prismContract = new ethers.Contract(PRISM_CONTRACT, prismABI, provider);
    
    let currentNonce;
    try {
      currentNonce = await prismContract.getNonce(wallet.address, TOKEN);
      console.log("Current nonce (uint256):", currentNonce.toString());
    } catch (e) {
      console.error("❌ Failed to fetch nonce from Prism contract");
      console.error("Is PRISM_CONTRACT address correct?");
      console.error("Error:", e.message);
      process.exit(1);
    }

    nonce = currentNonce;

    // EIP-712 domain for PrimerPrism contract
    domain = {
      name: "Primer",
      version: "1",
      chainId: networkConfig.chainId,
      verifyingContract: PRISM_CONTRACT
    };

    // ERC20Payment type definition (matches PrimerPrism contract)
    types = {
      ERC20Payment: [
        { name: 'token', type: 'address' },
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' }
      ]
    };

    message = {
      token: TOKEN,
      from: wallet.address,
      to: RECIPIENT,
      value: value,
      nonce: nonce,
      validAfter: validAfter,
      validBefore: validBefore
    };

    sig = await wallet.signTypedData(domain, types, message);

    console.log("✅ Signature created successfully");
    console.log("→ Using scheme: exact (Prism proxy for standard ERC-20)");

    // x402 v2 compliant payload format
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: caipNetwork,  // CAIP-2 format
      payload: {
        signature: sig,
        authorization: {
          from: message.from,
          to: message.to,
          value: message.value.toString(),
          validAfter: message.validAfter,
          validBefore: message.validBefore,
          nonce: nonce.toString()
        }
      }
    };

    const paymentRequirements = {
      scheme: "exact",
      network: caipNetwork,  // CAIP-2 format
      maxAmountRequired: message.value.toString(),
      resource: "/api/settlement",
      description: `Payment of ${ethers.formatUnits(value, tokenDecimals)} ${tokenSymbol || 'tokens'}`,
      mimeType: "application/json",
      outputSchema: { data: "string" },
      payTo: RECIPIENT,
      maxTimeoutSeconds: 30,
      asset: TOKEN,
      extra: {
        prismContract: PRISM_CONTRACT,
        gasLimit: "300000"
      }
    };

    payload = {
      x402Version: 2,
      paymentPayload,
      paymentRequirements
    };
  }

  // ============================================
  // SAVE PAYLOAD
  // ============================================

  console.log("\n=== X402 PAYMENT PAYLOAD ===");
  console.log(JSON.stringify(payload, replacer, 2));
  console.log("============================\n");

  const fs = require('fs');
  
  // Create payloads directory if it doesn't exist
  if (!fs.existsSync('payloads')) {
    fs.mkdirSync('payloads');
  }
  
  // Save main payload file (always overwrites)
  const mainFile = 'payload.json';
  fs.writeFileSync(mainFile, JSON.stringify(payload, replacer, 2));
  console.log(`✅ Saved to: ${mainFile}`);
  
  // Save timestamped backup in payloads folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const archiveFile = `payloads/payload-${timestamp}.json`;
  fs.writeFileSync(archiveFile, JSON.stringify(payload, replacer, 2));
  console.log(`✅ Archived to: ${archiveFile}`);

  // ============================================
  // USAGE INSTRUCTIONS
  // ============================================

  console.log("\n=== USAGE ===");
  console.log(`Network: ${networkConfig.name} (${NETWORK}, Chain ID: ${networkConfig.chainId})`);
  
  console.log("\n📤 Verify & Settle Payment (Coinbase x402 spec compliant)");
  console.log(`  curl.exe -X POST ${FACILITATOR_API}/verify --% -H "Content-Type: application/json" -d @payload.json`);
  console.log(`  curl.exe -X POST ${FACILITATOR_API}/settle --% -H "Content-Type: application/json" -d @payload.json`);

  if (!isEIP3009) {
    console.log("\n⚠️  IMPORTANT: For ERC-20 tokens, run: npm run approve");
    console.log("    This approves the PrimerPrism contract to spend your tokens.");
  }

  console.log("\n💻 Local testing:");
  console.log(`  curl.exe -X POST http://localhost:3000/verify --% -H "Content-Type: application/json" -d @payload.json`);

  console.log("\n📁 Generated files:");
  console.log("  - payload.json           (Coinbase x402 spec compliant)");
  console.log("  - payloads/payload-*.json (Timestamped backup)");
  
  console.log("\n=============\n");

  console.log("✅ x402 v2 payment authorization created successfully!");
  console.log("Network:", networkConfig.name, `(${caipNetwork}, Chain ID: ${networkConfig.chainId})`);
  console.log("Type:", isEIP3009 ? "EIP-3009 (direct)" : "ERC-20 (via PrimerPrism)");
  console.log("From:", wallet.address);
  console.log("To:", RECIPIENT);
  console.log("Amount:", ethers.formatUnits(value, tokenDecimals), tokenSymbol || "tokens");
  console.log("Protocol: x402 v2 (exact scheme, CAIP-2 network format)");
  console.log("\nThe facilitator will pay the gas fees when settling.");

})().catch(error => {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  process.exit(1);
});