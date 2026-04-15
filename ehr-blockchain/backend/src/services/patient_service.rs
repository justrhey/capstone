use sqlx::PgPool;
use crate::models::patient::{Patient, CreatePatientRequest, CreatePatientWithAccountRequest, UpdatePatientRequest};
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

pub async fn update_patient(
    pool: &PgPool,
    id: uuid::Uuid,
    req: UpdatePatientRequest,
    config: &Config,
) -> Result<Patient, AppError> {
    // Get current patient to check if exists
    let current = get_patient_by_id(pool, id).await?;
    
    // Build dynamic update query
    let mut updates = Vec::new();
    let mut param_count = 0;
    
    if let Some(ref first_name) = req.first_name {
        param_count += 1;
        updates.push(format!("first_name = ${}", param_count));
        // Re-encrypt PII if name changes
        let pii = format!("{}|{}", first_name, current.last_name.as_deref().unwrap_or(""));
        let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key)
            .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;
        param_count += 1;
        updates.push(format!("encrypted_pii = ${}", param_count));
    }
    
    if let Some(ref last_name) = req.last_name {
        param_count += 1;
        updates.push(format!("last_name = ${}", param_count));
        // Re-encrypt PII if last name changes
        let pii = format!("{}|{}", current.first_name.as_deref().unwrap_or(""), last_name);
        let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key)
            .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;
        param_count += 1;
        updates.push(format!("encrypted_pii = ${}", param_count));
    }
    
    if let Some(ref sex) = req.sex {
        param_count += 1;
        updates.push(format!("sex = ${}", param_count));
    }
    
    if let Some(ref dob) = req.date_of_birth {
        let parsed = dob.parse::<chrono::NaiveDate>()
            .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;
        param_count += 1;
        updates.push(format!("date_of_birth = ${}", param_count));
    }
    
    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".into()));
    }
    
    // Build and execute the query
    let query = format!(
        "UPDATE patients SET {} WHERE id = ${} RETURNING *",
        updates.join(", "),
        param_count + 1
    );
    
    let mut query_builder = sqlx::query_as::<_, Patient>(&query);
    
    // Bind parameters in order
    let mut idx = 1;
    if let Some(ref first_name) = req.first_name {
        query_builder = query_builder.bind(first_name);
        let pii = format!("{}|{}", first_name, current.last_name.as_deref().unwrap_or(""));
        let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key).unwrap();
        query_builder = query_builder.bind(encrypted);
    }
    
    if let Some(ref last_name) = req.last_name {
        query_builder = query_builder.bind(last_name);
        let pii = format!("{}|{}", current.first_name.as_deref().unwrap_or(""), last_name);
        let encrypted = encrypt_data(pii.as_bytes(), &config.encryption_key).unwrap();
        query_builder = query_builder.bind(encrypted);
    }
    
    if let Some(ref sex) = req.sex {
        query_builder = query_builder.bind(sex);
    }
    
    if let Some(ref dob) = req.date_of_birth {
        let parsed = dob.parse::<chrono::NaiveDate>().unwrap();
        query_builder = query_builder.bind(parsed);
    }
    
    query_builder = query_builder.bind(id);
    
    let patient = query_builder.fetch_one(pool).await
        .map_err(|e| AppError::InternalError(format!("Failed to update patient: {}", e)))?;
    
    Ok(patient)
}

pub async fn delete_patient(pool: &PgPool, id: uuid::Uuid) -> Result<(), AppError> {
    // Check if patient has records
    let record_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM medical_records WHERE patient_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    
    if record_count.0 > 0 {
        return Err(AppError::BadRequest(
            "Cannot delete patient with existing medical records. Delete records first.".into()
        ));
    }
    
    sqlx::query("DELETE FROM patients WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to delete patient: {}", e)))?;
    
    Ok(())
}
