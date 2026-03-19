import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { atomicWriteFileSync } from "./atomic-write.js";
import { ConfigError, resolveConfig } from "./config.js";

function deriveOutputPaths(mdPath: string) {
  return {
    json: mdPath.replace(/\.md$/, ".json"),
    history: mdPath.replace(/\.md$/, "_HISTORY.json"),
    html: mdPath.replace(/\.md$/, ".html"),
    context: mdPath.replace(/\.md$/, ".context"),
  };
}

import { appendHistory, computeDiff, loadHistory, loadPreviousRules } from "./diff.js";
import { generateContext } from "./output/context.js";
import { generateHTML } from "./output/html.js";
import { generateJSON } from "./output/json.js";
import { generateMarkdown } from "./output/markdown.js";
import { extractRules } from "./parser.js";
import { checkProtection } from "./protect.js";
import { capitalize } from "./tree.js";
import type { HistoryEntry, Rule, RuleDiff, RuledocConfig, RuleWarning } from "./types.js";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const k = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const forceColor = process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0";
const noColor = (!!process.env.NO_COLOR || !process.stdout.isTTY) && !forceColor;
const c = noColor ? (Object.fromEntries(Object.keys(k).map((key) => [key, ""])) as typeof k) : k;

// ---------------------------------------------------------------------------
// Logger (respects quiet/verbose)
// ---------------------------------------------------------------------------

function createLogger(quiet: boolean) {
  return {
    log: quiet ? () => {} : console.log.bind(console),
    error: console.error.bind(console), // errors always show
  };
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const LOGO = `
${c.dim}┌─┐┬ ┬┬  ┌─┐┌┬┐┌─┐┌─┐
├┬┘│ ││  ├┤  │││ ││
┴└─└─┘┴─┘└─┘─┴┘└─┘└─┘${c.reset}`;

const HELP = `${LOGO}

${c.bold}ruledoc${c.reset} — Extract @rule() annotations into living documentation.

${c.bold}Usage:${c.reset}
  ruledoc [options]
  ruledoc [src] [output]

${c.bold}Options:${c.reset}
  -s, --src <dir>           Source directory (default: ./src)
  -o, --output <file>       Output file (default: ./BUSINESS_RULES.md)
  -f, --format <formats>    md,json,html,context (default: md,json)
  -e, --extensions <exts>   .ts,.vue,.py (default: .ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte)
      --ignore <dirs>       Directories to skip
      --extra-ignore <globs>  Additional glob patterns to exclude (comma-separated)
      --no-ignore-tests     Include test files (*.test.*, *.spec.*, __tests__)
      --no-gitignore        Don't respect .gitignore patterns
  -t, --tag <name>          Annotation tag (default: rule → @rule(...))
      --severities <list>   Severity levels, first is default (default: info,warning,critical)
  -p, --pattern <regex>     Custom regex (overrides --tag)
  -c, --check               CI mode: exit 1 if docs are stale
      --protect <severities>  Block removal of rules at these severity levels (comma-separated)
      --allow-removal       Bypass all protection checks
  -q, --quiet               Suppress all output except errors
      --no-history          Don't track removed rules in history file
      --verbose             List every rule found
      --init                Setup guide and example config
  -h, --help                Show this help
  -v, --version             Show version

${c.bold}Annotation format:${c.reset}
  // @rule(scope): Description
  // @rule(scope.sub): With subscope
  // @rule(scope.sub, critical): With severity
  // @rule(scope.sub, critical, TICKET-123): With ticket
  // @rule(scope.sub, TICKET-123, critical): Order doesn't matter
  // @rule(scope.sub, TICKET-123): Severity defaults to first in --severities

${c.bold}Config:${c.reset}
  Reads from: ruledoc.config.json → package.json "ruledoc" → CLI flags
`;

declare const __RULEDOC_VERSION__: string;
const VERSION = typeof __RULEDOC_VERSION__ !== "undefined" ? __RULEDOC_VERSION__ : "0.0.0-dev";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function runInit() {
  console.log(`\n${c.cyan}ruledoc init${c.reset}\n`);
  console.log(`Add annotations like these to your source files:\n`);
  console.log(
    c.dim +
      [
        "  // @rule(billing.plans, critical): Free plan limited to 50 items",
        "  // @rule(auth.session): Session expires after 24h",
        "  // @rule(auth.password, warning, AUTH-42): Min 8 chars",
        "  // @rule(billing.trial, FLEW-102): Trial lasts 14 days",
      ].join("\n") +
      c.reset,
  );
  console.log(`\nThen run ${c.bold}ruledoc${c.reset} to generate documentation.\n`);

  if (!existsSync("ruledoc.config.json")) {
    const initConfig = {
      src: "./src",
      output: "./BUSINESS_RULES.md",
      formats: ["md", "json"],
      // extraIgnore: ["**/generated/**"],
      // ignoreTests: true,
      // gitignore: true,
    };
    writeFileSync("ruledoc.config.json", `${JSON.stringify(initConfig, null, 2)}\n`);
    console.log(`${c.green}✓${c.reset} Created ruledoc.config.json`);
  }

  console.log(
    `${c.green}✓${c.reset} Add ${c.bold}BUSINESS_RULES.md${c.reset} and ${c.bold}BUSINESS_RULES.json${c.reset} to your .gitignore\n`,
  );
}

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function sevIcon(sev: string): string {
  switch (sev) {
    case "critical":
      return c.red;
    case "warning":
      return c.yellow;
    default:
      return c.blue;
  }
}

function printDiff(log: ReturnType<typeof createLogger>, diff: RuleDiff) {
  for (const r of diff.added) {
    log.log(
      `  ${c.green}+${c.reset} ${r.description} ${sevIcon(r.severity)}[${r.severity}]${c.reset} ${c.dim}${r.fullScope} → ${r.file}:${r.line}${c.reset}`,
    );
  }
  for (const r of diff.removed) {
    log.log(`  ${c.red}-${c.reset} ${r.description} ${c.dim}${r.fullScope} → ${r.file}:${r.line}${c.reset}`);
  }
}

function printWarnings(log: ReturnType<typeof createLogger>, warnings: RuleWarning[]) {
  if (warnings.length === 0) return;
  log.log("");
  for (const w of warnings) {
    log.log(`  ${c.yellow}⚠${c.reset} ${c.dim}${w.file}:${w.line}${c.reset} — ${w.message}`);
  }
}

function printVerbose(log: ReturnType<typeof createLogger>, rules: Rule[]) {
  if (rules.length === 0) return;

  log.log("");

  // Group by scope
  const grouped = new Map<string, Rule[]>();
  for (const r of rules) {
    const list = grouped.get(r.scope) || [];
    list.push(r);
    grouped.set(r.scope, list);
  }

  for (const [scope, scopeRules] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    log.log(`  ${c.bold}${capitalize(scope)}${c.reset} ${c.dim}(${scopeRules.length})${c.reset}`);

    for (const r of scopeRules) {
      const sev = sevIcon(r.severity);
      const sevTag = r.severity !== "info" ? `${sev}[${r.severity}]${c.reset} ` : "";
      const tkt = r.ticket ? ` ${c.dim}${r.ticket}${c.reset}` : "";
      log.log(`    ${sev}●${c.reset} ${sevTag}${r.description}${tkt} ${c.dim}→ ${r.file}:${r.line}${c.reset}`);
    }
  }
  log.log("");
}

// ---------------------------------------------------------------------------
// Signal handlers
// ---------------------------------------------------------------------------

/* v8 ignore next 4 */
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    process.exit(128 + (sig === "SIGINT" ? 2 : 15));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Handle flags that don't need config
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.includes("-v") || args.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }
  if (args.includes("--init")) {
    runInit();
    process.exit(0);
  }

  // Resolve and validate config
  let config: RuledocConfig;
  const configWarnings: string[] = [];
  try {
    config = resolveConfig(args, process.cwd(), configWarnings);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${c.red}✗ ${err.message}${c.reset}\n`);
      process.exit(1);
    }
    /* v8 ignore next */
    throw new Error(`Unexpected error during config resolution: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }

  const log = createLogger(config.quiet);

  for (const w of configWarnings) {
    /* v8 ignore next */
    log.log(`${c.yellow}${w}${c.reset}`);
  }

  if (!existsSync(config.src)) {
    log.error(`${c.red}✗ Source directory "${config.src}" not found${c.reset}`);
    process.exit(1);
  }

  // Extract
  const { rules, warnings, removals } = extractRules(config, process.cwd());

  // Stats
  const scopes = new Set(rules.map((r) => r.scope));
  const critical = rules.filter((r) => r.severity === "critical").length;
  const warning = rules.filter((r) => r.severity === "warning").length;

  log.log(
    `${c.cyan}◆ ruledoc${c.reset} ${c.bold}${rules.length}${c.reset} rules · ` +
      `${scopes.size} scopes` +
      `${critical ? ` · ${c.red}${critical} critical${c.reset}` : ""}` +
      `${warning ? ` · ${c.yellow}${warning} warning${c.reset}` : ""}`,
  );

  // Verbose: list all rules and show ignore sources
  if (config.verbose) {
    const gitignoreStatus = config.gitignore ? "✓" : "✗";
    const testStatus = config.ignoreTests ? "✓" : "✗";
    const extraCount = config.extraIgnore.length;
    const extraPart = extraCount > 0 ? ` · ${extraCount} extra pattern${extraCount > 1 ? "s" : ""}` : "";
    log.log(
      `${c.cyan}◆ ruledoc:${c.reset} ignore sources: .gitignore ${gitignoreStatus} · test files ${testStatus}${extraPart}`,
    );
    printVerbose(log, rules);
  }

  // Diff
  const paths = deriveOutputPaths(config.output);
  const prev = loadPreviousRules(paths.json);
  const diff = computeDiff(prev, rules);
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0;

  if (prev.length > 0 && hasChanges) {
    printDiff(log, diff);
  }

  // History (tombstones for removed rules)
  let history: HistoryEntry[] = [];

  if (config.history) {
    if (diff.removed.length > 0) {
      history = appendHistory(paths.history, diff.removed, removals);
    } else {
      history = loadHistory(paths.history);
    }
  }

  // Protection check
  if (config.protect.length > 0 && !config.allowRemoval && diff.removed.length > 0) {
    const protection = checkProtection(diff.removed, removals, config.protect);

    for (const r of protection.acknowledged) {
      log.log(`  ${c.green}✓${c.reset} [${r.severity}] ${r.fullScope}: acknowledged via @${config.tag}-removed`);
    }

    if (protection.blocked.length > 0) {
      for (const r of protection.blocked) {
        log.error(`  ${c.red}✗${c.reset} [${r.severity}] ${r.fullScope}: ${r.description}`);
        log.error(`    was in ${r.file}`);
      }

      if (config.check) {
        log.error(
          `\n${c.red}✗ ruledoc: ${protection.blocked.length} critical rule(s) removed — build blocked${c.reset}`,
        );
        log.error(`  To allow removal, use --allow-removal or add a @${config.tag}-removed() comment.`);
        process.exit(2);
      } else {
        log.log(
          `\n${c.yellow}⚠ ruledoc: ${protection.blocked.length} protected rule(s) removed (use --check to enforce)${c.reset}`,
        );
      }
    }
  }

  // Warnings
  printWarnings(log, warnings);

  // Check mode (CI)
  if (config.check) {
    if (existsSync(config.output)) {
      const existing = readFileSync(config.output, "utf-8");
      const fresh = generateMarkdown(rules, warnings, history);
      if (existing !== fresh) {
        log.error(`\n${c.red}✗ BUSINESS_RULES.md is stale. Run ruledoc to regenerate.${c.reset}`);
        process.exit(1);
      }
    }
    log.log(`\n${c.green}✓ Docs are up to date${c.reset}`);
    process.exit(0);
  }

  // Generate outputs
  const outputs: string[] = [];

  if (config.formats.includes("md")) {
    atomicWriteFileSync(config.output, generateMarkdown(rules, warnings, history));
    outputs.push(config.output);
  }

  if (config.formats.includes("json")) {
    atomicWriteFileSync(paths.json, generateJSON(rules, warnings));
    outputs.push(paths.json);
  }

  if (config.formats.includes("html")) {
    atomicWriteFileSync(paths.html, generateHTML(rules, warnings));
    outputs.push(paths.html);
  }

  if (config.formats.includes("context")) {
    atomicWriteFileSync(paths.context, generateContext(rules, config));
    outputs.push(paths.context);
  }

  for (const o of outputs) {
    log.log(`${c.dim}  → ${o}${c.reset}`);
  }
}

await main();
