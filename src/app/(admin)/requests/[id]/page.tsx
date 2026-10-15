import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { RequestThread, type RequestDetail, type RequestMessageRow } from "@/components/requests/request-thread";
import { AttachmentsSection, type AttachmentRow } from "@/components/attachments-section";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { getOwnerModules } from "@/server/modules/get-modules";
import { isFieldApprovalRequest } from "@/lib/requests/is-field-approval";

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, category, status, title, description, external_case_ref, appointment_date, created_at, change_payload, inventory_items(title, kind)")
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("requests/[id]", requestError);
  if (!request) notFound();
  // B-48: with the requests module off only field-change approvals open
  // (D-40); every other request is hidden, data kept (D-33).
  if (!isFieldApprovalRequest(request) && !(await getOwnerModules(supabase, profile.userId)).has("requests")) notFound();

  const { data: messageRows, error: messagesError } = await supabase
    .from("request_messages")
    .select("id, author_id, body, created_at, persons(given_name)")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  assertNoQueryError("requests/[id]/messages", messagesError);

  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, file_name, size_bytes, note, created_at, storage_path")
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
    changePayload: request.change_payload as RequestDetail["changePayload"],
    affectedItem: (() => {
      const ref = request.inventory_items as unknown as { title: string; kind: string } | { title: string; kind: string }[] | null;
      const item = Array.isArray(ref) ? ref[0] : ref;
      return item ? { title: item.title, kind: item.kind as "item" | "facility" } : null;
    })(),
  };

  const messages: RequestMessageRow[] = (messageRows ?? []).map((m) => ({
    id: m.id,
    authorId: m.author_id,
    body: m.body,
    createdAt: m.created_at,
    isOwnMessage: m.author_id === profile.personId,
    authorName: (() => {
      const ref = m.persons as unknown as { given_name: string } | { given_name: string }[] | null;
      return (Array.isArray(ref) ? ref[0] : ref)?.given_name ?? null;
    })(),
  }));

  const attachments: AttachmentRow[] = (attachmentRows ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    sizeBytes: a.size_bytes,
    note: a.note,
    createdAt: a.created_at,
    downloadUrl: a.storage_path ? (urlByPath.get(a.storage_path) ?? null) : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <RequestThread request={detail} messages={messages} role="owner" />
      <AttachmentsSection entityType="request" entityId={id} attachments={attachments} />
    </div>
  );
}
