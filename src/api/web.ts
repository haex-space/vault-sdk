import type { HaexVaultSdk } from "../client";
import type { WebRequestOptions, WebResponse } from "../types";
import { WEB_COMMANDS } from "../commands";

export class WebAPI {
  constructor(private client: HaexVaultSdk) {}

  /**
   * Performs a web request through the HaexHub host application
   * @param url The URL to fetch
   * @param options Request options (method, headers, body, timeout)
   * @returns Promise resolving to the web response
   */
  async fetchAsync(url: string, options: WebRequestOptions = {}): Promise<WebResponse> {
    // Convert body to base64 if it's an ArrayBuffer or Blob
    let bodyParam: string | undefined;

    if (options.body) {
      if (options.body instanceof ArrayBuffer) {
        bodyParam = this.arrayBufferToBase64(options.body);
      } else if (options.body instanceof Blob) {
        bodyParam = await this.blobToBase64(options.body);
      } else {
        // String body — encode as UTF-8 then base64. The host always decodes
        // request bodies from base64, so raw strings must not be passed through.
        const bytes = new TextEncoder().encode(options.body);
        bodyParam = this.arrayBufferToBase64(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        );
      }
    }

    const response = await this.client.request<{
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string; // Base64 encoded
      url: string;
    }>(WEB_COMMANDS.fetch, {
      url,
      method: options.method || "GET",
      headers: options.headers,
      body: bodyParam,
      timeout: options.timeout,
    });

    // Convert base64 body back to ArrayBuffer
    const bodyBuffer = this.base64ToArrayBuffer(response.body);

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: bodyBuffer,
      url: response.url,
    };
  }

  /**
   * Convenience method for JSON requests
   */
  async fetchJsonAsync<T = unknown>(
    url: string,
    options: WebRequestOptions = {}
  ): Promise<T> {
    const response = await this.fetchAsync(url, options);
    const text = new TextDecoder().decode(response.body);
    return JSON.parse(text) as T;
  }

  /**
   * Convenience method for text requests
   */
  async fetchTextAsync(url: string, options: WebRequestOptions = {}): Promise<string> {
    const response = await this.fetchAsync(url, options);
    return new TextDecoder().decode(response.body);
  }

  /**
   * Convenience method for blob requests
   */
  async fetchBlobAsync(url: string, options: WebRequestOptions = {}): Promise<Blob> {
    const response = await this.fetchAsync(url, options);
    return new Blob([response.body]);
  }

  /**
   * Opens a URL in the user's default browser
   * @param url The URL to open
   */
  async openAsync(url: string): Promise<void> {
    await this.client.request<void>(WEB_COMMANDS.open, { url });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      const byte = bytes[i];
      if (byte === undefined) {
        throw new Error('Invalid byte at index ' + i);
      }
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read blob as data URL'));
          return;
        }
        const parts = result.split(',');
        const base64 = parts[1];
        if (!base64) {
          reject(new Error('Failed to extract base64 from data URL'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
