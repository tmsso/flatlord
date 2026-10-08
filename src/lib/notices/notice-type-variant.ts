import type { NoticeType } from "@/db/schema/notices";

// Badge variant per notice type, shared by the notices list and the
// tenant home's notices strip (design/02 shows "info" in the info tint).
export const NOTICE_TYPE_VARIANT: Record<NoticeType, "info" | "outline" | "warning" | "destructive"> = {
  info: "info",
  house_rule: "outline",
  payment_reminder: "warning",
  late_payment: "destructive",
  formal_warning: "destructive",
  contract: "info",
};
