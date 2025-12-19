/**
 * Transport Handler Types
 *
 * Defines the interface for method handlers that map SDK methods
 * to their transport-specific implementations (invoke or postMessage)
 */

export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// ============================================================================
// Parameter Types - Used for type-safe handler definitions
// ============================================================================

export interface DatabaseQueryParams {
  query: string;
  params?: unknown[];
}

export interface DatabaseMigrationsParams {
  extensionVersion: string;
  migrations: Array<{ name: string; sql: string }>;
}

export interface PermissionCheckParams {
  url?: string;
  resource?: string;
  operation?: string;
  path?: string;
  action?: string;
}

export interface WebFetchParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FilesystemSaveParams {
  data: number[];
  defaultPath?: string;
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface FilesystemOpenParams {
  data: number[];
  fileName: string;
}

export interface ExternalRespondParams {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface FileSyncSpaceParams {
  spaceId?: string;
  name?: string;
}

export interface FileSyncFileParams {
  fileId?: string;
  spaceId?: string;
  path?: string;
  recursive?: boolean;
  localPath?: string;
  remotePath?: string;
  backendIds?: string[];
}

export interface FileSyncBackendParams {
  backendId?: string;
  type?: string;
  name?: string;
  config?: Record<string, unknown>;
}

export interface FileSyncRuleParams {
  ruleId?: string;
  spaceId?: string;
  localPath?: string;
  backendIds?: string[];
  direction?: string;
}

export interface FileSyncConflictParams {
  fileId: string;
  resolution: "local" | "remote" | "keepBoth";
}

export interface FileSyncScanLocalParams {
  ruleId: string;
  subpath?: string;
}

export interface FileSyncQueueParams {
  ruleId?: string;
  entryId?: string;
  errorMessage?: string;
  files?: Array<{
    localPath: string;
    relativePath: string;
    fileSize: number;
  }>;
  operation?: 'upload' | 'download';
  priority?: number;
  status?: string;
  includeCompleted?: boolean;
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Handler function that maps SDK method params to Tauri invoke call
 * Returns the Tauri command name and transformed arguments
 */
export interface InvokeMapping<TParams = Record<string, unknown>> {
  command: string;
  args: (params: TParams) => Record<string, unknown>;
}

/**
 * Map of SDK method names to their invoke mappings
 */
export type InvokeHandlerMap = Record<string, InvokeMapping<any>>;
