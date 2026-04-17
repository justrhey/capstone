
use actix_web::{web, App, HttpServer, get, HttpResponse, Responder};
use actix_cors::Cors;
use sqlx::PgPool;
use std::io;

mod config;
mod handlers;
mod middleware;
mod models;
mod services;

#[get("/")]
async fn root() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "message": "EHR Blockchain System API",
        "version": "0.1.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "auth": "/api/auth",
            "patients": "/api/patients",
            "records": "/api/records"
        }
    }))
}

#[get("/health")]
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "ehr-backend",
        "version": "0.1.0",
        "database": "connected"
    }))
}

#[actix_web::main]
async fn main() -> io::Result<()> {
    let cfg = config::Config::from_env().expect("Failed to load configuration");

    let pool_result = PgPool::connect(&cfg.database_url).await;

    match pool_result {
        Ok(pool) => {
            println!("Database connected successfully");

            if let Err(e) = sqlx::migrate!("../migrations").run(&pool).await {
                eprintln!("⚠️  Migration run skipped / failed: {}. \
                           If tables already exist from manual psql runs, \
                           that's expected. Otherwise investigate.", e);
            } else {
                println!("Migrations applied successfully");
            }

            // One-shot: encrypt any legacy plaintext rows. Idempotent.
            services::encryption::backfill_encrypt_on_startup(&pool, &cfg.encryption_key).await;

            println!("Migrations applied successfully");

            let server_host = cfg.server_host.clone();
            let server_port = cfg.server_port;
            let config_data = web::Data::new(cfg);
            println!("Starting server at http://{}:{}", server_host, server_port);

            HttpServer::new(move || {
                let cors = Cors::default()
                    .allowed_origin_fn(|origin, _req_head| {
                        origin.as_bytes().starts_with(b"http://localhost:")
                            || origin.as_bytes().starts_with(b"http://127.0.0.1:")
                    })
                    .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
                    .allowed_headers(vec!["Authorization", "Content-Type"])
                    .supports_credentials()
                    .max_age(3600);

                App::new()
                    .wrap(middleware::jwt::JwtMiddleware)
                    .wrap(cors)
                    .app_data(web::Data::new(pool.clone()))
                    .app_data(config_data.clone())
                    .service(root)
                    .service(health_check)
                    .configure(handlers::auth_handler::auth_routes)
                    .configure(handlers::patient_handler::patient_routes)
                    .configure(handlers::record_handler::record_routes)
                    .configure(handlers::verify_handler::verify_routes)
                    .configure(handlers::user_handler::user_routes)
                    .configure(handlers::audit_handler::audit_routes)
                    .configure(handlers::permission_handler::permission_routes)
                    .configure(handlers::export_handler::export_routes)
                    .configure(handlers::incident_handler::incident_routes)
                    .configure(handlers::erasure_handler::erasure_routes)
                    .configure(handlers::assignment_handler::assignment_routes)
                    .configure(handlers::problem_handler::problem_routes)
                    .configure(handlers::order_handler::order_routes)
                    .configure(handlers::appointment_handler::appointment_routes)
            })
            .bind((server_host, server_port))?
            .run()
            .await
        }
        Err(_) => {
            println!("⚠️  Database not available - running in demo mode (auth endpoints disabled)");
            let server_host = cfg.server_host.clone();
            let server_port = cfg.server_port;
            let config_data = web::Data::new(cfg);
            println!("Starting server at http://{}:{}", server_host, server_port);

            HttpServer::new(move || {
                let cors = Cors::default()
                    .allowed_origin_fn(|origin, _req_head| {
                        origin.as_bytes().starts_with(b"http://localhost:")
                            || origin.as_bytes().starts_with(b"http://127.0.0.1:")
                    })
                    .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
                    .allowed_headers(vec!["Authorization", "Content-Type"])
                    .supports_credentials()
                    .max_age(3600);

                App::new()
                    .wrap(cors)
                    .app_data(config_data.clone())
                    .service(root)
                    .service(health_check)
                    .configure(handlers::auth_handler::auth_routes)
            })
            .bind((server_host, server_port))?
            .run()
            .await
        }
    }
}
