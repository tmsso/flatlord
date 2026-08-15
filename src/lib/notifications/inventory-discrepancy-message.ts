import { createTranslator } from "next-intl";

// Same "no static message typing" situation as amount-due-message.ts —
// messages is typed loosely on purpose, see that file's comment.
export interface InventoryDiscrepancyMessageParams {
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  itemTitle: string;
  tenantNote: string | null;
}

export function buildInventoryDiscrepancyMessage(params: InventoryDiscrepancyMessageParams): {
  subject: string;
  body: string;
} {
  const t = createTranslator({ locale: params.locale, messages: params.messages, namespace: "inventory" });
  const lines = [
    t("discrepancyEmailIntro", { item: params.itemTitle }),
    params.tenantNote ? t("discrepancyEmailNote", { note: params.tenantNote }) : null,
  ].filter((line): line is string => Boolean(line));

  return {
    subject: t("discrepancyEmailSubject", { item: params.itemTitle }),
    body: lines.join("\n\n"),
  };
}
