#!/usr/bin/env node
/**
 * Builds the WebAssembly form of the `haex-bundle` crate (crates/haex-bundle), the one
 * implementation of the bundle format `haextension-bundle/2`, into `src/bundle/wasm/`
 * (generated, not committed): the wasm-bindgen glue `haex_bundle.js` / `.d.ts` (`--target web`,
 * initialised synchronously) and the module `haex_bundle_bg.wasm`, which `pnpm build` copies to
 * `dist/` once for every Node.js entry.
 *
 * Needs a Rust toolchain with the `wasm32-unknown-unknown` target and `wasm-bindgen` in the
 * version the crate pins (`wasm-bindgen = "=…"` in crates/haex-bundle/Cargo.toml).
 *
 * Usage: node scripts/build-bundle-wasm.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRATE = join(ROOT, "crates", "haex-bundle");
const OUT_DIR = join(ROOT, "src", "bundle", "wasm");

function tool(command, args, options = {}) {
  try {
    return execFileSync(command, args, { cwd: CRATE, ...options });
  } catch (error) {
    if (error.code === "ENOENT") {
      const hint =
        command === "wasm-bindgen"
          ? `cargo install wasm-bindgen-cli --version ${pinned()}`
          : "install Rust (https://rustup.rs) and `rustup target add wasm32-unknown-unknown`";
      console.error(`✗ ${command} not found: ${hint}`);
      process.exit(1);
    }
    throw error;
  }
}

function pinned() {
  return /wasm-bindgen = \{ version = "=([^"]+)"/.exec(readFileSync(join(CRATE, "Cargo.toml"), "utf8"))?.[1];
}

const installed = tool("wasm-bindgen", ["--version"], { encoding: "utf8" }).trim().split(" ").pop();
if (pinned() !== installed) {
  throw new Error(`wasm-bindgen ${installed} is installed, the crate pins ${pinned()}`);
}

tool("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown", "--features", "wasm", "--lib"], {
  stdio: "inherit",
});
// Cargo resolves CARGO_TARGET_DIR, `build.target-dir` and relative paths; ask it where it built.
const { target_directory: targetDir } = JSON.parse(
  tool("cargo", ["metadata", "--format-version", "1", "--no-deps"], { encoding: "utf8" }),
);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const wasm = join(targetDir, "wasm32-unknown-unknown", "release", "haex_bundle.wasm");
tool("wasm-bindgen", [wasm, "--target", "web", "--out-dir", OUT_DIR, "--out-name", "haex_bundle"], {
  stdio: "inherit",
});
console.log(`✓ haex-bundle wasm: ${statSync(join(OUT_DIR, "haex_bundle_bg.wasm")).size} bytes`);
