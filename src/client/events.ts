/**
 * Event Handling Module
 *
 * Functions for handling messages and events from the parent window (iframe mode)
 * or from Tauri events (native mode).
 */

import { HAEXTENSION_EVENTS, EXTERNAL_EVENTS } from "../events";
import type {
  HaexHubResponse,
  HaexHubEvent,
  EventCallback,
  ContextChangedEvent,
  ExternalRequestEvent,
  ApplicationContext,
} from "../types";
import type { ClientConfig, PendingRequest, LogFn } from "./context";

/**
 * Create a message handler for iframe mode
 */
export function createMessageHandler(
  config: ClientConfig,
  pendingRequests: Map<string, PendingRequest>,
  extensionInfo: () => unknown,
  onEvent: (event: HaexHubEvent) => void
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (config.debug) {
      console.log("[SDK Debug] ========== Message Received ==========");
      console.log("[SDK Debug] Event origin:", event.origin);
      console.log(
        "[SDK Debug] Event source:",
        event.source === window.parent ? "parent window" : "unknown"
      );
      console.log("[SDK Debug] Event data:", event.data);
      console.log("[SDK Debug] Extension info loaded:", !!extensionInfo());
      console.log(
        "[SDK Debug] Pending requests count:",
        pendingRequests.size
      );
    }

    // Verify message comes from parent window
    if (event.source !== window.parent) {
      if (config.debug) {
        console.error("[SDK Debug] ❌ REJECTED: Message not from parent window!");
      }
      return;
    }

    const data = event.data as HaexHubResponse | HaexHubEvent;

    // Handle pending request responses
    if ("id" in data && pendingRequests.has(data.id)) {
      if (config.debug) {
        console.log("[SDK Debug] ✅ Found pending request for ID:", data.id);
      }
      const pending = pendingRequests.get(data.id)!;
      clearTimeout(pending.timeout);
      pendingRequests.delete(data.id);

      if (data.error) {
        if (config.debug) {
          console.error("[SDK Debug] ❌ Request failed:", data.error);
        }
        pending.reject(data.error);
      } else {
        if (config.debug) {
          console.log("[SDK Debug] ✅ Request succeeded:", data.result);
        }
        pending.resolve(data.result);
      }
      return;
    }

    // Warn about unknown request IDs
    if ("id" in data && !pendingRequests.has(data.id)) {
      if (config.debug) {
        console.warn(
          "[SDK Debug] ⚠️ Received response for unknown request ID:",
          data.id
        );
        console.warn(
          "[SDK Debug] Known IDs:",
          Array.from(pendingRequests.keys())
        );
      }
    }

    // Handle events
    if ("type" in data && data.type) {
      if (config.debug) {
        console.log("[SDK Debug] Event received:", data.type);
      }
      onEvent(data as HaexHubEvent);
    }

    if (config.debug) {
      console.log("[SDK Debug] ========== End Message ==========");
    }
  };
}

/**
 * Process an incoming event
 */
export function processEvent(
  event: HaexHubEvent,
  log: LogFn,
  eventListeners: Map<string, Set<EventCallback>>,
  onContextChanged: (context: ApplicationContext) => void,
  onExternalRequest: (event: ExternalRequestEvent) => void
): void {
  // Handle context changes
  if (event.type === HAEXTENSION_EVENTS.CONTEXT_CHANGED) {
    const contextEvent = event as ContextChangedEvent;
    onContextChanged(contextEvent.data.context);
    log("Context updated:", contextEvent.data.context);
  }

  // Handle external requests from authorized clients
  if (event.type === EXTERNAL_EVENTS.REQUEST) {
    const externalEvent = event as ExternalRequestEvent;
    onExternalRequest(externalEvent);
    return; // Don't emit to regular event listeners
  }

  // Emit to registered listeners
  emitEvent(event, log, eventListeners);
}

/**
 * Emit an event to registered listeners
 */
export function emitEvent(
  event: HaexHubEvent,
  log: LogFn,
  eventListeners: Map<string, Set<EventCallback>>
): void {
  log("Event received:", event);
  const listeners = eventListeners.get(event.type);
  if (listeners) {
    listeners.forEach((callback) => callback(event));
  }
}

/**
 * Register an event listener
 */
export function addEventListener(
  eventType: string,
  callback: EventCallback,
  eventListeners: Map<string, Set<EventCallback>>
): void {
  if (!eventListeners.has(eventType)) {
    eventListeners.set(eventType, new Set());
  }
  eventListeners.get(eventType)!.add(callback);
}

/**
 * Remove an event listener
 */
export function removeEventListener(
  eventType: string,
  callback: EventCallback,
  eventListeners: Map<string, Set<EventCallback>>
): void {
  const listeners = eventListeners.get(eventType);
  if (listeners) {
    listeners.delete(callback);
  }
}

/**
 * Notify all reactive subscribers
 */
export function notifySubscribers(subscribers: Set<() => void>): void {
  subscribers.forEach((callback) => callback());
}
