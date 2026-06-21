//! Integration Tests for EHR Backend API
//! Run with: cargo test --test integration_tests

use actix_web::{test, web, App, http};
use ehr_backend::{handlers, services};
use serde_json::json;

// Helper to create test app
async fn test_app() -> impl actix_web::dev::Service<
    actix_web::dev::ServiceRequest,
    actix_web::dev::ServiceResponse,
    actix_web::Error,
> {
    test::init_service(
        App::new()
            .app_data(web::Data::new(services::test::test_pool().await))
            .route("/api/health", web::get().to(handlers::health_check))
            .route("/api/auth/login", web::post().to(handlers::auth_handler::login))
            .route("/api/auth/register", web::post().to(handlers::auth_handler::register))
            .route("/api/patients", web::get().to(handlers::patient_handler::list_patients))
    )
    .await
}

#[actix_web::test]
async fn test_health_endpoint() {
    let app = test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/api/health")
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::OK);
}

#[actix_web::test]
async fn test_login_success() {
    let app = test_app().await;
    
    let body = json!({
        "email": "admin@ehr.com",
        "password": "password123"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::OK);
    
    let body = test::read_body(resp).await;
    let response: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert!(response.get("token").is_some());
    assert!(response.get("user").is_some());
}

#[actix_web::test]
async fn test_login_invalid_credentials() {
    let app = test_app().await;
    
    let body = json!({
        "email": "admin@ehr.com",
        "password": "wrongpassword"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_login_missing_fields() {
    let app = test_app().await;
    
    let body = json!({
        "email": "admin@ehr.com"
        // missing password
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn test_register_success() {
    let app = test_app().await;
    
    let body = json!({
        "email": "newuser@example.com",
        "password": "SecurePass123!",
        "first_name": "John",
        "last_name": "Doe",
        "role": "patient"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/register")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::CREATED);
}

#[actix_web::test]
async fn test_register_duplicate_email() {
    let app = test_app().await;
    
    // First register
    let body = json!({
        "email": "duplicate@example.com",
        "password": "SecurePass123!",
        "first_name": "John",
        "last_name": "Doe",
        "role": "patient"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/register")
        .set_json(&body)
        .to_request();
    
    let _ = app.call(req).await.unwrap();
    
    // Try duplicate
    let body = json!({
        "email": "duplicate@example.com",
        "password": "AnotherPass123!",
        "first_name": "Jane",
        "last_name": "Doe",
        "role": "patient"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/register")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::CONFLICT);
}

#[actix_web::test]
async fn test_patients_list_unauthorized() {
    let app = test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/api/patients")
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    // Should return 401 Unauthorized
    assert_eq!(resp.status(), http::StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_patients_list_as_admin() {
    let app = test_app().await;
    
    // Login first to get token
    let body = json!({
        "email": "admin@ehr.com",
        "password": "password123"
    });
    
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(&body)
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    let body = test::read_body(resp).await;
    let response: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let token = response.get("token").unwrap().as_str().unwrap();
    
    // Now access patients with token
    let req = test::TestRequest::get()
        .uri("/api/patients")
        .insert_header(
            actix_web::http::header::Authorization,
            actix_web::http::header::HeaderValue::from_str(
                &format!("Bearer {}", token)
            ).unwrap()
        )
        .to_request();
    
    let resp = app.call(req).await.unwrap();
    
    assert_eq!(resp.status(), http::StatusCode::OK);
}

// Database Integration Tests
#[actix_web::test]
async fn test_database_connection() {
    let pool = services::test::test_pool().await;
    
    let result: Result<(i32,), sqlx::Error> = sqlx::query_as("SELECT 1")
        .fetch_one(&pool)
        .await;
    
    assert!(result.is_ok());
}

#[actix_web::test]
async fn test_user_crud_operations() {
    let pool = services::test::test_pool().await;
    
    // Create user
    let email = "test_crud@example.com";
    let password_hash = services::auth_service::hash_password("TestPass123!").unwrap();
    
    let result = sqlx::query(
        "INSERT INTO users (email, password_hash, role, first_name, last_name) 
         VALUES ($1, $2, 'patient', 'Test', 'User') 
         RETURNING id"
    )
    .bind(email)
    .bind(&password_hash)
    .fetch_one(&pool)
    .await;
    
    assert!(result.is_ok());
    
    // Read user
    let user: (String,) = sqlx::query_as("SELECT email FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(user.0, email);
    
    // Delete user
    sqlx::query("DELETE FROM users WHERE email = $1")
        .bind(email)
        .execute(&pool)
        .await
        .unwrap();
}