import { buildTree } from "../tree.js";
import type { Rule, RuleWarning } from "../types.js";

export function generateJSON(rules: Rule[], warnings: RuleWarning[]): string {
  return JSON.stringify(
    {
      generated: new Date().toISOString(),
      total: rules.length,
      warnings: warnings.length > 0 ? warnings : undefined,
      tree: buildTree(rules),
      rules,
    },
    null,
    2,
  );
}
