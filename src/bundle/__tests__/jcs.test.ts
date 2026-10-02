import { describe, it, expect } from "vitest";
import { canonicalizeJson, parseCanonicalJson, parseRestrictedJson, RestrictedJsonError } from "../jcs";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("canonicalizeJson", () => {
  it("sorts keys recursively and drops whitespace", () => {
    expect(canonicalizeJson({ b: [1, { d: true, c: null }], a: "x" })).toBe('{"a":"x","b":[1,{"c":null,"d":true}]}');
  });

  it("escapes strings like RFC 8785 (ECMAScript JSON.stringify)", () => {
    // RFC 8785 §3.2.2.2 string example, minus non-restricted parts.
    const value = parseRestrictedJson('"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/"');
    expect(canonicalizeJson(value)).toBe('"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"');
  });

  it("writes integers without exponent and -0 as 0", () => {
    expect(canonicalizeJson([0, -0, 9007199254740991, -9007199254740991])).toBe(
      "[0,0,9007199254740991,-9007199254740991]",
    );
  });

  it.each([
    ["a float", { a: 1.5 }],
    ["an unsafe integer", { a: 2 ** 53 }],
    ["a non-ASCII key", { "ä": 1 }],
    ["a lone surrogate", { a: "\ud800" }],
    ["an undefined member", { a: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalizeJson(value)).toThrow(RestrictedJsonError);
  });
});

describe("parseCanonicalJson", () => {
  it("accepts exactly canonical bytes and returns the value", () => {
    expect(parseCanonicalJson(bytes('{"a":[1,"ü"],"b":{}}'))).toEqual({ a: [1, "ü"], b: {} });
  });

  it.each([
    ["whitespace", '{"a": 1}'],
    ["unsorted keys", '{"b":1,"a":2}'],
    ["a float", '{"a":1.5}'],
    ["an exponent", '{"a":1e3}'],
    ["a fraction of zero", '{"a":1.0}'],
    ["a duplicate key", '{"a":1,"a":1}'],
    ["a non-ASCII key", '{"ä":1}'],
    ["an integer beyond 2^53", '{"a":9007199254740993}'],
    ["a needless escape", '{"a":"\\u0041"}'],
    ["an escaped slash", '{"a":"\\/"}'],
    ["a byte order mark", '﻿{"a":1}'],
    ["trailing data", '{"a":1}x'],
    ["a leading zero", '{"a":01}'],
  ])("rejects %s", (_label, text) => {
    expect(() => parseCanonicalJson(bytes(text))).toThrow(RestrictedJsonError);
  });

  it("rejects invalid UTF-8", () => {
    expect(() => parseCanonicalJson(new Uint8Array([0x22, 0xc3, 0x28, 0x22]))).toThrow(RestrictedJsonError);
  });

  it("does not let __proto__ change the prototype", () => {
    const value = parseCanonicalJson(bytes('{"__proto__":{"polluted":1}}')) as Record<string, unknown>;
    expect(Object.keys(value)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects nesting deeper than the limit instead of overflowing the stack", () => {
    expect(() => parseCanonicalJson(bytes("[".repeat(10_000) + "]".repeat(10_000)))).toThrow(RestrictedJsonError);
  });
});
