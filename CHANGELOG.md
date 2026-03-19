# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-03-13

### Added

- ASCII logo in CLI help output
- README badges (npm, CI, license, node version, zero deps)
- Example project (`examples/saas-billing/`)
- Launch content drafts (`docs/launch/`)
- Additional npm keywords for discoverability
- `SECURITY.md` security policy
- GitHub Actions publish workflow with provenance

## [0.1.0] - 2026-03-13

### Added

- `@rule()` annotation parser with scope, subscope, severity, and ticket support
- Smart parameter detection — severity vs ticket regardless of order
- Levenshtein-based typo suggestions for misspelled severities
- Markdown output with table of contents, summary table, and detailed rule listings
- JSON output with full rule data and scope tree
- Interactive HTML output with search, scope filters, and severity filters
- Diff detection — shows added/removed rules compared to previous run
- `--check` mode for CI — exits with code 1 if docs are stale
- Config via `ruledoc.config.json`, `package.json` "ruledoc" field, or CLI flags
- Strict config validation with accumulated error messages
- `--init` command for quick project setup
- `--verbose` mode to list all discovered rules
- Code context extraction — captures first meaningful line after annotation
- File walker with extension filtering and directory ignore list
- Zero production dependencies
- Dual ESM/CJS build with TypeScript declarations
- GitHub Actions workflow with OIDC trusted publishing
