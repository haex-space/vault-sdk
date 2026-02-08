import { describe, it, expect } from 'vitest'
import {
  generateVaultKey,
  wrapKey,
  unwrapKey,
  encryptCrdtData,
  decryptCrdtData,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encryptVaultKey,
  decryptVaultKey,
  deriveKeyFromPassword,
  encryptString,
  decryptString,
} from '../vaultKey'

describe('vaultKey crypto utilities', () => {
  // ============================================================================
  // Key Generation Tests
  // ============================================================================

  describe('generateVaultKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateVaultKey()
      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })

    it('should generate unique keys each time', () => {
      const keys = Array.from({ length: 100 }, () => generateVaultKey())

      // Check all keys are unique by converting to hex and using a Set
      const keyStrings = keys.map((k) => arrayBufferToBase64(k))
      const uniqueKeys = new Set(keyStrings)
      expect(uniqueKeys.size).toBe(100)
    })

    it('should not generate all-zero keys', () => {
      const zeroKey = new Uint8Array(32)
      for (let i = 0; i < 100; i++) {
        const key = generateVaultKey()
        expect(arrayBufferToBase64(key)).not.toBe(arrayBufferToBase64(zeroKey))
      }
    })
  })

  // ============================================================================
  // Key Wrapping Tests (wrapKey / unwrapKey)
  // ============================================================================

  describe('wrapKey / unwrapKey', () => {
    it('should wrap and unwrap a key correctly', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey = generateVaultKey()

      const wrapped = await wrapKey(keyToWrap, wrappingKey)
      const unwrapped = await unwrapKey(wrapped, wrappingKey)

      expect(arrayBufferToBase64(unwrapped)).toBe(arrayBufferToBase64(keyToWrap))
    })

    it('should produce wrapped key with correct format (12-byte nonce + ciphertext)', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey = generateVaultKey()

      const wrapped = await wrapKey(keyToWrap, wrappingKey)

      // Format: nonce (12 bytes) + ciphertext (32 bytes) + auth tag (16 bytes)
      expect(wrapped.length).toBe(12 + 32 + 16)
    })

    it('should produce different wrapped keys for same input (random nonce)', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey = generateVaultKey()

      const wrapped1 = await wrapKey(keyToWrap, wrappingKey)
      const wrapped2 = await wrapKey(keyToWrap, wrappingKey)

      // Same key wrapped twice should produce different results
      expect(arrayBufferToBase64(wrapped1)).not.toBe(arrayBufferToBase64(wrapped2))

      // But both should unwrap to the same key
      const unwrapped1 = await unwrapKey(wrapped1, wrappingKey)
      const unwrapped2 = await unwrapKey(wrapped2, wrappingKey)
      expect(arrayBufferToBase64(unwrapped1)).toBe(arrayBufferToBase64(unwrapped2))
    })

    it('should fail to unwrap with wrong key', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey1 = generateVaultKey()
      const wrappingKey2 = generateVaultKey()

      const wrapped = await wrapKey(keyToWrap, wrappingKey1)

      await expect(unwrapKey(wrapped, wrappingKey2)).rejects.toThrow()
    })

    it('should fail to unwrap corrupted data', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey = generateVaultKey()

      const wrapped = await wrapKey(keyToWrap, wrappingKey)

      // Corrupt the ciphertext
      const byteToCorrupt = wrapped[20]
      if (byteToCorrupt !== undefined) {
        wrapped[20] = byteToCorrupt ^ 0xff
      }

      await expect(unwrapKey(wrapped, wrappingKey)).rejects.toThrow()
    })

    it('should fail to unwrap truncated data', async () => {
      const keyToWrap = generateVaultKey()
      const wrappingKey = generateVaultKey()

      const wrapped = await wrapKey(keyToWrap, wrappingKey)
      const truncated = wrapped.slice(0, wrapped.length - 5)

      await expect(unwrapKey(truncated, wrappingKey)).rejects.toThrow()
    })

    it('should work with different key sizes for wrapping', async () => {
      const wrappingKey = generateVaultKey()

      // 16-byte key
      const key16 = crypto.getRandomValues(new Uint8Array(16))
      const wrapped16 = await wrapKey(key16, wrappingKey)
      const unwrapped16 = await unwrapKey(wrapped16, wrappingKey)
      expect(arrayBufferToBase64(unwrapped16)).toBe(arrayBufferToBase64(key16))

      // 64-byte key
      const key64 = crypto.getRandomValues(new Uint8Array(64))
      const wrapped64 = await wrapKey(key64, wrappingKey)
      const unwrapped64 = await unwrapKey(wrapped64, wrappingKey)
      expect(arrayBufferToBase64(unwrapped64)).toBe(arrayBufferToBase64(key64))
    })
  })

  // ============================================================================
  // Key Hierarchy Tests (Master Key -> Space Key -> File Key)
  // ============================================================================

  describe('Key Hierarchy', () => {
    it('should support full key hierarchy (master -> space -> file)', async () => {
      // Generate keys at each level
      const masterKey = generateVaultKey()
      const spaceKey = generateVaultKey()
      const fileKey = generateVaultKey()

      // Wrap space key with master key
      const wrappedSpaceKey = await wrapKey(spaceKey, masterKey)

      // Wrap file key with space key
      const wrappedFileKey = await wrapKey(fileKey, spaceKey)

      // Simulate accessing the file:
      // 1. Unwrap space key with master key
      const recoveredSpaceKey = await unwrapKey(wrappedSpaceKey, masterKey)

      // 2. Unwrap file key with space key
      const recoveredFileKey = await unwrapKey(wrappedFileKey, recoveredSpaceKey)

      // Verify we got the original file key
      expect(arrayBufferToBase64(recoveredFileKey)).toBe(arrayBufferToBase64(fileKey))
    })

    it('should support shared space scenario (multiple users)', async () => {
      // User A creates a space
      const userAMasterKey = generateVaultKey()
      const sharedSpaceKey = generateVaultKey()
      const wrappedForA = await wrapKey(sharedSpaceKey, userAMasterKey)

      // User B is invited (space key wrapped with their master key)
      const userBMasterKey = generateVaultKey()
      const wrappedForB = await wrapKey(sharedSpaceKey, userBMasterKey)

      // Create a file in the shared space
      const fileKey = generateVaultKey()
      const wrappedFileKey = await wrapKey(fileKey, sharedSpaceKey)

      // User A accesses the file
      const aSpaceKey = await unwrapKey(wrappedForA, userAMasterKey)
      const aFileKey = await unwrapKey(wrappedFileKey, aSpaceKey)

      // User B accesses the same file
      const bSpaceKey = await unwrapKey(wrappedForB, userBMasterKey)
      const bFileKey = await unwrapKey(wrappedFileKey, bSpaceKey)

      // Both should get the same file key
      expect(arrayBufferToBase64(aFileKey)).toBe(arrayBufferToBase64(bFileKey))
      expect(arrayBufferToBase64(aFileKey)).toBe(arrayBufferToBase64(fileKey))
    })

    it('should support key rotation scenario', async () => {
      const masterKey = generateVaultKey()
      const originalSpaceKey = generateVaultKey()

      // Create a file with the original space key
      const fileKey = generateVaultKey()
      const wrappedFileKeyV1 = await wrapKey(fileKey, originalSpaceKey)

      // Rotate to new space key
      const newSpaceKey = generateVaultKey()

      // Re-wrap file key with new space key
      const recoveredFileKey = await unwrapKey(wrappedFileKeyV1, originalSpaceKey)
      const wrappedFileKeyV2 = await wrapKey(recoveredFileKey, newSpaceKey)

      // Wrap new space key with master key
      const wrappedNewSpaceKey = await wrapKey(newSpaceKey, masterKey)

      // Access file with new hierarchy
      const spaceKey = await unwrapKey(wrappedNewSpaceKey, masterKey)
      const finalFileKey = await unwrapKey(wrappedFileKeyV2, spaceKey)

      expect(arrayBufferToBase64(finalFileKey)).toBe(arrayBufferToBase64(fileKey))
    })

    it('should support revoke access scenario', async () => {
      // Two users with access to a space
      const userAMasterKey = generateVaultKey()
      const userBMasterKey = generateVaultKey()
      const spaceKey = generateVaultKey()

      const wrappedForA = await wrapKey(spaceKey, userAMasterKey)
      const wrappedForB = await wrapKey(spaceKey, userBMasterKey)

      const fileKey = generateVaultKey()
      const wrappedFileKey = await wrapKey(fileKey, spaceKey)

      // Both users can access initially
      const aSpaceKey = await unwrapKey(wrappedForA, userAMasterKey)
      const aFileKey = await unwrapKey(wrappedFileKey, aSpaceKey)
      expect(arrayBufferToBase64(aFileKey)).toBe(arrayBufferToBase64(fileKey))

      // Revoke User B's access by rotating space key
      const newSpaceKey = generateVaultKey()
      const newWrappedForA = await wrapKey(newSpaceKey, userAMasterKey)
      // Note: We don't create newWrappedForB - User B is revoked

      // Re-wrap file key with new space key
      const newWrappedFileKey = await wrapKey(fileKey, newSpaceKey)

      // User A can still access with new keys
      const aNewSpaceKey = await unwrapKey(newWrappedForA, userAMasterKey)
      const aNewFileKey = await unwrapKey(newWrappedFileKey, aNewSpaceKey)
      expect(arrayBufferToBase64(aNewFileKey)).toBe(arrayBufferToBase64(fileKey))

      // User B cannot access with old keys
      const bOldSpaceKey = await unwrapKey(wrappedForB, userBMasterKey)
      await expect(unwrapKey(newWrappedFileKey, bOldSpaceKey)).rejects.toThrow()
    })
  })

  // ============================================================================
  // CRDT Data Encryption Tests
  // ============================================================================

  describe('encryptCrdtData / decryptCrdtData', () => {
    it('should encrypt and decrypt object data', async () => {
      const vaultKey = generateVaultKey()
      const data = {
        id: '123',
        name: 'Test',
        nested: { value: 42 },
      }

      const encrypted = await encryptCrdtData(data, vaultKey)
      const decrypted = await decryptCrdtData(encrypted.encryptedData, encrypted.nonce, vaultKey)

      expect(decrypted).toEqual(data)
    })

    it('should produce different ciphertext for same data (random nonce)', async () => {
      const vaultKey = generateVaultKey()
      const data = { test: 'value' }

      const encrypted1 = await encryptCrdtData(data, vaultKey)
      const encrypted2 = await encryptCrdtData(data, vaultKey)

      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData)
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce)
    })

    it('should fail to decrypt with wrong key', async () => {
      const vaultKey1 = generateVaultKey()
      const vaultKey2 = generateVaultKey()
      const data = { test: 'secret' }

      const encrypted = await encryptCrdtData(data, vaultKey1)

      await expect(
        decryptCrdtData(encrypted.encryptedData, encrypted.nonce, vaultKey2)
      ).rejects.toThrow()
    })

    it('should handle various data types', async () => {
      const vaultKey = generateVaultKey()

      const testCases = [
        { string: 'hello' },
        { number: 42 },
        { float: 3.14159 },
        { boolean: true },
        { null: null },
        { array: [1, 2, 3] },
        { nested: { deep: { value: 'test' } } },
        { mixed: [{ a: 1 }, { b: 'two' }, null] },
      ]

      for (const data of testCases) {
        const encrypted = await encryptCrdtData(data, vaultKey)
        const decrypted = await decryptCrdtData(encrypted.encryptedData, encrypted.nonce, vaultKey)
        expect(decrypted).toEqual(data)
      }
    })

    it('should handle large data', async () => {
      const vaultKey = generateVaultKey()

      // Generate a large object
      const largeData = {
        entries: Array.from({ length: 1000 }, (_, i) => ({
          id: `item-${i}`,
          data: 'x'.repeat(100),
        })),
      }

      const encrypted = await encryptCrdtData(largeData, vaultKey)
      const decrypted = await decryptCrdtData<typeof largeData>(
        encrypted.encryptedData,
        encrypted.nonce,
        vaultKey
      )

      expect(decrypted.entries.length).toBe(1000)
      expect(decrypted).toEqual(largeData)
    })

    it('should handle Unicode characters', async () => {
      const vaultKey = generateVaultKey()
      const data = {
        german: 'Größe',
        emoji: '🔐🗝️',
        chinese: '加密',
        arabic: 'تشفير',
      }

      const encrypted = await encryptCrdtData(data, vaultKey)
      const decrypted = await decryptCrdtData(encrypted.encryptedData, encrypted.nonce, vaultKey)

      expect(decrypted).toEqual(data)
    })
  })

  // ============================================================================
  // Password-Based Encryption Tests (encryptVaultKey / decryptVaultKey)
  // ============================================================================

  describe('encryptVaultKey / decryptVaultKey (password-based)', () => {
    it('should encrypt and decrypt vault key with password', async () => {
      const vaultKey = generateVaultKey()
      const password = 'test-password-123'

      const encrypted = await encryptVaultKey(vaultKey, password)
      const decrypted = await decryptVaultKey(
        encrypted.encryptedVaultKey,
        encrypted.salt,
        encrypted.vaultKeyNonce,
        password
      )

      expect(arrayBufferToBase64(decrypted)).toBe(arrayBufferToBase64(vaultKey))
    })

    it('should produce different ciphertext for same key with different passwords', async () => {
      const vaultKey = generateVaultKey()

      const encrypted1 = await encryptVaultKey(vaultKey, 'password1')
      const encrypted2 = await encryptVaultKey(vaultKey, 'password2')

      expect(encrypted1.encryptedVaultKey).not.toBe(encrypted2.encryptedVaultKey)
      expect(encrypted1.salt).not.toBe(encrypted2.salt)
    })

    it('should fail to decrypt with wrong password', async () => {
      const vaultKey = generateVaultKey()
      const encrypted = await encryptVaultKey(vaultKey, 'correct-password')

      await expect(
        decryptVaultKey(
          encrypted.encryptedVaultKey,
          encrypted.salt,
          encrypted.vaultKeyNonce,
          'wrong-password'
        )
      ).rejects.toThrow()
    })

    it('should handle passwords with special characters', async () => {
      const vaultKey = generateVaultKey()
      const passwords = ['pässwörd!@#$%', '密码123', '🔐secure🔑', 'pass word with spaces']

      for (const password of passwords) {
        const encrypted = await encryptVaultKey(vaultKey, password)
        const decrypted = await decryptVaultKey(
          encrypted.encryptedVaultKey,
          encrypted.salt,
          encrypted.vaultKeyNonce,
          password
        )
        expect(arrayBufferToBase64(decrypted)).toBe(arrayBufferToBase64(vaultKey))
      }
    })

    it('should handle empty password', async () => {
      const vaultKey = generateVaultKey()
      const encrypted = await encryptVaultKey(vaultKey, '')
      const decrypted = await decryptVaultKey(
        encrypted.encryptedVaultKey,
        encrypted.salt,
        encrypted.vaultKeyNonce,
        ''
      )
      expect(arrayBufferToBase64(decrypted)).toBe(arrayBufferToBase64(vaultKey))
    })
  })

  // ============================================================================
  // String Encryption Tests (encryptString / decryptString)
  // ============================================================================

  describe('encryptString / decryptString', () => {
    it('should encrypt and decrypt strings', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(32))
      const derivedKey = await deriveKeyFromPassword('test-password', salt)

      const originalString = 'Hello, World!'
      const encrypted = await encryptString(originalString, derivedKey)
      const decrypted = await decryptString(encrypted.encryptedData, encrypted.nonce, derivedKey)

      expect(decrypted).toBe(originalString)
    })

    it('should handle empty strings', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(32))
      const derivedKey = await deriveKeyFromPassword('test', salt)

      const encrypted = await encryptString('', derivedKey)
      const decrypted = await decryptString(encrypted.encryptedData, encrypted.nonce, derivedKey)

      expect(decrypted).toBe('')
    })

    it('should handle Unicode strings', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(32))
      const derivedKey = await deriveKeyFromPassword('test', salt)

      const unicodeStrings = ['Größe', '加密文字', 'שלום עולם', '🎉🔐🗝️']

      for (const str of unicodeStrings) {
        const encrypted = await encryptString(str, derivedKey)
        const decrypted = await decryptString(encrypted.encryptedData, encrypted.nonce, derivedKey)
        expect(decrypted).toBe(str)
      }
    })
  })

  // ============================================================================
  // Base64 Conversion Tests
  // ============================================================================

  describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
    it('should round-trip Uint8Array through base64', () => {
      const original = crypto.getRandomValues(new Uint8Array(32))
      const base64 = arrayBufferToBase64(original)
      const recovered = base64ToArrayBuffer(base64)

      expect(Array.from(recovered)).toEqual(Array.from(original))
    })

    it('should handle ArrayBuffer input', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5])
      const base64 = arrayBufferToBase64(original.buffer)
      const recovered = base64ToArrayBuffer(base64)

      expect(Array.from(recovered)).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle empty arrays', () => {
      const empty = new Uint8Array(0)
      const base64 = arrayBufferToBase64(empty)
      const recovered = base64ToArrayBuffer(base64)

      expect(recovered.length).toBe(0)
    })

    it('should produce valid base64 strings', () => {
      const data = crypto.getRandomValues(new Uint8Array(100))
      const base64 = arrayBufferToBase64(data)

      // Base64 should only contain valid characters
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
    })
  })

  // ============================================================================
  // Performance / Stress Tests
  // ============================================================================

  describe('Performance', () => {
    it('should handle many sequential wrap/unwrap operations', async () => {
      const wrappingKey = generateVaultKey()

      for (let i = 0; i < 100; i++) {
        const key = generateVaultKey()
        const wrapped = await wrapKey(key, wrappingKey)
        const unwrapped = await unwrapKey(wrapped, wrappingKey)
        expect(arrayBufferToBase64(unwrapped)).toBe(arrayBufferToBase64(key))
      }
    })

    it('should handle concurrent wrap/unwrap operations', async () => {
      const wrappingKey = generateVaultKey()
      const keys = Array.from({ length: 50 }, () => generateVaultKey())

      const results = await Promise.all(
        keys.map(async (key) => {
          const wrapped = await wrapKey(key, wrappingKey)
          const unwrapped = await unwrapKey(wrapped, wrappingKey)
          return {
            original: arrayBufferToBase64(key),
            recovered: arrayBufferToBase64(unwrapped),
          }
        })
      )

      for (const result of results) {
        expect(result.recovered).toBe(result.original)
      }
    })
  })
})
