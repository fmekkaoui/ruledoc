// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export interface Rule {
  /** Stable identifier, e.g. "RUL-001" — empty string when not present */
  id: string;
  /** Top-level scope, e.g. "billing" */
  scope: string;
  /** Sub-scope, e.g. "plans" — defaults to "_general" */
  subscope: string;
  /** Original dotted path, e.g. "billing.plans" */
  fullScope: string;
  /** "info" | "warning" | "critical" (or custom) */
  severity: string;
  /** Optional ticket reference, e.g. "FLEW-234" */
  ticket: string;
  /** Human-readable rule description */
  description: string;
  /** Relative file path from srcDir */
  file: string;
  /** 1-based line number */
  line: number;
  /** First meaningful line of code after the annotation */
  codeContext: string;
  /** Short display title */
  title: string;
  /** Why this rule exists */
  rationale: string;
  /** Team or person responsible */
  owner: string;
  /** Lifecycle status: "draft" | "proposed" | "approved" | "active" | "deprecated" | "removed" | "" */
  status: string;
  /** ISO date when the rule was introduced, e.g. "2025-06-01" */
  since: string;
  /** Categorization tags */
  tags: string[];
  /** Related URLs */
  links: string[];
  /** Rule ID that supersedes this one */
  supersededBy: string;
  /** Rule IDs this rule depends on */
  dependsOn: string[];
  /** Rule IDs that conflict with this one */
  conflictsWith: string[];
  /** Usage examples */
  examples: string[];
  /** Paths to related test files */
  testCases: string[];
}

// ---------------------------------------------------------------------------
// Scope tree (grouped output)
// ---------------------------------------------------------------------------

export interface ScopeTree {
  [scope: string]: { [subscope: string]: Rule[] };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface RuleDiff {
  added: Rule[];
  removed: Rule[];
  modified: Array<{ prev: Rule; next: Rule }>;
}

// ---------------------------------------------------------------------------
// History (tombstones for removed rules)
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  removedAt: string;
  rule: {
    id: string;
    scope: string;
    severity: string;
    description: string;
    lastFile: string;
    lastLine: number;
  };
  acknowledged?: { ticket: string; reason: string; file: string; line: number };
  /** ID of the rule that replaces this one (from supersededBy or @rule-removed @replacedBy) */
  replacedBy?: string;
}

// ---------------------------------------------------------------------------
// Rule removal acknowledgment
// ---------------------------------------------------------------------------

export interface RuleRemoval {
  /** Populated when first param matches ID pattern */
  id: string;
  scope: string;
  ticket: string;
  reason: string;
  file: string;
  line: number;
  /** ID of the replacement rule, from @replacedBy continuation line */
  replacedBy: string;
}

// ---------------------------------------------------------------------------
// Warning
// ---------------------------------------------------------------------------

export interface RuleWarning {
  file: string;
  line: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RuledocConfig {
  /** Source directory to scan. Default: "./src" */
  src: string;

  /** Output file path. Default: "./BUSINESS_RULES.md" */
  output: string;

  /** Output formats to generate. Default: ["md", "json"] */
  formats: ("md" | "json" | "html" | "context")[];

  /** File extensions to scan. */
  extensions: string[];

  /** Directories to ignore. */
  ignore: string[];

  /** Annotation tag name. Default: "rule" → matches @rule(...) */
  tag: string;

  /** Known severity levels. First is the default. */
  severities: string[];

  /**
   * Custom regex pattern string for matching rules.
   * Must have two capture groups: (1) annotation params, (2) description.
   * When set, overrides the auto-generated pattern from `tag`.
   */
  pattern: string | null;

  /** Severity levels to protect from silent removal. */
  protect: string[];

  /** Bypass all protection checks. */
  allowRemoval: boolean;

  /** CI mode — exit 1 if generated doc differs from existing. */
  check: boolean;

  /** Suppress all terminal output except errors. */
  quiet: boolean;

  /** List every rule found in terminal output. */
  verbose: boolean;

  /** Track removed rules in BUSINESS_RULES_HISTORY.json. */
  history: boolean;

  /** Context format options. */
  context?: {
    maxRules?: number;
    severities?: string[];
  };

  /** Additional glob patterns to ignore (appended, never replaces). */
  extraIgnore: string[];

  /** Exclude test files by default. Default: true */
  ignoreTests: boolean;

  /** Respect .gitignore patterns. Default: true */
  gitignore: boolean;

  /** Prefix for stable rule IDs. Default: "RUL" → matches RUL-\d+ */
  idPrefix: string;

  /** Require every rule to have an explicit ID. Default: true */
  idRequired: boolean;

}

export const RULEDOC_DEFAULT_IGNORE = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "**/__tests__/**",
];

export const SEVERITY_DISPLAY: Record<string, { emoji: string; color: string; label: string }> = {
  critical: { emoji: "\uD83D\uDD34", color: "#ef4444", label: "Critical" },
  warning: { emoji: "\uD83D\uDFE1", color: "#eab308", label: "Warning" },
  info: { emoji: "\uD83D\uDD35", color: "#3b82f6", label: "Info" },
};
export const DEFAULT_SEVERITY_DISPLAY = { emoji: "\u26AA", color: "#9ca3af", label: "" };

export const DEFAULT_SEVERITIES = ["info", "warning", "critical"];

export const VALID_STATUSES = ["draft", "proposed", "approved", "active", "deprecated", "removed"] as const;

export const ACTIVE_STATUSES = new Set(["draft", "proposed", "approved", "active", ""]);
export const HISTORICAL_STATUSES = new Set(["deprecated", "removed"]);

export function isHistoricalRule(rule: Rule): boolean {
  return HISTORICAL_STATUSES.has(rule.status) || !!rule.supersededBy;
}

export const DEFAULT_CONFIG: RuledocConfig = {
  src: "./src",
  output: "./BUSINESS_RULES.md",
  formats: ["md", "json"],
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"],
  ignore: [
    "node_modules",
    ".next",
    ".nuxt",
    ".turbo",
    "dist",
    "build",
    ".git",
    "coverage",
    "__tests__",
    "__mocks__",
    ".output",
  ],
  tag: "rule",
  severities: DEFAULT_SEVERITIES,
  pattern: null,
  protect: [],
  allowRemoval: false,
  check: false,
  quiet: false,
  verbose: false,
  history: true,
  extraIgnore: [],
  ignoreTests: true,
  gitignore: true,
  idPrefix: "RUL",
  idRequired: true,
};

// ---------------------------------------------------------------------------
// Build regex from tag name
// ---------------------------------------------------------------------------

export function buildPattern(tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String.raw`(?:\/\/|\/\*\*?|#)\s*@${escaped}\(([^)]+)\)\s*:?\s*(.+?)(?:\s*\*\/)?$`;
}
