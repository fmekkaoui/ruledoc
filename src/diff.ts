import { existsSync, readFileSync } from "node:fs";
import type { Rule, RuleDiff } from "./types.js";

function fingerprint(r: Rule): string {
  return `${r.fullScope}|${r.severity}|${r.ticket}|${r.description}|${r.file}`;
}

export function loadPreviousRules(jsonPath: string): Rule[] {
  try {
    if (!existsSync(jsonPath)) return [];
    return JSON.parse(readFileSync(jsonPath, "utf-8")).rules || [];
  } catch {
    return [];
  }
}

export function computeDiff(prev: Rule[], next: Rule[]): RuleDiff {
  const prevSet = new Set(prev.map(fingerprint));
  const nextSet = new Set(next.map(fingerprint));

  return {
    added: next.filter((r) => !prevSet.has(fingerprint(r))),
    removed: prev.filter((r) => !nextSet.has(fingerprint(r))),
  };
}
