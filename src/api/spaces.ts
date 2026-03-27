import type { HaexVaultSdk } from "~/client";
import type { DecryptedSpace, SyncBackendInfo } from "~/types/spaces";
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
  /** Optional group identifier for logically related assignments (e.g. a calendar ID groups the calendar row + all its event rows) */
  groupId?: string;
  /** Optional type label for display categorization (e.g. "Calendar", "Password Folder") */
  type?: string;
  /** Optional display label (e.g. "Personal", "Team Q1") */
  label?: string;
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
    return this.client.request<number>(SPACE_COMMANDS.assign, { assignments });
  }

  /**
   * Bulk unassign rows from spaces.
   * @param assignments - Array of row-to-space mappings to remove
   * @returns Number of assignments removed
   */
  async unassignAsync(assignments: SpaceAssignment[]): Promise<number> {
    return this.client.request<number>(SPACE_COMMANDS.unassign, { assignments });
  }

  /**
   * Get space assignments for a table, optionally filtered by row.
   * @param tableName - The table to query assignments for
   * @param rowPks - Optional row primary key(s) to filter by
   * @returns Array of space assignments
   */
  async getAssignmentsAsync(tableName: string, rowPks?: string): Promise<SpaceAssignment[]> {
    return this.client.request<SpaceAssignment[]>(
      SPACE_COMMANDS.getAssignments,
      { tableName, rowPks: rowPks ? [rowPks] : undefined },
    );
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

  // ==========================================================================
  // Space Management
  // ==========================================================================

  /**
   * List all shared spaces the user is a member of.
   * Returns spaces with decrypted names (decryption happens vault-side).
   */
  async listSpacesAsync(): Promise<DecryptedSpace[]> {
    return this.client.request<DecryptedSpace[]>(SPACE_COMMANDS.list);
  }

  /**
   * Create a new shared space.
   * @param name - Human-readable space name
   * @param serverUrl - The sync server URL to create the space on
   * @returns The created space with decrypted name
   */
  async createSpaceAsync(name: string, serverUrl: string): Promise<DecryptedSpace> {
    return this.client.request<DecryptedSpace>(SPACE_COMMANDS.create, {
      spaceName: name,
      serverUrl,
    });
  }

  /**
   * List available sync backends that can host shared spaces.
   * @returns Array of backend info with server URLs
   */
  async listSyncBackendsAsync(): Promise<SyncBackendInfo[]> {
    return this.client.request<SyncBackendInfo[]>(SPACE_COMMANDS.listBackends);
  }
}

