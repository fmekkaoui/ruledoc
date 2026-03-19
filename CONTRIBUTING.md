# Contributing to ruledoc

Thanks for your interest in contributing!

## Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type-check
npm run typecheck

# Build
npm run build
```

## Project Structure

```
src/
  types.ts          # Type definitions and defaults
  config.ts         # Config loading, CLI parsing, validation
  walker.ts         # File system walker
  parser.ts         # Rule extraction from source files
  tree.ts           # Scope tree builder and helpers
  diff.ts           # Diff detection between runs
  output/
    markdown.ts     # Markdown output generator
    json.ts         # JSON output generator
    html.ts         # HTML output generator
  cli.ts            # CLI entry point
  index.ts          # Public API exports
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests — coverage must stay at 100% (statements, functions, lines)
4. Run `npm run test:coverage` and `npm run typecheck` to verify
5. Open a pull request

## Code Style

- TypeScript strict mode — no `any` types
- Zero production dependencies — keep it that way
- Keep functions small and focused
- Test every code path

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Node.js version and OS
