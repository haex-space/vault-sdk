/**
 * The autofill rule of haex-pass (`@haex-space/vault-sdk/autofill`): which field of a web form gets
 * which field of a password-manager entry. Its one implementation is the Rust crate
 * `crates/haex-autofill`, which holzi uses natively; this entry is its WebAssembly build, carried
 * in the entry's own code, so it works in a browser extension's content script, its pages and
 * Node.js.
 *
 * Call `initAutofill()` once and await it (browsers refuse to compile larger modules on the main
 * thread synchronously); the functions are synchronous afterwards and throw before. Values never
 * pass through the rule: the input is what a page tells about its fields and the keys of an
 * entry, the output says which key goes into which field.
 */
import init, {
  fieldIdentifier as rawFieldIdentifier,
  fieldKind as rawFieldKind,
  isOtpField as rawIsOtpField,
  mapFields as rawMapFields,
  showsIcon as rawShowsIcon,
} from "./wasm/haex_autofill";
import { MODULE_BASE64 } from "./wasm/module";
import { moduleBytes } from "../wasmModule";

/** What a page tells about one input field. */
export interface FieldFacts {
  /** The `type` attribute (`text`, `password`, `email`, …). */
  inputType?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
}

/** The keys of an entry's fields that hold a value, its own aliases and whether it has a TOTP. */
export interface EntryKeys {
  keys: string[];
  /** The entry's own autofill aliases per key; they replace the defaults of that key. */
  aliases?: Record<string, string[]> | null;
  hasTotp?: boolean;
}

/** What a field gets: the value of an entry key, or the entry's current one-time code. */
export type Target = { kind: "key"; key: string } | { kind: "otp" };

/** What a field asks for. */
export type FieldKind = "username" | "password" | "email" | "otp" | "text";

let ready: Promise<void> | null = null;
let initialised = false;

/** Loads the module; later calls return the same promise. */
export function initAutofill(): Promise<void> {
  ready ??= init({ module_or_path: moduleBytes(MODULE_BASE64) }).then(() => {
    initialised = true;
  });
  return ready;
}

function loaded(): void {
  if (!initialised) throw new Error("haex-autofill is not loaded yet; await initAutofill() first");
}

/** The kind of a field. */
export function fieldKind(field: FieldFacts): FieldKind {
  loaded();
  return rawFieldKind(JSON.stringify(field)) as FieldKind;
}

/** The identifier the rule matches entry keys against. */
export function fieldIdentifier(field: FieldFacts): string {
  loaded();
  return rawFieldIdentifier(JSON.stringify(field));
}

/** Whether a field takes a one-time code; `aliases` are the entry's own aliases, if any. */
export function isOtpField(field: FieldFacts, aliases?: Record<string, string[]> | null): boolean {
  loaded();
  return rawIsOtpField(JSON.stringify(field), JSON.stringify(aliases ?? null));
}

/** The target of every field for `entry`, in the order of `fields`; `null` leaves a field empty. */
export function mapFields(fields: FieldFacts[], entry: EntryKeys): (Target | null)[] {
  loaded();
  return JSON.parse(rawMapFields(JSON.stringify(fields), JSON.stringify(normalised(entry)))) as (Target | null)[];
}

/** Whether to offer filling `field` with one of `entries`, the entries that match the page. */
export function showsIcon(field: FieldFacts, entries: EntryKeys[]): boolean {
  loaded();
  return rawShowsIcon(JSON.stringify(field), JSON.stringify(entries.map(normalised)));
}

function normalised(entry: EntryKeys): Required<EntryKeys> {
  return { keys: entry.keys, aliases: entry.aliases ?? null, hasTotp: entry.hasTotp ?? false };
}
