/**
 * External Request Handling Module
 *
 * Functions for handling external requests from authorized clients
 * (browser extensions, CLI tools, servers, etc.)
 */

import type {
  ExternalRequest,
  ExternalResponse,
  ExternalRequestHandler,
} from "../types/external";
import type { LogFn } from "./context";
import { EXTERNAL_BRIDGE_COMMANDS } from "../commands/externalBridge";

/**
 * Request function type
 */
type RequestFn = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;

/**
 * Register an external request handler
 *
 * @param action The action/method name to handle
 * @param handler The handler function
 * @param handlers The handlers map
 * @param log Logger function
 * @returns Unsubscribe function
 */
export function registerExternalHandler(
  action: string,
  handler: ExternalRequestHandler,
  handlers: Map<string, ExternalRequestHandler>,
  log: LogFn
): () => void {
  handlers.set(action, handler);
  log(`[ExternalRequest] Registered handler for action: ${action}`);

  return () => {
    handlers.delete(action);
    log(`[ExternalRequest] Unregistered handler for action: ${action}`);
  };
}

/**
 * Handle an incoming external request
 *
 * @param request The external request
 * @param handlers The handlers map
 * @param respond Function to send response
 * @param log Logger function
 */
export async function handleExternalRequest(
  request: ExternalRequest,
  handlers: Map<string, ExternalRequestHandler>,
  respond: (response: ExternalResponse) => Promise<void>,
  log: LogFn
): Promise<void> {
  console.log("[SDK Debug] handleExternalRequest called!");
  console.log("[SDK Debug] Request:", JSON.stringify(request, null, 2));
  console.log("[SDK Debug] Available handlers:", Array.from(handlers.keys()));
  log(`[ExternalRequest] Received request: ${request.action} from ${request.publicKey.substring(0, 20)}...`);

  const handler = handlers.get(request.action);

  if (!handler) {
    log(`[ExternalRequest] No handler for action: ${request.action}`);
    await respond({
      requestId: request.requestId,
      success: false,
      error: `No handler registered for action: ${request.action}`,
    });
    return;
  }

  try {
    const response = await handler(request);
    await respond(response);
    log(`[ExternalRequest] Response sent for: ${request.action}`);
  } catch (error) {
    log(`[ExternalRequest] Handler error:`, error);
    await respond({
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Send an external response back to haex-vault
 *
 * @param response The response to send
 * @param request The request function
 */
export async function respondToExternalRequest(
  response: ExternalResponse,
  request: RequestFn
): Promise<void> {
  console.log("[SDK Debug] respondToExternalRequest called with:", JSON.stringify(response, null, 2));
  await request(EXTERNAL_BRIDGE_COMMANDS.respond, response as unknown as Record<string, unknown>);
}
