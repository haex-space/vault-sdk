import { importPublicKeyForKeyAgreementAsync, importPrivateKeyForKeyAgreementAsync, KEY_AGREEMENT_ALGO } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer, generateVaultKey, encryptString, decryptString } from './vaultKey'

export interface SealedData {
  encryptedData: string
  nonce: string
  ephemeralPublicKey: string
}

export function generateSpaceKey(): Uint8Array<ArrayBuffer> {
  return generateVaultKey() // 32 random bytes
}

export async function encryptWithPublicKeyAsync(
  data: Uint8Array<ArrayBuffer>, recipientPublicKeyBase64: string,
): Promise<SealedData> {
  const ephemeral = await crypto.subtle.generateKey(KEY_AGREEMENT_ALGO, true, ['deriveBits']) as CryptoKeyPair
  const recipientKey = await importPublicKeyForKeyAgreementAsync(recipientPublicKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { ...KEY_AGREEMENT_ALGO, public: recipientKey } as EcdhKeyDeriveParams, ephemeral.privateKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )

  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, data)
  const ephPub = await crypto.subtle.exportKey('spki', ephemeral.publicKey)

  return {
    encryptedData: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(nonce),
    ephemeralPublicKey: arrayBufferToBase64(ephPub),
  }
}

export async function decryptWithPrivateKeyAsync(
  sealed: SealedData, ownPrivateKeyBase64: string,
): Promise<Uint8Array> {
  const ephPubKey = await crypto.subtle.importKey(
    'spki', base64ToArrayBuffer(sealed.ephemeralPublicKey), KEY_AGREEMENT_ALGO, true, [],
  )
  const ownPrivKey = await importPrivateKeyForKeyAgreementAsync(ownPrivateKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { ...KEY_AGREEMENT_ALGO, public: ephPubKey }, ownPrivKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(sealed.nonce) },
    aesKey, base64ToArrayBuffer(sealed.encryptedData),
  )

  return new Uint8Array(decrypted)
}

/**
 * Encrypt a space name using the raw space key.
 * Returns the encrypted name and nonce as base64 strings.
 */
export async function encryptSpaceNameAsync(
  spaceKey: Uint8Array,
  spaceName: string,
): Promise<{ encryptedName: string; nameNonce: string }> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(spaceKey).buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt'],
  )
  const { encryptedData, nonce } = await encryptString(spaceName, cryptoKey)
  return { encryptedName: encryptedData, nameNonce: nonce }
}

/**
 * Decrypt a space name using the raw space key.
 */
export async function decryptSpaceNameAsync(
  spaceKey: Uint8Array,
  encryptedName: string,
  nameNonce: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new Uint8Array(spaceKey).buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt'],
  )
  return decryptString(encryptedName, nameNonce, cryptoKey)
}
