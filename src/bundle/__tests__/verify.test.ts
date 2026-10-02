import { describe, it, expect } from "vitest";
import { isSemver } from "../verify";

describe("isSemver (as the Rust semver crate parses versions)", () => {
  it.each(["0.0.0", "1.2.3", "1.0.0-alpha", "1.0.0-rc.1", "1.0.0-0.3.7", "1.0.0-x-y.0", "1.0.0+001", "1.0.0-rc.1+build.007",
    "18446744073709551615.0.0"])("accepts %s", (version) => {
    expect(isSemver(version)).toBe(true);
  });

  it.each(["1.0", "v1.0.0", " 1.0.0", "01.0.0", "1.00.0", "1.0.0-", "1.0.0+", "1.0.0-rc..1", "1.0.0-rc.01", "1.0.0-ü",
    "1.0.0+b..1", "18446744073709551616.0.0"])("rejects %s", (version) => {
    expect(isSemver(version)).toBe(false);
  });
});
