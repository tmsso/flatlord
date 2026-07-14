# Flatlord

A private flat-rental management app for a single landlord and their tenant — replacing a workflow currently spread across email, WhatsApp and a Google Sheet. Non-commercial; built to grow toward multiple properties, tenancies and owner users.

> **Status:** Phase 0 (Foundation) — repository scaffolding only. No application code yet.

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** — domain rules, stack, product rules, conventions. **Read first**, including the privacy rule (§0).
- **[ROADMAP.md](./ROADMAP.md)** — sequential build plan (Phase 0 → 5). Do not start a phase before its predecessor is accepted.
- **[IDEAS.md](./IDEAS.md)** — unscheduled backlog; promote to the roadmap when concrete.

## ⚠️ Privacy rule (absolute)

Every name, amount, date and identifier in the committed repo is **synthetic**. Real-world data lives **only** in the gitignored `/private` directory and must never be copied into code, tests, fixtures, comments, commit messages, UI defaults, logs or docs. See CLAUDE.md §0. `.gitignore` excludes `/private` from the first commit — verify with:

```bash
git check-ignore private/PRIVATE.md   # must print the path (i.e. it is ignored)
```

## Intended stack (confirmed in CLAUDE.md §2)

Next.js (App Router, TypeScript strict) on Vercel · Supabase (Postgres, Auth, Storage, RLS, Edge Functions) · Tailwind + shadcn/ui · recharts · next-intl (hu/en, de-ready) · Resend · Vercel Cron · OpenRouter. ORM choice (Drizzle vs supabase-js + generated types) is decided in Phase 0.

## Repository layout

```
.
├── CLAUDE.md ROADMAP.md IDEAS.md   # project docs (read CLAUDE.md first)
├── private/                        # gitignored — real-world data only
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (admin)/                # admin shell (owner)
│   │   ├── (tenant)/               # tenant shell
│   │   └── api/                    # route handlers
│   ├── components/                 # shared UI (shadcn/ui)
│   ├── lib/                        # utilities, clients, helpers
│   ├── server/                     # server actions & domain logic
│   └── db/
│       ├── schema/                 # schema-as-code
│       └── migrations/             # DB migrations
├── messages/                       # next-intl catalogs (en, hu; de-ready)
├── seed/                           # seed.demo.ts committed; seed.real.ts gitignored
├── fixtures/                       # synthetic golden-test fixtures
├── tests/
│   ├── unit/                       # Vitest (billing golden tests, RLS)
│   └── e2e/                        # Playwright happy paths
├── supabase/                       # Supabase project config / migrations
└── .github/workflows/              # CI + nightly backup
```

## Getting started

Toolchain (Next.js app, dependencies, Supabase project) is initialized in **Phase 0** per the roadmap — this scaffold currently contains structure and documentation only.
