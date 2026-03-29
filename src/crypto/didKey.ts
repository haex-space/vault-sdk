import { importUserPublicKeyAsync, SIGNING_ALGO } from './userKeypair'
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
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + i] = bytes[bytes.length - 1 - i]!
  }
  return result
}

// ── Multicodec ──────────────────────────────────────────────────────
// Ed25519 public key: multicodec 0xed, varint-encoded as [0xed, 0x01]
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])

// Ed25519 raw public key is always 32 bytes (no point compression needed)
const ED25519_PUBLIC_KEY_LENGTH = 32

// ── Public API ──────────────────────────────────────────────────────

/**
 * Convert a Base64-encoded SPKI public key to a `did:key` identifier.
 *
 * @param publicKeyBase64 - Base64-encoded SPKI public key (Ed25519)
 * @returns DID string, e.g. `did:key:z6Mk...`
 */
export async function publicKeyToDidKeyAsync(publicKeyBase64: string): Promise<string> {
  const cryptoKey = await importUserPublicKeyAsync(publicKeyBase64)
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey))

  if (rawBytes.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new Error(`Expected ${ED25519_PUBLIC_KEY_LENGTH}-byte Ed25519 public key, got ${rawBytes.length}`)
  }

  // Prepend multicodec prefix
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + rawBytes.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(rawBytes, ED25519_MULTICODEC_PREFIX.length)

  // Multibase base58-btc encoding (prefix 'z')
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

/**
 * Extract a Base64-encoded SPKI public key from a `did:key` identifier.
 *
 * @param did - DID string, e.g. `did:key:z6Mk...`
 * @returns Base64-encoded SPKI public key
 */
export async function didKeyToPublicKeyAsync(did: string): Promise<string> {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Only did:key with base58-btc multibase (z prefix) is supported')
  }

  const multicodecBytes = base58btcDecode(did.slice('did:key:z'.length))

  // Verify Ed25519 multicodec prefix
  if (multicodecBytes[0] !== ED25519_MULTICODEC_PREFIX[0] ||
      multicodecBytes[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported key type in did:key (expected Ed25519)')
  }

  // Extract raw public key (32 bytes, no decompression needed)
  const rawKey = multicodecBytes.slice(ED25519_MULTICODEC_PREFIX.length)

  if (rawKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new Error(`Invalid Ed25519 public key length: ${rawKey.length}`)
  }

  // Import as CryptoKey and re-export as SPKI to get proper ASN.1 wrapping
  const cryptoKey = await crypto.subtle.importKey(
    'raw', rawKey.buffer as ArrayBuffer, SIGNING_ALGO, true, ['verify'],
  )
  const spki = await crypto.subtle.exportKey('spki', cryptoKey)
  return arrayBufferToBase64(spki)
}

/**
 * Extract the raw 32-byte Ed25519 public key from a `did:key` identifier.
 *
 * @param did - DID string, e.g. `did:key:z6Mk...`
 * @returns Raw 32-byte Ed25519 public key
 */
export function didKeyToRawPublicKey(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Only did:key with base58-btc multibase (z prefix) is supported')
  }

  const multicodecBytes = base58btcDecode(did.slice('did:key:z'.length))

  if (multicodecBytes[0] !== ED25519_MULTICODEC_PREFIX[0] ||
      multicodecBytes[1] !== ED25519_MULTICODEC_PREFIX[1]) {
    throw new Error('Unsupported key type in did:key (expected Ed25519)')
  }

  const rawKey = multicodecBytes.slice(ED25519_MULTICODEC_PREFIX.length)

  if (rawKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new Error(`Invalid Ed25519 public key length: ${rawKey.length}`)
  }

  return rawKey
}

/**
 * Generate a fresh identity keypair and return it with its did:key.
 *
 * @returns { did, signingPublicKey, signingPrivateKey, agreementPublicKey, agreementPrivateKey }
 */
export async function generateIdentityAsync(): Promise<{
  did: string
  signingPublicKey: string
  signingPrivateKey: string
  agreementPublicKey: string
  agreementPrivateKey: string
}> {
  const { generateUserKeypairAsync, exportUserKeypairAsync } = await import('./userKeypair')
  const keypair = await generateUserKeypairAsync()
  const exported = await exportUserKeypairAsync(keypair)
  const did = await publicKeyToDidKeyAsync(exported.signingPublicKey)
  return {
    did,
    ...exported,
  }
}
