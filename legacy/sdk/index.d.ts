// Type definitions for @primersystems/x402
// https://primersystems.ai | https://x402.org

// Note: WalletClient type is only available if viem is installed
// viem is an optional peer dependency for advanced wallet support
type WalletClient = any;

// ============================================
// Networks
// ============================================

export type NetworkName = 'base' | 'base-sepolia';

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig>;

// ============================================
// Signer
// ============================================

export interface Signer {
  /** Sign EIP-712 typed data */
  signTypedData(domain: object, types: object, message: object, primaryType?: string): Promise<string>;
  /** Get the wallet address */
  getAddress(): string;
  /** Get network information */
  getNetwork(): { name: NetworkName; chainId: number; displayName: string };
  /** Get the underlying provider */
  getProvider(): any;
  /** True if using viem, false if using ethers */
  isViem: boolean;
  /** Get underlying ethers wallet (only if isViem is false) */
  getWallet?(): any;
  /** Get underlying viem wallet client (only if isViem is true) */
  getWalletClient?(): WalletClient;
  /** Get viem public client for read operations (only if isViem is true) */
  getPublicClient?(): any;
}

export interface CreateSignerOptions {
  /** Custom RPC URL (overrides env var and default) */
  rpcUrl?: string;
}

/**
 * Create a signer for x402 payments
 *
 * @example Simple approach (private key)
 * const signer = await createSigner('base', '0xabc123...');
 *
 * @example With custom RPC
 * const signer = await createSigner('base', '0xabc123...', { rpcUrl: 'https://...' });
 *
 * @example Advanced approach (viem wallet client)
 * const signer = await createSigner(walletClient);
 */
export function createSigner(network: NetworkName, privateKey: string, options?: CreateSignerOptions): Promise<Signer>;
export function createSigner(walletClient: WalletClient): Promise<Signer>;

// ============================================
// Payer Functions
// ============================================

export interface PayerOptions {
  /** Maximum amount to pay per request (e.g., '0.50') - REQUIRED */
  maxAmount: string;
  /** Custom facilitator URL */
  facilitator?: string;
  /** Verify payment with facilitator before sending (default: true) */
  verify?: boolean;
}

/**
 * Wrap fetch to automatically handle 402 Payment Required responses
 *
 * @example
 * const fetchWithPay = x402Fetch(fetch, signer, { maxAmount: '0.50' });
 * const response = await fetchWithPay('https://api.example.com/data');
 */
export function x402Fetch(
  fetch: typeof globalThis.fetch,
  signer: Signer,
  options?: PayerOptions
): typeof globalThis.fetch;

/**
 * Wrap axios to automatically handle 402 Payment Required responses
 *
 * @example
 * const axiosWithPay = x402Axios(axios.create(), signer, { maxAmount: '0.50' });
 * const response = await axiosWithPay.get('https://api.example.com/data');
 */
export function x402Axios<T>(
  axiosInstance: T,
  signer: Signer,
  options?: PayerOptions
): T;

export interface ApproveOptions {
  /** Amount to approve in smallest units (default: unlimited) */
  amount?: string;
  /** Custom facilitator URL */
  facilitator?: string;
}

export interface ApproveReceipt {
  hash: string;
  blockNumber: number;
  status: number;
  spender: string;
  amount: string;
}

/**
 * Approve a token for use with x402 payments
 * Required for standard ERC-20 tokens (not needed for EIP-3009 tokens like USDC)
 *
 * @example
 * await approveToken(signer, '0xTokenAddress');
 */
export function approveToken(
  signer: Signer,
  tokenAddress: string,
  options?: ApproveOptions
): Promise<ApproveReceipt>;

// ============================================
// Payee Middleware
// ============================================

export interface RouteConfig {
  /** Amount in human-readable units (e.g., '0.001' for 0.001 tokens) */
  amount: string;
  /** Token contract address */
  asset: string;
  /** Network name */
  network: NetworkName;
  /** Optional description */
  description?: string;
  /** Maximum timeout in seconds for payment settlement (default: 30) */
  maxTimeoutSeconds?: number;
}

export interface NextRouteConfig extends RouteConfig {
  /** Address to receive payments (required for Next.js) */
  payTo: string;
}

export interface PayeeOptions {
  /** Custom facilitator URL */
  facilitator?: string;
}

/**
 * Express middleware for x402 payments
 *
 * @example
 * app.use(x402Express('0xYourWallet', {
 *   '/api/premium': { amount: '0.001', asset: '0x...', network: 'base' }
 * }));
 */
export function x402Express(
  payTo: string,
  routes: Record<string, RouteConfig>,
  options?: PayeeOptions
): (req: any, res: any, next: any) => void;

/**
 * Hono middleware for x402 payments
 *
 * @example
 * app.use('*', x402Hono('0xYourWallet', {
 *   '/api/premium': { amount: '0.001', asset: '0x...', network: 'base' }
 * }));
 */
export function x402Hono(
  payTo: string,
  routes: Record<string, RouteConfig>,
  options?: PayeeOptions
): (c: any, next: any) => Promise<any>;

/**
 * Next.js wrapper for x402 payments
 * Supports both App Router (Next.js 13+) and Pages Router
 *
 * @example App Router
 * export const GET = x402Next(handler, {
 *   payTo: '0xYourWallet', amount: '0.001', asset: '0x...', network: 'base'
 * });
 *
 * @example Pages Router
 * export default x402Next(handler, {
 *   payTo: '0xYourWallet', amount: '0.001', asset: '0x...', network: 'base'
 * });
 */
export function x402Next(
  handler: (req: any, res?: any) => Promise<any>,
  config: NextRouteConfig,
  options?: PayeeOptions
): (req: any, res?: any) => Promise<any>;

// ============================================
// Constants
// ============================================

/** Default facilitator URL (https://x402.primersystems.ai) */
export const DEFAULT_FACILITATOR: string;
