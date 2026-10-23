// Builds the websites while the e2e mock API is running, so prerendered pages
// include registry data (product statuses, published logos) exactly as a
// production build does against the real API. Used by CI before e2e tests.
//
//   node scripts/build-with-mock-api.mjs
import { spawn } from "node:child_process";

const PORT = 3199;
// A leftover mock would serve different data than this run's; refuse to guess.
const busy = await fetch(`http://localhost:${PORT}/health`).then(
  () => true,
  () => false,
);
if (busy) {
  console.error(`Port ${PORT} is already in use (a running mock API?). Stop it and retry.`);
  process.exit(1);
}
const mock = spawn(process.execPath, ["apps/figbud-web/e2e/mock-api.mjs"], {
  env: { ...process.env, MOCK_API_PORT: String(PORT) },
  stdio: "inherit",
});

async function ready() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("mock API did not start");
}

let code = 1;
try {
  await ready();
  code = await new Promise((resolve) => {
    const build = spawn("npm", ["run", "build"], {
      env: { ...process.env, API_INTERNAL_URL: `http://localhost:${PORT}` },
      stdio: "inherit",
      shell: true,
    });
    build.on("exit", (status) => resolve(status ?? 1));
  });
} finally {
  mock.kill();
}
process.exit(code);
