import type { HaexVaultSdk } from "../client";
import type {
  PasswordItemFull,
  PasswordItemSummary,
  PasswordInput,
} from "../types/passwords";
import { PASSWORD_COMMANDS } from "../commands/passwords";

/**
 * Access to the core passwords vault, scoped by the extension's
 * `passwords` permissions (target = tag or "*").
 */
export class PasswordsAPI {
  constructor(private client: HaexVaultSdk) {}

  /** List items in scope — summaries only, no secrets. */
  async listAsync(): Promise<PasswordItemSummary[]> {
    return this.client.request<PasswordItemSummary[]>(
      PASSWORD_COMMANDS.list,
      {},
    );
  }

  /** Read a single item by id with full secrets. */
  async readAsync(itemId: string): Promise<PasswordItemFull> {
    return this.client.request<PasswordItemFull>(PASSWORD_COMMANDS.read, {
      itemId,
    });
  }

  /**
   * Create a new password item. `input.tags` must contain at least one
   * tag within the extension's permission scope, otherwise the write
   * is rejected as a security violation.
   *
   * Returns the new item id.
   */
  async createAsync(input: PasswordInput): Promise<string> {
    return this.client.request<string>(PASSWORD_COMMANDS.create, { input });
  }

  /**
   * Update an existing item. The item must already be in scope, and
   * the new tag set must keep at least one tag in scope (extensions
   * cannot orphan an item out of their own reach).
   */
  async updateAsync(itemId: string, input: PasswordInput): Promise<void> {
    return this.client.request<void>(PASSWORD_COMMANDS.update, {
      itemId,
      input,
    });
  }

  /** Delete an item by id. Item must be in scope. */
  async deleteAsync(itemId: string): Promise<void> {
    return this.client.request<void>(PASSWORD_COMMANDS.delete, { itemId });
  }
}
