//! Producing `haextension/signature.json` and the signed message.

use std::collections::BTreeMap;

use ed25519_dalek::pkcs8::DecodePrivateKey;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{BundleError, ErrorKind, Result};
use crate::format::{limits, PathChecker, BUNDLE_FORMAT, MANIFEST_PATH, SIGNATURE_PATH};
use crate::jcs::{self, JsonValue};
use crate::Entry;

/// One file as `signature.json` lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SignedFile {
    pub path: String,
    /// Lower-case hex.
    pub sha256: String,
    pub size: u64,
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok())
        .collect()
}

/// Path, size and SHA-256 of each entry, ordered by the UTF-8 bytes of the path.
pub fn describe_files<'a>(entries: impl IntoIterator<Item = &'a Entry>) -> Vec<SignedFile> {
    let mut files: Vec<SignedFile> = entries
        .into_iter()
        .map(|e| SignedFile {
            path: e.path.clone(),
            sha256: hex(&Sha256::digest(&e.data)),
            size: e.data.len() as u64,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

fn body(files: &[SignedFile], public_key: &str) -> BTreeMap<String, JsonValue> {
    let files = files
        .iter()
        .map(|f| {
            JsonValue::Object(BTreeMap::from([
                ("path".to_owned(), JsonValue::String(f.path.clone())),
                ("sha256".to_owned(), JsonValue::String(f.sha256.clone())),
                (
                    "size".to_owned(),
                    JsonValue::Int(i64::try_from(f.size).unwrap_or(i64::MAX)),
                ),
            ]))
        })
        .collect();
    BTreeMap::from([
        ("files".to_owned(), JsonValue::Array(files)),
        (
            "format".to_owned(),
            JsonValue::String(BUNDLE_FORMAT.to_owned()),
        ),
        (
            "publicKey".to_owned(),
            JsonValue::String(public_key.to_owned()),
        ),
    ])
}

/// The signed message: `"haextension-bundle/2\n"` followed by the canonical form of
/// `signature.json` without `signature`.
pub fn signature_message(files: &[SignedFile], public_key: &str) -> Vec<u8> {
    let json = jcs::canonical_bytes(&JsonValue::Object(body(files, public_key)))
        .expect("file sizes of a bundle are safe integers");
    let mut message = format!("{BUNDLE_FORMAT}\n").into_bytes();
    message.extend_from_slice(&json);
    message
}

/// Reads an Ed25519 private key in PKCS#8 DER, as `haex keygen` writes it.
pub fn signing_key_from_pkcs8(der: &[u8]) -> Result<SigningKey> {
    SigningKey::from_pkcs8_der(der).map_err(|e| {
        BundleError::new(
            ErrorKind::SignatureInvalid,
            format!("private key is not an Ed25519 PKCS#8 key: {e}"),
        )
    })
}

/// Signs a bundle. `files` are the app files (no control files); `manifest` must be a JSON object
/// without `signature`, and its `publicKey` is set from the key. Returns every archive entry,
/// control files included, in UTF-8 byte order of their paths.
pub fn sign_entries(
    files: Vec<Entry>,
    manifest: JsonValue,
    key: &SigningKey,
) -> Result<Vec<Entry>> {
    let JsonValue::Object(mut manifest) = manifest else {
        return Err(BundleError::at(
            ErrorKind::ManifestInvalid,
            "manifest is not a JSON object",
            MANIFEST_PATH,
        ));
    };
    if manifest.contains_key("signature") {
        return Err(BundleError::at(
            ErrorKind::ManifestInvalid,
            "manifest must not contain a signature field (format v2)",
            MANIFEST_PATH,
        ));
    }
    let public_key = hex(VerifyingKey::from(key).as_bytes());
    manifest.insert("publicKey".into(), JsonValue::String(public_key.clone()));
    let manifest_bytes = jcs::canonical_bytes(&JsonValue::Object(manifest)).map_err(|e| {
        BundleError::at(
            ErrorKind::ManifestNotCanonical,
            format!("manifest is not restricted JSON: {e}"),
            MANIFEST_PATH,
        )
    })?;

    let mut listed = files;
    listed.push(Entry {
        path: MANIFEST_PATH.into(),
        data: manifest_bytes,
    });
    // The limits a host applies, checked before hashing and writing (`signature.json` counts too).
    if listed.len() + 1 > limits::ENTRIES {
        return Err(BundleError::new(
            ErrorKind::ArchiveTooLarge,
            format!(
                "{} entries, at most {} allowed",
                listed.len() + 1,
                limits::ENTRIES
            ),
        ));
    }
    let mut checker = PathChecker::default();
    let mut total: u64 = 0;
    for entry in &listed {
        if entry.path == SIGNATURE_PATH {
            return Err(BundleError::at(
                ErrorKind::EntryPathInvalid,
                format!("{SIGNATURE_PATH} is reserved"),
                SIGNATURE_PATH,
            ));
        }
        checker.check(&entry.path)?;
        let size = entry.data.len() as u64;
        if size > limits::ENTRY_BYTES {
            return Err(BundleError::at(
                ErrorKind::EntryTooLarge,
                format!(
                    "{} is larger than {} bytes",
                    entry.path,
                    limits::ENTRY_BYTES
                ),
                entry.path.clone(),
            ));
        }
        total += size;
        if total > limits::TOTAL_BYTES {
            return Err(BundleError::new(
                ErrorKind::ArchiveTooLarge,
                format!("content is larger than {} bytes", limits::TOTAL_BYTES),
            ));
        }
    }

    let described = describe_files(&listed);
    let signature = key.sign(&signature_message(&described, &public_key));
    let mut signature_file = body(&described, &public_key);
    signature_file.insert(
        "signature".into(),
        JsonValue::String(hex(&signature.to_bytes())),
    );
    listed.push(Entry {
        path: SIGNATURE_PATH.into(),
        data: jcs::canonical_bytes(&JsonValue::Object(signature_file))
            .expect("signature.json is restricted JSON"),
    });
    listed.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(listed)
}
