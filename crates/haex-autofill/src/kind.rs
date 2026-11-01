//! What a form field is: its kind and the identifier the rule matches entry keys against.

use serde::{Deserialize, Serialize};

use crate::aliases::card_token;

/// The attributes of an `<input>` the rule looks at. Missing attributes are empty.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FieldFacts {
    /// The `type` attribute (`text`, `password`, `email`, …).
    pub input_type: String,
    pub name: String,
    pub id: String,
    pub autocomplete: String,
    pub placeholder: String,
}

/// What a field asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Username,
    Password,
    Email,
    Otp,
    Text,
}

impl FieldKind {
    pub fn as_str(self) -> &'static str {
        match self {
            FieldKind::Username => "username",
            FieldKind::Password => "password",
            FieldKind::Email => "email",
            FieldKind::Otp => "otp",
            FieldKind::Text => "text",
        }
    }
}

const PASSWORD_PATTERNS: [&str; 3] = ["pass", "pwd", "secret"];
const OTP_PATTERNS: [&str; 7] = ["otp", "totp", "code", "token", "2fa", "mfa", "verification"];
const EMAIL_PATTERNS: [&str; 2] = ["email", "mail"];
const USERNAME_PATTERNS: [&str; 7] = [
    "user", "login", "email", "username", "account", "nick", "handle",
];

/// The kind of a field: card `autocomplete` tokens, then its `type`, then its `autocomplete`,
/// then words in its name, `id` or placeholder. A card field is plain text even when masked as a
/// password, so it never falls back to a login password or a one-time code.
pub fn field_kind(field: &FieldFacts) -> FieldKind {
    if card_token(&field.autocomplete).is_some() {
        return FieldKind::Text;
    }
    match field.input_type.to_lowercase().as_str() {
        "password" => return FieldKind::Password,
        "email" => return FieldKind::Email,
        _ => {}
    }

    let autocomplete = field.autocomplete.to_lowercase();
    for token in autocomplete.split_ascii_whitespace() {
        match token {
            "current-password" | "new-password" => return FieldKind::Password,
            "email" => return FieldKind::Email,
            "username" => return FieldKind::Username,
            "one-time-code" => return FieldKind::Otp,
            _ => {}
        }
    }

    // ponytail: legacy substring heuristics can mistake names such as postal_code for OTP;
    // replace them with token-aware name matching if fields lack reliable autocomplete hints.
    let text = format!("{} {} {}", field.name, field.id, field.placeholder).to_lowercase();
    let mentions = |patterns: &[&str]| patterns.iter().any(|pattern| text.contains(pattern));
    if mentions(&PASSWORD_PATTERNS) {
        FieldKind::Password
    } else if mentions(&OTP_PATTERNS) {
        FieldKind::Otp
    } else if mentions(&EMAIL_PATTERNS) {
        FieldKind::Email
    } else if mentions(&USERNAME_PATTERNS) {
        FieldKind::Username
    } else {
        FieldKind::Text
    }
}

/// The identifier matched against entry keys: the name, else the `id`, else the `autocomplete`
/// value (unless `off`), else the kind.
pub fn field_identifier(field: &FieldFacts) -> String {
    if !field.name.is_empty() {
        field.name.clone()
    } else if !field.id.is_empty() {
        field.id.clone()
    } else if !field.autocomplete.is_empty() && !field.autocomplete.eq_ignore_ascii_case("off") {
        field.autocomplete.clone()
    } else {
        field_kind(field).as_str().to_owned()
    }
}
