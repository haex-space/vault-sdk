//! Why a bundle is rejected. The kinds are the contract between the `haex` tool and every host:
//! for each test vector both report the same kind (`test-vectors/bundles/expected.json`).

use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    ArchiveTooLarge,
    ArchiveInvalid,
    EntryPathInvalid,
    EntryDuplicate,
    EntryTooLarge,
    EntryRatio,
    EntryKind,
    ManifestNotCanonical,
    ManifestInvalid,
    FileMismatch,
    PublicKeyMismatch,
    SignatureInvalid,
    LegacySignatureFormat,
}

impl ErrorKind {
    /// Every kind, for tools that mirror the list (the TypeScript `BundleErrorKind`).
    pub const ALL: [Self; 13] = [
        Self::ArchiveTooLarge,
        Self::ArchiveInvalid,
        Self::EntryPathInvalid,
        Self::EntryDuplicate,
        Self::EntryTooLarge,
        Self::EntryRatio,
        Self::EntryKind,
        Self::ManifestNotCanonical,
        Self::ManifestInvalid,
        Self::FileMismatch,
        Self::PublicKeyMismatch,
        Self::SignatureInvalid,
        Self::LegacySignatureFormat,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ArchiveTooLarge => "archive_too_large",
            Self::ArchiveInvalid => "archive_invalid",
            Self::EntryPathInvalid => "entry_path_invalid",
            Self::EntryDuplicate => "entry_duplicate",
            Self::EntryTooLarge => "entry_too_large",
            Self::EntryRatio => "entry_ratio",
            Self::EntryKind => "entry_kind",
            Self::ManifestNotCanonical => "manifest_not_canonical",
            Self::ManifestInvalid => "manifest_invalid",
            Self::FileMismatch => "file_mismatch",
            Self::PublicKeyMismatch => "public_key_mismatch",
            Self::SignatureInvalid => "signature_invalid",
            Self::LegacySignatureFormat => "legacy_signature_format",
        }
    }
}

impl fmt::Display for ErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A rejected bundle. `path` names the entry for entry-level errors and the first differing file
/// for `file_mismatch`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BundleError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl BundleError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            path: None,
        }
    }

    pub fn at(kind: ErrorKind, message: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            path: Some(path.into()),
        }
    }
}

impl fmt::Display for BundleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind, self.message)
    }
}

impl std::error::Error for BundleError {}

pub type Result<T> = std::result::Result<T, BundleError>;

#[cfg(test)]
mod tests {
    use super::ErrorKind;

    #[test]
    fn all_lists_every_kind_once() {
        // No wildcard arm: a new kind fails to compile here until it is added to `ALL`.
        let position = |kind: ErrorKind| match kind {
            ErrorKind::ArchiveTooLarge => 0,
            ErrorKind::ArchiveInvalid => 1,
            ErrorKind::EntryPathInvalid => 2,
            ErrorKind::EntryDuplicate => 3,
            ErrorKind::EntryTooLarge => 4,
            ErrorKind::EntryRatio => 5,
            ErrorKind::EntryKind => 6,
            ErrorKind::ManifestNotCanonical => 7,
            ErrorKind::ManifestInvalid => 8,
            ErrorKind::FileMismatch => 9,
            ErrorKind::PublicKeyMismatch => 10,
            ErrorKind::SignatureInvalid => 11,
            ErrorKind::LegacySignatureFormat => 12,
        };
        for (i, kind) in ErrorKind::ALL.into_iter().enumerate() {
            assert_eq!(position(kind), i);
        }
    }
}
