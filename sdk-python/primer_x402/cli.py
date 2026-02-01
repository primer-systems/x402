#!/usr/bin/env python3
# Primer x402 - Command Line Interface
# CLI for wallet management, payments, and OpenClaw integration
# https://primer.systems

import os
import sys
import json
import argparse
from pathlib import Path

from .wallet import (
    create_wallet,
    wallet_from_mnemonic,
    get_balance,
    x402_probe,
    get_facilitator_info,
    list_networks,
)
from .utils import DEFAULT_FACILITATOR, NETWORKS


def get_openclaw_skill_dir() -> Path:
    """Get the OpenClaw skill directory path."""
    return Path.home() / ".openclaw" / "skills" / "primer-x402"


def cmd_wallet_create(args):
    """Create a new wallet."""
    wallet = create_wallet()

    if args.json:
        print(json.dumps({
            "address": wallet.address,
            "privateKey": wallet.private_key,
            "mnemonic": wallet.mnemonic
        }, indent=2))
    else:
        print("\n🔐 New Wallet Created\n")
        print(f"Address:     {wallet.address}")
        print(f"Private Key: {wallet.private_key}")
        print(f"Mnemonic:    {wallet.mnemonic}")
        print("\n⚠️  IMPORTANT: Save your mnemonic phrase securely. It cannot be recovered.\n")


def cmd_wallet_balance(args):
    """Check wallet balance."""
    if not args.address:
        print("Error: Address required. Usage: x402 wallet balance <address>")
        sys.exit(1)

    network = args.network or os.environ.get("X402_NETWORK") or os.environ.get("NETWORK") or "base"
    token = args.token or "USDC"

    print(f"\nChecking {token} balance on {network}...\n")

    balance = get_balance(args.address, network, token)

    if args.json:
        print(json.dumps({
            "balance": balance.balance,
            "balanceRaw": balance.balance_raw,
            "decimals": balance.decimals,
            "token": balance.token,
            "network": balance.network
        }, indent=2))
    else:
        print(f"Address: {args.address}")
        print(f"Balance: {balance.balance} {balance.token}")
        print(f"Network: {balance.network}")


def cmd_wallet_from_mnemonic(args):
    """Restore wallet from mnemonic."""
    mnemonic = input("Enter mnemonic phrase: ").strip()
    wallet = wallet_from_mnemonic(mnemonic)

    if args.json:
        print(json.dumps({
            "address": wallet.address,
            "privateKey": wallet.private_key
        }, indent=2))
    else:
        print("\n🔐 Wallet Restored\n")
        print(f"Address:     {wallet.address}")
        print(f"Private Key: {wallet.private_key}")


def cmd_probe(args):
    """Probe a URL for x402 support."""
    if not args.url:
        print("Error: URL required. Usage: x402 probe <url>")
        sys.exit(1)

    print(f"\nProbing {args.url}...\n")

    result = x402_probe(args.url)

    if args.json:
        print(json.dumps({
            "supports402": result.supports_402,
            "requirements": result.requirements,
            "statusCode": result.status_code,
            "error": result.error
        }, indent=2))
    elif result.supports_402:
        print("✅ URL supports x402 payments\n")
        if result.requirements:
            print("Payment Requirements:")
            print(json.dumps(result.requirements, indent=2))
    else:
        print(f"❌ URL does not require payment (status: {result.status_code})")
        if result.error:
            print(f"   Error: {result.error}")


def cmd_pay(args):
    """Make a payment to a 402 endpoint."""
    if not args.url:
        print("Error: URL required. Usage: x402 pay <url>")
        sys.exit(1)

    network = args.network or os.environ.get("X402_NETWORK") or "base"
    max_amount = args.max_amount or os.environ.get("X402_MAX_AMOUNT")

    # Dry run mode - just probe and show what would be paid
    if args.dry_run:
        print(f"\n🔍 Dry run - checking payment requirements for {args.url}...\n")

        result = x402_probe(args.url)

        if not result.supports_402:
            print(f"❌ URL does not require payment (status: {result.status_code})")
            return

        req = result.requirements or {}
        amount = req.get("maxAmountRequired") or req.get("amount") or "unknown"
        asset = req.get("asset") or "USDC"
        recipient = req.get("payTo") or req.get("recipient") or "unknown"
        req_network = req.get("network") or network

        print("Payment Required:")
        print(f"  Amount:    {amount} {asset}")
        print(f"  Recipient: {recipient}")
        print(f"  Network:   {req_network}")

        if max_amount:
            try:
                req_amount = float(amount) if amount != "unknown" else 0
                max_amt = float(max_amount)
                if req_amount > max_amt:
                    print(f"\n⚠️  Payment amount {req_amount} exceeds your max-amount {max_amt}")
                else:
                    print(f"\n✅ Payment amount is within your max-amount ({max_amount})")
            except ValueError:
                pass

        if args.json:
            print(json.dumps({"dryRun": True, "requirements": req}, indent=2))
        return

    # Actual payment requires private key
    private_key = args.private_key or os.environ.get("X402_PRIVATE_KEY")
    if not private_key:
        print("Error: Private key required. Use --private-key or set X402_PRIVATE_KEY")
        sys.exit(1)

    if not max_amount:
        print("Error: Max amount required. Use --max-amount or set X402_MAX_AMOUNT")
        sys.exit(1)

    print(f"\nPaying for {args.url}...\n")
    print(f"Network: {network}")
    print(f"Max Amount: {max_amount}")

    # Import here to avoid circular imports and only when needed
    try:
        from .client import create_signer, x402_fetch

        signer = create_signer(network, private_key)
        response = x402_fetch(args.url, signer, max_amount=max_amount)

        if args.json:
            print(json.dumps({
                "status": response.status_code,
                "url": args.url,
                "data": response.text
            }, indent=2))
        else:
            print(f"\n✅ Payment successful (status: {response.status_code})\n")
            print("Response:")
            print(response.text)
    except ImportError:
        print("Error: Payment functionality requires additional dependencies.")
        print("Install with: pip install primer-x402[all]")
        sys.exit(1)


def cmd_networks(args):
    """List supported networks."""
    networks = list_networks()

    if args.json:
        print(json.dumps(networks, indent=2))
    else:
        print("\nSupported Networks:\n")
        for net in networks:
            print(f"  {net['legacy_name']:<18} {net['caip_id']:<16} ({net['name']})")
        print("")


def cmd_facilitator(args):
    """Show facilitator info."""
    url = os.environ.get("X402_FACILITATOR") or DEFAULT_FACILITATOR

    print(f"\nFacilitator: {url}\n")

    try:
        info = get_facilitator_info(url)
        if args.json:
            print(json.dumps(info, indent=2))
        else:
            print("Info:")
            print(json.dumps(info, indent=2))
    except Exception as e:
        print(f"Status: Unable to reach ({e})")


def cmd_openclaw_init(args):
    """Set up x402 for OpenClaw."""
    print("\n🦞 x402 OpenClaw Setup\n")

    skill_dir = get_openclaw_skill_dir()
    skill_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Wallet
    print("[1/3] Wallet Setup")

    config_path = skill_dir / "config.json"
    config = {}

    if config_path.exists():
        config = json.loads(config_path.read_text())
        print(f"      → Existing wallet found: {config.get('address')}")
    else:
        wallet = create_wallet()
        config = {
            "address": wallet.address,
            "privateKey": wallet.private_key,
            "network": "base",
            "facilitator": DEFAULT_FACILITATOR
        }
        config_path.write_text(json.dumps(config, indent=2))
        print(f"      → Created new wallet: {wallet.address}")
        print(f"      → Saved to: {config_path}")

    # Step 2: Network
    print("\n[2/3] Network Configuration")
    print(f"      → Network: {config.get('network', 'base')}")
    print(f"      → Facilitator: {config.get('facilitator', DEFAULT_FACILITATOR)}")

    # Step 3: Skill file
    print("\n[3/3] Skill Installation")

    skill_md_path = skill_dir / "SKILL.md"
    address = config.get("address", "0x...")
    network = config.get("network", "base")
    facilitator = config.get("facilitator", DEFAULT_FACILITATOR)

    skill_content = f'''---
name: primer-x402
description: Make HTTP-native crypto payments using the x402 protocol. Pay for APIs, access paid resources, and handle 402 Payment Required responses with USDC on Base and other EVM chains.
metadata: {{"openclaw":{{"emoji":"💸","requires":{{"anyBins":["python3","pip"]}}}}}}
---

# x402 Payment Protocol

x402 enables instant stablecoin payments directly over HTTP using the 402 Payment Required status code.

## Your Wallet

- **Address**: {address}
- **Network**: {network}
- **Token**: USDC

⚠️ Fund this address with USDC on Base before making payments.

## Quick Commands

### Check balance
```bash
x402 wallet balance {address}
```

### Probe a URL for x402 support
```bash
x402 probe <url>
```

## Using in Code (Python)

```python
from primer_x402 import create_signer, x402_requests
import os

signer = create_signer('base', os.environ['X402_PRIVATE_KEY'])
response = x402_requests.get('https://api.example.com/paid', signer=signer, max_amount='0.10')
```

## Using in Code (Node.js)

```javascript
const {{ createSigner, x402Fetch }} = require('@primersystems/x402');

const signer = await createSigner('base', process.env.X402_PRIVATE_KEY);
const response = await x402Fetch('https://api.example.com/paid', signer, {{
  maxAmount: '0.10'
}});
```

## Links

- Documentation: https://primer.systems/x402
- SDK (pip): https://pypi.org/project/primer-x402
- SDK (npm): https://npmjs.com/package/@primersystems/x402
- Facilitator: {facilitator}
'''

    skill_md_path.write_text(skill_content)
    print(f"      → Created: {skill_md_path}")

    # Done
    print("\n✅ Setup complete!\n")
    print("⚠️  Fund your wallet with USDC on Base:")
    print(f"   Address: {address}")
    print("   Network: Base (Chain ID 8453)\n")
    print("📖 Learn more: https://primer.systems/x402\n")


def cmd_openclaw_status(args):
    """Check OpenClaw x402 status."""
    print("\n🦞 x402 OpenClaw Status\n")

    skill_dir = get_openclaw_skill_dir()
    config_path = skill_dir / "config.json"
    skill_md_path = skill_dir / "SKILL.md"

    # Check skill installed
    skill_installed = skill_md_path.exists()
    print(f"Skill:    {'✅ Installed' if skill_installed else '❌ Not installed'}")
    if skill_installed:
        print(f"          {skill_md_path}")

    # Check config
    if config_path.exists():
        config = json.loads(config_path.read_text())
        print(f"\nWallet:   {config.get('address')}")
        print(f"Network:  {config.get('network', 'base')}")

        # Check balance
        try:
            balance = get_balance(config["address"], config.get("network", "base"), "USDC")
            print(f"Balance:  {balance.balance} USDC")
        except Exception as e:
            print(f"Balance:  Unable to fetch ({e})")
    else:
        print("\nWallet:   ❌ Not configured")

    print("")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="x402",
        description="x402 - HTTP-native crypto payments CLI\nhttps://primer.systems | https://x402.org",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # wallet commands
    wallet_parser = subparsers.add_parser("wallet", help="Wallet management")
    wallet_subparsers = wallet_parser.add_subparsers(dest="wallet_command")

    wallet_create = wallet_subparsers.add_parser("create", help="Create a new wallet")
    wallet_create.add_argument("--json", action="store_true")

    wallet_balance = wallet_subparsers.add_parser("balance", help="Check wallet balance")
    wallet_balance.add_argument("address", nargs="?", help="Wallet address")
    wallet_balance.add_argument("--network", "-n", help="Network (default: base)")
    wallet_balance.add_argument("--token", "-t", help="Token (default: USDC)")
    wallet_balance.add_argument("--json", action="store_true")

    wallet_mnemonic = wallet_subparsers.add_parser("from-mnemonic", help="Restore from mnemonic")
    wallet_mnemonic.add_argument("--json", action="store_true")

    # probe command
    probe_parser = subparsers.add_parser("probe", help="Check if URL supports x402")
    probe_parser.add_argument("url", nargs="?", help="URL to probe")
    probe_parser.add_argument("--json", action="store_true")

    # pay command
    pay_parser = subparsers.add_parser("pay", help="Make a payment to a 402 endpoint")
    pay_parser.add_argument("url", nargs="?", help="URL to pay for")
    pay_parser.add_argument("--network", "-n", help="Network (default: base)")
    pay_parser.add_argument("--max-amount", help="Maximum payment amount in USDC")
    pay_parser.add_argument("--private-key", help="Private key (or use X402_PRIVATE_KEY env)")
    pay_parser.add_argument("--dry-run", action="store_true", help="Show payment details without paying")
    pay_parser.add_argument("--json", action="store_true")

    # networks command
    networks_parser = subparsers.add_parser("networks", help="List supported networks")
    networks_parser.add_argument("--json", action="store_true")

    # facilitator command
    facilitator_parser = subparsers.add_parser("facilitator", help="Show facilitator info")
    facilitator_parser.add_argument("--json", action="store_true")

    # openclaw commands
    openclaw_parser = subparsers.add_parser("openclaw", help="OpenClaw integration")
    openclaw_subparsers = openclaw_parser.add_subparsers(dest="openclaw_command")

    openclaw_init = openclaw_subparsers.add_parser("init", help="Set up x402 for OpenClaw")
    openclaw_init.add_argument("--json", action="store_true")

    openclaw_status = openclaw_subparsers.add_parser("status", help="Check OpenClaw status")
    openclaw_status.add_argument("--json", action="store_true")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    try:
        if args.command == "wallet":
            if args.wallet_command == "create":
                cmd_wallet_create(args)
            elif args.wallet_command == "balance":
                cmd_wallet_balance(args)
            elif args.wallet_command == "from-mnemonic":
                cmd_wallet_from_mnemonic(args)
            else:
                wallet_parser.print_help()
        elif args.command == "probe":
            cmd_probe(args)
        elif args.command == "pay":
            cmd_pay(args)
        elif args.command == "networks":
            cmd_networks(args)
        elif args.command == "facilitator":
            cmd_facilitator(args)
        elif args.command == "openclaw":
            if args.openclaw_command == "init":
                cmd_openclaw_init(args)
            elif args.openclaw_command == "status":
                cmd_openclaw_status(args)
            else:
                openclaw_parser.print_help()
        else:
            parser.print_help()
    except Exception as e:
        print(f"\nError: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
