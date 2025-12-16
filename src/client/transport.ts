/**
 * Transport Module
 *
 * Functions for sending requests via different transport mechanisms:
 * - postMessage (iframe mode)
 * - Tauri invoke (native WebView mode)
 */

import { ErrorCode, HaexVaultSdkError } from "../types";
import type { HaexHubRequest, ExtensionInfo } from "../types";
import { allHandlers } from "../transport/handlers";
import type { ClientConfig, PendingRequest, LogFn } from "./context";

/**
 * Generate a unique request ID
 */
export function generateRequestId(counter: number): string {
  return `req_${counter}`;
}

/**
 * Send a request via postMessage (iframe mode)
 */
export function sendPostMessage<T>(
  method: string,
  params: Record<string, unknown>,
  requestId: string,
  config: ClientConfig,
  extensionInfo: ExtensionInfo | null,
  pendingRequests: Map<string, PendingRequest>
): Promise<T> {
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

    pendingRequests.set(requestId, { resolve, reject, timeout });

    // Use wildcard origin since extensions are sandboxed in their own protocol
    const targetOrigin = "*";

    if (config.debug) {
      console.log("[SDK Debug] ========== Sending Request ==========");
      console.log("[SDK Debug] Request ID:", requestId);
      console.log("[SDK Debug] Method:", request.method);
      console.log("[SDK Debug] Params:", request.params);
      console.log("[SDK Debug] Target origin:", targetOrigin);
      console.log("[SDK Debug] Extension info:", extensionInfo);
      console.log("[SDK Debug] ========================================");
    }

    window.parent.postMessage({ id: requestId, ...request }, targetOrigin);
  });
}

/**
 * Send a request via Tauri invoke (native WebView mode)
 */
export async function sendInvoke<T>(
  method: string,
  params: Record<string, unknown>,
  config: ClientConfig,
  log: LogFn
): Promise<T> {
  const { invoke } = (window as unknown as { __TAURI__: { core: { invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R> } } }).__TAURI__.core;

  if (config.debug) {
    console.log("[SDK Debug] ========== Invoke Request ==========");
    console.log("[SDK Debug] Method:", method);
    console.log("[SDK Debug] Params:", params);
    console.log("[SDK Debug] =======================================");
  }

  // Look up handler for this method
  const handler = allHandlers[method];

  if (handler) {
    const args = handler.args(params);
    console.log("[SDK Debug] Handler found for method:", method);
    console.log("[SDK Debug] Handler command:", handler.command);
    console.log("[SDK Debug] Transformed args:", JSON.stringify(args, null, 2));
    return invoke<T>(handler.command, args);
  }

  // Method not found in handlers
  throw new HaexVaultSdkError(
    ErrorCode.METHOD_NOT_FOUND,
    "errors.method_not_found",
    { method }
  );
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
