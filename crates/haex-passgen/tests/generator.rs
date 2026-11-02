//! The generator with a deterministic random source, so every run draws the same numbers. These
//! are the checks holzi ran on its TypeScript generator (spec 034, FR-013, FR-014, SC-004).

use haex_passgen::{
    generate_password, generate_with, random_index, GeneratorConfig, GeneratorError,
};

/// mulberry32: a small, well mixed generator of 32 bit numbers from a seed.
fn seeded(seed: u32) -> impl FnMut() -> u32 {
    let mut state = seed;
    move || {
        state = state.wrapping_add(0x6d2b_79f5);
        let mut t = state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
}

fn base() -> GeneratorConfig {
    GeneratorConfig {
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: false,
        ..GeneratorConfig::default()
    }
}

const SYMBOLS: &str = "!@#$%^&*()_+-=[]{}|;:,.<>?";

fn value(config: &GeneratorConfig, random: &mut impl FnMut() -> u32) -> String {
    generate_with(config, random).expect("a value")
}

fn has(out: &str, test: impl Fn(char) -> bool) -> bool {
    out.chars().any(test)
}

#[test]
fn every_output_has_the_length_and_every_chosen_class() {
    let mut random = seeded(1);
    let configs = [
        base(),
        GeneratorConfig {
            length: 4,
            symbols: true,
            ..base()
        },
        GeneratorConfig {
            length: 3,
            uppercase: false,
            symbols: true,
            ..base()
        },
        GeneratorConfig {
            length: 64,
            lowercase: false,
            numbers: false,
            symbols: true,
            ..base()
        },
        GeneratorConfig {
            length: 1,
            uppercase: false,
            numbers: false,
            ..base()
        },
        GeneratorConfig {
            length: 256,
            ..base()
        },
    ];
    for config in &configs {
        for _ in 0..1000 {
            let out = value(config, &mut random);
            assert_eq!(out.chars().count(), config.length as usize);
            let classes = [
                (config.uppercase, has(&out, |c| c.is_ascii_uppercase())),
                (config.lowercase, has(&out, |c| c.is_ascii_lowercase())),
                (config.numbers, has(&out, |c| c.is_ascii_digit())),
                (config.symbols, has(&out, |c| SYMBOLS.contains(c))),
            ];
            for (index, (chosen, present)) in classes.into_iter().enumerate() {
                assert_eq!(chosen, present, "class {index} in {out}");
            }
        }
    }
}

#[test]
fn excluded_characters_never_appear_in_any_class() {
    let mut random = seeded(2);
    let config = GeneratorConfig {
        symbols: true,
        exclude_chars: "lO0I1|{}".to_owned(),
        ..base()
    };
    for _ in 0..1000 {
        let out = value(&config, &mut random);
        assert!(!has(&out, |c| "lO0I1|{}".contains(c)), "{out}");
    }
}

#[test]
fn pattern_mode_follows_its_letters_literals_and_a_backslash_escape() {
    let mut random = seeded(3);
    let config = GeneratorConfig {
        use_pattern: true,
        pattern: "cvCV-da-As\\d\\\\x".to_owned(),
        ..base()
    };
    let sets = [
        "bcdfghjklmnpqrstvwxyz",
        "aeiou",
        "BCDFGHJKLMNPQRSTVWXYZ",
        "AEIOU",
        "-",
        "0123456789",
        "abcdefghijklmnopqrstuvwxyz",
        "-",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        SYMBOLS,
        "d",
        "\\",
        "x",
    ];
    for _ in 0..500 {
        let out: Vec<char> = value(&config, &mut random).chars().collect();
        assert_eq!(out.len(), sets.len(), "{out:?}");
        for (char, set) in out.iter().zip(sets) {
            assert!(set.contains(*char), "{char} not in {set}");
        }
    }
}

#[test]
fn pattern_mode_ignores_the_length_and_the_excluded_characters() {
    let mut random = seeded(4);
    let config = GeneratorConfig {
        length: 3,
        use_pattern: true,
        pattern: "dddddddd".to_owned(),
        exclude_chars: "0123456789".to_owned(),
        ..base()
    };
    let out = value(&config, &mut random);
    assert_eq!(out.len(), 8);
    assert!(out.chars().all(|c| c.is_ascii_digit()));
}

#[test]
fn a_trailing_backslash_stays_as_it_is() {
    let config = GeneratorConfig {
        use_pattern: true,
        pattern: "x\\".to_owned(),
        ..base()
    };
    assert_eq!(value(&config, &mut seeded(9)), "x\\");
}

#[test]
fn a_choice_that_allows_no_output_is_an_error_not_a_value() {
    let mut random = seeded(5);
    let mut code = |config: GeneratorConfig| generate_with(&config, &mut random).unwrap_err();
    assert_eq!(
        code(GeneratorConfig {
            length: 2,
            ..base()
        }),
        GeneratorError::LengthBelowClasses
    );
    assert_eq!(
        code(GeneratorConfig {
            uppercase: false,
            lowercase: false,
            numbers: false,
            ..base()
        }),
        GeneratorError::NoClass
    );
    assert_eq!(
        code(GeneratorConfig {
            length: 0,
            ..base()
        }),
        GeneratorError::LengthRange
    );
    assert_eq!(
        code(GeneratorConfig {
            length: 257,
            ..base()
        }),
        GeneratorError::LengthRange
    );
    // A chosen class that the exclusion leaves empty cannot be satisfied.
    assert_eq!(
        code(GeneratorConfig {
            uppercase: false,
            lowercase: false,
            exclude_chars: "0123456789".to_owned(),
            ..base()
        }),
        GeneratorError::ClassEmpty
    );
    assert_eq!(
        code(GeneratorConfig {
            use_pattern: true,
            pattern: String::new(),
            ..base()
        }),
        GeneratorError::PatternEmpty
    );
    assert_eq!(
        GeneratorError::LengthBelowClasses.as_str(),
        "length_below_classes"
    );
}

#[test]
fn rejection_sampling_skips_the_biased_tail_of_the_random_range() {
    // For 3 choices the biased tail starts at 4294967295: that draw is dropped, the next is used.
    let mut queue = vec![7u32, 0xffff_ffff];
    assert_eq!(random_index(3, &mut || queue.pop().unwrap()), 7 % 3);
    assert!(queue.is_empty());
    assert_eq!(
        random_index(1, &mut || panic!("one choice needs no randomness")),
        0
    );
}

#[test]
fn the_choice_is_uniform() {
    // Chi-square over 60,000 draws from 7 choices; 6 degrees of freedom: 22.5 is the 99.9 % point.
    // The draws are fixed, so this never flakes.
    let mut random = seeded(6);
    let mut counts = [0u32; 7];
    let draws = 60_000;
    for _ in 0..draws {
        counts[random_index(7, &mut random)] += 1;
    }
    let expected = f64::from(draws) / 7.0;
    let chi_square: f64 = counts
        .iter()
        .map(|n| (f64::from(*n) - expected).powi(2) / expected)
        .sum();
    assert!(chi_square < 22.5, "chi-square {chi_square}");
}

#[test]
fn the_guaranteed_characters_are_shuffled_with_the_same_source() {
    let config = GeneratorConfig {
        length: 6,
        ..base()
    };
    assert_eq!(
        value(&config, &mut || 0),
        value(&config, &mut || 0),
        "the same draws give the same password"
    );
    let short = GeneratorConfig {
        length: 3,
        ..base()
    };
    let positions: std::collections::BTreeSet<usize> = (0..50)
        .map(|seed| {
            value(&short, &mut seeded(seed))
                .chars()
                .position(|c| c.is_ascii_digit())
                .unwrap()
        })
        .collect();
    assert!(positions.len() > 1, "the digit moves around");
}

#[test]
fn the_platform_source_satisfies_the_rules() {
    let config = GeneratorConfig {
        symbols: true,
        length: 16,
        ..base()
    };
    for _ in 0..50 {
        assert_eq!(generate_password(&config).unwrap().len(), 16);
    }
}

#[test]
fn the_configuration_reads_the_preset_shape() {
    let config: GeneratorConfig = serde_json::from_str(
        r#"{"length":12,"uppercase":false,"lowercase":true,"numbers":true,"symbols":false,
            "excludeChars":"0","usePattern":false,"pattern":"","isDefault":true}"#,
    )
    .unwrap();
    assert_eq!(config.length, 12);
    assert!(!config.uppercase);
    assert_eq!(config.exclude_chars, "0");
}
