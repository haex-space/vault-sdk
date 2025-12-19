import type { HaexVaultSdk } from "~/client";
import { HAEXTENSION_METHODS } from "~/methods";

// ============================================================================
// Constants
// ============================================================================

/** File sync state constants */
export const FILE_SYNC_STATE = {
  SYNCED: "synced",
  SYNCING: "syncing",
  LOCAL_ONLY: "localOnly",
  REMOTE_ONLY: "remoteOnly",
  CONFLICT: "conflict",
  ERROR: "error",
} as const;

/** Sync direction constants */
export const SYNC_DIRECTION = {
  UP: "up",
  DOWN: "down",
  BOTH: "both",
} as const;

/** Storage backend type constants */
export const STORAGE_BACKEND_TYPE = {
  S3: "s3",
  R2: "r2",
  MINIO: "minio",
  GDRIVE: "gdrive",
  DROPBOX: "dropbox",
} as const;

// ============================================================================
// Types
// ============================================================================

export interface FileSpace {
  id: string;
  name: string;
  isPersonal: boolean;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileInfo {
  id: string;
  spaceId: string;
  name: string;
  path: string;
  mimeType: string | null;
  size: number;
  contentHash: string;
  isDirectory: boolean;
  syncState: FileSyncState;
  backends: string[];
  createdAt: string;
  updatedAt: string;
}

/** Local file info (unencrypted, scanned from local filesystem) */
export interface LocalFileInfo {
  /** Unique ID (hash of rule_id + relative path) */
  id: string;
  /** File name */
  name: string;
  /** Full local path */
  path: string;
  /** Relative path from sync root */
  relativePath: string;
  /** MIME type (null for directories) */
  mimeType: string | null;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Last modified timestamp (ISO 8601) */
  modifiedAt: string | null;
}

export type FileSyncState =
  | "synced"
  | "syncing"
  | "localOnly"
  | "remoteOnly"
  | "conflict"
  | "error";

export interface StorageBackendInfo {
  id: string;
  type: StorageBackendType;
  name: string;
  enabled: boolean;
  createdAt: string;
}

export type StorageBackendType = "s3" | "r2" | "minio" | "gdrive" | "dropbox";

export interface S3BackendConfig {
  type: "s3" | "r2" | "minio";
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Backend configuration for S3-compatible storage */
export type BackendConfig = S3BackendConfig;

export interface SyncRule {
  id: string;
  /** Device ID this sync rule belongs to (local paths are device-specific) */
  deviceId: string;
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction: SyncDirection;
  enabled: boolean;
  /** Gitignore-like patterns for files/folders to exclude from sync */
  ignorePatterns: string[];
  /** Default conflict resolution strategy for this sync rule */
  conflictStrategy: ConflictStrategy;
  createdAt: string;
  updatedAt: string;
}

export type SyncDirection = "up" | "down" | "both";

/** Conflict resolution strategy for sync rules */
export type ConflictStrategy = "local" | "remote" | "newer" | "ask" | "keepBoth";

/** Conflict strategy constants */
export const CONFLICT_STRATEGY: Record<string, ConflictStrategy> = {
  /** Always prefer local version */
  LOCAL: "local",
  /** Always prefer remote version */
  REMOTE: "remote",
  /** Prefer newer version (Last-Writer-Wins) */
  NEWER: "newer",
  /** Ask user to resolve each conflict manually */
  ASK: "ask",
  /** Keep both versions (create conflict copy) */
  KEEP_BOTH: "keepBoth",
};

export interface SyncStatus {
  isSyncing: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  lastSync: string | null;
  errors: SyncError[];
}

export interface SyncError {
  fileId: string;
  fileName: string;
  error: string;
  timestamp: string;
}

export interface SyncProgress {
  fileId: string;
  fileName: string;
  bytesTransferred: number;
  totalBytes: number;
  direction: "upload" | "download";
}

export interface CreateSpaceOptions {
  name: string;
}

export interface AddBackendOptions {
  name: string;
  config: BackendConfig;
}

export interface AddSyncRuleOptions {
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction?: SyncDirection;
  /** Gitignore-like patterns for files/folders to exclude from sync */
  ignorePatterns?: string[];
  /** Default conflict resolution strategy (defaults to 'ask') */
  conflictStrategy?: ConflictStrategy;
}

export interface UpdateSyncRuleOptions {
  ruleId: string;
  backendIds?: string[];
  direction?: SyncDirection;
  enabled?: boolean;
  /** Gitignore-like patterns for files/folders to exclude from sync */
  ignorePatterns?: string[];
  /** Default conflict resolution strategy */
  conflictStrategy?: ConflictStrategy;
}

export interface ListFilesOptions {
  spaceId: string;
  path?: string;
  recursive?: boolean;
}

export interface ScanLocalOptions {
  /** Sync rule ID to scan */
  ruleId: string;
  /** Optional subpath within the sync root to scan */
  subpath?: string;
}

export interface UploadFileOptions {
  spaceId: string;
  localPath: string;
  remotePath?: string;
  backendIds?: string[];
}

export interface DownloadFileOptions {
  fileId: string;
  localPath: string;
}

// ============================================================================
// FileSyncAPI
// ============================================================================

/**
 * File Sync API for E2E encrypted file synchronization
 *
 * Access via: client.filesystem.sync.*
 */
export class FileSyncAPI {
  constructor(private client: HaexVaultSdk) {}

  // --------------------------------------------------------------------------
  // Spaces
  // --------------------------------------------------------------------------

  /**
   * List all file spaces
   */
  async listSpacesAsync(): Promise<FileSpace[]> {
    return this.client.request<FileSpace[]>(
      HAEXTENSION_METHODS.filesystem.sync.listSpaces
    );
  }

  /**
   * Create a new file space
   */
  async createSpaceAsync(options: CreateSpaceOptions): Promise<FileSpace> {
    return this.client.request<FileSpace, CreateSpaceOptions>(
      HAEXTENSION_METHODS.filesystem.sync.createSpace,
      options
    );
  }

  /**
   * Delete a file space
   */
  async deleteSpaceAsync(spaceId: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.deleteSpace, {
      spaceId,
    });
  }

  // --------------------------------------------------------------------------
  // Files
  // --------------------------------------------------------------------------

  /**
   * List files in a space
   */
  async listFilesAsync(options: ListFilesOptions): Promise<FileInfo[]> {
    return this.client.request<FileInfo[], ListFilesOptions>(
      HAEXTENSION_METHODS.filesystem.sync.listFiles,
      options
    );
  }

  /**
   * Scan local files in a sync rule folder
   * Returns unencrypted local files for display in the UI
   */
  async scanLocalAsync(options: ScanLocalOptions): Promise<LocalFileInfo[]> {
    return this.client.request<LocalFileInfo[], ScanLocalOptions>(
      HAEXTENSION_METHODS.filesystem.sync.scanLocal,
      options
    );
  }

  /**
   * Get file info by ID
   */
  async getFileAsync(fileId: string): Promise<FileInfo | null> {
    return this.client.request<FileInfo | null>(
      HAEXTENSION_METHODS.filesystem.sync.getFile,
      { fileId }
    );
  }

  /**
   * Upload a file to the sync system
   */
  async uploadFileAsync(options: UploadFileOptions): Promise<FileInfo> {
    return this.client.request<FileInfo, UploadFileOptions>(
      HAEXTENSION_METHODS.filesystem.sync.uploadFile,
      options
    );
  }

  /**
   * Download a file to local storage
   */
  async downloadFileAsync(options: DownloadFileOptions): Promise<void> {
    await this.client.request<void, DownloadFileOptions>(
      HAEXTENSION_METHODS.filesystem.sync.downloadFile,
      options
    );
  }

  /**
   * Delete a file from the sync system
   */
  async deleteFileAsync(fileId: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.deleteFile, {
      fileId,
    });
  }

  // --------------------------------------------------------------------------
  // Storage Backends
  // --------------------------------------------------------------------------

  /**
   * List configured storage backends
   */
  async listBackendsAsync(): Promise<StorageBackendInfo[]> {
    return this.client.request<StorageBackendInfo[]>(
      HAEXTENSION_METHODS.filesystem.sync.listBackends
    );
  }

  /**
   * Add a new storage backend
   */
  async addBackendAsync(options: AddBackendOptions): Promise<StorageBackendInfo> {
    return this.client.request<StorageBackendInfo, AddBackendOptions>(
      HAEXTENSION_METHODS.filesystem.sync.addBackend,
      options
    );
  }

  /**
   * Remove a storage backend
   */
  async removeBackendAsync(backendId: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.removeBackend, {
      backendId,
    });
  }

  /**
   * Test backend connection
   */
  async testBackendAsync(backendId: string): Promise<boolean> {
    return this.client.request<boolean>(
      HAEXTENSION_METHODS.filesystem.sync.testBackend,
      { backendId }
    );
  }

  // --------------------------------------------------------------------------
  // Sync Rules
  // --------------------------------------------------------------------------

  /**
   * List sync rules
   */
  async listSyncRulesAsync(): Promise<SyncRule[]> {
    return this.client.request<SyncRule[]>(
      HAEXTENSION_METHODS.filesystem.sync.listSyncRules
    );
  }

  /**
   * Add a sync rule
   */
  async addSyncRuleAsync(options: AddSyncRuleOptions): Promise<SyncRule> {
    return this.client.request<SyncRule, AddSyncRuleOptions>(
      HAEXTENSION_METHODS.filesystem.sync.addSyncRule,
      options
    );
  }

  /**
   * Update a sync rule
   */
  async updateSyncRuleAsync(options: UpdateSyncRuleOptions): Promise<SyncRule> {
    return this.client.request<SyncRule, UpdateSyncRuleOptions>(
      HAEXTENSION_METHODS.filesystem.sync.updateSyncRule,
      options
    );
  }

  /**
   * Remove a sync rule
   */
  async removeSyncRuleAsync(ruleId: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.removeSyncRule, {
      ruleId,
    });
  }

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  /**
   * Get current sync status
   */
  async getSyncStatusAsync(): Promise<SyncStatus> {
    return this.client.request<SyncStatus>(
      HAEXTENSION_METHODS.filesystem.sync.getSyncStatus
    );
  }

  /**
   * Trigger a manual sync
   */
  async triggerSyncAsync(): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.triggerSync);
  }

  /**
   * Pause syncing
   */
  async pauseSyncAsync(): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.pauseSync);
  }

  /**
   * Resume syncing
   */
  async resumeSyncAsync(): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.resumeSync);
  }

  // --------------------------------------------------------------------------
  // Conflict Resolution
  // --------------------------------------------------------------------------

  /**
   * Resolve a file conflict
   */
  async resolveConflictAsync(
    fileId: string,
    resolution: "local" | "remote" | "keepBoth"
  ): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.filesystem.sync.resolveConflict, {
      fileId,
      resolution,
    });
  }

  // --------------------------------------------------------------------------
  // Folder Selection (Native Dialog)
  // --------------------------------------------------------------------------

  /**
   * Open a folder selection dialog
   */
  async selectFolderAsync(): Promise<string | null> {
    return this.client.request<string | null>(
      HAEXTENSION_METHODS.filesystem.sync.selectFolder
    );
  }
}
