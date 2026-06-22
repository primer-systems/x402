import { describe, it, expect } from "vitest";
import { primerFacilitator, PRIMER_FACILITATOR_URL } from "../src/index";

describe("primerFacilitator", () => {
  it("exports the correct facilitator URL", () => {
    expect(PRIMER_FACILITATOR_URL).toBe("https://x402.primer.systems");
  });

  it("returns a facilitator client", () => {
    const client = primerFacilitator();
    expect(client).toBeDefined();
    expect(typeof client).toBe("object");
  });

  it("client has verify method", () => {
    const client = primerFacilitator();
    expect(typeof client.verify).toBe("function");
  });

  it("client has settle method", () => {
    const client = primerFacilitator();
    expect(typeof client.settle).toBe("function");
  });
});
