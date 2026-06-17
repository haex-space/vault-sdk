/**
 * Client Initialization
 *
 * Functions for initializing the client in different modes:
 * - Native WebView mode (Tauri)
 * - IFrame mode (mobile/web)
 */

import { HAEXTENSION_EVENTS, EXTERNAL_EVENTS, SHELL_EVENTS, NOTIFICATION_EVENTS } from "../events";
import { EXTENSION_COMMANDS } from "../commands";
import { HAEXSPACE_MESSAGE_TYPES } from "../messages";
import { ErrorCode, HaexVaultSdkError } from "../types";
import type { ExtensionInfo, ApplicationContext, HaexHubEvent } from "../types";
import { LOCALSEND_EVENTS } from "../api/localsend";
import type { ClientContext, ClientConfig, LogFn } from "./context";

/**
 * Timeout for the main-window → iframe port handshake.
 *
 * The main window sends the port on iframe `load`. If we haven't received a
 * port after this timeout, either the host is not Haex Vault or the iframe
 * got orphaned — `ready()` will reject and extensions can surface a clear
 * error to the user instead of hanging forever on pending requests.
 */
const PORT_HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * Tauri API types
 */
interface TauriInvoke {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

/**
 * Tauri v2 listen() options.
 *
 * `target` pins which emits this listener will match. We have to set
 * an explicit AnyLabel/Webview target because Tauri 2.11 production
 * builds do NOT deliver `emit_to(label, …)` events to listeners that
 * registered with the default `{ kind: 'Any' }` target — the regression
 * silently broke the haex-pass external-bridge flow and every other
 * extension that relied on label-targeted emits from haex-vault.
 *
 * Passing a string is shorthand for `{ kind: 'AnyLabel', label }`.
 */
type TauriEventTarget =
  | string
  | { kind: "Any" }
  | { kind: "AnyLabel"; label: string }
  | { kind: "App" }
  | { kind: "Window"; label: string }
  | { kind: "Webview"; label: string }
  | { kind: "WebviewWindow"; label: string };

interface TauriListenOptions {
  target?: TauriEventTarget;
}

interface TauriEvent {
  listen: (
    event: string,
    handler: (event: { payload: unknown }) => void,
    options?: TauriListenOptions
  ) => Promise<() => void>;
}

/**
 * Read the current webview's label from Tauri internals. Used as the
 * `target` for listen() so events emitted via emit_to(label, …) reach
 * us (default `{ kind: 'Any' }` would be silently dropped).
 *
 * Falls back to undefined if the metadata is missing (e.g. very early
 * boot before Tauri injects internals) — caller should treat that as
 * "register without target" and accept the same drop risk.
 */
function getCurrentWebviewLabel(): string | undefined {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } };
  }).__TAURI_INTERNALS__;
  return internals?.metadata?.currentWebview?.label;
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
 * Shapes a raw Tauri event payload into the extra fields of a HaexHubEvent.
 * Default behaviour places the payload under `data`; legacy events that
 * flatten specific fields onto the event object provide their own shaper.
 */
type EventShaper = (payload: unknown) => Record<string, unknown>;

/**
 * Register a single Tauri listener that forwards the event onto the SDK event
 * bus via `onEvent`. Centralizes the previously copy-pasted
 * try / listen / onEvent({ type, data, timestamp }) / catch boilerplate so
 * every host event is registered and emitted the same way.
 */
async function forwardEvent(
  listen: TauriEvent["listen"],
  log: LogFn,
  onEvent: (event: HaexHubEvent) => void,
  listenOptions: TauriListenOptions | undefined,
  eventName: string,
  shape?: EventShaper
): Promise<void> {
  try {
    await listen(eventName, (event) => {
      if (event.payload == null) {
        log(`Event '${eventName}' received with no payload`);
        return;
      }
      const extra = shape ? shape(event.payload) : { data: event.payload };
      onEvent({ type: eventName, timestamp: Date.now(), ...extra } as HaexHubEvent);
    }, listenOptions);
    log(`Listener registered: ${eventName}`);
  } catch (error) {
    log(`Failed to register listener '${eventName}':`, error);
  }
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

  // Pin every listener below to this webview's own label. Tauri 2.11
  // routes emit_to(label, …) events only to listeners with a matching
  // AnyLabel/Webview target — registering with the default `{ kind: 'Any' }`
  // would silently drop the host's label-scoped emits.
  const webviewLabel = getCurrentWebviewLabel();
  const listenOptions: TauriListenOptions | undefined = webviewLabel
    ? { target: webviewLabel }
    : undefined;
  if (!webviewLabel) {
    log(
      "WARNING: could not read __TAURI_INTERNALS__.metadata.currentWebview.label — "
        + "registering listeners without a target. Label-scoped emits from the host "
        + "will not be delivered until the metadata is available.",
    );
  }

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
    }, listenOptions);
    log("Context change listener registered successfully");
  } catch (error) {
    log("Failed to setup context change listener:", error);
  }

  // All remaining host events are forwarded 1:1 onto the SDK event bus.
  // Most carry their payload under `data`; the few legacy events that flatten
  // specific fields onto the event object pass a shaper to reproduce that.

  // Standard "{ data: payload }" events.
  for (const eventName of [
    HAEXTENSION_EVENTS.PERMISSION_RESOLVED,
    EXTERNAL_EVENTS.REQUEST,
    EXTERNAL_EVENTS.ACTION_REQUEST,
    NOTIFICATION_EVENTS.CLICK,
    ...Object.values(LOCALSEND_EVENTS),
  ]) {
    await forwardEvent(listen, log, onEvent, listenOptions, eventName);
  }

  // Sync event nests its payload as { tables }.
  await forwardEvent(listen, log, onEvent, listenOptions, HAEXTENSION_EVENTS.SYNC_TABLES_UPDATED, (payload) => ({
    data: { tables: (payload as { tables: string[] }).tables },
  }));

  // Legacy events that flatten fields directly onto the event object.
  await forwardEvent(listen, log, onEvent, listenOptions, HAEXTENSION_EVENTS.FILE_CHANGED, (payload) => {
    const { ruleId, changeType, path } = payload as { ruleId: string; changeType: string; path?: string };
    return { ruleId, changeType, path };
  });
  await forwardEvent(listen, log, onEvent, listenOptions, SHELL_EVENTS.OUTPUT, (payload) => {
    const { sessionId, data } = payload as { sessionId: string; data: string };
    return { sessionId, data };
  });
  await forwardEvent(listen, log, onEvent, listenOptions, SHELL_EVENTS.EXIT, (payload) => {
    const { sessionId, exitCode } = payload as { sessionId: string; exitCode: number | null };
    return { sessionId, exitCode };
  });
}

/**
 * Initialize in iframe mode.
 *
 * Handshake flow (since SDK 3.0):
 *   1. Install a one-shot `message` listener on `window` that filters for
 *      `HAEXSPACE_MESSAGE_TYPES.PORT_INIT`. This is the *only* message we
 *      ever accept on the window listener.
 *   2. Main window sends the `MessagePort` via `iframe.contentWindow.postMessage(
 *      { type: PORT_INIT }, "*", [port2])` once the iframe has loaded.
 *   3. On receipt, switch to port-based messaging — attach the real message
 *      handler to the port, remove the window listener, send a
 *      `PORT_READY` back on the port so main can flush any events buffered
 *      during the handshake.
 *   4. Load manifest-derived extension info and return the port. Fetching
 *      the application context is the caller's responsibility.
 *
 * If the handshake doesn't complete within `PORT_HANDSHAKE_TIMEOUT_MS`, the
 * promise rejects so extensions can surface a clear error instead of hanging
 * on `sdk.ready()` forever.
 */
export async function initIframeMode(
  ctx: ClientContext,
  log: LogFn,
  messageHandler: (event: MessageEvent) => void,
): Promise<MessagePort> {
  if (!isInIframe()) {
    throw new HaexVaultSdkError(ErrorCode.NOT_IN_IFRAME, "errors.not_in_iframe");
  }

  const port = await waitForHostPortAsync(log);

  ctx.handlers.messageHandler = messageHandler;
  port.addEventListener("message", messageHandler);
  port.start();

  // ACK — main flushes its buffered events once this arrives.
  port.postMessage({ type: HAEXSPACE_MESSAGE_TYPES.PORT_READY });

  ctx.state.isNativeWindow = false;
  ctx.state.initialized = true;
  log("HaexVault SDK initialized in iframe mode (MessagePort transport)");

  if (ctx.config.manifest) {
    ctx.state.extensionInfo = {
      publicKey: ctx.config.manifest.publicKey,
      name: ctx.config.manifest.name,
      version: ctx.config.manifest.version,
      displayName: ctx.config.manifest.displayName ?? ctx.config.manifest.name,
    };
    log("Extension info loaded from manifest:", ctx.state.extensionInfo);
  }

  sendDebugInfo(ctx.config);

  return port;
}

/**
 * Wait for the main window to transfer a `MessagePort` via PORT_INIT.
 *
 * Installed as a single window-level listener. It filters strictly on the
 * PORT_INIT type so unrelated postMessage traffic (e.g. dev-tools, browser
 * extensions injecting scripts) cannot resolve the handshake with a fake port.
 */
function waitForHostPortAsync(log: LogFn): Promise<MessagePort> {
  return new Promise<MessagePort>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handler);
    };

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new HaexVaultSdkError(
          ErrorCode.TIMEOUT,
          "errors.port_handshake_timeout",
          { timeout: PORT_HANDSHAKE_TIMEOUT_MS }
        )
      );
    }, PORT_HANDSHAKE_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (type !== HAEXSPACE_MESSAGE_TYPES.PORT_INIT) return;

      const port = event.ports[0];
      if (!port) {
        log("PORT_INIT received but event.ports is empty — ignoring");
        return;
      }

      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(port);
    };

    window.addEventListener("message", handler);
  });
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
