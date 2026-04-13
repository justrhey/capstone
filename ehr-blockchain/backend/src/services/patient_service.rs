use sqlx::PgPool;
use crate::models::patient::{Patient, CreatePatientRequest, CreatePatientWithAccountRequest};
use crate::models::RegisterRequest;
use crate::services::auth_service::{register_user, AppError};
use crate::services::encryption::encrypt_data;
use crate::config::Config;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PatientWithUserResponse {
    pub patient_id: uuid::Uuid,
    pub user_id: uuid::Uuid,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
}

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
        "INSERT INTO patients (date_of_birth, sex, encrypted_pii, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING *"
    )
        .bind(dob)
        .bind(&req.sex)
        .bind(encrypted)
        .bind(&req.first_name)
        .bind(&req.last_name)
        .fetch_one(pool)
        .await?;

    Ok(patient)
}

pub async fn create_patient_with_user(
    pool: &PgPool,
    req: CreatePatientWithAccountRequest,
    config: &Config,
) -> Result<PatientWithUserResponse, AppError> {
    // Create register request
    let register_req = RegisterRequest {
        email: req.email.clone(),
        password: req.password.clone(),
        first_name: req.first_name.clone(),
        last_name: req.last_name.clone(),
        role: "patient".to_string(),
    };
    
    // First create user account
    let user = register_user(pool, register_req, config).await?;

    // Then create patient profile linked to user
    let pii = format!("{}|{}", req.first_name, req.last_name);
    let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;

    let dob = req.date_of_birth.parse::<chrono::NaiveDate>()
        .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;

    let patient = sqlx::query_as::<_, Patient>(
        "INSERT INTO patients (user_id, date_of_birth, sex, encrypted_pii, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
    )
        .bind(user.user.id)
        .bind(dob)
        .bind(&req.sex)
        .bind(encrypted)
        .bind(&req.first_name)
        .bind(&req.last_name)
        .fetch_one(pool)
        .await?;

    Ok(PatientWithUserResponse {
        patient_id: patient.id,
        user_id: user.user.id,
        email: user.user.email,
        first_name: req.first_name,
        last_name: req.last_name,
    })
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
