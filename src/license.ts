import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "./atomic-write.js";
import type { RuledocConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLAR_ORG_ID = "ruledoc";
const FREE_TIER_RULE_LIMIT = 50;
const CACHE_TTL_DAYS = 7;
const CACHE_GRACE_PERIOD_DAYS = 30;
const CACHE_FILE = ".ruledoc-license.json";
const VALIDATE_URL = "https://api.polar.sh/v1/customer-portal/license-keys/validate";

export { FREE_TIER_RULE_LIMIT };

// ---------------------------------------------------------------------------
// Cache shape
// ---------------------------------------------------------------------------

interface LicenseCache {
  key: string;
  valid: boolean;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function readCache(cacheDir: string): LicenseCache | null {
  try {
    const raw = readFileSync(join(cacheDir, CACHE_FILE), "utf-8");
    const data = JSON.parse(raw);
    if (data && typeof data.key === "string" && typeof data.valid === "boolean" && typeof data.checkedAt === "string") {
      return data as LicenseCache;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(cacheDir: string, cache: LicenseCache): void {
  try {
    atomicWriteFileSync(join(cacheDir, CACHE_FILE), `${JSON.stringify(cache, null, 2)}\n`);
  } catch {
    // Best-effort — don't crash if we can't write cache
  }
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function validateWithAPI(key: string): Promise<boolean | null> {
  try {
    const res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, organization_id: POLAR_ORG_ID }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (typeof body !== "object" || body === null || typeof body.status !== "string") return null;
    return body.status === "granted";
  } catch {
    return null; // Network failure
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

// @rule(licensing.trial, critical): Free tier — all features unlocked below 50 rules
// @rule(licensing.cache, warning): Cache license validation result for 7 days
// @rule(licensing.cache, warning): Grace period of 30 days when API unreachable
// @rule(licensing.priority): Env var RULEDOC_LICENSE takes precedence over config
// @rule(licensing.offline): No network + no cache → Pro disabled, CLI continues

export async function isProEnabled(ruleCount: number, config: RuledocConfig, cacheDir?: string): Promise<boolean> {
  try {
    // Free tier: all features unlocked
    if (ruleCount < FREE_TIER_RULE_LIMIT) return true;

    // Resolve license key
    const key = process.env.RULEDOC_LICENSE || config.license;
    if (!key) return false;

    const dir = cacheDir ?? process.cwd();

    // Check cache
    const cache = readCache(dir);
    const cacheMatch = cache && cache.key === key;

    if (cacheMatch) {
      const age = daysSince(cache.checkedAt);
      if (age < CACHE_TTL_DAYS) return cache.valid;

      // Cache is stale — try API, fall back to grace period
      const result = await validateWithAPI(key);
      if (result !== null) {
        writeCache(dir, { key, valid: result, checkedAt: new Date().toISOString() });
        return result;
      }
      return age < CACHE_GRACE_PERIOD_DAYS ? cache.valid : false;
    }

    // No matching cache — must validate via API
    const result = await validateWithAPI(key);
    if (result !== null) {
      writeCache(dir, { key, valid: result, checkedAt: new Date().toISOString() });
      return result;
    }

    return false;
  } catch {
    return false; // Never throw
  }
}
