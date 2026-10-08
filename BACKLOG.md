# BACKLOG.md — triaged, sized work items

Concrete items with a verification bar, ordered by priority. `ROADMAP.md` says *when* (phase); this file says *what exactly* and *how you know it's done*. Loose ideas without a spec stay in `IDEAS.md`. IDs are stable (`B-nn`) so sessions, PRs and memory can reference them; keep the ID when an item ships and move it to the "Shipped" list at the bottom.

Sizes: S = under half a batch item · M = one batch item · L = more than one.

## P1 — next one or two batches

| ID | Item | Size | Origin |
|---|---|---|---|
| B-01 | **Domain purchase + wiring.** Admin buys a domain — **at Cloudflare Registrar or Porkbun, not Vercel** (Vercel's first-year price roughly doubles at renewal; Cloudflare sells at wholesale with flat renewals, ~$10.5/yr for a `.com`; neither offers `.hu`, a `.com`/`.eu`/`.app` is fine). Keep DNS at the registrar; the Vercel `A`/`CNAME` records must have Cloudflare's proxy switched **off** (Vercel terminates TLS; double-proxying loops). Session wires it as the Vercel custom domain, verifies it in Resend (DKIM/SPF), updates Supabase Auth site/redirect URLs and `NEXT_PUBLIC_APP_URL`. **Done means:** a tenant-addressed email from prod lands in a non-account inbox; the app answers on the new host; magic links redirect there. | S (after purchase) | Review 2026-09-15 — Resend sandbox is the root blocker of Phase 1 acceptance |
| B-03 | **Middleware auth without network calls.** `updateSession` calls `auth.getUser()` (a Supabase Auth HTTP call) plus a `profiles` query on **every** request. Switch to `getClaims()` (local JWT verification; needs the project's asymmetric JWT signing keys enabled in the Supabase dashboard — admin toggle, both projects) and carry `role` in the JWT via a custom access-token hook, so the proxy does zero round-trips for a valid session. Keep `getUser()` in server actions (defence in depth). **Done means:** proxy makes no network call on a warm session (log/trace); invite-revoke and sign-out paths regression-tested; RLS tests unchanged. | M | Review |
| B-04 | **Sentry free tier** (client + server + edge), DSN env already reserved in `.env.example`. Both users are non-developers; today errors only reach Vercel logs. **Done means:** a deliberate test error appears in Sentry from prod; PII scrubbing confirmed for person fields. | S | CLAUDE.md §2 — planned, never installed |
| B-28 | **Tenant write policies that don't pin other columns** (found 2026-10-08 audit, low stakes). `tenant_insert_requests` / `tenant_withdraw_requests` (`0019`) check scope and the status transition but not the other columns, so a tenant calling the REST API directly could set e.g. `external_case_ref`/`appointment_date` or change the title while withdrawing; `tenant_update_inventory_reconfirmation_items` (`0018`) has no `WITH CHECK` at all, so a tenant could write the admin-review columns. Fix the same way as `0027`: `WITH CHECK` pinning tenant-settable columns (self-referencing subquery for "unchanged", see memory on column grants). **Done means:** RLS tests show each forged write rejected and the app's own writes still accepted. | S | Long batch 2026-10-08 abuse-path audit |
| B-30 | **Dev has no metered statement lines.** Every dev statement is fixed-charge only, so the tenant home mini-chart, metered rows and rate chips can't be checked against real-shaped data on dev (B1/B2 had to use a throwaway draft). Seed one tenancy's history with verified readings + issued metered statements (`seed.demo.ts`), or extend the importer fixture onto dev. **Done means:** tenant-a's home shows the consumption mini-chart on dev. | S | Long batch 2026-10-08 |
| B-08 | **Committed Playwright smoke test.** `tests/e2e/smoke.spec.ts` + `playwright.config.ts`: log in as both roles via `auth.admin.generateLink`, visit every route, assert no `pageerror`, no console errors, no horizontal overflow at 390px for tenant routes. Run on `workflow_dispatch` + nightly against the **dev** project (secrets in GitHub), not in the PR CI (no Auth service there). **Done means:** workflow green on dev; the ad-hoc scripts sessions keep rewriting become unnecessary. | M | Review — `tests/e2e/` is empty; every session re-invents the login script |

## P2 — soon, when adjacent work touches the area

| ID | Item | Size | Origin |
|---|---|---|---|
| B-09 | **Supabase generated types.** `supabase gen types typescript` into `src/lib/supabase/database.types.ts`, wire into the three client factories. Removes the 26 `as unknown as` casts on joined selects and catches column typos at compile time. **Done means:** zero `as unknown as` in `src/`, typecheck green, generation command documented. | M | Review |
| B-11 | **`assertNoQueryError` on secondary queries.** 74 `const { data } = await supabase…` sites still drop `error`; a failing secondary query renders an empty section instead of surfacing. Apply the existing helper (`src/lib/supabase/require-row.ts`). **Done means:** grep count of `{ data } = await supabase` in `src/app` is zero. | M | IDEAS.md (moved here) |
| B-12 | **Migration-drift check.** Add a read-only step to `health-check.yml` that compares `select count(*) from drizzle.__drizzle_migrations` on prod (secret already exists for backups) with the file count under `supabase/migrations/`, failing the workflow on mismatch. Drift has recurred twice. **Done means:** a deliberate mismatch fails the run. | S | Memory `flatlord_dev_prod_migration_drift` |
| B-13 | **Move-in / move-out snapshots + handover protocol** (CLAUDE.md §3.9): a snapshot freezes inventory state + meter baselines with photos at tenancy start/end; PDF via the existing template pattern. Deferred from Phase 2, tracked nowhere until now. | M | Phase 2 scope cut |
| B-14 | **Termination mechanics & permissions lifecycle** (CLAUDE.md §3.2): notice periods both ways, immediate-termination triggers, holdover charge multiple, owner-granted permissions with revoke-at-termination — not modelled. Decide whether it's needed before Phase 5 contract drafting or stays a document-only concern. | L | Review — requirement never scheduled |
| B-15 | **Structured logging.** 84 `console.error/log` sites; once B-04 lands, route through one `log()` helper that also reports to Sentry and never logs `NEVER_LOG_KEYS` fields. | S | Review |
| B-16 | **Contract full-text search UI.** `contracts.search_vector` (GIN) exists; verify a search box exposes it in the admin contracts section; add one if not. | S | Review — index without a consumer |
| B-17 | **Dependency hygiene.** `@tanstack/react-query` is installed but unused (server components + server actions cover today's needs) — remove, or adopt deliberately for client-side refresh in the notification bell. Also review `xlsx` (importer-only, dev). | S | Review |

## P3 — later / opportunistic

| ID | Item | Size | Origin |
|---|---|---|---|
| B-20 | Tenant "More" tab (design/02 has 5 tabs with "Egyéb"): only if the header gets crowded again; today Settings is a header gear. | S | PR #34 |
| B-21 | `getUserMedia` live-preview capture (CLAUDE.md §3.4 "upgrade if worthwhile"); the `capture` attribute flow is in place. | M | Phase 1 |
| B-22 | Field editability for enum fields (`document_type` stays `read_only` until a select editor exists). | S | Phase 3 scope cut |
| B-23 | Rebuild-dev-DB note: dev's `0022` was hand-patched; a from-scratch replay of `supabase/migrations/` on dev is unverified. Do a clean rebuild of dev once, then delete this item. | S | Memory 2026-09-04 |
| B-24 | Unified `getCurrentProfile` use in the older server actions that still inline `getUser()` + `profiles` (11 call sites). | S | Code comment in `current-profile.ts` |
| B-29 | Admin tables show raw ISO dates (e.g. tenancies list `2026-03-01 – —`); format with the locale like the rest. | S | Long batch 2026-10-08 (390px pass) |
| B-31 | Meter-flow "skip photo" has no reason field (design/03 asks for one); needs a `meter_readings` column or a note field. | S | Long batch 2026-10-08 |
| B-27 | **Duplicate `MonthPicker` components.** `src/components/month-picker.tsx` (controlled `value`/`onChange`, pre-existing) and `src/components/ui/month-picker.tsx` (href-navigation based on `label`/`onPrevious`/`onNext`, added in Phase 4c's admin dashboard PR) are visually near-identical but have incompatible contracts and the same export name in different paths — a real collision risk for future imports. Consolidate to one component supporting both usage patterns (or keep two but rename one to make the split intentional and documented). **Done means:** one canonical `MonthPicker` (or two clearly-named, clearly-documented ones); every call site updated; no remaining import ambiguity. | S | Found while shipping Phase 4c dashboard (2026-09-17), advisor-flagged, deliberately out of scope for that batch |

## Shipped from this list

| ID | Item | Shipped |
|---|---|---|
| B-25 | Default-deny route classification in the proxy; a unit test fails on any unclassified route. Pre-fix, a tenant could open their own `/tenancies/<id>` and see the cumulative ledger — a confirmed D-15 breach (verified on dev). | PR #42, 2026-10-08, live. |
| B-26 | Tenants never see draft statements: query filters + migration `0026` on `statements` **and** `statement_line_items` RLS. | PR #43, 2026-10-08. `0026` pending in prod until `migrate-prod.yml` runs. |
| B-19 | Admin phone navigation drawer; content column `min-w-0` (6 of 9 pages overflowed at 390px). | PR #54, 2026-10-08, live. |
| B-02, B-10, B-18 | Parallelise per-page Supabase queries; FK/RLS-subquery index migration (`0024`); `maxDuration` on the backup + PDF routes. | PR #36, 2026-09-15. Migration `0024_add-fk-indexes.sql` applied to prod via `migrate-prod.yml` 2026-09-17. |
| B-05, B-06, B-07 | Draft statement discard (soft, partial-unique-index reflow); due-date = due_day of month after issue; historical charge names resolved at render time (web ×3 + PDF). | PR #39, 2026-09-17. Migration `0025_statements-void-draft.sql` applied to prod via `migrate-prod.yml` 2026-09-17. |
