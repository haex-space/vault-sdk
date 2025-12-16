import { HAEXTENSION_EVENTS, EXTERNAL_EVENTS } from './events';

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
  error?: HaexVaultSdkErrorData;
}

export interface HaexVaultSdkErrorData {
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

/**
 * External request from an authorized client (browser extension, CLI, server, etc.)
 * These requests come through the WebSocket bridge and are routed to the appropriate extension.
 */
export interface ExternalRequestEvent extends HaexHubEvent {
  type: typeof EXTERNAL_EVENTS.REQUEST;
  data: ExternalRequest;
}

/**
 * External request payload
 */
export interface ExternalRequest {
  /** Unique request ID for response correlation */
  requestId: string;
  /** Client's public key (Base64 SPKI format, used as identifier) */
  publicKey: string;
  /** Action/method to perform (extension-specific) */
  action: string;
  /** Request payload (extension-specific) */
  payload: Record<string, unknown>;
}

/**
 * External request response (sent back to the client)
 */
export interface ExternalResponse {
  /** Request ID for correlation */
  requestId: string;
  /** Whether the request was successful */
  success: boolean;
  /** Response data (if successful) */
  data?: unknown;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Handler function type for external requests
 */
export type ExternalRequestHandler = (
  request: ExternalRequest
) => Promise<ExternalResponse> | ExternalResponse;

/**
 * An authorized external client stored in the database
 */
export interface AuthorizedClient {
  /** Row ID */
  id: string;
  /** Unique client identifier (public key fingerprint) */
  clientId: string;
  /** Human-readable client name */
  clientName: string;
  /** Client's public key (base64) */
  publicKey: string;
  /** Extension ID this client can access */
  extensionId: string;
  /** When the client was authorized (ISO 8601) */
  authorizedAt: string | null;
  /** Last time the client connected (ISO 8601) */
  lastSeen: string | null;
}

/**
 * A blocked external client stored in the database
 */
export interface BlockedClient {
  /** Row ID */
  id: string;
  /** Unique client identifier (public key fingerprint) */
  clientId: string;
  /** Human-readable client name */
  clientName: string;
  /** Client's public key (base64) */
  publicKey: string;
  /** When the client was blocked (ISO 8601) */
  blockedAt: string | null;
}

/**
 * Pending authorization request waiting for user approval
 */
export interface PendingAuthorization {
  /** Unique client identifier */
  clientId: string;
  /** Human-readable client name */
  clientName: string;
  /** Client's public key (base64) */
  publicKey: string;
  /** Requested extension ID */
  extensionId: string;
}

/**
 * Decision type for external authorization prompts
 */
export type ExternalAuthDecision = 'allow' | 'deny';

// ============================================================================
// External Bridge Connection Types
// ============================================================================

/**
 * Connection state for external clients connecting to haex-vault via WebSocket.
 * Used by browser extensions, CLI tools, servers, and other external clients.
 */
export enum ExternalConnectionState {
  /** Not connected to haex-vault */
  DISCONNECTED = 'disconnected',
  /** Attempting to establish connection */
  CONNECTING = 'connecting',
  /** WebSocket connected but not yet authorized */
  CONNECTED = 'connected',
  /** Connected and waiting for user approval in haex-vault */
  PENDING_APPROVAL = 'pending_approval',
  /** Connected and authorized to communicate */
  PAIRED = 'paired',
}

/**
 * Error codes for external client connections.
 * Used to identify specific error conditions for i18n in the frontend.
 */
export enum ExternalConnectionErrorCode {
  /** No error */
  NONE = 'none',
  /** Client is not authorized (rejected or not yet approved) */
  CLIENT_NOT_AUTHORIZED = 'client_not_authorized',
  /** Client was blocked by the user */
  CLIENT_BLOCKED = 'client_blocked',
  /** Connection to haex-vault failed (not running or network error) */
  CONNECTION_FAILED = 'connection_failed',
  /** Connection timed out */
  CONNECTION_TIMEOUT = 'connection_timeout',
  /** WebSocket connection was closed unexpectedly */
  CONNECTION_CLOSED = 'connection_closed',
  /** Failed to decrypt message (invalid key or corrupted data) */
  DECRYPTION_FAILED = 'decryption_failed',
  /** Invalid message format received */
  INVALID_MESSAGE = 'invalid_message',
  /** Unknown or unspecified error */
  UNKNOWN = 'unknown',
}

/**
 * Full connection status including state, client ID, and any error
 */
export interface ExternalConnection {
  /** Current connection state */
  state: ExternalConnectionState;
  /** Client identifier (derived from public key) */
  clientId: string | null;
  /** Error code for i18n (use this for translations) */
  errorCode: ExternalConnectionErrorCode;
  /** Error message (original message, for logging/debugging) */
  errorMessage: string | null;
}

/**
 * Check if external client connection state indicates an active connection
 * (connected, pending approval, or paired)
 */
export function isExternalClientConnected(state: ExternalConnectionState): boolean {
  return (
    state === ExternalConnectionState.CONNECTED ||
    state === ExternalConnectionState.PENDING_APPROVAL ||
    state === ExternalConnectionState.PAIRED
  );
}

/**
 * Check if external client can send requests (only when paired/authorized)
 */
export function canExternalClientSendRequests(state: ExternalConnectionState): boolean {
  return state === ExternalConnectionState.PAIRED;
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

export class HaexVaultSdkError extends Error {
  constructor(
    public code: ErrorCode,
    public messageKey: string,
    public details?: Record<string, unknown>
  ) {
    super(messageKey);
    this.name = "HaexVaultSdkError";
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
