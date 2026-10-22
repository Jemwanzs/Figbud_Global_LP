#!/usr/bin/env node
/**
 * Runs a command for services/api inside the figbud-rust-dev image (OpenSSL
 * and the Rust toolchain included), for machines that cannot build the API
 * natively, such as Windows without OpenSSL development files.
 *
 *   npm run api:docker -- cargo test
 *   npm run api:docker -- cargo clippy --all-targets -- -D warnings
 *
 * Build caches persist in Docker volumes; the test database is the Docker
 * Compose Postgres (`npm run db:up`).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const image = "figbud-rust-dev";
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: npm run api:docker -- <command> [args...]");
  process.exit(2);
}

const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { stdio: "inherit" }).status ?? 1;

if (spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" }).status !== 0) {
  const status = run("docker", ["build", "-t", image, path.join(root, "infra/rust-dev")]);
  if (status !== 0) process.exit(status);
}

process.exit(
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${path.join(root, "services/api")}:/app`,
    "-v",
    "figbud-cargo-registry:/usr/local/cargo/registry",
    "-v",
    "figbud-api-target:/app/target",
    "-e",
    "TEST_DATABASE_URL=postgres://figbud:figbud_local_dev@host.docker.internal:5433/figbud_test",
    "--add-host",
    "host.docker.internal:host-gateway",
    image,
    ...args,
  ]),
);
