use sqlx::PgPool;
use crate::models::patient::{Patient, CreatePatientRequest, CreatePatientWithAccountRequest, UpdatePatientRequest};
use crate::models::User;
use crate::services::auth_service::{hash_password, AppError};
use crate::services::encryption::{decrypt_field_opt, encrypt_field};
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

fn decrypt_patient_in_place(patient: &mut Patient, config: &Config) {
    patient.first_name = decrypt_field_opt(&patient.first_name, &config.encryption_key);
    patient.last_name = decrypt_field_opt(&patient.last_name, &config.encryption_key);
}

fn encrypt_name(value: &str, config: &Config) -> Result<String, AppError> {
    encrypt_field(value, &config.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))
}

pub async fn create_patient(
    pool: &PgPool,
    req: CreatePatientRequest,
    config: &Config,
) -> Result<Patient, AppError> {
    let dob = req.date_of_birth.parse::<chrono::NaiveDate>()
        .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;

    let first_enc = encrypt_name(&req.first_name, config)?;
    let last_enc = encrypt_name(&req.last_name, config)?;

    let mut patient = sqlx::query_as::<_, Patient>(
        "INSERT INTO patients (date_of_birth, sex, first_name, last_name, blood_type, contact_number, address) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *"
    )
        .bind(dob)
        .bind(&req.sex)
        .bind(&first_enc)
        .bind(&last_enc)
        .bind(&req.blood_type)
        .bind(&req.contact_number)
        .bind(&req.address)
        .fetch_one(pool)
        .await?;

    decrypt_patient_in_place(&mut patient, config);
    Ok(patient)
}

pub async fn create_patient_with_user(
    pool: &PgPool,
    req: CreatePatientWithAccountRequest,
    config: &Config,
) -> Result<PatientWithUserResponse, AppError> {
    if req.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_one(pool)
        .await?;
    if existing > 0 {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let password_hash = hash_password(&req.password)
        .map_err(|e| AppError::InternalError(format!("Failed to hash password: {}", e)))?;

    let dob = req.date_of_birth.parse::<chrono::NaiveDate>()
        .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;

    let first_enc = encrypt_name(&req.first_name, config)?;
    let last_enc = encrypt_name(&req.last_name, config)?;

    let mut tx = pool.begin().await?;

    // Users table stays plaintext for names (needed for login display, staff lookup).
    // Admin-created patient accounts inherit the current consent on behalf of the
    // data subject — the admin is expected to have obtained consent out-of-band.
    // The patient can revoke via Settings at any time.
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash, role, first_name, last_name, consent_version, consent_accepted_at) \
         VALUES ($1, $2, 'patient', $3, $4, $5, NOW()) RETURNING *",
    )
        .bind(&req.email)
        .bind(&password_hash)
        .bind(&req.first_name)
        .bind(&req.last_name)
        .bind(crate::services::auth_service::CURRENT_CONSENT_VERSION)
        .fetch_one(&mut *tx)
        .await?;

    let patient = sqlx::query_as::<_, Patient>(
        "INSERT INTO patients (user_id, date_of_birth, sex, first_name, last_name, blood_type, contact_number, address) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
    )
        .bind(user.id)
        .bind(dob)
        .bind(&req.sex)
        .bind(&first_enc)
        .bind(&last_enc)
        .bind(&req.blood_type)
        .bind(&req.contact_number)
        .bind(&req.address)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(PatientWithUserResponse {
        patient_id: patient.id,
        user_id: user.id,
        email: user.email,
        first_name: req.first_name,
        last_name: req.last_name,
    })
}

pub async fn list_patients(
    pool: &PgPool,
    page: crate::services::pagination::Page,
) -> Result<Vec<Patient>, AppError> {
    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    let mut patients = sqlx::query_as::<_, Patient>(
        "SELECT * FROM patients WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool)
        .await?;
    for p in &mut patients {
        decrypt_patient_in_place(p, &config);
    }
    Ok(patients)
}

/// SEC-4: only return patients assigned to this staff user.
pub async fn list_assigned_patients(
    pool: &PgPool,
    staff_user_id: uuid::Uuid,
    page: crate::services::pagination::Page,
) -> Result<Vec<Patient>, AppError> {
    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    let mut patients = sqlx::query_as::<_, Patient>(
        "SELECT p.* FROM patients p \
         JOIN patient_assignments a ON a.patient_id = p.id \
         WHERE p.deleted_at IS NULL \
           AND a.staff_user_id = $1 \
           AND a.removed_at IS NULL \
         ORDER BY p.created_at DESC LIMIT $2 OFFSET $3",
    )
        .bind(staff_user_id)
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool)
        .await?;
    for p in &mut patients {
        decrypt_patient_in_place(p, &config);
    }
    Ok(patients)
}

/// Is the caller's current session inside an active break-glass window?
pub async fn session_is_break_glass(
    pool: &PgPool,
    jti: Option<uuid::Uuid>,
) -> bool {
    let Some(jti) = jti else { return false };
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1 \
         AND break_glass_until IS NOT NULL AND break_glass_until > NOW())",
    )
    .bind(jti)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

pub async fn get_patient_by_id(pool: &PgPool, id: uuid::Uuid) -> Result<Patient, AppError> {
    let mut patient = sqlx::query_as::<_, Patient>(
        "SELECT * FROM patients WHERE id = $1 AND deleted_at IS NULL",
    )
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Patient not found".into()))?;
    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    decrypt_patient_in_place(&mut patient, &config);
    Ok(patient)
}

pub async fn update_patient(
    pool: &PgPool,
    id: uuid::Uuid,
    req: UpdatePatientRequest,
    config: &Config,
) -> Result<Patient, AppError> {
    // Ensure the patient exists (and surface NotFound if not).
    let _current = get_patient_by_id(pool, id).await?;

    let mut updates: Vec<String> = Vec::new();
    let mut param_count = 0;

    if req.first_name.is_some() {
        param_count += 1;
        updates.push(format!("first_name = ${}", param_count));
    }
    if req.last_name.is_some() {
        param_count += 1;
        updates.push(format!("last_name = ${}", param_count));
    }
    if req.sex.is_some() {
        param_count += 1;
        updates.push(format!("sex = ${}", param_count));
    }
    if req.date_of_birth.is_some() {
        param_count += 1;
        updates.push(format!("date_of_birth = ${}", param_count));
    }
    if req.blood_type.is_some() {
        param_count += 1;
        updates.push(format!("blood_type = ${}", param_count));
    }
    if req.contact_number.is_some() {
        param_count += 1;
        updates.push(format!("contact_number = ${}", param_count));
    }
    if req.address.is_some() {
        param_count += 1;
        updates.push(format!("address = ${}", param_count));
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".into()));
    }

    let query = format!(
        "UPDATE patients SET {}, updated_at = NOW() WHERE id = ${} RETURNING *",
        updates.join(", "),
        param_count + 1
    );

    let mut qb = sqlx::query_as::<_, Patient>(&query);

    if let Some(ref first_name) = req.first_name {
        qb = qb.bind(encrypt_name(first_name, config)?);
    }
    if let Some(ref last_name) = req.last_name {
        qb = qb.bind(encrypt_name(last_name, config)?);
    }
    if let Some(ref sex) = req.sex {
        qb = qb.bind(sex);
    }
    if let Some(ref dob) = req.date_of_birth {
        let parsed = dob.parse::<chrono::NaiveDate>()
            .map_err(|e| AppError::BadRequest(format!("Invalid date format: {}", e)))?;
        qb = qb.bind(parsed);
    }
    if let Some(ref blood_type) = req.blood_type {
        qb = qb.bind(blood_type);
    }
    if let Some(ref contact_number) = req.contact_number {
        qb = qb.bind(contact_number);
    }
    if let Some(ref address) = req.address {
        qb = qb.bind(address);
    }
    qb = qb.bind(id);

    let mut patient = qb.fetch_one(pool).await
        .map_err(|e| AppError::InternalError(format!("Failed to update patient: {}", e)))?;

    decrypt_patient_in_place(&mut patient, config);
    Ok(patient)
}

pub async fn delete_patient(pool: &PgPool, id: uuid::Uuid) -> Result<(), AppError> {
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
