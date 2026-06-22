import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PRISM_CONTRACT_ADDRESS,
  PRISM_ABI,
  ERC20_PAYMENT_TYPES,
  createPrismPayload,
  getPrismNonce,
} from "../src/index";

describe("Prism constants", () => {
  it("exports correct contract address", () => {
    expect(PRISM_CONTRACT_ADDRESS).toBe("0x402357ff1e18d42d0f14a5d56d6e1ebd741b3a86");
  });

  it("contract address is checksummed lowercase", () => {
    expect(PRISM_CONTRACT_ADDRESS).toMatch(/^0x[a-f0-9]{40}$/);
  });

  it("exports ABI with getNonce function", () => {
    const getNonceAbi = PRISM_ABI.find((item) => item.name === "getNonce");
    expect(getNonceAbi).toBeDefined();
    expect(getNonceAbi?.type).toBe("function");
    expect(getNonceAbi?.stateMutability).toBe("view");
  });

  it("exports ABI with DOMAIN_SEPARATOR function", () => {
    const domainAbi = PRISM_ABI.find((item) => item.name === "DOMAIN_SEPARATOR");
    expect(domainAbi).toBeDefined();
    expect(domainAbi?.type).toBe("function");
  });

  it("exports EIP-712 payment types", () => {
    expect(ERC20_PAYMENT_TYPES.ERC20Payment).toBeDefined();
    expect(Array.isArray(ERC20_PAYMENT_TYPES.ERC20Payment)).toBe(true);
  });

  it("EIP-712 types have correct fields", () => {
    const fields = ERC20_PAYMENT_TYPES.ERC20Payment.map((f) => f.name);
    expect(fields).toContain("token");
    expect(fields).toContain("from");
    expect(fields).toContain("to");
    expect(fields).toContain("value");
    expect(fields).toContain("nonce");
    expect(fields).toContain("validAfter");
    expect(fields).toContain("validBefore");
  });
});

describe("getPrismNonce", () => {
  it("is a function", () => {
    expect(typeof getPrismNonce).toBe("function");
  });
});

describe("createPrismPayload", () => {
  it("is a function", () => {
    expect(typeof createPrismPayload).toBe("function");
  });

  it("throws without wallet account", async () => {
    const mockWalletClient = {
      account: undefined,
    } as any;

    const mockPublicClient = {} as any;

    await expect(
      createPrismPayload(
        mockWalletClient,
        mockPublicClient,
        {
          token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          value: 1000000n,
        },
        "eip155:8453"
      )
    ).rejects.toThrow("WalletClient must have an account");
  });

  it("creates valid payload with mocked clients", async () => {
    const mockSignature = "0x1234567890abcdef" as `0x${string}`;
    const mockNonce = 5n;
    const mockChainId = 8453;

    const mockWalletClient = {
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      },
      signTypedData: vi.fn().mockResolvedValue(mockSignature),
    } as any;

    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(mockChainId),
      readContract: vi.fn().mockResolvedValue(mockNonce),
    } as any;

    const payload = await createPrismPayload(
      mockWalletClient,
      mockPublicClient,
      {
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        value: 1000000n,
      },
      "eip155:8453"
    );

    expect(payload.x402Version).toBe(2);
    expect(payload.scheme).toBe("exact");
    expect(payload.network).toBe("eip155:8453");
    expect(payload.payload.signature).toBe(mockSignature);
    expect(payload.payload.authorization.from).toBe(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    );
    expect(payload.payload.authorization.to).toBe(
      "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
    );
    expect(payload.payload.authorization.value).toBe("1000000");
    expect(payload.payload.authorization.nonce).toBe("5");
  });

  it("uses custom validity window when provided", async () => {
    const mockSignature = "0xabcdef" as `0x${string}`;

    const mockWalletClient = {
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      },
      signTypedData: vi.fn().mockResolvedValue(mockSignature),
    } as any;

    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453),
      readContract: vi.fn().mockResolvedValue(0n),
    } as any;

    const customValidAfter = 1000000;
    const customValidBefore = 2000000;

    const payload = await createPrismPayload(
      mockWalletClient,
      mockPublicClient,
      {
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        value: 500000n,
        validAfter: customValidAfter,
        validBefore: customValidBefore,
      },
      "eip155:8453"
    );

    expect(payload.payload.authorization.validAfter).toBe(customValidAfter);
    expect(payload.payload.authorization.validBefore).toBe(customValidBefore);
  });

  it("calls signTypedData with correct EIP-712 structure", async () => {
    const mockSignTypedData = vi.fn().mockResolvedValue("0xsig" as `0x${string}`);

    const mockWalletClient = {
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      },
      signTypedData: mockSignTypedData,
    } as any;

    const mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(8453),
      readContract: vi.fn().mockResolvedValue(0n),
    } as any;

    await createPrismPayload(
      mockWalletClient,
      mockPublicClient,
      {
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        value: 1000000n,
      },
      "eip155:8453"
    );

    expect(mockSignTypedData).toHaveBeenCalledTimes(1);
    const callArgs = mockSignTypedData.mock.calls[0][0];
    expect(callArgs.domain.name).toBe("Primer");
    expect(callArgs.domain.version).toBe("1");
    expect(callArgs.primaryType).toBe("ERC20Payment");
  });
});
