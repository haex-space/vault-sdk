/**
 * The address book API sends the bridge methods of holzi's `extensions/contacts.rs` with the
 * parameters the host reads, and unwraps its answers.
 */

import { describe, expect, it } from "vitest";
import type { HaexVaultSdk } from "../../client";
import { ContactsAPI } from "../contacts";

function fake(answer: unknown) {
  const requests: { method: string; params: unknown }[] = [];
  const sdk = {
    request: (method: string, params: unknown) => {
      requests.push({ method, params });
      return Promise.resolve(answer);
    },
  } as unknown as HaexVaultSdk;
  return { api: new ContactsAPI(sdk), requests };
}

describe("ContactsAPI", () => {
  it("lists a page of one group", async () => {
    const { api, requests } = fake({ contacts: [], total: 0 });
    await expect(api.listAsync({ group: "Arbeit", limit: 10 })).resolves.toEqual({ contacts: [], total: 0 });
    expect(requests).toEqual([{ method: "extension_contacts_list", params: { group: "Arbeit", limit: 10 } }]);
  });

  it("reads one contact by id", async () => {
    const { api, requests } = fake({ id: "c1" });
    await api.readAsync("c1");
    expect(requests).toEqual([{ method: "extension_contacts_read", params: { id: "c1" } }]);
  });

  it("returns the hits of a search and sends a limit only when given", async () => {
    const { api, requests } = fake({ contacts: [{ id: "c1" }] });
    await expect(api.searchAsync("anna")).resolves.toEqual([{ id: "c1" }]);
    await api.searchAsync("anna", 5);
    expect(requests.map((r) => r.params)).toEqual([{ query: "anna" }, { query: "anna", limit: 5 }]);
  });

  it("decodes the photo's Base64 into bytes", async () => {
    const { api, requests } = fake("/9j/AA==");
    await expect(api.photoAsync("h1")).resolves.toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
    expect(requests).toEqual([{ method: "extension_contacts_photo", params: { hash: "h1" } }]);
  });
});
