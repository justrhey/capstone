use sqlx::PgPool;
use crate::models::patient::{Patient, CreatePatientRequest};
use crate::services::auth_service::AppError;
use crate::services::encryption::encrypt_data;
use crate::config::Config;

pub async fn create_patient(
    pool: &PgPool,
    req: CreatePatientRequest,
    config: &Config,
) -> Result<Patient, AppError> {
    let pii = format!("{}|{}", req.first_name, req.last_name);
    let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;

    let dob = req.date_of_birth.parse::<chrono::NaiveDate>()
        .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;

    let patient = sqlx::query_as::<_, Patient>(
        "INSERT INTO patients (date_of_birth, sex, encrypted_pii) VALUES ($1, $2, $3) RETURNING *"
    )
        .bind(dob)
        .bind(&req.sex)
        .bind(encrypted)
        .fetch_one(pool)
        .await?;

    Ok(patient)
}

pub async fn list_patients(pool: &PgPool) -> Result<Vec<Patient>, AppError> {
    let patients = sqlx::query_as::<_, Patient>("SELECT * FROM patients ORDER BY created_at DESC")
        .fetch_all(pool)
        .await?;

    Ok(patients)
}

pub async fn get_patient_by_id(pool: &PgPool, id: uuid::Uuid) -> Result<Patient, AppError> {
    let patient = sqlx::query_as::<_, Patient>("SELECT * FROM patients WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    patient.ok_or_else(|| AppError::NotFound("Patient not found".into()))
}
