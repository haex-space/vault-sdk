//! Constants and path rules of the bundle format.

use std::collections::HashSet;

use unicode_normalization::UnicodeNormalization;

use crate::error::{BundleError, ErrorKind, Result};

pub const BUNDLE_FORMAT: &str = "haextension-bundle/2";
pub const BUNDLE_FILE_EXTENSION: &str = ".xt";
pub const MANIFEST_PATH: &str = "haextension/manifest.json";
pub const SIGNATURE_PATH: &str = "haextension/signature.json";

/// Files that never belong in a bundle, compared by [`collision_key`].
pub const FORBIDDEN_PATHS: [&str; 3] = [
    "haextension.config.json",
    "haextension/public.key",
    "haextension/private.key",
];

/// Limits of an archive and its entries.
pub mod limits {
    const MIB: u64 = 1024 * 1024;
    pub const ARCHIVE_BYTES: u64 = 64 * MIB;
    pub const ENTRIES: usize = 2000;
    pub const ENTRY_BYTES: u64 = 25 * MIB;
    pub const TOTAL_BYTES: u64 = 64 * MIB;
    pub const RATIO: u64 = 200;
    pub const PATH_BYTES: usize = 1024;
    pub const SEGMENT_BYTES: usize = 255;
}

/// Key under which two paths count as the same file: NFC, then lower case.
pub fn collision_key(path: &str) -> String {
    path.nfc().collect::<String>().to_lowercase()
}

fn is_forbidden_char(c: char) -> bool {
    matches!(c, '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' | '\\' | ':')
}

/// Why `path` breaks the path rules, or `None` for a valid bundle path.
pub fn path_rule_violation(path: &str) -> Option<&'static str> {
    if path.is_empty() {
        return Some("empty path");
    }
    if !path.nfc().eq(path.chars()) {
        return Some("not in Unicode NFC");
    }
    if path.chars().any(is_forbidden_char) {
        return Some("contains a backslash, colon, NUL or control character");
    }
    if path.starts_with('/') {
        return Some("absolute path");
    }
    if path.len() > limits::PATH_BYTES {
        return Some("longer than 1024 bytes");
    }
    for segment in path.split('/') {
        if matches!(segment, "" | "." | "..") {
            return Some("empty, '.' or '..' segment");
        }
        if segment.len() > limits::SEGMENT_BYTES {
            return Some("segment longer than 255 bytes");
        }
    }
    if FORBIDDEN_PATHS.contains(&collision_key(path).as_str()) {
        return Some("file must not be packaged");
    }
    None
}

/// Checks paths one after another: `entry_path_invalid` for a path that breaks the rules,
/// `entry_duplicate` for one equal (exactly or by [`collision_key`]) to an earlier one.
#[derive(Default)]
pub struct PathChecker {
    exact: HashSet<String>,
    folded: HashSet<String>,
}

impl PathChecker {
    pub fn check(&mut self, path: &str) -> Result<()> {
        if let Some(violation) = path_rule_violation(path) {
            return Err(BundleError::at(
                ErrorKind::EntryPathInvalid,
                format!("{path:?}: {violation}"),
                path,
            ));
        }
        if !self.exact.insert(path.to_owned()) {
            return Err(BundleError::at(
                ErrorKind::EntryDuplicate,
                format!("{path:?} appears twice"),
                path,
            ));
        }
        if !self.folded.insert(collision_key(path)) {
            return Err(BundleError::at(
                ErrorKind::EntryDuplicate,
                format!("{path:?} collides with another path"),
                path,
            ));
        }
        Ok(())
    }
}
