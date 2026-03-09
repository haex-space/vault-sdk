import { importUserPrivateKeyAsync, importUserPublicKeyAsync } from './userKeypair'
import { arrayBufferToBase64, base64ToArrayBuffer } from './vaultKey'

export interface SignableRecord {
  tableName: string
  rowPks: string
  columnName: string | null
  encryptedValue: string | null
  hlcTimestamp: string
}

function canonicalize(record: SignableRecord): Uint8Array<ArrayBuffer> {
  const parts = [
    record.tableName,
    record.rowPks,
    record.columnName === null ? '\x01NULL' : record.columnName,
    record.encryptedValue === null ? '\x01NULL' : record.encryptedValue,
    record.hlcTimestamp,
  ].join('\0')
  return new TextEncoder().encode(parts)
}

export async function signRecordAsync(
  record: SignableRecord, privateKeyBase64: string,
): Promise<string> {
  const key = await importUserPrivateKeyAsync(privateKeyBase64)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, canonicalize(record))
  return arrayBufferToBase64(sig)
}

export async function verifyRecordSignatureAsync(
  record: SignableRecord, signatureBase64: string, publicKeyBase64: string,
): Promise<boolean> {
  const key = await importUserPublicKeyAsync(publicKeyBase64)
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    base64ToArrayBuffer(signatureBase64), canonicalize(record),
  )
}
