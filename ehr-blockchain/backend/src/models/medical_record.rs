use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MedicalRecord {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub created_by: Uuid,
    pub diagnosis: Option<String>,
    pub treatment: Option<String>,
    pub notes: Option<String>,
    pub record_hash: String,
    pub blockchain_tx_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Medication {
    pub id: Uuid,
    pub record_id: Uuid,
    pub name: String,
    pub dosage: String,
    pub frequency: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Allergy {
    pub id: Uuid,
    pub record_id: Uuid,
    pub allergen: String,
    pub severity: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRecordRequest {
    pub patient_id: Uuid,
    pub diagnosis: Option<String>,
    pub treatment: Option<String>,
    pub notes: Option<String>,
    pub medications: Option<Vec<MedicationEntry>>,
    pub allergies: Option<Vec<AllergyEntry>>,
}

#[derive(Debug, Deserialize)]
pub struct MedicationEntry {
    pub name: String,
    pub dosage: String,
    pub frequency: String,
}

#[derive(Debug, Deserialize)]
pub struct AllergyEntry {
    pub allergen: String,
    pub severity: String,
}

#[derive(Debug, Serialize)]
pub struct RecordResponse {
    pub record: MedicalRecord,
    pub medications: Vec<Medication>,
    pub allergies: Vec<Allergy>,
    pub blockchain_verified: bool,
    pub blockchain_tx_hash: Option<String>,
}
