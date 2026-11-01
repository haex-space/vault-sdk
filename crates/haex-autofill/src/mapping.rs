//! Which key of an entry goes into which field.

use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};

use crate::aliases::{card_token, default_aliases, is_card_key, DEFAULT_ALIASES};
use crate::kind::{field_identifier, field_kind, FieldFacts, FieldKind};

/// The entry key that marks a TOTP. It is never a value to type.
pub const OTP_KEY: &str = "otp";

/// What the rule knows about an entry: names, never values.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EntryKeys {
    /// The keys of the entry's fields that hold a value, in the entry's order.
    pub keys: Vec<String>,
    /// The entry's own autofill aliases per key; they replace the defaults of that key.
    #[serde(deserialize_with = "null_as_empty")]
    pub aliases: BTreeMap<String, Vec<String>>,
    /// Whether the entry has a TOTP secret.
    pub has_totp: bool,
}

/// What a field gets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "key", rename_all = "camelCase")]
pub enum Target {
    /// The value of this entry key.
    Key(String),
    /// The current one-time code of the entry's TOTP.
    Otp,
}

fn null_as_empty<'de, D>(deserializer: D) -> Result<BTreeMap<String, Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::deserialize(deserializer)?.unwrap_or_default())
}

impl EntryKeys {
    /// The keys that can be typed: every key but the TOTP marker.
    fn typeable(&self) -> impl Iterator<Item = &str> {
        self.keys
            .iter()
            .map(String::as_str)
            .filter(|key| *key != OTP_KEY)
    }

    /// The typeable key named `wanted`: same case first, then any case.
    fn find(&self, wanted: &str) -> Option<&str> {
        let lower = wanted.to_lowercase();
        self.typeable()
            .find(|key| *key == wanted)
            .or_else(|| self.typeable().find(|key| key.to_lowercase() == lower))
    }

    /// The entry's own aliases of `key`, else its defaults.
    fn aliases_of<'a>(&'a self, key: &str) -> Vec<&'a str> {
        match self.aliases.get(key) {
            Some(own) => own.iter().map(String::as_str).collect(),
            None => default_aliases(key).unwrap_or_default().to_vec(),
        }
    }

    fn own_aliases_name(&self, key: &str, name: &str) -> bool {
        let lower = name.to_lowercase();
        self.aliases
            .get(key)
            .is_some_and(|own| own.iter().any(|alias| alias.to_lowercase() == lower))
    }
}

fn names(aliases: &[&str], lower: &str) -> bool {
    aliases.iter().any(|alias| alias.to_lowercase() == lower)
}

/// Whether `field` takes a one-time code. `aliases` are an entry's own aliases; its `otp` aliases
/// replace the defaults.
pub fn is_otp_field(field: &FieldFacts, aliases: Option<&BTreeMap<String, Vec<String>>>) -> bool {
    if card_token(&field.autocomplete).is_some() {
        return false;
    }
    if field_kind(field) == FieldKind::Otp {
        return true;
    }
    let identifier = field_identifier(field).to_lowercase();
    let otp_aliases: Vec<&str> = match aliases.and_then(|own| own.get(OTP_KEY)) {
        Some(own) => own.iter().map(String::as_str).collect(),
        None => default_aliases(OTP_KEY).unwrap_or_default().to_vec(),
    };
    identifier == OTP_KEY || names(&otp_aliases, &identifier)
}

/// What `field` gets from `entry`, in the order described in the crate documentation.
pub fn map_field(field: &FieldFacts, entry: &EntryKeys) -> Option<Target> {
    let identifier = field_identifier(field);
    if let Some(key) = entry.find(&identifier) {
        return Some(Target::Key(key.to_owned()));
    }

    if let Some(token) = card_token(&field.autocomplete) {
        let key = entry
            .typeable()
            .find(|key| entry.own_aliases_name(key, token))
            .or_else(|| {
                entry
                    .typeable()
                    .find(|key| entry.own_aliases_name(key, &identifier))
            })
            .or_else(|| entry.typeable().find(|key| is_card_key(token, key)));
        if let Some(key) = key {
            return Some(Target::Key(key.to_owned()));
        }
    }

    if is_otp_field(field, Some(&entry.aliases)) {
        return Some(Target::Otp);
    }

    let lower = identifier.to_lowercase();
    if let Some(key) = entry
        .typeable()
        .find(|key| names(&entry.aliases_of(key), &lower))
    {
        return Some(Target::Key(key.to_owned()));
    }

    let fallback: &[&str] = match field_kind(field) {
        FieldKind::Username | FieldKind::Email => &["username", "email", "login", "user"],
        FieldKind::Password => &["password", "pass", "pwd"],
        FieldKind::Otp | FieldKind::Text => &[],
    };
    fallback
        .iter()
        .find_map(|wanted| entry.find(wanted))
        .map(|key| Target::Key(key.to_owned()))
}

/// [`map_field`] for every field of a form, in the same order.
pub fn map_fields(fields: &[FieldFacts], entry: &EntryKeys) -> Vec<Option<Target>> {
    fields.iter().map(|field| map_field(field, entry)).collect()
}

/// Whether the extension offers to fill `field` with one of `entries` (the entries that match the
/// page): a card field when an entry maps to it, a one-time-code field when an entry has a TOTP,
/// a field named like a standard key or its default aliases always, any other field when an
/// entry has a key or an own alias for it.
pub fn shows_icon(field: &FieldFacts, entries: &[EntryKeys]) -> bool {
    if card_token(&field.autocomplete).is_some() {
        return entries
            .iter()
            .any(|entry| map_field(field, entry).is_some());
    }
    if is_otp_field(field, None)
        || entries
            .iter()
            .any(|entry| is_otp_field(field, Some(&entry.aliases)))
    {
        return entries.iter().any(|entry| entry.has_totp);
    }

    let identifier = field_identifier(field);
    let lower = identifier.to_lowercase();
    if DEFAULT_ALIASES
        .iter()
        .any(|(key, aliases)| *key == lower || names(aliases, &lower))
    {
        return true;
    }

    entries.iter().any(|entry| {
        entry.find(&identifier).is_some()
            || entry
                .typeable()
                .any(|key| entry.own_aliases_name(key, &lower))
    })
}
