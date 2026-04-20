use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use serde::Serialize;
use sqlx::PgPool;

use crate::services::auth_service::{require_role, AppError};

#[derive(Debug, Serialize)]
struct SexCount {
    sex: Option<String>,
    count: i64,
}

#[derive(Debug, Serialize)]
struct AgeBucket {
    bucket: String,
    count: i64,
}

#[derive(Debug, Serialize)]
struct MonthlyCount {
    month: String,
    count: i64,
}

#[derive(Debug, Serialize)]
struct RoleCount {
    role: String,
    count: i64,
}

#[derive(Debug, Serialize)]
struct TopProblem {
    description: String,
    count: i64,
}

/// OPS-7: aggregate stats for admin/auditor. Read-only.
#[get("/api/reports/summary")]
async fn reports_summary(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder, AppError> {
    require_role(&req, &["admin", "auditor"])?;

    let patients_total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL")
            .fetch_one(pool.get_ref())
            .await
            .unwrap_or(0);

    let records_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM medical_records")
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    let users_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL")
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    let open_orders: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM orders WHERE status = 'ordered'")
            .fetch_one(pool.get_ref())
            .await
            .unwrap_or(0);

    let appts_upcoming: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM appointments WHERE status = 'scheduled' AND start_at >= NOW()",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let active_problems: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM problems WHERE status = 'active'")
            .fetch_one(pool.get_ref())
            .await
            .unwrap_or(0);

    let by_sex: Vec<SexCount> = sqlx::query_as::<_, (Option<String>, i64)>(
        "SELECT sex, COUNT(*) FROM patients WHERE deleted_at IS NULL GROUP BY sex",
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(sex, count)| SexCount { sex, count })
    .collect();

    // Age buckets from date_of_birth.
    let by_age: Vec<AgeBucket> = sqlx::query_as::<_, (String, i64)>(
        "SELECT CASE \
            WHEN AGE(date_of_birth) < INTERVAL '18 years' THEN '0-17' \
            WHEN AGE(date_of_birth) < INTERVAL '30 years' THEN '18-29' \
            WHEN AGE(date_of_birth) < INTERVAL '45 years' THEN '30-44' \
            WHEN AGE(date_of_birth) < INTERVAL '65 years' THEN '45-64' \
            ELSE '65+' END AS bucket, \
            COUNT(*) \
         FROM patients WHERE deleted_at IS NULL AND date_of_birth IS NOT NULL \
         GROUP BY bucket ORDER BY bucket",
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(bucket, count)| AgeBucket { bucket, count })
    .collect();

    // Records per month, last 6 months.
    let by_month: Vec<MonthlyCount> = sqlx::query_as::<_, (String, i64)>(
        "SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) \
         FROM medical_records \
         WHERE created_at >= NOW() - INTERVAL '6 months' \
         GROUP BY month ORDER BY month",
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(month, count)| MonthlyCount { month, count })
    .collect();

    let by_role: Vec<RoleCount> = sqlx::query_as::<_, (String, i64)>(
        "SELECT role, COUNT(*) FROM users WHERE deleted_at IS NULL GROUP BY role ORDER BY role",
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(role, count)| RoleCount { role, count })
    .collect();

    let top_problems: Vec<TopProblem> = sqlx::query_as::<_, (String, i64)>(
        "SELECT description, COUNT(*) FROM problems WHERE status = 'active' \
         GROUP BY description ORDER BY COUNT(*) DESC LIMIT 10",
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(description, count)| TopProblem { description, count })
    .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "totals": {
            "patients": patients_total,
            "records": records_total,
            "users": users_total,
            "open_orders": open_orders,
            "appointments_upcoming": appts_upcoming,
            "active_problems": active_problems,
        },
        "by_sex": by_sex,
        "by_age": by_age,
        "records_by_month": by_month,
        "users_by_role": by_role,
        "top_problems": top_problems,
    })))
}

pub fn reports_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(reports_summary);
}
