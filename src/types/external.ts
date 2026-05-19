import { EXTERNAL_EVENTS } from '../events';
import type { HaexHubEvent } from '../types';

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
 * External request payload from Tauri event (includes extension target info).
 * This is sent from Rust when an external client makes a request.
 */
export interface ExternalRequestPayload extends ExternalRequest {
  /** Target extension's public key */
  extensionPublicKey: string;
  /** Target extension's name */
  extensionName: string;
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
 * Extension requested by an external client
 */
export interface RequestedExtension {
  /** Extension name (e.g., "haex-pass") */
  name: string;
  /** Extension's public key (hex string from manifest) */
  extensionPublicKey: string;
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
  /** Extensions the client wants to access (pre-selected in authorization dialog) */
  requestedExtensions: RequestedExtension[];
}

/**
 * Decision type for external authorization prompts
 */
export type ExternalAuthDecision = 'allow' | 'deny';

/**
 * Session-based authorization entry (for "allow once" authorizations)
 * These are stored in-memory and cleared when haex-vault restarts.
 */
export interface SessionAuthorization {
  /** Unique client identifier (public key fingerprint) */
  clientId: string;
  /** Human-readable client name (e.g. "haex-pass Browser Extension") */
  clientName: string;
  /** Client's public key (base64) */
  publicKey: string;
  /** Extension ID this client can access */
  extensionId: string;
}

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
