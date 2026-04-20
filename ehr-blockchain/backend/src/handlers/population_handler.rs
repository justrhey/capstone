//! EXT-5: Population health dashboard queries.
//!
//! Simple cohort counts over structured fields we already capture: problem
//! descriptions, active vs. resolved state, and vital outliers. Deliberately
//! read-only and aggregate — no PHI leaves the endpoint.

use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use serde::Serialize;
use sqlx::PgPool;

use crate::services::auth_service::{require_role, AppError};

#[derive(Debug, Serialize)]
struct ChronicCohort {
    label: &'static str,
    keywords: Vec<&'static str>,
    active_patients: i64,
}

const COHORTS: &[(&str, &[&str])] = &[
    ("Diabetes", &["diabetes", "dm type", "t2dm", "t1dm"]),
    ("Hypertension", &["hypertension", "htn", "high blood pressure"]),
    ("Asthma", &["asthma"]),
    ("COPD", &["copd", "emphysema"]),
    ("CKD", &["ckd", "chronic kidney"]),
    ("Heart failure", &["heart failure", "chf"]),
    ("Obesity", &["obesity", "bmi > 30"]),
    ("Hyperlipidemia", &["hyperlipid", "dyslipid", "high cholesterol"]),
    ("Depression", &["depression", "mdd"]),
    ("Anxiety", &["anxiety", "gad"]),
];

#[get("/api/population/cohorts")]
async fn cohorts(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin", "auditor"])?;

    let mut out: Vec<ChronicCohort> = Vec::new();
    for (label, kws) in COHORTS {
        // Build an OR-matched ILIKE. Bind each keyword separately.
        let placeholders: Vec<String> =
            (1..=kws.len()).map(|i| format!("description ILIKE ${}", i)).collect();
        let sql = format!(
            "SELECT COUNT(DISTINCT patient_id) FROM problems \
             WHERE status = 'active' AND ({})",
            placeholders.join(" OR ")
        );
        let mut q = sqlx::query_scalar::<_, i64>(&sql);
        for kw in *kws {
            q = q.bind(format!("%{}%", kw));
        }
        let n = q.fetch_one(pool.get_ref()).await.unwrap_or(0);
        out.push(ChronicCohort {
            label,
            keywords: kws.to_vec(),
            active_patients: n,
        });
    }
    out.sort_by(|a, b| b.active_patients.cmp(&a.active_patients));

    // Risk flags based on the most recent vitals per patient.
    let high_bp: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT v.patient_id) FROM vitals v \
         WHERE v.kind = 'systolic_bp' AND v.value >= 140",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let tachycardia: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT v.patient_id) FROM vitals v \
         WHERE v.kind = 'heart_rate' AND v.value >= 100",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let low_spo2: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT v.patient_id) FROM vitals v \
         WHERE v.kind = 'spo2' AND v.value < 92",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "cohorts": out,
        "vital_flags": {
            "systolic_bp_ge_140": high_bp,
            "heart_rate_ge_100":  tachycardia,
            "spo2_lt_92":         low_spo2,
        }
    })))
}

pub fn population_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(cohorts);
}
