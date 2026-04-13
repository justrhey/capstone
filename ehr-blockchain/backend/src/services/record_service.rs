use sqlx::PgPool;
use uuid::Uuid;
use crate::models::medical_record::{
    MedicalRecord, Medication, Allergy, CreateRecordRequest, RecordResponse,
};
use crate::services::auth_service::AppError;
use crate::services::hash_service::hash_record_content;
use crate::services::blockchain_service::store_record_hash;
use crate::config::Config;

pub async fn create_record(
    pool: &PgPool,
    req: CreateRecordRequest,
    created_by: Uuid,
) -> Result<RecordResponse, AppError> {
    let content = format!(
        "{}|{}|{}",
        req.diagnosis.as_deref().unwrap_or(""),
        req.treatment.as_deref().unwrap_or(""),
        req.notes.as_deref().unwrap_or(""),
    );
    let record_hash = hash_record_content(&content);

    let record = sqlx::query_as::<_, MedicalRecord>(
        "INSERT INTO medical_records (patient_id, created_by, diagnosis, treatment, notes, record_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
    )
        .bind(req.patient_id)
        .bind(created_by)
        .bind(&req.diagnosis)
        .bind(&req.treatment)
        .bind(&req.notes)
        .bind(&record_hash)
        .fetch_one(pool)
        .await?;

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

    let tx_hash = match Config::from_env() {
        Ok(config) => {
            match store_record_hash(pool, &record.id.to_string(), &record_hash, &config).await {
                Ok(tx) => {
                    sqlx::query(
                        "UPDATE medical_records SET blockchain_tx_id = $1 WHERE id = $2"
                    )
                        .bind(&tx.tx_hash)
                        .bind(record.id)
                        .execute(pool)
                        .await.ok();
                    Some(tx.tx_hash)
                }
                Err(e) => {
                    eprintln!("Blockchain store error: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            eprintln!("Config error: {}", e);
            None
        }
    };

    let blockchain_verified = tx_hash.is_some();

    Ok(RecordResponse {
        record,
        medications,
        allergies,
        blockchain_verified,
        blockchain_tx_hash: tx_hash,
    })
}

pub async fn get_records_by_patient(pool: &PgPool, patient_id: Uuid) -> Result<Vec<RecordResponse>, AppError> {
    let records = sqlx::query_as::<_, MedicalRecord>(
        "SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC"
    )
        .bind(patient_id)
        .fetch_all(pool)
        .await?;

    let mut responses = Vec::new();
    for record in records {
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

        responses.push(RecordResponse {
            record,
            medications,
            allergies,
            blockchain_verified,
            blockchain_tx_hash,
        });
    }

    Ok(responses)
}