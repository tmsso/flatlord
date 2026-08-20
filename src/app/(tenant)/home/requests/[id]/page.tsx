import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { RequestThread, type RequestDetail, type RequestMessageRow } from "@/components/requests/request-thread";
import { TenantAttachmentsList, type TenantAttachmentRow } from "@/components/tenant-attachments-list";
import { getTranslations } from "next-intl/server";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";

export default async function TenantRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  const t = await getTranslations("attachments");

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, category, status, title, description, external_case_ref, appointment_date, created_at")
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("home/requests/[id]", requestError);
  if (!request) notFound();

  const { data: messageRows, error: messagesError } = await supabase
    .from("request_messages")
    .select("id, author_id, body, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  assertNoQueryError("home/requests/[id]/messages", messagesError);

  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, file_name, size_bytes, created_at, storage_path")
    .eq("entity_type", "request")
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);
  const { data: signedUrls } = attachmentPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(attachmentPaths, 600)
    : { data: [] };
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const detail: RequestDetail = {
    id: request.id,
    category: request.category as RequestCategory,
    status: request.status as RequestStatus,
    title: request.title,
    description: request.description,
    externalCaseRef: request.external_case_ref,
    appointmentDate: request.appointment_date,
    createdAt: request.created_at,
  };

  const messages: RequestMessageRow[] = (messageRows ?? []).map((m) => ({
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    createdAt: m.created_at,
    isOwnMessage: m.author_id === profile.personId,
  }));

  const attachments: TenantAttachmentRow[] = (attachmentRows ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    sizeBytes: a.size_bytes,
    createdAt: a.created_at,
    downloadUrl: a.storage_path ? (urlByPath.get(a.storage_path) ?? null) : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <RequestThread request={detail} messages={messages} role="tenant" />
      <TenantAttachmentsList title={t("title")} attachments={attachments} />
    </div>
  );
}
