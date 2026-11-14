// Builds the websites while the e2e mock API is running, so prerendered pages
// include registry data (product statuses, published logos) exactly as a
// production build does against the real API. Used by CI before e2e tests.
//
//   node scripts/build-with-mock-api.mjs            (every website)
//   node scripts/build-with-mock-api.mjs sites-web  (one workspace, e.g. for Lighthouse)
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
// The e2e servers (playwright.config.ts) are reused when already running. One
// left over from an earlier build serves old HTML against this build's
// scripts, which shows up as hydration errors; refuse to build under it.
for (const [app, port] of [
  ["figbud-web", 3100],
  ["zirahr-web", 3110],
  ["sites-web", 3210],
]) {
  const stale = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );
  if (stale) {
    console.error(`An e2e server for ${app} is still running on port ${port}. Stop it and retry.`);
    process.exit(1);
  }
}
// Each website is built against the mock data its own e2e tests use: the
// renderer's tests switch Arabic on for Ziwa LMS (MOCK_TRANSLATED_ZIWA, P7-L2b),
// which the corporate site's tests must not see.
const FIXTURES = { "sites-web": { MOCK_TRANSLATED_ZIWA: "1" } };

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

async function stopped() {
  for (let i = 0; i < 50; i++) {
    const up = await fetch(`http://localhost:${PORT}/health`).then(
      () => true,
      () => false,
    );
    if (!up) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("mock API did not stop");
}

async function build(workspace) {
  const mock = spawn(process.execPath, ["apps/figbud-web/e2e/mock-api.mjs"], {
    env: { ...process.env, MOCK_API_PORT: String(PORT), ...FIXTURES[workspace] },
    stdio: "inherit",
  });
  try {
    await ready();
    return await new Promise((resolve) => {
      const run = spawn("npm", ["run", "build", "-w", workspace], {
        env: { ...process.env, API_INTERNAL_URL: `http://localhost:${PORT}` },
        stdio: "inherit",
        shell: true,
      });
      run.on("exit", (status) => resolve(status ?? 1));
    });
  } finally {
    mock.kill();
    await stopped();
  }
}

const only = process.argv[2];
let code = 0;
for (const workspace of only ? [only] : ["figbud-web", "zirahr-web", "sites-web"]) {
  code = await build(workspace);
  if (code !== 0) break;
}
process.exit(code);
