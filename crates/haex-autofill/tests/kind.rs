use haex_autofill::{field_identifier, field_kind, FieldFacts, FieldKind};

fn field(input_type: &str, name: &str, autocomplete: &str) -> FieldFacts {
    FieldFacts {
        input_type: input_type.into(),
        name: name.into(),
        autocomplete: autocomplete.into(),
        ..FieldFacts::default()
    }
}

#[test]
fn the_type_decides_first() {
    assert_eq!(
        field_kind(&field("password", "code", "")),
        FieldKind::Password
    );
    assert_eq!(field_kind(&field("email", "login", "")), FieldKind::Email);
}

#[test]
fn then_the_autocomplete_value() {
    assert_eq!(
        field_kind(&field("text", "x", "current-password")),
        FieldKind::Password
    );
    assert_eq!(field_kind(&field("text", "x", "email")), FieldKind::Email);
    assert_eq!(
        field_kind(&field("text", "x", "username")),
        FieldKind::Username
    );
    assert_eq!(
        field_kind(&field("text", "x", "one-time-code")),
        FieldKind::Otp
    );
}

#[test]
fn then_words_in_name_id_and_placeholder() {
    assert_eq!(
        field_kind(&field("text", "passwd", "")),
        FieldKind::Password
    );
    assert_eq!(field_kind(&field("text", "app_otp", "")), FieldKind::Otp);
    assert_eq!(field_kind(&field("text", "Mail", "")), FieldKind::Email);
    assert_eq!(
        field_kind(&field("text", "nickname", "")),
        FieldKind::Username
    );
    assert_eq!(field_kind(&field("text", "comment", "")), FieldKind::Text);

    let by_placeholder = FieldFacts {
        placeholder: "Verification".into(),
        ..FieldFacts::default()
    };
    assert_eq!(field_kind(&by_placeholder), FieldKind::Otp);
}

#[test]
fn a_card_field_is_never_a_one_time_code_field() {
    assert_eq!(
        field_kind(&field("text", "securityCode", "cc-csc")),
        FieldKind::Text
    );
    assert_eq!(
        field_kind(&field("tel", "code", "billing CC-CSC")),
        FieldKind::Text
    );
}

#[test]
fn the_identifier_is_name_then_id_then_autocomplete_then_kind() {
    let mut facts = FieldFacts {
        name: "login".into(),
        id: "user-id".into(),
        autocomplete: "username".into(),
        ..FieldFacts::default()
    };
    assert_eq!(field_identifier(&facts), "login");
    facts.name.clear();
    assert_eq!(field_identifier(&facts), "user-id");
    facts.id.clear();
    assert_eq!(field_identifier(&facts), "username");
    facts.autocomplete = "off".into();
    facts.input_type = "password".into();
    assert_eq!(field_identifier(&facts), "password");
    facts.input_type = "text".into();
    assert_eq!(field_identifier(&facts), "text");
}
