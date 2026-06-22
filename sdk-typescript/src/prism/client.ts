import {
  type Address,
  type PublicClient,
  type WalletClient,
  getContract,
} from "viem";
import { PRISM_CONTRACT_ADDRESS, PRISM_ABI, ERC20_PAYMENT_TYPES } from "./constants";

export interface PrismPaymentParams {
  /** ERC-20 token address */
  token: Address;
  /** Recipient address */
  to: Address;
  /** Amount in token's smallest unit (e.g., wei for 18 decimals) */
  value: bigint;
  /** Unix timestamp after which the payment is valid */
  validAfter?: number;
  /** Unix timestamp before which the payment is valid */
  validBefore?: number;
}

export interface PrismPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    signature: `0x${string}`;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      nonce: string;
      validAfter: number;
      validBefore: number;
    };
  };
}

/**
 * Get the current nonce for a user/token pair from the Prism contract
 */
export async function getPrismNonce(
  publicClient: PublicClient,
  user: Address,
  token: Address
): Promise<bigint> {
  const contract = getContract({
    address: PRISM_CONTRACT_ADDRESS,
    abi: PRISM_ABI,
    client: publicClient,
  });

  return await contract.read.getNonce([user, token]);
}

/**
 * Create a signed Prism payment payload
 *
 * @param walletClient - Viem wallet client for signing
 * @param publicClient - Viem public client for reading nonce
 * @param params - Payment parameters
 * @param network - Network identifier (e.g., "eip155:8453")
 * @returns Signed payload ready for x402 facilitator
 *
 * @example
 * ```typescript
 * import { createPrismPayload } from '@primersystems/primer'
 * import { createWalletClient, createPublicClient, http } from 'viem'
 * import { base } from 'viem/chains'
 *
 * const publicClient = createPublicClient({ chain: base, transport: http() })
 * const walletClient = createWalletClient({ chain: base, transport: http(), account })
 *
 * const payload = await createPrismPayload(walletClient, publicClient, {
 *   token: '0x...', // ERC-20 token address
 *   to: '0x...',    // recipient
 *   value: 1000000n // amount in smallest unit
 * }, 'eip155:8453')
 * ```
 */
export async function createPrismPayload(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: PrismPaymentParams,
  network: string
): Promise<PrismPayload> {
  const account = walletClient.account;
  if (!account) {
    throw new Error("WalletClient must have an account");
  }

  const chainId = await publicClient.getChainId();
  const from = account.address;

  // Get current nonce from contract
  const nonce = await getPrismNonce(publicClient, from, params.token);

  // Default validity window: now to 1 hour from now
  const now = Math.floor(Date.now() / 1000);
  const validAfter = params.validAfter ?? now - 60; // 1 minute ago (buffer)
  const validBefore = params.validBefore ?? now + 3600; // 1 hour from now

  // Build EIP-712 domain
  const domain = {
    name: "Primer",
    version: "1",
    chainId: BigInt(chainId),
    verifyingContract: PRISM_CONTRACT_ADDRESS,
  } as const;

  // Build message
  const message = {
    token: params.token,
    from,
    to: params.to,
    value: params.value,
    nonce,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
  };

  // Sign
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: ERC20_PAYMENT_TYPES,
    primaryType: "ERC20Payment",
    message,
  });

  return {
    x402Version: 2,
    scheme: "exact",
    network,
    payload: {
      signature,
      authorization: {
        from,
        to: params.to,
        value: params.value.toString(),
        nonce: nonce.toString(),
        validAfter,
        validBefore,
      },
    },
  };
}
