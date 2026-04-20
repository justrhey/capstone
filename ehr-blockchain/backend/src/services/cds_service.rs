//! OPS-2: Clinical Decision Support.
//!
//! Two simple rule families:
//!   - drug-allergy: a newly-prescribed med hits a substance class the patient is
//!     documented allergic to (case-insensitive substring match + small class map).
//!   - drug-drug: two active meds appear together in a hardcoded interaction set.
//!
//! The set is deliberately tiny — this is a capstone demo, not a commercial CDS.
//! The caller should surface these as non-blocking warnings in the UI.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CdsAlert {
    pub severity: String,      // "info" | "warning" | "critical"
    pub kind: String,          // "drug_allergy" | "drug_drug"
    pub message: String,
    pub involves: Vec<String>, // med names / allergen names for UI highlighting
}

/// Rough allergen → drug-class mappings. Keys are allergen substrings; values
/// are drug-name substrings that should fire the alert.
const ALLERGY_MAP: &[(&str, &[&str])] = &[
    ("penicillin", &["penicillin", "amoxicillin", "ampicillin", "augmentin"]),
    ("sulfa", &["sulfa", "bactrim", "trimethoprim", "sulfamethoxazole"]),
    ("aspirin", &["aspirin", "acetylsalicylic"]),
    ("nsaid", &["ibuprofen", "naproxen", "ketorolac", "diclofenac"]),
    ("ibuprofen", &["ibuprofen"]),
    ("codeine", &["codeine", "tramadol"]),
    ("latex", &[]), // non-drug; surfaced informationally if mentioned
    ("peanut", &[]),
    ("shellfish", &["iodine", "contrast"]),
];

/// Minimal pairwise drug-drug interaction list. Both names are substrings,
/// lower-cased. Order doesn't matter.
const INTERACTIONS: &[(&str, &str, &str, &str)] = &[
    ("warfarin", "aspirin", "critical", "Additive bleeding risk"),
    ("warfarin", "ibuprofen", "critical", "Additive bleeding risk"),
    ("warfarin", "naproxen", "critical", "Additive bleeding risk"),
    ("warfarin", "amoxicillin", "warning", "Possible INR elevation"),
    ("ssri", "maoi", "critical", "Serotonin syndrome risk"),
    ("fluoxetine", "maoi", "critical", "Serotonin syndrome risk"),
    ("sertraline", "maoi", "critical", "Serotonin syndrome risk"),
    ("fluoxetine", "tramadol", "warning", "Serotonin syndrome risk"),
    ("metformin", "contrast", "warning", "Hold metformin before IV contrast"),
    ("ace inhibitor", "potassium", "warning", "Hyperkalemia risk"),
    ("lisinopril", "spironolactone", "warning", "Hyperkalemia risk"),
    ("statin", "clarithromycin", "warning", "Increased statin levels"),
    ("simvastatin", "clarithromycin", "critical", "Rhabdomyolysis risk"),
    ("digoxin", "amiodarone", "warning", "Increased digoxin levels"),
];

fn contains_ci(haystack: &str, needle: &str) -> bool {
    haystack.to_ascii_lowercase().contains(&needle.to_ascii_lowercase())
}

/// Checks a set of proposed + existing medications against the patient's
/// documented allergies and known pairwise interactions.
pub fn screen(
    new_meds: &[String],
    existing_meds: &[String],
    allergies: &[String],
) -> Vec<CdsAlert> {
    let mut alerts = Vec::new();

    // Drug-allergy: check each new med against each allergy.
    for med in new_meds {
        for allergen in allergies {
            let alow = allergen.to_ascii_lowercase();
            for (key, drugs) in ALLERGY_MAP {
                if alow.contains(key) {
                    for d in *drugs {
                        if contains_ci(med, d) {
                            alerts.push(CdsAlert {
                                severity: "critical".to_string(),
                                kind: "drug_allergy".to_string(),
                                message: format!(
                                    "{} may trigger documented {} allergy",
                                    med, allergen
                                ),
                                involves: vec![med.clone(), allergen.clone()],
                            });
                        }
                    }
                }
            }
            // Also flag direct substring match even without class map.
            if contains_ci(med, allergen) {
                alerts.push(CdsAlert {
                    severity: "critical".to_string(),
                    kind: "drug_allergy".to_string(),
                    message: format!("{} matches documented allergy: {}", med, allergen),
                    involves: vec![med.clone(), allergen.clone()],
                });
            }
        }
    }

    // Drug-drug: cross-check new vs. (new + existing).
    let all_meds: Vec<&String> = new_meds.iter().chain(existing_meds.iter()).collect();
    for new in new_meds {
        for other in &all_meds {
            if std::ptr::eq(new, *other) {
                continue;
            }
            for (a, b, sev, msg) in INTERACTIONS {
                let new_l = new.to_ascii_lowercase();
                let other_l = other.to_ascii_lowercase();
                let hits = (new_l.contains(a) && other_l.contains(b))
                    || (new_l.contains(b) && other_l.contains(a));
                if hits {
                    alerts.push(CdsAlert {
                        severity: sev.to_string(),
                        kind: "drug_drug".to_string(),
                        message: format!("{}: {} + {}", msg, new, other),
                        involves: vec![new.clone(), (*other).clone()],
                    });
                }
            }
        }
    }

    // Dedupe on (kind, message).
    alerts.sort_by(|a, b| a.message.cmp(&b.message));
    alerts.dedup_by(|a, b| a.kind == b.kind && a.message == b.message);
    alerts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_penicillin_class_allergy() {
        let alerts = screen(
            &["Amoxicillin 500mg".into()],
            &[],
            &["Penicillin".into()],
        );
        assert!(alerts.iter().any(|a| a.kind == "drug_allergy"));
    }

    #[test]
    fn flags_direct_name_allergy() {
        let alerts = screen(&["Aspirin".into()], &[], &["Aspirin".into()]);
        assert!(!alerts.is_empty());
    }

    #[test]
    fn flags_warfarin_aspirin_interaction() {
        let alerts = screen(&["Aspirin 81mg".into()], &["Warfarin 5mg".into()], &[]);
        let critical: Vec<_> = alerts.iter().filter(|a| a.kind == "drug_drug").collect();
        assert!(!critical.is_empty(), "expected drug-drug alert, got {:?}", alerts);
        assert_eq!(critical[0].severity, "critical");
    }

    #[test]
    fn no_alerts_when_unrelated() {
        let alerts = screen(
            &["Loratadine 10mg".into()],
            &["Ibuprofen 200mg".into()],
            &["Peanut".into()],
        );
        assert!(alerts.is_empty(), "expected no alerts, got {:?}", alerts);
    }

    #[test]
    fn dedupes_identical_messages() {
        // Same allergen repeated verbatim should produce one alert, not two.
        let alerts = screen(
            &["Amoxicillin 500mg".into()],
            &[],
            &["Penicillin".into(), "Penicillin".into()],
        );
        assert_eq!(alerts.len(), 1, "should dedupe identical, got {:?}", alerts);
    }
}
