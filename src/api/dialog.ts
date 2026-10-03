import type { HaexVaultSdk } from "../client";
import { EXTENSION_COMMANDS } from "../commands/extension";

export interface ConfirmOptions {
  /** The question, up to 2000 characters. */
  message: string;
  /** Up to 200 characters. */
  title?: string;
  /** Label of the confirming button, up to 200 characters. */
  confirmLabel?: string;
  /** Label of the cancelling button, up to 200 characters. */
  cancelLabel?: string;
  /** Show the confirming button as destructive (deleting, overwriting). */
  destructive?: boolean;
}

/**
 * Dialogs drawn by the host.
 *
 * Extensions run in a sandboxed frame without `allow-modals`, so
 * `window.confirm()` returns `false` at once. Use these instead; the host
 * shows them over the extension's own tab.
 */
export class DialogAPI {
  constructor(private client: HaexVaultSdk) {}

  /** Asks the user; resolves `true` for confirm, `false` for cancel or when the dialog is closed. */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    // No deadline: the dialog stays open until the user answers or the host closes it.
    const answer = await this.client.request<boolean>(EXTENSION_COMMANDS.dialogConfirm, { ...options }, { timeout: null });
    return answer === true;
  }
}
