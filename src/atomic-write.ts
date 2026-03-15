import { copyFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Write data to a file atomically: write to a temp file, then rename.
 * Falls back to write-in-place if rename fails (e.g. cross-filesystem).
 */
export function atomicWriteFileSync(filePath: string, data: string): void {
  // Write temp file next to target first (same filesystem), fall back to tmpdir
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.ruledoc-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tmpPath, data);
  try {
    renameSync(tmpPath, filePath);
  } catch {
    /* v8 ignore start — cross-filesystem fallback, hard to trigger in tests */
    try {
      copyFileSync(tmpPath, filePath);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup
      }
    }
    /* v8 ignore stop */
  }
}
