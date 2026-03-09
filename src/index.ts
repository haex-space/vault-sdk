// Import and auto-install polyfills first
// This ensures localStorage, cookies, and history work in custom protocols
import './polyfills';

export { HaexVaultSdk } from "./client";
export { DatabaseAPI } from "./api/database";
export { FilesystemAPI } from "./api/filesystem";
export type {
  FileStat,
  DirEntry,
  SelectFolderOptions,
  SelectFileOptions,
} from "./api/filesystem";
export { WebAPI } from "./api/web";
export { PermissionsAPI } from "./api/permissions";
export { RemoteStorageAPI } from "./api/remoteStorage";
export { LocalSendAPI, LOCALSEND_EVENTS } from "./api/localsend";
export type {
  DeviceType,
  DeviceInfo,
  Device,
  FileInfo as LocalSendFileInfo,
  ServerInfo,
  ServerStatus,
  LocalSendSettings,
  PendingTransfer,
  TransferProgress,
  TransferState,
  TransferDirection,
  LocalSendEvent,
} from "./api/localsend";
export type {
  StorageBackendInfo as RemoteStorageBackendInfo,
  S3Config as RemoteS3Config,
  S3PublicConfig as RemoteS3PublicConfig,
  AddBackendRequest as RemoteAddBackendRequest,
  UpdateBackendRequest as RemoteUpdateBackendRequest,
  StorageObjectInfo as RemoteStorageObjectInfo,
} from "./api/remoteStorage";
export type {
  StorageConfig,
  AuthUser,
  LoginResponse as SyncServerLoginResponse,
  LoginRequest as SyncServerLoginRequest,
  RefreshRequest as SyncServerRefreshRequest,
  ServerInfo as SyncServerInfo,
  ErrorResponse as SyncServerErrorResponse,
  CreateSpaceRequest,
  InviteMemberRequest,
  RegisterKeypairRequest,
} from "./api/syncServer";

export type {
  HaexHubRequest,
  HaexHubResponse,
  HaexHubConfig,
  HaexHubEvent,
  EventCallback,
  PermissionResponse,
  PermissionErrorBase,
  PermissionDeniedError,
  PermissionPromptError,
  DatabasePermission,
  DatabasePermissionRequest,
  DatabaseQueryParams,
  DatabaseQueryResult,
  DatabaseExecuteParams,
  DatabaseTableInfo,
  DatabaseColumnInfo,
  ExtensionInfo,
  ExtensionManifest,
  ApplicationContext,
  SearchQuery,
  SearchResult,
  ContextChangedEvent,
  SearchRequestEvent,
  ExternalRequestEvent,
  ExternalRequest,
  ExternalResponse,
  ExternalRequestHandler,
  AuthorizedClient,
  BlockedClient,
  RequestedExtension,
  PendingAuthorization,
  ExternalAuthDecision,
  SessionAuthorization,
  ExternalConnection,
  WebRequestOptions,
  WebResponse,
  SpaceRole,
  SharedSpace,
  SpaceMemberInfo,
  SpaceKeyGrantInfo,
  SpaceInvite,
  SpaceAccessTokenInfo,
} from "./types";

export {
  PermissionStatus,
  PermissionErrorCode,
  ErrorCode,
  DEFAULT_TIMEOUT,
  TABLE_SEPARATOR,
  getTableName,
  ExternalConnectionState,
  ExternalConnectionErrorCode,
  isExternalClientConnected,
  canExternalClientSendRequests,
  isPermissionDeniedError,
  isPermissionPromptError,
  isPermissionError,
} from "./types";
export { HaexVaultSdkError } from "./types";
export type {
  FileChangeEvent,
  FileChangeType,
  FileChangePayload,
  SyncTablesUpdatedEvent,
  FilteredSyncTablesResult,
  ExtensionRuntimeMode,
  ExternalRequestPayload,
} from "./types";

// Export event constants
export { HAEXTENSION_EVENTS, type HaextensionEvent, EXTERNAL_EVENTS, type ExternalEvent } from './events';

// Export message type constants
export { HAEXSPACE_MESSAGE_TYPES, type HaexspaceMessageType } from './messages';

// Export Tauri command constants (for use in other projects like haex-vault)
export { TAURI_COMMANDS, type TauriCommand } from './commands';

// Export polyfill utilities for manual control if needed
export {
  installPolyfills,
  installLocalStoragePolyfill,
  installSessionStoragePolyfill,
  installCookiePolyfill,
  installHistoryPolyfill,
  installBaseTag,
} from './polyfills';

// Export config type only (utilities are Node.js-only and exported separately)
export type { HaextensionConfig } from './config';

// Export browser-compatible signature verification
export {
  verifyExtensionSignature,
  sortObjectKeysRecursively,
  hexToBytes,
  type VerifyResult,
  type ZipFileEntry,
} from './crypto/verify';

// Export vault key crypto utilities
export {
  deriveKeyFromPassword,
  generateVaultKey,
  encryptString,
  decryptString,
  encryptVaultKey,
  decryptVaultKey,
  decryptVaultName,
  encryptCrdtData,
  decryptCrdtData,
  wrapKey,
  unwrapKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto/vaultKey';

// Export user keypair crypto utilities
export {
  generateUserKeypairAsync,
  exportUserKeypairAsync,
  importUserPublicKeyAsync,
  importUserPrivateKeyAsync,
  importPublicKeyForKeyAgreementAsync,
  importPrivateKeyForKeyAgreementAsync,
  encryptPrivateKeyAsync,
  decryptPrivateKeyAsync,
  SIGNING_ALGO,
  KEY_AGREEMENT_ALGO,
  type UserKeypair,
  type ExportedUserKeypair,
} from './crypto/userKeypair';

// Export space key crypto utilities
export {
  generateSpaceKey,
  encryptSpaceKeyForRecipientAsync,
  decryptSpaceKeyAsync,
  type EncryptedSpaceKey,
} from './crypto/spaceKey';

// Export record signing utilities
export {
  signRecordAsync,
  verifyRecordSignatureAsync,
  signSpaceChallengeAsync,
  verifySpaceChallengeAsync,
  type SignableRecord,
} from './crypto/recordSigning';

// Export passkey crypto utilities
export {
  generatePasskeyPairAsync,
  exportPublicKeyAsync,
  exportPrivateKeyAsync,
  exportPublicKeyCoseAsync,
  importPrivateKeyAsync,
  importPublicKeyAsync,
  signWithPasskeyAsync,
  verifyWithPasskeyAsync,
  generateCredentialId,
  exportKeyPairAsync,
  COSE_ALGORITHM,
  type CoseAlgorithm,
  type PasskeyKeyPair,
  type ExportedPasskeyKeyPair,
} from './crypto/passkey';

import { HaexVaultSdk } from "./client";
import type { HaexHubConfig } from "./types";

export function createHaexVaultSdk(
  config: HaexHubConfig = {}
) {
  return new HaexVaultSdk(config);
}
