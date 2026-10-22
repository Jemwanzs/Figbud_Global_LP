#!/usr/bin/env node
/**
 * Renders docs/ROADMAP.md into a standalone, shareable HTML page
 * (.artifacts/roadmap.html). The Markdown file stays the single source of
 * truth; re-run `npm run roadmap:page` after every roadmap update.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "marked";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "docs/ROADMAP.md"), "utf8");
const outDir = path.join(root, ".artifacts");

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

const toc = [];
const renderer = new marked.Renderer();
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slug(text);
  if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, "") });
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};
renderer.table = function (token) {
  return `<div class="table-wrap">${marked.Renderer.prototype.table.call(this, token)}</div>`;
};

let html = marked.parse(source, { renderer, gfm: true });

// Status markers become labelled pills; meaning never relies on colour alone.
const pills = [
  ["✅", "done", "Completed"],
  ["🔄", "progress", "In progress"],
  ["⛔", "blocked", "Blocked"],
  ["⬜", "todo", "Not started"],
];
for (const [mark, cls, label] of pills) {
  // "✅ Completed" style cells keep their own words; bare marks get the label.
  html = html.replace(
    new RegExp(
      `${mark}(\\s+(?:Completed|In progress|Blocked|Not started|Complete|Available|Awaiting details|Awaiting configuration|Pending verification|Pending|Needs you|Ready for review|Provided|Preparation stage|Configured, deploy pending|Queued|Provisioned|Live|Production))?`,
      "g",
    ),
    (_, words) => `<span class="pill pill-${cls}">${words ? words.trim() : label}</span>`,
  );
}

// The first blockquote is the document's standfirst.
html = html.replace("<blockquote>", '<blockquote class="standfirst">');

const updated = /\*\*Last updated:\*\*\s*([^\n]+)/.exec(source)?.[1]?.trim() ?? "";

const page = `<title>FigBud Global Roadmap</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: sticky contents rail beside one reading column; tables scroll inside their own frame. */
:root {
  --ink: #15120f; --espresso: #39261d; --copper: #9a5a2e; --amber: #f0a65d; --cream: #f6e9d8;
  --bg: #fbf7f1; --surface: #ffffff; --surface-2: #f4ebdf; --line: rgb(57 38 29 / .12);
  --fg: #15120f; --muted: #5c4a3d; --subtle: #7a6556; --accent: #9a5a2e;
  --done-bg: #e3f4ea; --done-fg: #17603f; --prog-bg: #fbecd9; --prog-fg: #8a4b17;
  --block-bg: #fbe3e1; --block-fg: #9b2a20; --todo-bg: #eee8e1; --todo-fg: #5c4a3d;
  --display: "Outfit", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --body: "Outfit", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "Cascadia Code", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #120f0d; --surface: #1c1714; --surface-2: #241e19; --line: rgb(246 233 216 / .1);
  --fg: #f6ece0; --muted: #c2b2a1; --subtle: #9c8b7a; --accent: #f0a65d;
  --done-bg: rgb(95 211 161 / .14); --done-fg: #7fe0b6; --prog-bg: rgb(240 166 93 / .16); --prog-fg: #f6bd82;
  --block-bg: rgb(242 139 130 / .16); --block-fg: #f5a59e; --todo-bg: rgb(246 233 216 / .08); --todo-fg: #c2b2a1;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #120f0d; --surface: #1c1714; --surface-2: #241e19; --line: rgb(246 233 216 / .1);
  --fg: #f6ece0; --muted: #c2b2a1; --subtle: #9c8b7a; --accent: #f0a65d;
  --done-bg: rgb(95 211 161 / .14); --done-fg: #7fe0b6; --prog-bg: rgb(240 166 93 / .16); --prog-fg: #f6bd82;
  --block-bg: rgb(242 139 130 / .16); --block-fg: #f5a59e; --todo-bg: rgb(246 233 216 / .08); --todo-fg: #c2b2a1;
  color-scheme: dark; }

* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font: 400 16px/1.65 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.shell { max-width: 84rem; margin: 0 auto; padding-block: 48px 96px; display: grid; gap: 56px; }
@media (min-width: 1100px) { .shell { grid-template-columns: 15rem minmax(0, 1fr); } }

.mark { display: flex; align-items: center; gap: 10px; font: 600 15px var(--display); color: var(--fg); }
.mark i { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, #f6bd82, #f0a65d 55%, #a66538); display: inline-block; }
.mark span { color: var(--subtle); font-weight: 400; }

nav.toc { position: relative; }
@media (min-width: 1100px) { nav.toc > div { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 32px); } }
nav.toc ol { list-style: none; margin: 24px 0 0; padding: 0; display: grid; gap: 2px; }
nav.toc a { display: block; padding: 7px 10px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 14px; line-height: 1.35; }
nav.toc a:hover { background: var(--surface-2); color: var(--fg); }
nav.toc a:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.updated { margin-top: 20px; font: 12px var(--mono); color: var(--subtle); }
@media (max-width: 1099px) { nav.toc ol { grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); } }

main { min-width: 0; }
main > h1 { font: 600 clamp(2rem, 1.4rem + 2.4vw, 3.1rem)/1.08 var(--display); letter-spacing: -.03em; margin: 0 0 20px; text-wrap: balance; }
h2 { font: 600 clamp(1.45rem, 1.2rem + .9vw, 1.9rem)/1.2 var(--display); letter-spacing: -.02em; margin: 72px 0 16px; padding-top: 24px; border-top: 1px solid var(--line); text-wrap: balance; scroll-margin-top: 24px; }
h3 { font: 600 1.15rem/1.3 var(--display); margin: 40px 0 10px; color: var(--fg); scroll-margin-top: 24px; }
p, li { max-width: 68ch; }
p { margin: 0 0 14px; color: var(--muted); }
strong { color: var(--fg); font-weight: 600; }
a { color: var(--accent); text-underline-offset: 3px; }
code { font: 0.86em var(--mono); background: var(--surface-2); padding: 1px 6px; border-radius: 6px; color: var(--fg); }
ul { padding-left: 1.2em; color: var(--muted); }
li { margin: 6px 0; }
hr { border: 0; height: 1px; background: var(--line); margin: 40px 0; }
blockquote.standfirst { margin: 0 0 8px; padding: 20px 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
blockquote.standfirst p { margin: 0 0 8px; } blockquote.standfirst p:last-child { margin: 0; font-size: 14px; }

.table-wrap { overflow-x: auto; margin: 16px 0 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th { text-align: left; font: 500 12px var(--body); letter-spacing: .06em; text-transform: uppercase; color: var(--subtle); background: var(--surface-2); padding: 10px 14px; white-space: nowrap; }
td { padding: 11px 14px; border-top: 1px solid var(--line); vertical-align: top; color: var(--fg); }
td:first-child { font-family: var(--mono); font-size: 12.5px; color: var(--subtle); white-space: nowrap; }
td p, td li { max-width: none; }
tr:has(td strong:only-child) td { background: var(--surface-2); }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font: 500 12px/1.6 var(--body); white-space: nowrap; }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill-done { background: var(--done-bg); color: var(--done-fg); }
.pill-progress { background: var(--prog-bg); color: var(--prog-fg); }
.pill-blocked { background: var(--block-bg); color: var(--block-fg); }
.pill-todo { background: var(--todo-bg); color: var(--todo-fg); }
h2 .pill, h3 .pill { font-size: 12px; vertical-align: middle; margin-left: 8px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>

<div class="shell">
  <nav class="toc" aria-label="Contents">
    <div>
      <div class="mark"><i aria-hidden="true"></i>FigBud <span>Global</span></div>
      <ol>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join("")}</ol>
      <p class="updated">Updated ${updated}<br>Source: docs/ROADMAP.md</p>
    </div>
  </nav>
  <main>
${html}
  </main>
</div>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "roadmap.html"), page);
console.log(`Wrote .artifacts/roadmap.html (${toc.length} sections)`);
