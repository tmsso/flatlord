import { createTranslator } from "next-intl";
import type { NoticeType } from "@/db/schema/notices";

// Same "no static message typing" situation as request-event-message.ts.
export interface NoticeIssuedMessageParams {
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  type: NoticeType;
  title: string;
}

// One-directional (admin -> tenant), unlike requests' bidirectional
// notifyOwner_*/notifyTenant_* split — every notice notification goes to
// the tenant, so there's just one template, parameterised by type so a
// formal warning's subject line reads differently from an info notice's.
export function buildNoticeIssuedMessage(params: NoticeIssuedMessageParams): { subject: string; body: string } {
  const t = createTranslator({ locale: params.locale, messages: params.messages, namespace: "notices" });
  return {
    subject: t("notify_issuedSubject", { type: t(`type_${params.type}`), title: params.title }),
    body: t("notify_issuedBody", { type: t(`type_${params.type}`), title: params.title }),
  };
}
