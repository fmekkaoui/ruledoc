import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { HistoryEntry, Rule, RuleDiff, RuleRemoval } from "./types.js";

export function fingerprint(r: Rule): string {
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

// ---------------------------------------------------------------------------
// History (tombstones)
// ---------------------------------------------------------------------------

export function loadHistory(historyPath: string): HistoryEntry[] {
  try {
    if (!existsSync(historyPath)) return [];
    const data = JSON.parse(readFileSync(historyPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function appendHistory(historyPath: string, removed: Rule[], removals: RuleRemoval[] = []): HistoryEntry[] {
  const history = loadHistory(historyPath);
  const now = new Date().toISOString();

  const removalByScope = new Map<string, RuleRemoval>();
  for (const rem of removals) {
    if (!removalByScope.has(rem.scope)) {
      removalByScope.set(rem.scope, rem);
    }
  }

  for (const r of removed) {
    const entry: HistoryEntry = {
      removedAt: now,
      rule: {
        scope: r.fullScope,
        severity: r.severity,
        description: r.description,
        lastFile: r.file,
        lastLine: r.line,
      },
    };

    const ack = removalByScope.get(r.fullScope);
    if (ack) {
      entry.acknowledged = {
        ticket: ack.ticket,
        reason: ack.reason,
        file: ack.file,
        line: ack.line,
      };
    }

    history.push(entry);
  }

  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  return history;
}
