/**
 * Bundle format `haextension-bundle/2` for the `haex` tool (Node.js only).
 *
 * Every rule lives in the Rust crate `crates/haex-bundle`, which hosts such as holzi use natively;
 * this module only calls its WebAssembly build (`pnpm build:wasm`). Nothing of the format is
 * implemented here, so the tool and the hosts cannot drift apart.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BundleBuilder, initSync, maxArchiveBytes, verifyArchive } from "./wasm/haex_bundle";

export const BUNDLE_FILE_EXTENSION = ".xt";

/** The error kinds of the crate (`ErrorKind::ALL`, checked by `src/bundle/__tests__/wasm.test.ts`). */
export const BUNDLE_ERROR_KINDS = [
  "archive_too_large",
  "archive_invalid",
  "entry_path_invalid",
  "entry_duplicate",
  "entry_too_large",
  "entry_ratio",
  "entry_kind",
  "manifest_not_canonical",
  "manifest_invalid",
  "file_mismatch",
  "public_key_mismatch",
  "signature_invalid",
  "legacy_signature_format",
] as const;

export type BundleErrorKind = (typeof BUNDLE_ERROR_KINDS)[number];

/** One file of a bundle: its path inside the archive and its exact bytes. */
export interface BundleEntry {
  path: string;
  data: Uint8Array;
}

export interface SignedFile {
  path: string;
  sha256: string;
  size: number;
}

export interface VerifiedBundle {
  manifest: Record<string, unknown>;
  /** Every entry except `signature.json`, in UTF-8 byte order. */
  files: SignedFile[];
  /** The migrations in the order they apply. */
  migrations: { name: string; path: string }[];
}

/**
 * A rejected bundle. `kind` is one of the error kinds of `test-vectors/bundles/README.md`;
 * `path` names the entry for entry-level errors and the first differing file for `file_mismatch`.
 */
export class BundleError extends Error {
  constructor(
    public readonly kind: BundleErrorKind,
    message: string,
    public readonly path?: string,
  ) {
    super(`${kind}: ${message}`);
    this.name = "BundleError";
  }
}

const WASM_FILE = "haex_bundle_bg.wasm";

/**
 * The module ships once as `dist/haex_bundle_bg.wasm`. The bundled entries live in `dist/` and
 * `dist/cli/`; from the sources (tests) it is the generated `wasm/` folder next to this file.
 */
function wasmPath(): string {
  const candidates = [join(__dirname, WASM_FILE), join(__dirname, "..", WASM_FILE), join(__dirname, "wasm", WASM_FILE)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`${WASM_FILE} not found next to ${__dirname}; run \`pnpm build:wasm\``);
  return found;
}

let state: "new" | "ready" | "crashed" = "new";

/**
 * Runs `call` in the module. A panic in Rust traps (`panic = "abort"`) and leaves the instance in
 * an undefined state, so the module is not used again in this process.
 */
function inModule<T>(call: () => T): T {
  if (state === "crashed") throw new Error("haex-bundle crashed earlier in this process; restart it");
  if (state === "new") {
    initSync({ module: readFileSync(wasmPath()) });
    state = "ready";
  }
  try {
    return call();
  } catch (error) {
    if (error instanceof WebAssembly.RuntimeError) {
      state = "crashed";
      throw new Error(`haex-bundle crashed (a bug, please report it): ${error.message}`, { cause: error });
    }
    throw error;
  }
}

/** Largest `.xt` file a host accepts; check it before reading a file into memory. */
export function maxBundleBytes(): number {
  return inModule(() => maxArchiveBytes());
}

/** Verifies a `.xt` archive exactly like a host does. Throws a `BundleError` for the first failing rule. */
export function verifyBundle(archive: Uint8Array): VerifiedBundle {
  const result = JSON.parse(inModule(() => verifyArchive(archive))) as
    | ({ valid: true } & VerifiedBundle)
    | { valid: false; kind: BundleErrorKind; message: string; path?: string };
  if (!result.valid) throw new BundleError(result.kind, result.message, result.path);
  return { manifest: result.manifest, files: result.files, migrations: result.migrations };
}

/** A lone UTF-16 surrogate, which would silently become U+FFFD on the way into the module. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Signs the app files with the manifest (without `signature`; its `publicKey` is set from the
 * key), writes the deterministic archive and verifies it. `privateKeyPkcs8` is the Ed25519 key
 * as `haex keygen` writes it. Throws a `BundleError`.
 */
export function buildBundle(
  files: readonly BundleEntry[],
  manifest: Record<string, unknown>,
  privateKeyPkcs8: Uint8Array,
): Uint8Array {
  for (const file of files) {
    if (LONE_SURROGATE.test(file.path)) {
      throw new BundleError("entry_path_invalid", "path is not valid Unicode (lone surrogate)", file.path);
    }
  }
  return inModule(() => {
    const builder = new BundleBuilder();
    for (const file of files) builder.addFile(file.path, file.data);
    try {
      return builder.build(JSON.stringify(manifest), privateKeyPkcs8);
    } catch (error) {
      if (typeof error !== "string") throw error;
      const { kind, message, path } = JSON.parse(error) as { kind: BundleErrorKind; message: string; path?: string };
      throw new BundleError(kind, message, path);
    }
  });
}
