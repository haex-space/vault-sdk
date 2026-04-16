/**
 * Transport Module
 *
 * Functions for sending requests via different transport mechanisms:
 * - postMessage (iframe mode)
 * - Tauri invoke (native WebView mode)
 */

import { ErrorCode, HaexVaultSdkError } from "../types";
import type { HaexHubRequest, ExtensionInfo } from "../types";
import type { ClientConfig, PendingRequest, LogFn } from "./context";

/**
 * Generate a unique request ID
 */
export function generateRequestId(counter: number): string {
  return `req_${counter}`;
}

/**
 * Send a request to the main window over the dedicated MessagePort (iframe
 * mode, since SDK 3.0).
 *
 * The port is established during the PORT_INIT handshake in `initIframeMode`.
 * Without a port the SDK is not yet connected to the host and requests must
 * fail fast rather than sit in `pendingRequests` waiting for a response that
 * can never arrive.
 */
export function sendPostMessage<T>(
  method: string,
  params: Record<string, unknown>,
  requestId: string,
  config: ClientConfig,
  extensionInfo: ExtensionInfo | null,
  pendingRequests: Map<string, PendingRequest>,
  port: MessagePort | null
): Promise<T> {
  if (!port) {
    return Promise.reject(
      new HaexVaultSdkError(
        ErrorCode.EXTENSION_NOT_INITIALIZED,
        "errors.port_not_connected"
      )
    );
  }

  const request: HaexHubRequest = {
    method,
    params,
    timestamp: Date.now(),
  };

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(
        new HaexVaultSdkError(ErrorCode.TIMEOUT, "errors.timeout", {
          timeout: config.timeout,
        })
      );
    }, config.timeout);

    pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timeout });

    if (config.debug) {
      console.log("[SDK Debug] ========== Sending Request ==========");
      console.log("[SDK Debug] Request ID:", requestId);
      console.log("[SDK Debug] Method:", request.method);
      console.log("[SDK Debug] Params:", request.params);
      console.log("[SDK Debug] Transport: MessagePort");
      console.log("[SDK Debug] Extension info:", extensionInfo);
      console.log("[SDK Debug] ========================================");
    }

    port.postMessage({ id: requestId, ...request });
  });
}

/**
 * Send a request via Tauri invoke (native WebView mode)
 *
 * Uses unified command names - method name is the command name.
 */
export async function sendInvoke<T>(
  method: string,
  params: Record<string, unknown>,
  config: ClientConfig,
  _log: LogFn
): Promise<T> {
  const { invoke } = (window as unknown as { __TAURI__: { core: { invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R> } } }).__TAURI__.core;

  if (config.debug) {
    console.log("[SDK Debug] ========== Invoke Request ==========");
    console.log("[SDK Debug] Command:", method);
    console.log("[SDK Debug] Params:", params);
    console.log("[SDK Debug] =======================================");
  }

  // Direct invoke - unified command names mean method === command
  return invoke<T>(method, params);
}

/**
 * Handle a response for a pending request
 */
export function handlePendingResponse(
  requestId: string,
  result: unknown,
  error: unknown,
  pendingRequests: Map<string, PendingRequest>,
  debug: boolean
): boolean {
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    if (debug) {
      console.warn(
        "[SDK Debug] ⚠️ Received response for unknown request ID:",
        requestId
      );
      console.warn(
        "[SDK Debug] Known IDs:",
        Array.from(pendingRequests.keys())
      );
    }
    return false;
  }

  clearTimeout(pending.timeout);
  pendingRequests.delete(requestId);

  if (error) {
    if (debug) {
      console.error("[SDK Debug] ❌ Request failed:", error);
    }
    pending.reject(error);
  } else {
    if (debug) {
      console.log("[SDK Debug] ✅ Request succeeded:", result);
    }
    pending.resolve(result);
  }

  return true;
}
