/**
 * Strict Ed25519 checks on top of WebCrypto, matching what hosts do with
 * `ed25519-dalek`'s `verify_strict`: the public key and the signature's R must
 * be valid points that are not of small order ("weak"), and S must be reduced.
 * WebCrypto alone accepts small-order keys. Browser-compatible (BigInt only).
 */

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

const mod = (a: bigint): bigint => {
  const r = a % P;
  return r >= 0n ? r : r + P;
};

function powMod(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b);
    b = mod(b * b);
    e >>= 1n;
  }
  return result;
}

const D = mod(-121665n * powMod(121666n, P - 2n));
const SQRT_M1 = powMod(2n, (P - 1n) / 4n);

function littleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]!);
  return value;
}

type Point = { x: bigint; y: bigint; z: bigint };

/** RFC 8032 §5.1.3 point decoding; `null` for an invalid or non-canonical encoding. */
function decodePoint(bytes: Uint8Array): Point | null {
  if (bytes.length !== 32) return null;
  const sign = (bytes[31]! >> 7) & 1;
  const yBytes = new Uint8Array(bytes); // copy: Buffer#slice would alias the caller's bytes
  yBytes[31]! &= 0x7f;
  const y = littleEndian(yBytes);
  if (y >= P) return null;
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  let x = mod(u * powMod(v, 3n) * powMod(u * powMod(v, 7n), (P - 5n) / 8n));
  const check = mod(v * x * x);
  if (check === mod(-u)) x = mod(x * SQRT_M1);
  else if (check !== u) return null;
  if (x === 0n && sign === 1) return null;
  if (Number(x & 1n) !== sign) x = P - x;
  return { x, y, z: 1n };
}

/** Point doubling in projective coordinates for a = -1 (dbl-2008-hwcd without T). */
function double({ x, y, z }: Point): Point {
  const a = mod(x * x);
  const b = mod(y * y);
  const c = mod(2n * z * z);
  const d = mod(-a);
  const e = mod((x + y) * (x + y) - a - b);
  const g = mod(d + b);
  const f = mod(g - c);
  const h = mod(d - b);
  return { x: mod(e * f), y: mod(g * h), z: mod(f * g) };
}

function hasSmallOrder(point: Point): boolean {
  const eight = double(double(double(point)));
  return eight.x === 0n && eight.y === eight.z;
}

/** A 32-byte Ed25519 public key that decodes to a point of large order. */
export function isStrictEd25519PublicKey(publicKey: Uint8Array): boolean {
  const point = decodePoint(publicKey);
  return point !== null && !hasSmallOrder(point);
}

/** R decodes to a point of large order and S < L. */
export function isStrictEd25519Signature(signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  const r = decodePoint(signature.subarray(0, 32));
  return r !== null && !hasSmallOrder(r) && littleEndian(signature.subarray(32)) < L;
}

/** Exact-size copy; `Buffer#slice` is a view whose `.buffer` is the whole pool. */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => new Uint8Array(bytes).buffer as ArrayBuffer;

/** Ed25519 (pure) verification with the strict checks above. */
export async function verifyEd25519StrictAsync(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  if (!isStrictEd25519PublicKey(publicKey) || !isStrictEd25519Signature(signature)) return false;
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, toArrayBuffer(signature), toArrayBuffer(message));
}

/** Imports a PKCS#8 private key and returns it with its raw public key. */
export async function importEd25519PrivateKeyAsync(
  pkcs8: Uint8Array,
): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const privateKey = await crypto.subtle.importKey("pkcs8", toArrayBuffer(pkcs8), { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!jwk.x) throw new Error("private key export did not include the public key");
  const base64 = jwk.x.replace(/-/g, "+").replace(/_/g, "/");
  const publicKey = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
  return { privateKey, publicKey };
}

export async function signEd25519Async(privateKey: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, toArrayBuffer(message)));
}
