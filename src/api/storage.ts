import type { HaexVaultSdk } from "~/client";
import { HAEXTENSION_METHODS } from "~/methods";

export class StorageAPI {
  constructor(private client: HaexVaultSdk) {}

  async getItem(key: string): Promise<string | null> {
    return this.client.request<string | null>(HAEXTENSION_METHODS.storage.getItem, { key });
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.storage.setItem, { key, value });
  }

  async removeItem(key: string): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.storage.removeItem, { key });
  }

  async clear(): Promise<void> {
    await this.client.request(HAEXTENSION_METHODS.storage.clear);
  }

  async keys(): Promise<string[]> {
    return this.client.request<string[]>(HAEXTENSION_METHODS.storage.keys);
  }
}
