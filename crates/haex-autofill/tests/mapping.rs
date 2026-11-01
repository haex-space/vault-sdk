use std::collections::BTreeMap;

use haex_autofill::{
    card_token, is_otp_field, map_field, map_fields, shows_icon, EntryKeys, FieldFacts, Target,
};

fn named(input_type: &str, name: &str) -> FieldFacts {
    FieldFacts {
        input_type: input_type.into(),
        name: name.into(),
        ..FieldFacts::default()
    }
}

fn card(name: &str, autocomplete: &str) -> FieldFacts {
    FieldFacts {
        input_type: "text".into(),
        name: name.into(),
        autocomplete: autocomplete.into(),
        ..FieldFacts::default()
    }
}

fn entry(keys: &[&str]) -> EntryKeys {
    EntryKeys {
        keys: keys.iter().map(|key| (*key).to_owned()).collect(),
        ..EntryKeys::default()
    }
}

fn with_aliases(mut entry: EntryKeys, key: &str, aliases: &[&str]) -> EntryKeys {
    entry.aliases.insert(
        key.to_owned(),
        aliases.iter().map(|alias| (*alias).to_owned()).collect(),
    );
    entry
}

fn key(name: &str) -> Option<Target> {
    Some(Target::Key(name.to_owned()))
}

#[test]
fn fills_a_login_form_by_kind_when_no_name_matches() {
    let fields = [named("email", "email"), named("password", "passwd")];

    assert_eq!(
        map_fields(&fields, &entry(&["username", "password"])),
        vec![key("username"), key("password")]
    );
}

#[test]
fn never_types_the_totp_marker_into_a_one_time_code_field() {
    let code = card("otp", "one-time-code");

    assert_eq!(map_field(&code, &entry(&["otp"])), Some(Target::Otp));
    assert_eq!(
        map_field(&named("text", "code"), &entry(&["otp"])),
        Some(Target::Otp)
    );
    assert_eq!(map_field(&named("text", "comment"), &entry(&["otp"])), None);
}

#[test]
fn an_exact_name_wins_and_any_case_follows() {
    let iban = named("text", "iban");

    assert_eq!(map_field(&iban, &entry(&["Name", "IBAN"])), key("IBAN"));
    assert_eq!(map_field(&iban, &entry(&["IBAN", "iban"])), key("iban"));
    assert_eq!(
        map_field(&named("text", "Comment"), &entry(&["IBAN"])),
        None
    );
}

#[test]
fn an_own_alias_maps_a_field_to_its_key() {
    let member = with_aliases(entry(&["Mitgliedsnummer"]), "Mitgliedsnummer", &["Member"]);

    assert_eq!(
        map_field(&named("text", "member"), &member),
        key("Mitgliedsnummer")
    );
}

#[test]
fn default_aliases_map_standard_keys() {
    assert_eq!(
        map_field(&named("text", "E-Mail"), &entry(&["username"])),
        key("username")
    );
    assert_eq!(
        map_field(&named("text", "secret"), &entry(&["password"])),
        key("password")
    );
}

#[test]
fn own_otp_aliases_replace_the_defaults() {
    let mut aliases = BTreeMap::new();
    aliases.insert("otp".to_owned(), vec!["tan".to_owned()]);

    assert!(is_otp_field(&named("text", "TAN"), Some(&aliases)));
    assert!(!is_otp_field(&named("text", "tan"), None));
}

#[test]
fn fills_card_fields_of_an_imported_card() {
    let imported = entry(&[
        "Karteninhaber",
        "Marke",
        "Kartennummer",
        "Ablaufmonat",
        "Ablaufjahr",
        "Prüfnummer",
    ]);
    let fields = [
        card("holder", "cc-name"),
        card("pan", "section-pay billing cc-number"),
        card("mm", "cc-exp-month"),
        card("yy", "cc-exp-year"),
        card("securityCode", "cc-csc"),
        card("brand", "off"),
    ];

    assert_eq!(
        map_fields(&fields, &imported),
        vec![
            key("Karteninhaber"),
            key("Kartennummer"),
            key("Ablaufmonat"),
            key("Ablaufjahr"),
            key("Prüfnummer"),
            None,
        ]
    );
}

#[test]
fn card_keys_compare_without_case_spaces_and_dashes() {
    let fields = [
        card("x1", "cc-number"),
        card("x2", "cc-csc"),
        card("x3", "cc-exp"),
    ];

    assert_eq!(
        map_fields(&fields, &entry(&["Card Number", "CVC", "Gültig bis"])),
        vec![key("Card Number"), key("CVC"), key("Gültig bis")]
    );
}

#[test]
fn an_own_alias_names_the_card_field_before_the_common_names() {
    let own = with_aliases(
        entry(&["Kartennummer", "Firmenkarte"]),
        "Firmenkarte",
        &["CC-Number"],
    );

    assert_eq!(
        map_field(&card("pan", "cc-number"), &own),
        key("Firmenkarte")
    );
}

#[test]
fn a_card_field_without_a_card_key_stays_empty() {
    let login = entry(&["username", "password", "otp"]);

    assert_eq!(map_field(&card("securityCode", "cc-csc"), &login), None);
    assert_eq!(card_token("billing cc-exp-year"), Some("cc-exp-year"));
    assert_eq!(card_token("cc-numbers"), None);
}

#[test]
fn shows_the_icon_on_a_one_time_code_field_only_with_a_totp() {
    let code = card("app_otp", "one-time-code");
    let mut with_totp = entry(&["username"]);
    with_totp.has_totp = true;

    assert!(shows_icon(&code, &[with_totp]));
    assert!(!shows_icon(&code, &[entry(&["username"])]));
}

#[test]
fn shows_the_icon_on_standard_names_and_on_keys_of_an_entry() {
    let none: [EntryKeys; 0] = [];
    let member = with_aliases(entry(&["Mitgliedsnummer"]), "Mitgliedsnummer", &["member"]);

    assert!(shows_icon(&named("text", "login"), &none));
    assert!(shows_icon(
        &named("text", "Mitgliedsnummer"),
        std::slice::from_ref(&member)
    ));
    assert!(shows_icon(
        &named("text", "member"),
        std::slice::from_ref(&member)
    ));
    assert!(!shows_icon(&named("text", "comment"), &[member]));
}

#[test]
fn entry_keys_and_targets_cross_as_json() {
    let entry: EntryKeys =
        serde_json::from_str(r#"{"keys":["username"],"aliases":null,"hasTotp":true}"#).unwrap();
    assert!(entry.has_totp && entry.aliases.is_empty());

    let facts: FieldFacts = serde_json::from_str(r#"{"inputType":"email","name":"mail"}"#).unwrap();
    let targets = map_fields(&[facts, card("otp", "one-time-code")], &entry);
    assert_eq!(
        serde_json::to_string(&targets).unwrap(),
        r#"[{"kind":"key","key":"username"},{"kind":"otp"}]"#
    );
}
