//! WebAssembly interface for the browser extension haex-pass-browser. The configuration crosses the
//! boundary as JSON text in the shape of [`GeneratorConfig`] (camelCase).

use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::GeneratorConfig;

/// A password for `config`: `{"value": …}`, or `{"error": code}` when the configuration allows no
/// password (`length_range`, `no_class`, `length_below_classes`, `class_empty`, `pattern_empty`).
#[wasm_bindgen(js_name = generatePassword)]
pub fn generate_password(config: &str) -> Result<String, JsError> {
    let config: GeneratorConfig =
        serde_json::from_str(config).map_err(|error| JsError::new(&format!("config: {error}")))?;
    let result = match crate::generate_password(&config) {
        Ok(value) => json!({ "value": value }),
        Err(error) => json!({ "error": error.as_str() }),
    };
    Ok(result.to_string())
}
