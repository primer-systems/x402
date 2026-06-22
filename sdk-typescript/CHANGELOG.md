# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-06-22

### Added
- `primerFacilitator()` - Pre-configured HTTPFacilitatorClient for x402.primer.systems
- `skaleNetworks` - CAIP-2 identifiers for SKALE Base chains
- `skaleRpcUrls` - RPC endpoints for SKALE Base chains
- Prism ERC-20 settlement mechanism:
  - `createPrismPayload()` - Create signed EIP-712 payment authorizations
  - `getPrismNonce()` - Query nonce from Prism contract
  - `PRISM_CONTRACT_ADDRESS` - Canonical Prism address
  - `PRISM_ABI` - Minimal contract ABI
  - `ERC20_PAYMENT_TYPES` - EIP-712 type definitions
