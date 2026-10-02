/**
 * Verifying the content of a `haextension-bundle/2` bundle once its archive
 * entries have been read (archive-level rules: see `zip.ts`). Implements steps
 * 2 and 4–7 of the check order in `test-vectors/bundles/README.md`.
 * Browser-compatible (WebCrypto only).
 */

import { parseCanonicalJson, parseRestrictedJson, type JsonValue } from "./jcs";
import {
  MANIFEST_PATH,
  SIGNATURE_PATH,
  BUNDLE_FORMAT,
  BundleError,
  compareUtf8,
  createPathChecker,
  pathRuleViolation,
} from "./format";
import { verifyEd25519StrictAsync, isStrictEd25519PublicKey } from "./ed25519";
import {
  describeFilesAsync,
  fromHex,
  signatureMessage,
  type BundleEntry,
  type SignatureFile,
  type SignedFile,
} from "./sign";

export interface VerifiedBundle {
  /** The parsed manifest (its bytes are canonical, so re-serializing yields them again). */
  manifest: Record<string, JsonValue>;
  signature: SignatureFile;
  /** Every entry except `signature.json`, in UTF-8 byte order. */
  files: SignedFile[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
/** FR-004: lowercase letters, digits and hyphens, starting with a letter, no `__`. */
const EXTENSION_NAME = /^[a-z][a-z0-9-]*$/;
const SEMVER_PARTS = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]*))?(?:\+(.*))?$/;
const SEMVER_NUMBER = /^(?:0|[1-9]\d*)$/;
const SEMVER_IDENTIFIER = /^[0-9A-Za-z-]+$/;
const U64_MAX = 2n ** 64n - 1n;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * SemVer 2.0.0 exactly as the Rust `semver` crate parses it: no leading zeros in
 * numbers or numeric pre-release identifiers, no empty identifiers, major,
 * minor and patch fit into a u64. Build metadata may have leading zeros.
 */
export function isSemver(version: string): boolean {
  const match = SEMVER_PARTS.exec(version);
  if (!match) return false;
  const [, major, minor, patch, pre, build] = match;
  const core = [major!, minor!, patch!];
  if (!core.every((n) => SEMVER_NUMBER.test(n) && BigInt(n) <= U64_MAX)) return false;
  const preValid = (id: string) => SEMVER_IDENTIFIER.test(id) && (!/^\d+$/.test(id) || SEMVER_NUMBER.test(id));
  if (pre !== undefined && !pre.split(".").every(preValid)) return false;
  return build === undefined || build.split(".").every((id) => SEMVER_IDENTIFIER.test(id));
}

const hasExactKeys = (record: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(record).sort();
  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};

/**
 * The pre-v2 format: a manifest carrying a `signature` member and no
 * `signature.json`. Checked before every entry-level rule, because old bundles
 * also contain files and directory entries that v2 forbids.
 */
export function isLegacyBundle(manifestBytes: Uint8Array | undefined, hasSignatureFile: boolean): boolean {
  if (hasSignatureFile || manifestBytes === undefined) return false;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
    return isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, "signature");
  } catch {
    return false;
  }
}

function parseControlFile(
  entry: BundleEntry | undefined,
  missingKind: "manifest_invalid" | "signature_invalid",
  invalidKind: "manifest_not_canonical" | "signature_invalid",
): Record<string, JsonValue> {
  if (!entry) throw new BundleError(missingKind, `${missingKind === "manifest_invalid" ? MANIFEST_PATH : SIGNATURE_PATH} is missing`);
  let value: JsonValue;
  try {
    value = parseCanonicalJson(entry.data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new BundleError(invalidKind, `${entry.path}: ${reason}`, entry.path, { cause: error });
  }
  if (!isRecord(value)) throw new BundleError(missingKind, `${entry.path} is not a JSON object`, entry.path);
  return value;
}

function parseSignatureFile(value: Record<string, JsonValue>): SignatureFile {
  const invalid = (reason: string): never => {
    throw new BundleError("signature_invalid", `${SIGNATURE_PATH}: ${reason}`, SIGNATURE_PATH);
  };
  if (!hasExactKeys(value, ["files", "format", "publicKey", "signature"])) invalid("unexpected or missing members");
  if (value.format !== BUNDLE_FORMAT) invalid(`format is not ${BUNDLE_FORMAT}`);
  if (typeof value.publicKey !== "string" || !HEX64.test(value.publicKey)) invalid("publicKey is not 64 hex digits");
  if (typeof value.signature !== "string" || !HEX128.test(value.signature)) invalid("signature is not 128 hex digits");
  if (!Array.isArray(value.files)) return invalid("files is not an array");

  const files: SignedFile[] = [];
  for (const item of value.files) {
    if (!isRecord(item) || !hasExactKeys(item, ["path", "sha256", "size"])) return invalid("malformed files entry");
    const { path, sha256, size } = item;
    if (typeof path !== "string" || typeof sha256 !== "string" || !HEX64.test(sha256)) invalid("malformed files entry");
    if (typeof size !== "number" || size < 0) invalid("malformed files entry");
    const previous = files[files.length - 1];
    if (previous && compareUtf8(previous.path, path as string) >= 0) invalid("files are not sorted by UTF-8 bytes");
    files.push({ path: path as string, sha256: sha256 as string, size: size as number });
  }
  return {
    files,
    format: BUNDLE_FORMAT,
    publicKey: value.publicKey as string,
    signature: value.signature as string,
  };
}

/** Throws `file_mismatch` for the first path (UTF-8 order) where the lists differ. */
function assertSameFiles(actual: readonly SignedFile[], listed: readonly SignedFile[]): void {
  let i = 0;
  let j = 0;
  while (i < actual.length || j < listed.length) {
    const a = actual[i];
    const l = listed[j];
    const order = !a ? 1 : !l ? -1 : compareUtf8(a.path, l.path);
    if (order < 0) throw new BundleError("file_mismatch", `${a!.path} is not listed in ${SIGNATURE_PATH}`, a!.path);
    if (order > 0) throw new BundleError("file_mismatch", `${l!.path} is listed but missing`, l!.path);
    if (a!.size !== l!.size || a!.sha256 !== l!.sha256) {
      throw new BundleError("file_mismatch", `${a!.path} differs from its listed size or SHA-256`, a!.path);
    }
    i++;
    j++;
  }
}

function assertValidManifest(manifest: Record<string, JsonValue>, files: readonly SignedFile[]): void {
  const invalid = (reason: string): never => {
    throw new BundleError("manifest_invalid", reason, MANIFEST_PATH);
  };
  if ("signature" in manifest) invalid("manifest must not contain a signature field");
  const { name, version, publicKey, entry, migrationsDir, permissions } = manifest;
  if (typeof name !== "string" || !EXTENSION_NAME.test(name) || name.includes("__")) {
    invalid(`name ${JSON.stringify(name)} must be lowercase letters, digits and hyphens, starting with a letter`);
  }
  if (typeof version !== "string" || !isSemver(version)) invalid(`version ${JSON.stringify(version)} is not semver`);
  if (typeof publicKey !== "string" || !isStrictEd25519PublicKey(fromHex(publicKey))) {
    invalid("publicKey is not a valid Ed25519 public key");
  }
  const entryPath = entry ?? "index.html";
  if (typeof entryPath !== "string" || !files.some((f) => f.path === entryPath)) {
    invalid(`entry ${JSON.stringify(entryPath)} is not a file of the bundle`);
  }
  if (migrationsDir != null && (typeof migrationsDir !== "string" || pathRuleViolation(migrationsDir) !== null)) {
    invalid("migrationsDir is not a valid bundle path");
  }
  if (permissions != null && !isRecord(permissions)) invalid("permissions is not an object");
}

/**
 * The migration files a host reads must be there and be text. With
 * `<migrationsDir>/meta/_journal.json`: restricted JSON (canonical form not
 * required) with an `entries` array; each entry has a unique non-negative
 * integer `idx` and a unique string `tag`, and `<migrationsDir>/<tag>.sql` is a
 * file of the bundle. Without a journal the migrations are the `*.sql` files
 * directly in `migrationsDir`. Every migration file is UTF-8.
 */
function assertValidMigrations(migrationsDir: string, byPath: ReadonlyMap<string, BundleEntry>): void {
  const journalPath = `${migrationsDir}/meta/_journal.json`;
  const invalid = (reason: string, path = journalPath): never => {
    throw new BundleError("manifest_invalid", `${path}: ${reason}`, path);
  };
  const journal = byPath.get(journalPath);
  const migrations: string[] = [];
  if (!journal) {
    const prefix = `${migrationsDir}/`;
    for (const path of byPath.keys()) {
      if (path.startsWith(prefix) && path.endsWith(".sql") && !path.slice(prefix.length).includes("/")) {
        migrations.push(path);
      }
    }
  } else {
    let value: JsonValue;
    try {
      value = parseRestrictedJson(utf8Decoder.decode(journal.data));
    } catch (error) {
      return invalid(`not restricted JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!isRecord(value) || !Array.isArray(value.entries)) return invalid("entries is not an array");
    const indices = new Set<number>();
    const tags = new Set<string>();
    for (const item of value.entries) {
      if (!isRecord(item) || typeof item.idx !== "number" || item.idx < 0 || typeof item.tag !== "string") {
        return invalid("entry without a non-negative integer idx and a string tag");
      }
      if (indices.has(item.idx) || tags.has(item.tag)) invalid(`idx ${item.idx} or tag ${JSON.stringify(item.tag)} repeats`);
      indices.add(item.idx);
      tags.add(item.tag);
      const sqlPath = `${migrationsDir}/${item.tag}.sql`;
      if (pathRuleViolation(sqlPath) !== null || !byPath.has(sqlPath)) invalid(`${sqlPath} is not a file of the bundle`);
      migrations.push(sqlPath);
    }
  }
  for (const path of migrations) {
    try {
      utf8Decoder.decode(byPath.get(path)!.data);
    } catch {
      invalid("migration is not UTF-8", path);
    }
  }
}

/**
 * Verifies a bundle from its entries. Throws a `BundleError` naming the first
 * failing rule; returns the manifest, `signature.json` and file list otherwise.
 */
export async function verifyBundleEntriesAsync(entries: readonly BundleEntry[]): Promise<VerifiedBundle> {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const manifestEntry = byPath.get(MANIFEST_PATH);
  const signatureEntry = byPath.get(SIGNATURE_PATH);
  if (isLegacyBundle(manifestEntry?.data, signatureEntry !== undefined)) {
    throw new BundleError("legacy_signature_format", "pre-v2 bundle: re-sign it with the current `haex` tool");
  }

  const checkPath = createPathChecker();
  entries.forEach((e) => checkPath(e.path));

  const manifest = parseControlFile(manifestEntry, "manifest_invalid", "manifest_not_canonical");
  const signature = parseSignatureFile(parseControlFile(signatureEntry, "signature_invalid", "signature_invalid"));

  const files = await describeFilesAsync(entries.filter((e) => e.path !== SIGNATURE_PATH));
  assertSameFiles(files, signature.files);

  if (manifest.publicKey !== signature.publicKey) {
    throw new BundleError("public_key_mismatch", "manifest.publicKey differs from signature.json publicKey");
  }
  assertValidManifest(manifest, files);
  if (typeof manifest.migrationsDir === "string") assertValidMigrations(manifest.migrationsDir, byPath);

  const { signature: signatureHex, ...body } = signature;
  const valid = await verifyEd25519StrictAsync(fromHex(body.publicKey), fromHex(signatureHex), signatureMessage(body));
  if (!valid) throw new BundleError("signature_invalid", "Ed25519 signature does not verify", SIGNATURE_PATH);

  return { manifest, signature, files };
}
