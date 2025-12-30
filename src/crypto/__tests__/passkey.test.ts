import { describe, it, expect } from 'vitest'
import {
  generatePasskeyPairAsync,
  exportPublicKeyAsync,
  exportPrivateKeyAsync,
  exportPublicKeyCoseAsync,
  importPrivateKeyAsync,
  importPublicKeyAsync,
  signWithPasskeyAsync,
  verifyWithPasskeyAsync,
  generateCredentialId,
  exportKeyPairAsync,
  COSE_ALGORITHM,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from '../passkey'

describe('passkey crypto utilities', () => {
  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('generatePasskeyPairAsync', () => {
    it('should generate a valid ECDSA P-256 key pair', async () => {
      const keyPair = await generatePasskeyPairAsync()

      expect(keyPair.publicKey).toBeDefined()
      expect(keyPair.privateKey).toBeDefined()
      expect(keyPair.publicKey).toBeInstanceOf(CryptoKey)
      expect(keyPair.privateKey).toBeInstanceOf(CryptoKey)
    })

    it('should generate extractable keys', async () => {
      const keyPair = await generatePasskeyPairAsync()

      expect(keyPair.publicKey.extractable).toBe(true)
      expect(keyPair.privateKey.extractable).toBe(true)
    })

    it('should generate keys with correct algorithm', async () => {
      const keyPair = await generatePasskeyPairAsync()

      expect(keyPair.publicKey.algorithm.name).toBe('ECDSA')
      expect((keyPair.publicKey.algorithm as EcKeyAlgorithm).namedCurve).toBe('P-256')
      expect(keyPair.privateKey.algorithm.name).toBe('ECDSA')
      expect((keyPair.privateKey.algorithm as EcKeyAlgorithm).namedCurve).toBe('P-256')
    })

    it('should generate keys with correct usages', async () => {
      const keyPair = await generatePasskeyPairAsync()

      expect(keyPair.publicKey.usages).toContain('verify')
      expect(keyPair.privateKey.usages).toContain('sign')
    })

    it('should generate unique key pairs each time', async () => {
      const keyPair1 = await generatePasskeyPairAsync()
      const keyPair2 = await generatePasskeyPairAsync()

      const pub1 = await exportPublicKeyAsync(keyPair1.publicKey)
      const pub2 = await exportPublicKeyAsync(keyPair2.publicKey)

      expect(pub1).not.toBe(pub2)
    })
  })

  // ============================================================================
  // Key Export Tests
  // ============================================================================

  describe('exportPublicKeyAsync', () => {
    it('should export public key as base64 SPKI', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPublicKeyAsync(keyPair.publicKey)

      expect(typeof exported).toBe('string')
      expect(exported.length).toBeGreaterThan(0)
      // Base64 should only contain valid characters
      expect(exported).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
    })

    it('should produce consistent output for same key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported1 = await exportPublicKeyAsync(keyPair.publicKey)
      const exported2 = await exportPublicKeyAsync(keyPair.publicKey)

      expect(exported1).toBe(exported2)
    })
  })

  describe('exportPrivateKeyAsync', () => {
    it('should export private key as base64 PKCS8', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPrivateKeyAsync(keyPair.privateKey)

      expect(typeof exported).toBe('string')
      expect(exported.length).toBeGreaterThan(0)
      expect(exported).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
    })

    it('should produce consistent output for same key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported1 = await exportPrivateKeyAsync(keyPair.privateKey)
      const exported2 = await exportPrivateKeyAsync(keyPair.privateKey)

      expect(exported1).toBe(exported2)
    })
  })

  describe('exportPublicKeyCoseAsync', () => {
    it('should export public key in COSE format', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const coseKey = await exportPublicKeyCoseAsync(keyPair.publicKey)

      expect(typeof coseKey).toBe('string')
      expect(coseKey.length).toBeGreaterThan(0)
      expect(coseKey).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
    })

    it('should produce valid COSE key structure', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const coseKey = await exportPublicKeyCoseAsync(keyPair.publicKey)
      const coseBytes = base64ToArrayBuffer(coseKey)

      // COSE_Key for P-256 should start with 0xa5 (map with 5 items)
      expect(coseBytes[0]).toBe(0xa5)

      // Should contain kty: EC2 (1: 2)
      expect(coseBytes[1]).toBe(0x01) // key 1
      expect(coseBytes[2]).toBe(0x02) // value 2

      // Should contain alg: ES256 (3: -7)
      expect(coseBytes[3]).toBe(0x03) // key 3
      expect(coseBytes[4]).toBe(0x26) // value -7 in CBOR
    })

    it('should produce consistent output for same key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const cose1 = await exportPublicKeyCoseAsync(keyPair.publicKey)
      const cose2 = await exportPublicKeyCoseAsync(keyPair.publicKey)

      expect(cose1).toBe(cose2)
    })
  })

  describe('exportKeyPairAsync', () => {
    it('should export all key formats at once', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportKeyPairAsync(keyPair)

      expect(exported.publicKeyBase64).toBeDefined()
      expect(exported.privateKeyBase64).toBeDefined()
      expect(exported.publicKeyCoseBase64).toBeDefined()

      expect(typeof exported.publicKeyBase64).toBe('string')
      expect(typeof exported.privateKeyBase64).toBe('string')
      expect(typeof exported.publicKeyCoseBase64).toBe('string')
    })

    it('should match individual export functions', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportKeyPairAsync(keyPair)

      const publicKey = await exportPublicKeyAsync(keyPair.publicKey)
      const privateKey = await exportPrivateKeyAsync(keyPair.privateKey)
      const coseKey = await exportPublicKeyCoseAsync(keyPair.publicKey)

      expect(exported.publicKeyBase64).toBe(publicKey)
      expect(exported.privateKeyBase64).toBe(privateKey)
      expect(exported.publicKeyCoseBase64).toBe(coseKey)
    })
  })

  // ============================================================================
  // Key Import Tests
  // ============================================================================

  describe('importPrivateKeyAsync', () => {
    it('should import an exported private key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPrivateKeyAsync(keyPair.privateKey)

      const imported = await importPrivateKeyAsync(exported)

      expect(imported).toBeInstanceOf(CryptoKey)
      expect(imported.algorithm.name).toBe('ECDSA')
      expect(imported.usages).toContain('sign')
    })

    it('should produce functionally equivalent key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPrivateKeyAsync(keyPair.privateKey)
      const imported = await importPrivateKeyAsync(exported)

      // Both should be able to sign the same data
      const testData = new TextEncoder().encode('test data')
      const sig1 = await signWithPasskeyAsync(keyPair.privateKey, testData)
      const sig2 = await signWithPasskeyAsync(imported, testData)

      // Both signatures should be valid (verifiable with public key)
      const verified1 = await verifyWithPasskeyAsync(keyPair.publicKey, sig1, testData)
      const verified2 = await verifyWithPasskeyAsync(keyPair.publicKey, sig2, testData)

      expect(verified1).toBe(true)
      expect(verified2).toBe(true)
    })

    it('should fail with invalid base64', async () => {
      await expect(importPrivateKeyAsync('not-valid-base64!@#')).rejects.toThrow()
    })

    it('should fail with invalid key data', async () => {
      const invalidData = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32)))
      await expect(importPrivateKeyAsync(invalidData)).rejects.toThrow()
    })
  })

  describe('importPublicKeyAsync', () => {
    it('should import an exported public key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPublicKeyAsync(keyPair.publicKey)

      const imported = await importPublicKeyAsync(exported)

      expect(imported).toBeInstanceOf(CryptoKey)
      expect(imported.algorithm.name).toBe('ECDSA')
      expect(imported.usages).toContain('verify')
    })

    it('should produce functionally equivalent key', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exportedPub = await exportPublicKeyAsync(keyPair.publicKey)
      const importedPub = await importPublicKeyAsync(exportedPub)

      // Sign with original private key
      const testData = new TextEncoder().encode('test data')
      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)

      // Both original and imported public key should verify
      const verified1 = await verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)
      const verified2 = await verifyWithPasskeyAsync(importedPub, signature, testData)

      expect(verified1).toBe(true)
      expect(verified2).toBe(true)
    })

    it('should fail with invalid base64', async () => {
      await expect(importPublicKeyAsync('not-valid-base64!@#')).rejects.toThrow()
    })

    it('should fail with invalid key data', async () => {
      const invalidData = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32)))
      await expect(importPublicKeyAsync(invalidData)).rejects.toThrow()
    })
  })

  // ============================================================================
  // Round-Trip Tests (Export -> Import)
  // ============================================================================

  describe('Key Export/Import Round-Trip', () => {
    it('should round-trip private key through base64', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPrivateKeyAsync(keyPair.privateKey)
      const imported = await importPrivateKeyAsync(exported)
      const reExported = await exportPrivateKeyAsync(imported)

      expect(reExported).toBe(exported)
    })

    it('should round-trip public key through base64', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportPublicKeyAsync(keyPair.publicKey)
      const imported = await importPublicKeyAsync(exported)
      const reExported = await exportPublicKeyAsync(imported)

      expect(reExported).toBe(exported)
    })

    it('should maintain signing capability after round-trip', async () => {
      const keyPair = await generatePasskeyPairAsync()

      // Export and import both keys
      const exportedPrivate = await exportPrivateKeyAsync(keyPair.privateKey)
      const exportedPublic = await exportPublicKeyAsync(keyPair.publicKey)
      const importedPrivate = await importPrivateKeyAsync(exportedPrivate)
      const importedPublic = await importPublicKeyAsync(exportedPublic)

      // Sign with imported private key
      const testData = new TextEncoder().encode('round-trip test')
      const signature = await signWithPasskeyAsync(importedPrivate, testData)

      // Verify with imported public key
      const verified = await verifyWithPasskeyAsync(importedPublic, signature, testData)
      expect(verified).toBe(true)
    })
  })

  // ============================================================================
  // Signing and Verification Tests
  // ============================================================================

  describe('signWithPasskeyAsync', () => {
    it('should sign data and return DER-encoded signature', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('Hello, World!')

      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)

      expect(signature).toBeInstanceOf(ArrayBuffer)
      expect(signature.byteLength).toBeGreaterThan(0)

      // DER signature should start with SEQUENCE tag (0x30)
      const sigBytes = new Uint8Array(signature)
      expect(sigBytes[0]).toBe(0x30)
    })

    it('should produce different signatures for different data', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const data1 = new TextEncoder().encode('data 1')
      const data2 = new TextEncoder().encode('data 2')

      const sig1 = await signWithPasskeyAsync(keyPair.privateKey, data1)
      const sig2 = await signWithPasskeyAsync(keyPair.privateKey, data2)

      expect(arrayBufferToBase64(sig1)).not.toBe(arrayBufferToBase64(sig2))
    })

    it('should produce different signatures for same data (ECDSA randomness)', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('same data')

      // ECDSA uses random k value, so signatures should differ
      const sig1 = await signWithPasskeyAsync(keyPair.privateKey, testData)
      const sig2 = await signWithPasskeyAsync(keyPair.privateKey, testData)

      // Both should be valid
      expect(await verifyWithPasskeyAsync(keyPair.publicKey, sig1, testData)).toBe(true)
      expect(await verifyWithPasskeyAsync(keyPair.publicKey, sig2, testData)).toBe(true)

      // But different (with very high probability)
      expect(arrayBufferToBase64(sig1)).not.toBe(arrayBufferToBase64(sig2))
    })

    it('should handle Uint8Array input', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new Uint8Array([1, 2, 3, 4, 5])

      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)

      expect(verified).toBe(true)
    })

    it('should handle ArrayBuffer input', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new Uint8Array([1, 2, 3, 4, 5]).buffer

      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)

      expect(verified).toBe(true)
    })

    it('should handle empty data', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const emptyData = new Uint8Array(0)

      const signature = await signWithPasskeyAsync(keyPair.privateKey, emptyData)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, emptyData)

      expect(verified).toBe(true)
    })

    it('should handle large data', async () => {
      const keyPair = await generatePasskeyPairAsync()
      // Use 64KB which is below the crypto.getRandomValues limit of 65536 bytes
      const largeData = crypto.getRandomValues(new Uint8Array(65000))

      const signature = await signWithPasskeyAsync(keyPair.privateKey, largeData)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, largeData)

      expect(verified).toBe(true)
    })
  })

  describe('verifyWithPasskeyAsync', () => {
    it('should verify valid signature', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('test message')
      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)

      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)

      expect(verified).toBe(true)
    })

    it('should reject signature from different key', async () => {
      const keyPair1 = await generatePasskeyPairAsync()
      const keyPair2 = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('test message')

      const signature = await signWithPasskeyAsync(keyPair1.privateKey, testData)

      // Verify with different public key should fail
      const verified = await verifyWithPasskeyAsync(keyPair2.publicKey, signature, testData)
      expect(verified).toBe(false)
    })

    it('should reject signature for different data', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const data1 = new TextEncoder().encode('original data')
      const data2 = new TextEncoder().encode('different data')

      const signature = await signWithPasskeyAsync(keyPair.privateKey, data1)

      // Verify with different data should fail
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, data2)
      expect(verified).toBe(false)
    })

    it('should reject corrupted signature', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('test message')
      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)

      // Corrupt the signature
      const sigBytes = new Uint8Array(signature)
      const lastIndex = sigBytes.length - 1
      sigBytes[lastIndex] = (sigBytes[lastIndex] ?? 0) ^ 0xff

      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, sigBytes, testData)
      expect(verified).toBe(false)
    })

    it('should handle Uint8Array signature input', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('test')
      const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)

      const sigArray = new Uint8Array(signature)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, sigArray, testData)

      expect(verified).toBe(true)
    })
  })

  // ============================================================================
  // Credential ID Generation Tests
  // ============================================================================

  describe('generateCredentialId', () => {
    it('should generate a 16-byte credential ID', () => {
      const credId = generateCredentialId()

      expect(credId).toBeInstanceOf(Uint8Array)
      expect(credId.length).toBe(16)
    })

    it('should generate unique IDs each time', () => {
      const ids = Array.from({ length: 100 }, () => generateCredentialId())

      // Check all IDs are unique
      const idStrings = ids.map((id) => arrayBufferToBase64(id))
      const uniqueIds = new Set(idStrings)
      expect(uniqueIds.size).toBe(100)
    })

    it('should not generate all-zero IDs', () => {
      const zeroId = new Uint8Array(16)

      for (let i = 0; i < 100; i++) {
        const credId = generateCredentialId()
        expect(arrayBufferToBase64(credId)).not.toBe(arrayBufferToBase64(zeroId))
      }
    })
  })

  // ============================================================================
  // COSE Algorithm Constants Tests
  // ============================================================================

  describe('COSE_ALGORITHM', () => {
    it('should have correct ES256 value', () => {
      expect(COSE_ALGORITHM.ES256).toBe(-7)
    })

    it('should have correct ES384 value', () => {
      expect(COSE_ALGORITHM.ES384).toBe(-35)
    })

    it('should have correct ES512 value', () => {
      expect(COSE_ALGORITHM.ES512).toBe(-36)
    })

    it('should have correct EdDSA value', () => {
      expect(COSE_ALGORITHM.EdDSA).toBe(-8)
    })

    it('should have correct RS256 value', () => {
      expect(COSE_ALGORITHM.RS256).toBe(-257)
    })
  })

  // ============================================================================
  // WebAuthn Simulation Tests
  // ============================================================================

  describe('WebAuthn Simulation', () => {
    it('should simulate full WebAuthn registration flow', async () => {
      // 1. Generate key pair (during navigator.credentials.create)
      const keyPair = await generatePasskeyPairAsync()

      // 2. Generate credential ID
      const credentialId = generateCredentialId()

      // 3. Export keys for storage
      const exported = await exportKeyPairAsync(keyPair)

      // Verify all required data is available
      expect(credentialId.length).toBe(16)
      expect(exported.publicKeyBase64).toBeDefined()
      expect(exported.privateKeyBase64).toBeDefined()
      expect(exported.publicKeyCoseBase64).toBeDefined()
    })

    it('should simulate full WebAuthn authentication flow', async () => {
      // Setup: Create and store a passkey
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportKeyPairAsync(keyPair)

      // 1. Server sends challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // 2. Import stored private key
      const privateKey = await importPrivateKeyAsync(exported.privateKeyBase64)

      // 3. Build authenticator data (simplified - just rpIdHash + flags + counter)
      const rpIdHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('example.com')
      )
      const flags = new Uint8Array([0x05]) // user present + user verified
      const counter = new Uint8Array([0, 0, 0, 1]) // sign count = 1
      const authenticatorData = new Uint8Array([
        ...new Uint8Array(rpIdHash),
        ...flags,
        ...counter,
      ])

      // 4. Build client data JSON
      const clientDataJSON = JSON.stringify({
        type: 'webauthn.get',
        challenge: arrayBufferToBase64(challenge),
        origin: 'https://example.com',
      })
      const clientDataHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(clientDataJSON)
      )

      // 5. Sign authenticatorData + clientDataHash
      const signedData = new Uint8Array([
        ...authenticatorData,
        ...new Uint8Array(clientDataHash),
      ])
      const signature = await signWithPasskeyAsync(privateKey, signedData)

      // 6. Server verification: Import public key and verify
      const publicKey = await importPublicKeyAsync(exported.publicKeyBase64)
      const verified = await verifyWithPasskeyAsync(publicKey, signature, signedData)

      expect(verified).toBe(true)
    })

    it('should handle multiple authentications with incrementing sign count', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const exported = await exportKeyPairAsync(keyPair)
      const privateKey = await importPrivateKeyAsync(exported.privateKeyBase64)
      const publicKey = await importPublicKeyAsync(exported.publicKeyBase64)

      for (let signCount = 1; signCount <= 5; signCount++) {
        // Create authenticator data with incrementing sign count
        const rpIdHash = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode('example.com')
        )
        const counter = new Uint8Array(4)
        new DataView(counter.buffer).setUint32(0, signCount, false)

        const authenticatorData = new Uint8Array([
          ...new Uint8Array(rpIdHash),
          0x05, // flags
          ...counter,
        ])

        const challenge = crypto.getRandomValues(new Uint8Array(32))
        const clientDataHash = await crypto.subtle.digest('SHA-256', challenge)

        const signedData = new Uint8Array([
          ...authenticatorData,
          ...new Uint8Array(clientDataHash),
        ])

        const signature = await signWithPasskeyAsync(privateKey, signedData)
        const verified = await verifyWithPasskeyAsync(publicKey, signature, signedData)

        expect(verified).toBe(true)
      }
    })
  })

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should handle many sequential key generations', async () => {
      const startTime = Date.now()

      for (let i = 0; i < 20; i++) {
        const keyPair = await generatePasskeyPairAsync()
        expect(keyPair.publicKey).toBeDefined()
      }

      const elapsed = Date.now() - startTime
      // Should complete in reasonable time (less than 10 seconds)
      expect(elapsed).toBeLessThan(10000)
    })

    it('should handle many sequential sign/verify operations', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const testData = new TextEncoder().encode('performance test')

      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)
        const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)
        expect(verified).toBe(true)
      }

      const elapsed = Date.now() - startTime
      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(10000)
    })

    it('should handle concurrent operations', async () => {
      const keyPairs = await Promise.all(
        Array.from({ length: 10 }, () => generatePasskeyPairAsync())
      )

      const testData = new TextEncoder().encode('concurrent test')

      const results = await Promise.all(
        keyPairs.map(async (keyPair) => {
          const signature = await signWithPasskeyAsync(keyPair.privateKey, testData)
          return verifyWithPasskeyAsync(keyPair.publicKey, signature, testData)
        })
      )

      expect(results.every((r) => r === true)).toBe(true)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle binary data with all byte values', async () => {
      const keyPair = await generatePasskeyPairAsync()

      // Create data with all possible byte values (0-255)
      const allBytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i
      }

      const signature = await signWithPasskeyAsync(keyPair.privateKey, allBytes)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, allBytes)

      expect(verified).toBe(true)
    })

    it('should handle data with null bytes', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const dataWithNulls = new Uint8Array([0, 1, 0, 2, 0, 3, 0, 0, 0])

      const signature = await signWithPasskeyAsync(keyPair.privateKey, dataWithNulls)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, dataWithNulls)

      expect(verified).toBe(true)
    })

    it('should handle single-byte data', async () => {
      const keyPair = await generatePasskeyPairAsync()
      const singleByte = new Uint8Array([42])

      const signature = await signWithPasskeyAsync(keyPair.privateKey, singleByte)
      const verified = await verifyWithPasskeyAsync(keyPair.publicKey, signature, singleByte)

      expect(verified).toBe(true)
    })
  })
})
