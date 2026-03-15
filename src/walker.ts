import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

// Entries that are hidden on Windows but don't start with "."
const WIN_HIDDEN = new Set(["$RECYCLE.BIN", "System Volume Information", "Thumbs.db", "desktop.ini"]);

function isHidden(entry: string): boolean {
  return entry.startsWith(".") || WIN_HIDDEN.has(entry);
}

export function walkFiles(
  dir: string,
  extensions: Set<string>,
  ignored: Set<string>,
  onSkip?: (path: string, reason: string) => void,
  isIgnored?: (relativePath: string, isDirectory: boolean) => boolean,
  rootDir?: string,
): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const root = rootDir ?? dir;

  for (const entry of readdirSync(dir)) {
    if (isHidden(entry) || ignored.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch (err) {
      onSkip?.(fullPath, err instanceof Error ? err.message : String(err));
      continue;
    }

    const isDir = stat.isDirectory();
    const rel = isIgnored ? relative(root, fullPath) : "";

    if (isDir) {
      if (lstatSync(fullPath).isSymbolicLink()) {
        onSkip?.(fullPath, "symlink");
        continue;
      }
      if (isIgnored && isIgnored(rel, true)) continue;
      results.push(...walkFiles(fullPath, extensions, ignored, onSkip, isIgnored, root));
    } else if (extensions.has(extname(entry))) {
      if (isIgnored && isIgnored(rel, false)) continue;
      results.push(fullPath);
    }
  }

  return results;
}
