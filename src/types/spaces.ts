// ============================================================================
// Shared Space Types
// ============================================================================

export interface SharedSpace {
  id: string
  ownerId: string
  encryptedName: string
  nameNonce: string
  currentKeyGeneration: number
  createdAt: string
}

export interface SpaceMemberInfo {
  publicKey: string
  label: string
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
}

export interface SpaceAccessTokenInfo {
  id: string
  publicKey: string
  label: string | null
  revoked: boolean
  createdAt: string
  lastUsedAt: string | null
}

/**
 * A space with its decrypted name.
 * Returned by the extension API after vault-side decryption.
 * Includes both local and remote (shared) spaces.
 */
export interface DecryptedSpace {
  id: string
  name: string
  originUrl: string
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
