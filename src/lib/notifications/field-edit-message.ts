import { createTranslator } from "next-intl";

// Same "no static message typing" situation as amount-due-message.ts —
// messages is typed loosely on purpose, see that file's comment.
export interface FieldEditMessageParams {
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  fieldLabel: string;
  personName: string;
}

// `free`-policy edits only (ROADMAP Phase 3 item 3) — the approval_required
// path reuses requests' own notifyOwner_opened/notifyTenant_resolved
// templates instead, since it's a real request under the hood.
export function buildFieldEditMessage(params: FieldEditMessageParams): { subject: string; body: string } {
  const t = createTranslator({ locale: params.locale, messages: params.messages, namespace: "persons" });
  return {
    subject: t("notifyOwner_fieldEditSubject", { field: params.fieldLabel }),
    body: t("notifyOwner_fieldEditBody", { field: params.fieldLabel, name: params.personName }),
  };
}
