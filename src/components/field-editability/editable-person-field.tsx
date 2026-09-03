"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { submitFieldEdit } from "@/server/field-editability/submit-field-edit";
import { maskId } from "@/lib/format/mask-id";
import type { FieldPolicy } from "@/db/schema/field-policies-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface EditablePersonFieldProps {
  fieldKey: string;
  label: string;
  value: string | null;
  policy: FieldPolicy;
  inputType: "text" | "date" | "email";
  masked?: boolean;
  // Present when the tenant already has an open approval_required
  // request pending for this exact field — CLAUDE.md §3.5's
  // approval_required flow allows only one at a time (enforced server-side
  // in submit-field-edit.ts; this is just the matching UI affordance).
  pendingNewValue?: string | null;
}

// One row per person field on the tenant's own profile card (CLAUDE.md
// §3.5's 3-way switch): read_only renders plain text, free opens an
// inline editor that applies immediately, approval_required opens the
// same editor but routes through a pending change request instead.
export function EditablePersonField({ fieldKey, label, value, policy, inputType, masked, pendingNewValue }: EditablePersonFieldProps) {
  const tf = useTranslations("fieldEditability");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const displayValue = masked ? (maskId(value) ?? "—") : (value ?? "—");

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await submitFieldEdit({
          fieldName: fieldKey,
          value: draft.trim() || null,
          note: policy === "approval_required" ? note.trim() || null : undefined,
        });
        toast.success(result.applied ? tf("editApplied") : tf("editSubmittedForApproval"));
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tf("errorGeneric"));
      }
    });
  }

  if (pendingNewValue !== undefined) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span>{displayValue}</span>
          <Badge variant="outline" title={tf("pendingChangeTooltip", { value: masked ? (maskId(pendingNewValue) ?? "—") : (pendingNewValue ?? "—") })}>
            {tf("pendingApproval")}
          </Badge>
        </div>
      </div>
    );
  }

  if (policy === "read_only" || !editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span>{displayValue}</span>
          {policy !== "read_only" && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {tf("edit")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input type={inputType} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={isPending} />
      {policy === "approval_required" && (
        <Input placeholder={tf("noteLabel")} value={note} onChange={(e) => setNote(e.target.value)} disabled={isPending} />
      )}
      <div className="flex items-center gap-2 self-end">
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setEditing(false)}>
          {tf("cancel")}
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
          {tf("save")}
        </Button>
      </div>
    </div>
  );
}
