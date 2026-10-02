//! Path rules and duplicate detection.

use haex_bundle::format::{path_rule_violation, PathChecker};
use haex_bundle::ErrorKind;

#[test]
fn accepts_valid_paths() {
    for path in [
        "index.html",
        "_nuxt/entry.js",
        "locales/übersicht.json",
        "a/b/c/😀.txt",
        "haextension/icon.png",
    ] {
        assert_eq!(path_rule_violation(path), None, "{path}");
    }
}

#[test]
fn rejects_paths_that_break_a_rule() {
    let long_segment = format!("a/{}", "x".repeat(256));
    let long_path = format!("{}x", format!("{}/", "x".repeat(200)).repeat(6));
    for path in [
        "",
        "/etc/passwd",
        "assets/../x",
        "./x",
        "a//b",
        "a/",
        "a\\b",
        "c:x",
        "a\u{0}b",
        "a\u{1f}b",
        "a\u{85}b",
        "cafe\u{301}.txt",
        &long_segment,
        &long_path,
        "haextension.config.json",
        "haextension/private.key",
        "HaExtension/Public.KEY",
    ] {
        assert!(path_rule_violation(path).is_some(), "{path:?}");
    }
}

fn kind_of(paths: &[&str]) -> Option<ErrorKind> {
    let mut checker = PathChecker::default();
    paths
        .iter()
        .try_for_each(|p| checker.check(p))
        .err()
        .map(|e| e.kind)
}

#[test]
fn reports_duplicates_after_the_path_rules() {
    assert_eq!(
        kind_of(&["a.txt", "a.txt"]),
        Some(ErrorKind::EntryDuplicate)
    );
    assert_eq!(
        kind_of(&["A.txt", "a.TXT"]),
        Some(ErrorKind::EntryDuplicate)
    );
    assert_eq!(kind_of(&["/a", "/a"]), Some(ErrorKind::EntryPathInvalid));
    assert_eq!(kind_of(&["a.txt", "b.txt"]), None);
}
