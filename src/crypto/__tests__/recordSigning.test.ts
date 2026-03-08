import { describe, it, expect } from 'vitest'
import {
  signRecordAsync,
  verifyRecordSignatureAsync,
  type SignableRecord,
} from '../recordSigning'
import {
  generateUserKeypairAsync,
  exportUserKeypairAsync,
} from '../userKeypair'
import { base64ToArrayBuffer, arrayBufferToBase64 } from '../vaultKey'

async function generateExportedKeypair() {
  const keypair = await generateUserKeypairAsync()
  return exportUserKeypairAsync(keypair)
}

const sampleRecord: SignableRecord = {
  tableName: 'todos',
  rowPks: '["abc-123"]',
  columnName: 'title',
  encryptedValue: 'c2VjcmV0ZGF0YQ==',
  hlcTimestamp: '2026-03-08T12:00:00.000Z-0001-node1',
}

describe('record signing and verification', () => {
  // ============================================================================
  // Roundtrip Tests
  // ============================================================================

  it('should sign and verify a record successfully', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)
    const valid = await verifyRecordSignatureAsync(sampleRecord, signature, keys.publicKey)
    expect(valid).toBe(true)
  })

  it('should sign and verify a record with null fields (DELETE operation)', async () => {
    const keys = await generateExportedKeypair()
    const deleteRecord: SignableRecord = {
      tableName: 'todos',
      rowPks: '["abc-123"]',
      columnName: null,
      encryptedValue: null,
      hlcTimestamp: '2026-03-08T12:00:00.000Z-0002-node1',
    }

    const signature = await signRecordAsync(deleteRecord, keys.privateKey)
    const valid = await verifyRecordSignatureAsync(deleteRecord, signature, keys.publicKey)
    expect(valid).toBe(true)
  })

  // ============================================================================
  // Tamper Detection Tests
  // ============================================================================

  it('should reject tampered tableName', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    const tampered = { ...sampleRecord, tableName: 'notes' }
    const valid = await verifyRecordSignatureAsync(tampered, signature, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('should reject tampered rowPks', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    const tampered = { ...sampleRecord, rowPks: '["xyz-999"]' }
    const valid = await verifyRecordSignatureAsync(tampered, signature, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('should reject tampered columnName', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    const tampered = { ...sampleRecord, columnName: 'description' }
    const valid = await verifyRecordSignatureAsync(tampered, signature, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('should reject tampered encryptedValue', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    const tampered = { ...sampleRecord, encryptedValue: 'dGFtcGVyZWQ=' }
    const valid = await verifyRecordSignatureAsync(tampered, signature, keys.publicKey)
    expect(valid).toBe(false)
  })

  it('should reject tampered hlcTimestamp', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    const tampered = { ...sampleRecord, hlcTimestamp: '2026-03-08T13:00:00.000Z-0001-node1' }
    const valid = await verifyRecordSignatureAsync(tampered, signature, keys.publicKey)
    expect(valid).toBe(false)
  })

  // ============================================================================
  // Wrong Key Tests
  // ============================================================================

  it('should reject verification with a different public key', async () => {
    const signer = await generateExportedKeypair()
    const other = await generateExportedKeypair()

    const signature = await signRecordAsync(sampleRecord, signer.privateKey)
    const valid = await verifyRecordSignatureAsync(sampleRecord, signature, other.publicKey)
    expect(valid).toBe(false)
  })

  it('should reject tampered signature bytes', async () => {
    const keys = await generateExportedKeypair()
    const signature = await signRecordAsync(sampleRecord, keys.privateKey)

    // Flip a byte in the signature
    const sigBytes = base64ToArrayBuffer(signature)
    sigBytes[0] = sigBytes[0]! ^ 0xff
    const tamperedSig = arrayBufferToBase64(sigBytes)

    const valid = await verifyRecordSignatureAsync(sampleRecord, tamperedSig, keys.publicKey)
    expect(valid).toBe(false)
  })

  // ============================================================================
  // ECDSA Non-Determinism Test
  // ============================================================================

  it('should produce different signatures for the same input (ECDSA non-determinism)', async () => {
    const keys = await generateExportedKeypair()
    const sig1 = await signRecordAsync(sampleRecord, keys.privateKey)
    const sig2 = await signRecordAsync(sampleRecord, keys.privateKey)

    // ECDSA uses random k, so signatures should differ
    expect(sig1).not.toBe(sig2)

    // But both should verify
    const valid1 = await verifyRecordSignatureAsync(sampleRecord, sig1, keys.publicKey)
    const valid2 = await verifyRecordSignatureAsync(sampleRecord, sig2, keys.publicKey)
    expect(valid1).toBe(true)
    expect(valid2).toBe(true)
  })

  // ============================================================================
  // Canonical Format Security Test
  // ============================================================================

  it('should produce different signatures for null columnName vs empty string columnName', async () => {
    const keys = await generateExportedKeypair()

    const recordWithNull: SignableRecord = {
      ...sampleRecord,
      columnName: null,
    }
    const recordWithEmpty: SignableRecord = {
      ...sampleRecord,
      columnName: '',
    }

    const sigNull = await signRecordAsync(recordWithNull, keys.privateKey)
    const sigEmpty = await signRecordAsync(recordWithEmpty, keys.privateKey)

    // null maps to '\x01NULL' sentinel, empty string stays as '', so canonical forms differ
    const nullVerifiesAsEmpty = await verifyRecordSignatureAsync(recordWithEmpty, sigNull, keys.publicKey)
    const emptyVerifiesAsNull = await verifyRecordSignatureAsync(recordWithNull, sigEmpty, keys.publicKey)

    // Signatures should NOT be interchangeable between null and empty
    expect(nullVerifiesAsEmpty).toBe(false)
    expect(emptyVerifiesAsNull).toBe(false)
  })
})
