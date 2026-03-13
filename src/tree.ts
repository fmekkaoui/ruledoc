import type { Rule, ScopeTree } from "./types.js";

export function buildTree(rules: Rule[]): ScopeTree {
  const tree: ScopeTree = {};
  for (const rule of rules) {
    if (!tree[rule.scope]) tree[rule.scope] = {};
    if (!tree[rule.scope][rule.subscope]) tree[rule.scope][rule.subscope] = [];
    tree[rule.scope][rule.subscope].push(rule);
  }
  return tree;
}

export function capitalize(s: string): string {
  return s === "_general" ? "General" : s.charAt(0).toUpperCase() + s.slice(1);
}

export function sevBadge(s: string): string {
  return { critical: "🔴", warning: "🟡", info: "🔵" }[s] || "⚪";
}
