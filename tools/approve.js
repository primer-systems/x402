// Primer x402 Token Approval Tool
// Version 1.2.0
// Approves ERC-20 tokens for use with PrimerPrism contract
// Required for standard ERC-20 tokens (not needed for EIP-3009 tokens)
// Part of the x402 v2 payment protocol implementation
// Supports Base (eip155:8453, eip155:84532)
// https://primer.systems | https://x402.org

const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config({ path: './approve.env' });

// ============================================
// CONFIGURATION
// ============================================

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// ERC-20 ABI (just what we need for approval)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
];

// RPC endpoints (with environment variable overrides)
const RPC_URLS = {
  '8453': process.env.RPC_BASE || 'https://mainnet.base.org',
  '84532': process.env.RPC_BASE_SEPOLIA || 'https://sepolia.base.org',
};

// Network name to chain ID mapping (supports CAIP-2 and legacy names)
const NETWORK_NAMES = {
  // CAIP-2 format (recommended)
  'eip155:8453': '8453',
  'eip155:84532': '84532',
  // Legacy names (still supported)
  'base': '8453',
  'base-mainnet': '8453',
  'base-sepolia': '84532',
  // Chain IDs directly
  '8453': '8453',
  '84532': '84532'
};

// Facilitator API
const FACILITATOR_API = process.env.FACILITATOR_API || 'https://x402.primer.systems';

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper to prompt user for confirmation
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Fetch latest Prism contract from API
async function fetchPrismContract(network) {
  try {
    console.log(`${colors.cyan}→${colors.reset} Fetching latest Prism contract from API...`);
    const response = await fetch(`${FACILITATOR_API}/contracts`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const contracts = await response.json();
    
    // Convert chain ID to network name for API lookup
    const networkNameMap = {
      '8453': 'base',
      '84532': 'base-sepolia'
    };
    
    const networkName = networkNameMap[network] || network;
    
    if (!contracts[networkName]) {
      throw new Error(`Network ${networkName} not supported`);
    }
    
    const { prism, version } = contracts[networkName];
    console.log(`${colors.green}✓${colors.reset} Prism: ${prism} (v${version})`);
    return prism;
  } catch (error) {
    console.log(`${colors.yellow}⚠${colors.reset} Could not fetch from API: ${error.message}`);
    return null;
  }
}

// Format token amount with decimals
function formatAmount(amount, decimals) {
  return ethers.formatUnits(amount, decimals);
}

// ============================================
// MAIN FUNCTION
// ============================================

async function main() {
  console.log(`\n${colors.bright}=== x402 Token Approval Tool ===${colors.reset}\n`);

  // ============================================
  // LOAD CONFIGURATION
  // ============================================
  
  let network = process.env.NETWORK;
  const approverKey = process.env.APPROVER_KEY;
  const tokenAddress = process.env.TOKEN;
  let prismAddress = process.env.PRISM_CONTRACT;
  const amountConfig = process.env.AMOUNT || 'unlimited';

  // ============================================
  // VALIDATE CONFIGURATION
  // ============================================
  
  // Convert network name to chain ID if needed
  if (network && NETWORK_NAMES[network.toLowerCase()]) {
    network = NETWORK_NAMES[network.toLowerCase()];
  }
  
  if (!network || !RPC_URLS[network]) {
    console.error(`${colors.red}✗${colors.reset} Invalid NETWORK in approve.env`);
    console.error(`${colors.yellow}→${colors.reset} Use CAIP-2 format: eip155:8453, eip155:84532`);
    console.error(`${colors.yellow}→${colors.reset} Or legacy names: base, base-sepolia`);
    process.exit(1);
  }

  if (!approverKey || !approverKey.startsWith('0x')) {
    console.error(`${colors.red}✗${colors.reset} Invalid APPROVER_KEY in approve.env`);
    process.exit(1);
  }

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    console.error(`${colors.red}✗${colors.reset} Invalid TOKEN address in approve.env`);
    process.exit(1);
  }

  // ============================================
  // CONNECT TO NETWORK
  // ============================================
  
  const provider = new ethers.JsonRpcProvider(RPC_URLS[network]);
  const wallet = new ethers.Wallet(approverKey, provider);
  const approver = wallet.address;

  const networkNames = {
    '8453': 'Base Mainnet',
    '84532': 'Base Sepolia'
  };

  console.log(`${colors.blue}Network:${colors.reset} ${networkNames[network]} (${network})`);
  console.log(`${colors.blue}Token:${colors.reset} ${tokenAddress}`);
  console.log(`${colors.blue}Approver:${colors.reset} ${approver}\n`);

  // ============================================
  // GET PRISM CONTRACT ADDRESS
  // ============================================
  
  if (!prismAddress || prismAddress === '') {
    prismAddress = await fetchPrismContract(network);
    
    if (!prismAddress) {
      console.error(`${colors.red}✗${colors.reset} Could not get Prism contract address`);
      console.error(`${colors.yellow}→${colors.reset} Please set PRISM_CONTRACT in approve.env manually`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.cyan}→${colors.reset} Using Prism from approve.env: ${prismAddress}`);
    
    // Verify with API if possible
    const apiPrism = await fetchPrismContract(network);
    if (apiPrism && apiPrism.toLowerCase() !== prismAddress.toLowerCase()) {
      console.log(`${colors.yellow}⚠${colors.reset} Warning: Your configured Prism (${prismAddress}) differs from API (${apiPrism})`);
      const proceed = await askConfirmation(`${colors.yellow}Continue with your configured address? (y/n):${colors.reset} `);
      if (!proceed) {
        console.log(`${colors.red}✗${colors.reset} Aborted`);
        process.exit(0);
      }
    }
  }

  try {
    prismAddress = ethers.getAddress(prismAddress); // Normalize to checksum format
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Invalid Prism contract address: ${prismAddress}`);
    process.exit(1);
  }

  // ============================================
  // CONNECT TO TOKEN CONTRACT
  // ============================================
  
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  try {
    // ============================================
    // FETCH TOKEN DETAILS
    // ============================================
    
    const [symbol, decimals, balance, currentAllowance] = await Promise.all([
      token.symbol(),
      token.decimals(),
      token.balanceOf(approver),
      token.allowance(approver, prismAddress),
    ]);

    console.log(`${colors.blue}Token Symbol:${colors.reset} ${symbol}`);
    console.log(`${colors.blue}Token Decimals:${colors.reset} ${decimals}`);
    console.log(`${colors.blue}Your Balance:${colors.reset} ${formatAmount(balance, decimals)} ${symbol}\n`);

    console.log(`${colors.cyan}Current allowance:${colors.reset} ${formatAmount(currentAllowance, decimals)} ${symbol}`);
    console.log(`${colors.cyan}Spender (PrimerPrism):${colors.reset} ${prismAddress}\n`);

    // ============================================
    // DETERMINE APPROVAL AMOUNT
    // ============================================
    
    let approvalAmount;
    if (amountConfig.toLowerCase() === 'unlimited') {
      approvalAmount = ethers.MaxUint256;
      console.log(`${colors.yellow}Approving:${colors.reset} ${colors.bright}UNLIMITED${colors.reset} ${symbol}`);
    } else {
      approvalAmount = ethers.parseUnits(amountConfig, decimals);
      console.log(`${colors.yellow}Approving:${colors.reset} ${formatAmount(approvalAmount, decimals)} ${symbol}`);
    }

    // ============================================
    // WARNING FOR UNLIMITED APPROVAL
    // ============================================
    
    if (approvalAmount === ethers.MaxUint256) {
      console.log(`\n${colors.red}${colors.bright}⚠  WARNING ⚠${colors.reset}`);
      console.log(`${colors.yellow}You are approving UNLIMITED token spend!${colors.reset}`);
      console.log(`${colors.yellow}The PrimerPrism contract will be able to transfer any amount of ${symbol} from your wallet.${colors.reset}`);
      console.log(`${colors.yellow}Only proceed if you trust the contract: ${prismAddress}${colors.reset}\n`);
    }

    // ============================================
    // CONFIRMATION
    // ============================================
    
    const proceed = await askConfirmation(`${colors.cyan}Continue with approval? (y/n):${colors.reset} `);
    
    if (!proceed) {
      console.log(`\n${colors.red}✗${colors.reset} Approval cancelled`);
      process.exit(0);
    }

    // ============================================
    // SEND APPROVAL TRANSACTION
    // ============================================
    
    console.log(`\n${colors.cyan}→${colors.reset} Sending approval transaction...`);
    const tx = await token.approve(prismAddress, approvalAmount);
    console.log(`${colors.cyan}→${colors.reset} Transaction sent: ${tx.hash}`);
    console.log(`${colors.cyan}→${colors.reset} Waiting for confirmation...`);

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log(`\n${colors.green}${colors.bright}✓ Approval successful!${colors.reset}`);
      console.log(`${colors.green}Transaction hash:${colors.reset} ${receipt.hash}`);
      console.log(`${colors.green}Block number:${colors.reset} ${receipt.blockNumber}`);
      console.log(`${colors.green}Gas used:${colors.reset} ${receipt.gasUsed.toString()}\n`);
      
      // Verify new allowance
      const newAllowance = await token.allowance(approver, prismAddress);
      console.log(`${colors.green}New allowance:${colors.reset} ${newAllowance === ethers.MaxUint256 ? 'UNLIMITED' : formatAmount(newAllowance, decimals)} ${symbol}\n`);
      
      console.log(`${colors.bright}✓ Token approved for x402 payments!${colors.reset}`);
      console.log(`${colors.bright}You can now create payment authorizations with signer.js${colors.reset}\n`);
    } else {
      console.log(`\n${colors.red}✗ Transaction failed${colors.reset}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n${colors.red}✗ Error:${colors.reset} ${error.message}`);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error(`${colors.yellow}→${colors.reset} You don't have enough ETH for gas fees`);
    } else if (error.code === 'NONCE_EXPIRED') {
      console.error(`${colors.yellow}→${colors.reset} Transaction nonce issue - try again`);
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${colors.red}✗ Unexpected error:${colors.reset}`, error);
  process.exit(1);
});