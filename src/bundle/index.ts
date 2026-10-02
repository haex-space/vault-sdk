/**
 * Bundle format `haextension-bundle/2` for the `haex` tool (Node.js only).
 *
 * Every rule lives in the Rust crate `crates/haex-bundle`, which hosts such as holzi use natively;
 * this module only calls its WebAssembly build (`pnpm build:wasm`). Nothing of the format is
 * implemented here, so the tool and the hosts cannot drift apart.
 */

import { BundleBuilder, initSync, maxArchiveBytes, verifyArchive } from "./wasm/haex_bundle";
import { WASM_BASE64 } from "./wasm/bytes";

export const BUNDLE_FILE_EXTENSION = ".xt";

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
    public readonly kind: string,
    message: string,
    public readonly path?: string,
  ) {
    super(`${kind}: ${message}`);
    this.name = "BundleError";
  }
}

let initialised = false;

function ensureInitialised(): void {
  if (!initialised) {
    initSync({ module: Buffer.from(WASM_BASE64, "base64") });
    initialised = true;
  }
}

/** Largest `.xt` file a host accepts; check it before reading a file into memory. */
export function maxBundleBytes(): number {
  ensureInitialised();
  return maxArchiveBytes();
}

/** Verifies a `.xt` archive exactly like a host does. Throws a `BundleError` for the first failing rule. */
export function verifyBundle(archive: Uint8Array): VerifiedBundle {
  ensureInitialised();
  const result = JSON.parse(verifyArchive(archive)) as
    | ({ valid: true } & VerifiedBundle)
    | { valid: false; kind: string; message: string; path?: string };
  if (!result.valid) throw new BundleError(result.kind, result.message, result.path);
  return { manifest: result.manifest, files: result.files, migrations: result.migrations };
}

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
  ensureInitialised();
  const builder = new BundleBuilder();
  for (const file of files) builder.addFile(file.path, file.data);
  try {
    return builder.build(JSON.stringify(manifest), privateKeyPkcs8);
  } catch (error) {
    if (typeof error !== "string") throw error;
    const { kind, message, path } = JSON.parse(error) as { kind: string; message: string; path?: string };
    throw new BundleError(kind, message, path);
  }
}
