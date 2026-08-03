import { createTranslator } from "next-intl";

// Single template shared by both delivery channels (CLAUDE.md §3.11:
// "Amount-due message template: total, payment methods, due date, portal
// link — bilingual") — email and the wa.me deep link must say the same
// thing, just delivered differently.
//
// messages is typed as `any` deliberately: next-intl only allows
// createTranslator's t() to take an interpolation-values argument when it
// can see each message's literal ICU string at the type level (via
// TypeScript's global IntlMessages augmentation, which this repo doesn't
// use — see src/i18n/request.ts, also untyped). Typed as
// AbstractIntlMessages (plain `string` values, no literal content),
// every t("key", {...}) call below fails to typecheck even though it's
// correct at runtime — same "no static message typing" situation as
// every other t() call in this codebase.
export interface AmountDueMessageParams {
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  tenantName: string;
  amount: string;
  dueDate: string;
  paymentInstructions: string | null;
  portalUrl: string;
}

export function buildAmountDueMessage(params: AmountDueMessageParams): { subject: string; body: string } {
  const t = createTranslator({ locale: params.locale, messages: params.messages, namespace: "statements" });
  const lines = [
    t("amountDueMessageGreeting", { name: params.tenantName }),
    t("amountDueMessageAmount", { amount: params.amount }),
    t("amountDueMessageDueDate", { date: params.dueDate }),
    params.paymentInstructions
      ? t("amountDueMessagePaymentMethods", { instructions: params.paymentInstructions })
      : null,
    t("amountDueMessagePortalLink", { url: params.portalUrl }),
  ].filter((line): line is string => Boolean(line));

  return {
    subject: t("amountDueEmailSubject"),
    body: lines.join("\n\n"),
  };
}
