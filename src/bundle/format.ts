/**
 * Bundle format `haextension-bundle/2`: constants, error kinds and path rules.
 *
 * Shared by `haex sign` (producer), `haex verify` and hosts (verifiers). The
 * authoritative description is the bundle-format contract of holzi spec 017;
 * the shared test vectors live in `test-vectors/bundles/`. Browser-compatible.
 */

export const BUNDLE_FORMAT = "haextension-bundle/2";
export const BUNDLE_FILE_EXTENSION = ".xt";
export const MANIFEST_PATH = "haextension/manifest.json";
export const SIGNATURE_PATH = "haextension/signature.json";

/** Files that must never be part of a bundle (compared after NFC and lowercasing). */
export const FORBIDDEN_PATHS: readonly string[] = [
  "haextension.config.json",
  "haextension/public.key",
  "haextension/private.key",
];

const MiB = 1024 * 1024;

export const BUNDLE_LIMITS = {
  archiveBytes: 64 * MiB,
  entries: 2000,
  entryBytes: 25 * MiB,
  totalBytes: 64 * MiB,
  ratio: 200,
  pathBytes: 1024,
  segmentBytes: 255,
} as const;

export type BundleErrorKind =
  | "archive_too_large"
  | "archive_invalid"
  | "entry_path_invalid"
  | "entry_duplicate"
  | "entry_too_large"
  | "entry_ratio"
  | "entry_kind"
  | "manifest_not_canonical"
  | "manifest_invalid"
  | "file_mismatch"
  | "public_key_mismatch"
  | "signature_invalid"
  | "legacy_signature_format";

/** A rejected bundle. `path` is set for `file_mismatch` and for entry-level errors. */
export class BundleError extends Error {
  constructor(
    public readonly kind: BundleErrorKind,
    message: string,
    public readonly path?: string,
    options?: { cause?: unknown },
  ) {
    super(`${kind}: ${message}`, options);
    this.name = "BundleError";
  }
}

const utf8Encoder = new TextEncoder();
// eslint-disable-next-line no-control-regex -- rejecting control characters in paths is the rule itself
const CONTROL_OR_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\\:]/;

export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).length;
}

/**
 * Orders paths by their UTF-8 bytes, like Node's `Buffer.compare` (not like
 * `Array.prototype.sort`, which compares UTF-16 code units).
 */
export function compareUtf8(a: string, b: string): number {
  const x = utf8Encoder.encode(a);
  const y = utf8Encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}

/** Key under which two paths count as the same file (NFC, then lowercase). */
export function pathCollisionKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

/** Returns why `path` breaks the path rules, or `null` if it is a valid bundle path. */
export function pathRuleViolation(path: string): string | null {
  if (path.length === 0) return "empty path";
  if (path !== path.normalize("NFC")) return "not in Unicode NFC";
  if (CONTROL_OR_FORBIDDEN.test(path)) return "contains a backslash, colon, NUL or control character";
  if (path.startsWith("/")) return "absolute path";
  if (utf8ByteLength(path) > BUNDLE_LIMITS.pathBytes) return `longer than ${BUNDLE_LIMITS.pathBytes} bytes`;
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") return "empty, '.' or '..' segment";
    if (utf8ByteLength(segment) > BUNDLE_LIMITS.segmentBytes) {
      return `segment longer than ${BUNDLE_LIMITS.segmentBytes} bytes`;
    }
  }
  if (FORBIDDEN_PATHS.includes(pathCollisionKey(path))) return "file must not be packaged";
  return null;
}

/**
 * Returns a checker that throws `entry_path_invalid` for a path that breaks the
 * rules and `entry_duplicate` for a path equal (exactly or after NFC and
 * lowercasing) to one it has already seen.
 */
export function createPathChecker(): (path: string) => void {
  const exact = new Set<string>();
  const folded = new Set<string>();
  return (path) => {
    const violation = pathRuleViolation(path);
    if (violation) throw new BundleError("entry_path_invalid", `${JSON.stringify(path)}: ${violation}`, path);
    if (exact.has(path)) throw new BundleError("entry_duplicate", `${JSON.stringify(path)} appears twice`, path);
    const key = pathCollisionKey(path);
    if (folded.has(key)) {
      throw new BundleError("entry_duplicate", `${JSON.stringify(path)} collides with another path`, path);
    }
    exact.add(path);
    folded.add(key);
  };
}
