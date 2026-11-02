import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Consumers with `moduleResolution: node` ignore `exports` and find subpath types only here. */
describe("package.json typesVersions", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
    exports: Record<string, { types: string }>;
    typesVersions: Record<string, Record<string, string[]>>;
  };

  it("maps every subpath export to the same declarations as exports", () => {
    const expected = Object.fromEntries(
      Object.entries(pkg.exports)
        .filter(([key]) => key !== ".")
        .map(([key, entry]) => [key.slice(2), [entry.types]]),
    );
    expect(pkg.typesVersions["*"]).toEqual(expected);
  });

  it("leaves the root import to the types field", () => {
    expect(Object.keys(pkg.typesVersions["*"] ?? {})).not.toContain("*");
  });
});
