import { existsSync, readFileSync } from "node:fs";
import { atomicWriteFileSync } from "./atomic-write.js";
import type { HistoryEntry, Rule, RuleDiff, RuleRemoval } from "./types.js";

export function fingerprint(r: Rule): string {
  return r.id
    ? `id:${r.id}`
    : contentFingerprint(r);
}

export function contentFingerprint(r: Rule): string {
  const base = `${r.fullScope}|${r.severity}|${r.ticket}|${r.description}|${r.file}`;
  const rich = [
    r.title || "",
    r.rationale || "",
    r.owner || "",
    r.status || "",
    r.since || "",
    (r.tags || []).join(","),
    r.supersededBy || "",
    (r.dependsOn || []).join(","),
    (r.conflictsWith || []).join(","),
  ].join("|");
  return `${base}|${rich}`;
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
  // Build ID-based maps for modification detection
  const prevById = new Map<string, Rule>();
  const nextById = new Map<string, Rule>();
  for (const r of prev) { if (r.id) prevById.set(r.id, r); }
  for (const r of next) { if (r.id) nextById.set(r.id, r); }

  // Detect modifications: same ID, different content
  const modified: Array<{ prev: Rule; next: Rule }> = [];
  const modifiedIds = new Set<string>();
  for (const [id, nextRule] of nextById) {
    const prevRule = prevById.get(id);
    if (prevRule && contentFingerprint(prevRule) !== contentFingerprint(nextRule)) {
      modified.push({ prev: prevRule, next: nextRule });
      modifiedIds.add(id);
    }
  }

  // Build fingerprint sets excluding modified IDs, then find added/removed in one pass
  const prevFps = new Set<string>();
  const nextFps = new Set<string>();
  const prevUnmodified: Rule[] = [];
  const nextUnmodified: Rule[] = [];
  for (const r of prev) {
    if (!modifiedIds.has(r.id)) { prevFps.add(fingerprint(r)); prevUnmodified.push(r); }
  }
  for (const r of next) {
    if (!modifiedIds.has(r.id)) { nextFps.add(fingerprint(r)); nextUnmodified.push(r); }
  }

  return {
    added: nextUnmodified.filter((r) => !prevFps.has(fingerprint(r))),
    removed: prevUnmodified.filter((r) => !nextFps.has(fingerprint(r))),
    modified,
  };
}

// ---------------------------------------------------------------------------
// Removal lookup maps
// ---------------------------------------------------------------------------

export function buildRemovalMaps(removals: RuleRemoval[]): { byId: Map<string, RuleRemoval>; byScope: Map<string, RuleRemoval> } {
  const byId = new Map<string, RuleRemoval>();
  const byScope = new Map<string, RuleRemoval>();
  for (const rem of removals) {
    if (rem.id) {
      if (!byId.has(rem.id)) byId.set(rem.id, rem);
    } else if (!byScope.has(rem.scope)) {
      byScope.set(rem.scope, rem);
    }
  }
  return { byId, byScope };
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

  const { byId, byScope } = buildRemovalMaps(removals);

  for (const r of removed) {
    const entry: HistoryEntry = {
      removedAt: now,
      rule: {
        id: r.id || "",
        scope: r.fullScope,
        severity: r.severity,
        description: r.description,
        lastFile: r.file,
        lastLine: r.line,
      },
    };

    const ack = (r.id && byId.get(r.id)) || byScope.get(r.fullScope);
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

  atomicWriteFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  return history;
}
