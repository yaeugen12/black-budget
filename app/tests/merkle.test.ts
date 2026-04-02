// @vitest-environment node
import { describe, it, expect } from "vitest";

import { hexToBytes32 } from "../src/lib/merkle";

describe("Merkle helpers", () => {
  it("converts a 0x-prefixed root without shifting bytes", () => {
    const bytes = hexToBytes32(
      "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
    );

    expect(bytes).toHaveLength(32);
    expect(bytes.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(bytes.slice(-4)).toEqual([29, 30, 31, 32]);
  });

  it("accepts plain hex roots too", () => {
    const bytes = hexToBytes32("ff".repeat(32));
    expect(bytes.every((b) => b === 255)).toBe(true);
  });

  it("rejects invalid root lengths", () => {
    expect(() => hexToBytes32("0x1234")).toThrow("Merkle root must be exactly 32 bytes");
  });
});
