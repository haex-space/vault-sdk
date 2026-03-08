import { deriveKeyFromPassword, arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

export const SIGNING_ALGO = { name: 'ECDSA', namedCurve: 'P-256' }
export const KEY_AGREEMENT_ALGO = { name: 'ECDH', namedCurve: 'P-256' }

export interface UserKeypair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface ExportedUserKeypair {
  publicKey: string   // Base64 SPKI
  privateKey: string  // Base64 PKCS8
}

export async function generateUserKeypairAsync(): Promise<UserKeypair> {
  const keypair = await crypto.subtle.generateKey(SIGNING_ALGO, true, ['sign', 'verify'])
  return { publicKey: keypair.publicKey, privateKey: keypair.privateKey }
}

export async function exportUserKeypairAsync(keypair: UserKeypair): Promise<ExportedUserKeypair> {
  const pub = await crypto.subtle.exportKey('spki', keypair.publicKey)
  const priv = await crypto.subtle.exportKey('pkcs8', keypair.privateKey)
  return { publicKey: arrayBufferToBase64(pub), privateKey: arrayBufferToBase64(priv) }
}

export async function importUserPublicKeyAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToArrayBuffer(base64), SIGNING_ALGO, true, ['verify'])
}

export async function importUserPrivateKeyAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(base64), SIGNING_ALGO, true, ['sign'])
}

export async function importPublicKeyForKeyAgreementAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToArrayBuffer(base64), KEY_AGREEMENT_ALGO, true, [])
}

export async function importPrivateKeyForKeyAgreementAsync(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(base64), KEY_AGREEMENT_ALGO, true, ['deriveBits'])
}

export async function encryptPrivateKeyAsync(
  privateKeyBase64: string, password: string,
): Promise<{ encryptedPrivateKey: string; nonce: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const derivedKey = await deriveKeyFromPassword(password, salt)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, derivedKey,
    new TextEncoder().encode(privateKeyBase64),
  )
  return {
    encryptedPrivateKey: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(nonce),
    salt: arrayBufferToBase64(salt),
  }
}

export async function decryptPrivateKeyAsync(
  encryptedPrivateKey: string, nonce: string, salt: string, password: string,
): Promise<string> {
  const derivedKey = await deriveKeyFromPassword(password, base64ToArrayBuffer(salt))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(nonce) }, derivedKey,
    base64ToArrayBuffer(encryptedPrivateKey),
  )
  return new TextDecoder().decode(decrypted)
}
