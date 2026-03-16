import { readFileSync, appendFileSync } from "node:fs";
import { computeDiff } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Read inputs
// ---------------------------------------------------------------------------

function loadRules(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8")).rules || [];
  } catch {
    return [];
  }
}

const jsonPath = process.env.JSON_PATH || "BUSINESS_RULES.json";
const prevPath = process.env.PREV_JSON_PATH || "/tmp/ruledoc-prev.json";
const prev = loadRules(prevPath);
const next = loadRules(jsonPath);
const { added, removed } = computeDiff(prev, next);

const outputFile = process.env.GITHUB_OUTPUT;

if (added.length === 0 && removed.length === 0) {
  appendFileSync(outputFile, "has_changes=false\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Format comment
// ---------------------------------------------------------------------------

const lines = ["## Business Rules Changed\n"];

if (added.length > 0) {
  lines.push(`**Added (${added.length})**`);
  for (const r of added) {
    lines.push(`- [${r.severity}] \`${r.fullScope}\`: ${r.description} — \`${r.file}:${r.line}\``);
  }
  lines.push("");
}

if (removed.length > 0) {
  lines.push(`**Removed (${removed.length})**`);
  for (const r of removed) {
    lines.push(`- ~~[${r.severity}] \`${r.fullScope}\`: ${r.description}~~ — was in \`${r.file}:${r.line}\``);
  }
  lines.push("");
}

// Summary line from current state
const totalRules = next.length;
const scopes = new Set(next.map((r) => r.scope)).size;
const bySeverity = {};
for (const r of next) {
  bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
}
const severityParts = Object.entries(bySeverity)
  .map(([s, n]) => `${n} ${s}`)
  .join(" · ");

lines.push(`> ${totalRules} rules · ${scopes} scopes · ${severityParts}`);

let body = lines.join("\n");

// Truncate if too large (GitHub comment limit is 65536)
const MAX_LEN = 60000;
if (body.length > MAX_LEN) {
  body = body.slice(0, MAX_LEN) + "\n\n...(truncated)";
}

// ---------------------------------------------------------------------------
// Write outputs using multiline delimiter
// ---------------------------------------------------------------------------

const delimiter = `RULEDOC_EOF_${Date.now()}`;
appendFileSync(outputFile, "has_changes=true\n");
appendFileSync(outputFile, `comment_body<<${delimiter}\n${body}\n${delimiter}\n`);
