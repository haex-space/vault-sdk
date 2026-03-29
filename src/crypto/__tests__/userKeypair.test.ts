import { describe, it, expect } from 'vitest'
import {
  generateUserKeypairAsync,
  exportUserKeypairAsync,
  importUserPublicKeyAsync,
  importUserPrivateKeyAsync,
  importPublicKeyForKeyAgreementAsync,
  importPrivateKeyForKeyAgreementAsync,
  encryptPrivateKeyAsync,
  decryptPrivateKeyAsync,
} from '../userKeypair'

async function signData(privateKey: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.sign('Ed25519', privateKey, data)
}

async function verifySignature(publicKey: CryptoKey, signature: ArrayBuffer, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return crypto.subtle.verify('Ed25519', publicKey, signature, data)
}

describe('userKeypair crypto utilities', () => {
  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('generateUserKeypairAsync', () => {
    it('should generate a valid Ed25519 signing keypair', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.signingPublicKey).toBeInstanceOf(CryptoKey)
      expect(keypair.signingPrivateKey).toBeInstanceOf(CryptoKey)
      expect(keypair.signingPublicKey.algorithm).toMatchObject({ name: 'Ed25519' })
      expect(keypair.signingPrivateKey.algorithm).toMatchObject({ name: 'Ed25519' })
    })

    it('should generate a valid X25519 agreement keypair', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.agreementPublicKey).toBeInstanceOf(CryptoKey)
      expect(keypair.agreementPrivateKey).toBeInstanceOf(CryptoKey)
      expect(keypair.agreementPublicKey.algorithm).toMatchObject({ name: 'X25519' })
      expect(keypair.agreementPrivateKey.algorithm).toMatchObject({ name: 'X25519' })
    })

    it('should generate extractable keys', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.signingPublicKey.extractable).toBe(true)
      expect(keypair.signingPrivateKey.extractable).toBe(true)
      expect(keypair.agreementPublicKey.extractable).toBe(true)
      expect(keypair.agreementPrivateKey.extractable).toBe(true)
    })

    it('should generate keys with correct usages', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.signingPublicKey.usages).toContain('verify')
      expect(keypair.signingPrivateKey.usages).toContain('sign')
      expect(keypair.agreementPrivateKey.usages).toContain('deriveBits')
    })

    it('should generate unique keypairs each time', async () => {
      const keypair1 = await generateUserKeypairAsync()
      const keypair2 = await generateUserKeypairAsync()

      const exported1 = await exportUserKeypairAsync(keypair1)
      const exported2 = await exportUserKeypairAsync(keypair2)

      expect(exported1.signingPublicKey).not.toBe(exported2.signingPublicKey)
      expect(exported1.signingPrivateKey).not.toBe(exported2.signingPrivateKey)
      expect(exported1.agreementPublicKey).not.toBe(exported2.agreementPublicKey)
    })
  })

  // ============================================================================
  // Export / Import Roundtrip Tests
  // ============================================================================

  describe('export / import roundtrip', () => {
    it('should export and re-import public key for verification', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPublicKey = await importUserPublicKeyAsync(exported.signingPublicKey)

      const data = new TextEncoder().encode('test message')
      const signature = await signData(keypair.signingPrivateKey, data)
      const valid = await verifySignature(importedPublicKey, signature, data)

      expect(valid).toBe(true)
    })

    it('should export and re-import private key for signing', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPrivateKey = await importUserPrivateKeyAsync(exported.signingPrivateKey)

      const data = new TextEncoder().encode('test message')
      const signature = await signData(importedPrivateKey, data)
      const valid = await verifySignature(keypair.signingPublicKey, signature, data)

      expect(valid).toBe(true)
    })

    it('should roundtrip both keys: export → import → sign → verify', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPublicKey = await importUserPublicKeyAsync(exported.signingPublicKey)
      const importedPrivateKey = await importUserPrivateKeyAsync(exported.signingPrivateKey)

      const data = new TextEncoder().encode('full roundtrip test')
      const signature = await signData(importedPrivateKey, data)
      const valid = await verifySignature(importedPublicKey, signature, data)

      expect(valid).toBe(true)
    })
  })

  // ============================================================================
  // Signing Key Import Tests
  // ============================================================================

  describe('signing key import', () => {
    it('should import private key that can sign', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const importedPrivateKey = await importUserPrivateKeyAsync(exported.signingPrivateKey)

      expect(importedPrivateKey.usages).toContain('sign')

      const data = new TextEncoder().encode('sign test')
      const signature = await signData(importedPrivateKey, data)
      expect(signature.byteLength).toBeGreaterThan(0)
    })

    it('should import public key that can verify', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const importedPublicKey = await importUserPublicKeyAsync(exported.signingPublicKey)

      expect(importedPublicKey.usages).toContain('verify')
    })

    it('should verify signature on different data sizes', async () => {
      const keypair = await generateUserKeypairAsync()

      const testData = [
        new Uint8Array(0),                             // empty
        new TextEncoder().encode('short'),             // short
        new TextEncoder().encode('x'.repeat(10_000)),  // large
      ]

      for (const data of testData) {
        const signature = await signData(keypair.signingPrivateKey, data)
        const valid = await verifySignature(keypair.signingPublicKey, signature, data)
        expect(valid).toBe(true)
      }
    })
  })

  // ============================================================================
  // Key Agreement Import Tests (X25519)
  // ============================================================================

  describe('key agreement import (X25519)', () => {
    it('should import keys for X25519 key agreement', async () => {
      const alice = await generateUserKeypairAsync()
      const bob = await generateUserKeypairAsync()

      const aliceExported = await exportUserKeypairAsync(alice)
      const bobExported = await exportUserKeypairAsync(bob)

      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.agreementPrivateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.agreementPublicKey)

      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: bobPublicKA } as EcdhKeyDeriveParams,
        alicePrivateKA,
        256,
      )

      expect(sharedBits.byteLength).toBe(32)
    })

    it('should derive the same shared secret from both sides', async () => {
      const alice = await generateUserKeypairAsync()
      const bob = await generateUserKeypairAsync()

      const aliceExported = await exportUserKeypairAsync(alice)
      const bobExported = await exportUserKeypairAsync(bob)

      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.agreementPrivateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.agreementPublicKey)
      const sharedFromAlice = await crypto.subtle.deriveBits(
        { name: 'X25519', public: bobPublicKA } as EcdhKeyDeriveParams,
        alicePrivateKA,
        256,
      )

      const bobPrivateKA = await importPrivateKeyForKeyAgreementAsync(bobExported.agreementPrivateKey)
      const alicePublicKA = await importPublicKeyForKeyAgreementAsync(aliceExported.agreementPublicKey)
      const sharedFromBob = await crypto.subtle.deriveBits(
        { name: 'X25519', public: alicePublicKA } as EcdhKeyDeriveParams,
        bobPrivateKA,
        256,
      )

      const aliceSharedBase64 = Buffer.from(sharedFromAlice).toString('base64')
      const bobSharedBase64 = Buffer.from(sharedFromBob).toString('base64')
      expect(aliceSharedBase64).toBe(bobSharedBase64)
    })

    it('should derive different shared secrets with different key pairs', async () => {
      const alice = await generateUserKeypairAsync()
      const bob = await generateUserKeypairAsync()
      const charlie = await generateUserKeypairAsync()

      const aliceExported = await exportUserKeypairAsync(alice)
      const bobExported = await exportUserKeypairAsync(bob)
      const charlieExported = await exportUserKeypairAsync(charlie)

      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.agreementPrivateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.agreementPublicKey)
      const sharedAliceBob = await crypto.subtle.deriveBits(
        { name: 'X25519', public: bobPublicKA } as EcdhKeyDeriveParams,
        alicePrivateKA,
        256,
      )

      const charliePublicKA = await importPublicKeyForKeyAgreementAsync(charlieExported.agreementPublicKey)
      const sharedAliceCharlie = await crypto.subtle.deriveBits(
        { name: 'X25519', public: charliePublicKA } as EcdhKeyDeriveParams,
        alicePrivateKA,
        256,
      )

      expect(Buffer.from(sharedAliceBob).toString('base64'))
        .not.toBe(Buffer.from(sharedAliceCharlie).toString('base64'))
    })
  })

  // ============================================================================
  // Private Key Encryption Tests
  // ============================================================================

  describe('encryptPrivateKeyAsync / decryptPrivateKeyAsync', () => {
    it('should encrypt and decrypt private key with correct password', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const password = 'strong-password-123'

      const encrypted = await encryptPrivateKeyAsync(exported.signingPrivateKey, password)
      const decrypted = await decryptPrivateKeyAsync(
        encrypted.encryptedPrivateKey,
        encrypted.nonce,
        encrypted.salt,
        password,
      )

      expect(decrypted).toBe(exported.signingPrivateKey)
    })

    it('should produce different ciphertext each time (random salt + nonce)', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const password = 'test-password'

      const encrypted1 = await encryptPrivateKeyAsync(exported.signingPrivateKey, password)
      const encrypted2 = await encryptPrivateKeyAsync(exported.signingPrivateKey, password)

      expect(encrypted1.encryptedPrivateKey).not.toBe(encrypted2.encryptedPrivateKey)
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce)
      expect(encrypted1.salt).not.toBe(encrypted2.salt)
    })

    it('should return valid Base64 strings', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const encrypted = await encryptPrivateKeyAsync(exported.signingPrivateKey, 'password')

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      expect(encrypted.encryptedPrivateKey).toMatch(base64Regex)
      expect(encrypted.nonce).toMatch(base64Regex)
      expect(encrypted.salt).toMatch(base64Regex)
    })

    it('should decrypt to a usable private key', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const password = 'test-password'

      const encrypted = await encryptPrivateKeyAsync(exported.signingPrivateKey, password)
      const decryptedBase64 = await decryptPrivateKeyAsync(
        encrypted.encryptedPrivateKey,
        encrypted.nonce,
        encrypted.salt,
        password,
      )

      const recoveredKey = await importUserPrivateKeyAsync(decryptedBase64)
      const data = new TextEncoder().encode('verify recovered key')
      const signature = await signData(recoveredKey, data)
      const valid = await verifySignature(keypair.signingPublicKey, signature, data)

      expect(valid).toBe(true)
    })
  })

  // ============================================================================
  // Private Key Encryption Failure Tests
  // ============================================================================

  describe('decrypt with wrong password', () => {
    it('should throw when decrypting with wrong password', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const encrypted = await encryptPrivateKeyAsync(exported.signingPrivateKey, 'correct-password')

      await expect(
        decryptPrivateKeyAsync(
          encrypted.encryptedPrivateKey,
          encrypted.nonce,
          encrypted.salt,
          'wrong-password',
        )
      ).rejects.toThrow()
    })

    it('should throw when nonce is tampered', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const encrypted = await encryptPrivateKeyAsync(exported.signingPrivateKey, 'password')

      const badNonce = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64')

      await expect(
        decryptPrivateKeyAsync(
          encrypted.encryptedPrivateKey,
          badNonce,
          encrypted.salt,
          'password',
        )
      ).rejects.toThrow()
    })
  })

  // ============================================================================
  // Cross-Keypair Isolation Tests
  // ============================================================================

  describe('cross-keypair isolation', () => {
    it('should fail verification with a different keypair public key', async () => {
      const keypair1 = await generateUserKeypairAsync()
      const keypair2 = await generateUserKeypairAsync()

      const data = new TextEncoder().encode('isolation test')
      const signature = await signData(keypair1.signingPrivateKey, data)

      const valid = await verifySignature(keypair2.signingPublicKey, signature, data)
      expect(valid).toBe(false)
    })

    it('should fail verification when data is modified', async () => {
      const keypair = await generateUserKeypairAsync()

      const data = new TextEncoder().encode('original data')
      const signature = await signData(keypair.signingPrivateKey, data)

      const tamperedData = new TextEncoder().encode('tampered data')
      const valid = await verifySignature(keypair.signingPublicKey, signature, tamperedData)
      expect(valid).toBe(false)
    })
  })

  // ============================================================================
  // Base64 Format Validation Tests
  // ============================================================================

  describe('exported key format', () => {
    it('should export keys as valid Base64 strings', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      expect(exported.signingPublicKey).toMatch(base64Regex)
      expect(exported.signingPrivateKey).toMatch(base64Regex)
      expect(exported.agreementPublicKey).toMatch(base64Regex)
      expect(exported.agreementPrivateKey).toMatch(base64Regex)
    })

    it('should export Ed25519 public key in SPKI format', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      expect(exported.signingPublicKey.length).toBeGreaterThan(0)
      // Ed25519 SPKI public key is 44 bytes → ~60 chars Base64
      expect(exported.signingPublicKey.length).toBeGreaterThan(30)
    })

    it('should export Ed25519 private key in PKCS8 format', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      expect(exported.signingPrivateKey.length).toBeGreaterThan(0)
      // Ed25519 PKCS8 private key is 48 bytes → ~64 chars Base64
      expect(exported.signingPrivateKey.length).toBeGreaterThan(30)
    })
  })
})
