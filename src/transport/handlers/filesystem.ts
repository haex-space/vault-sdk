/**
 * Filesystem Handler
 *
 * Maps filesystem SDK methods to Tauri invoke commands
 */

import { HAEXTENSION_METHODS } from "../../methods";
import { TAURI_COMMANDS } from "../../commands";
import type { InvokeHandlerMap, FilesystemSaveParams, FilesystemOpenParams } from "./types";

interface FilesystemShowImageParams {
  dataUrl: string;
}

export const filesystemHandlers: InvokeHandlerMap = {
  [HAEXTENSION_METHODS.filesystem.saveFile]: {
    command: TAURI_COMMANDS.filesystem.saveFile,
    args: (p: FilesystemSaveParams) => ({
      data: p.data,
      defaultPath: p.defaultPath,
      title: p.title,
      filters: p.filters,
    }),
  },

  [HAEXTENSION_METHODS.filesystem.openFile]: {
    command: TAURI_COMMANDS.filesystem.openFile,
    args: (p: FilesystemOpenParams) => ({
      data: p.data,
      fileName: p.fileName,
    }),
  },

  [HAEXTENSION_METHODS.filesystem.showImage]: {
    command: TAURI_COMMANDS.filesystem.showImage,
    args: (p: FilesystemShowImageParams) => ({
      dataUrl: p.dataUrl,
    }),
  },
};
