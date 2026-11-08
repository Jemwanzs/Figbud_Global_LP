// Serves the product-site renderer's production build against the e2e mock API,
// for Lighthouse (P4-14): the mock on 3199, the website on the given port.
// Prints the website's "Ready" line, which LHCI waits for, and stops both
// together.
//
//   node scripts/serve-sites-with-mock-api.mjs 3310
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.argv[2] ?? "3310";
const MOCK = 3199;
const root = fileURLToPath(new URL("..", import.meta.url));

const mock = spawn(process.execPath, ["apps/figbud-web/e2e/mock-api.mjs"], {
  cwd: root,
  env: { ...process.env, MOCK_API_PORT: String(MOCK) },
  stdio: "inherit",
});
for (let i = 0; i < 50; i++) {
  const up = await fetch(`http://localhost:${MOCK}/health`).then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  await new Promise((r) => setTimeout(r, 200));
}

const site = spawn("npx", ["next", "start", "--port", port], {
  cwd: `${root}/apps/sites-web`,
  env: { ...process.env, API_INTERNAL_URL: `http://localhost:${MOCK}` },
  stdio: "inherit",
  shell: true,
});

const stop = () => {
  site.kill();
  mock.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
site.on("exit", (code) => {
  mock.kill();
  process.exit(code ?? 0);
});
