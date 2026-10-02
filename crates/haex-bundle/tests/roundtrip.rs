//! Signing, writing and verifying, plus the key and version rules.

use std::collections::BTreeMap;

use ed25519_dalek::SigningKey;
use haex_bundle::jcs::{parse_restricted, JsonValue};
use haex_bundle::verify::{is_valid_extension_name, strict_public_key};
use haex_bundle::{build_archive, read_archive, sign_entries, verify_archive, Entry, ErrorKind};

fn key() -> SigningKey {
    // Test-only seed.
    SigningKey::from_bytes(&[7; 32])
}

fn manifest(version: &str) -> JsonValue {
    parse_restricted(&format!(
        r#"{{"name":"demo","version":"{version}","migrationsDir":"db","permissions":{{}}}}"#
    ))
    .unwrap()
}

fn files() -> Vec<Entry> {
    let file = |path: &str, data: &[u8]| Entry {
        path: path.into(),
        data: data.to_vec(),
    };
    vec![
        file("index.html", b"<!doctype html><title>x</title>"),
        file("assets/app.js", &b"console.log(1);".repeat(50)),
        file("db/0001_b.sql", b"CREATE TABLE b (id TEXT PRIMARY KEY);"),
        file("db/0000_a.sql", b"CREATE TABLE a (id TEXT PRIMARY KEY);"),
    ]
}

#[test]
fn a_signed_archive_verifies_and_keeps_its_content() {
    let archive = build_archive(files(), manifest("1.0.0"), &key()).unwrap();
    let bundle = verify_archive(&archive).unwrap();
    assert_eq!(bundle.manifest["version"].as_str(), Some("1.0.0"));
    assert_eq!(
        bundle.file("assets/app.js").unwrap().data,
        b"console.log(1);".repeat(50)
    );
    let names: Vec<_> = bundle.migrations.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(
        names,
        ["0000_a", "0001_b"],
        "without a journal: by file name"
    );
    // Deterministic: the same input gives the same bytes.
    assert_eq!(
        archive,
        build_archive(files(), manifest("1.0.0"), &key()).unwrap()
    );
}

#[test]
fn changing_one_byte_of_a_file_is_a_file_mismatch() {
    let mut entries = sign_entries(files(), manifest("1.0.0"), &key()).unwrap();
    let app = entries.iter_mut().find(|e| e.path == "index.html").unwrap();
    app.data.push(b' ');
    let error = haex_bundle::verify_entries(entries).unwrap_err();
    assert_eq!(error.kind, ErrorKind::FileMismatch);
    assert_eq!(error.path.as_deref(), Some("index.html"));
}

#[test]
fn signing_rejects_a_manifest_with_a_signature_and_a_reserved_path() {
    let mut with_signature = BTreeMap::from([("signature".to_owned(), JsonValue::Null)]);
    with_signature.insert("name".into(), JsonValue::String("demo".into()));
    let error = sign_entries(files(), JsonValue::Object(with_signature), &key()).unwrap_err();
    assert_eq!(error.kind, ErrorKind::ManifestInvalid);

    let mut reserved = files();
    reserved.push(Entry {
        path: "haextension/signature.json".into(),
        data: vec![],
    });
    let error = sign_entries(reserved, manifest("1.0.0"), &key()).unwrap_err();
    assert_eq!(error.kind, ErrorKind::EntryPathInvalid);
}

#[test]
fn versions_follow_the_semver_crate() {
    for good in [
        "0.0.0",
        "1.0.0-rc.1",
        "1.0.0+001",
        "18446744073709551615.0.0",
    ] {
        let archive = build_archive(files(), manifest(good), &key());
        assert!(archive.is_ok(), "{good}: {archive:?}");
    }
    for bad in [
        "1.0",
        "v1.0.0",
        "01.0.0",
        "1.0.0-rc.01",
        "1.0.0-",
        "18446744073709551616.0.0",
    ] {
        let error = build_archive(files(), manifest(bad), &key()).unwrap_err();
        assert_eq!(error.kind, ErrorKind::ManifestInvalid, "{bad}");
    }
}

#[test]
fn extension_names_follow_fr_004() {
    assert!(is_valid_extension_name("haex-notes2"));
    for bad in ["", "Notes", "1notes", "-a", "a__b", "a_b", "a.b"] {
        assert!(!is_valid_extension_name(bad), "{bad}");
    }
}

#[test]
fn small_order_and_non_canonical_public_keys_are_rejected() {
    assert!(strict_public_key(key().verifying_key().as_bytes()).is_some());
    // The identity point (small order).
    let mut identity = [0u8; 32];
    identity[0] = 1;
    assert!(strict_public_key(&identity).is_none());
    // y = p + 1 encodes the identity point non-canonically.
    let mut non_canonical = [0xffu8; 32];
    non_canonical[0] = 0xee;
    non_canonical[31] = 0x7f;
    assert!(strict_public_key(&non_canonical).is_none());
    assert!(strict_public_key(&[1; 31]).is_none());
}

#[test]
fn a_stored_entry_that_claims_a_bigger_size_is_rejected_by_the_reader() {
    let mut archive = haex_bundle::write_archive(&[Entry {
        path: "a.txt".into(),
        data: b"abc".to_vec(),
    }]);
    // Uncompressed size in the central directory (offset 24 of the record after the 33-byte local
    // entry) no longer matches the stored data.
    let central = archive.len() - 22 - (46 + 5);
    archive[central + 24] = 4;
    assert_eq!(
        read_archive(&archive).unwrap_err().kind,
        ErrorKind::ArchiveInvalid
    );
}
