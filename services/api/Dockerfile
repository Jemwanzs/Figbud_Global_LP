# syntax=docker/dockerfile:1.7
FROM rust:1.98-slim-bookworm AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends cmake clang pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && cargo build --release && rm -rf src
COPY src ./src
COPY migrations ./migrations
COPY seed ./seed
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 figbud
COPY --from=build /app/target/release/figbud-api /usr/local/bin/figbud-api
USER figbud
ENV APP_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["figbud-api"]
