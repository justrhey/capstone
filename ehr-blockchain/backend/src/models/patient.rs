use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Patient {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub date_of_birth: chrono::NaiveDate,
    pub sex: String,
    pub encrypted_pii: Option<Vec<u8>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatientRequest {
    pub date_of_birth: String,
    pub sex: String,
    pub first_name: String,
    pub last_name: String,
}

#[derive(Debug, Serialize)]
pub struct PatientResponse {
    pub id: Uuid,
    pub date_of_birth: String,
    pub sex: String,
    pub first_name: String,
    pub last_name: String,
    pub created_at: DateTime<Utc>,
}
