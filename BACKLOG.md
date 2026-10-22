# BACKLOG.md — triaged, sized work items

Concrete items with a verification bar, ordered by priority. `ROADMAP.md` says *when* (phase); this file says *what exactly* and *how you know it's done*. Loose ideas without a spec stay in `IDEAS.md`. IDs are stable (`B-nn`) so sessions, PRs and memory can reference them; keep the ID when an item ships and move it to the "Shipped" list at the bottom.

Sizes: S = under half a batch item · M = one batch item · L = more than one.

## P1 — next one or two batches

| ID | Item | Size | Origin |
|---|---|---|---|
| B-04 | **Sentry free tier** (client + server + edge), DSN env already reserved in `.env.example`. Both users are non-developers; today errors only reach Vercel logs. **Done means:** a deliberate test error appears in Sentry from prod; PII scrubbing confirmed for person fields. | S | CLAUDE.md §2 — planned, never installed |

## P2 — soon, when adjacent work touches the area

| ID | Item | Size | Origin |
|---|---|---|---|
| B-09 | **Supabase generated types.** `supabase gen types typescript` into `src/lib/supabase/database.types.ts`, wire into the three client factories. Removes the 26 `as unknown as` casts on joined selects and catches column typos at compile time. **Done means:** zero `as unknown as` in `src/`, typecheck green, generation command documented. | M | Review |
| B-11 | **`assertNoQueryError` on secondary queries.** 74 `const { data } = await supabase…` sites still drop `error`; a failing secondary query renders an empty section instead of surfacing. Apply the existing helper (`src/lib/supabase/require-row.ts`). **Done means:** grep count of `{ data } = await supabase` in `src/app` is zero. | M | IDEAS.md (moved here) |
| B-49 | **Google sign-in by an uninvited account** still creates an orphan `auth.users` row (the proxy then signs it out). Gate with a Supabase Auth "before user created" hook that checks for a live invite, or accept and periodically clean up. | S | Long batch 2026-10-12 (#77 scope note) |
| B-50 | **Daily cron: prove it healthy.** The 504 of 2026-10-14 was most likely the overdue alert re-firing every day for every unpaid statement — fixed in PR #84 (once per statement, D-41) together with 10 s timeouts on Resend/Auth calls and per-phase timing logs. PR #86 (migration `0036`) adds the durable `cron_runs` log and the health-check `cron-last-run` job. **Done means:** five consecutive *scheduled* runs `ok` in `cron_runs` (the health check goes red otherwise). | S | Owner prod run 2026-10-14 |
| B-54 | **Sign-in email delivery on prod for invited users.** A second owner or a tenant signs in by magic link (or Google). Custom SMTP via Resend configured by the owner 2026-10-22 (`tmsso.com` verified); Supabase prod Auth URLs for `flatlord.tmsso.com` and a real send still to do. **Done means:** an invited non-team address receives the login link on prod. | S (config) | Long batch 2026-10-15 |
| B-55 | **A reading dated inside an already-drafted/issued month is never billed.** The engine bills a reading in its `reading_date`'s month and never recomputes a drafted/issued month; the next month's delta starts from that late reading, so the stretch between the month's billed reading and the late one is lost — for any meter (B-52 guards only the replacement case, D-46). Fix options: refuse/redate such readings at entry (tenant + admin), or carry them into the next open period. **Done means:** a test with a reading dated in an issued month shows its consumption on the next draft (or the entry is refused with a clear message). | S–M | Long batch 2026-10-23 (B-52 finding) |
| B-13 | **Move-in / move-out snapshots + handover protocol** (CLAUDE.md §3.9): a snapshot freezes inventory state + meter baselines with photos at tenancy start/end; PDF via the existing template pattern. Deferred from Phase 2, tracked nowhere until now. | M | Phase 2 scope cut |
| B-14 | **Termination mechanics & permissions lifecycle** (CLAUDE.md §3.2): notice periods both ways, immediate-termination triggers, holdover charge multiple, owner-granted permissions with revoke-at-termination — not modelled. Decide whether it's needed before Phase 5 contract drafting or stays a document-only concern. | L | Review — requirement never scheduled |
| B-15 | **Structured logging.** 84 `console.error/log` sites; once B-04 lands, route through one `log()` helper that also reports to Sentry and never logs `NEVER_LOG_KEYS` fields. | S | Review |
| B-17 | **Dependency hygiene.** `@tanstack/react-query` is installed but unused (server components + server actions cover today's needs) — remove, or adopt deliberately for client-side refresh in the notification bell. Also review `xlsx` (importer-only, dev). | S | Review |
| B-39 | **Notice compose extras from design/09 8a:** "Preview (hu/en)" before send, and a contract-clause picker fed by the parsed contract text instead of free text. **Done means:** preview renders both locales from the draft; clause picker lists clauses of the active contract. | M | Long batch 2026-10-11 (4c deviation) |
| B-40 | **Hit highlighting inside the contract PDF** (design/09 11) — today search highlights snippets from the stored text; the embedded PDF isn't marked. Needs a PDF.js viewer. | M | Long batch 2026-10-11 (4c deviation) |
| B-44 | **Taxation module** (owner request 2026-10-12; supersedes the 4b "owner income breakdown for tax" item). An **aid, not tax advice** (D-32) — a visible disclaimer says so. Per owner and tax year, record: **taxation base** — gross income (rent + tenant-reimbursed utilities/common costs) or rent only; **cost-deduction method** — fixed cost ratio (default **10%**, configurable), itemised expenses (entered as lump sums per period, with note/attachment), or none; **tax rate** (default **15%**, configurable). Report: aggregates for a chosen period (quarter / half-year / year, from the payments table — cash basis, i.e. when received), tax due for the period, and a **year-end projection** (actuals to date + scheduled rent and average utilities for the remaining months). Hungarian defaults and notes to surface in the UI (researched 2026-10-12, reconfirm against NAV at build): the 10% ratio applies to rent **plus** reimbursed utilities and then counts as all costs; the method choice must be the same for the whole tax year; advance tax (adóelőleg) is paid quarterly by the 12th of the month after the quarter → show per-quarter advance amounts and due dates; a retained/applied deposit becomes income when applied, a refunded one never does. **Open for build time** (verify, don't guess): whether a social-contribution tax (szocho) threshold applies to rental income in the current year, and whether the 2026 change moving rental income into the consolidated tax base affects the rate. Ships behind B-45, off by default. **Done means:** for a dev year with seeded payments, the yearly aggregate reconciles to the payments table to the forint; switching method/base/rate recomputes; the projection for a mid-year date equals actuals + remaining scheduled rent; quarterly advances and due dates render in both locales; PDF export. | L | Owner request 2026-10-12 |

## P3 — later / opportunistic

| ID | Item | Size | Origin |
|---|---|---|---|
| B-20 | Tenant "More" tab (design/02 has 5 tabs with "Egyéb"): only if the header gets crowded again; today Settings is a header gear. | S | PR #34 |
| B-21 | `getUserMedia` live-preview capture (CLAUDE.md §3.4 "upgrade if worthwhile"); the `capture` attribute flow is in place. | M | Phase 1 |
| B-22 | Field editability for enum fields (`document_type` stays `read_only` until a select editor exists). | S | Phase 3 scope cut |
| B-23 | Rebuild-dev-DB note: dev's `0022` was hand-patched, and dev's migrations table holds the *pre-fix* hash of `0029` (the file was corrected and re-applied by hand before prod ever saw it); a from-scratch replay of `supabase/migrations/` on dev is unverified. Do a clean rebuild of dev once, then delete this item. | S | Memory 2026-09-04 |
| B-24 | Unified `getCurrentProfile` use in the older server actions that still inline `getUser()` + `profiles` (11 call sites). | S | Code comment in `current-profile.ts` |
| B-31 | Meter-flow "skip photo" has no reason field (design/03 asks for one); needs a `meter_readings` column or a note field. | S | Long batch 2026-10-08 |

## Shipped from this list

| ID | Item | Shipped |
|---|---|---|
| B-41 | Reject with an optional note on requests (plain and field-change): note lands in the thread and is quoted in the tenant's notification; `updateRequest` only resolves now. | PR #99, 2026-10-23 (chain — owner merges). Dev-verified 12/12. |
| B-52 | One-step meter Replace (new meter linked via `replaces_meter_id`, verified final reading, old meter retired); billed-month guard (D-46). No engine/schema change. | PR #100, 2026-10-23 (chain). Dev-verified 12/12 incl. change-month draft 30 + 40 kWh. |
| B-03 | Proxy `getClaims()` (both projects ES256 → local verification), `user_role` access-token hook (`0037`, D-47) with profiles fallback, layouts in claims mode; no-profile redirect loop fixed. | PR #101, 2026-10-23 (chain; `0037` before merge; hook enabled by the owner). Dev: zero Auth calls on a warm session. |
| B-01 | Domain `tmsso.com` (Cloudflare Registrar); `flatlord.tmsso.com` on Vercel (Let's Encrypt), prod `NEXT_PUBLIC_APP_URL` and `RESEND_FROM_EMAIL` (`noreply@tmsso.com`, production only) switched, Resend domain verified. | 2026-10-22 (config, no PR). Real tenant-addressed send + magic-link redirect on the new host: with B-54. |
| B-51 | Tenancy picker (`?tenancy=`) on the dashboard and next to "Create draft"; shown with 2+ active tenancies. | PR #95, 2026-10-22. Dev-verified with two tenancies. |
| B-53 | Expected server-action failures return codes (`ActionResult`, `actionErrors` catalog); every form shows catalog text instead of `err.message`. | PR #96, 2026-10-22. Verified in a local production build (en + hu). |
| B-43 | Offboarding wizard `/offboarding` — 7-step checklist, skips with note, pro-rata credit, settle from deposit, tenant lockout (D-44, D-45). | PR #97, 2026-10-22. Dev-verified end to end (29 checks). |
| B-42 | Onboarding wizard `/onboarding` (full / flat / tenant flows), progress derived from the DB; needed two new building blocks first — charge types + meters on the unit page (PR #88) and per-tenancy rates (PR #89, D-43) — and tenant invites bound to the tenant (PR #90). | PR #91, 2026-10-15. Dev-verified against the full bar; prod sign-in depends on B-54. |
| B-48 | Requests off = no requests in the owner UI; field-change approvals stay reachable (D-40); no discrepancy request with requests off. Chevron item not reproducible. | PR #87, 2026-10-15, merged. |
| B-47 | Only a property's creator may add its first ownership row; rooms never (migration `0035`). | PR #85, 2026-10-15 — **waits for prod migration** (D-30). |
| B-12 | Migration-drift job in `health-check.yml` (migrator's own rule; behind = red, ahead = warning). | PR #75, 2026-10-12 — merged 2026-10-14. |
| B-46 | Same-day manual backup gets a time-suffixed tag. | PR #76, 2026-10-12 — merged 2026-10-14. |
| B-38 | Item ↔ facility conversion (D-31). | PR #79, 2026-10-12 — merged 2026-10-14. |
| B-45 | Per-owner module switches (D-33, D-37), migration `0033`. | PR #80, 2026-10-12 — merged + prod-migrated 2026-10-14. |
| B-28 | Tenant request insert/withdraw + reconfirmation answers pin every other column; stored-row reads via SECURITY DEFINER fns in a new `private` schema (a plain self-subquery recursed). | PR #59 (migration 0029), 2026-10-11 — merged 2026-10-12. |
| B-32 | Tenant notified (in-app + email per `meter_reading` pref) when a retake is requested. | PR #63, 2026-10-11 — merged 2026-10-12. |
| B-30 | `seed/seed.dev-metered-history.ts`: 6 months of verified readings + engine-built, paid statements for tenant-a on dev. | PR #67 (already run on dev), 2026-10-11 — merged 2026-10-12. |
| B-08 | `tests/e2e/smoke.spec.ts` + helpers (dev-only guard in code) + `pnpm e2e` + `e2e-smoke.yml`. | PR #66 (nightly workflow; needs secret `SUPABASE_DEV_SERVICE_ROLE_KEY`), 2026-10-11 — merged 2026-10-12. |
| B-33 | Selects show labels, not values; tenancy picker reads "<flat> · <tenant>". | PR #57 + #61, 2026-10-11 — merged 2026-10-12. |
| B-34 | All 16 bare Selects got label maps; guard test fails on any unlabeled Select or missing enum catalog key. | PR #57, 2026-10-11 — merged 2026-10-12. |
| B-16 | Contract search box over `search_vector` (websearch syntax) with highlighted snippets, in the design/09 11 contract screen. | PR #71, 2026-10-11 — merged 2026-10-12. |
| B-35 | Facilities = `inventory_items.kind = facility`, CHECK-pinned owner-owned (D-27). | PR #60 (migration 0030), 2026-10-11 — merged 2026-10-12. |
| B-36 | Optional affected item/facility on repair requests; unit-scoped by trigger; discrepancy requests link their item. | PR #62 (migration 0031), 2026-10-11 — merged 2026-10-12. |
| B-37 | `meterKind(code, unit)` + shared `<MeterIcon>` in meter flow, verification and chart legend. | PR #58, 2026-10-11 — merged 2026-10-12. |
| B-29 | Remaining raw ISO dates formatted. | PR #64, 2026-10-11 — merged 2026-10-12. |
| B-27 | One `MonthPicker` (`ui/month-picker`) + `addMonths` helper. | PR #65, 2026-10-11 — merged 2026-10-12. |
| B-25 | Default-deny route classification in the proxy; a unit test fails on any unclassified route. Pre-fix, a tenant could open their own `/tenancies/<id>` and see the cumulative ledger — a confirmed D-15 breach (verified on dev). | PR #42, 2026-10-08, live. |
| B-26 | Tenants never see draft statements: query filters + migration `0026` on `statements` **and** `statement_line_items` RLS. | PR #43, 2026-10-08. `0026` pending in prod until `migrate-prod.yml` runs. |
| B-19 | Admin phone navigation drawer; content column `min-w-0` (6 of 9 pages overflowed at 390px). | PR #54, 2026-10-08, live. |
| B-02, B-10, B-18 | Parallelise per-page Supabase queries; FK/RLS-subquery index migration (`0024`); `maxDuration` on the backup + PDF routes. | PR #36, 2026-09-15. Migration `0024_add-fk-indexes.sql` applied to prod via `migrate-prod.yml` 2026-09-17. |
| B-05, B-06, B-07 | Draft statement discard (soft, partial-unique-index reflow); due-date = due_day of month after issue; historical charge names resolved at render time (web ×3 + PDF). | PR #39, 2026-09-17. Migration `0025_statements-void-draft.sql` applied to prod via `migrate-prod.yml` 2026-09-17. |
