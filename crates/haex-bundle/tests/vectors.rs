//! Every shared test vector (`test-vectors/bundles/`, generated independently of this crate by
//! `scripts/generate-bundle-vectors.mjs`) gives exactly the outcome `expected.json` names.

use std::path::Path;

use haex_bundle::verify_archive;

#[test]
fn every_vector_gives_its_expected_outcome() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test-vectors/bundles");
    let expected: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("expected.json")).unwrap()).unwrap();
    let expected = expected.as_object().unwrap();
    assert!(expected.len() >= 36, "all vectors are listed");

    let mut failures = Vec::new();
    for (name, outcome) in expected {
        let bytes = std::fs::read(dir.join(name)).unwrap();
        let actual = match verify_archive(&bytes) {
            Ok(_) => serde_json::json!({ "valid": true }),
            Err(error) => {
                let mut value = serde_json::json!({ "valid": false, "kind": error.kind });
                if outcome.get("path").is_some() {
                    value["path"] = serde_json::json!(error.path);
                }
                value
            }
        };
        if &actual != outcome {
            failures.push(format!("{name}: expected {outcome}, got {actual}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn the_good_notes_vector_yields_manifest_files_and_migrations_in_journal_order() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test-vectors/bundles");
    let bundle = verify_archive(&std::fs::read(dir.join("good-notes-like.xt")).unwrap()).unwrap();
    assert_eq!(bundle.manifest["name"].as_str(), Some("notes-like"));
    assert_eq!(
        bundle.public_key,
        "3614253f84ba66a8faa168d317a6979992979a3e7ad15ae83ca2823f5ca97d34"
    );
    assert!(bundle.files.iter().any(|f| f.path == "index.html"));
    assert!(!bundle
        .files
        .iter()
        .any(|f| f.path == "haextension/signature.json"));
    let names: Vec<_> = bundle.migrations.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(names, ["0000_init", "0001_tags"]);
    assert!(bundle.file("index.html").is_some());
}
