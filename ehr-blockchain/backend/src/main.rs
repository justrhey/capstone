
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

            sqlx::migrate!("./migrations")
                .run(&pool)
                .await
                .expect("Failed to run migrations");

            println!("Migrations applied successfully");

            let server_host = cfg.server_host.clone();
            let server_port = cfg.server_port;
            println!("Starting server at http://{}:{}", server_host, server_port);

            HttpServer::new(move || {
                let cors = Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600);

                App::new()
                    .wrap(cors)
                    .app_data(web::Data::new(pool.clone()))
                    .service(root)
                    .service(health_check)
                    .configure(handlers::auth_handler::auth_routes)
                    .configure(handlers::patient_handler::patient_routes)
                    .configure(handlers::record_handler::record_routes)
                    .configure(handlers::verify_handler::verify_routes)
                    .configure(handlers::user_handler::user_routes)
            })
            .bind((server_host, server_port))?
            .run()
            .await
        }
        Err(_) => {
            println!("⚠️  Database not available - running in demo mode (auth endpoints disabled)");
            let server_host = cfg.server_host.clone();
            let server_port = cfg.server_port;
            println!("Starting server at http://{}:{}", server_host, server_port);

            HttpServer::new(move || {
                let cors = Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600);

                App::new()
                    .wrap(cors)
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
