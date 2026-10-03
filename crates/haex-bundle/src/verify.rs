//! Verifying the content of a bundle once its archive entries have been read (steps 2 and 4–7 of
//! the check order; the archive-level rules are in [`crate::archive`]).

use std::collections::{BTreeMap, HashMap, HashSet};

use ed25519_dalek::{Signature, VerifyingKey};
use sha2::{Digest, Sha256};

use crate::error::{BundleError, ErrorKind, Result};
use crate::format::{
    path_rule_violation, PathChecker, BUNDLE_FORMAT, MANIFEST_PATH, SIGNATURE_PATH,
};
use crate::jcs::{self, JsonValue};
use crate::sign::{describe_files, from_hex, signature_message, SignedFile};
use crate::Entry;

/// A verified bundle.
#[derive(Debug, Clone)]
pub struct VerifiedBundle {
    /// The manifest; its bytes are canonical, so serializing it again yields [`Self::manifest_bytes`].
    pub manifest: BTreeMap<String, JsonValue>,
    pub manifest_bytes: Vec<u8>,
    pub signature_bytes: Vec<u8>,
    /// Lower-case hex of the Ed25519 public key.
    pub public_key: String,
    /// Every entry except `signature.json`, in UTF-8 byte order.
    pub files: Vec<SignedFile>,
    /// SHA-256 of the signed message; identifies this exact bundle.
    pub signed_message_sha256: [u8; 32],
    /// The migrations in the order they apply.
    pub migrations: Vec<Migration>,
    /// Every archive entry, `signature.json` included, in archive order.
    pub entries: Vec<Entry>,
}

impl VerifiedBundle {
    pub fn file(&self, path: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.path == path)
    }
}

/// One migration of the bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Migration {
    /// The journal tag, or the file name without `.sql` when there is no journal.
    pub name: String,
    pub path: String,
    pub sql: String,
}

/// The pre-v2 format: the manifest is JSON with a `signature` member. Callers check that there is
/// no `signature.json`.
pub(crate) fn is_legacy_manifest(bytes: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(bytes)
        .is_ok_and(|v| v.as_object().is_some_and(|o| o.contains_key("signature")))
}

/// FR-004 of holzi spec 017: lower-case letters, digits and hyphens, starting with a letter, no `__`.
pub fn is_valid_extension_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.contains("__")
}

/// A 32-byte Ed25519 public key in canonical encoding whose point is of large order.
pub fn strict_public_key(bytes: &[u8]) -> Option<VerifyingKey> {
    let bytes: [u8; 32] = bytes.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&bytes).ok()?;
    let canonical = key.to_edwards().compress().to_bytes() == bytes;
    (canonical && !key.is_weak()).then_some(key)
}

/// The group order L of Ed25519, little-endian.
const GROUP_ORDER: [u8; 32] = [
    0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10,
];

/// Strict Ed25519 verification: `verify_strict` (small-order R and A, canonical R) plus an own
/// check that S < L, which does not depend on the `legacy_compatibility` feature that Cargo could
/// switch on through another crate of the host.
pub fn verify_signature_strict(key: &VerifyingKey, message: &[u8], signature: &[u8; 64]) -> bool {
    let s = &signature[32..];
    let reduced = s.iter().rev().cmp(GROUP_ORDER.iter().rev()) == std::cmp::Ordering::Less;
    reduced
        && key
            .verify_strict(message, &Signature::from_bytes(signature))
            .is_ok()
}

fn is_hex(text: &str, len: usize) -> bool {
    text.len() == len && text.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn has_exact_keys(map: &BTreeMap<String, JsonValue>, keys: &[&str]) -> bool {
    map.len() == keys.len() && keys.iter().all(|k| map.contains_key(*k))
}

fn parse_control_file(
    entry: Option<&Entry>,
    path: &str,
    missing: ErrorKind,
    not_canonical: ErrorKind,
) -> Result<BTreeMap<String, JsonValue>> {
    let entry = entry.ok_or_else(|| BundleError::new(missing, format!("{path} is missing")))?;
    match jcs::parse_canonical(&entry.data) {
        Ok(JsonValue::Object(map)) => Ok(map),
        Ok(_) => Err(BundleError::at(
            missing,
            format!("{path} is not a JSON object"),
            path,
        )),
        Err(reason) => Err(BundleError::at(
            not_canonical,
            format!("{path}: {reason}"),
            path,
        )),
    }
}

struct SignatureFile {
    files: Vec<SignedFile>,
    public_key: String,
    signature: String,
}

fn parse_signature_file(value: &BTreeMap<String, JsonValue>) -> Result<SignatureFile> {
    let invalid = |reason: &str| {
        BundleError::at(
            ErrorKind::SignatureInvalid,
            format!("{SIGNATURE_PATH}: {reason}"),
            SIGNATURE_PATH,
        )
    };
    if !has_exact_keys(value, &["files", "format", "publicKey", "signature"]) {
        return Err(invalid("unexpected or missing members"));
    }
    if value["format"].as_str() != Some(BUNDLE_FORMAT) {
        return Err(invalid("format is not haextension-bundle/2"));
    }
    let public_key = value["publicKey"]
        .as_str()
        .filter(|k| is_hex(k, 64))
        .ok_or_else(|| invalid("publicKey is not 64 hex digits"))?;
    let signature = value["signature"]
        .as_str()
        .filter(|s| is_hex(s, 128))
        .ok_or_else(|| invalid("signature is not 128 hex digits"))?;
    let JsonValue::Array(items) = &value["files"] else {
        return Err(invalid("files is not an array"));
    };

    let mut files: Vec<SignedFile> = Vec::with_capacity(items.len());
    for item in items {
        let file = item
            .as_object()
            .filter(|m| has_exact_keys(m, &["path", "sha256", "size"]))
            .and_then(|m| {
                Some(SignedFile {
                    path: m["path"].as_str()?.to_owned(),
                    sha256: m["sha256"].as_str().filter(|h| is_hex(h, 64))?.to_owned(),
                    size: u64::try_from(m["size"].as_int()?).ok()?,
                })
            })
            .ok_or_else(|| invalid("malformed files entry"))?;
        if files
            .last()
            .is_some_and(|previous| previous.path >= file.path)
        {
            return Err(invalid("files are not sorted by UTF-8 bytes"));
        }
        files.push(file);
    }
    Ok(SignatureFile {
        files,
        public_key: public_key.to_owned(),
        signature: signature.to_owned(),
    })
}

/// `file_mismatch` for the first path (UTF-8 order) where the lists differ.
fn assert_same_files(actual: &[SignedFile], listed: &[SignedFile]) -> Result<()> {
    let mismatch =
        |message: String, path: &str| BundleError::at(ErrorKind::FileMismatch, message, path);
    let (mut i, mut j) = (0, 0);
    while i < actual.len() || j < listed.len() {
        match (actual.get(i), listed.get(j)) {
            (Some(a), Some(l)) if a.path == l.path => {
                if a.size != l.size || a.sha256 != l.sha256 {
                    return Err(mismatch(
                        format!("{} differs from its listed size or SHA-256", a.path),
                        &a.path,
                    ));
                }
                i += 1;
                j += 1;
            }
            (Some(a), l) if l.is_none_or(|l| a.path < l.path) => {
                return Err(mismatch(
                    format!("{} is not listed in {SIGNATURE_PATH}", a.path),
                    &a.path,
                ));
            }
            (_, Some(l)) => {
                return Err(mismatch(
                    format!("{} is listed but missing", l.path),
                    &l.path,
                ));
            }
            (_, None) => unreachable!("the loop runs while one list has items"),
        }
    }
    Ok(())
}

fn assert_valid_manifest(
    manifest: &BTreeMap<String, JsonValue>,
    files: &[SignedFile],
) -> Result<()> {
    let invalid =
        |reason: String| BundleError::at(ErrorKind::ManifestInvalid, reason, MANIFEST_PATH);
    let field = |name: &str| manifest.get(name).filter(|v| !v.is_null());
    if manifest.contains_key("signature") {
        return Err(invalid(
            "manifest must not contain a signature field".into(),
        ));
    }
    let name = manifest.get("name").and_then(JsonValue::as_str);
    if !name.is_some_and(is_valid_extension_name) {
        return Err(invalid(format!(
            "name {name:?} must be lowercase letters, digits and hyphens, starting with a letter"
        )));
    }
    let version = manifest.get("version").and_then(JsonValue::as_str);
    if !version.is_some_and(|v| semver::Version::parse(v).is_ok()) {
        return Err(invalid(format!("version {version:?} is not semver")));
    }
    let key = manifest.get("publicKey").and_then(JsonValue::as_str);
    if key
        .and_then(from_hex)
        .and_then(|k| strict_public_key(&k))
        .is_none()
    {
        return Err(invalid(
            "publicKey is not a valid Ed25519 public key".into(),
        ));
    }
    let entry = match field("entry") {
        None => Some("index.html"),
        Some(value) => value.as_str(),
    };
    if !entry.is_some_and(|e| files.iter().any(|f| f.path == e)) {
        return Err(invalid(format!(
            "entry {entry:?} is not a file of the bundle"
        )));
    }
    if let Some(dir) = field("migrationsDir") {
        if dir
            .as_str()
            .is_none_or(|d| path_rule_violation(d).is_some())
        {
            return Err(invalid("migrationsDir is not a valid bundle path".into()));
        }
    }
    if field("permissions").is_some_and(|p| p.as_object().is_none()) {
        return Err(invalid("permissions is not an object".into()));
    }
    Ok(())
}

/// The migrations of `migrations_dir`, validated and in the order they apply. With
/// `<dir>/meta/_journal.json`: restricted JSON (canonical form not required) with an `entries`
/// array; each entry has a unique non-negative integer `idx` and a unique string `tag`, and
/// `<dir>/<tag>.sql` is a file of the bundle; ordered by `idx`. Without a journal: the `*.sql`
/// files directly in the directory, ordered by name. Every migration file is UTF-8.
fn read_migrations(
    migrations_dir: &str,
    by_path: &HashMap<&str, &Entry>,
) -> Result<Vec<Migration>> {
    let journal_path = format!("{migrations_dir}/meta/_journal.json");
    let invalid = |reason: &str, path: &str| {
        BundleError::at(
            ErrorKind::ManifestInvalid,
            format!("{path}: {reason}"),
            path,
        )
    };
    let mut migrations: Vec<(i64, String, String)> = Vec::new();
    if let Some(journal) = by_path.get(journal_path.as_str()) {
        let value = std::str::from_utf8(&journal.data)
            .map_err(|e| e.to_string())
            .and_then(jcs::parse_restricted)
            .map_err(|e| invalid(&format!("not restricted JSON ({e})"), &journal_path))?;
        let Some(JsonValue::Array(items)) = value.as_object().and_then(|o| o.get("entries")) else {
            return Err(invalid("entries is not an array", &journal_path));
        };
        let mut indices = HashSet::new();
        let mut tags = HashSet::new();
        for item in items {
            let (idx, tag) = item
                .as_object()
                .and_then(|o| Some((o.get("idx")?.as_int()?, o.get("tag")?.as_str()?)))
                .filter(|(idx, _)| *idx >= 0)
                .ok_or_else(|| {
                    invalid(
                        "entry without a non-negative integer idx and a string tag",
                        &journal_path,
                    )
                })?;
            if !indices.insert(idx) || !tags.insert(tag) {
                return Err(invalid(
                    &format!("idx {idx} or tag {tag:?} repeats"),
                    &journal_path,
                ));
            }
            let sql_path = format!("{migrations_dir}/{tag}.sql");
            if path_rule_violation(&sql_path).is_some() || !by_path.contains_key(sql_path.as_str())
            {
                return Err(invalid(
                    &format!("{sql_path} is not a file of the bundle"),
                    &journal_path,
                ));
            }
            migrations.push((idx, tag.to_owned(), sql_path));
        }
    } else {
        let prefix = format!("{migrations_dir}/");
        for path in by_path.keys() {
            if let Some(file) = path.strip_prefix(&prefix) {
                if let Some(name) = file.strip_suffix(".sql").filter(|_| !file.contains('/')) {
                    migrations.push((0, name.to_owned(), (*path).to_owned()));
                }
            }
        }
    }
    migrations.sort();
    migrations
        .into_iter()
        .map(|(_, name, path)| {
            let sql = String::from_utf8(by_path[path.as_str()].data.clone())
                .map_err(|_| invalid("migration is not UTF-8", &path))?;
            Ok(Migration { name, path, sql })
        })
        .collect()
}

/// Verifies a bundle from its entries. Returns the first failing rule as error.
pub fn verify_entries(entries: Vec<Entry>) -> Result<VerifiedBundle> {
    let by_path: HashMap<&str, &Entry> = entries.iter().map(|e| (e.path.as_str(), e)).collect();
    let manifest_entry = by_path.get(MANIFEST_PATH).copied();
    let signature_entry = by_path.get(SIGNATURE_PATH).copied();
    if signature_entry.is_none() && manifest_entry.is_some_and(|m| is_legacy_manifest(&m.data)) {
        return Err(BundleError::new(
            ErrorKind::LegacySignatureFormat,
            "pre-v2 bundle: re-sign it with the current `haex` tool",
        ));
    }

    let mut checker = PathChecker::default();
    for entry in &entries {
        checker.check(&entry.path)?;
    }

    let manifest = parse_control_file(
        manifest_entry,
        MANIFEST_PATH,
        ErrorKind::ManifestInvalid,
        ErrorKind::ManifestNotCanonical,
    )?;
    let signature = parse_signature_file(&parse_control_file(
        signature_entry,
        SIGNATURE_PATH,
        ErrorKind::SignatureInvalid,
        ErrorKind::SignatureInvalid,
    )?)?;

    let files = describe_files(entries.iter().filter(|e| e.path != SIGNATURE_PATH));
    assert_same_files(&files, &signature.files)?;

    if manifest.get("publicKey").and_then(JsonValue::as_str) != Some(signature.public_key.as_str())
    {
        return Err(BundleError::new(
            ErrorKind::PublicKeyMismatch,
            "manifest.publicKey differs from signature.json publicKey",
        ));
    }
    assert_valid_manifest(&manifest, &files)?;
    let migrations = match manifest.get("migrationsDir").and_then(JsonValue::as_str) {
        Some(dir) => read_migrations(dir, &by_path)?,
        None => Vec::new(),
    };

    let message = signature_message(&files, &signature.public_key);
    let key = from_hex(&signature.public_key)
        .and_then(|k| strict_public_key(&k))
        .expect("the manifest check accepted this key");
    let signature_bytes: [u8; 64] = from_hex(&signature.signature)
        .and_then(|s| s.try_into().ok())
        .expect("signature.json holds 128 hex digits");
    if !verify_signature_strict(&key, &message, &signature_bytes) {
        return Err(BundleError::at(
            ErrorKind::SignatureInvalid,
            "Ed25519 signature does not verify",
            SIGNATURE_PATH,
        ));
    }

    let manifest_bytes = manifest_entry.map(|e| e.data.clone()).unwrap_or_default();
    let signature_file_bytes = signature_entry.map(|e| e.data.clone()).unwrap_or_default();
    drop(by_path);
    Ok(VerifiedBundle {
        manifest,
        manifest_bytes,
        signature_bytes: signature_file_bytes,
        public_key: signature.public_key,
        files,
        signed_message_sha256: Sha256::digest(&message).into(),
        migrations,
        entries,
    })
}
