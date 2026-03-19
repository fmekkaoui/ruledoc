import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadGitignore } from "./gitignore.js";
import { globToRegex, matchesAnyGlob } from "./glob.js";
import type { Rule, RuledocConfig, RuleRemoval, RuleWarning } from "./types.js";
import { buildPattern, RULEDOC_DEFAULT_IGNORE, VALID_STATUSES } from "./types.js";
import { walkFiles } from "./walker.js";

// Pre-compiled regexes for default test file patterns (avoids re-compilation per call)
const RULEDOC_DEFAULT_REGEXES = RULEDOC_DEFAULT_IGNORE.map(globToRegex);

// Recognized continuation-line meta keys
const META_KEYS = new Set([
  "title", "rationale", "owner", "status", "since",
  "tags", "links", "supersededBy", "dependsOn", "conflictsWith",
  "examples", "testCases",
]);

// Keys whose values are CSV-split into arrays
const ARRAY_META_KEYS = new Set(["tags", "links", "dependsOn", "conflictsWith", "testCases"]);

// Keys that accumulate across multiple lines
const MULTI_LINE_META_KEYS = new Set(["examples"]);

// Regex to match a continuation meta line after stripping the comment prefix
const META_LINE_RE = /^@(\w+)\s*:\s*(.+)$/;

/**
 * Strip the leading comment prefix from a line.
 * Returns the trimmed content after the prefix, or null if the line is not a comment.
 */
function stripCommentPrefix(line: string): string | null {
  const trimmed = line.trim();
  // // comment
  if (trimmed.startsWith("//")) return trimmed.slice(2).trim();
  // * continuation inside block comment (/** ... */)
  if (trimmed.startsWith("*") && !trimmed.startsWith("*/")) return trimmed.slice(1).trim();
  // # comment
  if (trimmed.startsWith("#")) return trimmed.slice(1).trim();
  return null;
}

interface MetaFields {
  title: string;
  rationale: string;
  owner: string;
  status: string;
  since: string;
  tags: string[];
  links: string[];
  supersededBy: string;
  dependsOn: string[];
  conflictsWith: string[];
  examples: string[];
  testCases: string[];
}

function emptyMeta(): MetaFields {
  return {
    title: "", rationale: "", owner: "", status: "", since: "",
    tags: [], links: [], supersededBy: "",
    dependsOn: [], conflictsWith: [], examples: [], testCases: [],
  };
}

function csvSplit(value: string): string[] {
  return value.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Scan continuation lines starting at `startLine` and extract meta fields.
 * Returns the meta fields and the index of the first line AFTER the meta block.
 */
function parseContinuationLines(
  lines: string[],
  startLine: number,
  warnings: RuleWarning[],
  relFile: string,
): { meta: MetaFields; nextLine: number } {
  const meta = emptyMeta();
  let j = startLine;

  for (; j < lines.length; j++) {
    const content = stripCommentPrefix(lines[j]);
    // Stop on non-comment or empty comment content
    if (content === null || content === "") break;

    const m = META_LINE_RE.exec(content);
    if (!m) break;

    const key = m[1];
    const value = m[2].trim();

    if (!META_KEYS.has(key)) break; // unknown key → end of meta block

    if (ARRAY_META_KEYS.has(key)) {
      (meta as any)[key] = csvSplit(value);
    } else if (MULTI_LINE_META_KEYS.has(key)) {
      (meta as any)[key].push(value);
    } else {
      (meta as any)[key] = value;
    }
  }

  // Validate status
  if (meta.status && !(VALID_STATUSES as readonly string[]).includes(meta.status)) {
    warnings.push({
      file: relFile,
      line: startLine + 1, // 1-based approximate
      message: `unknown status "${meta.status}", expected one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  // Validate since date format
  if (meta.since && !/^\d{4}-\d{2}-\d{2}$/.test(meta.since)) {
    warnings.push({
      file: relFile,
      line: startLine + 1,
      message: `malformed since date "${meta.since}", expected YYYY-MM-DD`,
    });
  }

  return { meta, nextLine: j };
}

// ---------------------------------------------------------------------------
// Levenshtein distance for "did you mean?" suggestions
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    }
  }
  return dp[m][n];
}

function suggestSeverity(input: string, severities: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of severities) {
    const d = levenshtein(input.toLowerCase(), s.toLowerCase());
    if (d < bestDist && d <= 2) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Smart parse: detect severity vs ticket regardless of order
// ---------------------------------------------------------------------------

interface ParsedParams {
  scope: string;
  subscope: string;
  fullScope: string;
  severity: string;
  ticket: string;
  warning: string | null;
}

function parseParams(raw: string, severities: string[], defaultSeverity: string): ParsedParams {
  const parts = raw.split(",").map((s) => s.trim());
  const scopeParts = (parts[0] || "unknown").split(".");

  const scope = scopeParts[0];
  const subscope = scopeParts.slice(1).join(".") || "_general";
  const fullScope = parts[0] || "unknown";

  // Only scope, no other params
  if (parts.length === 1) {
    return { scope, subscope, fullScope, severity: defaultSeverity, ticket: "", warning: null };
  }

  const sevSet = new Set(severities.map((s) => s.toLowerCase()));
  const extras = parts.slice(1);

  let severity = defaultSeverity;
  let ticket = "";
  let warning: string | null = null;

  for (const param of extras) {
    const lower = param.toLowerCase();

    if (sevSet.has(lower)) {
      // It's a known severity
      severity = lower;
    } else {
      // Could it be a misspelled severity?
      const suggestion = suggestSeverity(param, severities);
      if (suggestion && !param.includes("-") && !/^[A-Z]+-\d+$/.test(param) && !/\d/.test(param)) {
        // Looks like a typo, not a ticket
        warning = `unknown severity "${param}", did you mean "${suggestion}"? (defaulting to ${defaultSeverity})`;
        severity = defaultSeverity;
      } else {
        // Treat as ticket
        ticket = param;
      }
    }
  }

  return { scope, subscope, fullScope, severity, ticket, warning };
}

// ---------------------------------------------------------------------------
// Extract rules from all matching files
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  rules: Rule[];
  warnings: RuleWarning[];
  removals: RuleRemoval[];
}

export function extractRules(config: RuledocConfig, cwd: string = process.cwd()): ExtractionResult {
  const extensions = new Set(config.extensions);
  const ignored = new Set(config.ignore);
  const onSkip = config.verbose
    ? (path: string, reason: string) => console.warn(`skipped ${path}: ${reason}`)
    : undefined;

  // Build combined isIgnored function from three layers
  const gitignoreFilter = config.gitignore ? loadGitignore(cwd) : null;
  const testRegexes = config.ignoreTests ? RULEDOC_DEFAULT_REGEXES : [];
  /* v8 ignore next */
  const extraRegexes = (config.extraIgnore || []).map(globToRegex);
  // Pre-compute src path relative to cwd for gitignore matching (e.g. "src" or "./src" → "src")
  const srcRelPrefix = relative(cwd, resolve(cwd, config.src));

  const isIgnored =
    gitignoreFilter || testRegexes.length > 0 || extraRegexes.length > 0
      ? (relativePath: string, _isDirectory: boolean): boolean => {
          if (gitignoreFilter) {
            const relToCwd = join(srcRelPrefix, relativePath);
            if (gitignoreFilter(relToCwd)) return true;
          }
          if (testRegexes.length > 0 && matchesAnyGlob(relativePath, testRegexes)) return true;
          if (extraRegexes.length > 0 && matchesAnyGlob(relativePath, extraRegexes)) return true;
          return false;
        }
      : undefined;

  const files = walkFiles(config.src, extensions, ignored, onSkip, isIgnored);
  const pattern = config.pattern || buildPattern(config.tag);
  const regex = new RegExp(pattern, "gim");
  const severities = config.severities;
  const defaultSeverity = severities[0] || "info";
  const rules: Rule[] = [];
  const warnings: RuleWarning[] = [];
  const removals: RuleRemoval[] = [];
  const escapedTag = config.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const removalRegex = new RegExp(
    String.raw`@${escapedTag}-removed\(([^,)]+),\s*([^)]+)\)\s*:?\s*(.+?)(?:\s*\*\/)?$`,
    "i",
  );

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  for (const filePath of files) {
    try {
      const size = statSync(filePath).size;
      if (size > MAX_FILE_SIZE) {
        warnings.push({
          file: relative(config.src, filePath),
          line: 0,
          message: `skipped: file exceeds 10 MB (${(size / 1024 / 1024).toFixed(1)} MB)`,
        });
        continue;
      }
    } catch {
      // If stat fails, try reading anyway — readFileSync will catch it
    }

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      warnings.push({
        file: relative(config.src, filePath),
        line: 0,
        /* v8 ignore next */
        message: `could not read file: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const relFile = relative(config.src, filePath);
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      // Check for @rule-removed annotation
      const removalMatch = removalRegex.exec(lines[i]);
      if (removalMatch) {
        removals.push({
          scope: removalMatch[1].trim(),
          ticket: removalMatch[2].trim(),
          reason: removalMatch[3].trim(),
          file: relFile,
          line: i + 1,
        });
      }

      regex.lastIndex = 0;
      const match = regex.exec(lines[i]);
      if (!match) continue;

      const parsed = parseParams(match[1], severities, defaultSeverity);

      // Warn on parse issues
      if (parsed.warning) {
        warnings.push({ file: relFile, line: i + 1, message: parsed.warning });
      }

      // Warn on empty scope
      if (!parsed.scope || parsed.scope === "unknown") {
        warnings.push({ file: relFile, line: i + 1, message: "empty scope in annotation" });
      }

      // Warn on empty description
      const desc = match[2].trim();
      if (!desc) {
        warnings.push({ file: relFile, line: i + 1, message: "empty description" });
        continue; // Skip rules with no description
      }

      // Parse continuation meta lines
      const { meta, nextLine } = parseContinuationLines(lines, i + 1, warnings, relFile);

      // Grab next non-comment, non-empty line as code context (starting after meta block)
      let codeContext = "";
      for (let j = nextLine; j < Math.min(nextLine + 5, lines.length); j++) {
        const trimmed = lines[j].trim();
        if (
          trimmed &&
          !trimmed.startsWith("//") &&
          !trimmed.startsWith("#") &&
          !trimmed.startsWith("*") &&
          !trimmed.startsWith("/**")
        ) {
          codeContext = trimmed;
          break;
        }
      }

      rules.push({
        scope: parsed.scope,
        subscope: parsed.subscope,
        fullScope: parsed.fullScope,
        severity: parsed.severity,
        ticket: parsed.ticket,
        description: desc,
        file: relFile,
        line: i + 1,
        codeContext,
        ...meta,
      });
    }
  }

  return { rules, warnings, removals };
}
