use actix_web::{web, App, HttpServer, get, HttpResponse, Responder};
use sqlx::PgPool;
use std::io;

mod config;
mod handlers;
mod middleware;
mod models;
mod services;

#[get("/health")]
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "ehr-backend",
        "version": "0.1.0"
    }))
}

#[actix_web::main]
async fn main() -> io::Result<()> {
    let cfg = config::Config::from_env().expect("Failed to load configuration");

    let pool = PgPool::connect(&cfg.database_url)
        .await
        .expect("Failed to connect to database");

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
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .service(health_check)
            .configure(handlers::auth_handler::auth_routes)
            .configure(handlers::patient_handler::patient_routes)
            .configure(handlers::record_handler::record_routes)
            .configure(handlers::verify_handler::verify_routes)
    })
    .bind((server_host, server_port))?
    .run()
    .await
}