/**
 * Database Module
 *
 * Functions for database operations including Drizzle ORM initialization
 * and raw SQL query/execute methods.
 */

import { DATABASE_COMMANDS } from "../commands";
import { ErrorCode, HaexVaultSdkError } from "../types";
import type { ExtensionInfo, DatabaseQueryResult } from "../types";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { LogFn } from "./context";

/**
 * Request function type for database operations
 */
type RequestFn = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;

/**
 * Create a Drizzle ORM database instance
 *
 * @param schema The Drizzle schema object (with prefixed table names)
 * @param extensionInfo The current extension info (required)
 * @param request The request function for SDK communication
 * @param log Logger function
 * @returns The type-safe Drizzle database instance
 */
export function createDrizzleInstance<T extends Record<string, unknown>>(
  schema: T,
  extensionInfo: ExtensionInfo | null,
  request: RequestFn,
  log: LogFn
): SqliteRemoteDatabase<T> {
  if (!extensionInfo) {
    throw new HaexVaultSdkError(
      ErrorCode.EXTENSION_INFO_UNAVAILABLE,
      "errors.client_not_ready"
    );
  }

  return drizzle<T>(
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
          const result = await request<DatabaseQueryResult>(
            DATABASE_COMMANDS.execute,
            {
              sql,
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
        const result = await request<DatabaseQueryResult>(DATABASE_COMMANDS.query, {
          sql,
          params: params as unknown[],
        });

        const rows = result.rows as unknown[];

        if (method === "get") {
          return { rows: rows.length > 0 ? rows.at(0) : undefined };
        }

        return { rows };
      } catch (error) {
        log("Database operation failed:", error);
        throw error;
      }
    },
    {
      schema: schema,
      logger: false,
    }
  );
}

/**
 * Execute a raw SQL query (SELECT)
 *
 * @param sql The SQL query string
 * @param params Query parameters
 * @param request The request function
 * @param debug Whether debug mode is enabled
 * @returns Array of result rows
 */
export async function queryRaw<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
  request: RequestFn,
  debug: boolean
): Promise<T[]> {
  const result = await request<DatabaseQueryResult>(
    DATABASE_COMMANDS.query,
    { sql, params }
  );
  if (debug) {
    console.log("[SDK query()] Raw result:", JSON.stringify(result, null, 2));
  }
  return result.rows as T[];
}

/**
 * Execute a raw SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
 *
 * @param sql The SQL statement
 * @param params Statement parameters
 * @param request The request function
 * @returns Object with rowsAffected and optionally lastInsertId
 */
export async function executeRaw(
  sql: string,
  params: unknown[],
  request: RequestFn
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  const result = await request<DatabaseQueryResult>(
    DATABASE_COMMANDS.execute,
    { sql, params }
  );
  return {
    rowsAffected: result.rowsAffected,
    lastInsertId: result.lastInsertId,
  };
}
