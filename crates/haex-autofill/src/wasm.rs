//! WebAssembly interface for the browser extension haex-pass-browser. Arguments and results cross
//! the boundary as JSON text in the shapes of [`FieldFacts`], [`EntryKeys`] and [`Target`]
//! (camelCase), so the TypeScript side needs no generated types beyond strings.

use std::collections::BTreeMap;

use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;

use crate::{EntryKeys, FieldFacts};

fn parse<T: DeserializeOwned>(what: &str, json: &str) -> Result<T, JsError> {
    serde_json::from_str(json).map_err(|error| JsError::new(&format!("{what}: {error}")))
}

/// The kind of a field: `"username"`, `"password"`, `"email"`, `"otp"` or `"text"`.
#[wasm_bindgen(js_name = fieldKind)]
pub fn field_kind(field: &str) -> Result<String, JsError> {
    Ok(crate::field_kind(&parse("field", field)?)
        .as_str()
        .to_owned())
}

/// The identifier the rule matches entry keys against.
#[wasm_bindgen(js_name = fieldIdentifier)]
pub fn field_identifier(field: &str) -> Result<String, JsError> {
    Ok(crate::field_identifier(&parse("field", field)?))
}

/// Whether a field takes a one-time code; `aliases` is the entry's own aliases or `null`.
#[wasm_bindgen(js_name = isOtpField)]
pub fn is_otp_field(field: &str, aliases: &str) -> Result<bool, JsError> {
    let field: FieldFacts = parse("field", field)?;
    let aliases: Option<BTreeMap<String, Vec<String>>> = parse("aliases", aliases)?;
    Ok(crate::is_otp_field(&field, aliases.as_ref()))
}

/// The target of every field, as a JSON array of `null`, `{"kind":"key","key":…}` or
/// `{"kind":"otp"}`.
#[wasm_bindgen(js_name = mapFields)]
pub fn map_fields(fields: &str, entry: &str) -> Result<String, JsError> {
    let fields: Vec<FieldFacts> = parse("fields", fields)?;
    let entry: EntryKeys = parse("entry", entry)?;
    serde_json::to_string(&crate::map_fields(&fields, &entry))
        .map_err(|error| JsError::new(&error.to_string()))
}

/// Whether the extension offers to fill a field with one of the entries that match the page.
#[wasm_bindgen(js_name = showsIcon)]
pub fn shows_icon(field: &str, entries: &str) -> Result<bool, JsError> {
    let field: FieldFacts = parse("field", field)?;
    let entries: Vec<EntryKeys> = parse("entries", entries)?;
    Ok(crate::shows_icon(&field, &entries))
}
