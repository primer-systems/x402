# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-07-05

### Added
- `robinhood_networks` - CAIP-2 identifiers for Robinhood Chain (mainnet and testnet)
- `robinhood_rpc_urls` - RPC endpoints for Robinhood Chain

## [1.0.0] - 2025-06-22

### Added
- `primer_facilitator()` - Async HTTPFacilitatorClient for x402.primer.systems
- `primer_facilitator_sync()` - Sync HTTPFacilitatorClient for x402.primer.systems
- `skale_networks` - CAIP-2 identifiers for SKALE Base chains
- `skale_rpc_urls` - RPC endpoints for SKALE Base chains
- Prism ERC-20 settlement mechanism:
  - `create_prism_payload()` - Create signed EIP-712 payment authorizations
  - `get_prism_nonce()` - Query nonce from Prism contract
  - `PrismPaymentParams` - Dataclass for payment parameters
  - `PrismPayload` - TypedDict for the resulting payload
  - `PRISM_CONTRACT_ADDRESS` - Canonical Prism address
  - `PRISM_ABI` - Minimal contract ABI
  - `ERC20_PAYMENT_TYPES` - EIP-712 type definitions
