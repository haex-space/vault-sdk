/**
 * Crypto utilities for Vault Key Management
 * Implements PBKDF2 + AES-GCM encryption/decryption
 *
 * Used for:
 * - Encrypting/decrypting vault names with server password
 * - Encrypting/decrypting vault keys with vault password
 * - Encrypting/decrypting CRDT data with vault key
 */

const PBKDF2_ITERATIONS = 600_000
const KEY_LENGTH = 256
const ALGORITHM = 'AES-GCM'

/**
 * Derives a cryptographic key from a password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  // Ensure salt has a proper ArrayBuffer (not SharedArrayBuffer)
  const saltBuffer = new Uint8Array(salt)

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  // Derive key using PBKDF2
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt'],
  )
}

/**
 * Generates a random vault key (32 bytes)
 */
export function generateVaultKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32))
}

/**
 * Encrypts a string (like vault name) with a password-derived key
 * Returns: { encryptedData, nonce } as Base64 strings
 */
export async function encryptString(
  data: string,
  derivedKey: CryptoKey,
): Promise<{
  encryptedData: string
  nonce: string
}> {
  // Generate random nonce for AES-GCM
  const nonce = crypto.getRandomValues(new Uint8Array(12))

  // Convert string to buffer
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)

  // Encrypt data
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: nonce,
    },
    derivedKey,
    dataBuffer,
  )

  // Convert to Base64 for storage
  return {
    encryptedData: arrayBufferToBase64(encryptedBuffer),
    nonce: arrayBufferToBase64(nonce),
  }
}

/**
 * Decrypts a string (like vault name) with a password-derived key
 */
export async function decryptString(
  encryptedData: string,
  nonce: string,
  derivedKey: CryptoKey,
): Promise<string> {
  // Convert Base64 to Uint8Array
  const encryptedBuffer = base64ToArrayBuffer(encryptedData)
  const nonceBuffer = base64ToArrayBuffer(nonce)

  // Ensure buffers have proper ArrayBuffer
  const encryptedDataBuffer = new Uint8Array(encryptedBuffer)
  const iv = new Uint8Array(nonceBuffer)

  // Decrypt data
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    derivedKey,
    encryptedDataBuffer,
  )

  // Convert buffer to string
  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

/**
 * Encrypts the vault key with a password-derived key
 * Returns: { encryptedVaultKey, salt, vaultKeyNonce } all as Base64 strings
 */
export async function encryptVaultKey(
  vaultKey: Uint8Array,
  password: string,
): Promise<{
  encryptedVaultKey: string
  salt: string
  vaultKeyNonce: string
}> {
  // Generate random salt for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(32))

  // Derive encryption key from password
  const derivedKey = await deriveKeyFromPassword(password, salt)

  // Generate random nonce for AES-GCM
  const nonce = crypto.getRandomValues(new Uint8Array(12))

  // Ensure vaultKey has proper ArrayBuffer
  const vaultKeyBuffer = new Uint8Array(vaultKey)

  // Encrypt vault key
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: nonce,
    },
    derivedKey,
    vaultKeyBuffer,
  )

  // Convert to Base64 for storage
  return {
    encryptedVaultKey: arrayBufferToBase64(encryptedBuffer),
    salt: arrayBufferToBase64(salt),
    vaultKeyNonce: arrayBufferToBase64(nonce),
  }
}

/**
 * Decrypts the vault key using the password
 */
export async function decryptVaultKey(
  encryptedVaultKey: string,
  salt: string,
  vaultKeyNonce: string,
  password: string,
): Promise<Uint8Array> {
  // Convert Base64 to Uint8Array
  const encryptedBuffer = base64ToArrayBuffer(encryptedVaultKey)
  const saltBuffer = base64ToArrayBuffer(salt)
  const nonceBuffer = base64ToArrayBuffer(vaultKeyNonce)

  // Derive decryption key from password
  const derivedKey = await deriveKeyFromPassword(password, saltBuffer)

  // Ensure buffers have proper ArrayBuffer
  const encryptedData = new Uint8Array(encryptedBuffer)
  const iv = new Uint8Array(nonceBuffer)

  // Decrypt vault key
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    derivedKey,
    encryptedData,
  )

  return new Uint8Array(decryptedBuffer)
}

/**
 * Decrypts a vault name using the server password
 * Convenience function that combines key derivation and decryption
 */
export async function decryptVaultName(
  encryptedVaultName: string,
  vaultNameNonce: string,
  vaultNameSalt: string,
  password: string,
): Promise<string> {
  const saltBuffer = base64ToArrayBuffer(vaultNameSalt)
  const derivedKey = await deriveKeyFromPassword(password, saltBuffer)
  return decryptString(encryptedVaultName, vaultNameNonce, derivedKey)
}

/**
 * Encrypts CRDT log data with the vault key
 */
export async function encryptCrdtData(
  data: object,
  vaultKey: Uint8Array,
): Promise<{
  encryptedData: string
  nonce: string
}> {
  // Ensure vaultKey has proper ArrayBuffer
  const vaultKeyBuffer = new Uint8Array(vaultKey)

  // Import vault key for encryption
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    vaultKeyBuffer,
    { name: ALGORITHM },
    false,
    ['encrypt'],
  )

  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(12))

  // Serialize data to JSON
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(JSON.stringify(data))

  // Encrypt data
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: nonce,
    },
    cryptoKey,
    dataBuffer,
  )

  return {
    encryptedData: arrayBufferToBase64(encryptedBuffer),
    nonce: arrayBufferToBase64(nonce),
  }
}

/**
 * Wraps (encrypts) a key with another key using AES-GCM
 * Used for key hierarchies (e.g., master key -> space key -> file key)
 * Returns: nonce (12 bytes) + ciphertext as Uint8Array
 */
export async function wrapKey(
  keyToWrap: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(wrappingKey),
    { name: ALGORITHM },
    false,
    ['encrypt'],
  )

  const nonce = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    cryptoKey,
    new Uint8Array(keyToWrap),
  )

  // Combine nonce + ciphertext
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(nonce, 0)
  result.set(new Uint8Array(ciphertext), 12)

  return result
}

/**
 * Unwraps (decrypts) a key with another key using AES-GCM
 * Expects: nonce (12 bytes) + ciphertext as Uint8Array
 */
export async function unwrapKey(
  wrappedKey: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(wrappingKey),
    { name: ALGORITHM },
    false,
    ['decrypt'],
  )

  const nonce = wrappedKey.slice(0, 12)
  const ciphertext = wrappedKey.slice(12)

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: nonce },
    cryptoKey,
    ciphertext,
  )

  return new Uint8Array(plaintext)
}

/**
 * Decrypts CRDT log data with the vault key
 */
export async function decryptCrdtData<T = object>(
  encryptedData: string,
  nonce: string,
  vaultKey: Uint8Array,
): Promise<T> {
  // Ensure vaultKey has proper ArrayBuffer
  const vaultKeyBuffer = new Uint8Array(vaultKey)

  // Import vault key for decryption
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    vaultKeyBuffer,
    { name: ALGORITHM },
    false,
    ['decrypt'],
  )

  // Convert Base64 to buffers
  const encryptedBuffer = base64ToArrayBuffer(encryptedData)
  const nonceBuffer = base64ToArrayBuffer(nonce)

  // Ensure buffers have proper ArrayBuffer
  const encryptedDataBuffer = new Uint8Array(encryptedBuffer)
  const iv = new Uint8Array(nonceBuffer)

  // Decrypt data
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    cryptoKey,
    encryptedDataBuffer,
  )

  // Parse JSON
  const decoder = new TextDecoder()
  const jsonString = decoder.decode(decryptedBuffer)
  return JSON.parse(jsonString) as T
}

// Utility functions for Base64 conversion

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  // Use Buffer for efficient base64 encoding (works in Node/Bun)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  // Fallback to btoa for browser environments
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    if (byte !== undefined) {
      binary += String.fromCharCode(byte)
    }
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): Uint8Array<ArrayBuffer> {
  // Use Buffer for efficient base64 decoding (works in Node/Bun)
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  // Fallback to atob for browser environments
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
