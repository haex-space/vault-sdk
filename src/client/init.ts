/**
 * Client Initialization
 *
 * Functions for initializing the client in different modes:
 * - Native WebView mode (Tauri)
 * - IFrame mode (mobile/web)
 */

import { HAEXTENSION_EVENTS, EXTERNAL_EVENTS } from "../events";
import { EXTENSION_COMMANDS } from "../commands";
import { HAEXSPACE_MESSAGE_TYPES } from "../messages";
import { ErrorCode, HaexVaultSdkError } from "../types";
import type { ExtensionInfo, ApplicationContext, HaexHubEvent, FileChangeEvent } from "../types";
import { LOCALSEND_EVENTS } from "../api/localsend";
import type { ClientContext, ClientConfig, LogFn } from "./context";

/**
 * Tauri API types
 */
interface TauriInvoke {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriEvent {
  listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
}

/**
 * Check if we're running in an iframe
 */
export function isInIframe(): boolean {
  return window.self !== window.top;
}

/**
 * Check if Tauri is available
 */
export function hasTauri(): boolean {
  return typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== "undefined";
}

/**
 * Get Tauri core API
 */
export function getTauriCore(): TauriInvoke {
  return (window as unknown as { __TAURI__: { core: TauriInvoke } }).__TAURI__.core;
}

/**
 * Get Tauri event API
 */
export function getTauriEvent(): TauriEvent {
  return (window as unknown as { __TAURI__: { event: TauriEvent } }).__TAURI__.event;
}

/**
 * Initialize in native WebView mode (Tauri)
 */
export async function initNativeMode(
  ctx: ClientContext,
  log: LogFn,
  onEvent: (event: HaexHubEvent) => void,
  onContextChange: (context: ApplicationContext) => void
): Promise<{ extensionInfo: ExtensionInfo; context: ApplicationContext }> {
  const { invoke } = getTauriCore();

  // Get extension info from Tauri backend
  const extensionInfo = await invoke<ExtensionInfo>(EXTENSION_COMMANDS.getInfo);
  const context = await invoke<ApplicationContext>(EXTENSION_COMMANDS.getContext);

  ctx.state.isNativeWindow = true;
  ctx.state.initialized = true;
  ctx.state.extensionInfo = extensionInfo;
  ctx.state.context = context;

  log("HaexVault SDK initialized in native WebViewWindow mode");
  log("Extension info:", extensionInfo);
  log("Application context:", context);

  // Setup Tauri event listeners
  await setupTauriEventListeners(ctx, log, onEvent, onContextChange);

  return { extensionInfo, context };
}

/**
 * Setup Tauri event listeners for context changes and external requests
 */
async function setupTauriEventListeners(
  ctx: ClientContext,
  log: LogFn,
  onEvent: (event: HaexHubEvent) => void,
  onContextChange: (context: ApplicationContext) => void
): Promise<void> {
  const { listen } = getTauriEvent();

  log("Setting up Tauri event listener for:", HAEXTENSION_EVENTS.CONTEXT_CHANGED);

  // Listen for context changes
  try {
    await listen(HAEXTENSION_EVENTS.CONTEXT_CHANGED, (event) => {
      log("Received Tauri event:", HAEXTENSION_EVENTS.CONTEXT_CHANGED, event);

      const payload = event.payload as { context?: ApplicationContext };
      if (payload?.context) {
        ctx.state.context = payload.context;
        log("Updated context to:", ctx.state.context);
        onContextChange(payload.context);
        onEvent({
          type: HAEXTENSION_EVENTS.CONTEXT_CHANGED,
          data: { context: ctx.state.context },
          timestamp: Date.now(),
        });
      } else {
        log("Event received but no context in payload:", event);
      }
    });
    log("Context change listener registered successfully");
  } catch (error) {
    log("Failed to setup context change listener:", error);
  }

  // Listen for external requests
  try {
    await listen(EXTERNAL_EVENTS.REQUEST, (event) => {
      log("====== EXTERNAL REQUEST RECEIVED ======");
      log("Event payload:", JSON.stringify(event.payload, null, 2));
      if (event.payload) {
        onEvent({
          type: EXTERNAL_EVENTS.REQUEST,
          data: event.payload,
          timestamp: Date.now(),
        });
      } else {
        log("External request event has no payload!");
      }
    });
    log("External request listener registered successfully");
  } catch (error) {
    log("Failed to setup external request listener:", error);
  }

  // Listen for file change events (from native file watcher)
  log("Registering file change listener for:", HAEXTENSION_EVENTS.FILE_CHANGED);
  try {
    await listen(HAEXTENSION_EVENTS.FILE_CHANGED, (event) => {
      log("File change event received:", event.payload);
      if (event.payload) {
        const payload = event.payload as { ruleId: string; changeType: string; path?: string };
        // Cast to FileChangeEvent which extends HaexHubEvent
        onEvent({
          type: HAEXTENSION_EVENTS.FILE_CHANGED,
          ruleId: payload.ruleId,
          changeType: payload.changeType,
          path: payload.path,
          timestamp: Date.now(),
        } as FileChangeEvent);
      }
    });
    log("File change listener registered successfully");
  } catch (error) {
    log("Failed to setup file change listener:", error);
  }

  // Listen for sync tables updated events (from CRDT pull)
  log("Registering sync tables updated listener for:", HAEXTENSION_EVENTS.SYNC_TABLES_UPDATED);
  try {
    await listen(HAEXTENSION_EVENTS.SYNC_TABLES_UPDATED, (event) => {
      log("Sync tables updated event received:", event.payload);
      if (event.payload) {
        const payload = event.payload as { tables: string[] };
        onEvent({
          type: HAEXTENSION_EVENTS.SYNC_TABLES_UPDATED,
          data: { tables: payload.tables },
          timestamp: Date.now(),
        });
      }
    });
    log("Sync tables updated listener registered successfully");
  } catch (error) {
    log("Failed to setup sync tables updated listener:", error);
  }

  // Listen for LocalSend events
  log("Setting up LocalSend event listeners");
  try {
    await setupLocalSendEventListeners(log, onEvent);
    log("LocalSend event listeners setup complete");
  } catch (error) {
    log("Failed to setup LocalSend event listeners:", error);
  }
}

/**
 * Setup LocalSend event listeners for WebView mode
 */
async function setupLocalSendEventListeners(
  log: LogFn,
  onEvent: (event: HaexHubEvent) => void
): Promise<void> {
  const { listen } = getTauriEvent();

  // Listen for device discovered events
  try {
    await listen(LOCALSEND_EVENTS.deviceDiscovered, (event) => {
      log("LocalSend device discovered:", event.payload);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.deviceDiscovered,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend device discovered listener registered");
  } catch (error) {
    log("Failed to setup LocalSend device discovered listener:", error);
  }

  // Listen for device lost events
  try {
    await listen(LOCALSEND_EVENTS.deviceLost, (event) => {
      log("LocalSend device lost:", event.payload);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.deviceLost,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend device lost listener registered");
  } catch (error) {
    log("Failed to setup LocalSend device lost listener:", error);
  }

  // Listen for transfer request events
  try {
    await listen(LOCALSEND_EVENTS.transferRequest, (event) => {
      log("LocalSend transfer request:", event.payload);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.transferRequest,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend transfer request listener registered");
  } catch (error) {
    log("Failed to setup LocalSend transfer request listener:", error);
  }

  // Listen for transfer progress events
  try {
    await listen(LOCALSEND_EVENTS.transferProgress, (event) => {
      log("LocalSend transfer progress event:", event);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.transferProgress,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend transfer progress listener registered");
  } catch (error) {
    log("Failed to setup LocalSend transfer progress listener:", error);
  }

  // Listen for transfer complete events
  try {
    await listen(LOCALSEND_EVENTS.transferComplete, (event) => {
      log("LocalSend transfer complete:", event.payload);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.transferComplete,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend transfer complete listener registered");
  } catch (error) {
    log("Failed to setup LocalSend transfer complete listener:", error);
  }

  // Listen for transfer failed events
  try {
    await listen(LOCALSEND_EVENTS.transferFailed, (event) => {
      log("LocalSend transfer failed:", event.payload);
      if (event.payload) {
        onEvent({
          type: LOCALSEND_EVENTS.transferFailed,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    log("LocalSend transfer failed listener registered");
  } catch (error) {
    log("Failed to setup LocalSend transfer failed listener:", error);
  }
}

/**
 * Initialize in iframe mode
 */
export async function initIframeMode(
  ctx: ClientContext,
  log: LogFn,
  messageHandler: (event: MessageEvent) => void,
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
): Promise<{ context: ApplicationContext }> {
  // Verify we're in an iframe
  if (!isInIframe()) {
    throw new HaexVaultSdkError(ErrorCode.NOT_IN_IFRAME, "errors.not_in_iframe");
  }

  // Setup message listener
  ctx.handlers.messageHandler = messageHandler;
  window.addEventListener("message", messageHandler);

  ctx.state.isNativeWindow = false;
  ctx.state.initialized = true;
  log("HaexVault SDK initialized in iframe mode");

  // Load extension info from manifest if provided
  if (ctx.config.manifest) {
    ctx.state.extensionInfo = {
      publicKey: ctx.config.manifest.publicKey,
      name: ctx.config.manifest.name,
      version: ctx.config.manifest.version,
      displayName: ctx.config.manifest.name,
    };
    log("Extension info loaded from manifest:", ctx.state.extensionInfo);
  }

  // Send debug info in debug mode
  sendDebugInfo(ctx.config);

  // Request context - this also acts as a handshake
  const context = await request<ApplicationContext>(EXTENSION_COMMANDS.getContext);
  ctx.state.context = context;
  log("Application context received:", context);

  return { context };
}

/**
 * Send debug info to parent window (development only)
 */
function sendDebugInfo(config: ClientConfig): void {
  if (!config.debug) return;
  if (typeof window === "undefined" || !window.parent) return;

  const debugInfo = `SDK Debug:\nwindow.parent exists: ${!!window.parent}\nwindow.parent === window: ${window.parent === window}\nwindow.self === window.top: ${window.self === window.top}`;

  try {
    window.parent.postMessage({
      type: HAEXSPACE_MESSAGE_TYPES.DEBUG,
      data: debugInfo,
    }, "*");
  } catch (e) {
    // Fallback to alert only in debug mode
    alert(debugInfo + `\npostMessage error: ${e}`);
  }
}
