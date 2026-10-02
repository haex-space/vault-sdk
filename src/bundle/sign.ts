/**
 * Producing `haextension/signature.json` for format `haextension-bundle/2`.
 * Browser-compatible (WebCrypto only).
 */

import { canonicalJsonBytes } from "./jcs";
import { BUNDLE_FORMAT, MANIFEST_PATH, SIGNATURE_PATH, BundleError, compareUtf8, createPathChecker } from "./format";
import { importEd25519PrivateKeyAsync, signEd25519Async } from "./ed25519";

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

/** `signature.json` without its `signature` member: exactly what gets signed. */
export interface SignatureBody {
  files: SignedFile[];
  format: typeof BUNDLE_FORMAT;
  publicKey: string;
}

export interface SignatureFile extends SignatureBody {
  signature: string;
}

const utf8Encoder = new TextEncoder();

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error("invalid hex string");
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))));
}

/** Path, size and SHA-256 of each entry, ordered by UTF-8 bytes of the path. */
export async function describeFilesAsync(entries: readonly BundleEntry[]): Promise<SignedFile[]> {
  const sorted = [...entries].sort((a, b) => compareUtf8(a.path, b.path));
  return Promise.all(sorted.map(async (e) => ({ path: e.path, sha256: await sha256Hex(e.data), size: e.data.length })));
}

/** The signed message: `"haextension-bundle/2\n"` followed by JCS of the body. */
export function signatureMessage(body: SignatureBody): Uint8Array {
  const prefix = utf8Encoder.encode(`${BUNDLE_FORMAT}\n`);
  const json = canonicalJsonBytes(body);
  const message = new Uint8Array(prefix.length + json.length);
  message.set(prefix);
  message.set(json, prefix.length);
  return message;
}

/**
 * Signs a bundle. `files` are the app files (no control files); `manifest` is
 * the manifest object and must not carry a `signature` member. Its `publicKey`
 * is set from the private key. Returns every archive entry, control files
 * included, in UTF-8 byte order of their paths.
 */
export async function createSignedBundleEntriesAsync(
  files: readonly BundleEntry[],
  manifest: Record<string, unknown>,
  privateKeyPkcs8: Uint8Array,
): Promise<{ entries: BundleEntry[]; publicKey: string }> {
  if ("signature" in manifest) {
    throw new BundleError("manifest_invalid", "manifest must not contain a signature field (format v2)");
  }
  const { privateKey, publicKey: publicKeyBytes } = await importEd25519PrivateKeyAsync(privateKeyPkcs8);
  const publicKey = toHex(publicKeyBytes);
  let manifestBytes: Uint8Array;
  try {
    manifestBytes = canonicalJsonBytes({ ...manifest, publicKey });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BundleError("manifest_not_canonical", `manifest is not restricted JSON: ${reason}`, MANIFEST_PATH, {
      cause: error,
    });
  }
  const manifestEntry: BundleEntry = { path: MANIFEST_PATH, data: manifestBytes };
  const listed = [...files, manifestEntry];
  const checkPath = createPathChecker();
  for (const entry of listed) {
    if (entry.path === SIGNATURE_PATH) throw new BundleError("entry_path_invalid", `${SIGNATURE_PATH} is reserved`);
    checkPath(entry.path);
  }

  const body: SignatureBody = { files: await describeFilesAsync(listed), format: BUNDLE_FORMAT, publicKey };
  const signature = toHex(await signEd25519Async(privateKey, signatureMessage(body)));
  const signatureEntry: BundleEntry = { path: SIGNATURE_PATH, data: canonicalJsonBytes({ ...body, signature }) };
  const entries = [...listed, signatureEntry].sort((a, b) => compareUtf8(a.path, b.path));
  return { entries, publicKey };
}
