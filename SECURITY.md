# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Use [GitHub's private vulnerability reporting](https://github.com/fmekkaoui/ruledoc/security/advisories/new)
3. Include steps to reproduce and impact assessment

## Security Design

ruledoc is designed to minimize attack surface:

- **Zero runtime dependencies** — no supply chain risk from third-party code
- **No code execution** — config is JSON only, never evaluated as code
- **Read-only** — source files are never modified
- **No network access** — everything runs locally, nothing is sent anywhere
