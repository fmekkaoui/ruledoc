// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export interface Rule {
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
  formats: ("md" | "json" | "html")[];

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

  /** CI mode — exit 1 if generated doc differs from existing. */
  check: boolean;

  /** Suppress all terminal output except errors. */
  quiet: boolean;

  /** List every rule found in terminal output. */
  verbose: boolean;
}

export const DEFAULT_SEVERITIES = ["info", "warning", "critical"];

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
  check: false,
  quiet: false,
  verbose: false,
};

// ---------------------------------------------------------------------------
// Build regex from tag name
// ---------------------------------------------------------------------------

export function buildPattern(tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String.raw`(?:\/\/|\/\*\*?|#)\s*@${escaped}\(([^)]+)\)\s*:?\s*(.+?)(?:\s*\*\/)?$`;
}
