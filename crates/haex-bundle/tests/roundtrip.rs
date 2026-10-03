//! Signing, writing and verifying, plus the key and version rules.

use std::collections::BTreeMap;

use ed25519_dalek::{Signer, SigningKey};
use haex_bundle::jcs::{parse_restricted, JsonValue};
use haex_bundle::verify::{is_valid_extension_name, strict_public_key, verify_signature_strict};
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
    // y = 0 (order 4), y = p - 1 (order 2) and y = 2, which has no matching x.
    assert!(strict_public_key(&[0; 32]).is_none());
    let mut order_two = non_canonical;
    order_two[0] = 0xec;
    assert!(strict_public_key(&order_two).is_none());
    let mut no_x = [0u8; 32];
    no_x[0] = 2;
    assert!(strict_public_key(&no_x).is_none());
    assert!(strict_public_key(&[1; 31]).is_none());
}

/// Little-endian addition of the group order L to S (bytes 32..64 of a signature).
fn add_group_order(signature: &[u8; 64]) -> [u8; 64] {
    const L: [u8; 32] = [
        0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde,
        0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10,
    ];
    let mut out = *signature;
    let mut carry = 0u16;
    for i in 0..32 {
        let sum = u16::from(out[32 + i]) + u16::from(L[i]) + carry;
        out[32 + i] = sum as u8;
        carry = sum >> 8;
    }
    out
}

#[test]
fn malleable_signatures_are_rejected() {
    let key = key();
    let message = b"haextension-bundle/2\n{}";
    let signature = key.sign(message).to_bytes();
    let public = key.verifying_key();
    assert!(verify_signature_strict(&public, message, &signature));
    assert!(!verify_signature_strict(&public, b"other", &signature));
    // S + L verifies under a lax check; S must be reduced.
    assert!(!verify_signature_strict(
        &public,
        message,
        &add_group_order(&signature)
    ));
    // A small-order R (the identity point).
    let mut small_r = [0u8; 64];
    small_r[0] = 1;
    assert!(!verify_signature_strict(&public, message, &small_r));
}

/// Pseudo-random text over a small alphabet: compresses well, but far below 200:1.
fn compressible(len: usize) -> Vec<u8> {
    let mut state = 0x2545_f491_u32;
    (0..len)
        .map(|_| {
            state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            b"abcdefgh"[(state >> 16) as usize % 8]
        })
        .collect()
}

#[test]
fn a_large_deflated_entry_verifies() {
    let mut files = files();
    files.push(Entry {
        path: "assets/big.js".into(),
        data: compressible(300 * 1024),
    });
    let archive = build_archive(files, manifest("1.0.0"), &key()).unwrap();
    assert!(archive.len() < 200 * 1024, "the big file is deflated");
    let bundle = verify_archive(&archive).unwrap();
    assert_eq!(
        bundle.file("assets/big.js").unwrap().data,
        compressible(300 * 1024)
    );
}

#[test]
fn signing_more_entries_than_a_host_accepts_is_an_error() {
    let files = (0..2000)
        .map(|i| Entry {
            path: format!("f/{i}.txt"),
            data: Vec::new(),
        })
        .collect();
    // 2000 files + manifest + signature.json; must not panic in the writer.
    assert_eq!(
        build_archive(files, manifest("1.0.0"), &key())
            .unwrap_err()
            .kind,
        ErrorKind::ArchiveTooLarge
    );
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
