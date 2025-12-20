import type { HaexVaultSdk } from "~/client";
import { WEB_STORAGE_COMMANDS } from "~/commands";

export class StorageAPI {
  constructor(private client: HaexVaultSdk) {}

  async getItem(key: string): Promise<string | null> {
    return this.client.request<string | null>(WEB_STORAGE_COMMANDS.getItem, { key });
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.client.request(WEB_STORAGE_COMMANDS.setItem, { key, value });
  }

  async removeItem(key: string): Promise<void> {
    await this.client.request(WEB_STORAGE_COMMANDS.removeItem, { key });
  }

  async clear(): Promise<void> {
    await this.client.request(WEB_STORAGE_COMMANDS.clear);
  }

  async keys(): Promise<string[]> {
    return this.client.request<string[]>(WEB_STORAGE_COMMANDS.keys);
  }
}
