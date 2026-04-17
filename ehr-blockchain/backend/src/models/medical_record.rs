use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MedicalRecord {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub created_by: Uuid,
    pub subjective: Option<String>,
    pub objective: Option<String>,
    pub assessment: Option<String>,
    #[sqlx(rename = "plan")]
    pub plan: Option<String>,
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

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Vital {
    pub id: Uuid,
    pub patient_id: Uuid,
    pub record_id: Option<Uuid>,
    pub kind: String,
    pub value: f64,
    pub unit: String,
    pub taken_at: DateTime<Utc>,
    pub recorded_by: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct VitalEntry {
    pub kind: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Order {
    pub id: Uuid,
    pub record_id: Uuid,
    pub patient_id: Uuid,
    pub kind: String,
    pub summary: String,
    pub details: Option<serde_json::Value>,
    pub status: String,
    pub ordered_by: Option<Uuid>,
    pub ordered_at: DateTime<Utc>,
    pub fulfilled_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Uuid>,
    pub resolution_note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRecordRequest {
    pub patient_id: Uuid,
    pub subjective: Option<String>,
    pub objective: Option<String>,
    pub assessment: Option<String>,
    pub plan: Option<String>,
    pub medications: Option<Vec<MedicationEntry>>,
    pub allergies: Option<Vec<AllergyEntry>>,
    pub vitals: Option<Vec<VitalEntry>>,
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
    pub vitals: Vec<Vital>,
    pub orders: Vec<Order>,
    pub blockchain_verified: bool,
    pub blockchain_tx_hash: Option<String>,
    pub receipt: Option<VerifyReceipt>,
}

/// Self-contained proof-of-anchor. A patient holding this JSON can
/// independently verify that their record was anchored on Stellar at the
/// time of creation, without trusting this backend.
///
/// **Contains plaintext PHI (`canonical_payload`) so the holder can recompute
/// the hash offline. Store securely.**
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyReceipt {
    pub record_id: Uuid,
    pub patient_id: Uuid,
    pub version: u32,
    pub record_hash: String,
    pub canonical_payload: String,
    pub hash_algorithm: String,
    pub contract_id: String,
    pub network: String,
    pub network_passphrase: String,
    pub rpc_url: String,
    pub tx_hash: Option<String>,
    pub ledger_timestamp: Option<i64>,
    pub issued_at: DateTime<Utc>,
    pub verify_instructions: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecordRequest {
    pub subjective: Option<String>,
    pub objective: Option<String>,
    pub assessment: Option<String>,
    pub plan: Option<String>,
    pub medications: Option<Vec<MedicationEntry>>,
    pub allergies: Option<Vec<AllergyEntry>>,
}
