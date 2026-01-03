/**
 * LocalSend Commands
 *
 * Commands for LocalSend file sharing operations.
 * These commands are used for both:
 * - Tauri invoke (WebView extensions)
 * - postMessage (iframe extensions)
 *
 * Naming convention: `localsend_<action>`
 */

export const LOCALSEND_COMMANDS = {
  // Initialization
  /** Initialize LocalSend (generate identity, etc.) */
  init: "localsend_init",
  /** Get our device info */
  getDeviceInfo: "localsend_get_device_info",
  /** Set our device alias */
  setAlias: "localsend_set_alias",

  // Settings
  /** Get current settings */
  getSettings: "localsend_get_settings",
  /** Update settings */
  setSettings: "localsend_set_settings",

  // Discovery (desktop only)
  /** Start device discovery via multicast UDP */
  startDiscovery: "localsend_start_discovery",
  /** Stop device discovery */
  stopDiscovery: "localsend_stop_discovery",
  /** Get list of discovered devices */
  getDevices: "localsend_get_devices",

  // Network scan (mobile only)
  /** Scan network for devices via HTTP */
  scanNetwork: "localsend_scan_network",

  // Server (receiving files)
  /** Start the HTTPS server for receiving files */
  startServer: "localsend_start_server",
  /** Stop the HTTPS server */
  stopServer: "localsend_stop_server",
  /** Get server status */
  getServerStatus: "localsend_get_server_status",
  /** Get pending incoming transfer requests */
  getPendingTransfers: "localsend_get_pending_transfers",
  /** Accept an incoming transfer */
  acceptTransfer: "localsend_accept_transfer",
  /** Reject an incoming transfer */
  rejectTransfer: "localsend_reject_transfer",

  // Client (sending files)
  /** Prepare files for sending - collect metadata */
  prepareFiles: "localsend_prepare_files",
  /** Send files to a device */
  sendFiles: "localsend_send_files",
  /** Cancel an outgoing transfer */
  cancelSend: "localsend_cancel_send",
} as const;

export type LocalSendCommand = (typeof LOCALSEND_COMMANDS)[keyof typeof LOCALSEND_COMMANDS];
