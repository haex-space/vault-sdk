import { HAEXTENSION_EVENTS } from './events';
import { HAEXTENSION_METHODS } from './methods';
import { HAEXSPACE_MESSAGE_TYPES } from './messages';
import type {
  HaexHubRequest,
  HaexHubResponse,
  HaexHubConfig,
  HaexHubEvent,
  EventCallback,
  PermissionResponse,
  DatabasePermissionRequest,
  ExtensionInfo,
  ApplicationContext,
  SearchResult,
  ContextChangedEvent,
  DatabaseQueryResult,
  MigrationResult,
  Migration,
  ExternalRequest,
  ExternalResponse,
  ExternalRequestHandler,
  ExternalRequestEvent,
} from "./types";
import {
  ErrorCode,
  DEFAULT_TIMEOUT,
  TABLE_SEPARATOR,
  HaexHubError,
  getTableName,
} from "./types";
import { StorageAPI } from "./api/storage";
import { DatabaseAPI } from "./api/database";
import { FilesystemAPI } from "./api/filesystem";
import { WebAPI } from "./api/web";
import { PermissionsAPI } from "./api/permissions";
import { installConsoleForwarding } from "./polyfills/consoleForwarding";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

export class HaexVaultClient {
  private config: Required<Omit<HaexHubConfig, "manifest">> & {
    manifest?: HaexHubConfig["manifest"];
  };
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private externalRequestHandlers: Map<string, ExternalRequestHandler> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private initialized = false;
  private requestCounter = 0;
  private _extensionInfo: ExtensionInfo | null = null;
  private _context: ApplicationContext | null = null;
  private reactiveSubscribers: Set<() => void> = new Set();
  private isNativeWindow = false;

  private readyPromise: Promise<void>;
  private resolveReady!: () => void; // Wird im Konstruktor initialisiert

  private setupPromise: Promise<void> | null = null;
  private setupHook: (() => Promise<void>) | null = null;
  private _setupCompleted = false;

  public orm: SqliteRemoteDatabase<Record<string, unknown>> | null = null;
  public readonly storage: StorageAPI;
  public readonly database: DatabaseAPI;
  public readonly filesystem: FilesystemAPI;
  public readonly web: WebAPI;
  public readonly permissions: PermissionsAPI;

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

    // Install console forwarding if in debug mode
    installConsoleForwarding(this.config.debug);

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.init();
  }

  /**
   * Gibt ein Promise zurück, das aufgelöst wird, sobald der Client
   * initialisiert ist und Extension-Infos empfangen hat.
   */
  public async ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Gibt zurück, ob das Setup bereits abgeschlossen wurde.
   */
  public get setupCompleted(): boolean {
    return this._setupCompleted;
  }

  /**
   * Registriert eine Setup-Funktion, die nach der Initialisierung ausgeführt wird.
   * Diese Funktion sollte für Aufgaben wie Tabellenerstellung, Migrationen, etc. verwendet werden.
   * @param setupFn Die Setup-Funktion, die ausgeführt werden soll
   */
  public onSetup(setupFn: () => Promise<void>): void {
    if (this.setupHook) {
      throw new Error('Setup hook already registered');
    }
    this.setupHook = setupFn;
  }

  /**
   * Gibt ein Promise zurück, das aufgelöst wird, sobald der Client vollständig eingerichtet ist.
   * Dies umfasst die Initialisierung UND das Setup (z.B. Tabellenerstellung).
   * Falls kein Setup-Hook registriert wurde, entspricht dies ready().
   */
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

  private async runSetupAsync(): Promise<void> {
    if (!this.setupHook) return;

    try {
      this.log('[HaexSpace] Running setup hook...');
      await this.setupHook();
      this._setupCompleted = true;
      this.log('[HaexSpace] Setup completed successfully');

      // Notify subscribers that setup is complete
      this.notifySubscribers();
    } catch (error) {
      this.log('[HaexSpace] Setup failed:', error);
      throw error;
    }
  }

  /**
   * Initialisiert die Drizzle-Datenbankinstanz.
   * Muss nach der Definition des Schemas aufgerufen werden.
   * @param schema Das Drizzle-Schemaobjekt (mit bereits geprefixten Tabellennamen).
   * @returns Die typsichere Drizzle-Datenbankinstanz.
   */
  public initializeDatabase<T extends Record<string, unknown>>(
    schema: T
  ): SqliteRemoteDatabase<T> {
    if (!this._extensionInfo) {
      throw new HaexHubError(
        ErrorCode.EXTENSION_INFO_UNAVAILABLE,
        "errors.client_not_ready"
      );
    }

    const dbInstance = drizzle<T>(
      async (
        sql: string,
        params: unknown[],
        method: "get" | "run" | "all" | "values"
      ) => {
        try {
          // Drizzle uses different methods:
          // - "run": INSERT/UPDATE/DELETE without RETURNING
          // - "all": INSERT/UPDATE/DELETE with RETURNING, or SELECT
          // - "get": SELECT with LIMIT 1
          // - "values": SELECT returning raw values
          //
          // The backend intelligently handles routing:
          // - method="run" and "all" go to haextension.db.execute
          // - Backend detects SELECT statements and delegates to haextension.db.query
          // - Backend returns rows when RETURNING clause is present

          if (method === "run" || method === "all") {
            const result = await this.request<DatabaseQueryResult>(
              HAEXTENSION_METHODS.database.execute,
              {
                query: sql,
                params: params as unknown[],
              }
            );

            // For method="all", return rows (RETURNING clause or SELECT delegated by backend)
            if (method === "all") {
              return { rows: result.rows || [] };
            }

            // For method="run", check if we have rows (RETURNING clause)
            if (result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
              return { rows: result.rows };
            }

            return result;
          }

          // Read operations (SELECT without RETURNING)
          const result = await this.request<DatabaseQueryResult>(HAEXTENSION_METHODS.database.query, {
            query: sql,
            params: params as unknown[],
          });

          const rows = result.rows as any[];

          if (method === "get") {
            return { rows: rows.length > 0 ? rows.at(0) : undefined };
          }

          return { rows };
        } catch (error) {
          this.log("Database operation failed:", error);
          throw error;
        }
      },
      {
        schema: schema,
        logger: false,
      }
    );

    this.orm = dbInstance;
    return dbInstance;
  }

  public get extensionInfo(): ExtensionInfo | null {
    return this._extensionInfo;
  }

  public get context(): ApplicationContext | null {
    return this._context;
  }

  public subscribe(callback: () => void): () => void {
    this.reactiveSubscribers.add(callback);
    return () => {
      this.reactiveSubscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    this.reactiveSubscribers.forEach((callback) => callback());
  }

  public async getDependencies(): Promise<ExtensionInfo[]> {
    return this.request<ExtensionInfo[]>("extensions.getDependencies");
  }

  public getTableName(tableName: string): string {
    if (!this._extensionInfo) {
      throw new HaexHubError(
        ErrorCode.EXTENSION_INFO_UNAVAILABLE,
        "errors.extension_info_unavailable"
      );
    }

    this.validateTableName(tableName);

    const { publicKey, name } = this._extensionInfo;

    // Return table name wrapped in double quotes to handle special characters (like hyphens in extension names)
    return `"${getTableName(publicKey, name, tableName)}"`;
  }

  public getDependencyTableName(
    publicKey: string,
    extensionName: string,
    tableName: string
  ): string {
    this.validatePublicKey(publicKey);
    this.validateExtensionName(extensionName);
    this.validateTableName(tableName);

    // Return table name wrapped in double quotes to handle special characters
    return `"${getTableName(publicKey, extensionName, tableName)}"`;
  }

  public parseTableName(fullTableName: string): {
    publicKey: string;
    extensionName: string;
    tableName: string;
  } | null {
    // Remove surrounding quotes if present
    let cleanTableName = fullTableName;
    if (cleanTableName.startsWith('"') && cleanTableName.endsWith('"')) {
      cleanTableName = cleanTableName.slice(1, -1);
    }

    const parts = cleanTableName.split(TABLE_SEPARATOR);

    if (parts.length !== 3) {
      return null;
    }

    const [publicKey, extensionName, tableName] = parts;

    if (!publicKey || !extensionName || !tableName) {
      return null;
    }

    return {
      publicKey,
      extensionName,
      tableName,
    };
  }

  /**
   * Execute a raw SQL query (SELECT)
   * Returns rows as an array of objects
   */
  public async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await this.request<DatabaseQueryResult>(
      HAEXTENSION_METHODS.database.query,
      { query: sql, params }
    );
    if (this.config.debug) {
      console.log('[SDK query()] Raw result:', JSON.stringify(result, null, 2));
    }
    return result.rows as T[];
  }

  /**
   * Alias for query() - more intuitive for SELECT statements
   */
  public async select<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  /**
   * Execute a raw SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
   * Returns rowsAffected and lastInsertId
   */
  public async execute(
    sql: string,
    params: unknown[] = []
  ): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    const result = await this.request<DatabaseQueryResult>(
      HAEXTENSION_METHODS.database.execute,
      { query: sql, params }
    );
    return {
      rowsAffected: result.rowsAffected,
      lastInsertId: result.lastInsertId,
    };
  }

  /**
   * Registers and applies extension migrations with HaexVault
   *
   * HaexVault will:
   * 1. Validate all SQL statements (ensure only extension's own tables are accessed)
   * 2. Store migrations with applied_at = NULL
   * 3. Query pending migrations sorted by name
   * 4. Apply pending migrations and set up CRDT triggers
   * 5. Mark successful migrations with applied_at timestamp
   *
   * @param extensionVersion - The version of the extension
   * @param migrations - Array of migration objects with name and SQL content
   * @returns Promise with migration result (applied count, already applied count, applied migration names)
   */
  public async registerMigrationsAsync(
    extensionVersion: string,
    migrations: Migration[]
  ): Promise<MigrationResult> {
    return this.database.registerMigrationsAsync(extensionVersion, migrations);
  }

  public async requestDatabasePermission(
    request: DatabasePermissionRequest
  ): Promise<PermissionResponse> {
    return this.request<PermissionResponse>("permissions.database.request", {
      resource: request.resource,
      operation: request.operation,
      reason: request.reason,
    });
  }

  public async checkDatabasePermission(
    resource: string,
    operation: "read" | "write"
  ): Promise<boolean> {
    const response = await this.request<PermissionResponse>(
      "permissions.database.check",
      {
        resource,
        operation,
      }
    );
    return response.status === "granted";
  }

  public async respondToSearch(
    requestId: string,
    results: SearchResult[]
  ): Promise<void> {
    await this.request("search.respond", {
      requestId,
      results,
    });
  }

  /**
   * Register a handler for external requests (from browser extensions, CLI, servers, etc.)
   *
   * @param action - The action/method name to handle (e.g., "get-logins", "get-totp")
   * @param handler - Function that processes the request and returns a response
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * ```typescript
   * client.onExternalRequest("get-logins", async (request) => {
   *   const entries = await getMatchingEntries(request.payload.url);
   *   return {
   *     requestId: request.requestId,
   *     success: true,
   *     data: { entries }
   *   };
   * });
   * ```
   */
  public onExternalRequest(
    action: string,
    handler: ExternalRequestHandler
  ): () => void {
    this.externalRequestHandlers.set(action, handler);
    this.log(`[ExternalRequest] Registered handler for action: ${action}`);

    return () => {
      this.externalRequestHandlers.delete(action);
      this.log(`[ExternalRequest] Unregistered handler for action: ${action}`);
    };
  }

  /**
   * Send a response to an external request back to haex-vault
   * This is called internally after a handler processes a request
   */
  public async respondToExternalRequest(response: ExternalResponse): Promise<void> {
    await this.request("external.respond", response as unknown as Record<string, unknown>);
  }

  public async request<T = unknown, P = Record<string, unknown>>(
    method: string,
    params?: P
  ): Promise<T> {
    const resolvedParams = (params ?? {}) as Record<string, unknown>;

    // Native window mode: Use Tauri invoke() for direct backend communication
    if (this.isNativeWindow && typeof (window as any).__TAURI__ !== 'undefined') {
      return this.invoke<T>(method, resolvedParams);
    }

    // iframe mode: Use postMessage for communication through parent window
    return this.postMessage<T>(method, resolvedParams);
  }

  private async postMessage<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const requestId = this.generateRequestId();

    const request: HaexHubRequest = {
      method,
      params,
      timestamp: Date.now(),
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new HaexHubError(ErrorCode.TIMEOUT, "errors.timeout", {
            timeout: this.config.timeout,
          })
        );
      }, this.config.timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Use wildcard origin since extensions are sandboxed in their own protocol
      const targetOrigin = "*";

      if (this.config.debug) {
        console.log("[SDK Debug] ========== Sending Request ==========");
        console.log("[SDK Debug] Request ID:", requestId);
        console.log("[SDK Debug] Method:", request.method);
        console.log("[SDK Debug] Params:", request.params);
        console.log("[SDK Debug] Target origin:", targetOrigin);
        console.log("[SDK Debug] Extension info:", this._extensionInfo);
        console.log("[SDK Debug] ========================================");
      }

      window.parent.postMessage({ id: requestId, ...request }, targetOrigin);
    });
  }

  private async invoke<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const { invoke } = (window as any).__TAURI__.core as {
      invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R>;
    };

    if (this.config.debug) {
      console.log("[SDK Debug] ========== Invoke Request ==========");
      console.log("[SDK Debug] Method:", method);
      console.log("[SDK Debug] Params:", params);
      console.log("[SDK Debug] =======================================");
    }

    // Map SDK methods to Tauri commands
    switch (method) {
      case HAEXTENSION_METHODS.database.query:
        return invoke<T>("webview_extension_db_query", {
          query: params.query as string,
          params: (params.params as unknown[]) || [],
        });

      case HAEXTENSION_METHODS.database.execute:
        return invoke<T>("webview_extension_db_execute", {
          query: params.query as string,
          params: (params.params as unknown[]) || [],
        });

      case "permissions.web.check":
        return invoke<T>("webview_extension_check_web_permission", {
          url: params.url as string,
        });

      case "permissions.database.check":
        return invoke<T>("webview_extension_check_database_permission", {
          resource: params.resource as string,
          operation: params.operation as string,
        });

      case "permissions.filesystem.check":
        return invoke<T>("webview_extension_check_filesystem_permission", {
          path: params.path as string,
          actionStr: params.action as string,
        });

      case HAEXTENSION_METHODS.application.open:
        return invoke<T>("webview_extension_web_open", {
          url: params.url as string,
        });

      case HAEXTENSION_METHODS.web.fetch:
        return invoke<T>("webview_extension_web_request", {
          url: params.url as string,
          method: params.method as string | undefined,
          headers: params.headers as Record<string, string> | undefined,
          body: params.body as string | undefined,
        });

      case HAEXTENSION_METHODS.filesystem.saveFile:
        return invoke<T>("webview_extension_fs_save_file", {
          data: params.data as number[],
          defaultPath: params.defaultPath as string | undefined,
          title: params.title as string | undefined,
          filters: params.filters as Array<{ name: string; extensions: string[] }> | undefined,
        });

      case HAEXTENSION_METHODS.filesystem.openFile:
        return invoke<T>("webview_extension_fs_open_file", {
          data: params.data as number[],
          fileName: params.fileName as string,
        });

      case HAEXTENSION_METHODS.database.registerMigrations:
        return invoke<T>("webview_extension_db_register_migrations", {
          extensionVersion: params.extensionVersion as string,
          migrations: params.migrations as Array<{ name: string; sql: string }>,
        });

      case "external.respond":
        return invoke<T>("webview_extension_external_respond", {
          requestId: params.requestId as string,
          success: params.success as boolean,
          data: params.data,
          error: params.error as string | undefined,
        });

      default:
        throw new HaexHubError(
          ErrorCode.METHOD_NOT_FOUND,
          "errors.method_not_found",
          { method }
        );
    }
  }

  public on(eventType: string, callback: EventCallback): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);
  }

  public off(eventType: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  public destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
    }

    this.pendingRequests.forEach(({ timeout }) => clearTimeout(timeout));
    this.pendingRequests.clear();
    this.eventListeners.clear();

    this.initialized = false;
    this.log("HaexHub SDK destroyed");
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    // IMPORTANT: Check iframe mode FIRST before attempting Tauri calls
    // This prevents hanging on Android where __TAURI__ exists but sandboxed iframes can't access it
    const isInIframe = window.self !== window.top;

    // Try to detect if we're running in a native WebViewWindow (Tauri)
    // Only attempt this if we're NOT in an iframe
    if (!isInIframe) {
      try {
        if (typeof (window as any).__TAURI__ !== 'undefined') {
          const { invoke } = (window as any).__TAURI__.core as {
            invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
          };

          // Try to get extension info from Tauri backend
          this._extensionInfo = await invoke<ExtensionInfo>("webview_extension_get_info");
          this._context = await invoke<ApplicationContext>("webview_extension_context_get");

          this.isNativeWindow = true;
          this.initialized = true;

          this.log("HaexHub SDK initialized in native WebViewWindow mode");
          this.log("Extension info:", this._extensionInfo);
          this.log("Application context:", this._context);

          this.notifySubscribers();

          // Listen for context changes via Tauri events
          const { listen } = (window as any).__TAURI__.event as {
            listen: (event: string, handler: (event: any) => void) => Promise<() => void>;
          };

          console.log("[HaexSpace SDK] Setting up Tauri event listener for:", HAEXTENSION_EVENTS.CONTEXT_CHANGED);

          try {
            await listen(HAEXTENSION_EVENTS.CONTEXT_CHANGED, (event: any) => {
              console.log("[HaexSpace SDK] Received Tauri event:", HAEXTENSION_EVENTS.CONTEXT_CHANGED, event);
              this.log("Received context change event:", event);
              if (event.payload?.context) {
                this._context = event.payload.context;
                console.log("[HaexSpace SDK] Updated context to:", this._context);
                this.handleEvent({
                  type: HAEXTENSION_EVENTS.CONTEXT_CHANGED,
                  data: { context: this._context },
                  timestamp: Date.now(),
                });
              } else {
                console.warn("[HaexSpace SDK] Event received but no context in payload:", event);
              }
            });
            console.log("[HaexSpace SDK] Context change listener registered successfully");
          } catch (error) {
            console.error("[HaexSpace SDK] Failed to setup context change listener:", error);
            this.log("Failed to setup context change listener:", error);
          }

          // Listen for external requests via Tauri events
          try {
            await listen(HAEXTENSION_EVENTS.EXTERNAL_REQUEST, (event: any) => {
              this.log("Received external request event:", event);
              if (event.payload) {
                this.handleEvent({
                  type: HAEXTENSION_EVENTS.EXTERNAL_REQUEST,
                  data: event.payload,
                  timestamp: Date.now(),
                });
              }
            });
            console.log("[HaexSpace SDK] External request listener registered successfully");
          } catch (error) {
            console.error("[HaexSpace SDK] Failed to setup external request listener:", error);
            this.log("Failed to setup external request listener:", error);
          }

          this.resolveReady();
          return;
        }
      } catch (error) {
        this.log("Tauri commands failed, falling back to iframe mode", error);
        // Fall through to iframe mode
      }
    }

    // iframe mode (mobile/web)
    // At this point we should be in an iframe
    if (window.self === window.top) {
      throw new HaexHubError(ErrorCode.NOT_IN_IFRAME, "errors.not_in_iframe");
    }

    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.messageHandler);

    this.isNativeWindow = false;
    this.initialized = true;
    this.log("HaexSpace SDK initialized in iframe mode");

    try {
      // Load extension info from manifest (if provided in config)
      if (this.config.manifest) {
        this._extensionInfo = {
          publicKey: this.config.manifest.publicKey,
          name: this.config.manifest.name,
          version: this.config.manifest.version,
          displayName: this.config.manifest.name,
        };
        this.log("Extension info loaded from manifest:", this._extensionInfo);
        this.notifySubscribers();
      }

      // Debug: Check window.parent availability
      // Use alert on mobile to bypass console forwarding
      if (typeof window !== 'undefined' && window.parent) {
        const debugInfo = `SDK Debug:\nwindow.parent exists: ${!!window.parent}\nwindow.parent === window: ${window.parent === window}\nwindow.self === window.top: ${window.self === window.top}`;
        try {
          // Try to send debug info via postMessage
          window.parent.postMessage({
            type: HAEXSPACE_MESSAGE_TYPES.DEBUG,
            data: debugInfo
          }, '*');
        } catch (e) {
          // Fallback to alert
          alert(debugInfo + `\npostMessage error: ${e}`);
        }
      }

      // Request context from HaexHub - this also acts as a handshake
      this._context = await this.request<ApplicationContext>(HAEXTENSION_METHODS.context.get);
      this.log("Application context received:", this._context);
      this.notifySubscribers();

      this.resolveReady();
    } catch (error) {
      this.log("Failed to load extension info or context:", error);
      throw error;
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (this.config.debug) {
      console.log("[SDK Debug] ========== Message Received ==========");
      console.log("[SDK Debug] Event origin:", event.origin);
      console.log(
        "[SDK Debug] Event source:",
        event.source === window.parent ? "parent window" : "unknown"
      );
      console.log("[SDK Debug] Event data:", event.data);
      console.log("[SDK Debug] Extension info loaded:", !!this._extensionInfo);
      console.log(
        "[SDK Debug] Pending requests count:",
        this.pendingRequests.size
      );
    }

    // Verify message comes from parent window (HaexHub)
    if (event.source !== window.parent) {
      if (this.config.debug) {
        console.error("[SDK Debug] ❌ REJECTED: Message not from parent window!");
      }
      return;
    }

    const data = event.data as HaexHubResponse | HaexHubEvent;

    if ("id" in data && this.pendingRequests.has(data.id)) {
      if (this.config.debug) {
        console.log("[SDK Debug] ✅ Found pending request for ID:", data.id);
      }
      const pending = this.pendingRequests.get(data.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(data.id);

      if (data.error) {
        if (this.config.debug) {
          console.error("[SDK Debug] ❌ Request failed:", data.error);
        }
        pending.reject(data.error);
      } else {
        if (this.config.debug) {
          console.log("[SDK Debug] ✅ Request succeeded:", data.result);
        }
        pending.resolve(data.result);
      }
      return;
    }

    if ("id" in data && !this.pendingRequests.has(data.id)) {
      if (this.config.debug) {
        console.warn(
          "[SDK Debug] ⚠️ Received response for unknown request ID:",
          data.id
        );
        console.warn(
          "[SDK Debug] Known IDs:",
          Array.from(this.pendingRequests.keys())
        );
      }
    }

    if ("type" in data && data.type) {
      if (this.config.debug) {
        console.log("[SDK Debug] Event received:", data.type);
      }
      this.handleEvent(data as HaexHubEvent);
    }

    if (this.config.debug) {
      console.log("[SDK Debug] ========== End Message ==========");
    }
  }

  private handleEvent(event: HaexHubEvent): void {
    if (event.type === HAEXTENSION_EVENTS.CONTEXT_CHANGED) {
      const contextEvent = event as ContextChangedEvent;
      this._context = contextEvent.data.context;
      this.log("Context updated:", this._context);
      this.notifySubscribers();
    }

    // Handle external requests from authorized clients
    if (event.type === HAEXTENSION_EVENTS.EXTERNAL_REQUEST) {
      const externalEvent = event as ExternalRequestEvent;
      this.handleExternalRequest(externalEvent.data);
      return; // Don't emit to regular event listeners
    }

    this.emitEvent(event);
  }

  private async handleExternalRequest(request: ExternalRequest): Promise<void> {
    this.log(`[ExternalRequest] Received request: ${request.action} from ${request.publicKey.substring(0, 20)}...`);

    const handler = this.externalRequestHandlers.get(request.action);

    if (!handler) {
      this.log(`[ExternalRequest] No handler for action: ${request.action}`);
      // Send error response back
      await this.respondToExternalRequest({
        requestId: request.requestId,
        success: false,
        error: `No handler registered for action: ${request.action}`,
      });
      return;
    }

    try {
      const response = await handler(request);
      await this.respondToExternalRequest(response);
      this.log(`[ExternalRequest] Response sent for: ${request.action}`);
    } catch (error) {
      this.log(`[ExternalRequest] Handler error:`, error);
      await this.respondToExternalRequest({
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emitEvent(event: HaexHubEvent): void {
    this.log("Event received:", event);
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestCounter}`;
  }

  private validatePublicKey(publicKey: string): void {
    if (
      !publicKey ||
      typeof publicKey !== "string" ||
      publicKey.trim() === ""
    ) {
      throw new HaexHubError(
        ErrorCode.INVALID_PUBLIC_KEY,
        "errors.invalid_public_key",
        { publicKey }
      );
    }
  }

  private validateExtensionName(extensionName: string): void {
    if (!extensionName || !/^[a-z][a-z0-9-]*$/i.test(extensionName)) {
      throw new HaexHubError(
        ErrorCode.INVALID_EXTENSION_NAME,
        "errors.invalid_extension_name",
        { extensionName }
      );
    }

    if (extensionName.includes(TABLE_SEPARATOR)) {
      throw new HaexHubError(
        ErrorCode.INVALID_EXTENSION_NAME,
        "errors.extension_name_contains_separator",
        { extensionName, separator: TABLE_SEPARATOR }
      );
    }
  }

  private validateTableName(tableName: string): void {
    if (!tableName || typeof tableName !== "string") {
      throw new HaexHubError(
        ErrorCode.INVALID_TABLE_NAME,
        "errors.table_name_empty"
      );
    }

    if (tableName.includes(TABLE_SEPARATOR)) {
      throw new HaexHubError(
        ErrorCode.INVALID_TABLE_NAME,
        "errors.table_name_contains_separator",
        { tableName, separator: TABLE_SEPARATOR }
      );
    }

    if (!/^[a-z][a-z0-9-_]*$/i.test(tableName)) {
      throw new HaexHubError(
        ErrorCode.INVALID_TABLE_NAME,
        "errors.table_name_format",
        { tableName }
      );
    }
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[HaexSpace SDK]", ...args);
    }
  }
}
