# Flatlord

A private flat-rental management app for a single landlord and their tenant, replacing a workflow spread across email, WhatsApp and a Google Sheet. Non-commercial; every schema and API decision anticipates multiple properties, tenancies and owner users.

> **Status (2026-09-15):** Phases 0–3 shipped and live in production; Phase 4a (automation) code-complete; Phase 4b (reporting) in progress; Phase 4c (UI fidelity pass) next. See `ROADMAP.md`.

## Documentation

| File | What it is |
|---|---|
| **[CLAUDE.md](./CLAUDE.md)** | Domain rules, stack, product rules, conventions. **Read first**, including the privacy rule (§0). |
| [ROADMAP.md](./ROADMAP.md) | Open work only, phase-sequenced, each item with a "Done means". |
| [BACKLOG.md](./BACKLOG.md) | Triaged, sized items incl. tech debt (`B-nn`). |
| [IDEAS.md](./IDEAS.md) | Unscheduled ideas. |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Standing decisions (`D-nn`) — check before re-deciding. |
| [docs/DELIVERY-LOG.md](./docs/DELIVERY-LOG.md) | What shipped, when, with what scope cuts. |
| [docs/NEXT-BATCH.md](./docs/NEXT-BATCH.md) | The current recommended next three items. |
| [docs/HEALTH-REPORT-2026-09-15.md](./docs/HEALTH-REPORT-2026-09-15.md) | Latest full project review. |
| [docs/backup-restore.md](./docs/backup-restore.md) · [docs/self-host-escape-hatch.md](./docs/self-host-escape-hatch.md) | Ops runbooks. |
| [design/README.md](./design/README.md) | UI handoff: tokens, component sheet, 13 mockup screens. |

## ⚠️ Privacy rule (absolute)

Every name, amount, date and identifier in the committed repo is **synthetic**. Real-world data lives **only** in the gitignored `/private` directory and must never be copied into code, tests, fixtures, comments, commit messages, UI defaults, logs or docs. See CLAUDE.md §0.

```bash
git check-ignore private/PRIVATE.md   # must print the path
```

## Stack

Next.js 16 (App Router, TypeScript strict) on Vercel · Supabase (Postgres, Auth, Storage, RLS) via supabase-js · Drizzle for schema + migrations · Tailwind 4 + shadcn v4 (Base UI) · recharts · next-intl (hu/en) · react-hook-form + zod · @react-pdf/renderer · Resend · Vercel Cron · Vitest + Playwright.

## Repository layout

```
.
├── CLAUDE.md ROADMAP.md BACKLOG.md IDEAS.md   # project docs (read CLAUDE.md first)
├── docs/                           # decisions, delivery log, next batch, runbooks, reviews
├── design/                         # UI handoff (HTML mockups — references, not code)
├── private/                        # gitignored — real-world data only
├── src/
│   ├── app/                        # Next.js App Router: (admin), (tenant), api/, auth/, login/
│   ├── components/                 # UI (components/ui = shadcn primitives)
│   ├── lib/                        # pure logic, clients, helpers (billing engine lives here)
│   ├── server/                     # server actions + cron/notification logic
│   ├── db/schema/                  # Drizzle schema-as-code
│   ├── i18n/                       # next-intl config
│   └── proxy.ts                    # session refresh + role routing (Next 16's middleware file)
├── supabase/migrations/            # SQL migrations (drizzle-kit generated + hand-written)
├── messages/                       # next-intl catalogs (en, hu)
├── seed/                           # seed.demo.ts committed; seed.real.ts gitignored
├── fixtures/                       # synthetic golden-test fixtures
├── tests/unit/                     # Vitest: billing golden tests, engine units, RLS isolation
├── scripts/                        # one-off importer, backup script
└── .github/workflows/              # CI, nightly backup, prod migration, health check, keep-alive
```

## Getting started

```bash
pnpm install
cp .env.example .env.local          # fill in the dev Supabase project's values
pnpm dev                            # http://localhost:3000
pnpm lint && pnpm typecheck         # always safe
pnpm test                           # needs SUPABASE_DB_URL (dev project or CI's local Postgres)
pnpm db:migrate                     # applies supabase/migrations to SUPABASE_DB_URL
```

Production migrations are applied only through the `Migrate prod database` GitHub Action (manual dispatch). Real UI verification is done with headless Playwright against the **dev** project using the synthetic test accounts (see `docs/NEXT-BATCH.md` › Session logistics).
