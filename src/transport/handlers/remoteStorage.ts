/**
 * Remote Storage Handler
 *
 * Maps remote storage SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, InvokeMapping } from "./types";

// ============================================================================
// Parameter Types
// ============================================================================

interface ListBackendsParams {
  // No params needed
}

interface AddBackendParams {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface RemoveBackendParams {
  backendId: string;
}

interface TestBackendParams {
  backendId: string;
}

interface UploadParams {
  backendId: string;
  key: string;
  data: string; // Base64 encoded
}

interface DownloadParams {
  backendId: string;
  key: string;
}

interface DeleteParams {
  backendId: string;
  key: string;
}

interface ListParams {
  backendId: string;
  prefix?: string;
}

// ============================================================================
// Handlers
// ============================================================================

export const remoteStorageHandlers: InvokeHandlerMap = {
  // Backend Management
  [HAEXTENSION_METHODS.remoteStorage.listBackends]: {
    command: TAURI_COMMANDS.storage.listBackends,
    args: (_p: ListBackendsParams) => ({}),
  } satisfies InvokeMapping<ListBackendsParams>,

  [HAEXTENSION_METHODS.remoteStorage.addBackend]: {
    command: TAURI_COMMANDS.storage.addBackend,
    args: (p: AddBackendParams) => ({
      name: p.name,
      backendType: p.type,
      config: p.config,
    }),
  } satisfies InvokeMapping<AddBackendParams>,

  [HAEXTENSION_METHODS.remoteStorage.removeBackend]: {
    command: TAURI_COMMANDS.storage.removeBackend,
    args: (p: RemoveBackendParams) => ({
      backendId: p.backendId,
    }),
  } satisfies InvokeMapping<RemoveBackendParams>,

  [HAEXTENSION_METHODS.remoteStorage.testBackend]: {
    command: TAURI_COMMANDS.storage.testBackend,
    args: (p: TestBackendParams) => ({
      backendId: p.backendId,
    }),
  } satisfies InvokeMapping<TestBackendParams>,

  // Storage Operations
  [HAEXTENSION_METHODS.remoteStorage.upload]: {
    command: TAURI_COMMANDS.storage.upload,
    args: (p: UploadParams) => ({
      backendId: p.backendId,
      key: p.key,
      data: p.data,
    }),
  } satisfies InvokeMapping<UploadParams>,

  [HAEXTENSION_METHODS.remoteStorage.download]: {
    command: TAURI_COMMANDS.storage.download,
    args: (p: DownloadParams) => ({
      backendId: p.backendId,
      key: p.key,
    }),
  } satisfies InvokeMapping<DownloadParams>,

  [HAEXTENSION_METHODS.remoteStorage.delete]: {
    command: TAURI_COMMANDS.storage.delete,
    args: (p: DeleteParams) => ({
      backendId: p.backendId,
      key: p.key,
    }),
  } satisfies InvokeMapping<DeleteParams>,

  [HAEXTENSION_METHODS.remoteStorage.list]: {
    command: TAURI_COMMANDS.storage.list,
    args: (p: ListParams) => ({
      backendId: p.backendId,
      prefix: p.prefix,
    }),
  } satisfies InvokeMapping<ListParams>,
};
