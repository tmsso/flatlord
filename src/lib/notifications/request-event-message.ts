import { createTranslator } from "next-intl";

// Same "no static message typing" situation as amount-due-message.ts —
// messages is typed loosely on purpose, see that file's comment.
export interface RequestEventMessageParams {
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  event: "opened" | "message" | "resolved" | "rejected" | "withdrawn";
  title: string;
  forOwner: boolean;
}

// One shared template set for both notification directions (ROADMAP
// Phase 3 item 1) — "opened"/"withdrawn" are tenant-originated (owner is
// notified), "resolved"/"rejected" are owner-originated (tenant is
// notified), "message" happens in both directions depending on who
// replied, hence the separate notifyOwner_*/notifyTenant_* key sets
// rather than one shared body per event.
export function buildRequestEventMessage(params: RequestEventMessageParams): { subject: string; body: string } {
  const t = createTranslator({ locale: params.locale, messages: params.messages, namespace: "requests" });
  const prefix = params.forOwner ? "notifyOwner" : "notifyTenant";
  return {
    subject: t(`${prefix}_${params.event}Subject`, { title: params.title }),
    body: t(`${prefix}_${params.event}Body`, { title: params.title }),
  };
}
