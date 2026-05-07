import type { HaexVaultSdk } from "../client";
import type { DatabaseQueryResult, MigrationResult, Migration } from "../types";
import { DATABASE_COMMANDS } from "../commands";

// Wrap identifiers in double quotes so names with dashes or reserved-ish
// characters still work. Security validation happens in haex-vault.
function quoteIdent(identifier: string): string {
  // If already quoted, pass through unchanged.
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier;
  }
  // Escape any embedded double quote per SQL standard (" -> "").
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class DatabaseAPI {
  constructor(private client: HaexVaultSdk) {}

  async query<T>(query: string, params?: unknown[]): Promise<T[]> {
    const result = await this.client.request<DatabaseQueryResult>(
      DATABASE_COMMANDS.query,
      {
        query,
        params: params || [],
      }
    );

    return result.rows as T[];
  }

  async queryOne<T = unknown>(
    query: string,
    params?: unknown[]
  ): Promise<T | null> {
    const rows = await this.query<T>(query, params);
    return rows.length > 0 ? rows[0] ?? null : null;
  }

  async execute(
    query: string,
    params?: unknown[]
  ): Promise<DatabaseQueryResult> {
    return this.client.request<DatabaseQueryResult>(DATABASE_COMMANDS.execute, {
      query,
      params: params || [],
    });
  }

  async transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    await this.client.request(DATABASE_COMMANDS.transaction, {
      statements: statements.map(s => [s.sql, s.params || []]),
    });
  }

  async createTable(tableName: string, columns: string): Promise<void> {
    const query = `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (${columns})`;
    await this.execute(query);
  }

  async dropTable(tableName: string): Promise<void> {
    const query = `DROP TABLE IF EXISTS ${quoteIdent(tableName)}`;
    await this.execute(query);
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
  async registerMigrationsAsync(
    extensionVersion: string,
    migrations: Migration[]
  ): Promise<MigrationResult> {
    return this.client.request<MigrationResult>(
      DATABASE_COMMANDS.registerMigrations,
      {
        extensionVersion,
        migrations,
      }
    );
  }

  async insert(
    tableName: string,
    data: Record<string, unknown>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const quotedCols = keys.map(quoteIdent).join(", ");
    const placeholders = keys.map(() => "?").join(", ");

    const query = `INSERT INTO ${quoteIdent(tableName)} (${quotedCols}) VALUES (${placeholders})`;
    const result = await this.execute(query, values);

    return result.lastInsertId ?? -1;
  }

  async update(
    tableName: string,
    data: Record<string, unknown>,
    where: string,
    whereParams?: unknown[]
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${quoteIdent(key)} = ?`).join(", ");

    const query = `UPDATE ${quoteIdent(tableName)} SET ${setClause} WHERE ${where}`;
    const result = await this.execute(query, [
      ...values,
      ...(whereParams || []),
    ]);

    return result.rowsAffected;
  }

  async delete(
    tableName: string,
    where: string,
    whereParams?: unknown[]
  ): Promise<number> {
    const query = `DELETE FROM ${quoteIdent(tableName)} WHERE ${where}`;
    const result = await this.execute(query, whereParams);
    return result.rowsAffected;
  }

  async count(
    tableName: string,
    where?: string,
    whereParams?: unknown[]
  ): Promise<number> {
    const query = where
      ? `SELECT COUNT(*) as count FROM ${quoteIdent(tableName)} WHERE ${where}`
      : `SELECT COUNT(*) as count FROM ${quoteIdent(tableName)}`;

    const result = await this.queryOne<{ count: number }>(query, whereParams);
    return result?.count ?? 0;
  }

}
