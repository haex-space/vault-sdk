import { describe, expect, it } from "vitest";
import { BUNDLE_ERROR_KINDS, BundleError, buildBundle, maxBundleBytes } from "..";
import { errorKinds } from "../wasm/haex_bundle";

describe("the WebAssembly build of haex-bundle", () => {
  it("has exactly the error kinds of BundleErrorKind", () => {
    maxBundleBytes(); // initialises the module
    expect([...BUNDLE_ERROR_KINDS].sort()).toEqual((JSON.parse(errorKinds()) as string[]).sort());
  });

  it("rejects a path with a lone surrogate instead of signing U+FFFD", () => {
    const build = () =>
      buildBundle([{ path: "a\uD800.js", data: new Uint8Array() }], { name: "demo" }, new Uint8Array());
    expect(build).toThrow(BundleError);
    expect(build).toThrow(/entry_path_invalid/);
  });
});
