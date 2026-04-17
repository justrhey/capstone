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
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub blood_type: Option<String>,
    pub contact_number: Option<String>,
    pub address: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatientRequest {
    pub date_of_birth: String,
    pub sex: String,
    pub first_name: String,
    pub last_name: String,
    pub blood_type: Option<String>,
    pub contact_number: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatientWithAccountRequest {
    pub date_of_birth: String,
    pub sex: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub password: String,
    pub blood_type: Option<String>,
    pub contact_number: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PatientResponse {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub date_of_birth: String,
    pub sex: String,
    pub first_name: String,
    pub last_name: String,
    pub blood_type: Option<String>,
    pub contact_number: Option<String>,
    pub address: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePatientRequest {
    pub date_of_birth: Option<String>,
    pub sex: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub blood_type: Option<String>,
    pub contact_number: Option<String>,
    pub address: Option<String>,
}
