import { HTTPFacilitatorClient } from "@x402/core/server";
import type { FacilitatorClient, FacilitatorConfig } from "@x402/core/server";

export const PRIMER_FACILITATOR_URL = "https://x402.primer.systems";

export const skaleNetworks = {
  base: "eip155:1187947933",
  baseSepolia: "eip155:324705682",
} as const;

export const skaleRpcUrls = {
  base: "https://skale-base.skalenodes.com/v1/base",
  baseSepolia: "https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha",
} as const;

/**
 * Creates an HTTPFacilitatorClient pre-configured for the Primer facilitator.
 *
 * @param config - Optional additional config (e.g., auth headers)
 * @returns FacilitatorClient pointing to x402.primer.systems
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from '@x402/express'
 * import { primerFacilitator } from '@primersystems/primer'
 *
 * app.use(paymentMiddleware(routes, server, { facilitator: primerFacilitator() }))
 * ```
 */
export function primerFacilitator(
  config?: Omit<FacilitatorConfig, "url">
): FacilitatorClient {
  return new HTTPFacilitatorClient({
    url: PRIMER_FACILITATOR_URL,
    ...config,
  });
}

export type { FacilitatorClient, FacilitatorConfig };

// Prism settlement mechanism
export {
  PRISM_CONTRACT_ADDRESS,
  PRISM_ABI,
  ERC20_PAYMENT_TYPES,
  createPrismPayload,
  getPrismNonce,
  type PrismPaymentParams,
  type PrismPayload,
} from "./prism";
