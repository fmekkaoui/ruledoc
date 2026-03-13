# ruledoc

```
┌─┐┬ ┬┬  ┌─┐┌┬┐┌─┐┌─┐
├┬┘│ ││  ├┤  │││ ││
┴└─└─┘┴─┘└─┘─┴┘└─┘└─┘
```

[![npm version](https://img.shields.io/npm/v/ruledoc)](https://www.npmjs.com/package/ruledoc)
[![CI](https://github.com/fmekkaoui/ruledoc/actions/workflows/ci.yml/badge.svg)](https://github.com/fmekkaoui/ruledoc/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/ruledoc)](https://github.com/fmekkaoui/ruledoc/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/ruledoc)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/ruledoc)

Extract `@rule()` annotations from your codebase and generate living business rules documentation.

Business rules are scattered everywhere — constants, guards, validators, middleware. `ruledoc` finds them all and produces a structured, searchable doc.

## Try it

```bash
npx ruledoc
```

Zero install, zero config. Scans `./src` and generates your doc instantly.

## Install

Once you're sold, add it as a dev dependency:

```bash
npm install -D ruledoc
```

Requires Node.js 18 or later (18 is the oldest LTS still widely deployed, and the minimum required by the toolchain — tsup, vitest, `fs.watch` recursive).

## Quick start

**1. Annotate your code**

```ts
// @rule(billing.plans, critical): Free plan is limited to 50 links
export const FREE_PLAN_LINK_LIMIT = 50;

// @rule(auth.session): Session expires after 24h of inactivity
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// @rule(redirect.chain, FLEW-234, warning): Max 5 hops to prevent loops
export const MAX_REDIRECT_CHAIN = 5;
```

**2. Run `npx ruledoc`**

**3. Get your doc** — `BUSINESS_RULES.md` + `BUSINESS_RULES.json` at the root.

## Annotation format

```
// @rule(scope): Description
// @rule(scope.sub): With subscope
// @rule(scope.sub, critical): With severity
// @rule(scope.sub, critical, JIRA-123): With ticket
// @rule(scope.sub, JIRA-123, critical): Order doesn't matter
// @rule(scope.sub, JIRA-123): Ticket only — severity defaults to info
```

| Param | Required | Description |
|-------|----------|-------------|
| **scope** | ✅ | Dotted path like `billing.plans`, `auth.session` |
| **severity** | ❌ | One of `info` (default), `warning`, `critical` — or custom |
| **ticket** | ❌ | Any string like `JIRA-123`, `FLEW-234`, `#42` |

**Smart detection:** severity and ticket can be in any order. `ruledoc` matches against the known severity list and figures out which is which.

## Warnings

`ruledoc` catches annotation issues without blocking:

```
◆ ruledoc 28 rules · 5 scopes · 7 critical · 5 warning

  ⚠ auth/session.ts:4 — unknown severity "crtical", did you mean "critical"? (defaulting to info)
  ⚠ billing/limits.ts:12 — empty description
```

Warnings appear in the terminal, and are included in the generated Markdown and JSON output.

## Output formats

| Format | Flag | Description |
|--------|------|-------------|
| Markdown | `md` | Grouped by scope, TOC, summary table, severity badges, warnings |
| JSON | `json` | Structured tree for tooling, includes warnings |
| HTML | `html` | Standalone dark-themed page with search, scope/severity filters |

```bash
ruledoc --format md,json,html
```

## CLI

```bash
ruledoc [options]

Options:
  -s, --src <dir>           Source directory (default: ./src)
  -o, --output <file>       Output file (default: ./BUSINESS_RULES.md)
  -f, --format <formats>    md,json,html (default: md,json)
  -e, --extensions <exts>   .ts,.vue,.py (default: .ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte)
      --ignore <dirs>       Directories to skip
  -t, --tag <name>          Annotation tag (default: rule → @rule(...))
      --severities <list>   Severity levels, first is default (default: info,warning,critical)
  -p, --pattern <regex>     Custom regex (overrides --tag)
  -c, --check               CI mode: exit 1 if docs are stale
  -q, --quiet               Suppress all output except errors
      --verbose             List every rule found in terminal
      --init                Setup guide and example config
  -h, --help                Show this help
  -v, --version             Show version
```

### Quiet mode

`--quiet` suppresses all terminal output except errors. Useful in CI or when piping.

```bash
ruledoc --quiet
```

### Verbose mode

`--verbose` lists every rule found, grouped by scope:

```
◆ ruledoc 28 rules · 5 scopes · 7 critical

  Auth (7)
    ● [critical] Session expires after 24h → auth/session.ts:3
    ● Password must be 8+ chars → auth/password.ts:1
    ...
  Billing (5)
    ● [critical] Free plan limited to 50 links → billing/limits.ts:1
    ● [warning] Trial lasts 14 days FLEW-102 → billing/limits.ts:7
    ...
```

## Config

Config is loaded in this order (later wins):

1. `ruledoc.config.json`
2. `"ruledoc"` field in `package.json`
3. CLI flags

Only JSON config files are supported — no JS/TS configs (no eval, no code execution).

```json
{
  "src": "./src",
  "output": "./BUSINESS_RULES.md",
  "formats": ["md", "json", "html"],
  "tag": "rule",
  "severities": ["info", "warning", "critical"],
  "extensions": [".ts", ".tsx", ".js", ".jsx", ".vue"],
  "ignore": ["node_modules", ".next", "dist"]
}
```

Or in `package.json`:

```json
{
  "ruledoc": {
    "src": "./app",
    "formats": ["md", "json", "html"]
  }
}
```

### Config validation

`ruledoc` validates the entire config before running and gives clear error messages:

```
✗ Invalid config:
  • unknown format "xml" — valid formats: md, json, html
  • extension "ts" must start with a dot (e.g. ".ts")
  • pattern is not a valid regex: Unterminated character class
```

## Custom tag

Use a different annotation name:

```json
{ "tag": "bizrule" }
```

Now `ruledoc` matches `@bizrule(...)` instead of `@rule(...)`.

## Custom severities

```json
{ "severities": ["low", "medium", "high", "blocker"] }
```

The first value is the default when severity is omitted.

## Custom regex

For full control, provide a regex with two capture groups — `(1)` params inside parens and `(2)` description:

```json
{
  "pattern": "(?:\\/\\/|#)\\s*@business\\(([^)]+)\\)\\s*:\\s*(.+)"
}
```

When `pattern` is set, it overrides `tag`.

## Use with turbo watch

```jsonc
// package.json
{ "scripts": { "rules": "ruledoc" } }
```

```jsonc
// turbo.json
{
  "tasks": {
    "rules": {
      "inputs": ["src/**/*.ts", "src/**/*.tsx"],
      "outputs": ["BUSINESS_RULES.md", "BUSINESS_RULES.json"]
    }
  }
}
```

Dev server + rules watcher side by side:

```bash
turbo watch dev rules --filter=web
```

## CI check

```bash
ruledoc --check
```

Exits with code 1 if the generated doc differs from the existing file. Combine with `--quiet` for clean CI output:

```bash
ruledoc --check --quiet
```

```yaml
# .github/workflows/rules.yml
- run: npx ruledoc --check --quiet
```

## Interactive diff

Each run compares with the previous JSON output and shows what changed:

```
◆ ruledoc 28 rules · 5 scopes · 7 critical · 5 warning
  + Refunds must be processed within 48h [critical] billing.refund → billing/limits.ts:22
  - Old trial rule [info] billing.trial → billing/limits.ts:8
  → ./BUSINESS_RULES.md
  → ./BUSINESS_RULES.json
```

## Programmatic API

```ts
import { extractRules, resolveConfig, generateMarkdown } from "ruledoc";

const config = resolveConfig([], process.cwd());
const { rules, warnings } = extractRules(config);
const md = generateMarkdown(rules, warnings, config.src);
```

## Security

`ruledoc` is designed to be safe:

- **No eval** — config is loaded from JSON only, never executed as code
- **No runtime deps** — zero third-party dependencies in production
- **Read-only scanning** — source files are never modified
- **No network** — everything runs locally, nothing is sent anywhere

## Example

See [`examples/saas-billing/`](./examples/saas-billing/) for a working demo with ~10 annotated rules across billing, auth, and notification modules.

## License

MIT
