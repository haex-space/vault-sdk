import { describe, it, expect } from 'vitest'
import {
  validatePublicKey,
  validateExtensionName,
  validateTableName,
  getExtensionTableName,
  getDependencyTableName,
  parseTableName,
} from '../client/tableName'
import { getTableName, TABLE_SEPARATOR, HaexVaultSdkError, ErrorCode } from '../types'

describe('Table Name Utilities', () => {
  // ============================================================================
  // getTableName (from types.ts)
  // ============================================================================

  describe('getTableName', () => {
    it('should build a fully qualified table name', () => {
      const result = getTableName('abc123', 'my-extension', 'users')
      expect(result).toBe('abc123__my-extension__users')
    })

    it('should use the correct separator', () => {
      const result = getTableName('key', 'ext', 'table')
      expect(result).toContain(TABLE_SEPARATOR)
      expect(result.split(TABLE_SEPARATOR)).toHaveLength(3)
    })

    it('should handle long public keys', () => {
      const longKey = 'a'.repeat(64)
      const result = getTableName(longKey, 'ext', 'table')
      expect(result.startsWith(longKey)).toBe(true)
    })
  })

  // ============================================================================
  // validatePublicKey
  // ============================================================================

  describe('validatePublicKey', () => {
    it('should accept valid public keys', () => {
      expect(() => validatePublicKey('abc123')).not.toThrow()
      expect(() => validatePublicKey('a'.repeat(64))).not.toThrow()
    })

    it('should reject empty public key', () => {
      expect(() => validatePublicKey('')).toThrow(HaexVaultSdkError)
    })

    it('should reject whitespace-only public key', () => {
      expect(() => validatePublicKey('   ')).toThrow(HaexVaultSdkError)
    })

    it('should have error code INVALID_PUBLIC_KEY', () => {
      try {
        validatePublicKey('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(HaexVaultSdkError)
        expect((error as HaexVaultSdkError).code).toBe(ErrorCode.INVALID_PUBLIC_KEY)
      }
    })
  })

  // ============================================================================
  // validateExtensionName
  // ============================================================================

  describe('validateExtensionName', () => {
    it('should accept valid extension names', () => {
      expect(() => validateExtensionName('myextension')).not.toThrow()
      expect(() => validateExtensionName('my-extension')).not.toThrow()
      expect(() => validateExtensionName('ext123')).not.toThrow()
    })

    it('should reject empty extension name', () => {
      expect(() => validateExtensionName('')).toThrow(HaexVaultSdkError)
    })

    it('should reject extension names starting with number', () => {
      expect(() => validateExtensionName('123ext')).toThrow(HaexVaultSdkError)
    })

    it('should reject extension names containing separator', () => {
      expect(() => validateExtensionName('my__extension')).toThrow(HaexVaultSdkError)
    })

    it('should have error code INVALID_EXTENSION_NAME', () => {
      try {
        validateExtensionName('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(HaexVaultSdkError)
        expect((error as HaexVaultSdkError).code).toBe(ErrorCode.INVALID_EXTENSION_NAME)
      }
    })
  })

  // ============================================================================
  // validateTableName
  // ============================================================================

  describe('validateTableName', () => {
    it('should accept valid table names', () => {
      expect(() => validateTableName('users')).not.toThrow()
      expect(() => validateTableName('user_settings')).not.toThrow()
      expect(() => validateTableName('users123')).not.toThrow()
    })

    it('should reject empty table name', () => {
      expect(() => validateTableName('')).toThrow(HaexVaultSdkError)
    })

    it('should reject table names starting with number', () => {
      expect(() => validateTableName('123users')).toThrow(HaexVaultSdkError)
    })

    it('should reject table names containing separator', () => {
      expect(() => validateTableName('my__table')).toThrow(HaexVaultSdkError)
    })

    it('should have error code INVALID_TABLE_NAME', () => {
      try {
        validateTableName('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(HaexVaultSdkError)
        expect((error as HaexVaultSdkError).code).toBe(ErrorCode.INVALID_TABLE_NAME)
      }
    })
  })

  // ============================================================================
  // getExtensionTableName
  // ============================================================================

  describe('getExtensionTableName', () => {
    const mockExtensionInfo = {
      publicKey: 'abc123def456',
      name: 'test-extension',
      version: '1.0.0',
    }

    it('should return quoted fully qualified table name', () => {
      const result = getExtensionTableName(mockExtensionInfo, 'users')
      expect(result).toBe('"abc123def456__test-extension__users"')
    })

    it('should throw when extensionInfo is null', () => {
      expect(() => getExtensionTableName(null, 'users')).toThrow(HaexVaultSdkError)
    })

    it('should have error code EXTENSION_INFO_UNAVAILABLE when null', () => {
      try {
        getExtensionTableName(null, 'users')
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as HaexVaultSdkError).code).toBe(ErrorCode.EXTENSION_INFO_UNAVAILABLE)
      }
    })
  })

  // ============================================================================
  // getDependencyTableName
  // ============================================================================

  describe('getDependencyTableName', () => {
    it('should return quoted fully qualified table name', () => {
      const result = getDependencyTableName('depkey123', 'dep-extension', 'items')
      expect(result).toBe('"depkey123__dep-extension__items"')
    })

    it('should validate public key', () => {
      expect(() => getDependencyTableName('', 'ext', 'table')).toThrow(HaexVaultSdkError)
    })

    it('should validate extension name', () => {
      expect(() => getDependencyTableName('key', '', 'table')).toThrow(HaexVaultSdkError)
    })

    it('should validate table name', () => {
      expect(() => getDependencyTableName('key', 'ext', '')).toThrow(HaexVaultSdkError)
    })
  })

  // ============================================================================
  // parseTableName
  // ============================================================================

  describe('parseTableName', () => {
    it('should parse a valid table name', () => {
      const result = parseTableName('pubkey__extension__table')
      expect(result).toEqual({
        publicKey: 'pubkey',
        extensionName: 'extension',
        tableName: 'table',
      })
    })

    it('should handle quoted table names', () => {
      const result = parseTableName('"pubkey__extension__table"')
      expect(result).toEqual({
        publicKey: 'pubkey',
        extensionName: 'extension',
        tableName: 'table',
      })
    })

    it('should return null for invalid format (too few parts)', () => {
      expect(parseTableName('pubkey__extension')).toBeNull()
      expect(parseTableName('justaname')).toBeNull()
    })

    it('should return null for invalid format (too many parts)', () => {
      expect(parseTableName('a__b__c__d')).toBeNull()
    })

    it('should return null for empty parts', () => {
      expect(parseTableName('__extension__table')).toBeNull()
      expect(parseTableName('pubkey____table')).toBeNull()
    })
  })
})
