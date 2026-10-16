import type { HaexVaultSdk } from "../client";
import type {
  ContactDetail,
  ContactList,
  ContactListOptions,
  ContactSummary,
} from "../types/contacts";
import { CONTACT_COMMANDS } from "../commands/contacts";
import { base64ToArrayBuffer } from "../crypto/vaultKey";

/**
 * Read access to the host's address book, scoped by the extension's
 * `contacts` permissions (`action` = `read`, `target` = a group name or "*").
 * Extensions cannot change contacts. A contact outside the scope answers like
 * a missing one, so an extension never learns whether it exists.
 */
export class ContactsAPI {
  constructor(private client: HaexVaultSdk) {}

  /** One page of the contacts in scope, optionally of one group. */
  async listAsync(options: ContactListOptions = {}): Promise<ContactList> {
    return this.client.request<ContactList>(CONTACT_COMMANDS.list, {
      ...options,
    });
  }

  /** One contact with all its values. */
  async readAsync(id: string): Promise<ContactDetail> {
    return this.client.request<ContactDetail>(CONTACT_COMMANDS.read, { id });
  }

  /**
   * The contacts in scope whose name, organization, phone number or e-mail
   * address contains `query`, regardless of case and accents. The host's
   * default limit is 20, its maximum 200.
   */
  async searchAsync(query: string, limit?: number): Promise<ContactSummary[]> {
    const answer = await this.client.request<{ contacts: ContactSummary[] }>(
      CONTACT_COMMANDS.search,
      limit === undefined ? { query } : { query, limit },
    );
    return answer.contacts;
  }

  /** The JPEG of a photo a readable contact uses, by its hash. */
  async photoAsync(hash: string): Promise<Uint8Array> {
    const base64 = await this.client.request<string>(CONTACT_COMMANDS.photo, {
      hash,
    });
    return base64ToArrayBuffer(base64);
  }
}
