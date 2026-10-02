import type { HaexVaultSdk } from "../client";
import { EXTENSION_COMMANDS } from "../commands/extension";

/**
 * The host tab that shows this extension.
 *
 * Navigation, title and close are taken from web standards (hash, document
 * title, `beforeunload`, `window.close()`); attention has no web equivalent,
 * hence this API. The host applies it only to the calling frame's own tab.
 */
export class TabAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Mark the tab as wanting the user's attention (`true`), e.g. for unread
   * content, or clear the mark (`false`).
   */
  async requestAttention(active: boolean): Promise<void> {
    await this.client.request<void>(EXTENSION_COMMANDS.tabAttention, { active });
  }
}
