//! WebAssembly interface for the `haex` tool (`src/bundle/index.ts`). Results and errors cross the
//! boundary as JSON text, so the TypeScript side needs no generated types beyond strings and bytes.

use serde_json::json;
use wasm_bindgen::prelude::*;

use crate::error::BundleError;
use crate::{jcs, Entry, VerifiedBundle};

fn error_json(error: &BundleError) -> String {
    serde_json::to_string(error).expect("a bundle error serializes")
}

fn verified_json(bundle: &VerifiedBundle) -> String {
    json!({
        "valid": true,
        "manifest": serde_json::Value::from(&jcs::JsonValue::Object(bundle.manifest.clone())),
        "files": bundle.files,
        "migrations": bundle.migrations.iter().map(|m| json!({"name": m.name, "path": m.path})).collect::<Vec<_>>(),
    })
    .to_string()
}

/// Verifies a `.xt` archive exactly like a host does. Returns
/// `{"valid":true,"manifest":…,"files":[…],"migrations":[…]}` or
/// `{"valid":false,"kind":…,"message":…,"path"?:…}`.
#[wasm_bindgen(js_name = verifyArchive)]
pub fn verify_archive(archive: &[u8]) -> String {
    match crate::verify_archive(archive) {
        Ok(bundle) => verified_json(&bundle),
        Err(error) => {
            let mut value = serde_json::to_value(&error).expect("a bundle error serializes");
            value["valid"] = json!(false);
            value.to_string()
        }
    }
}

/// Largest archive a host accepts, so callers can refuse a bigger file before reading it.
#[wasm_bindgen(js_name = maxArchiveBytes)]
pub fn max_archive_bytes() -> f64 {
    crate::format::limits::ARCHIVE_BYTES as f64
}

/// Collects the files of a bundle and builds the signed archive.
#[wasm_bindgen]
#[derive(Default)]
pub struct BundleBuilder {
    files: Vec<Entry>,
}

#[wasm_bindgen]
impl BundleBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds an app file (no control file).
    #[wasm_bindgen(js_name = addFile)]
    pub fn add_file(&mut self, path: String, data: Vec<u8>) {
        self.files.push(Entry { path, data });
    }

    /// Signs with the PKCS#8 Ed25519 key, writes the archive and verifies it. `manifest_json` is
    /// the manifest without `signature`; its `publicKey` is set from the key. Throws the JSON of a
    /// `BundleError` (`{kind, message, path?}`).
    pub fn build(self, manifest_json: &str, private_key_pkcs8: &[u8]) -> Result<Vec<u8>, String> {
        let manifest = jcs::parse_restricted(manifest_json).map_err(|reason| {
            error_json(&BundleError::at(
                crate::ErrorKind::ManifestNotCanonical,
                format!("manifest is not restricted JSON: {reason}"),
                crate::format::MANIFEST_PATH,
            ))
        })?;
        let key = crate::signing_key_from_pkcs8(private_key_pkcs8).map_err(|e| error_json(&e))?;
        crate::build_archive(self.files, manifest, &key).map_err(|e| error_json(&e))
    }
}
