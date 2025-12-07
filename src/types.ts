import { HAEXTENSION_EVENTS } from './events';

// Constants
export const DEFAULT_TIMEOUT = 30000; // 30 seconds in milliseconds
export const TABLE_SEPARATOR = "__"; // Separator for table name components: {publicKey}__{extensionName}__{tableName}

/**
 * Build a fully qualified table name for extensions.
 * Use this in Drizzle schemas to create table names at build time.
 *
 * @param publicKey - The extension's public key (from manifest.json)
 * @param extensionName - The extension name (from manifest.json or package.json)
 * @param tableName - The table name (e.g., "users", "items")
 * @returns Fully qualified table name: `{publicKey}__{extensionName}__{tableName}`
 *
 * @example
 * ```typescript
 * import { getTableName } from "@haex-space/vault-sdk";
 * import manifest from "../haextension/manifest.json";
 * import pkg from "../package.json";
 *
 * const tableName = (name: string) =>
 *   getTableName(manifest.publicKey, manifest.name || pkg.name, name);
 *
 * export const users = sqliteTable(tableName("users"), { ... });
 * ```
 */
export function getTableName(
  publicKey: string,
  extensionName: string,
  tableName: string
): string {
  return `${publicKey}${TABLE_SEPARATOR}${extensionName}${TABLE_SEPARATOR}${tableName}`;
}

// Core Protocol Types
export interface HaexHubRequest {
  method: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface HaexHubResponse<T = unknown> {
  id: string;
  result?: T;
  error?: HaexHubError;
}

export interface HaexHubError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Extension Info (loaded from manifest.json at build time)
export interface ExtensionInfo {
  publicKey: string;
  name: string;
  version: string;
  displayName?: string;
  namespace?: string;
}

// Application Context (provided by HaexHub)
export interface ApplicationContext {
  theme: "light" | "dark" | "system";
  locale: string;
  platform:
    | "linux"
    | "macos"
    | "ios"
    | "freebsd"
    | "dragonfly"
    | "netbsd"
    | "openbsd"
    | "solaris"
    | "android"
    | "windows"
    | undefined;
}

// Search Types
export interface SearchQuery {
  query: string;
  filters?: Record<string, unknown>;
  limit?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: string;
  data?: Record<string, unknown>;
  score?: number;
}

// Permission Types
export enum PermissionStatus {
  GRANTED = "granted",
  DENIED = "denied",
  ASK = "ask",
}

export interface PermissionResponse {
  status: PermissionStatus;
  permanent: boolean;
}

// Database Permission (matches Rust DbExtensionPermission)
export interface DatabasePermission {
  extensionId: string;
  resource: string;
  operation: "read" | "write";
  path: string;
}

export interface DatabasePermissionRequest {
  resource: string;
  operation: "read" | "write";
  reason?: string;
}

// Database Types
export interface DatabaseQueryParams {
  query: string;
  params?: unknown[];
}

export interface DatabaseQueryResult {
  rows: unknown[]; // Array of arrays (each row is an array of values)
  columns?: string[]; // Column names in order
  rowsAffected: number;
  lastInsertId?: number;
}

export interface DatabaseExecuteParams {
  statements: string[];
}

// Migration Types
export interface MigrationResult {
  appliedCount: number;
  alreadyAppliedCount: number;
  appliedMigrations: string[];
}

export interface Migration {
  name: string;
  sql: string;
}

export interface DatabaseTableInfo {
  name: string;
  columns: DatabaseColumnInfo[];
}

export interface DatabaseColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue?: unknown;
  primaryKey: boolean;
}

// Event Types
export interface HaexHubEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

// Specific Event Types
export interface ContextChangedEvent extends HaexHubEvent {
  type: typeof HAEXTENSION_EVENTS.CONTEXT_CHANGED;
  data: {
    context: ApplicationContext;
  };
}

export interface SearchRequestEvent extends HaexHubEvent {
  type: typeof HAEXTENSION_EVENTS.SEARCH_REQUEST;
  data: {
    query: SearchQuery;
    requestId: string;
  };
}

export type EventCallback = (event: HaexHubEvent) => void;

// Manifest Types
export interface ExtensionManifest {
  name: string;
  version: string;
  author?: string | null;
  entry?: string | null;
  icon?: string | null;
  publicKey: string;
  signature: string;
  permissions: {
    database?: any[];
    filesystem?: any[];
    http?: any[];
    shell?: any[];
  };
  homepage?: string | null;
  description?: string | null;
  singleInstance?: boolean | null;
  displayMode?: "auto" | "window" | "iframe" | null;
  /**
   * Path to the migrations directory relative to the extension root.
   * Contains Drizzle-style migrations with meta/_journal.json and *.sql files.
   * These migrations will be applied when the extension is installed.
   * Example: "database/migrations"
   */
  migrationsDir?: string | null;
}

// Config Types
export interface HaexHubConfig {
  debug?: boolean;
  timeout?: number;
  /** Extension manifest data (auto-injected by framework integrations) */
  manifest?: ExtensionManifest;
}

// Web/Fetch Types
export interface WebRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Blob;
  timeout?: number;
}

export interface WebResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
  url: string;
}

// Error Codes
export enum ErrorCode {
  // Connection Errors
  TIMEOUT = "TIMEOUT",
  NOT_IN_IFRAME = "NOT_IN_IFRAME",
  UNAUTHORIZED_ORIGIN = "UNAUTHORIZED_ORIGIN",

  // Permission Errors
  PERMISSION_DENIED = "PERMISSION_DENIED",

  // Validation Errors
  INVALID_PUBLIC_KEY = "INVALID_PUBLIC_KEY",
  INVALID_EXTENSION_NAME = "INVALID_EXTENSION_NAME",
  INVALID_TABLE_NAME = "INVALID_TABLE_NAME",
  INVALID_PARAMS = "INVALID_PARAMS",

  // Extension Errors
  EXTENSION_NOT_INITIALIZED = "EXTENSION_NOT_INITIALIZED",
  EXTENSION_INFO_UNAVAILABLE = "EXTENSION_INFO_UNAVAILABLE",

  // API Errors
  METHOD_NOT_FOUND = "METHOD_NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  WEB_ERROR = "WEB_ERROR",
}

export class HaexHubError extends Error {
  constructor(
    public code: ErrorCode,
    public messageKey: string,
    public details?: Record<string, unknown>
  ) {
    super(messageKey);
    this.name = "HaexHubError";
  }

  /**
   * Get localized error message
   * @param locale - Locale code (e.g., 'en', 'de')
   * @param translations - Translation object
   */
  getLocalizedMessage(
    locale: string = "en",
    translations?: Record<string, Record<string, string>>
  ): string {
    if (!translations || !translations[locale]) {
      return this.messageKey;
    }

    let message = translations[locale][this.messageKey] || this.messageKey;

    // Replace placeholders with details
    if (this.details) {
      Object.entries(this.details).forEach(([key, value]) => {
        message = message.replace(`{${key}}`, String(value));
      });
    }

    return message;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.messageKey,
      details: this.details,
    };
  }
}
