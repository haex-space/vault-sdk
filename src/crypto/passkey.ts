/**
 * Crypto utilities for WebAuthn/Passkey operations
 * Implements ECDSA P-256 (ES256) key generation and signing
 *
 * Used for:
 * - Generating passkey key pairs during WebAuthn registration
 * - Signing authentication challenges during WebAuthn authentication
 * - Exporting/importing keys for storage
 *
 * Browser-compatible using the Web Crypto API
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

// COSE Algorithm identifiers
// https://www.iana.org/assignments/cose/cose.xhtml#algorithms
export const COSE_ALGORITHM = {
  ES256: -7, // ECDSA with SHA-256 and P-256 curve
  ES384: -35, // ECDSA with SHA-384 and P-384 curve
  ES512: -36, // ECDSA with SHA-512 and P-521 curve
  EdDSA: -8, // EdDSA (Ed25519)
  RS256: -257, // RSASSA-PKCS1-v1_5 with SHA-256
} as const

export type CoseAlgorithm = (typeof COSE_ALGORITHM)[keyof typeof COSE_ALGORITHM]

// WebCrypto algorithm configuration for ES256
const ES256_ALGORITHM: EcKeyGenParams = {
  name: 'ECDSA',
  namedCurve: 'P-256',
}

const ES256_SIGN_ALGORITHM: EcdsaParams = {
  name: 'ECDSA',
  hash: 'SHA-256',
}

export interface PasskeyKeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface ExportedPasskeyKeyPair {
  publicKeyBase64: string // SPKI format
  privateKeyBase64: string // PKCS8 format
  publicKeyCoseBase64: string // COSE format for WebAuthn
}

/**
 * Generates a new ECDSA P-256 key pair for passkey operations
 */
export async function generatePasskeyPairAsync(): Promise<PasskeyKeyPair> {
  const keyPair = await crypto.subtle.generateKey(ES256_ALGORITHM, true, ['sign', 'verify'])

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }
}

/**
 * Exports the public key in SPKI format (Base64)
 */
export async function exportPublicKeyAsync(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey)
  return arrayBufferToBase64(exported)
}

/**
 * Exports the private key in PKCS8 format (Base64)
 */
export async function exportPrivateKeyAsync(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey)
  return arrayBufferToBase64(exported)
}

/**
 * Exports the public key in raw format and converts to COSE key format
 * Required for WebAuthn attestation response
 */
export async function exportPublicKeyCoseAsync(publicKey: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', publicKey)
  const rawBytes = new Uint8Array(rawKey)

  // For P-256, raw format is 65 bytes: 0x04 || x (32 bytes) || y (32 bytes)
  if (rawBytes.length !== 65 || rawBytes[0] !== 0x04) {
    throw new Error('Invalid P-256 public key format')
  }

  const x = rawBytes.slice(1, 33)
  const y = rawBytes.slice(33, 65)

  // Build COSE_Key structure (CBOR encoded)
  // https://datatracker.ietf.org/doc/html/rfc8152#section-13.1.1
  const coseKey = encodeCoseKey(x, y)
  return arrayBufferToBase64(coseKey)
}

/**
 * Imports a private key from PKCS8 format (Base64)
 */
export async function importPrivateKeyAsync(privateKeyBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(privateKeyBase64)
  return crypto.subtle.importKey('pkcs8', keyData, ES256_ALGORITHM, true, ['sign'])
}

/**
 * Imports a public key from SPKI format (Base64)
 */
export async function importPublicKeyAsync(publicKeyBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(publicKeyBase64)
  return crypto.subtle.importKey('spki', keyData, ES256_ALGORITHM, true, ['verify'])
}

/**
 * Signs data with a passkey private key using ECDSA with SHA-256
 * Returns the signature in DER format (as used by WebAuthn)
 */
export async function signWithPasskeyAsync(
  privateKey: CryptoKey,
  data: ArrayBuffer | Uint8Array
): Promise<ArrayBuffer> {
  // WebCrypto returns signature in IEEE P1363 format (r || s, each 32 bytes for P-256)
  const signature = await crypto.subtle.sign(ES256_SIGN_ALGORITHM, privateKey, data)

  // Convert to DER format for WebAuthn compatibility
  return convertP1363ToDer(new Uint8Array(signature))
}

/**
 * Verifies a signature with a passkey public key
 */
export async function verifyWithPasskeyAsync(
  publicKey: CryptoKey,
  signature: ArrayBuffer | Uint8Array,
  data: ArrayBuffer | Uint8Array
): Promise<boolean> {
  // Convert DER signature to P1363 format for WebCrypto
  const p1363Signature = convertDerToP1363(new Uint8Array(signature))
  return crypto.subtle.verify(ES256_SIGN_ALGORITHM, publicKey, p1363Signature, data)
}

/**
 * Generates a random credential ID (16 bytes)
 */
export function generateCredentialId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

/**
 * Exports a full key pair for storage
 */
export async function exportKeyPairAsync(keyPair: PasskeyKeyPair): Promise<ExportedPasskeyKeyPair> {
  const [publicKeyBase64, privateKeyBase64, publicKeyCoseBase64] = await Promise.all([
    exportPublicKeyAsync(keyPair.publicKey),
    exportPrivateKeyAsync(keyPair.privateKey),
    exportPublicKeyCoseAsync(keyPair.publicKey),
  ])

  return {
    publicKeyBase64,
    privateKeyBase64,
    publicKeyCoseBase64,
  }
}

// === CBOR/COSE Encoding Helpers ===

/**
 * Encodes a P-256 public key as a COSE_Key structure
 * https://datatracker.ietf.org/doc/html/rfc8152#section-13.1.1
 */
function encodeCoseKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  // COSE_Key for EC2 (P-256):
  // {
  //   1: 2,      // kty: EC2
  //   3: -7,     // alg: ES256
  //   -1: 1,     // crv: P-256
  //   -2: x,     // x coordinate
  //   -3: y,     // y coordinate
  // }

  const parts: number[] = []

  // Map with 5 items
  parts.push(0xa5)

  // 1: 2 (kty: EC2)
  parts.push(0x01, 0x02)

  // 3: -7 (alg: ES256)
  parts.push(0x03, 0x26) // 0x26 = -7 in CBOR

  // -1: 1 (crv: P-256)
  parts.push(0x20, 0x01) // 0x20 = -1 in CBOR

  // -2: x (bstr)
  parts.push(0x21) // 0x21 = -2 in CBOR
  parts.push(0x58, 0x20) // bstr with 32 bytes
  for (let i = 0; i < x.length; i++) {
    parts.push(x[i]!)
  }

  // -3: y (bstr)
  parts.push(0x22) // 0x22 = -3 in CBOR
  parts.push(0x58, 0x20) // bstr with 32 bytes
  for (let i = 0; i < y.length; i++) {
    parts.push(y[i]!)
  }

  return new Uint8Array(parts)
}

// === Signature Format Conversion ===

/**
 * Converts an ECDSA signature from IEEE P1363 format (r || s) to DER format
 * WebAuthn expects DER format
 */
function convertP1363ToDer(signature: Uint8Array): ArrayBuffer {
  const r = signature.slice(0, 32)
  const s = signature.slice(32, 64)

  const rDer = encodeIntegerDer(r)
  const sDer = encodeIntegerDer(s)

  // SEQUENCE { r INTEGER, s INTEGER }
  const sequenceLength = rDer.length + sDer.length
  const result = new Uint8Array(2 + sequenceLength)
  result[0] = 0x30 // SEQUENCE tag
  result[1] = sequenceLength
  result.set(rDer, 2)
  result.set(sDer, 2 + rDer.length)

  return result.buffer
}

/**
 * Converts an ECDSA signature from DER format to IEEE P1363 format (r || s)
 * WebCrypto uses P1363 format
 */
function convertDerToP1363(derSignature: Uint8Array): ArrayBuffer {
  // Parse SEQUENCE
  if (derSignature[0] !== 0x30) {
    throw new Error('Invalid DER signature: expected SEQUENCE')
  }

  let offset = 2 // Skip SEQUENCE tag and length

  // Parse r INTEGER
  if (derSignature[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER for r')
  }
  offset++
  const rLength = derSignature[offset]!
  offset++
  let r = derSignature.slice(offset, offset + rLength)
  offset += rLength

  // Parse s INTEGER
  if (derSignature[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER for s')
  }
  offset++
  const sLength = derSignature[offset]!
  offset++
  let s = derSignature.slice(offset, offset + sLength)

  // Remove leading zero if present (DER encoding adds leading zero for negative-looking values)
  if (r.length === 33 && r[0] === 0) r = r.slice(1)
  if (s.length === 33 && s[0] === 0) s = s.slice(1)

  // Pad to 32 bytes if needed
  const result = new Uint8Array(64)
  result.set(r, 32 - r.length)
  result.set(s, 64 - s.length)

  return result.buffer
}

/**
 * Encodes an integer as DER INTEGER
 */
function encodeIntegerDer(value: Uint8Array): Uint8Array {
  // Skip leading zeros
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start++
  }

  const trimmed = value.slice(start)

  // Add leading zero if high bit is set (to indicate positive number)
  const needsPadding = (trimmed[0]! & 0x80) !== 0

  const result = new Uint8Array(2 + (needsPadding ? 1 : 0) + trimmed.length)
  result[0] = 0x02 // INTEGER tag
  result[1] = (needsPadding ? 1 : 0) + trimmed.length

  if (needsPadding) {
    result[2] = 0x00
    result.set(trimmed, 3)
  } else {
    result.set(trimmed, 2)
  }

  return result
}

// Re-export Base64 utilities for convenience
export { arrayBufferToBase64, base64ToArrayBuffer }
