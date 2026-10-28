# Local toolchain for the API on machines without OpenSSL development files
# (e.g. Windows): `npm run api:docker -- cargo test`. CI and production build
# on Debian/Ubuntu directly. Matches the API's production base image.
FROM rust:1.99-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends cmake clang pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && rustup component add rustfmt clippy
WORKDIR /app
