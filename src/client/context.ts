/**
 * Client Context
 *
 * Defines the shared state and configuration interfaces used across client modules.
 * This enables dependency injection and makes modules testable.
 */

import type {
  HaexHubConfig,
  ExtensionInfo,
  ApplicationContext,
  EventCallback,
} from "../types";
import type { ExternalRequestHandler } from "../types/external";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

/**
 * Pending request tracking
 */
export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Client configuration (resolved with defaults)
 */
export type ClientConfig = Required<Omit<HaexHubConfig, "manifest">> & {
  manifest?: HaexHubConfig["manifest"];
};

/**
 * Mutable client state
 */
export interface ClientState {
  initialized: boolean;
  isNativeWindow: boolean;
  requestCounter: number;
  setupCompleted: boolean;
  extensionInfo: ExtensionInfo | null;
  context: ApplicationContext | null;
  orm: SqliteRemoteDatabase<Record<string, unknown>> | null;
}

/**
 * Client collections (Maps and Sets)
 */
export interface ClientCollections {
  pendingRequests: Map<string, PendingRequest>;
  eventListeners: Map<string, Set<EventCallback>>;
  externalRequestHandlers: Map<string, ExternalRequestHandler>;
  reactiveSubscribers: Set<() => void>;
}

/**
 * Promises for async initialization
 */
export interface ClientPromises {
  readyPromise: Promise<void>;
  resolveReady: () => void;
  setupPromise: Promise<void> | null;
  setupHook: (() => Promise<void>) | null;
}

/**
 * Message handler reference (for cleanup). The SDK holds the actual
 * `MessagePort` in iframe mode as a private field on the client class —
 * it is returned from `initIframeMode` rather than carried here, because
 * the context object is constructed inline per init call.
 */
export interface ClientHandlers {
  messageHandler: ((event: MessageEvent) => void) | null;
}

/**
 * Full client context - everything modules need to access
 */
export interface ClientContext {
  config: ClientConfig;
  state: ClientState;
  collections: ClientCollections;
  promises: ClientPromises;
  handlers: ClientHandlers;
}

/**
 * Logger function type
 */
export type LogFn = (...args: unknown[]) => void;

/**
 * Create initial client state
 */
export function createInitialState(): ClientState {
  return {
    initialized: false,
    isNativeWindow: false,
    requestCounter: 0,
    setupCompleted: false,
    extensionInfo: null,
    context: null,
    orm: null,
  };
}

/**
 * Create initial client collections
 */
export function createInitialCollections(): ClientCollections {
  return {
    pendingRequests: new Map(),
    eventListeners: new Map(),
    externalRequestHandlers: new Map(),
    reactiveSubscribers: new Set(),
  };
}

/**
 * Create initial client handlers
 */
export function createInitialHandlers(): ClientHandlers {
  return {
    messageHandler: null,
  };
}

/**
 * Create a log function bound to config
 */
export function createLogger(config: ClientConfig): LogFn {
  return (...args: unknown[]) => {
    if (config.debug) {
      console.log("[HaexSpace SDK]", ...args);
    }
  };
}
