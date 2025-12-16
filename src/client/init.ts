/**
 * Client Initialization
 *
 * Functions for initializing the client in different modes:
 * - Native WebView mode (Tauri)
 * - IFrame mode (mobile/web)
 */

import { HAEXTENSION_EVENTS, EXTERNAL_EVENTS } from "../events";
import { HAEXTENSION_METHODS } from "../methods";
import { HAEXSPACE_MESSAGE_TYPES } from "../messages";
import { ErrorCode, HaexVaultSdkError } from "../types";
import type { ExtensionInfo, ApplicationContext, HaexHubEvent } from "../types";
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
  const extensionInfo = await invoke<ExtensionInfo>("webview_extension_get_info");
  const context = await invoke<ApplicationContext>("webview_extension_context_get");

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

  console.log("[HaexVault SDK] Setting up Tauri event listener for:", HAEXTENSION_EVENTS.CONTEXT_CHANGED);

  // Listen for context changes
  try {
    await listen(HAEXTENSION_EVENTS.CONTEXT_CHANGED, (event) => {
      console.log("[HaexVault SDK] Received Tauri event:", HAEXTENSION_EVENTS.CONTEXT_CHANGED, event);
      log("Received context change event:", event);

      const payload = event.payload as { context?: ApplicationContext };
      if (payload?.context) {
        ctx.state.context = payload.context;
        console.log("[HaexVault SDK] Updated context to:", ctx.state.context);
        onContextChange(payload.context);
        onEvent({
          type: HAEXTENSION_EVENTS.CONTEXT_CHANGED,
          data: { context: ctx.state.context },
          timestamp: Date.now(),
        });
      } else {
        console.warn("[HaexVault SDK] Event received but no context in payload:", event);
      }
    });
    console.log("[HaexVault SDK] Context change listener registered successfully");
  } catch (error) {
    console.error("[HaexVault SDK] Failed to setup context change listener:", error);
    log("Failed to setup context change listener:", error);
  }

  // Listen for external requests
  try {
    await listen(EXTERNAL_EVENTS.REQUEST, (event) => {
      log("Received external request event:", event);
      if (event.payload) {
        onEvent({
          type: EXTERNAL_EVENTS.REQUEST,
          data: event.payload,
          timestamp: Date.now(),
        });
      }
    });
    console.log("[HaexVault SDK] External request listener registered successfully");
  } catch (error) {
    console.error("[HaexVault SDK] Failed to setup external request listener:", error);
    log("Failed to setup external request listener:", error);
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
  const context = await request<ApplicationContext>(HAEXTENSION_METHODS.context.get);
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
