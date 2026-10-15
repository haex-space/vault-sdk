/**
 * Types for the host's address book.
 *
 * Mirrors the answers of `src-tauri/src/extensions/contacts.rs` in holzi. The
 * extension's view is scoped by its `contacts` permissions: a contact outside
 * them answers exactly like a missing one (`PermissionErrorCode.DENIED`).
 */

/** What lists and searches return of a contact. */
export interface ContactSummary {
  id: string;
  displayName: string;
  organization: string | null;
  phones: string[];
  emails: string[];
  /** Group names. */
  groups: string[];
  /** Hash of the photo; its bytes come from `photoAsync`. */
  photo: string | null;
}

/**
 * One value of a contact: a phone number, an address, a custom field, … The
 * set of kinds is open; a kind the extension does not know is passed through.
 */
export interface ContactValue {
  kind: string;
  label: string;
  value: string;
}

/** A device of a vault, from its Visitenkarte. */
export interface ContactHolziDevice {
  /** Hex. */
  devicePubkey: string;
  /** The iroh endpoint id, hex. */
  endpointId: string;
  irohRelay: string | null;
}

/** The confirmed holzi addresses of a contact, from its Visitenkarte. */
export interface ContactHolziAddresses {
  /** The vault identity, hex. */
  vault: string;
  /** The vault identity as `npub1…`. */
  npub: string;
  devices: ContactHolziDevice[];
  nostrRelays: string[];
}

/** Everything of a contact an extension may read. */
export interface ContactDetail {
  id: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  middleName: string | null;
  namePrefix: string | null;
  nameSuffix: string | null;
  nickname: string | null;
  organization: string | null;
  jobTitle: string | null;
  note: string | null;
  values: ContactValue[];
  /** Group names. */
  groups: string[];
  photo: string | null;
  holziAddresses: ContactHolziAddresses | null;
  updatedAt: string;
}

export interface ContactListOptions {
  /** Only the contacts of the group with this name. */
  group?: string;
  offset?: number;
  /** At most this many; the host's default is 100, its maximum 1000. */
  limit?: number;
}

export interface ContactList {
  contacts: ContactSummary[];
  /** All contacts in scope (of the group), not only this page. */
  total: number;
}
