export { ConfigError, resolveConfig } from "./config.js";
export { appendHistory, computeDiff, fingerprint, loadHistory, loadPreviousRules } from "./diff.js";
export type { ProFeature } from "./gate.js";
export { printProGate, requirePro } from "./gate.js";
export { loadGitignore } from "./gitignore.js";
export { globToRegex, matchesAnyGlob } from "./glob.js";
export { isProEnabled } from "./license.js";
export { generateContext } from "./output/context.js";
export { generateHTML } from "./output/html.js";
export { generateJSON } from "./output/json.js";
export { generateMarkdown } from "./output/markdown.js";
export type { ExtractionResult } from "./parser.js";
export { extractRules } from "./parser.js";
export type { ProtectionResult } from "./protect.js";
export { checkProtection } from "./protect.js";
export { buildTree } from "./tree.js";
export type { HistoryEntry, Rule, RuleDiff, RuledocConfig, RuleRemoval, RuleWarning, ScopeTree } from "./types.js";
export {
  buildPattern,
  DEFAULT_CONFIG,
  DEFAULT_SEVERITIES,
  DEFAULT_SEVERITY_DISPLAY,
  RULEDOC_DEFAULT_IGNORE,
  SEVERITY_DISPLAY,
} from "./types.js";
