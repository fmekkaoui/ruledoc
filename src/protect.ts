import type { Rule, RuleRemoval } from "./types.js";

export interface ProtectionResult {
  blocked: Rule[];
  acknowledged: Rule[];
}

export function checkProtection(
  removedRules: Rule[],
  removals: RuleRemoval[],
  protectedSeverities: string[],
): ProtectionResult {
  const protectedSet = new Set(protectedSeverities);
  const protectedRules = removedRules.filter((r) => protectedSet.has(r.severity));

  const removalByScope = new Map<string, RuleRemoval>();
  for (const rem of removals) {
    removalByScope.set(rem.scope, rem);
  }

  const blocked: Rule[] = [];
  const acknowledged: Rule[] = [];

  for (const rule of protectedRules) {
    if (removalByScope.has(rule.fullScope)) {
      acknowledged.push(rule);
    } else {
      blocked.push(rule);
    }
  }

  return { blocked, acknowledged };
}
