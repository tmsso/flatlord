// Phase 4b admin analytics — the unified admin-facing event timeline per
// tenancy (IDEAS.md line 33): every recorded event in one chronological
// feed. Admin-only. Ad-hoc notes are a separate 4b bullet still blocked
// on a design decision, so they're not a source here yet.
//
// Pure merge + normalise + sort. Callers pass raw rows; the component
// renders labels via i18n, so this returns structured data, not strings.

export type TimelineEventType =
  | "statement_issued"
  | "payment_recorded"
  | "request_opened"
  | "notice_issued";

export interface TimelineEvent {
  type: TimelineEventType;
  /** "YYYY-MM-DD", normalised from a timestamp or date across all sources. */
  date: string;
  entityId: string;
  /** Admin-shell deep link, or null when the entity has no detail page. */
  href: string | null;
  /** Type-specific payload the component formats (money, enum labels, …). */
  data: Record<string, string | number | null>;
}

export interface TimelineInput {
  statements: { id: string; periodMonth: string; issuedAt: string | null; total: number }[];
  payments: { id: string; paidAt: string; amount: number; method: string }[];
  requests: { id: string; title: string; category: string; status: string; createdAt: string }[];
  notices: { id: string; title: string; type: string; createdAt: string }[];
}

const day = (s: string) => s.slice(0, 10);

// Stable tiebreak when two events share a date — most "decisive" first.
const TYPE_RANK: Record<TimelineEventType, number> = {
  notice_issued: 0,
  statement_issued: 1,
  payment_recorded: 2,
  request_opened: 3,
};

export function buildTenancyTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const s of input.statements) {
    if (!s.issuedAt) continue; // draft / never issued — not a timeline event
    events.push({
      type: "statement_issued",
      date: day(s.issuedAt),
      entityId: s.id,
      href: `/statements/${s.id}`,
      data: { periodMonth: s.periodMonth.slice(0, 10), total: s.total },
    });
  }

  for (const p of input.payments) {
    events.push({
      type: "payment_recorded",
      date: day(p.paidAt),
      entityId: p.id,
      href: null, // payments have no standalone page — they live on the statement
      data: { amount: p.amount, method: p.method },
    });
  }

  for (const r of input.requests) {
    events.push({
      type: "request_opened",
      date: day(r.createdAt),
      entityId: r.id,
      href: `/requests/${r.id}`,
      // current status carried alongside — one event per request, not a
      // second "closed" event: requests.updated_at bumps on any edit
      // (appointment date, case ref) so it's an unreliable close time.
      data: { title: r.title, category: r.category, status: r.status },
    });
  }

  for (const n of input.notices) {
    events.push({
      type: "notice_issued",
      date: day(n.createdAt),
      entityId: n.id,
      href: `/notices/${n.id}`,
      data: { title: n.title, noticeType: n.type },
    });
  }

  // Newest first; deterministic tiebreak by type then entityId.
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.type !== b.type) return TYPE_RANK[a.type] - TYPE_RANK[b.type];
    return a.entityId < b.entityId ? -1 : 1;
  });

  return events;
}
