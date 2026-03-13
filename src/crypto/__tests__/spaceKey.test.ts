import { describe, it, expect } from 'vitest'
import {
  generateSpaceKey,
  encryptWithPublicKeyAsync,
  decryptWithPrivateKeyAsync,
  type SealedData,
} from '../spaceKey'
import { arrayBufferToBase64 } from '../vaultKey'

const ECDH_ALGO = { name: 'ECDH', namedCurve: 'P-256' }

async function generateTestEcdhKeypair() {
  const kp = await crypto.subtle.generateKey(ECDH_ALGO, true, ['deriveBits'])
  const pub = arrayBufferToBase64(await crypto.subtle.exportKey('spki', kp.publicKey))
  const priv = arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  return { publicKey: pub, privateKey: priv }
}

describe('spaceKey crypto utilities', () => {
  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('generateSpaceKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateSpaceKey()

      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })

    it('should generate unique keys each time', () => {
      const key1 = generateSpaceKey()
      const key2 = generateSpaceKey()

      expect(arrayBufferToBase64(key1)).not.toBe(arrayBufferToBase64(key2))
    })
  })

  // ============================================================================
  // Encrypt / Decrypt Roundtrip Tests
  // ============================================================================

  describe('encrypt / decrypt roundtrip', () => {
    it('should encrypt for recipient and recipient can decrypt', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)
      const decrypted = await decryptWithPrivateKeyAsync(sealed, recipient.privateKey)

      expect(decrypted).toEqual(spaceKey)
    })

    it('should return valid Base64 strings in encrypted output', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      expect(sealed.encryptedData).toMatch(base64Regex)
      expect(sealed.nonce).toMatch(base64Regex)
      expect(sealed.ephemeralPublicKey).toMatch(base64Regex)
    })

    it('should produce different ciphertext each time (ephemeral key + nonce)', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed1 = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)
      const sealed2 = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)

      expect(sealed1.encryptedData).not.toBe(sealed2.encryptedData)
      expect(sealed1.ephemeralPublicKey).not.toBe(sealed2.ephemeralPublicKey)
    })
  })

  // ============================================================================
  // Multi-Recipient Tests
  // ============================================================================

  describe('multi-recipient encryption', () => {
    it('should encrypt same space key for different recipients, each can decrypt', async () => {
      const alice = await generateTestEcdhKeypair()
      const bob = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealedForAlice = await encryptWithPublicKeyAsync(spaceKey, alice.publicKey)
      const sealedForBob = await encryptWithPublicKeyAsync(spaceKey, bob.publicKey)

      const decryptedByAlice = await decryptWithPrivateKeyAsync(sealedForAlice, alice.privateKey)
      const decryptedByBob = await decryptWithPrivateKeyAsync(sealedForBob, bob.privateKey)

      expect(decryptedByAlice).toEqual(spaceKey)
      expect(decryptedByBob).toEqual(spaceKey)
    })
  })

  // ============================================================================
  // Failure / Security Tests
  // ============================================================================

  describe('wrong private key', () => {
    it('should fail to decrypt with a different private key', async () => {
      const recipient = await generateTestEcdhKeypair()
      const attacker = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)

      await expect(
        decryptWithPrivateKeyAsync(sealed, attacker.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('tampered ciphertext', () => {
    it('should fail to decrypt when ciphertext is modified', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)

      const tampered: SealedData = {
        ...sealed,
        encryptedData: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(48))),
      }

      await expect(
        decryptWithPrivateKeyAsync(tampered, recipient.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('tampered nonce', () => {
    it('should fail to decrypt when nonce is modified', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealed = await encryptWithPublicKeyAsync(spaceKey, recipient.publicKey)

      const tampered: SealedData = {
        ...sealed,
        nonce: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(12))),
      }

      await expect(
        decryptWithPrivateKeyAsync(tampered, recipient.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('key isolation', () => {
    it('should not allow user B to decrypt a key encrypted for user A', async () => {
      const userA = await generateTestEcdhKeypair()
      const userB = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const sealedForA = await encryptWithPublicKeyAsync(spaceKey, userA.publicKey)

      // User B tries to decrypt key meant for User A
      await expect(
        decryptWithPrivateKeyAsync(sealedForA, userB.privateKey)
      ).rejects.toThrow()
    })
  })
})
