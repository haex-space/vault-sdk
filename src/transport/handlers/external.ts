/**
 * External Handler
 *
 * Maps external request SDK methods to Tauri invoke commands
 */

import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, ExternalRespondParams } from "./types";

export const externalHandlers: InvokeHandlerMap = {
  "external.respond": {
    command: TAURI_COMMANDS.external.respond,
    args: (p: ExternalRespondParams) => ({
      requestId: p.requestId,
      success: p.success,
      data: p.data,
      error: p.error,
    }),
  },
};
