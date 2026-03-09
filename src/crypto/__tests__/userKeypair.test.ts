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

const ECDSA_SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' }

async function signData(privateKey: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.sign(ECDSA_SIGN_ALGO, privateKey, data)
}

async function verifySignature(publicKey: CryptoKey, signature: ArrayBuffer, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return crypto.subtle.verify(ECDSA_SIGN_ALGO, publicKey, signature, data)
}

describe('userKeypair crypto utilities', () => {
  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('generateUserKeypairAsync', () => {
    it('should generate a valid P-256 keypair', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.publicKey).toBeInstanceOf(CryptoKey)
      expect(keypair.privateKey).toBeInstanceOf(CryptoKey)
      expect(keypair.publicKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' })
      expect(keypair.privateKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' })
    })

    it('should generate extractable keys', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.publicKey.extractable).toBe(true)
      expect(keypair.privateKey.extractable).toBe(true)
    })

    it('should generate keys with correct usages', async () => {
      const keypair = await generateUserKeypairAsync()

      expect(keypair.publicKey.usages).toContain('verify')
      expect(keypair.privateKey.usages).toContain('sign')
    })

    it('should generate unique keypairs each time', async () => {
      const keypair1 = await generateUserKeypairAsync()
      const keypair2 = await generateUserKeypairAsync()

      const exported1 = await exportUserKeypairAsync(keypair1)
      const exported2 = await exportUserKeypairAsync(keypair2)

      expect(exported1.publicKey).not.toBe(exported2.publicKey)
      expect(exported1.privateKey).not.toBe(exported2.privateKey)
    })
  })

  // ============================================================================
  // Export / Import Roundtrip Tests
  // ============================================================================

  describe('export / import roundtrip', () => {
    it('should export and re-import public key for verification', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPublicKey = await importUserPublicKeyAsync(exported.publicKey)

      // Sign with original private key, verify with imported public key
      const data = new TextEncoder().encode('test message')
      const signature = await signData(keypair.privateKey, data)
      const valid = await verifySignature(importedPublicKey, signature, data)

      expect(valid).toBe(true)
    })

    it('should export and re-import private key for signing', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPrivateKey = await importUserPrivateKeyAsync(exported.privateKey)

      // Sign with imported private key, verify with original public key
      const data = new TextEncoder().encode('test message')
      const signature = await signData(importedPrivateKey, data)
      const valid = await verifySignature(keypair.publicKey, signature, data)

      expect(valid).toBe(true)
    })

    it('should roundtrip both keys: export → import → sign → verify', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const importedPublicKey = await importUserPublicKeyAsync(exported.publicKey)
      const importedPrivateKey = await importUserPrivateKeyAsync(exported.privateKey)

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
      const importedPrivateKey = await importUserPrivateKeyAsync(exported.privateKey)

      expect(importedPrivateKey.usages).toContain('sign')

      const data = new TextEncoder().encode('sign test')
      const signature = await signData(importedPrivateKey, data)
      expect(signature.byteLength).toBeGreaterThan(0)
    })

    it('should import public key that can verify', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const importedPublicKey = await importUserPublicKeyAsync(exported.publicKey)

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
        const signature = await signData(keypair.privateKey, data)
        const valid = await verifySignature(keypair.publicKey, signature, data)
        expect(valid).toBe(true)
      }
    })
  })

  // ============================================================================
  // Key Agreement Import Tests (ECDH)
  // ============================================================================

  describe('key agreement import (ECDH)', () => {
    it('should import keys for ECDH key agreement', async () => {
      // Generate two keypairs (Alice and Bob)
      const alice = await generateUserKeypairAsync()
      const bob = await generateUserKeypairAsync()

      const aliceExported = await exportUserKeypairAsync(alice)
      const bobExported = await exportUserKeypairAsync(bob)

      // Import for key agreement
      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.privateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.publicKey)

      // Derive shared bits
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: bobPublicKA },
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

      // Alice derives shared secret using her private key + Bob's public key
      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.privateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.publicKey)
      const sharedFromAlice = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: bobPublicKA },
        alicePrivateKA,
        256,
      )

      // Bob derives shared secret using his private key + Alice's public key
      const bobPrivateKA = await importPrivateKeyForKeyAgreementAsync(bobExported.privateKey)
      const alicePublicKA = await importPublicKeyForKeyAgreementAsync(aliceExported.publicKey)
      const sharedFromBob = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: alicePublicKA },
        bobPrivateKA,
        256,
      )

      // Both sides should derive the same shared secret
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

      // Alice-Bob shared secret
      const alicePrivateKA = await importPrivateKeyForKeyAgreementAsync(aliceExported.privateKey)
      const bobPublicKA = await importPublicKeyForKeyAgreementAsync(bobExported.publicKey)
      const sharedAliceBob = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: bobPublicKA },
        alicePrivateKA,
        256,
      )

      // Alice-Charlie shared secret
      const charliePublicKA = await importPublicKeyForKeyAgreementAsync(charlieExported.publicKey)
      const sharedAliceCharlie = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: charliePublicKA },
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

      const encrypted = await encryptPrivateKeyAsync(exported.privateKey, password)
      const decrypted = await decryptPrivateKeyAsync(
        encrypted.encryptedPrivateKey,
        encrypted.nonce,
        encrypted.salt,
        password,
      )

      expect(decrypted).toBe(exported.privateKey)
    })

    it('should produce different ciphertext each time (random salt + nonce)', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const password = 'test-password'

      const encrypted1 = await encryptPrivateKeyAsync(exported.privateKey, password)
      const encrypted2 = await encryptPrivateKeyAsync(exported.privateKey, password)

      expect(encrypted1.encryptedPrivateKey).not.toBe(encrypted2.encryptedPrivateKey)
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce)
      expect(encrypted1.salt).not.toBe(encrypted2.salt)
    })

    it('should return valid Base64 strings', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      const encrypted = await encryptPrivateKeyAsync(exported.privateKey, 'password')

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      expect(encrypted.encryptedPrivateKey).toMatch(base64Regex)
      expect(encrypted.nonce).toMatch(base64Regex)
      expect(encrypted.salt).toMatch(base64Regex)
    })

    it('should decrypt to a usable private key', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)
      const password = 'test-password'

      const encrypted = await encryptPrivateKeyAsync(exported.privateKey, password)
      const decryptedBase64 = await decryptPrivateKeyAsync(
        encrypted.encryptedPrivateKey,
        encrypted.nonce,
        encrypted.salt,
        password,
      )

      // Import the decrypted key and use it to sign
      const recoveredKey = await importUserPrivateKeyAsync(decryptedBase64)
      const data = new TextEncoder().encode('verify recovered key')
      const signature = await signData(recoveredKey, data)
      const valid = await verifySignature(keypair.publicKey, signature, data)

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

      const encrypted = await encryptPrivateKeyAsync(exported.privateKey, 'correct-password')

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

      const encrypted = await encryptPrivateKeyAsync(exported.privateKey, 'password')

      // Generate a different nonce
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
      const signature = await signData(keypair1.privateKey, data)

      // Verify with wrong public key should fail
      const valid = await verifySignature(keypair2.publicKey, signature, data)
      expect(valid).toBe(false)
    })

    it('should fail verification when data is modified', async () => {
      const keypair = await generateUserKeypairAsync()

      const data = new TextEncoder().encode('original data')
      const signature = await signData(keypair.privateKey, data)

      const tamperedData = new TextEncoder().encode('tampered data')
      const valid = await verifySignature(keypair.publicKey, signature, tamperedData)
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
      expect(exported.publicKey).toMatch(base64Regex)
      expect(exported.privateKey).toMatch(base64Regex)
    })

    it('should export public key in SPKI format (non-empty)', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      expect(exported.publicKey.length).toBeGreaterThan(0)
      // P-256 SPKI public key is typically 91 bytes → ~124 chars Base64
      expect(exported.publicKey.length).toBeGreaterThan(50)
    })

    it('should export private key in PKCS8 format (non-empty)', async () => {
      const keypair = await generateUserKeypairAsync()
      const exported = await exportUserKeypairAsync(keypair)

      expect(exported.privateKey.length).toBeGreaterThan(0)
      // P-256 PKCS8 private key is typically 138 bytes → ~184 chars Base64
      expect(exported.privateKey.length).toBeGreaterThan(100)
    })
  })
})
