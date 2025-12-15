import type { HaexVaultClient } from "~/client";
import { HAEXTENSION_METHODS } from "~/methods";

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

export interface SyncRule {
  id: string;
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction: SyncDirection;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SyncDirection = "up" | "down" | "both";

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
  type: StorageBackendType;
  name: string;
  config: S3BackendConfig;
}

export interface AddSyncRuleOptions {
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction?: SyncDirection;
}

export interface ListFilesOptions {
  spaceId: string;
  path?: string;
  recursive?: boolean;
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
  constructor(private client: HaexVaultClient) {}

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
