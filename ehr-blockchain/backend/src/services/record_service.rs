use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;
use crate::models::medical_record::{
    MedicalRecord, Medication, Allergy, Vital, Order, CreateRecordRequest, RecordResponse,
    UpdateRecordRequest, VerifyReceipt,
};
use crate::services::auth_service::AppError;
use crate::services::hash_service::hash_record_content;
use crate::services::blockchain_service::{store_record_hash, update_record_hash};
use crate::services::encryption::{decrypt_field_opt, encrypt_field_opt};
use crate::config::Config;

fn decrypt_record_in_place(record: &mut MedicalRecord, config: &Config) {
    record.subjective = decrypt_field_opt(&record.subjective, &config.encryption_key);
    record.objective = decrypt_field_opt(&record.objective, &config.encryption_key);
    record.assessment = decrypt_field_opt(&record.assessment, &config.encryption_key);
    record.plan = decrypt_field_opt(&record.plan, &config.encryption_key);
}

/// Build the canonical payload used for hashing — MUST match the input to
/// `hash_record_content` exactly so an offline verifier can reproduce the hash.
/// Format: `subjective|objective|assessment|plan` (SOAP order).
pub fn canonical_payload(record: &MedicalRecord) -> String {
    format!(
        "{}|{}|{}|{}",
        record.subjective.as_deref().unwrap_or(""),
        record.objective.as_deref().unwrap_or(""),
        record.assessment.as_deref().unwrap_or(""),
        record.plan.as_deref().unwrap_or(""),
    )
}

/// Construct a self-contained receipt for the given record + on-chain version.
pub fn build_receipt(
    record: &MedicalRecord,
    version: u32,
    tx_hash: Option<String>,
    ledger_timestamp: Option<i64>,
    config: &Config,
) -> VerifyReceipt {
    VerifyReceipt {
        record_id: record.id,
        patient_id: record.patient_id,
        version,
        record_hash: record.record_hash.clone(),
        canonical_payload: canonical_payload(record),
        hash_algorithm: "sha256".to_string(),
        contract_id: config.record_registry_contract_id.clone(),
        network: "Stellar Testnet".to_string(),
        network_passphrase: config.stellar_network_passphrase.clone(),
        rpc_url: config.stellar_rpc_url.clone(),
        tx_hash,
        ledger_timestamp,
        issued_at: Utc::now(),
        verify_instructions:
            "Compute SHA-256 of `canonical_payload` using your preferred tool. Call \
             RecordRegistry.verify_latest(record_id, hash) on the Stellar Testnet Soroban RPC. \
             A response of `true` confirms this record's current active version matches this \
             receipt's hash."
                .to_string(),
    }
}

pub async fn create_record(
    pool: &PgPool,
    req: CreateRecordRequest,
    created_by: Uuid,
) -> Result<RecordResponse, AppError> {
    let content = format!(
        "{}|{}|{}|{}",
        req.subjective.as_deref().unwrap_or(""),
        req.objective.as_deref().unwrap_or(""),
        req.assessment.as_deref().unwrap_or(""),
        req.plan.as_deref().unwrap_or(""),
    );
    let record_hash = hash_record_content(&content);

    // Encrypt sensitive fields before persisting. The hash above is over plaintext so it stays
    // verifiable against blockchain regardless of encryption.
    let config_for_enc = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    let subjective_enc = encrypt_field_opt(&req.subjective, &config_for_enc.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;
    let objective_enc = encrypt_field_opt(&req.objective, &config_for_enc.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;
    let assessment_enc = encrypt_field_opt(&req.assessment, &config_for_enc.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;
    let plan_enc = encrypt_field_opt(&req.plan, &config_for_enc.encryption_key)
        .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))?;

    let mut record = sqlx::query_as::<_, MedicalRecord>(
        "INSERT INTO medical_records (patient_id, created_by, subjective, objective, assessment, \"plan\", record_hash) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *"
    )
        .bind(req.patient_id)
        .bind(created_by)
        .bind(&subjective_enc)
        .bind(&objective_enc)
        .bind(&assessment_enc)
        .bind(&plan_enc)
        .bind(&record_hash)
        .fetch_one(pool)
        .await?;

    // Return plaintext to the caller even though we stored ciphertext.
    decrypt_record_in_place(&mut record, &config_for_enc);

    let mut medications = Vec::new();
    if let Some(meds) = req.medications {
        for med in meds {
            let m = sqlx::query_as::<_, Medication>(
                "INSERT INTO medications (record_id, name, dosage, frequency) VALUES ($1, $2, $3, $4) RETURNING *"
            )
                .bind(record.id)
                .bind(med.name)
                .bind(med.dosage)
                .bind(med.frequency)
                .fetch_one(pool)
                .await?;
            medications.push(m);
        }
    }

    let mut allergies = Vec::new();
    if let Some(alls) = req.allergies {
        for allergy in alls {
            let a = sqlx::query_as::<_, Allergy>(
                "INSERT INTO allergies (record_id, allergen, severity) VALUES ($1, $2, $3) RETURNING *"
            )
                .bind(record.id)
                .bind(allergy.allergen)
                .bind(allergy.severity)
                .fetch_one(pool)
                .await?;
            allergies.push(a);
        }
    }

    let mut vitals = Vec::new();
    if let Some(entries) = req.vitals {
        for v in entries {
            let row = sqlx::query_as::<_, Vital>(
                "INSERT INTO vitals (patient_id, record_id, kind, value, unit, recorded_by) \
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            )
            .bind(record.patient_id)
            .bind(record.id)
            .bind(&v.kind)
            .bind(v.value)
            .bind(&v.unit)
            .bind(created_by)
            .fetch_one(pool)
            .await?;
            vitals.push(row);
        }
    }

    let tx_hash = match Config::from_env() {
        Ok(config) => match store_record_hash(
            pool,
            &record.id.to_string(),
            &record.patient_id.to_string(),
            &record_hash,
            &config,
        )
        .await
        {
            Some(tx) => {
                sqlx::query("UPDATE medical_records SET blockchain_tx_id = $1 WHERE id = $2")
                    .bind(&tx.tx_hash)
                    .bind(record.id)
                    .execute(pool)
                    .await
                    .ok();
                Some(tx.tx_hash)
            }
            None => None,
        },
        Err(e) => {
            eprintln!("Config error: {}", e);
            None
        }
    };

    let blockchain_verified = tx_hash.is_some();

    // Receipt: only issued when the anchor actually landed on-chain (version = 1 for new records).
    let receipt = if blockchain_verified {
        Config::from_env().ok().map(|c| {
            build_receipt(&record, 1, tx_hash.clone(), None, &c)
        })
    } else {
        None
    };

    Ok(RecordResponse {
        record,
        medications,
        allergies,
        vitals,
        orders: Vec::new(),
        blockchain_verified,
        blockchain_tx_hash: tx_hash,
        receipt,
    })
}

pub async fn list_all_records(
    pool: &PgPool,
    page: crate::services::pagination::Page,
) -> Result<Vec<RecordResponse>, AppError> {
    let records = sqlx::query_as::<_, MedicalRecord>(
        "SELECT * FROM medical_records ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
        .bind(page.limit)
        .bind(page.offset)
        .fetch_all(pool)
        .await?;

    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;

    let mut responses = Vec::new();
    for mut record in records {
        let medications = sqlx::query_as::<_, Medication>("SELECT * FROM medications WHERE record_id = $1")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let allergies = sqlx::query_as::<_, Allergy>("SELECT * FROM allergies WHERE record_id = $1")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let blockchain_verified = record.blockchain_tx_id.is_some();
        let blockchain_tx_hash = record.blockchain_tx_id.clone();

        decrypt_record_in_place(&mut record, &config);

        let vitals = sqlx::query_as::<_, Vital>("SELECT * FROM vitals WHERE record_id = $1 ORDER BY taken_at DESC")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let orders = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE record_id = $1 ORDER BY ordered_at DESC")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        responses.push(RecordResponse {
            record,
            medications,
            allergies,
            vitals,
            orders,
            blockchain_verified,
            blockchain_tx_hash,
            receipt: None,
        });
    }

    Ok(responses)
}

pub async fn get_records_by_patient(pool: &PgPool, patient_id: Uuid) -> Result<Vec<RecordResponse>, AppError> {
    let records = sqlx::query_as::<_, MedicalRecord>(
        "SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC"
    )
        .bind(patient_id)
        .fetch_all(pool)
        .await?;

    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;

    let mut responses = Vec::new();
    for mut record in records {
        let medications = sqlx::query_as::<_, Medication>(
            "SELECT * FROM medications WHERE record_id = $1"
        )
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let allergies = sqlx::query_as::<_, Allergy>(
            "SELECT * FROM allergies WHERE record_id = $1"
        )
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let blockchain_verified = record.blockchain_tx_id.is_some();
        let blockchain_tx_hash = record.blockchain_tx_id.clone();

        decrypt_record_in_place(&mut record, &config);

        let vitals = sqlx::query_as::<_, Vital>("SELECT * FROM vitals WHERE record_id = $1 ORDER BY taken_at DESC")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        let orders = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE record_id = $1 ORDER BY ordered_at DESC")
            .bind(record.id)
            .fetch_all(pool)
            .await?;

        responses.push(RecordResponse {
            record,
            medications,
            allergies,
            vitals,
            orders,
            blockchain_verified,
            blockchain_tx_hash,
            receipt: None,
        });
    }

    Ok(responses)
}

pub async fn get_record_by_id(pool: &PgPool, id: Uuid) -> Result<MedicalRecord, AppError> {
    let mut record = sqlx::query_as::<_, MedicalRecord>("SELECT * FROM medical_records WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Medical record not found".into()))?;

    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    decrypt_record_in_place(&mut record, &config);
    Ok(record)
}

pub async fn update_record(
    pool: &PgPool,
    id: Uuid,
    req: UpdateRecordRequest,
) -> Result<RecordResponse, AppError> {
    // Get current record
    let current = get_record_by_id(pool, id).await?;
    
    // Use provided values or current values (which are already decrypted by get_record_by_id).
    let subjective = req.subjective.unwrap_or(current.subjective.unwrap_or_default());
    let objective = req.objective.unwrap_or(current.objective.unwrap_or_default());
    let assessment = req.assessment.unwrap_or(current.assessment.unwrap_or_default());
    let plan = req.plan.unwrap_or(current.plan.unwrap_or_default());

    // Compute new hash against plaintext SOAP canonical.
    let content = format!("{}|{}|{}|{}", subjective, objective, assessment, plan);
    let new_hash = hash_record_content(&content);

    let config = Config::from_env()
        .map_err(|e| AppError::InternalError(format!("Config error: {}", e)))?;
    let enc = |s: &str| {
        crate::services::encryption::encrypt_field(s, &config.encryption_key)
            .map_err(|e| AppError::InternalError(format!("Encryption failed: {}", e)))
    };
    let subjective_enc = enc(&subjective)?;
    let objective_enc = enc(&objective)?;
    let assessment_enc = enc(&assessment)?;
    let plan_enc = enc(&plan)?;

    let mut record = sqlx::query_as::<_, MedicalRecord>(
        "UPDATE medical_records SET subjective = $1, objective = $2, assessment = $3, \"plan\" = $4, \
         record_hash = $5, updated_at = NOW() WHERE id = $6 RETURNING *",
    )
        .bind(&subjective_enc)
        .bind(&objective_enc)
        .bind(&assessment_enc)
        .bind(&plan_enc)
        .bind(&new_hash)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to update record: {}", e)))?;

    decrypt_record_in_place(&mut record, &config);
    
    // Delete existing medications and allergies
    sqlx::query("DELETE FROM medications WHERE record_id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    
    sqlx::query("DELETE FROM allergies WHERE record_id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    
    // Insert new medications
    let mut medications = Vec::new();
    if let Some(meds) = req.medications {
        for med in meds {
            let m = sqlx::query_as::<_, Medication>(
                "INSERT INTO medications (record_id, name, dosage, frequency) VALUES ($1, $2, $3, $4) RETURNING *"
            )
                .bind(id)
                .bind(med.name)
                .bind(med.dosage)
                .bind(med.frequency)
                .fetch_one(pool)
                .await?;
            medications.push(m);
        }
    }
    
    // Insert new allergies
    let mut allergies = Vec::new();
    if let Some(alls) = req.allergies {
        for allergy in alls {
            let a = sqlx::query_as::<_, Allergy>(
                "INSERT INTO allergies (record_id, allergen, severity) VALUES ($1, $2, $3) RETURNING *"
            )
                .bind(id)
                .bind(allergy.allergen)
                .bind(allergy.severity)
                .fetch_one(pool)
                .await?;
            allergies.push(a);
        }
    }
    
    // Anchor the new version on-chain. The contract tombstones the prior version.
    let tx_hash = match Config::from_env() {
        Ok(config) => match update_record_hash(pool, &record.id.to_string(), &new_hash, &config).await {
            Some(tx) => {
                sqlx::query("UPDATE medical_records SET blockchain_tx_id = $1 WHERE id = $2")
                    .bind(&tx.tx_hash)
                    .bind(record.id)
                    .execute(pool)
                    .await
                    .ok();
                Some(tx.tx_hash)
            }
            None => record.blockchain_tx_id.clone(),
        },
        Err(e) => {
            eprintln!("Config error: {}", e);
            record.blockchain_tx_id.clone()
        }
    };
    
    let blockchain_verified = tx_hash.is_some();

    // For updates, the precise version isn't known without a chain roundtrip, so
    // we use 0 as a sentinel ("check chain for current version"). The patient
    // can call GET /api/records/:id/receipt for an authoritative one later.
    let receipt = if blockchain_verified {
        Config::from_env().ok().map(|c| {
            build_receipt(&record, 0, tx_hash.clone(), None, &c)
        })
    } else {
        None
    };

    let vitals = sqlx::query_as::<_, Vital>("SELECT * FROM vitals WHERE record_id = $1 ORDER BY taken_at DESC")
        .bind(record.id)
        .fetch_all(pool)
        .await?;

    let orders = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE record_id = $1 ORDER BY ordered_at DESC")
        .bind(record.id)
        .fetch_all(pool)
        .await?;

    Ok(RecordResponse {
        record,
        medications,
        allergies,
        vitals,
        orders,
        blockchain_verified,
        blockchain_tx_hash: tx_hash,
        receipt,
    })
}

pub async fn delete_record(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
    // Delete related medications and allergies first
    sqlx::query("DELETE FROM medications WHERE record_id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    
    sqlx::query("DELETE FROM allergies WHERE record_id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    
    // Delete the record
    sqlx::query("DELETE FROM medical_records WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to delete record: {}", e)))?;
    
    Ok(())
}