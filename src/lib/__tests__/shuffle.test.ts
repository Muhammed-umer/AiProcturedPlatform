import { describe, it, expect } from "vitest";
import { seededShuffle, deriveSeed, mulberry32, randomSeed } from "../shuffle";
import { checkPasswordStrength, generateDefaultPassword } from "../password";

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("seededShuffle", () => {
  it("gives the same order for the same seed", () => {
    expect(seededShuffle(items, 12345)).toEqual(seededShuffle(items, 12345));
  });

  it("gives a different order for a different seed", () => {
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
  });

  it("keeps every item exactly once", () => {
    const out = seededShuffle(items, 999);
    expect(out).toHaveLength(items.length);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not modify the input", () => {
    const copy = [...items];
    seededShuffle(items, 42);
    expect(items).toEqual(copy);
  });

  it("handles empty and single item lists", () => {
    expect(seededShuffle([], 1)).toEqual([]);
    expect(seededShuffle(["only"], 1)).toEqual(["only"]);
  });

  it("actually reorders a reasonably long list", () => {
    const long = Array.from({ length: 50 }, (_, i) => i);
    expect(seededShuffle(long, 7)).not.toEqual(long);
  });
});

describe("deriveSeed", () => {
  it("is stable for the same base and label", () => {
    expect(deriveSeed(100, "q:abc")).toBe(deriveSeed(100, "q:abc"));
  });

  it("separates question order from option order", () => {
    expect(deriveSeed(100, "q:abc")).not.toBe(deriveSeed(100, "o:abc"));
  });

  it("differs per student even for the same label", () => {
    expect(deriveSeed(100, "q:abc")).not.toBe(deriveSeed(200, "q:abc"));
  });

  it("stays a non-negative 32 bit integer", () => {
    const seed = deriveSeed(2147483647, "some:long:label:here");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});

describe("mulberry32", () => {
  it("returns values between zero and one", () => {
    const rand = mulberry32(2024);
    for (let i = 0; i < 200; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randomSeed", () => {
  it("stays inside the positive integer range the column expects", () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed();
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(2147483647);
    }
  });
});

describe("checkPasswordStrength", () => {
  it("accepts a password with letters and numbers", () => {
    expect(checkPasswordStrength("Welcome123").ok).toBe(true);
  });

  it("rejects anything shorter than eight characters", () => {
    const r = checkPasswordStrength("Abc123");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/8 characters/);
  });

  it("rejects a password with no digit", () => {
    expect(checkPasswordStrength("password").ok).toBe(false);
  });

  it("rejects a password with no letter", () => {
    expect(checkPasswordStrength("12345678").ok).toBe(false);
  });
});

describe("generateDefaultPassword", () => {
  it("builds a readable password from the roll number", () => {
    expect(generateDefaultPassword("21CS045")).toBe("Test@S045");
  });

  it("strips punctuation from the roll number", () => {
    expect(generateDefaultPassword("21-CS-0 88")).toBe("Test@S088");
  });

  it("falls back when the roll number has no usable characters", () => {
    expect(generateDefaultPassword("///")).toBe("Test@1234");
  });

  it("always produces a password that passes the strength rules", () => {
    for (const roll of ["21CS001", "A1", "9999", "EC-2022-17"]) {
      expect(checkPasswordStrength(generateDefaultPassword(roll)).ok).toBe(true);
    }
  });
});
