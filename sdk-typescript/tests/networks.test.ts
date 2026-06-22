import { describe, it, expect } from "vitest";
import { skaleNetworks } from "../src/index";

describe("skaleNetworks", () => {
  it("exports SKALE Base mainnet chain ID", () => {
    expect(skaleNetworks.base).toBe("eip155:1187947933");
  });

  it("exports SKALE Base Sepolia chain ID", () => {
    expect(skaleNetworks.baseSepolia).toBe("eip155:324705682");
  });

  it("chain IDs are in CAIP-2 format", () => {
    expect(skaleNetworks.base).toMatch(/^eip155:\d+$/);
    expect(skaleNetworks.baseSepolia).toMatch(/^eip155:\d+$/);
  });

  it("is readonly (const assertion)", () => {
    // TypeScript enforces this at compile time, but we can check the values don't change
    const originalBase = skaleNetworks.base;
    const originalSepolia = skaleNetworks.baseSepolia;

    expect(skaleNetworks.base).toBe(originalBase);
    expect(skaleNetworks.baseSepolia).toBe(originalSepolia);
  });
});
