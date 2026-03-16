import { FREE_TIER_RULE_LIMIT, isProEnabled } from "./license.js";
import type { RuledocConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Feature types
// ---------------------------------------------------------------------------

export type ProFeature = "tombstones" | "protect" | "context" | "github-action";

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

// @rule(licensing.gate, critical): Pro features degrade gracefully — skipped with message, never crash
// @rule(licensing.gate.message): Show feature name, rule count, threshold, and upgrade URL

/**
 * Print a Pro-gated feature warning. Returns false for convenience in conditionals.
 */
export function printProGate(feature: ProFeature, ruleCount: number, quiet: boolean): false {
  if (!quiet) {
    console.warn(
      `⚠ ruledoc: "${feature}" requires a Pro license (${ruleCount} rules detected, free up to ${FREE_TIER_RULE_LIMIT})\n` +
        `  → Get a license at https://buy.polar.sh/polar_cl_KepwOnHye5LMqyu286hLpr4Qb6XqW8h2AsBnn1dvs3V\n` +
        `  Running in free mode (${feature} disabled).`,
    );
  }
  return false;
}

/**
 * All-in-one: check license + print warning if blocked.
 * For callers that don't pre-compute the license check.
 */
export async function requirePro(
  feature: ProFeature,
  ruleCount: number,
  config: RuledocConfig,
  cacheDir?: string,
): Promise<boolean> {
  try {
    if (await isProEnabled(ruleCount, config, cacheDir)) return true;
    return printProGate(feature, ruleCount, config.quiet);
  } catch {
    return false; // Never crash
  }
}
