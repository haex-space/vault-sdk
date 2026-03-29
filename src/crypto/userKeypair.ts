import { deriveKeyFromPassword, arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

export const SIGNING_ALGO: Algorithm = { name: 'Ed25519' }
export const KEY_AGREEMENT_ALGO: Algorithm = { name: 'X25519' }

export interface UserKeypair {
  signingPublicKey: CryptoKey
  signingPrivateKey: CryptoKey
  agreementPublicKey: CryptoKey
  agreementPrivateKey: CryptoKey
}

export interface ExportedUserKeypair {
  signingPublicKey: string    // Base64 SPKI (Ed25519)
  signingPrivateKey: string   // Base64 PKCS8 (Ed25519)
  agreementPublicKey: string  // Base64 SPKI (X25519)
  agreementPrivateKey: string // Base64 PKCS8 (X25519)
}

export async function generateUserKeypairAsync(): Promise<UserKeypair> {
  const signing = await crypto.subtle.generateKey(SIGNING_ALGO, true, ['sign', 'verify']) as CryptoKeyPair
  const agreement = await crypto.subtle.generateKey(KEY_AGREEMENT_ALGO, true, ['deriveBits']) as CryptoKeyPair
  return {
    signingPublicKey: signing.publicKey,
    signingPrivateKey: signing.privateKey,
    agreementPublicKey: agreement.publicKey,
    agreementPrivateKey: agreement.privateKey,
  }
}

export async function exportUserKeypairAsync(keypair: UserKeypair): Promise<ExportedUserKeypair> {
  const [sigPub, sigPriv, agrPub, agrPriv] = await Promise.all([
    crypto.subtle.exportKey('spki', keypair.signingPublicKey),
    crypto.subtle.exportKey('pkcs8', keypair.signingPrivateKey),
    crypto.subtle.exportKey('spki', keypair.agreementPublicKey),
    crypto.subtle.exportKey('pkcs8', keypair.agreementPrivateKey),
  ])
  return {
    signingPublicKey: arrayBufferToBase64(sigPub),
    signingPrivateKey: arrayBufferToBase64(sigPriv),
    agreementPublicKey: arrayBufferToBase64(agrPub),
    agreementPrivateKey: arrayBufferToBase64(agrPriv),
  }
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
