# ── Build stage ──
FROM rust:1.82-slim-bookworm AS build
WORKDIR /app

# Copy everything and build
COPY backend/ .
RUN cargo build --release

# ── Runtime stage ──
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/ehr-backend /usr/local/bin/ehr-backend

EXPOSE 8080

CMD ["ehr-backend"]
