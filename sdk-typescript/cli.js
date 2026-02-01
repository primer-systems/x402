#!/usr/bin/env node

// Primer x402 - Command Line Interface
// CLI for wallet management, payments, and OpenClaw integration
// https://primer.systems

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createWallet,
  walletFromMnemonic,
  getBalance,
  x402Probe,
  getFacilitatorInfo,
  listNetworks
} = require('./wallet');
const { createSigner } = require('./signer');
const { x402Fetch } = require('./payer');
const { DEFAULT_FACILITATOR, NETWORKS } = require('./utils');

// ============================================
// Helpers
// ============================================

function printHelp() {
  console.log(`
x402 - HTTP-native crypto payments CLI
https://primer.systems | https://x402.org

USAGE:
  x402 <command> [options]

COMMANDS:
  wallet create              Create a new wallet
  wallet balance <address>   Check wallet balance
  wallet from-mnemonic       Restore wallet from mnemonic

  probe <url>                Check if URL supports x402 payments
  pay <url>                  Make a payment to a 402 endpoint

  networks                   List supported networks
  facilitator                Show facilitator info

  openclaw init              Set up x402 for OpenClaw
  openclaw status            Check OpenClaw x402 status

OPTIONS:
  --network, -n <network>    Network (default: base)
  --token, -t <token>        Token (default: USDC)
  --max-amount <amount>      Maximum payment amount
  --private-key <key>        Private key (or use X402_PRIVATE_KEY env)
  --dry-run                  Show payment details without paying
  --json                     Output as JSON
  --help, -h                 Show help

ENVIRONMENT VARIABLES:
  X402_PRIVATE_KEY           Wallet private key
  X402_NETWORK               Default network (default: base)
  X402_MAX_AMOUNT            Default max payment amount
  X402_FACILITATOR           Facilitator URL override

EXAMPLES:
  x402 wallet create
  x402 wallet balance 0x742d35Cc6634C0532925a3b844Bc9e7595f...
  x402 probe https://api.example.com/paid-endpoint
  x402 pay https://api.example.com/paid-endpoint --max-amount 0.10
  x402 openclaw init
`);
}

function parseArgs(args) {
  const parsed = {
    command: null,
    subcommand: null,
    positional: [],
    options: {}
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        parsed.options[key] = next;
        i += 2;
      } else {
        parsed.options[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const shortMap = { n: 'network', t: 'token', h: 'help' };
      const key = shortMap[arg[1]] || arg[1];
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        parsed.options[key] = next;
        i += 2;
      } else {
        parsed.options[key] = true;
        i++;
      }
    } else {
      if (!parsed.command) {
        parsed.command = arg;
      } else if (!parsed.subcommand) {
        parsed.subcommand = arg;
      } else {
        parsed.positional.push(arg);
      }
      i++;
    }
  }

  return parsed;
}

function output(data, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      console.log(`${key}: ${value}`);
    }
  } else {
    console.log(data);
  }
}

function getPrivateKey(options) {
  return options['private-key'] ||
         process.env.X402_PRIVATE_KEY ||
         process.env.PRIVATE_KEY;
}

function getNetwork(options) {
  return options.network ||
         process.env.X402_NETWORK ||
         process.env.NETWORK ||
         'base';
}

// ============================================
// OpenClaw Helpers
// ============================================

function getOpenClawSkillDir() {
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw', 'skills', 'primer-x402');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================
// Commands
// ============================================

async function cmdWalletCreate(options) {
  const wallet = createWallet();

  console.log('\n🔐 New Wallet Created\n');
  console.log(`Address:     ${wallet.address}`);
  console.log(`Private Key: ${wallet.privateKey}`);
  console.log(`Mnemonic:    ${wallet.mnemonic}`);
  console.log('\n⚠️  IMPORTANT: Save your mnemonic phrase securely. It cannot be recovered.\n');

  if (options.json) {
    output(wallet, true);
  }

  return wallet;
}

async function cmdWalletBalance(address, options) {
  if (!address) {
    console.error('Error: Address required. Usage: x402 wallet balance <address>');
    process.exit(1);
  }

  const network = getNetwork(options);
  const token = options.token || 'USDC';

  console.log(`\nChecking ${token} balance on ${network}...\n`);

  const balance = await getBalance(address, network, token);

  if (options.json) {
    output(balance, true);
  } else {
    console.log(`Address: ${address}`);
    console.log(`Balance: ${balance.balance} ${balance.token}`);
    console.log(`Network: ${balance.network}`);
  }

  return balance;
}

async function cmdWalletFromMnemonic(options) {
  // Read mnemonic from stdin or prompt
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter mnemonic phrase: ', (mnemonic) => {
      rl.close();

      const wallet = walletFromMnemonic(mnemonic.trim());

      console.log('\n🔐 Wallet Restored\n');
      console.log(`Address:     ${wallet.address}`);
      console.log(`Private Key: ${wallet.privateKey}`);

      if (options.json) {
        output(wallet, true);
      }

      resolve(wallet);
    });
  });
}

async function cmdProbe(url, options) {
  if (!url) {
    console.error('Error: URL required. Usage: x402 probe <url>');
    process.exit(1);
  }

  console.log(`\nProbing ${url}...\n`);

  const result = await x402Probe(url);

  if (options.json) {
    output(result, true);
  } else if (result.supports402) {
    console.log('✅ URL supports x402 payments\n');
    if (result.requirements) {
      console.log('Payment Requirements:');
      console.log(JSON.stringify(result.requirements, null, 2));
    }
  } else {
    console.log(`❌ URL does not require payment (status: ${result.statusCode})`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  return result;
}

async function cmdPay(url, options) {
  if (!url) {
    console.error('Error: URL required. Usage: x402 pay <url>');
    process.exit(1);
  }

  const network = getNetwork(options);
  const maxAmount = options['max-amount'] ||
                    process.env.X402_MAX_AMOUNT ||
                    process.env.MAX_AMOUNT;

  // Dry run mode - just probe and show what would be paid
  if (options['dry-run']) {
    console.log(`\n🔍 Dry run - checking payment requirements for ${url}...\n`);

    const probe = await x402Probe(url);

    if (!probe.supports402) {
      console.log(`❌ URL does not require payment (status: ${probe.statusCode})`);
      return;
    }

    const req = probe.requirements;
    console.log('Payment Required:');
    console.log(`  Amount:    ${req.maxAmountRequired || req.amount || 'unknown'} ${req.asset || 'USDC'}`);
    console.log(`  Recipient: ${req.payTo || req.recipient || 'unknown'}`);
    console.log(`  Network:   ${req.network || network}`);
    if (maxAmount) {
      const reqAmount = parseFloat(req.maxAmountRequired || req.amount || '0');
      const maxAmt = parseFloat(maxAmount);
      if (reqAmount > maxAmt) {
        console.log(`\n⚠️  Payment amount ${reqAmount} exceeds your max-amount ${maxAmt}`);
      } else {
        console.log(`\n✅ Payment amount is within your max-amount (${maxAmount})`);
      }
    }

    if (options.json) {
      output({ dryRun: true, requirements: req }, true);
    }
    return;
  }

  // Actual payment
  const privateKey = getPrivateKey(options);
  if (!privateKey) {
    console.error('Error: Private key required. Use --private-key or set X402_PRIVATE_KEY');
    process.exit(1);
  }

  if (!maxAmount) {
    console.error('Error: Max amount required. Use --max-amount or set X402_MAX_AMOUNT');
    process.exit(1);
  }

  console.log(`\nPaying for ${url}...\n`);
  console.log(`Network: ${network}`);
  console.log(`Max Amount: ${maxAmount}`);

  const signer = await createSigner(network, privateKey);
  const response = await x402Fetch(url, signer, { maxAmount });

  const data = await response.text();

  if (options.json) {
    output({
      status: response.status,
      url: response.url,
      data: data
    }, true);
  } else {
    console.log(`\n✅ Payment successful (status: ${response.status})\n`);
    console.log('Response:');
    console.log(data);
  }
}

async function cmdNetworks(options) {
  const networks = listNetworks();

  if (options.json) {
    output(networks, true);
  } else {
    console.log('\nSupported Networks:\n');
    for (const net of networks) {
      console.log(`  ${net.legacyName.padEnd(18)} ${net.caipId.padEnd(16)} (${net.name})`);
    }
    console.log('');
  }
}

async function cmdFacilitator(options) {
  const url = process.env.X402_FACILITATOR || DEFAULT_FACILITATOR;

  console.log(`\nFacilitator: ${url}\n`);

  try {
    const info = await getFacilitatorInfo(url);
    if (options.json) {
      output(info, true);
    } else {
      console.log('Info:');
      console.log(JSON.stringify(info, null, 2));
    }
  } catch (error) {
    console.log(`Status: Unable to reach (${error.message})`);
  }
}

async function cmdOpenClawInit(options) {
  console.log('\n🦞 x402 OpenClaw Setup\n');

  const skillDir = getOpenClawSkillDir();
  ensureDir(skillDir);

  // Step 1: Wallet
  console.log('[1/3] Wallet Setup');

  const configPath = path.join(skillDir, 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`      → Existing wallet found: ${config.address}`);
  } else {
    const wallet = createWallet();
    config = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      network: 'base',
      facilitator: DEFAULT_FACILITATOR,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`      → Created new wallet: ${wallet.address}`);
    console.log(`      → Saved to: ${configPath}`);
  }

  // Step 2: Network
  console.log('\n[2/3] Network Configuration');
  console.log(`      → Network: ${config.network || 'base'}`);
  console.log(`      → Facilitator: ${config.facilitator || DEFAULT_FACILITATOR}`);

  // Step 3: Skill file
  console.log('\n[3/3] Skill Installation');

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillContent = `---
name: primer-x402
description: Make HTTP-native crypto payments using the x402 protocol. Pay for APIs, access paid resources, and handle 402 Payment Required responses with USDC on Base and other EVM chains.
metadata: {"openclaw":{"emoji":"💸","requires":{"anyBins":["node","npx"]}}}
---

# x402 Payment Protocol

x402 enables instant stablecoin payments directly over HTTP using the 402 Payment Required status code.

## Your Wallet

- **Address**: ${config.address}
- **Network**: ${config.network || 'base'}
- **Token**: USDC

⚠️ Fund this address with USDC on Base before making payments.

## Quick Commands

### Check balance
\`\`\`bash
npx @primersystems/x402 wallet balance ${config.address}
\`\`\`

### Probe a URL for x402 support
\`\`\`bash
npx @primersystems/x402 probe <url>
\`\`\`

### Make a payment
\`\`\`bash
X402_PRIVATE_KEY=<key> npx @primersystems/x402 pay <url> --max-amount 0.10
\`\`\`

## Using in Code (Node.js)

\`\`\`javascript
const { createSigner, x402Fetch } = require('@primersystems/x402');

const signer = await createSigner('base', process.env.X402_PRIVATE_KEY);
const response = await x402Fetch('https://api.example.com/paid', signer, {
  maxAmount: '0.10'
});
\`\`\`

## Using in Code (Python)

\`\`\`python
from primer_x402 import create_signer, x402_requests
import os

signer = create_signer('base', os.environ['X402_PRIVATE_KEY'])
response = x402_requests.get('https://api.example.com/paid', signer=signer, max_amount='0.10')
\`\`\`

## Links

- Documentation: https://primer.systems/x402
- SDK (npm): https://npmjs.com/package/@primersystems/x402
- SDK (pip): https://pypi.org/project/primer-x402
- Facilitator: ${config.facilitator || DEFAULT_FACILITATOR}
`;

  fs.writeFileSync(skillMdPath, skillContent);
  console.log(`      → Created: ${skillMdPath}`);

  // Done
  console.log('\n✅ Setup complete!\n');
  console.log('⚠️  Fund your wallet with USDC on Base:');
  console.log(`   Address: ${config.address}`);
  console.log('   Network: Base (Chain ID 8453)\n');
  console.log('📖 Learn more: https://primer.systems/x402\n');
}

async function cmdOpenClawStatus(options) {
  console.log('\n🦞 x402 OpenClaw Status\n');

  const skillDir = getOpenClawSkillDir();
  const configPath = path.join(skillDir, 'config.json');
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  // Check skill installed
  const skillInstalled = fs.existsSync(skillMdPath);
  console.log(`Skill:    ${skillInstalled ? '✅ Installed' : '❌ Not installed'}`);
  if (skillInstalled) {
    console.log(`          ${skillMdPath}`);
  }

  // Check config
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`\nWallet:   ${config.address}`);
    console.log(`Network:  ${config.network || 'base'}`);

    // Check balance
    try {
      const balance = await getBalance(config.address, config.network || 'base', 'USDC');
      console.log(`Balance:  ${balance.balance} USDC`);
    } catch (e) {
      console.log(`Balance:  Unable to fetch (${e.message})`);
    }
  } else {
    console.log('\nWallet:   ❌ Not configured');
  }

  console.log('');
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.options.help || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  try {
    switch (parsed.command) {
      case 'wallet':
        switch (parsed.subcommand) {
          case 'create':
            await cmdWalletCreate(parsed.options);
            break;
          case 'balance':
            await cmdWalletBalance(parsed.positional[0], parsed.options);
            break;
          case 'from-mnemonic':
            await cmdWalletFromMnemonic(parsed.options);
            break;
          default:
            console.error(`Unknown wallet command: ${parsed.subcommand}`);
            process.exit(1);
        }
        break;

      case 'probe':
        await cmdProbe(parsed.subcommand, parsed.options);
        break;

      case 'pay':
        await cmdPay(parsed.subcommand, parsed.options);
        break;

      case 'networks':
        await cmdNetworks(parsed.options);
        break;

      case 'facilitator':
        await cmdFacilitator(parsed.options);
        break;

      case 'openclaw':
        switch (parsed.subcommand) {
          case 'init':
            await cmdOpenClawInit(parsed.options);
            break;
          case 'status':
            await cmdOpenClawStatus(parsed.options);
            break;
          default:
            console.error(`Unknown openclaw command: ${parsed.subcommand}`);
            process.exit(1);
        }
        break;

      default:
        console.error(`Unknown command: ${parsed.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`\nError: ${error.message}\n`);
    if (parsed.options.json) {
      console.error(JSON.stringify({ error: error.message, code: error.code }, null, 2));
    }
    process.exit(1);
  }
}

main();
