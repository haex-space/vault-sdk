/**
 * Database Handler
 *
 * Maps database SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type {
  InvokeHandlerMap,
  InvokeMapping,
  DatabaseQueryParams,
  DatabaseMigrationsParams,
} from "./types";

export const databaseHandlers: InvokeHandlerMap = {
  [HAEXTENSION_METHODS.database.query]: {
    command: TAURI_COMMANDS.database.query,
    args: (p: DatabaseQueryParams) => ({
      query: p.query,
      params: p.params || [],
    }),
  } satisfies InvokeMapping<DatabaseQueryParams>,

  [HAEXTENSION_METHODS.database.execute]: {
    command: TAURI_COMMANDS.database.execute,
    args: (p: DatabaseQueryParams) => ({
      query: p.query,
      params: p.params || [],
    }),
  } satisfies InvokeMapping<DatabaseQueryParams>,

  [HAEXTENSION_METHODS.database.registerMigrations]: {
    command: TAURI_COMMANDS.database.registerMigrations,
    args: (p: DatabaseMigrationsParams) => ({
      extensionVersion: p.extensionVersion,
      migrations: p.migrations,
    }),
  } satisfies InvokeMapping<DatabaseMigrationsParams>,
};
