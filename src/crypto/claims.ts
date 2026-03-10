import { importUserPrivateKeyAsync, importUserPublicKeyAsync } from './userKeypair'
import type { SignedClaimPresentation } from '../types'

/**
 * Creates a signed claim presentation for selective disclosure.
 * The server can verify that the claims come from the identity holder.
 *
 * Canonical form for signing: did\0timestamp\0type1=value1\0type2=value2\0...
 * (claims sorted alphabetically by type)
 */
export async function signClaimPresentationAsync(
  did: string,
  publicKeyBase64: string,
  claims: Record<string, string>,
  privateKeyBase64: string,
): Promise<SignedClaimPresentation> {
  const timestamp = new Date().toISOString()

  const sortedEntries = Object.entries(claims).sort(([a], [b]) => a.localeCompare(b))
  const canonical = [did, timestamp, ...sortedEntries.map(([k, v]) => `${k}=${v}`)].join('\0')

  const privateKey = await importUserPrivateKeyAsync(privateKeyBase64)
  const data = new TextEncoder().encode(canonical)
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  )

  return {
    did,
    publicKey: publicKeyBase64,
    claims,
    timestamp,
    signature: btoa(String.fromCharCode(...new Uint8Array(sig))),
  }
}

/**
 * Verifies a signed claim presentation.
 */
export async function verifyClaimPresentationAsync(
  presentation: SignedClaimPresentation,
): Promise<boolean> {
  const { did, publicKey, claims, timestamp, signature } = presentation

  const sortedEntries = Object.entries(claims).sort(([a], [b]) => a.localeCompare(b))
  const canonical = [did, timestamp, ...sortedEntries.map(([k, v]) => `${k}=${v}`)].join('\0')

  const pubKey = await importUserPublicKeyAsync(publicKey)
  const data = new TextEncoder().encode(canonical)
  const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pubKey,
    sigBytes,
    data,
  )
}
