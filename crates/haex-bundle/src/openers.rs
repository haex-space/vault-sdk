//! The `openers` block of a manifest: the kinds of link an extension takes over from its host (holzi
//! spec 063, `contracts/manifest-openers.md`). This checks the shape every host relies on; which
//! kinds a host offers (today `mail.compose`) is the host's own business, so a kind of the right
//! form that the host does not know is valid.

use std::collections::HashSet;

use crate::jcs::JsonValue;

/// At most this many kinds per extension.
pub const MAX_OPENERS: usize = 8;
const MAX_KIND_LEN: usize = 32;

/// Checks the `openers` value of a manifest; the error names the first rule it breaks.
pub fn check_openers(openers: &JsonValue) -> Result<(), String> {
    let JsonValue::Array(openers) = openers else {
        return Err("openers is not an array of strings".into());
    };
    if openers.len() > MAX_OPENERS {
        return Err(format!(
            "openers has {} entries, more than {MAX_OPENERS}",
            openers.len()
        ));
    }
    let mut seen = HashSet::new();
    for (index, opener) in openers.iter().enumerate() {
        let JsonValue::String(kind) = opener else {
            return Err("openers is not an array of strings".into());
        };
        if !is_valid_kind(kind) {
            return Err(format!(
                "openers[{index}]: {kind:?} must match ^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$ and have at most {MAX_KIND_LEN} characters"
            ));
        }
        if !seen.insert(kind.as_str()) {
            return Err(format!("openers[{index}]: the kind {kind} is used twice"));
        }
    }
    Ok(())
}

/// Two or more dot-separated words of lower-case letters and digits, each starting with a letter.
fn is_valid_kind(kind: &str) -> bool {
    kind.len() <= MAX_KIND_LEN
        && kind.split('.').count() >= 2
        && kind.split('.').all(|word| {
            let mut chars = word.chars();
            chars.next().is_some_and(|c| c.is_ascii_lowercase())
                && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::check_openers;
    use crate::jcs::parse_restricted;

    fn check(json: &str) -> Result<(), String> {
        check_openers(&parse_restricted(json).unwrap())
    }

    #[test]
    fn accepts_known_and_unknown_kinds_of_the_right_form() {
        assert_eq!(check(r#"["mail.compose"]"#), Ok(()));
        assert_eq!(check(r#"["mail.compose","tel.dial","a.b.c1"]"#), Ok(()));
        assert_eq!(check("[]"), Ok(()));
    }

    #[test]
    fn rejects_what_is_not_an_array_of_strings() {
        for json in [
            r#"{"mail.compose":true}"#,
            r#""mail.compose""#,
            "[1]",
            r#"["mail.compose",null]"#,
        ] {
            let error = check(json).unwrap_err();
            assert_eq!(error, "openers is not an array of strings", "{json}");
        }
    }

    #[test]
    fn rejects_more_than_eight_entries() {
        let nine: Vec<String> = (0..9).map(|i| format!("\"kind.k{i}\"")).collect();
        let error = check(&format!("[{}]", nine.join(","))).unwrap_err();
        assert!(error.contains("9 entries, more than 8"), "{error}");
        let eight: Vec<String> = (0..8).map(|i| format!("\"kind.k{i}\"")).collect();
        assert_eq!(check(&format!("[{}]", eight.join(","))), Ok(()));
    }

    #[test]
    fn rejects_a_kind_of_the_wrong_form_with_its_index() {
        for kind in [
            "mail",
            "Mail.compose",
            "mail.",
            ".compose",
            "mail..compose",
            "mail.1compose",
            "mail.compose-x",
            "mail compose",
            "",
        ] {
            let error = check(&format!(r#"["mail.compose","{kind}"]"#)).unwrap_err();
            assert!(error.starts_with("openers[1]:"), "{kind}: {error}");
        }
    }

    #[test]
    fn rejects_a_kind_over_32_characters() {
        let fits = format!("a.{}", "b".repeat(30));
        assert_eq!(fits.len(), 32);
        assert_eq!(check(&format!(r#"["{fits}"]"#)), Ok(()));
        let error = check(&format!(r#"["{fits}b"]"#)).unwrap_err();
        assert!(error.starts_with("openers[0]:"), "{error}");
    }

    #[test]
    fn rejects_a_kind_twice_with_the_index_of_the_second() {
        let error = check(r#"["mail.compose","tel.dial","mail.compose"]"#).unwrap_err();
        assert_eq!(error, "openers[2]: the kind mail.compose is used twice");
    }
}
