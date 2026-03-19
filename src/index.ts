export { ConfigError, resolveConfig } from "./config.js";
export { appendHistory, buildRemovalMaps, computeDiff, contentFingerprint, fingerprint, loadHistory, loadPreviousRules } from "./diff.js";
export { loadGitignore } from "./gitignore.js";
export { globToRegex, matchesAnyGlob } from "./glob.js";
export { generateContext } from "./output/context.js";
export { generateHTML } from "./output/html.js";
export { generateJSON } from "./output/json.js";
export { generateMarkdown } from "./output/markdown.js";
export type { ExtractionResult } from "./parser.js";
export { extractRules } from "./parser.js";
export type { ProtectionResult } from "./protect.js";
export { checkProtection } from "./protect.js";
export { buildTree, splitByLifecycle } from "./tree.js";
export type { HistoryEntry, Rule, RuleDiff, RuledocConfig, RuleRemoval, RuleWarning, ScopeTree } from "./types.js";
export {
  ACTIVE_STATUSES,
  buildPattern,
  DEFAULT_CONFIG,
  DEFAULT_SEVERITIES,
  DEFAULT_SEVERITY_DISPLAY,
  HISTORICAL_STATUSES,
  isHistoricalRule,
  RULEDOC_DEFAULT_IGNORE,
  SEVERITY_DISPLAY,
  VALID_STATUSES,
} from "./types.js";
