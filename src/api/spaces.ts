import type { HaexVaultSdk } from "~/client";
import { SPACE_COMMANDS } from "~/commands";

// ============================================================================
// Types
// ============================================================================

/**
 * A mapping of a row to a shared space.
 */
export interface SpaceAssignment {
  /** The extension-scoped table name */
  tableName: string;
  /** Serialized primary key(s) identifying the row */
  rowPks: string;
  /** The shared space ID this row is assigned to */
  spaceId: string;
}

// ============================================================================
// Spaces API
// ============================================================================

/**
 * Spaces API for managing row-to-space assignments.
 *
 * Extensions use this API to control which rows are synced to which
 * shared spaces. The sync engine reads these assignments to filter
 * data when pushing to space backends.
 *
 * @example
 * ```typescript
 * // Assign a single row to a space
 * await sdk.spaces.assignRowAsync("events", "evt_123", "space_abc");
 *
 * // Bulk assign multiple rows
 * await sdk.spaces.assignAsync([
 *   { tableName: "events", rowPks: "evt_1", spaceId: "space_abc" },
 *   { tableName: "events", rowPks: "evt_2", spaceId: "space_abc" },
 * ]);
 *
 * // Query assignments
 * const assignments = await sdk.spaces.getAssignmentsAsync("events");
 * ```
 */
export class SpacesAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Bulk assign rows to spaces.
   * @param assignments - Array of row-to-space mappings
   * @returns Number of assignments created
   */
  async assignAsync(assignments: SpaceAssignment[]): Promise<number> {
    return this.client.request<number>(SPACE_COMMANDS.assign, {
      assignments: assignments.map(toSnakeCase),
    });
  }

  /**
   * Bulk unassign rows from spaces.
   * @param assignments - Array of row-to-space mappings to remove
   * @returns Number of assignments removed
   */
  async unassignAsync(assignments: SpaceAssignment[]): Promise<number> {
    return this.client.request<number>(SPACE_COMMANDS.unassign, {
      assignments: assignments.map(toSnakeCase),
    });
  }

  /**
   * Get space assignments for a table, optionally filtered by row.
   * @param tableName - The table to query assignments for
   * @param rowPks - Optional row primary key(s) to filter by
   * @returns Array of space assignments
   */
  async getAssignmentsAsync(tableName: string, rowPks?: string): Promise<SpaceAssignment[]> {
    const result = await this.client.request<SnakeCaseAssignment[]>(
      SPACE_COMMANDS.getAssignments,
      {
        table_name: tableName,
        row_pks: rowPks,
      },
    );
    return result.map(fromSnakeCase);
  }

  /**
   * Convenience method to assign a single row to a space.
   * @param tableName - The table name
   * @param rowPks - The row primary key(s)
   * @param spaceId - The space ID to assign to
   * @returns Number of assignments created (0 or 1)
   */
  async assignRowAsync(tableName: string, rowPks: string, spaceId: string): Promise<number> {
    return this.assignAsync([{ tableName, rowPks, spaceId }]);
  }

  /**
   * Convenience method to unassign a single row from a space.
   * @param tableName - The table name
   * @param rowPks - The row primary key(s)
   * @param spaceId - The space ID to unassign from
   * @returns Number of assignments removed (0 or 1)
   */
  async unassignRowAsync(tableName: string, rowPks: string, spaceId: string): Promise<number> {
    return this.unassignAsync([{ tableName, rowPks, spaceId }]);
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

interface SnakeCaseAssignment {
  table_name: string;
  row_pks: string;
  space_id: string;
}

function toSnakeCase(a: SpaceAssignment): SnakeCaseAssignment {
  return {
    table_name: a.tableName,
    row_pks: a.rowPks,
    space_id: a.spaceId,
  };
}

function fromSnakeCase(a: SnakeCaseAssignment): SpaceAssignment {
  return {
    tableName: a.table_name,
    rowPks: a.row_pks,
    spaceId: a.space_id,
  };
}
