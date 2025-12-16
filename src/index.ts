// Import and auto-install polyfills first
// This ensures localStorage, cookies, and history work in custom protocols
import './polyfills';

export { HaexVaultClient } from "./client";
export { DatabaseAPI } from "./api/database";
export { FilesystemAPI } from "./api/filesystem";
export { FileSyncAPI } from "./api/filesync";
export { WebAPI } from "./api/web";
export { PermissionsAPI } from "./api/permissions";
export type {
  FileSpace,
  FileInfo,
  FileSyncState,
  StorageBackendInfo,
  StorageBackendType,
  S3BackendConfig,
  SyncRule,
  SyncDirection,
  SyncStatus,
  SyncError,
  SyncProgress,
  CreateSpaceOptions,
  AddBackendOptions,
  AddSyncRuleOptions,
  ListFilesOptions,
  UploadFileOptions,
  DownloadFileOptions,
} from "./api/filesync";

export type {
  HaexHubRequest,
  HaexHubResponse,
  HaexHubConfig,
  HaexHubEvent,
  EventCallback,
  PermissionResponse,
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
  PendingAuthorization,
  ExternalAuthDecision,
  ExternalConnection,
  WebRequestOptions,
  WebResponse,
} from "./types";

export {
  PermissionStatus,
  ErrorCode,
  DEFAULT_TIMEOUT,
  TABLE_SEPARATOR,
  getTableName,
  ExternalConnectionState,
  ExternalConnectionErrorCode,
  isExternalClientConnected,
  canExternalClientSendRequests,
} from "./types";
export { HaexVaultSdkError } from "./types";

// Export event constants
export { HAEXTENSION_EVENTS, type HaextensionEvent, EXTERNAL_EVENTS, type ExternalEvent } from './events';

// Export method constants
export { HAEXTENSION_METHODS, type HaextensionMethod } from './methods';

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

import { HaexVaultClient } from "./client";
import type { HaexHubConfig } from "./types";

export function createHaexVaultClient(
  config: HaexHubConfig = {}
) {
  return new HaexVaultClient(config);
}
