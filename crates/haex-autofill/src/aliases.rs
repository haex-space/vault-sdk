//! The names the rule knows without being told: default aliases of the standard entry keys and the
//! common names of card fields.

/// Aliases of the standard entry keys. An entry's own aliases for a key replace these.
pub const DEFAULT_ALIASES: [(&str, &[&str]); 3] = [
    ("username", &["email", "login", "user", "e-mail", "mail"]),
    ("password", &["pass", "pwd", "secret"]),
    ("otp", &["otp", "totp", "2fa", "code", "token"]),
];

/// The `autocomplete` tokens of card fields and the entry keys that hold them when the entry names
/// no alias for the token. Keys compare after [`normalize`]; the German names are those the
/// password manager gives imported cards.
pub const CARD_FIELDS: [(&str, &[&str]); 6] = [
    (
        "cc-name",
        &[
            "karteninhaber",
            "cardholder",
            "cardholdername",
            "nameaufderkarte",
            "ccname",
        ],
    ),
    (
        "cc-number",
        &["kartennummer", "cardnumber", "number", "ccnumber"],
    ),
    (
        "cc-exp",
        &[
            "ablaufdatum",
            "gültigbis",
            "gueltigbis",
            "expiry",
            "expirationdate",
            "ccexp",
        ],
    ),
    (
        "cc-exp-month",
        &["ablaufmonat", "expmonth", "expirationmonth", "ccexpmonth"],
    ),
    (
        "cc-exp-year",
        &["ablaufjahr", "expyear", "expirationyear", "ccexpyear"],
    ),
    (
        "cc-csc",
        &[
            "prüfnummer",
            "pruefnummer",
            "cvc",
            "cvv",
            "csc",
            "securitycode",
            "sicherheitscode",
            "cccsc",
        ],
    ),
];

/// The default aliases of `key`, if it is a standard key.
pub fn default_aliases(key: &str) -> Option<&'static [&'static str]> {
    DEFAULT_ALIASES
        .iter()
        .find(|(standard, _)| *standard == key)
        .map(|(_, aliases)| *aliases)
}

/// The card token of an `autocomplete` value such as `section-pay billing cc-number`.
pub fn card_token(autocomplete: &str) -> Option<&'static str> {
    autocomplete.split_whitespace().find_map(|token| {
        CARD_FIELDS
            .iter()
            .map(|(card, _)| *card)
            .find(|card| card.eq_ignore_ascii_case(token))
    })
}

/// Whether the entry key `key` is a common name of the card field `token`.
pub(crate) fn is_card_key(token: &str, key: &str) -> bool {
    let key = normalize(key);
    CARD_FIELDS
        .iter()
        .find(|(card, _)| *card == token)
        .is_some_and(|(_, names)| names.contains(&key.as_str()))
}

/// Lower case without spaces, `-`, `_` and `.`, so `Card Number` and `card_number` compare equal.
fn normalize(key: &str) -> String {
    key.chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, '-' | '_' | '.'))
        .flat_map(char::to_lowercase)
        .collect()
}
