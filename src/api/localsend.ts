import type { HaexVaultSdk } from "../client";
import { LOCALSEND_COMMANDS } from "../commands";

// ============================================================================
// Types
// ============================================================================

/**
 * Device type classification (for UI icons)
 */
export type DeviceType = "mobile" | "desktop" | "web" | "headless" | "server";

/**
 * Our device information
 */
export interface DeviceInfo {
  /** Human-readable device name */
  alias: string;
  /** Protocol version */
  version: string;
  /** Device model (e.g., "Linux", "MacBook Pro") */
  deviceModel: string | null;
  /** Device type for UI */
  deviceType: DeviceType;
  /** SHA-256 fingerprint of our TLS certificate */
  fingerprint: string;
  /** Port we're listening on */
  port: number;
  /** Protocol (http or https) */
  protocol: string;
  /** Whether we support download mode (browser mode) */
  download: boolean;
}

/**
 * A discovered remote device
 */
export interface Device {
  /** Human-readable device name */
  alias: string;
  /** Protocol version */
  version: string;
  /** Device model */
  deviceModel: string | null;
  /** Device type for UI */
  deviceType: DeviceType;
  /** SHA-256 fingerprint of device's TLS certificate */
  fingerprint: string;
  /** IP address */
  address: string;
  /** Port */
  port: number;
  /** Protocol (http or https) */
  protocol: string;
  /** Whether device supports download mode */
  download: boolean;
  /** Last seen timestamp (Unix millis) */
  lastSeen: number;
}

/**
 * File metadata for transfer
 */
export interface FileInfo {
  /** Unique file ID within the transfer */
  id: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  fileType: string;
  /** SHA-256 hash (optional, for verification) */
  sha256: string | null;
  /** Base64 preview thumbnail (optional) */
  preview: string | null;
  /** Relative path for folders (e.g., "folder/subfolder/file.txt") */
  relativePath: string | null;
}

/**
 * Server info returned when starting
 */
export interface ServerInfo {
  /** Port server is listening on */
  port: number;
  /** Our fingerprint */
  fingerprint: string;
  /** Local IP addresses */
  addresses: string[];
}

/**
 * Server status information
 */
export interface ServerStatus {
  /** Whether server is running */
  running: boolean;
  /** Port server is listening on */
  port: number | null;
  /** Our fingerprint */
  fingerprint: string | null;
  /** Local IP addresses */
  addresses: string[];
}

/**
 * LocalSend settings
 */
export interface LocalSendSettings {
  /** Device alias */
  alias: string;
  /** Port to use */
  port: number;
  /** Auto-accept transfers from known devices */
  autoAccept: boolean;
  /** Default save directory */
  saveDirectory: string | null;
  /** Require PIN for incoming transfers */
  requirePin: boolean;
  /** PIN (if requirePin is true) */
  pin: string | null;
  /** Show notification on incoming transfer */
  showNotifications: boolean;
}

/**
 * Pending transfer request (for UI)
 */
export interface PendingTransfer {
  /** Session ID */
  sessionId: string;
  /** Sender device info */
  sender: Device;
  /** Files to be received */
  files: FileInfo[];
  /** Total size in bytes */
  totalSize: number;
  /** Whether PIN is required */
  pinRequired: boolean;
  /** Created timestamp (Unix millis) */
  createdAt: number;
}

/**
 * Transfer progress update (for events)
 */
export interface TransferProgress {
  /** Session ID */
  sessionId: string;
  /** File ID */
  fileId: string;
  /** File name */
  fileName: string;
  /** Bytes transferred */
  bytesTransferred: number;
  /** Total bytes */
  totalBytes: number;
  /** Transfer speed in bytes/sec */
  speed: number;
}

/**
 * Transfer session state
 */
export type TransferState = "pending" | "inprogress" | "completed" | "rejected" | "cancelled" | "failed";

/**
 * Transfer direction
 */
export type TransferDirection = "incoming" | "outgoing";

// ============================================================================
// Events
// ============================================================================

/**
 * LocalSend event names
 */
export const LOCALSEND_EVENTS = {
  /** New device discovered */
  deviceDiscovered: "localsend:device-discovered",
  /** Device lost (no longer visible) */
  deviceLost: "localsend:device-lost",
  /** New incoming transfer request */
  transferRequest: "localsend:transfer-request",
  /** Transfer progress update */
  transferProgress: "localsend:transfer-progress",
  /** Transfer completed */
  transferComplete: "localsend:transfer-complete",
  /** Transfer failed */
  transferFailed: "localsend:transfer-failed",
} as const;

export type LocalSendEvent = (typeof LOCALSEND_EVENTS)[keyof typeof LOCALSEND_EVENTS];

// ============================================================================
// API Class
// ============================================================================

export class LocalSendAPI {
  constructor(private client: HaexVaultSdk) {}

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize LocalSend (generate identity, etc.)
   * Call this on app start
   * @returns Our device info
   */
  async init(): Promise<DeviceInfo> {
    return this.client.request<DeviceInfo>(LOCALSEND_COMMANDS.init, {});
  }

  /**
   * Get our device info
   * @returns Our device info
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    return this.client.request<DeviceInfo>(LOCALSEND_COMMANDS.getDeviceInfo, {});
  }

  /**
   * Set our device alias (display name)
   * @param alias New alias
   */
  async setAlias(alias: string): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.setAlias, { alias });
  }

  // ==========================================================================
  // Settings
  // ==========================================================================

  /**
   * Get current LocalSend settings
   * @returns Settings
   */
  async getSettings(): Promise<LocalSendSettings> {
    return this.client.request<LocalSendSettings>(LOCALSEND_COMMANDS.getSettings, {});
  }

  /**
   * Update LocalSend settings
   * @param settings New settings
   */
  async setSettings(settings: LocalSendSettings): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.setSettings, { settings });
  }

  // ==========================================================================
  // Discovery (Desktop only - multicast UDP)
  // ==========================================================================

  /**
   * Start device discovery via multicast UDP
   * Desktop only - on mobile use scanNetwork()
   */
  async startDiscovery(): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.startDiscovery, {});
  }

  /**
   * Stop device discovery
   * Desktop only
   */
  async stopDiscovery(): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.stopDiscovery, {});
  }

  /**
   * Get list of discovered devices
   * @returns Array of discovered devices
   */
  async getDevices(): Promise<Device[]> {
    return this.client.request<Device[]>(LOCALSEND_COMMANDS.getDevices, {});
  }

  // ==========================================================================
  // Network Scan (Mobile only - HTTP)
  // ==========================================================================

  /**
   * Scan network for devices via HTTP
   * Mobile only - on desktop use startDiscovery()
   * @returns Array of discovered devices
   */
  async scanNetwork(): Promise<Device[]> {
    return this.client.request<Device[]>(LOCALSEND_COMMANDS.scanNetwork, {});
  }

  // ==========================================================================
  // Server (Receiving files)
  // ==========================================================================

  /**
   * Start the HTTPS server for receiving files
   * @param port Optional port to listen on (default: 53317)
   * @returns Server info with port, fingerprint, and addresses
   */
  async startServer(port?: number): Promise<ServerInfo> {
    return this.client.request<ServerInfo>(LOCALSEND_COMMANDS.startServer, { port });
  }

  /**
   * Stop the HTTPS server
   */
  async stopServer(): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.stopServer, {});
  }

  /**
   * Get server status
   * @returns Server status
   */
  async getServerStatus(): Promise<ServerStatus> {
    return this.client.request<ServerStatus>(LOCALSEND_COMMANDS.getServerStatus, {});
  }

  /**
   * Get pending incoming transfer requests
   * @returns Array of pending transfers
   */
  async getPendingTransfers(): Promise<PendingTransfer[]> {
    return this.client.request<PendingTransfer[]>(LOCALSEND_COMMANDS.getPendingTransfers, {});
  }

  /**
   * Accept an incoming transfer
   * @param sessionId Session ID of the transfer
   * @param saveDir Directory to save files to
   */
  async acceptTransfer(sessionId: string, saveDir: string): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.acceptTransfer, { sessionId, saveDir });
  }

  /**
   * Reject an incoming transfer
   * @param sessionId Session ID of the transfer
   */
  async rejectTransfer(sessionId: string): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.rejectTransfer, { sessionId });
  }

  // ==========================================================================
  // Client (Sending files)
  // ==========================================================================

  /**
   * Prepare files for sending - collect metadata
   * @param paths Array of file/folder paths to send
   * @returns Array of file info with metadata
   */
  async prepareFiles(paths: string[]): Promise<FileInfo[]> {
    return this.client.request<FileInfo[]>(LOCALSEND_COMMANDS.prepareFiles, { paths });
  }

  /**
   * Send files to a device
   * @param device Target device
   * @param files Files to send (from prepareFiles)
   * @returns Session ID for tracking progress
   */
  async sendFiles(device: Device, files: FileInfo[]): Promise<string> {
    return this.client.request<string>(LOCALSEND_COMMANDS.sendFiles, { device, files });
  }

  /**
   * Cancel an outgoing transfer
   * @param sessionId Session ID of the transfer
   */
  async cancelSend(sessionId: string): Promise<void> {
    await this.client.request(LOCALSEND_COMMANDS.cancelSend, { sessionId });
  }
}
