# saas-billing example

A small demo project showing how `ruledoc` captures business rules across a SaaS billing codebase.

## Rules overview

This example contains ~10 annotated rules across:

- **billing/plans.ts** — plan limits, trial period
- **billing/limits.ts** — refund policy, usage caps
- **auth/session.ts** — session TTL, concurrent sessions
- **auth/password.ts** — minimum length, password expiry
- **notifications/email.ts** — reminder frequency

## Try it

```bash
cd examples/saas-billing
npm run rules
```

This runs `ruledoc` and generates `BUSINESS_RULES.md` and `BUSINESS_RULES.json`.

## Pre-generated output

Both `BUSINESS_RULES.md` and `BUSINESS_RULES.json` are committed so you can see the output without running anything.
