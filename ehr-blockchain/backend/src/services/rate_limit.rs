use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// Simple per-IP sliding window rate limiter.
/// Not cluster-aware. Good enough for a single-process deployment / capstone demo.
pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    state: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            max_requests,
            window: Duration::from_secs(window_secs),
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Returns `true` if the request is allowed; `false` if the caller exceeded the window.
    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut guard = match self.state.lock() {
            Ok(g) => g,
            Err(_) => return true, // fail open if a poisoned mutex — rate limiting is not a security gate
        };
        let entry = guard.entry(key.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t) < self.window);
        if entry.len() >= self.max_requests {
            return false;
        }
        entry.push(now);
        true
    }
}

/// Global login limiter: 10 attempts per IP per 60 seconds.
pub static LOGIN_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| RateLimiter::new(10, 60));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_limit_then_blocks() {
        let rl = RateLimiter::new(3, 60);
        assert!(rl.check("1.2.3.4"));
        assert!(rl.check("1.2.3.4"));
        assert!(rl.check("1.2.3.4"));
        assert!(!rl.check("1.2.3.4"), "4th call should be denied");
    }

    #[test]
    fn separate_keys_have_independent_budgets() {
        let rl = RateLimiter::new(1, 60);
        assert!(rl.check("a"));
        assert!(!rl.check("a"));
        assert!(rl.check("b"));
    }

    #[test]
    fn window_expiry_frees_budget() {
        let rl = RateLimiter::new(1, 0); // zero-length window → always stale
        assert!(rl.check("a"));
        assert!(rl.check("a"), "stale entries should be pruned");
    }
}
