# Flatlord health report — 2026-09-15

Full-repo review (Fable-grade) covering design choices, roadmap consistency, stack, code quality, delivered features, UI fidelity, performance, CI/CD and component/subscription choices. Evidence: the whole `src/` tree, all 24 migrations, CI workflows, live prod headers, headless-Playwright screenshots of the dev app next to the design mockups, `pnpm lint`/`typecheck`, and PR #33's green CI.

## Verdict

**The engineering core is in good shape; the product surface is not where the brief says it should be.** The billing engine, RLS model, migrations, i18n and backup story are solid and well-tested (276 tests, RLS isolation against a real Postgres in CI, golden tests to the forint). Two things are off, and both are fixable without changing direction:

1. **Performance has one dominant, cheap cause.** The Supabase project is in `eu-west-1`; Vercel ran the app's functions in `iad1` (US East), and pages make 10–15 *sequential* database calls. Every navigation paid roughly 15 transatlantic round-trips. PR #34 pins functions to `fra1`; parallelising the queries is the next step.
2. **The UI never got the design.** The tokens were ported faithfully, but the component layer stayed on shadcn's default "base-nova" look (faint rings, no shadows), and the key screens were built as functional stacks rather than the designed pages. The admin dashboard is two placeholder cards. "Everything looks flat" is accurate, and it is a scope gap, not a taste gap — no roadmap item ever tracked "port the mockups".

## Scorecard

| Area | Grade | One line |
|---|---|---|
| Architecture & schema | A− | Effective-dated, property-scoped, immutable statements, RLS everywhere; 27 tables, 134 policies. |
| Billing correctness | A | Pure engine + golden tests; 32 real months verified. One semantic wrinkle (D-05). |
| Code quality | B | Consistent, well-commented, zod at boundaries; but 26 unsafe casts on joins, 74 dropped query errors, 0 parallel queries. |
| Tests & CI | B+ | Strong unit/RLS/CI; no committed e2e; every session re-writes the same Playwright login. |
| Feature coverage vs CLAUDE.md | B+ | Nearly all of §3 shipped; gaps: handover snapshots, termination/permissions model, Sentry. |
| UI vs design brief | D | Tokens yes, components and screens no. Real mobile bugs in the tenant shell (fixed in PR #34). |
| Performance | C → B after PR #34 | Wrong region + sequential queries + per-request Auth call. |
| Roadmap & docs | C → A after this pass | 32 KB plan/status hybrid; gates suppressed thrice; shipped history buried the open work. |
| Ops & data ownership | A | Nightly backups to releases, tested restore, health check, self-host runbook. |
| Stack fit | B+ | Right choices; Drizzle underused, TanStack unused, Sentry missing, shadcn default styling fights the brief. |

## Findings by area

### 1. Design choices & architecture

- **Sound.** Contracts as version chains, rent as effective-dated schedules, deposit as a ledger, statements as immutable snapshots with adjustment lines, field-level editability with audit, everything keyed by `property_id`/`tenancy_id`. Multi-property later is a data change, as intended.
- **ORM split is right but was never written down.** Drizzle does schema-as-code, migrations and the backup dump; supabase-js does all app I/O so RLS stays in the path. Recorded now as D-01. The cost of that split is untyped joins (B-09 fixes it with generated types, no ORM change).
- **Auth in the request path is expensive.** `src/lib/supabase/middleware.ts` calls `auth.getUser()` (an HTTP call to Supabase Auth) plus a `profiles` query on every request. `getClaims()` verifies the JWT locally and the role can ride in the token (B-03).
- **No indexes beyond four.** Every FK and every RLS-subquery column is unindexed. Irrelevant at 32 statements, cheap to fix before it matters (B-10).
- **A draft can wedge a month.** No discard/regenerate for drafts; auto-draft made this more likely (B-05).

### 2. Roadmap consistency

- **Internal:** `ROADMAP.md` had become a plan-plus-status log with paragraphs of history inside bullets; the handoff note said "recreate the design pixel-perfectly" but no item tracked it, so `/next-batch` passes correctly never picked it. The "Accepted" gate was suppressed at 1→2, 3→4 and for the 4a/4b split; no phase was ever Accepted. That ritual is not doing work — proposal D-04 replaces it with an admin-actions checklist.
- **Against CLAUDE.md:** §3.1–3.11 are substantially delivered. Not delivered and previously untracked: §3.9 move-in/out snapshots + handover protocol (B-13); §3.2 termination mechanics, holdover charge, owner-granted permissions lifecycle (B-14); §2 Sentry (B-04); §6 Playwright happy paths (B-08); the `tsvector` search has an index but no visible UI (B-16). §3.11's WhatsApp deep link, §4 i18n (554 keys, perfect hu/en parity), §3.10 backups: done.
- **Design-time requirements** (`design/README.md` "Functional features added during design"): 1–5, 7, 9 delivered; 6 (access matrix) correctly deferred to Phase 5; 8 (AI slot) partially — the columns exist, the verification screen doesn't render the slot.

### 3. Stack appropriateness

| Piece | Verdict |
|---|---|
| Next.js 16 / React 19 / Tailwind 4 | Current, fine. `proxy.ts` is Next 16's middleware file — already handled. |
| shadcn v4 "base-nova" on Base UI | Modern and accessible, but its default styling *is* the borderless-flat look the brief rejects. Keep the primitives, restyle them to the tokens (D-17). Started with `Card` in PR #34. |
| Supabase (free tier, `eu-west-1`) | Fine for this scale. Latency complaints were the region mismatch, not Supabase. Free-tier pause is handled by the keep-alive Action. |
| Drizzle | Underused (schema + migrations + backup only) but that's the right shape here. |
| TanStack Query | Installed, unused. Remove or adopt deliberately (B-17). |
| Vitest + real Postgres in CI | Excellent. |
| Playwright | Available, used ad hoc every session, nothing committed (B-08). |
| Resend | Correct choice; blocked on a verified domain, not on code. |
| Sentry | Planned, never installed (B-04). |
| @react-pdf, unpdf, archiver | Fit; the Vercel file-tracing gotcha is documented. |

### 4. Code quality

- **Good:** consistent module layout (`lib/` pure logic, `server/` actions, `components/`), zod on every boundary, RLS-first with defence-in-depth checks, comments explain *why* (often citing the roadmap line), i18n discipline, privacy discipline (no real data found outside `/private`).
- **Debt (all in `BACKLOG.md`):** 26 `as unknown as` casts for joined selects; 74 `{ data }`-only destructures dropping `error`; 84 raw `console.*` sites; 0 `Promise.all`; 11 server actions still inline the `getUser()` + `profiles` lookup instead of `getCurrentProfile`. Lint was one warning (fixed). Typecheck clean.
- **Migrations:** numbered SQL, hand-written policies with rationale comments, the enum-in-transaction and column-GRANT gotchas both recorded. Dev's `0022` was hand-patched, so dev is not reproducible from files alone (B-23).

### 5. Implemented features

Everything in `docs/DELIVERY-LOG.md`. Highlights: full billing cycle with golden parity; camera meter flow; contract chain + heuristic parsing; deposit ledger; attachments; declaration PDF; inventory + reconfirmation campaigns; requests; notices with formal-warning sequence; field editability with approval flow; notification centre; daily cron with all seven reminder shapes + auto-draft; statement PDF; backups with tested restore. Open PR #33 adds the cumulative ledger + timeline.

### 6. UI vs the design brief

Screenshots taken at 1440 (admin) and 390 (tenant) against the dev project, next to `design/04`, `05`, `02`:

- **Admin dashboard:** two placeholder cards vs. eight designed widgets (alert bar, property card, cycle stepper, outstanding, statements table, attention queue, two charts). The monthly workflow the design centres on has no home page.
- **Cards everywhere:** `ring-1 ring-foreground/10`, no shadow, 12px radius. The brief asks for 1px borders, subtle shadows, 8px. Fixed at the primitive in PR #34; every card in the app changed with it.
- **Nav:** text-only, no active state, no logo — the owner's 2026-08-03 complaint. Fixed in PR #34 (icons, `aria-current` highlight, logo tile).
- **Tenant shell at 390px, real bugs:** six text tabs overlapped; the header clipped "Kijelentkezés"; the notification panel ran off-screen. Fixed in PR #34 (five tabs per `design/02`, icon-only bell/sign-out, viewport-pinned panel), verified by measuring `scrollWidth` in Playwright.
- **Statement detail:** functional, but line items are flat grey rows, no grouping into fixed/metered/adjustments, no delivery log, no history. Historical charge names show as raw English in the HU UI ("Rent", "Common cost") — known, D-07.
- **What's right:** tokens, fonts (IBM Plex with diacritics), status pills with icon + label, dark mode with warm greys, lifecycle stepper, month picker.

Phase 4c in `ROADMAP.md` is the fix, ordered so the component layer lands first.

### 7. Performance

Measured facts:

| Fact | Evidence |
|---|---|
| Supabase region `eu-west-1` | pooler host in `.env.local` |
| Vercel functions in `iad1`, edge in `fra1` | `x-vercel-id: fra1::iad1::…` on a prod response |
| Sequential DB calls per page | tenant home 14, `properties/[id]` 11, `tenancies/[id]` 8, `meters/[tenancyId]` 7, + 1 in the layout + 2 in the proxy |
| Prod cold TTFB / warm | 2.46 s / 0.25–0.43 s for `/login` (unauthenticated, no DB) |

Each transatlantic round-trip is on the order of 80–100 ms, so an authenticated page paid 1–2 s of pure network wait before rendering. After `fra1` the same round-trips are single-digit milliseconds. Remaining levers, in order: parallelise queries (B-02), drop the per-request Auth call (B-03), indexes (B-10). Supabase Pro compute is **not** the lever.

### 8. CI/CD and verification

- **Strong:** `ci.yml` runs lint, typecheck, a real Supabase Postgres with all migrations, the demo seed, `next build`, and the full test suite on every PR. Nightly backup, health check, keep-alive, manual prod migration, restore-drill reminder all exist.
- **Gaps:** no committed e2e; no drift check between repo migrations and prod (recurred twice — B-12); preview URLs are SSO-gated so preview click-throughs need the dev server instead.
- **"Gated to a real-life pass":** these were being carried as phase gates but are admin actions — `CRON_SECRET`, a Resend domain, the Phase 1 real run, the Sheet retirement, the deposit backfill, formal sign-offs. They are now one checklist at the top of `ROADMAP.md`; nothing in engineering waits on them.

### 9. Components, subscriptions, alternatives

Where a paid tier or a swap would actually help, and where it wouldn't:

| Option | Cost | Recommendation |
|---|---|---|
| **A domain** | ~€10–15/yr | **Yes, now.** The only purchase that unblocks something (Resend production sending → real tenant email → Phase 1 acceptance), plus a proper URL for Google OAuth branding and the tenant's bookmark. |
| Vercel Pro | $20/mo | Not needed. Hobby allows the `fra1` region, one daily cron, 100 GB bandwidth. Would matter for sub-daily crons, team seats, or long functions — set `maxDuration` (B-18) first. |
| Supabase Pro | $25/mo | Not needed. Buys no-pause (keep-alive already covers it), managed daily backups/PITR (own nightly backup exists), more compute (not the bottleneck). Revisit when a second owner/property arrives. |
| Sentry | free | **Yes** (B-04). |
| Paid UI kits (Tailwind Plus, shadcn blocks, admin templates) | $149–299 | No. The design handoff already is the kit; porting the mockups is the work, and a template would pull the look back toward generic dashboards. |
| Radix-based shadcn instead of Base UI | free | No. Same styling problem, migration cost for nothing. |
| OpenRouter | pay-as-you-go | Fine for Phase 5; pennies. |
| Model tiers for sessions | — | Sonnet/Opus batches are fine with the new doc structure; reserve Fable-grade for periodic reviews like this one. |

## Decisions needed (admin)

1. **D-05 due-date semantics** — a statement for August issued on 20 Sep tells the tenant "due 5 Aug". Options: keep; due on `due_day` of the month *after issue* (recommended); issue date + N days. Historical months are untouched either way.
2. **D-06 ad-hoc notes** — admin-only, or per-note tenant visibility? Audited edits? (Recommended: admin-only v1 with a `visible_to_tenant` flag defaulting false; audited via `logAudit()`.)
3. **D-07 historical charge names** — resolve display labels at render time from `charge_types.code` (recommended) rather than editing issued rows.
4. **Confirm D-04** (drop formal phase gates for the admin checklist), **D-08** (icons + active state, no per-section accent colours), **D-13** (`fra1`, in PR #34), **D-17** (restyle shadcn primitives, don't swap), **D-19** (no subscriptions; buy a domain).
5. **Phase 4c ordering** — do the UI fidelity pass before finishing 4b (tax report, ad-hoc notes)? Recommended: yes, 4c items 1–2 next, because the owner's stated concern is the look and 4b's remaining items are blocked on decisions anyway.

## What this pass changed

- **PR #34 (code, small):** Vercel `fra1` region; `Card` border/shadow/radius; nav icons + active state + logo; tenant mobile shell fixes; lint warning. Verified with lint/typecheck and headless Playwright at 1440/390, both themes.
- **This docs PR:** `ROADMAP.md` rewritten to open work with "Done means" lines and a new Phase 4c; `BACKLOG.md` (24 sized items); `docs/DECISIONS.md` (20 decisions, 3 open); `docs/DELIVERY-LOG.md` (history moved out of the roadmap); `docs/NEXT-BATCH.md`; `IDEAS.md` pruned; `README.md` and `CLAUDE.md` docs map refreshed.
- **Not touched:** PR #33 (green, ready to merge — admin's call), the stale remote branch `phase-4/scheduled-reconfirmation` (merged; safe to delete).
