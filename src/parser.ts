import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { Rule, RuledocConfig, RuleRemoval, RuleWarning } from "./types.js";
import { buildPattern } from "./types.js";
import { walkFiles } from "./walker.js";

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

export function extractRules(config: RuledocConfig): ExtractionResult {
  const extensions = new Set(config.extensions);
  const ignored = new Set(config.ignore);
  const onSkip = config.verbose
    ? (path: string, reason: string) => console.warn(`skipped ${path}: ${reason}`)
    : undefined;
  const files = walkFiles(config.src, extensions, ignored, onSkip);
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

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const relFile = relative(config.src, filePath);
    const lines = content.split("\n");

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

      // Grab next non-comment, non-empty line as code context
      let codeContext = "";
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
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
      });
    }
  }

  return { rules, warnings, removals };
}
