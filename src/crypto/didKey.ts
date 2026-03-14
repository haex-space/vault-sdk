import { importUserPublicKeyAsync } from './userKeypair'
import { arrayBufferToBase64 } from './vaultKey'

// ── Base58-btc alphabet (Bitcoin) ────────────────────────────────────
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58btcEncode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0
  for (const b of bytes) {
    if (b !== 0) break
    zeros++
  }

  // Convert to big integer and repeatedly divide by 58
  const digits: number[] = []
  for (const b of bytes) {
    let carry = b
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }

  return '1'.repeat(zeros) + digits.reverse().map(d => BASE58_ALPHABET[d]).join('')
}

export function base58btcDecode(str: string): Uint8Array {
  // Count leading '1's (= leading zero bytes)
  let zeros = 0
  for (const c of str) {
    if (c !== '1') break
    zeros++
  }

  // Convert from base58 to big integer bytes
  const bytes: number[] = []
  for (const c of str) {
    const value = BASE58_ALPHABET.indexOf(c)
    if (value === -1) throw new Error(`Invalid base58 character: ${c}`)
    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  const result = new Uint8Array(zeros + bytes.length)
  // Leading zeros are already 0 in the Uint8Array
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + i] = bytes[bytes.length - 1 - i]!
  }
  return result
}

// ── P-256 point compression ──────────────────────────────────────────

/**
 * Compress an uncompressed P-256 point (65 bytes: 0x04 || x || y)
 * to compressed form (33 bytes: 0x02/0x03 || x).
 */
function compressP256Point(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('Expected 65-byte uncompressed P-256 point (0x04 prefix)')
  }
  const x = uncompressed.slice(1, 33)
  const yLastByte = uncompressed[64]!
  const prefix = (yLastByte & 1) === 0 ? 0x02 : 0x03
  const compressed = new Uint8Array(33)
  compressed[0] = prefix
  compressed.set(x, 1)
  return compressed
}

/**
 * Decompress a compressed P-256 point (33 bytes) to uncompressed (65 bytes).
 * Uses the secp256r1 (P-256) curve equation: y² = x³ - 3x + b (mod p)
 */
function decompressP256Point(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33 || (compressed[0] !== 0x02 && compressed[0] !== 0x03)) {
    throw new Error('Expected 33-byte compressed P-256 point')
  }

  const isOdd = compressed[0] === 0x03
  const x = bytesToBigInt(compressed.slice(1))

  // P-256 curve parameters
  const p = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
  const b = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b')
  const a = p - 3n

  // y² = x³ + ax + b (mod p)
  const ySquared = (modPow(x, 3n, p) + a * x + b) % p
  let y = modSqrt(ySquared, p)

  // Pick the correct y based on parity
  const yIsOdd = (y & 1n) === 1n
  if (isOdd !== yIsOdd) {
    y = p - y
  }

  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(bigIntToBytes(x, 32), 1)
  uncompressed.set(bigIntToBytes(y, 32), 33)
  return uncompressed
}

// ── BigInt helpers ───────────────────────────────────────────────────

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b)
  }
  return result
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let val = n
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(val & 0xffn)
    val >>= 8n
  }
  return bytes
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base = base % mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return result
}

/**
 * Tonelli-Shanks modular square root for P-256.
 * Since p ≡ 3 (mod 4), we can use the simpler formula: y = a^((p+1)/4) mod p
 */
function modSqrt(a: bigint, p: bigint): bigint {
  // P-256's p ≡ 3 (mod 4), so sqrt(a) = a^((p+1)/4) mod p
  return modPow(a, (p + 1n) / 4n, p)
}

// ── Multicodec ──────────────────────────────────────────────────────
// P-256 public key (compressed): multicodec 0x1200, varint-encoded as [0x80, 0x24]
const P256_MULTICODEC_PREFIX = new Uint8Array([0x80, 0x24])

// ── Public API ──────────────────────────────────────────────────────

/**
 * Convert a Base64-encoded SPKI public key to a `did:key` identifier.
 *
 * @param publicKeyBase64 - Base64-encoded SPKI public key (P-256)
 * @returns DID string, e.g. `did:key:zDnaerDaTF5BXE...`
 */
export async function publicKeyToDidKeyAsync(publicKeyBase64: string): Promise<string> {
  // Import to get a CryptoKey, then export as raw (uncompressed point)
  const cryptoKey = await importUserPublicKeyAsync(publicKeyBase64)
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey))

  // Compress the point
  const compressed = compressP256Point(rawBytes)

  // Prepend multicodec prefix
  const multicodecBytes = new Uint8Array(P256_MULTICODEC_PREFIX.length + compressed.length)
  multicodecBytes.set(P256_MULTICODEC_PREFIX)
  multicodecBytes.set(compressed, P256_MULTICODEC_PREFIX.length)

  // Multibase base58-btc encoding (prefix 'z')
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

/**
 * Extract a Base64-encoded SPKI public key from a `did:key` identifier.
 *
 * @param did - DID string, e.g. `did:key:zDnaerDaTF5BXE...`
 * @returns Base64-encoded SPKI public key
 */
export async function didKeyToPublicKeyAsync(did: string): Promise<string> {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Only did:key with base58-btc multibase (z prefix) is supported')
  }

  const multicodecBytes = base58btcDecode(did.slice('did:key:z'.length))

  // Verify P-256 multicodec prefix
  if (multicodecBytes[0] !== P256_MULTICODEC_PREFIX[0] ||
      multicodecBytes[1] !== P256_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported key type in did:key (expected P-256)')
  }

  // Extract compressed point
  const compressed = multicodecBytes.slice(P256_MULTICODEC_PREFIX.length)

  // Decompress to uncompressed point
  const uncompressed = decompressP256Point(compressed)

  // Import as CryptoKey and re-export as SPKI to get proper ASN.1 wrapping
  const cryptoKey = await crypto.subtle.importKey(
    'raw', uncompressed.buffer as ArrayBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'],
  )
  const spki = await crypto.subtle.exportKey('spki', cryptoKey)
  return arrayBufferToBase64(spki)
}

/**
 * Generate a fresh identity keypair and return it with its did:key.
 *
 * @returns { did, publicKeyBase64, privateKeyBase64 }
 */
export async function generateIdentityAsync(): Promise<{
  did: string
  publicKeyBase64: string
  privateKeyBase64: string
}> {
  const { generateUserKeypairAsync, exportUserKeypairAsync } = await import('./userKeypair')
  const keypair = await generateUserKeypairAsync()
  const exported = await exportUserKeypairAsync(keypair)
  const did = await publicKeyToDidKeyAsync(exported.publicKey)
  return {
    did,
    publicKeyBase64: exported.publicKey,
    privateKeyBase64: exported.privateKey,
  }
}
