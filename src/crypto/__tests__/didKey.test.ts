import { describe, it, expect } from 'vitest'
import {
  publicKeyToDidKeyAsync,
  didKeyToPublicKeyAsync,
  didKeyToRawPublicKey,
  generateIdentityAsync,
} from '../didKey'
import {
  generateUserKeypairAsync,
  exportUserKeypairAsync,
} from '../userKeypair'

describe('did:key', () => {
  it('should generate a valid did:key from an Ed25519 public key', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)
    const did = await publicKeyToDidKeyAsync(exported.signingPublicKey)

    // Ed25519 did:key starts with z6Mk
    expect(did).toMatch(/^did:key:z6Mk/)
  })

  it('should roundtrip: publicKey → did:key → publicKey', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)

    const did = await publicKeyToDidKeyAsync(exported.signingPublicKey)
    const recoveredPublicKey = await didKeyToPublicKeyAsync(did)

    expect(recoveredPublicKey).toBe(exported.signingPublicKey)
  })

  it('should extract raw 32-byte public key from did:key', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)
    const did = await publicKeyToDidKeyAsync(exported.signingPublicKey)

    const rawKey = didKeyToRawPublicKey(did)

    expect(rawKey).toBeInstanceOf(Uint8Array)
    expect(rawKey.length).toBe(32)
  })

  it('should produce different DIDs for different keys', async () => {
    const keypair1 = await generateUserKeypairAsync()
    const keypair2 = await generateUserKeypairAsync()
    const exported1 = await exportUserKeypairAsync(keypair1)
    const exported2 = await exportUserKeypairAsync(keypair2)

    const did1 = await publicKeyToDidKeyAsync(exported1.signingPublicKey)
    const did2 = await publicKeyToDidKeyAsync(exported2.signingPublicKey)

    expect(did1).not.toBe(did2)
  })

  it('should produce the same DID for the same key', async () => {
    const keypair = await generateUserKeypairAsync()
    const exported = await exportUserKeypairAsync(keypair)

    const did1 = await publicKeyToDidKeyAsync(exported.signingPublicKey)
    const did2 = await publicKeyToDidKeyAsync(exported.signingPublicKey)

    expect(did1).toBe(did2)
  })

  it('should reject invalid did:key prefixes', async () => {
    await expect(didKeyToPublicKeyAsync('did:web:example.com')).rejects.toThrow()
    await expect(didKeyToPublicKeyAsync('not-a-did')).rejects.toThrow()
  })

  it('generateIdentityAsync should return did + both keypairs', async () => {
    const identity = await generateIdentityAsync()

    expect(identity.did).toMatch(/^did:key:z6Mk/)
    expect(identity.signingPublicKey).toBeTruthy()
    expect(identity.signingPrivateKey).toBeTruthy()
    expect(identity.agreementPublicKey).toBeTruthy()
    expect(identity.agreementPrivateKey).toBeTruthy()

    // Verify the DID matches the signing public key
    const recoveredPublicKey = await didKeyToPublicKeyAsync(identity.did)
    expect(recoveredPublicKey).toBe(identity.signingPublicKey)
  })
})
