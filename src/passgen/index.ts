/**
 * The password generator of haex-pass (`@haex-space/vault-sdk/passgen`): length, character
 * classes and excluded characters, or a pattern. Its one implementation is the Rust crate
 * `crates/haex-passgen`, which holzi uses natively; this entry is its WebAssembly build, carried in
 * the entry's own code. The randomness comes from `crypto.getRandomValues`.
 *
 * Call `initPassgen()` once and await it; `generatePassword` is synchronous afterwards and throws
 * before.
 */
import init, { generatePassword as rawGeneratePassword } from "./wasm/haex_passgen";
import { MODULE_BASE64 } from "./wasm/module";
import { moduleBytes } from "../wasmModule";

/** What to generate: the shape of a saved generator preset. Missing fields take the defaults. */
export interface GeneratorConfig {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeChars?: string;
  usePattern?: boolean;
  pattern?: string;
}

/** Why a configuration allows no password. */
export type GeneratorError = "length_range" | "no_class" | "length_below_classes" | "class_empty" | "pattern_empty";

/** A password, or what has to change. */
export type Generated = { value: string } | { error: GeneratorError };

/** 20 characters of all four classes. */
export const DEFAULT_CONFIG: Required<GeneratorConfig> = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeChars: "",
  usePattern: false,
  pattern: "",
};

let ready: Promise<void> | null = null;
let initialised = false;

/** Loads the module; later calls return the same promise. */
export function initPassgen(): Promise<void> {
  ready ??= init({ module_or_path: moduleBytes(MODULE_BASE64) }).then(() => {
    initialised = true;
  });
  return ready;
}

/** A password for `config`, or the code of what has to change. */
export function generatePassword(config: GeneratorConfig): Generated {
  if (!initialised) throw new Error("haex-passgen is not loaded yet; await initPassgen() first");
  return JSON.parse(rawGeneratePassword(JSON.stringify({ ...DEFAULT_CONFIG, ...config }))) as Generated;
}
