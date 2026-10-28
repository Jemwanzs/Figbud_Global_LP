// Median Lighthouse category scores per page, printed as GitHub notices on the
// run page. Reads the per-run reports LHCI's collect step always writes
// (`.lighthouseci/lhr-*.json`); its manifest only exists for filesystem uploads.
//
//   node scripts/lighthouse-summary.mjs apps/figbud-web/.lighthouseci
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? ".lighthouseci";
const reports = (existsSync(dir) ? readdirSync(dir) : [])
  .filter((name) => /^lhr-.*\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")));
if (reports.length === 0) {
  console.log("::warning title=Lighthouse::No reports found; the collect step did not run.");
  process.exit(0);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const byPage = Map.groupBy(reports, (lhr) => new URL(lhr.requestedUrl).pathname);
for (const [page, runs] of byPage) {
  const categories = Object.keys(runs[0].categories);
  const scores = categories.map((key) => {
    const value = median(runs.map((lhr) => lhr.categories[key]?.score ?? 0));
    return `${runs[0].categories[key].title} ${Math.round(value * 100)}`;
  });
  console.log(`::notice title=Lighthouse ${page}::${scores.join(" · ")} (median of ${runs.length})`);
}
