/**
 * Web Handler
 *
 * Maps web/application SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, WebFetchParams } from "./types";

interface ApplicationOpenParams {
  url: string;
}

export const webHandlers: InvokeHandlerMap = {
  [HAEXTENSION_METHODS.application.open]: {
    command: TAURI_COMMANDS.web.open,
    args: (p: ApplicationOpenParams) => ({
      url: p.url,
    }),
  },

  [HAEXTENSION_METHODS.web.fetch]: {
    command: TAURI_COMMANDS.web.fetch,
    args: (p: WebFetchParams) => ({
      url: p.url,
      method: p.method,
      headers: p.headers,
      body: p.body,
    }),
  },
};
