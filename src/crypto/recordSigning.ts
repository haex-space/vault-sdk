import { importUserPrivateKeyAsync, importUserPublicKeyAsync, SIGNING_ALGO } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

export interface SignableRecord {
  tableName: string
  rowPks: string
  columnName: string | null
  encryptedValue: string | null
  hlcTimestamp: string
}

function canonicalize(record: SignableRecord): Uint8Array<ArrayBuffer> {
  const parts = [
    record.tableName,
    record.rowPks,
    record.columnName === null ? '\x01NULL' : record.columnName,
    record.encryptedValue === null ? '\x01NULL' : record.encryptedValue,
    record.hlcTimestamp,
  ].join('\0')
  return new TextEncoder().encode(parts)
}

export async function signRecordAsync(
  record: SignableRecord, privateKeyBase64: string,
): Promise<string> {
  const key = await importUserPrivateKeyAsync(privateKeyBase64)
  const sig = await crypto.subtle.sign(SIGNING_ALGO, key, canonicalize(record))
  return arrayBufferToBase64(sig)
}

export async function verifyRecordSignatureAsync(
  record: SignableRecord, signatureBase64: string, publicKeyBase64: string,
): Promise<boolean> {
  const key = await importUserPublicKeyAsync(publicKeyBase64)
  return crypto.subtle.verify(
    SIGNING_ALGO, key,
    base64ToArrayBuffer(signatureBase64), canonicalize(record),
  )
}

// ── Space challenge signing ──────────────────────────────────────────

const CHALLENGE_MAX_AGE_MS = 30_000 // 30 seconds

function canonicalizeChallenge(spaceId: string, timestamp: string): ArrayBuffer {
  return new TextEncoder().encode(`${spaceId}\0${timestamp}`).buffer as ArrayBuffer
}

/**
 * Sign a space challenge to prove private key possession.
 * Generates a fresh timestamp internally to prevent misuse.
 *
 * @returns signature (Base64) + timestamp (ISO 8601) to send as
 *          X-Space-Signature / X-Space-Timestamp headers.
 */
export async function signSpaceChallengeAsync(
  spaceId: string, privateKeyBase64: string,
): Promise<{ signature: string; timestamp: string }> {
  const timestamp = new Date().toISOString()
  const key = await importUserPrivateKeyAsync(privateKeyBase64)
  const sig = await crypto.subtle.sign(
    SIGNING_ALGO, key, canonicalizeChallenge(spaceId, timestamp),
  )
  return { signature: arrayBufferToBase64(sig), timestamp }
}

/**
 * Verify a space challenge signature (server-side).
 * Checks both cryptographic validity and timestamp freshness (max 30s).
 */
export async function verifySpaceChallengeAsync(
  spaceId: string, timestamp: string, signatureBase64: string, publicKeyBase64: string,
): Promise<{ valid: boolean; error?: string }> {
  const tsMs = new Date(timestamp).getTime()
  if (Number.isNaN(tsMs)) {
    return { valid: false, error: 'Invalid timestamp format' }
  }
  const age = Date.now() - tsMs
  if (age < 0 || age > CHALLENGE_MAX_AGE_MS) {
    return { valid: false, error: 'Challenge timestamp expired or in the future' }
  }

  try {
    const key = await importUserPublicKeyAsync(publicKeyBase64)
    const isValid = await crypto.subtle.verify(
      SIGNING_ALGO, key,
      base64ToArrayBuffer(signatureBase64), canonicalizeChallenge(spaceId, timestamp),
    )
    return isValid
      ? { valid: true }
      : { valid: false, error: 'Invalid challenge signature' }
  } catch {
    return { valid: false, error: 'Challenge verification failed' }
  }
}
