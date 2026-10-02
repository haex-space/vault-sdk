import { describe, it, expect } from "vitest";
import { BundleError, compareUtf8, createPathChecker, pathRuleViolation } from "../format";

describe("pathRuleViolation", () => {
  it.each(["index.html", "_nuxt/entry.js", "locales/übersicht.json", "a/b/c/😀.txt", "haextension/icon.png"])(
    "accepts %s",
    (path) => {
      expect(pathRuleViolation(path)).toBeNull();
    },
  );

  it.each([
    ["empty", ""],
    ["absolute", "/etc/passwd"],
    ["dot-dot", "assets/../x"],
    ["dot", "./x"],
    ["empty segment", "a//b"],
    ["trailing slash", "a/"],
    ["backslash", "a\\b"],
    ["colon", "c:x"],
    ["NUL", "a\u0000b"],
    ["control character", "a\u001fb"],
    ["C1 control character", "a\u0085b"],
    ["not NFC", "café.txt"],
    ["segment over 255 bytes", "a/" + "x".repeat(256)],
    ["path over 1024 bytes", ("x".repeat(200) + "/").repeat(6) + "x"],
    ["forbidden config", "haextension.config.json"],
    ["forbidden private key", "haextension/private.key"],
    ["forbidden public key, other case", "HaExtension/Public.KEY"],
  ])("rejects %s", (_label, path) => {
    expect(pathRuleViolation(path)).not.toBeNull();
  });
});

describe("createPathChecker", () => {
  const kindOf = (paths: string[]) => {
    const check = createPathChecker();
    try {
      paths.forEach(check);
      return null;
    } catch (error) {
      return (error as BundleError).kind;
    }
  };

  it("reports an exact duplicate", () => {
    expect(kindOf(["a.js", "a.js"])).toBe("entry_duplicate");
  });

  it("reports paths equal after lowercasing", () => {
    expect(kindOf(["index.html", "Index.html"])).toBe("entry_duplicate");
  });

  it("reports a path rule before a duplicate", () => {
    expect(kindOf(["a.js", "../a.js"])).toBe("entry_path_invalid");
  });

  it("accepts distinct paths", () => {
    expect(kindOf(["a.js", "b.js", "a/b.js"])).toBeNull();
  });
});

describe("compareUtf8", () => {
  it("orders like Buffer.compare on UTF-8, not like UTF-16 sort", () => {
    const paths = ["locales/😀.json", "locales/～.json", "a", "B", "ä", "a/b", "a.b"];
    const byBuffer = [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    expect([...paths].sort(compareUtf8)).toEqual(byBuffer);
    expect([...paths].sort()).not.toEqual(byBuffer);
  });
});
