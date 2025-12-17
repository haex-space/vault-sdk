import type { HaexVaultSdk } from "../client";
import { HAEXTENSION_METHODS } from "../methods";
import { FileSyncAPI } from "./filesync";

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

export class FilesystemAPI {
  public readonly sync: FileSyncAPI;

  constructor(private client: HaexVaultSdk) {
    this.sync = new FileSyncAPI(client);
  }

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
}
