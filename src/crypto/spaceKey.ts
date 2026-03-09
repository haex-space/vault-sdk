import { importPublicKeyForKeyAgreementAsync, importPrivateKeyForKeyAgreementAsync, KEY_AGREEMENT_ALGO } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer, generateVaultKey } from './vaultKey'

export interface EncryptedSpaceKey {
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
}

export function generateSpaceKey(): Uint8Array<ArrayBuffer> {
  return generateVaultKey() // 32 random bytes
}

export async function encryptSpaceKeyForRecipientAsync(
  spaceKey: Uint8Array<ArrayBuffer>, recipientPublicKeyBase64: string,
): Promise<EncryptedSpaceKey> {
  const ephemeral = await crypto.subtle.generateKey(KEY_AGREEMENT_ALGO, true, ['deriveBits'])
  const recipientKey = await importPublicKeyForKeyAgreementAsync(recipientPublicKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey }, ephemeral.privateKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )

  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, spaceKey)
  const ephPub = await crypto.subtle.exportKey('spki', ephemeral.publicKey)

  return {
    encryptedSpaceKey: arrayBufferToBase64(encrypted),
    keyNonce: arrayBufferToBase64(nonce),
    ephemeralPublicKey: arrayBufferToBase64(ephPub),
  }
}

export async function decryptSpaceKeyAsync(
  encrypted: EncryptedSpaceKey, ownPrivateKeyBase64: string,
): Promise<Uint8Array> {
  const ephPubKey = await crypto.subtle.importKey(
    'spki', base64ToArrayBuffer(encrypted.ephemeralPublicKey), KEY_AGREEMENT_ALGO, true, [],
  )
  const ownPrivKey = await importPrivateKeyForKeyAgreementAsync(ownPrivateKeyBase64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPubKey }, ownPrivKey, 256,
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0),
      info: new TextEncoder().encode('haex-space-key') },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(encrypted.keyNonce) },
    aesKey, base64ToArrayBuffer(encrypted.encryptedSpaceKey),
  )

  return new Uint8Array(decrypted)
}
