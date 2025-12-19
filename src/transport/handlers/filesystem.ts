/**
 * Filesystem Handler
 *
 * Maps filesystem SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, InvokeMapping, FilesystemSaveParams, FilesystemOpenParams } from "./types";

// ============================================================================
// Parameter Types
// ============================================================================

interface FilesystemShowImageParams {
  dataUrl: string;
}

interface ReadFileParams {
  path: string;
}

interface WriteFileParams {
  path: string;
  data: string; // Base64 encoded
}

interface ReadDirParams {
  path: string;
}

interface MkdirParams {
  path: string;
}

interface RemoveParams {
  path: string;
}

interface ExistsParams {
  path: string;
}

interface StatParams {
  path: string;
}

interface SelectFolderParams {
  title?: string;
  defaultPath?: string;
}

interface SelectFileParams {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface RenameParams {
  from: string;
  to: string;
}

interface CopyParams {
  from: string;
  to: string;
}

// ============================================================================
// Handlers
// ============================================================================

export const filesystemHandlers: InvokeHandlerMap = {
  // Legacy extension-specific operations
  [HAEXTENSION_METHODS.filesystem.saveFile]: {
    command: TAURI_COMMANDS.filesystem.saveFile,
    args: (p: FilesystemSaveParams) => ({
      data: p.data,
      defaultPath: p.defaultPath,
      title: p.title,
      filters: p.filters,
    }),
  } satisfies InvokeMapping<FilesystemSaveParams>,

  [HAEXTENSION_METHODS.filesystem.openFile]: {
    command: TAURI_COMMANDS.filesystem.openFile,
    args: (p: FilesystemOpenParams) => ({
      data: p.data,
      fileName: p.fileName,
    }),
  } satisfies InvokeMapping<FilesystemOpenParams>,

  [HAEXTENSION_METHODS.filesystem.showImage]: {
    command: TAURI_COMMANDS.filesystem.showImage,
    args: (p: FilesystemShowImageParams) => ({
      dataUrl: p.dataUrl,
    }),
  } satisfies InvokeMapping<FilesystemShowImageParams>,

  // Generic filesystem operations
  [HAEXTENSION_METHODS.filesystem.readFile]: {
    command: TAURI_COMMANDS.filesystem.readFile,
    args: (p: ReadFileParams) => ({ path: p.path }),
  } satisfies InvokeMapping<ReadFileParams>,

  [HAEXTENSION_METHODS.filesystem.writeFile]: {
    command: TAURI_COMMANDS.filesystem.writeFile,
    args: (p: WriteFileParams) => ({ path: p.path, data: p.data }),
  } satisfies InvokeMapping<WriteFileParams>,

  [HAEXTENSION_METHODS.filesystem.readDir]: {
    command: TAURI_COMMANDS.filesystem.readDir,
    args: (p: ReadDirParams) => ({ path: p.path }),
  } satisfies InvokeMapping<ReadDirParams>,

  [HAEXTENSION_METHODS.filesystem.mkdir]: {
    command: TAURI_COMMANDS.filesystem.mkdir,
    args: (p: MkdirParams) => ({ path: p.path }),
  } satisfies InvokeMapping<MkdirParams>,

  [HAEXTENSION_METHODS.filesystem.remove]: {
    command: TAURI_COMMANDS.filesystem.remove,
    args: (p: RemoveParams) => ({ path: p.path }),
  } satisfies InvokeMapping<RemoveParams>,

  [HAEXTENSION_METHODS.filesystem.exists]: {
    command: TAURI_COMMANDS.filesystem.exists,
    args: (p: ExistsParams) => ({ path: p.path }),
  } satisfies InvokeMapping<ExistsParams>,

  [HAEXTENSION_METHODS.filesystem.stat]: {
    command: TAURI_COMMANDS.filesystem.stat,
    args: (p: StatParams) => ({ path: p.path }),
  } satisfies InvokeMapping<StatParams>,

  [HAEXTENSION_METHODS.filesystem.selectFolder]: {
    command: TAURI_COMMANDS.filesystem.selectFolder,
    args: (p: SelectFolderParams) => ({
      title: p.title,
      defaultPath: p.defaultPath,
    }),
  } satisfies InvokeMapping<SelectFolderParams>,

  [HAEXTENSION_METHODS.filesystem.selectFile]: {
    command: TAURI_COMMANDS.filesystem.selectFile,
    args: (p: SelectFileParams) => ({
      title: p.title,
      defaultPath: p.defaultPath,
      filters: p.filters,
    }),
  } satisfies InvokeMapping<SelectFileParams>,

  [HAEXTENSION_METHODS.filesystem.rename]: {
    command: TAURI_COMMANDS.filesystem.rename,
    args: (p: RenameParams) => ({ from: p.from, to: p.to }),
  } satisfies InvokeMapping<RenameParams>,

  [HAEXTENSION_METHODS.filesystem.copy]: {
    command: TAURI_COMMANDS.filesystem.copy,
    args: (p: CopyParams) => ({ from: p.from, to: p.to }),
  } satisfies InvokeMapping<CopyParams>,
};
