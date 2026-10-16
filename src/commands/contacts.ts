/**
 * Contacts Commands
 *
 * Commands for the host's address book. Extensions only read; they are scoped
 * by their `contacts` permissions (`action` = `read`, `target` = a group name
 * or "*").
 *
 * Naming convention: `extension_contacts_<action>`
 */

export const CONTACT_COMMANDS = {
  /** Contacts in scope, a page at a time, optionally of one group */
  list: "extension_contacts_list",
  /** One contact with all its values, by id */
  read: "extension_contacts_read",
  /** Contacts in scope whose name, organization, phone or e-mail matches */
  search: "extension_contacts_search",
  /** The JPEG of a contact's photo, by its hash */
  photo: "extension_contacts_photo",
} as const;

export type ContactCommand = (typeof CONTACT_COMMANDS)[keyof typeof CONTACT_COMMANDS];
