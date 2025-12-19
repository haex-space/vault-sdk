/**
 * Transport Handlers Index
 *
 * Combines all domain-specific handlers into a single handler map
 */

import type { InvokeHandlerMap } from "./types";
import { databaseHandlers } from "./database";
import { permissionsHandlers } from "./permissions";
import { webHandlers } from "./web";
import { filesystemHandlers } from "./filesystem";
import { externalHandlers } from "./external";
import { remoteStorageHandlers } from "./remoteStorage";

/**
 * Combined handler map for all SDK methods
 * Used by both invoke and postMessage transports
 */
export const allHandlers: InvokeHandlerMap = {
  ...databaseHandlers,
  ...permissionsHandlers,
  ...webHandlers,
  ...filesystemHandlers,
  ...externalHandlers,
  ...remoteStorageHandlers,
};

// Re-export types and individual handlers for flexibility
export type { InvokeHandlerMap, InvokeMapping } from "./types";
export { databaseHandlers } from "./database";
export { permissionsHandlers } from "./permissions";
export { webHandlers } from "./web";
export { filesystemHandlers } from "./filesystem";
export { externalHandlers } from "./external";
export { remoteStorageHandlers } from "./remoteStorage";
