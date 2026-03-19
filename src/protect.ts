import { buildRemovalMaps } from "./diff.js";
import type { Rule, RuleRemoval } from "./types.js";

export interface ProtectionResult {
  blocked: Rule[];
  acknowledged: Rule[];
}

export function checkProtection(removedRules: Rule[], removals: RuleRemoval[], protectedSeverities: string[]): ProtectionResult {
  const { byId, byScope } = buildRemovalMaps(removals);
  const blocked: Rule[] = [];
  const acknowledged: Rule[] = [];

  for (const r of removedRules) {
    if (!protectedSeverities.includes(r.severity)) continue;
    const ack = (r.id && byId.get(r.id)) || byScope.get(r.fullScope);
    if (ack) {
      acknowledged.push(r);
    } else {
      blocked.push(r);
    }
  }

  return { blocked, acknowledged };
}
