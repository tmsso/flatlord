import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { buildNoticeIssuedMessage } from "@/lib/notifications/notice-issued-message";
import type { NoticeType } from "@/db/schema/notices";

// Same service-role rationale as notify-request-event.ts: the admin
// caller's own RLS-scoped client can't read the tenant's auth email
// (cross-role lookup). Best-effort, never throws — a broken email send
// must not roll back the notice that already got issued (same principle
// as logAudit's failure handling). Resend is sandbox-mode-only right now
// (known, tracked separately); this just needs the send-call to execute,
// not to prove real delivery.
//
// Unlike requests (bidirectional — either side can trigger a
// notification), notices are strictly admin -> tenant, so there's no
// actorRole branch here.
export async function notifyNoticeIssued(params: { noticeId: string }) {
  try {
    const service = createServiceRoleClient();
    const { data: notice, error: noticeError } = await service
      .from("notices")
      .select("id, tenancy_id, type, title")
      .eq("id", params.noticeId)
      .maybeSingle();
    if (noticeError || !notice) {
      console.error("notifyNoticeIssued: notice not found", params.noticeId, noticeError?.message);
      return;
    }

    const { data: tenancy, error: tenancyError } = await service
      .from("tenancies")
      .select("primary_tenant_id")
      .eq("id", notice.tenancy_id)
      .maybeSingle();
    if (tenancyError || !tenancy) {
      console.error("notifyNoticeIssued: tenancy not found", notice.tenancy_id, tenancyError?.message);
      return;
    }

    const { data: tenant } = await service
      .from("persons")
      .select("contact_email")
      .eq("id", tenancy.primary_tenant_id)
      .maybeSingle();
    const tenantEmail = tenant?.contact_email as string | null | undefined;
    if (!tenantEmail) {
      console.error("notifyNoticeIssued: tenant has no contact email on file", tenancy.primary_tenant_id);
      return;
    }

    const { data: tenantProfile } = await service
      .from("profiles")
      .select("locale")
      .eq("person_id", tenancy.primary_tenant_id)
      .eq("role", "tenant")
      .maybeSingle();
    const locale = isLocale(tenantProfile?.locale) ? tenantProfile.locale : defaultLocale;
    const messages = await loadMessages(locale);
    const { subject, body } = buildNoticeIssuedMessage({
      locale,
      messages,
      type: notice.type as NoticeType,
      title: notice.title,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
      to: tenantEmail,
      subject,
      text: body,
    });
    if (sendError) console.error("notifyNoticeIssued: send failed", sendError.message);
  } catch (err) {
    console.error("notifyNoticeIssued: unexpected failure", err instanceof Error ? err.message : err);
  }
}
