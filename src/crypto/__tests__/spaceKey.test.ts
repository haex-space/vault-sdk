import { describe, it, expect } from 'vitest'
import {
  generateSpaceKey,
  encryptSpaceKeyForRecipientAsync,
  decryptSpaceKeyAsync,
  type EncryptedSpaceKey,
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

      const encrypted = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)
      const decrypted = await decryptSpaceKeyAsync(encrypted, recipient.privateKey)

      expect(decrypted).toEqual(spaceKey)
    })

    it('should return valid Base64 strings in encrypted output', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const encrypted = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      expect(encrypted.encryptedSpaceKey).toMatch(base64Regex)
      expect(encrypted.keyNonce).toMatch(base64Regex)
      expect(encrypted.ephemeralPublicKey).toMatch(base64Regex)
    })

    it('should produce different ciphertext each time (ephemeral key + nonce)', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const encrypted1 = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)
      const encrypted2 = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)

      expect(encrypted1.encryptedSpaceKey).not.toBe(encrypted2.encryptedSpaceKey)
      expect(encrypted1.ephemeralPublicKey).not.toBe(encrypted2.ephemeralPublicKey)
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

      const encryptedForAlice = await encryptSpaceKeyForRecipientAsync(spaceKey, alice.publicKey)
      const encryptedForBob = await encryptSpaceKeyForRecipientAsync(spaceKey, bob.publicKey)

      const decryptedByAlice = await decryptSpaceKeyAsync(encryptedForAlice, alice.privateKey)
      const decryptedByBob = await decryptSpaceKeyAsync(encryptedForBob, bob.privateKey)

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

      const encrypted = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)

      await expect(
        decryptSpaceKeyAsync(encrypted, attacker.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('tampered ciphertext', () => {
    it('should fail to decrypt when ciphertext is modified', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const encrypted = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)

      // Tamper with the encrypted space key
      const tampered: EncryptedSpaceKey = {
        ...encrypted,
        encryptedSpaceKey: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(48))),
      }

      await expect(
        decryptSpaceKeyAsync(tampered, recipient.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('tampered nonce', () => {
    it('should fail to decrypt when nonce is modified', async () => {
      const recipient = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const encrypted = await encryptSpaceKeyForRecipientAsync(spaceKey, recipient.publicKey)

      // Tamper with the nonce
      const tampered: EncryptedSpaceKey = {
        ...encrypted,
        keyNonce: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(12))),
      }

      await expect(
        decryptSpaceKeyAsync(tampered, recipient.privateKey)
      ).rejects.toThrow()
    })
  })

  describe('key isolation', () => {
    it('should not allow user B to decrypt a key encrypted for user A', async () => {
      const userA = await generateTestEcdhKeypair()
      const userB = await generateTestEcdhKeypair()
      const spaceKey = generateSpaceKey()

      const encryptedForA = await encryptSpaceKeyForRecipientAsync(spaceKey, userA.publicKey)

      // User B tries to decrypt key meant for User A
      await expect(
        decryptSpaceKeyAsync(encryptedForA, userB.privateKey)
      ).rejects.toThrow()
    })
  })
})
