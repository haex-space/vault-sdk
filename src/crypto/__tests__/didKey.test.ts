import { describe, it, expect } from 'vitest'
import {
  publicKeyToDidKeyAsync,
  didKeyToPublicKeyAsync,
  generateIdentityAsync,
} from '../didKey'
import {
  generateUserKeypairAsync,
  exportUserKeypairAsync,
} from '../userKeypair'

describe('did:key', () => {
  it('should generate a valid did:key from a P-256 public key', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)
    const did = await publicKeyToDidKeyAsync(exported.publicKey)

    expect(did).toMatch(/^did:key:zDn/)
  })

  it('should roundtrip: publicKey → did:key → publicKey', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)

    const did = await publicKeyToDidKeyAsync(exported.publicKey)
    const recoveredPublicKey = await didKeyToPublicKeyAsync(did)

    expect(recoveredPublicKey).toBe(exported.publicKey)
  })

  it('should produce different DIDs for different keys', async () => {
    const keypair1 = await generateUserKeypairAsync()
    const keypair2 = await generateUserKeypairAsync()
    const exported1 = await exportUserKeypairAsync(keypair1)
    const exported2 = await exportUserKeypairAsync(keypair2)

    const did1 = await publicKeyToDidKeyAsync(exported1.publicKey)
    const did2 = await publicKeyToDidKeyAsync(exported2.publicKey)

    expect(did1).not.toBe(did2)
  })

  it('should produce the same DID for the same key', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)

    const did1 = await publicKeyToDidKeyAsync(exported.publicKey)
    const did2 = await publicKeyToDidKeyAsync(exported.publicKey)

    expect(did1).toBe(did2)
  })

  it('should reject invalid did:key prefixes', async () => {
    await expect(didKeyToPublicKeyAsync('did:web:example.com')).rejects.toThrow()
    await expect(didKeyToPublicKeyAsync('not-a-did')).rejects.toThrow()
  })

  it('generateIdentityAsync should return did + keypair', async () => {
    const identity = await generateIdentityAsync()

    expect(identity.did).toMatch(/^did:key:zDn/)
    expect(identity.publicKeyBase64).toBeTruthy()
    expect(identity.privateKeyBase64).toBeTruthy()

    // Verify the DID matches the public key
    const recoveredPublicKey = await didKeyToPublicKeyAsync(identity.did)
    expect(recoveredPublicKey).toBe(identity.publicKeyBase64)
  })
})
