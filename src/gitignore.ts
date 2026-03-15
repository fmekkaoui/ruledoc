import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globToRegex } from "./glob.js";

// ---------------------------------------------------------------------------
// .gitignore parser (zero dependencies)
// ---------------------------------------------------------------------------

interface GitignoreRule {
  regex: RegExp;
  negated: boolean;
}

// @rule(ignore.gitignore, critical): .gitignore patterns use last-matching-rule-wins semantics with negation support
export function loadGitignore(rootDir: string): (relativePath: string) => boolean {
  const gitignorePath = join(rootDir, ".gitignore");

  let content: string;
  try {
    content = readFileSync(gitignorePath, "utf-8");
  } catch {
    return () => false;
  }

  const rules: GitignoreRule[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith("#")) continue;

    // Detect negation
    let pattern = line;
    let negated = false;
    if (pattern.startsWith("!")) {
      negated = true;
      pattern = pattern.slice(1);
    }

    rules.push({
      regex: globToRegex(pattern),
      negated,
    });
  }

  if (rules.length === 0) {
    return () => false;
  }

  // @rule(ignore.gitignore): Last matching rule wins — negation patterns can re-include previously ignored files
  return (relativePath: string): boolean => {
    let ignored = false;
    for (const rule of rules) {
      if (rule.regex.test(relativePath)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  };
}
