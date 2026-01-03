/**
 * HaexVault Client
 *
 * Main SDK client for extensions running in HaexVault.
 * Supports both native WebView mode (Tauri) and iframe mode (mobile/web).
 */

import type {
  HaexHubConfig,
  HaexHubEvent,
  EventCallback,
  PermissionResponse,
  DatabasePermissionRequest,
  ExtensionInfo,
  ApplicationContext,
  SearchResult,
  MigrationResult,
  Migration,
  ExternalResponse,
  ExternalRequestHandler,
} from "./types";
import { DEFAULT_TIMEOUT } from "./types";
import { StorageAPI } from "./api/storage";
import { DatabaseAPI } from "./api/database";
import { FilesystemAPI } from "./api/filesystem";
import { WebAPI } from "./api/web";
import { PermissionsAPI } from "./api/permissions";
import { RemoteStorageAPI } from "./api/remoteStorage";
import { LocalSendAPI } from "./api/localsend";
import { installConsoleForwarding } from "./polyfills/consoleForwarding";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

// Client modules
import type { ClientConfig, PendingRequest } from "./client/context";
import {
  getExtensionTableName,
  getDependencyTableName as getDependencyTableNameFn,
  parseTableName as parseTableNameFn,
} from "./client/tableName";
import { isInIframe, hasTauri, initNativeMode, initIframeMode } from "./client/init";
import { sendPostMessage, sendInvoke, generateRequestId } from "./client/transport";
import {
  createMessageHandler,
  processEvent,
  addEventListener,
  removeEventListener,
  notifySubscribers,
} from "./client/events";
import { createDrizzleInstance, queryRaw, executeRaw } from "./client/database";
import { registerExternalHandler, handleExternalRequest, respondToExternalRequest } from "./client/external";

export class HaexVaultSdk {
  // Configuration
  private readonly config: ClientConfig;

  // State
  private initialized = false;
  private isNativeWindow = false;
  private requestCounter = 0;
  private _extensionInfo: ExtensionInfo | null = null;
  private _context: ApplicationContext | null = null;
  private _setupCompleted = false;

  // Collections
  private readonly pendingRequests: Map<string, PendingRequest> = new Map();
  private readonly eventListeners: Map<string, Set<EventCallback>> = new Map();
  private readonly externalRequestHandlers: Map<string, ExternalRequestHandler> = new Map();
  private readonly reactiveSubscribers: Set<() => void> = new Set();

  // Handlers
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  // Promises
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private setupPromise: Promise<void> | null = null;
  private setupHook: (() => Promise<void>) | null = null;

  // Public APIs
  public orm: SqliteRemoteDatabase<Record<string, unknown>> | null = null;
  public readonly storage: StorageAPI;
  public readonly database: DatabaseAPI;
  public readonly filesystem: FilesystemAPI;
  public readonly web: WebAPI;
  public readonly permissions: PermissionsAPI;
  public readonly remoteStorage: RemoteStorageAPI;
  public readonly localsend: LocalSendAPI;

  constructor(config: HaexHubConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      manifest: config.manifest,
    };

    this.storage = new StorageAPI(this);
    this.database = new DatabaseAPI(this);
    this.filesystem = new FilesystemAPI(this);
    this.web = new WebAPI(this);
    this.permissions = new PermissionsAPI(this);
    this.remoteStorage = new RemoteStorageAPI(this);
    this.localsend = new LocalSendAPI(this);

    installConsoleForwarding(this.config.debug);

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.init();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  public async ready(): Promise<void> {
    return this.readyPromise;
  }

  public get setupCompleted(): boolean {
    return this._setupCompleted;
  }

  public onSetup(setupFn: () => Promise<void>): void {
    if (this.setupHook) {
      throw new Error("Setup hook already registered");
    }
    this.setupHook = setupFn;
  }

  public async setupComplete(): Promise<void> {
    await this.readyPromise;

    if (!this.setupHook || this.setupCompleted) {
      return;
    }

    if (!this.setupPromise) {
      this.setupPromise = this.runSetupAsync();
    }

    return this.setupPromise;
  }

  public destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
    }

    this.pendingRequests.forEach(({ timeout }) => clearTimeout(timeout));
    this.pendingRequests.clear();
    this.eventListeners.clear();

    this.initialized = false;
    this.log("HaexVault SDK destroyed");
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  public get extensionInfo(): ExtensionInfo | null {
    return this._extensionInfo;
  }

  public get context(): ApplicationContext | null {
    return this._context;
  }

  // ==========================================================================
  // Subscriptions
  // ==========================================================================

  public subscribe(callback: () => void): () => void {
    this.reactiveSubscribers.add(callback);
    return () => {
      this.reactiveSubscribers.delete(callback);
    };
  }

  // ==========================================================================
  // Table Name Utilities
  // ==========================================================================

  public getTableName(tableName: string): string {
    return getExtensionTableName(this._extensionInfo, tableName);
  }

  public getDependencyTableName(publicKey: string, extensionName: string, tableName: string): string {
    return getDependencyTableNameFn(publicKey, extensionName, tableName);
  }

  public parseTableName(fullTableName: string): { publicKey: string; extensionName: string; tableName: string } | null {
    return parseTableNameFn(fullTableName);
  }

  // ==========================================================================
  // Database
  // ==========================================================================

  public initializeDatabase<T extends Record<string, unknown>>(schema: T): SqliteRemoteDatabase<T> {
    const db = createDrizzleInstance(schema, this._extensionInfo, this.request.bind(this), this.log.bind(this));
    this.orm = db as SqliteRemoteDatabase<Record<string, unknown>>;
    return db;
  }

  public async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return queryRaw<T>(sql, params, this.request.bind(this), this.config.debug);
  }

  public async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  public async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    return executeRaw(sql, params, this.request.bind(this));
  }

  public async registerMigrationsAsync(extensionVersion: string, migrations: Migration[]): Promise<MigrationResult> {
    return this.database.registerMigrationsAsync(extensionVersion, migrations);
  }

  // ==========================================================================
  // Dependencies
  // ==========================================================================

  public async getDependencies(): Promise<ExtensionInfo[]> {
    return this.request<ExtensionInfo[]>("extensions.getDependencies");
  }

  // ==========================================================================
  // Permissions
  // ==========================================================================

  public async requestDatabasePermission(request: DatabasePermissionRequest): Promise<PermissionResponse> {
    return this.request<PermissionResponse>("permissions.database.request", {
      resource: request.resource,
      operation: request.operation,
      reason: request.reason,
    });
  }

  public async checkDatabasePermission(resource: string, operation: "read" | "write"): Promise<boolean> {
    const response = await this.request<PermissionResponse>("permissions.database.check", { resource, operation });
    return response.status === "granted";
  }

  // ==========================================================================
  // Search
  // ==========================================================================

  public async respondToSearch(requestId: string, results: SearchResult[]): Promise<void> {
    await this.request("search.respond", { requestId, results });
  }

  // ==========================================================================
  // External Requests
  // ==========================================================================

  public onExternalRequest(action: string, handler: ExternalRequestHandler): () => void {
    return registerExternalHandler(action, handler, this.externalRequestHandlers, this.log.bind(this));
  }

  public async respondToExternalRequest(response: ExternalResponse): Promise<void> {
    await respondToExternalRequest(response, this.request.bind(this));
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  public on(eventType: string, callback: EventCallback): void {
    addEventListener(eventType, callback, this.eventListeners);
  }

  public off(eventType: string, callback: EventCallback): void {
    removeEventListener(eventType, callback, this.eventListeners);
  }

  // ==========================================================================
  // Communication
  // ==========================================================================

  public async request<T = unknown, P = Record<string, unknown>>(method: string, params?: P): Promise<T> {
    const resolvedParams = (params ?? {}) as Record<string, unknown>;

    if (this.isNativeWindow && hasTauri()) {
      // In native WebView mode, add extension credentials to params
      // These are needed by extension_* commands for permission checks
      // Note: "name" is the standard parameter name used by all extension commands
      const paramsWithCredentials = {
        ...resolvedParams,
        publicKey: this._extensionInfo?.publicKey,
        name: this._extensionInfo?.name,
      };
      return sendInvoke<T>(method, paramsWithCredentials, this.config, this.log.bind(this));
    }

    const requestId = generateRequestId(++this.requestCounter);
    return sendPostMessage<T>(method, resolvedParams, requestId, this.config, this._extensionInfo, this.pendingRequests);
  }

  // ==========================================================================
  // Private: Initialization
  // ==========================================================================

  private async init(): Promise<void> {
    if (this.initialized) return;

    // Check iframe mode FIRST before attempting Tauri calls
    // This prevents hanging on Android where __TAURI__ exists but sandboxed iframes can't access it
    if (!isInIframe() && hasTauri()) {
      try {
        await this.initNative();
        return;
      } catch (error) {
        this.log("Tauri commands failed, falling back to iframe mode", error);
      }
    }

    await this.initIframe();
  }

  private async initNative(): Promise<void> {
    const { extensionInfo, context } = await initNativeMode(
      {
        config: this.config,
        state: {
          initialized: this.initialized,
          isNativeWindow: this.isNativeWindow,
          requestCounter: this.requestCounter,
          setupCompleted: this._setupCompleted,
          extensionInfo: this._extensionInfo,
          context: this._context,
          orm: this.orm,
        },
        collections: {
          pendingRequests: this.pendingRequests,
          eventListeners: this.eventListeners,
          externalRequestHandlers: this.externalRequestHandlers,
          reactiveSubscribers: this.reactiveSubscribers,
        },
        promises: {
          readyPromise: this.readyPromise,
          resolveReady: this.resolveReady,
          setupPromise: this.setupPromise,
          setupHook: this.setupHook,
        },
        handlers: {
          messageHandler: this.messageHandler,
        },
      },
      this.log.bind(this),
      this.handleEvent.bind(this),
      (ctx) => {
        this._context = ctx;
        this.notifySubscribersInternal();
      }
    );

    this._extensionInfo = extensionInfo;
    this._context = context;
    this.isNativeWindow = true;
    this.initialized = true;

    this.notifySubscribersInternal();
    this.resolveReady();
  }

  private async initIframe(): Promise<void> {
    this.messageHandler = createMessageHandler(
      this.config,
      this.pendingRequests,
      () => this._extensionInfo,
      this.handleEvent.bind(this)
    );

    const { context } = await initIframeMode(
      {
        config: this.config,
        state: {
          initialized: this.initialized,
          isNativeWindow: this.isNativeWindow,
          requestCounter: this.requestCounter,
          setupCompleted: this._setupCompleted,
          extensionInfo: this._extensionInfo,
          context: this._context,
          orm: this.orm,
        },
        collections: {
          pendingRequests: this.pendingRequests,
          eventListeners: this.eventListeners,
          externalRequestHandlers: this.externalRequestHandlers,
          reactiveSubscribers: this.reactiveSubscribers,
        },
        promises: {
          readyPromise: this.readyPromise,
          resolveReady: this.resolveReady,
          setupPromise: this.setupPromise,
          setupHook: this.setupHook,
        },
        handlers: {
          messageHandler: this.messageHandler,
        },
      },
      this.log.bind(this),
      this.messageHandler,
      this.request.bind(this)
    );

    // Load extension info from manifest if provided
    if (this.config.manifest) {
      this._extensionInfo = {
        publicKey: this.config.manifest.publicKey,
        name: this.config.manifest.name,
        version: this.config.manifest.version,
        displayName: this.config.manifest.name,
      };
      this.notifySubscribersInternal();
    }

    this._context = context;
    this.isNativeWindow = false;
    this.initialized = true;

    this.notifySubscribersInternal();
    this.resolveReady();
  }

  // ==========================================================================
  // Private: Event Handling
  // ==========================================================================

  private handleEvent(event: HaexHubEvent): void {
    processEvent(
      event,
      this.log.bind(this),
      this.eventListeners,
      (ctx) => {
        this._context = ctx;
        this.notifySubscribersInternal();
      },
      (extEvent) => this.handleExternalRequestInternal(extEvent.data)
    );
  }

  private async handleExternalRequestInternal(request: import("./types").ExternalRequest): Promise<void> {
    await handleExternalRequest(request, this.externalRequestHandlers, this.respondToExternalRequest.bind(this), this.log.bind(this));
  }

  // ==========================================================================
  // Private: Setup
  // ==========================================================================

  private async runSetupAsync(): Promise<void> {
    if (!this.setupHook) return;

    try {
      this.log("[HaexVault] Running setup hook...");
      await this.setupHook();
      this._setupCompleted = true;
      this.log("[HaexVault] Setup completed successfully");
      this.notifySubscribersInternal();
    } catch (error) {
      this.log("[HaexVault] Setup failed:", error);
      throw error;
    }
  }

  // ==========================================================================
  // Private: Utilities
  // ==========================================================================

  private notifySubscribersInternal(): void {
    notifySubscribers(this.reactiveSubscribers);
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[HaexVault SDK]", ...args);
    }
  }
}
