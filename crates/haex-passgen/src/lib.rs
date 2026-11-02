//! The password generator of haex-pass: a password from a length, character classes and excluded
//! characters, or from a pattern.
//!
//! This is the one implementation of the generator. holzi uses it natively (its window and its
//! agent browser, which creates new logins), the browser extension haex-pass-browser uses its
//! WebAssembly build (feature `wasm`).
//!
//! - The choice has no modulo bias: draws in the uneven tail of the 32 bit range are dropped
//!   ([`random_index`]).
//! - Every chosen class occurs at least once; the guaranteed characters are shuffled into place.
//! - A configuration that allows no output is an error ([`GeneratorError`]), never an empty
//!   password.
//! - In pattern mode `c C v V d a A s` stand for a character of a class, a backslash takes the
//!   next character as it is, everything else stays; the length and the excluded characters do not
//!   apply.

mod generator;
#[cfg(feature = "wasm")]
mod wasm;

pub use generator::{
    generate_password, generate_with, random_index, GeneratorConfig, GeneratorError, CLASS_CHARS,
    MAX_LENGTH, MIN_LENGTH, PATTERN_CHARS,
};
