import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, generatePassword, initPassgen } from "..";

describe("the browser entry of haex-passgen", () => {
  it("refuses to run before the module is loaded", () => {
    expect(() => generatePassword({})).toThrow(/initPassgen/);
  });

  it("generates 20 characters of all four classes by default", async () => {
    await initPassgen();
    const result = generatePassword({});
    expect("value" in result).toBe(true);
    if (!("value" in result)) return;
    expect(result.value).toHaveLength(DEFAULT_CONFIG.length);
    expect(result.value).toMatch(/[A-Z]/);
    expect(result.value).toMatch(/[a-z]/);
    expect(result.value).toMatch(/[0-9]/);
  });

  it("follows a pattern and never repeats itself", async () => {
    await initPassgen();
    const first = generatePassword({ usePattern: true, pattern: "dddddd-Cvc" });
    const second = generatePassword({ length: 32 });
    expect(first).toMatchObject({ value: expect.stringMatching(/^[0-9]{6}-[B-Z][aeiou][b-z]$/) });
    expect(second).not.toEqual(generatePassword({ length: 32 }));
  });

  it("names what has to change instead of an empty password", async () => {
    await initPassgen();
    expect(generatePassword({ length: 0 })).toEqual({ error: "length_range" });
    expect(generatePassword({ uppercase: false, lowercase: false, numbers: false, symbols: false })).toEqual({
      error: "no_class",
    });
    expect(generatePassword({ usePattern: true, pattern: "" })).toEqual({ error: "pattern_empty" });
  });
});
