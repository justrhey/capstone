use chrono::Utc;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::models::medical_record::{Allergy, MedicalRecord, Medication};
use crate::models::patient::Patient;
use crate::services::auth_service::AppError;
use crate::services::encryption::decrypt_field_opt;

/// Build a FHIR R4 Bundle (type = "collection") containing the patient plus all
/// downstream resources. All PHI fields are decrypted before serialization.
///
/// The returned value is a plain `serde_json::Value` so the caller can serve it
/// under `application/fhir+json` without introducing an FHIR model dependency.
pub async fn build_export_for_user(
    pool: &PgPool,
    user_id: Uuid,
    config: &Config,
) -> Result<Value, AppError> {
    let mut patient: Patient = sqlx::query_as::<_, Patient>(
        "SELECT * FROM patients WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("No patient profile linked to this account".into()))?;

    // Decrypt patient names in place.
    patient.first_name = decrypt_field_opt(&patient.first_name, &config.encryption_key);
    patient.last_name = decrypt_field_opt(&patient.last_name, &config.encryption_key);

    let records = sqlx::query_as::<_, MedicalRecord>(
        "SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC",
    )
    .bind(patient.id)
    .fetch_all(pool)
    .await?;

    let mut entries: Vec<Value> = Vec::new();
    entries.push(patient_entry(&patient));

    for mut record in records {
        record.subjective = decrypt_field_opt(&record.subjective, &config.encryption_key);
        record.objective = decrypt_field_opt(&record.objective, &config.encryption_key);
        record.assessment = decrypt_field_opt(&record.assessment, &config.encryption_key);
        record.plan = decrypt_field_opt(&record.plan, &config.encryption_key);

        if record.assessment.as_deref().map(|s| !s.is_empty()).unwrap_or(false) {
            entries.push(condition_entry(&record, patient.id));
        }

        let meds: Vec<Medication> = sqlx::query_as::<_, Medication>(
            "SELECT * FROM medications WHERE record_id = $1",
        )
        .bind(record.id)
        .fetch_all(pool)
        .await?;
        for med in &meds {
            entries.push(medication_statement_entry(med, patient.id));
        }

        let allergies: Vec<Allergy> = sqlx::query_as::<_, Allergy>(
            "SELECT * FROM allergies WHERE record_id = $1",
        )
        .bind(record.id)
        .fetch_all(pool)
        .await?;
        for a in &allergies {
            entries.push(allergy_entry(a, patient.id));
        }
    }

    Ok(json!({
        "resourceType": "Bundle",
        "id": format!("export-{}", Uuid::new_v4()),
        "type": "collection",
        "meta": {
            "lastUpdated": Utc::now().to_rfc3339(),
            "source": "ehr-blockchain",
        },
        "timestamp": Utc::now().to_rfc3339(),
        "entry": entries,
    }))
}

fn patient_entry(p: &Patient) -> Value {
    let mut telecom = Vec::new();
    if let Some(phone) = p.contact_number.clone().filter(|s| !s.is_empty()) {
        telecom.push(json!({ "system": "phone", "value": phone }));
    }

    let mut address = Vec::new();
    if let Some(addr) = p.address.clone().filter(|s| !s.is_empty()) {
        address.push(json!({ "text": addr }));
    }

    let mut extension = Vec::new();
    if let Some(bt) = p.blood_type.clone().filter(|s| !s.is_empty()) {
        extension.push(json!({
            "url": "http://hl7.org/fhir/StructureDefinition/patient-bloodType",
            "valueString": bt,
        }));
    }

    json!({
        "resource": {
            "resourceType": "Patient",
            "id": p.id.to_string(),
            "name": [{
                "given": [p.first_name.clone().unwrap_or_default()],
                "family": p.last_name.clone().unwrap_or_default(),
            }],
            "gender": p.sex,
            "birthDate": p.date_of_birth.to_string(),
            "telecom": telecom,
            "address": address,
            "extension": extension,
        }
    })
}

fn condition_entry(r: &MedicalRecord, patient_id: Uuid) -> Value {
    let mut note_texts: Vec<String> = Vec::new();
    if let Some(s) = r.subjective.as_deref().filter(|s| !s.is_empty()) {
        note_texts.push(format!("Subjective: {}", s));
    }
    if let Some(o) = r.objective.as_deref().filter(|s| !s.is_empty()) {
        note_texts.push(format!("Objective: {}", o));
    }
    if let Some(p) = r.plan.as_deref().filter(|s| !s.is_empty()) {
        note_texts.push(format!("Plan: {}", p));
    }
    let notes_json: Vec<Value> = note_texts
        .into_iter()
        .map(|t| json!({ "text": t }))
        .collect();

    json!({
        "resource": {
            "resourceType": "Condition",
            "id": r.id.to_string(),
            "subject": { "reference": format!("Patient/{}", patient_id) },
            "code": { "text": r.assessment.clone().unwrap_or_default() },
            "clinicalStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": "active",
                }]
            },
            "recordedDate": r.created_at.to_rfc3339(),
            "note": notes_json,
        }
    })
}

fn medication_statement_entry(m: &Medication, patient_id: Uuid) -> Value {
    json!({
        "resource": {
            "resourceType": "MedicationStatement",
            "id": m.id.to_string(),
            "status": "active",
            "subject": { "reference": format!("Patient/{}", patient_id) },
            "medicationCodeableConcept": { "text": m.name },
            "dosage": [{
                "text": format!("{}, {}", m.dosage, m.frequency),
            }],
        }
    })
}

fn allergy_entry(a: &Allergy, patient_id: Uuid) -> Value {
    let criticality = match a.severity.to_lowercase().as_str() {
        "severe" => "high",
        "moderate" => "low",
        _ => "low",
    };
    json!({
        "resource": {
            "resourceType": "AllergyIntolerance",
            "id": a.id.to_string(),
            "clinicalStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                    "code": "active",
                }]
            },
            "patient": { "reference": format!("Patient/{}", patient_id) },
            "code": { "text": a.allergen },
            "criticality": criticality,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_entry_with_resource_type(bundle: &Value, rt: &str) -> bool {
        bundle["entry"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .any(|e| e["resource"]["resourceType"].as_str() == Some(rt))
            })
            .unwrap_or(false)
    }

    /// Builds a minimal Bundle by hand (pure shape — no DB) so the validator can run.
    fn synthetic_bundle() -> Value {
        let patient_id = Uuid::new_v4();
        let entries = vec![
            json!({
                "resource": {
                    "resourceType": "Patient",
                    "id": patient_id.to_string(),
                    "name": [{ "given": ["Ana"], "family": "Reyes" }],
                    "birthDate": "1990-03-15",
                    "gender": "female",
                }
            }),
            json!({
                "resource": {
                    "resourceType": "Condition",
                    "id": Uuid::new_v4().to_string(),
                    "subject": { "reference": format!("Patient/{}", patient_id) },
                    "code": { "text": "Hypertension" },
                }
            }),
            json!({
                "resource": {
                    "resourceType": "MedicationStatement",
                    "id": Uuid::new_v4().to_string(),
                    "status": "active",
                    "subject": { "reference": format!("Patient/{}", patient_id) },
                    "medicationCodeableConcept": { "text": "Lisinopril" },
                }
            }),
            json!({
                "resource": {
                    "resourceType": "AllergyIntolerance",
                    "id": Uuid::new_v4().to_string(),
                    "patient": { "reference": format!("Patient/{}", patient_id) },
                    "code": { "text": "Penicillin" },
                    "criticality": "high",
                }
            }),
        ];
        json!({
            "resourceType": "Bundle",
            "id": format!("export-{}", Uuid::new_v4()),
            "type": "collection",
            "timestamp": Utc::now().to_rfc3339(),
            "entry": entries,
        })
    }

    /// Our minimal FHIR schema check — not a full validator, just the invariants
    /// we're contractually promising.
    fn assert_minimal_fhir_bundle(bundle: &Value) {
        assert_eq!(bundle["resourceType"], "Bundle");
        assert_eq!(bundle["type"], "collection");
        assert!(bundle["id"].as_str().is_some(), "bundle.id must be a string");
        assert!(bundle["timestamp"].as_str().is_some(), "bundle.timestamp must be ISO-8601");
        let entries = bundle["entry"].as_array().expect("entry must be an array");
        for e in entries {
            let rt = e["resource"]["resourceType"].as_str();
            assert!(
                matches!(rt, Some("Patient") | Some("Condition") | Some("MedicationStatement") | Some("AllergyIntolerance")),
                "unexpected resourceType: {:?}",
                rt
            );
        }
        assert!(
            has_entry_with_resource_type(bundle, "Patient"),
            "bundle must contain at least one Patient entry"
        );
    }

    #[test]
    fn synthetic_bundle_passes_minimal_schema() {
        let b = synthetic_bundle();
        assert_minimal_fhir_bundle(&b);
    }

    #[test]
    fn bundle_contains_all_expected_resource_types() {
        let b = synthetic_bundle();
        assert!(has_entry_with_resource_type(&b, "Patient"));
        assert!(has_entry_with_resource_type(&b, "Condition"));
        assert!(has_entry_with_resource_type(&b, "MedicationStatement"));
        assert!(has_entry_with_resource_type(&b, "AllergyIntolerance"));
    }

    #[test]
    fn patient_entry_includes_blood_type_extension() {
        let p = Patient {
            id: Uuid::new_v4(),
            user_id: None,
            date_of_birth: chrono::NaiveDate::from_ymd_opt(1990, 3, 15).unwrap(),
            sex: "female".into(),
            first_name: Some("Ana".into()),
            last_name: Some("Reyes".into()),
            blood_type: Some("A+".into()),
            contact_number: Some("+63 912 345 6789".into()),
            address: Some("123 Sampaguita St".into()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        };
        let entry = patient_entry(&p);
        let res = &entry["resource"];
        assert_eq!(res["resourceType"], "Patient");
        assert_eq!(res["gender"], "female");
        assert_eq!(res["telecom"][0]["value"], "+63 912 345 6789");
        let extensions = res["extension"].as_array().unwrap();
        assert!(extensions.iter().any(|e| e["valueString"] == "A+"));
    }

    #[test]
    fn allergy_severity_maps_to_criticality() {
        let mk = |sev: &str| Allergy {
            id: Uuid::new_v4(),
            record_id: Uuid::new_v4(),
            allergen: "Penicillin".into(),
            severity: sev.into(),
            created_at: Utc::now(),
        };
        assert_eq!(allergy_entry(&mk("severe"), Uuid::new_v4())["resource"]["criticality"], "high");
        assert_eq!(allergy_entry(&mk("moderate"), Uuid::new_v4())["resource"]["criticality"], "low");
        assert_eq!(allergy_entry(&mk("mild"), Uuid::new_v4())["resource"]["criticality"], "low");
    }
}
