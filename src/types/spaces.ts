// ============================================================================
// Shared Space Types
// ============================================================================

export type SpaceRole = 'admin' | 'owner' | 'member' | 'reader'

export interface SharedSpace {
  id: string
  ownerId: string
  encryptedName: string
  nameNonce: string
  currentKeyGeneration: number
  role: SpaceRole
  createdAt: string
}

export interface SpaceMemberInfo {
  publicKey: string
  label: string
  role: SpaceRole
  invitedBy: string | null
  joinedAt: string
}

export interface SpaceKeyGrantInfo {
  spaceId: string
  generation: number
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
}

export interface SpaceInvite {
  spaceId: string
  serverUrl: string
  spaceName: string
  accessToken: string
  encryptedSpaceKey: string
  keyNonce: string
  ephemeralPublicKey: string
  generation: number
  role: SpaceRole
}

export interface SpaceAccessTokenInfo {
  id: string
  publicKey: string
  role: SpaceRole
  label: string | null
  revoked: boolean
  createdAt: string
  lastUsedAt: string | null
}

/**
 * A shared space with its decrypted name.
 * Returned by the extension API after vault-side decryption.
 */
export interface DecryptedSpace {
  id: string
  name: string
  role: SpaceRole
  serverUrl: string
  createdAt: string
}

/**
 * Minimal sync backend info exposed to extensions.
 * Extensions use this to pick a server when creating a space.
 */
export interface SyncBackendInfo {
  id: string
  name: string
  serverUrl: string
  isDefault: boolean
}
