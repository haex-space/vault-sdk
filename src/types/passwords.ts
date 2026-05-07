/**
 * Types for the core passwords vault.
 *
 * Mirrors the Rust types in `src-tauri/src/passwords/commands.rs`. The
 * extension's view is scoped by the `passwords` permission's `target`
 * field — items outside the granted tag scope are not visible.
 */

export interface PasswordKeyValue {
  id: string;
  key?: string;
  value?: string;
}

/** Lean view returned by `list` — no secret fields. */
export interface PasswordItemSummary {
  id: string;
  title?: string;
  username?: string;
  url?: string;
  icon?: string;
  color?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Full item with secrets, returned by `read`. */
export interface PasswordItemFull {
  id: string;
  title?: string;
  username?: string;
  password?: string;
  note?: string;
  icon?: string;
  color?: string;
  url?: string;

  otpSecret?: string;
  otpDigits?: number;
  otpPeriod?: number;
  otpAlgorithm?: string;

  /** Maps canonical field names to autofill aliases. */
  autofillAliases?: Record<string, string[]>;

  tags: string[];
  keyValues: PasswordKeyValue[];

  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PasswordKeyValueInput {
  key?: string;
  value?: string;
}

/** Input for `create` and `update`. `tags` must contain >=1 in scope. */
export interface PasswordInput {
  title?: string;
  username?: string;
  password?: string;
  note?: string;
  icon?: string;
  color?: string;
  url?: string;
  otpSecret?: string;
  otpDigits?: number;
  otpPeriod?: number;
  otpAlgorithm?: string;
  autofillAliases?: Record<string, string[]>;
  expiresAt?: string;
  tags: string[];
  keyValues?: PasswordKeyValueInput[];
}
