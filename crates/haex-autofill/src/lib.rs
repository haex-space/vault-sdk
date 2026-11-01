//! The autofill rule of haex-pass: which field of a web form gets which field of a
//! password-manager entry.
//!
//! This is the one implementation of the rule. holzi uses it natively (its agent browser fills
//! logins, bank and card data), the browser extension haex-pass-browser uses its WebAssembly build
//! (feature `wasm`). Values never pass through the rule: the input is what a page tells about its
//! fields ([`FieldFacts`]) and the keys of an entry ([`EntryKeys`]); the output says which key goes
//! into which field ([`Target`]). The caller writes the values.
//!
//! The order for one field ([`map_field`]):
//!
//! 1. an entry key equal to the field's identifier (exact case first, then any case);
//! 2. for a card field (`autocomplete` `cc-name`, `cc-number`, `cc-exp`, `cc-exp-month`,
//!    `cc-exp-year`, `cc-csc`), the key whose own aliases name that token, else an own alias for
//!    the field's identifier, else the key whose name is a common name of that card field;
//! 3. a one-time-code field gets [`Target::Otp`]: the current code, never the entry's `otp` marker;
//! 4. the key whose aliases (the entry's own, else the defaults) name the field's identifier;
//! 5. by the field's kind: `username`, `email`, `login` or `user` for a username or email field,
//!    `password`, `pass` or `pwd` for a password field.

mod aliases;
mod kind;
mod mapping;
#[cfg(feature = "wasm")]
mod wasm;

pub use aliases::{card_token, default_aliases, CARD_FIELDS, DEFAULT_ALIASES};
pub use kind::{field_identifier, field_kind, FieldFacts, FieldKind};
pub use mapping::{is_otp_field, map_field, map_fields, shows_icon, EntryKeys, Target, OTP_KEY};
