import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { NoticeDetail, type NoticeDetailData } from "@/components/notices/notice-detail";
import { AttachmentsSection, type AttachmentRow } from "@/components/attachments-section";
import type { NoticeType, NoticeSequence } from "@/db/schema/notices";

export default async function AdminNoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: notice, error: noticeError } = await supabase
    .from("notices")
    .select(
      "id, type, title, body, contract_clause_ref, sequence, requires_acknowledgement, acknowledged_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("notices/[id]", noticeError);
  if (!notice) notFound();

  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, file_name, size_bytes, note, created_at, storage_path")
    .eq("entity_type", "notice")
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);
  const { data: signedUrls } = attachmentPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(attachmentPaths, 600)
    : { data: [] };
  const urlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const detail: NoticeDetailData = {
    id: notice.id,
    type: notice.type as NoticeType,
    title: notice.title,
    body: notice.body,
    contractClauseRef: notice.contract_clause_ref,
    sequence: notice.sequence as NoticeSequence | null,
    requiresAcknowledgement: notice.requires_acknowledgement,
    acknowledgedAt: notice.acknowledged_at,
    createdAt: notice.created_at,
  };

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
      <NoticeDetail notice={detail} role="owner" />
      <AttachmentsSection entityType="notice" entityId={id} attachments={attachments} />
    </div>
  );
}
