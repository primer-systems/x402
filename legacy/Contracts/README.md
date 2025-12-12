# PrimerStargate Contract
1.0.0

This directory contains the PrimerStargate smart contract

## Contract Address

**Deployed via CREATE2 (same address on all networks):**
```
0x40200001004B5110333e4De8179426971Efd034A
```

## Supported Networks

| Network | Chain ID | Explorer |
|---------|----------|----------|
| Base Mainnet | 8453 | https://basescan.org |
| Base Sepolia | 84532 | https://sepolia.basescan.org |

---

## Contract Functions

### Owner Functions

- `addFacilitator(address)` - Whitelist a facilitator
- `removeFacilitator(address)` - Remove a facilitator
- `proposeFeeChange(uint256)` - Propose new fee (24h timelock)
- `executeFeeChange()` - Execute pending fee change
- `withdrawFees(address, address)` - Withdraw collected fees
- `pause()` - Emergency pause
- `unpause()` - Resume operations

### Facilitator Functions

- `settleERC20(...)` - Settle an ERC-20 payment

### View Functions

- `owner()` - Get contract owner address
- `facilitators(address)` - Check if address is facilitator
- `isFacilitator(address)` - Same as above
- `getNonce(address, address)` - Get user's nonce for a token
- `feePercentage()` - Current fee in basis points
- `collectedFees(address)` - Fees collected for a token

---

## Security

- Contract is `Ownable2Step` - requires 2-step ownership transfer
- Has 24-hour timelock on fee changes
- Max fee capped at 5%
- Pausable for emergencies
- ReentrancyGuard on settlement functions
- EIP-712 signature verification
- Nonce-based replay protection

---

## Support

- Documentation: https://github.com/PrimerSystems/x402
- Protocol: https://x402.org
- Email: support@primersystems.ai
