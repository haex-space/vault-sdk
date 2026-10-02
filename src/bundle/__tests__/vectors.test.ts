import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import { ExtensionSigner } from "../../crypto/signing";

const VECTOR_DIR = path.resolve(__dirname, "../../../test-vectors/bundles");

type Expected = { valid: true } | { valid: false; kind: string; path?: string };
const expected = JSON.parse(readFileSync(path.join(VECTOR_DIR, "expected.json"), "utf8")) as Record<string, Expected>;

describe("shared bundle test vectors through the WebAssembly build", () => {
  it("lists every .xt file of the vector directory", () => {
    const files = readdirSync(VECTOR_DIR).filter((f) => f.endsWith(".xt")).sort();
    expect(Object.keys(expected).sort()).toEqual(files);
  });

  it.each(Object.entries(expected))("%s verifies with the expected outcome", async (file, outcome) => {
    const result = await ExtensionSigner.verifyPackage(path.join(VECTOR_DIR, file));
    if (outcome.valid) {
      expect(result).toMatchObject({ valid: true });
    } else {
      expect(result).toMatchObject({ valid: false, kind: outcome.kind });
      if (outcome.path !== undefined) expect(result).toMatchObject({ path: outcome.path });
    }
  });

  it("good-notes-like carries its migrations and the inline-script entry page", async () => {
    const result = await ExtensionSigner.verifyPackage(path.join(VECTOR_DIR, "good-notes-like.xt"));
    if (!result.valid) throw new Error(result.error);
    expect(result.manifest.migrationsDir).toBe("database/migrations");
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("database/migrations/meta/_journal.json");
    expect(paths).toContain("database/migrations/0000_init.sql");
    expect(paths.indexOf("locales/～.json")).toBeLessThan(paths.indexOf("locales/😀.json"));
  });
});
