//! Restricted canonical JSON (RFC 8785 within the restriction of the bundle format).

use haex_bundle::jcs::{canonicalize, parse_canonical, parse_restricted};

/// A JSON `\u` escape of `hex`, spelled out so the source holds no escape sequences.
fn esc(hex: &str) -> String {
    format!("{}u{hex}", BS)
}

const BS: char = '\\';

#[test]
fn sorts_keys_recursively_and_drops_whitespace() {
    let value = parse_restricted(r#"{ "b": [1, {"d": true, "c": null}], "a": "x" }"#).unwrap();
    assert_eq!(
        canonicalize(&value).unwrap(),
        r#"{"a":"x","b":[1,{"c":null,"d":true}]}"#
    );
}

#[test]
fn escapes_strings_like_ecmascript() {
    // RFC 8785 §3.2.2.2 string example, minus the non-restricted parts.
    let text = format!(
        "\"{}${}{}A'{}{}{}{BS}{BS}{BS}\"{BS}/\"",
        esc("20ac"),
        esc("000F"),
        esc("000a"),
        esc("0042"),
        esc("0022"),
        esc("005c"),
    );
    let value = parse_restricted(&text).unwrap();
    let expected = format!("\"€${}{BS}nA'B{BS}\"{BS}{BS}{BS}{BS}{BS}\"/\"", esc("000f"));
    assert_eq!(canonicalize(&value).unwrap(), expected);
}

#[test]
fn integers_without_exponent_and_minus_zero_as_zero() {
    let value = parse_restricted("[0,-0,9007199254740991,-9007199254740991]").unwrap();
    assert_eq!(
        canonicalize(&value).unwrap(),
        "[0,0,9007199254740991,-9007199254740991]"
    );
}

#[test]
fn accepts_exactly_canonical_bytes() {
    assert!(parse_canonical(r#"{"a":[1,"ü"],"b":{}}"#.as_bytes()).is_ok());
    assert!(parse_canonical(r#"{"a":"😀"}"#.as_bytes()).is_ok());
    assert!(parse_canonical(r#"{"__proto__":{"polluted":1}}"#.as_bytes()).is_ok());
}

#[test]
fn rejects_everything_outside_the_canonical_restricted_form() {
    let escaped = |inner: String| format!("{{\"a\":\"{inner}\"}}");
    for text in [
        r#"{"a": 1}"#.to_owned(),
        r#"{"b":1,"a":2}"#.to_owned(),
        r#"{"a":1.5}"#.to_owned(),
        r#"{"a":1e3}"#.to_owned(),
        r#"{"a":1.0}"#.to_owned(),
        r#"{"a":1,"a":1}"#.to_owned(),
        r#"{"ä":1}"#.to_owned(),
        r#"{"a":9007199254740992}"#.to_owned(),
        escaped(esc("0041")),
        escaped(format!("{BS}/")),
        "\u{feff}{\"a\":1}".to_owned(),
        r#"{"a":1}x"#.to_owned(),
        r#"{"a":01}"#.to_owned(),
        escaped(esc("d800")),
        escaped(esc("dc00") + &esc("d800")),
        "-0".to_owned(),
    ] {
        assert!(parse_canonical(text.as_bytes()).is_err(), "{text}");
    }
    assert!(parse_canonical(&[0x22, 0xc3, 0x28, 0x22]).is_err());
}

#[test]
fn a_surrogate_pair_escape_is_one_character() {
    let value = parse_restricted(&format!("\"{}{}\"", esc("d83d"), esc("de00"))).unwrap();
    assert_eq!(canonicalize(&value).unwrap(), "\"😀\"");
}

#[test]
fn rejects_deep_nesting_instead_of_overflowing_the_stack() {
    let text = "[".repeat(10_000) + &"]".repeat(10_000);
    assert!(parse_canonical(text.as_bytes()).is_err());
}
