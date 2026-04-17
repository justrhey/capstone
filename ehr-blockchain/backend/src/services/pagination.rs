use serde::Deserialize;

const DEFAULT_LIMIT: i64 = 100;
const MAX_LIMIT: i64 = 500;

#[derive(Debug, Deserialize)]
pub struct PageParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Copy)]
pub struct Page {
    pub limit: i64,
    pub offset: i64,
}

impl Page {
    pub fn from_params(p: &PageParams) -> Self {
        let limit = p
            .limit
            .unwrap_or(DEFAULT_LIMIT)
            .clamp(1, MAX_LIMIT);
        let offset = p.offset.unwrap_or(0).max(0);
        Self { limit, offset }
    }
}

impl Default for Page {
    fn default() -> Self {
        Self { limit: DEFAULT_LIMIT, offset: 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_empty() {
        let p = Page::from_params(&PageParams { limit: None, offset: None });
        assert_eq!(p.limit, 100);
        assert_eq!(p.offset, 0);
    }

    #[test]
    fn clamps_oversized_limit() {
        let p = Page::from_params(&PageParams { limit: Some(10_000), offset: None });
        assert_eq!(p.limit, 500);
    }

    #[test]
    fn clamps_zero_and_negative_limit_to_one() {
        assert_eq!(Page::from_params(&PageParams { limit: Some(0), offset: None }).limit, 1);
        assert_eq!(Page::from_params(&PageParams { limit: Some(-5), offset: None }).limit, 1);
    }

    #[test]
    fn negative_offset_floored_to_zero() {
        let p = Page::from_params(&PageParams { limit: None, offset: Some(-20) });
        assert_eq!(p.offset, 0);
    }

    #[test]
    fn normal_values_pass_through() {
        let p = Page::from_params(&PageParams { limit: Some(25), offset: Some(50) });
        assert_eq!(p.limit, 25);
        assert_eq!(p.offset, 50);
    }
}
