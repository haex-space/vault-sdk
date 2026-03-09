// ============================================================================
// Shared Space Types
// ============================================================================

export type SpaceRole = 'admin' | 'member' | 'viewer'

export interface SharedSpace {
  id: string
  ownerId: string
  encryptedName: string
  nameNonce: string
  currentKeyGeneration: number
  role: SpaceRole
  canInvite: boolean
  createdAt: string
}

export interface SpaceMemberInfo {
  publicKey: string
  label: string
  role: SpaceRole
  canInvite: boolean
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
