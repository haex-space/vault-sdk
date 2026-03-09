import { describe, it, expect } from 'vitest'
import {
  HaexVaultSdkError,
  ErrorCode,
  PermissionErrorCode,
  PermissionStatus,
  isPermissionDeniedError,
  isPermissionPromptError,
  isPermissionError,
  getTableName,
  TABLE_SEPARATOR,
  DEFAULT_TIMEOUT,
} from '../types'
import {
  ExternalConnectionState,
  isExternalClientConnected,
  canExternalClientSendRequests,
} from '../types/external'

describe('Types and Constants', () => {
  // ============================================================================
  // Constants
  // ============================================================================

  describe('Constants', () => {
    it('should have correct DEFAULT_TIMEOUT', () => {
      expect(DEFAULT_TIMEOUT).toBe(30000)
    })

    it('should have correct TABLE_SEPARATOR', () => {
      expect(TABLE_SEPARATOR).toBe('__')
    })
  })

  // ============================================================================
  // HaexVaultSdkError
  // ============================================================================

  describe('HaexVaultSdkError', () => {
    it('should create error with code and message key', () => {
      const error = new HaexVaultSdkError(ErrorCode.TIMEOUT, 'errors.timeout')
      expect(error.code).toBe(ErrorCode.TIMEOUT)
      expect(error.messageKey).toBe('errors.timeout')
      expect(error.name).toBe('HaexVaultSdkError')
    })

    it('should store details', () => {
      const error = new HaexVaultSdkError(ErrorCode.TIMEOUT, 'errors.timeout', {
        timeout: 5000,
      })
      expect(error.details).toEqual({ timeout: 5000 })
    })

    it('should be an instance of Error', () => {
      const error = new HaexVaultSdkError(ErrorCode.TIMEOUT, 'errors.timeout')
      expect(error).toBeInstanceOf(Error)
    })

    it('should serialize to JSON correctly', () => {
      const error = new HaexVaultSdkError(ErrorCode.PERMISSION_DENIED, 'errors.denied', {
        resource: 'database',
      })
      const json = error.toJSON()
      expect(json).toEqual({
        code: ErrorCode.PERMISSION_DENIED,
        message: 'errors.denied',
        details: { resource: 'database' },
      })
    })

    it('should get localized message with translations', () => {
      const error = new HaexVaultSdkError(ErrorCode.TIMEOUT, 'errors.timeout', {
        timeout: 5000,
      })
      const translations = {
        en: { 'errors.timeout': 'Request timed out after {timeout}ms' },
        de: { 'errors.timeout': 'Anfrage nach {timeout}ms abgelaufen' },
      }

      expect(error.getLocalizedMessage('en', translations)).toBe(
        'Request timed out after 5000ms'
      )
      expect(error.getLocalizedMessage('de', translations)).toBe(
        'Anfrage nach 5000ms abgelaufen'
      )
    })

    it('should return message key if no translation found', () => {
      const error = new HaexVaultSdkError(ErrorCode.TIMEOUT, 'errors.timeout')
      expect(error.getLocalizedMessage('fr', {})).toBe('errors.timeout')
      expect(error.getLocalizedMessage()).toBe('errors.timeout')
    })
  })

  // ============================================================================
  // ErrorCode enum
  // ============================================================================

  describe('ErrorCode', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT')
      expect(ErrorCode.NOT_IN_IFRAME).toBe('NOT_IN_IFRAME')
      expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
      expect(ErrorCode.INVALID_PUBLIC_KEY).toBe('INVALID_PUBLIC_KEY')
      expect(ErrorCode.INVALID_EXTENSION_NAME).toBe('INVALID_EXTENSION_NAME')
      expect(ErrorCode.INVALID_TABLE_NAME).toBe('INVALID_TABLE_NAME')
      expect(ErrorCode.EXTENSION_INFO_UNAVAILABLE).toBe('EXTENSION_INFO_UNAVAILABLE')
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR')
    })
  })

  // ============================================================================
  // PermissionStatus enum
  // ============================================================================

  describe('PermissionStatus', () => {
    it('should have all expected statuses', () => {
      expect(PermissionStatus.GRANTED).toBe('granted')
      expect(PermissionStatus.DENIED).toBe('denied')
      expect(PermissionStatus.ASK).toBe('ask')
    })
  })

  // ============================================================================
  // PermissionErrorCode enum
  // ============================================================================

  describe('PermissionErrorCode', () => {
    it('should have correct numeric codes', () => {
      expect(PermissionErrorCode.DENIED).toBe(1002)
      expect(PermissionErrorCode.PROMPT_REQUIRED).toBe(1004)
    })
  })
})

describe('Permission Type Guards', () => {
  // ============================================================================
  // isPermissionDeniedError
  // ============================================================================

  describe('isPermissionDeniedError', () => {
    it('should return true for permission denied error', () => {
      const error = {
        code: PermissionErrorCode.DENIED,
        message: 'Permission denied',
        extensionId: 'ext-1',
        extensionName: 'test',
        resourceType: 'database',
        target: 'users',
        action: 'read',
      }
      expect(isPermissionDeniedError(error)).toBe(true)
    })

    it('should return false for prompt required error', () => {
      const error = { code: PermissionErrorCode.PROMPT_REQUIRED }
      expect(isPermissionDeniedError(error)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isPermissionDeniedError(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isPermissionDeniedError(undefined)).toBe(false)
    })

    it('should return false for non-object', () => {
      expect(isPermissionDeniedError('error')).toBe(false)
      expect(isPermissionDeniedError(123)).toBe(false)
    })

    it('should return false for object without code', () => {
      expect(isPermissionDeniedError({ message: 'error' })).toBe(false)
    })
  })

  // ============================================================================
  // isPermissionPromptError
  // ============================================================================

  describe('isPermissionPromptError', () => {
    it('should return true for prompt required error', () => {
      const error = {
        code: PermissionErrorCode.PROMPT_REQUIRED,
        message: 'Permission prompt required',
        extensionId: 'ext-1',
        extensionName: 'test',
        resourceType: 'database',
        target: 'users',
        action: 'read',
      }
      expect(isPermissionPromptError(error)).toBe(true)
    })

    it('should return false for denied error', () => {
      const error = { code: PermissionErrorCode.DENIED }
      expect(isPermissionPromptError(error)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isPermissionPromptError(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isPermissionPromptError(undefined)).toBe(false)
    })
  })

  // ============================================================================
  // isPermissionError
  // ============================================================================

  describe('isPermissionError', () => {
    it('should return true for denied error', () => {
      const error = { code: PermissionErrorCode.DENIED }
      expect(isPermissionError(error)).toBe(true)
    })

    it('should return true for prompt required error', () => {
      const error = { code: PermissionErrorCode.PROMPT_REQUIRED }
      expect(isPermissionError(error)).toBe(true)
    })

    it('should return false for other errors', () => {
      expect(isPermissionError({ code: 999 })).toBe(false)
      expect(isPermissionError(null)).toBe(false)
      expect(isPermissionError({})).toBe(false)
    })
  })
})

describe('External Connection State', () => {
  // ============================================================================
  // ExternalConnectionState enum
  // ============================================================================

  describe('ExternalConnectionState', () => {
    it('should have all expected states', () => {
      expect(ExternalConnectionState.DISCONNECTED).toBe('disconnected')
      expect(ExternalConnectionState.CONNECTING).toBe('connecting')
      expect(ExternalConnectionState.CONNECTED).toBe('connected')
      expect(ExternalConnectionState.PENDING_APPROVAL).toBe('pending_approval')
      expect(ExternalConnectionState.PAIRED).toBe('paired')
    })
  })

  // ============================================================================
  // isExternalClientConnected
  // ============================================================================

  describe('isExternalClientConnected', () => {
    it('should return true for CONNECTED', () => {
      expect(isExternalClientConnected(ExternalConnectionState.CONNECTED)).toBe(true)
    })

    it('should return true for PENDING_APPROVAL', () => {
      expect(isExternalClientConnected(ExternalConnectionState.PENDING_APPROVAL)).toBe(true)
    })

    it('should return true for PAIRED', () => {
      expect(isExternalClientConnected(ExternalConnectionState.PAIRED)).toBe(true)
    })

    it('should return false for DISCONNECTED', () => {
      expect(isExternalClientConnected(ExternalConnectionState.DISCONNECTED)).toBe(false)
    })

    it('should return false for CONNECTING', () => {
      expect(isExternalClientConnected(ExternalConnectionState.CONNECTING)).toBe(false)
    })
  })

  // ============================================================================
  // canExternalClientSendRequests
  // ============================================================================

  describe('canExternalClientSendRequests', () => {
    it('should return true only for PAIRED', () => {
      expect(canExternalClientSendRequests(ExternalConnectionState.PAIRED)).toBe(true)
    })

    it('should return false for all other states', () => {
      expect(canExternalClientSendRequests(ExternalConnectionState.DISCONNECTED)).toBe(false)
      expect(canExternalClientSendRequests(ExternalConnectionState.CONNECTING)).toBe(false)
      expect(canExternalClientSendRequests(ExternalConnectionState.CONNECTED)).toBe(false)
      expect(canExternalClientSendRequests(ExternalConnectionState.PENDING_APPROVAL)).toBe(false)
    })
  })
})

describe('getTableName utility', () => {
  it('should combine parts with separator', () => {
    expect(getTableName('pk', 'ext', 'tbl')).toBe('pk__ext__tbl')
  })

  it('should handle empty strings', () => {
    expect(getTableName('', '', '')).toBe('____')
  })

  it('should handle special characters in parts', () => {
    const result = getTableName('key-123', 'my-ext', 'user_data')
    expect(result).toBe('key-123__my-ext__user_data')
  })
})
