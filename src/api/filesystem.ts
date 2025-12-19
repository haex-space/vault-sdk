import type { HaexVaultSdk } from "../client";
import { HAEXTENSION_METHODS } from "../methods";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../crypto/vaultKey";

export interface SaveFileOptions {
  /**
   * The default filename to suggest
   */
  defaultPath?: string;

  /**
   * The title of the save dialog
   */
  title?: string;

  /**
   * File filters for the dialog
   */
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface SaveFileResult {
  /**
   * The path where the file was saved
   */
  path: string;

  /**
   * Whether the operation was successful
   */
  success: boolean;
}

export interface OpenFileOptions {
  /**
   * The filename for the temporary file
   */
  fileName: string;

  /**
   * Optional MIME type for the file
   */
  mimeType?: string;
}

export interface OpenFileResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;
}

export interface ShowImageOptions {
  /**
   * The data URL of the image (base64 encoded)
   */
  dataUrl: string;
}

export interface ShowImageResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;
}

// ============================================================================
// Generic Filesystem Types (Phase 2)
// ============================================================================

/**
 * File/directory metadata
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** True if this is a file */
  isFile: boolean;
  /** True if this is a directory */
  isDirectory: boolean;
  /** True if this is a symbolic link */
  isSymlink: boolean;
  /** Last modified time (Unix timestamp in milliseconds) */
  modified?: number;
  /** Created time (Unix timestamp in milliseconds) */
  created?: number;
  /** Whether the file is read-only */
  readonly: boolean;
}

/**
 * Directory entry
 */
export interface DirEntry {
  /** Entry name (not full path) */
  name: string;
  /** Full path */
  path: string;
  /** True if this is a file */
  isFile: boolean;
  /** True if this is a directory */
  isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Last modified time (Unix timestamp in milliseconds) */
  modified?: number;
}

/**
 * Options for selecting a folder
 */
export interface SelectFolderOptions {
  /** Dialog title */
  title?: string;
  /** Default path to open */
  defaultPath?: string;
}

/**
 * Options for selecting files
 */
export interface SelectFileOptions {
  /** Dialog title */
  title?: string;
  /** Default path to open */
  defaultPath?: string;
  /** File filters (name -> extensions) */
  filters?: Array<[string, string[]]>;
  /** Allow multiple file selection */
  multiple?: boolean;
}

export class FilesystemAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Opens a save file dialog and saves the provided data to the selected location
   * @param data The file data as Uint8Array
   * @param options Options for the save dialog
   * @returns The path where the file was saved, or null if cancelled
   */
  async saveFileAsync(
    data: Uint8Array,
    options: SaveFileOptions = {}
  ): Promise<SaveFileResult | null> {
    const result = await this.client.request<SaveFileResult | null>(
      HAEXTENSION_METHODS.filesystem.saveFile,
      {
        data: Array.from(data), // Convert Uint8Array to regular array for postMessage
        defaultPath: options.defaultPath,
        title: options.title,
        filters: options.filters,
      }
    );

    return result;
  }

  /**
   * Opens a file with the system's default viewer
   * @param data The file data as Uint8Array
   * @param options Options for opening the file
   * @returns The result of the operation
   */
  async openFileAsync(
    data: Uint8Array,
    options: OpenFileOptions
  ): Promise<OpenFileResult> {
    const result = await this.client.request<OpenFileResult>(
      HAEXTENSION_METHODS.filesystem.openFile,
      {
        data: Array.from(data), // Convert Uint8Array to regular array for postMessage
        fileName: options.fileName,
        mimeType: options.mimeType,
      }
    );

    return result;
  }

  /**
   * Shows an image using a data URL (safe, read-only viewing)
   * This is safe to use without special permissions as it only displays images
   * and doesn't execute any code or open files with external applications
   * @param options Options containing the data URL
   * @returns The result of the operation
   */
  async showImageAsync(
    options: ShowImageOptions
  ): Promise<ShowImageResult> {
    const result = await this.client.request<ShowImageResult>(
      HAEXTENSION_METHODS.filesystem.showImage,
      {
        dataUrl: options.dataUrl,
      }
    );

    return result;
  }

  // ==========================================================================
  // Generic Filesystem Operations (Phase 2)
  // ==========================================================================

  /**
   * Read file contents
   * @param path Absolute path to the file
   * @returns File contents as Uint8Array
   */
  async readFile(path: string): Promise<Uint8Array> {
    const base64 = await this.client.request<string>(
      HAEXTENSION_METHODS.filesystem.readFile,
      { path }
    );
    return base64ToArrayBuffer(base64);
  }

  /**
   * Write file contents
   * @param path Absolute path to the file
   * @param data File contents as Uint8Array
   */
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const base64 = arrayBufferToBase64(data);
    await this.client.request(
      HAEXTENSION_METHODS.filesystem.writeFile,
      { path, data: base64 }
    );
  }

  /**
   * Read directory contents
   * @param path Absolute path to the directory
   * @returns Array of directory entries
   */
  async readDir(path: string): Promise<DirEntry[]> {
    return this.client.request<DirEntry[]>(
      HAEXTENSION_METHODS.filesystem.readDir,
      { path }
    );
  }

  /**
   * Create a directory (and parent directories if needed)
   * @param path Absolute path to create
   */
  async mkdir(path: string): Promise<void> {
    await this.client.request(
      HAEXTENSION_METHODS.filesystem.mkdir,
      { path }
    );
  }

  /**
   * Remove a file or directory
   * @param path Absolute path to remove
   * @param recursive If true, remove directories recursively
   */
  async remove(path: string, recursive = false): Promise<void> {
    await this.client.request(
      HAEXTENSION_METHODS.filesystem.remove,
      { path, recursive }
    );
  }

  /**
   * Check if a path exists
   * @param path Absolute path to check
   * @returns True if the path exists
   */
  async exists(path: string): Promise<boolean> {
    return this.client.request<boolean>(
      HAEXTENSION_METHODS.filesystem.exists,
      { path }
    );
  }

  /**
   * Get file/directory metadata
   * @param path Absolute path
   * @returns File metadata
   */
  async stat(path: string): Promise<FileStat> {
    return this.client.request<FileStat>(
      HAEXTENSION_METHODS.filesystem.stat,
      { path }
    );
  }

  /**
   * Open a folder selection dialog
   * @param options Dialog options
   * @returns Selected folder path, or null if cancelled
   */
  async selectFolder(options: SelectFolderOptions = {}): Promise<string | null> {
    return this.client.request<string | null, SelectFolderOptions>(
      HAEXTENSION_METHODS.filesystem.selectFolder,
      options
    );
  }

  /**
   * Open a file selection dialog
   * @param options Dialog options
   * @returns Selected file paths, or null if cancelled
   */
  async selectFile(options: SelectFileOptions = {}): Promise<string[] | null> {
    return this.client.request<string[] | null, SelectFileOptions>(
      HAEXTENSION_METHODS.filesystem.selectFile,
      options
    );
  }

  /**
   * Rename/move a file or directory
   * @param from Source path
   * @param to Destination path
   */
  async rename(from: string, to: string): Promise<void> {
    await this.client.request(
      HAEXTENSION_METHODS.filesystem.rename,
      { from, to }
    );
  }

  /**
   * Copy a file
   * @param from Source path
   * @param to Destination path
   */
  async copy(from: string, to: string): Promise<void> {
    await this.client.request(
      HAEXTENSION_METHODS.filesystem.copy,
      { from, to }
    );
  }
}
