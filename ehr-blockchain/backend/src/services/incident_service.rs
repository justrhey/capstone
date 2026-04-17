use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Severity levels for security incidents.
#[derive(Debug, Clone, Copy)]
pub enum Severity {
    Low,
    Medium,
    High,
    #[allow(dead_code)]
    Critical,
}

impl Severity {
    fn as_str(self) -> &'static str {
        match self {
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct Incident {
    pub id: Uuid,
    pub kind: String,
    pub severity: String,
    pub user_id: Option<Uuid>,
    pub ip_address: Option<String>,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<Uuid>,
    pub resolution_note: Option<String>,
}

const NOTIFICATION_LOG: &str = "logs/notifications.log";

/// Append a line to `logs/notifications.log`. Best-effort — creates parent
/// directory if missing, swallows I/O errors.
fn write_notification(kind: &str, severity: Severity, details: &str) {
    let _ = std::fs::create_dir_all("logs");
    let line = format!(
        "{}\t{}\t{}\t{}\n",
        Utc::now().to_rfc3339(),
        severity.as_str(),
        kind,
        details.replace('\n', " "),
    );
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(NOTIFICATION_LOG) {
        let _ = f.write_all(line.as_bytes());
    }
}

/// Persist an incident and append a notification-draft line. Errors are logged
/// but not returned — incident recording must never abort the primary action.
pub async fn record_incident(
    pool: &PgPool,
    kind: &str,
    severity: Severity,
    user_id: Option<Uuid>,
    ip: Option<&str>,
    details: &str,
) {
    let res = sqlx::query(
        "INSERT INTO incidents (kind, severity, user_id, ip_address, details) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(kind)
    .bind(severity.as_str())
    .bind(user_id)
    .bind(ip)
    .bind(details)
    .execute(pool)
    .await;
    if let Err(e) = res {
        eprintln!("[incident] failed to persist {} {}: {}", severity.as_str(), kind, e);
        return;
    }
    write_notification(kind, severity, details);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule engine: in-memory counters. Single-process, mutex-guarded, sliding window.
// ─────────────────────────────────────────────────────────────────────────────

struct Counter {
    entries: Vec<Instant>,
}

struct RuleState {
    failed_logins_by_ip: HashMap<String, Counter>,
    reads_by_user: HashMap<Uuid, Counter>,
    last_ip_by_user: HashMap<Uuid, String>,
}

static STATE: LazyLock<Mutex<RuleState>> = LazyLock::new(|| {
    Mutex::new(RuleState {
        failed_logins_by_ip: HashMap::new(),
        reads_by_user: HashMap::new(),
        last_ip_by_user: HashMap::new(),
    })
});

fn prune_and_count(counter: &mut Counter, window: Duration) -> usize {
    let now = Instant::now();
    counter.entries.retain(|t| now.duration_since(*t) < window);
    counter.entries.len()
}

/// Rule: ≥5 failed logins from the same IP in 60 seconds.
pub async fn on_login_failure(pool: &PgPool, ip: Option<&str>) {
    let Some(ip) = ip else { return };
    let tripped = {
        let mut guard = match STATE.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let c = guard
            .failed_logins_by_ip
            .entry(ip.to_string())
            .or_insert(Counter { entries: Vec::new() });
        c.entries.push(Instant::now());
        prune_and_count(c, Duration::from_secs(60)) >= 5
    };
    if tripped {
        record_incident(
            pool,
            "failed_login_burst",
            Severity::High,
            None,
            Some(ip),
            &format!("≥5 failed logins from {} in 60s", ip),
        )
        .await;
    }
}

/// Rule: successful login from an IP that differs from this user's
/// previously-seen IP. Low severity (could be mobile roaming).
pub async fn on_login_success(pool: &PgPool, user_id: Uuid, ip: Option<&str>) {
    let Some(ip) = ip else { return };
    let previous = {
        let mut guard = match STATE.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let prev = guard.last_ip_by_user.get(&user_id).cloned();
        guard.last_ip_by_user.insert(user_id, ip.to_string());
        prev
    };
    if let Some(prev) = previous {
        if prev != ip {
            record_incident(
                pool,
                "unusual_ip_change",
                Severity::Low,
                Some(user_id),
                Some(ip),
                &format!("Login from {} (previous: {})", ip, prev),
            )
            .await;
        }
    }
}

/// Rule: ≥20 read/mutation events by the same user in 30 seconds.
pub async fn on_audit_write(pool: &PgPool, user_id: Uuid, ip: Option<&str>) {
    let tripped = {
        let mut guard = match STATE.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        let c = guard
            .reads_by_user
            .entry(user_id)
            .or_insert(Counter { entries: Vec::new() });
        c.entries.push(Instant::now());
        prune_and_count(c, Duration::from_secs(30)) >= 20
    };
    if tripped {
        record_incident(
            pool,
            "mass_read",
            Severity::Medium,
            Some(user_id),
            ip,
            &format!("≥20 audited actions by user {} in 30s", user_id),
        )
        .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prune_drops_entries_outside_window() {
        let mut c = Counter { entries: vec![Instant::now(), Instant::now()] };
        assert_eq!(prune_and_count(&mut c, Duration::from_secs(60)), 2);
    }

    #[test]
    fn prune_keeps_only_recent_entries() {
        let mut c = Counter {
            entries: vec![Instant::now() - Duration::from_secs(120), Instant::now()],
        };
        assert_eq!(prune_and_count(&mut c, Duration::from_secs(60)), 1);
    }

    #[test]
    fn severity_strings_match_check_constraint() {
        assert_eq!(Severity::Low.as_str(), "low");
        assert_eq!(Severity::Medium.as_str(), "medium");
        assert_eq!(Severity::High.as_str(), "high");
        assert_eq!(Severity::Critical.as_str(), "critical");
    }
}
