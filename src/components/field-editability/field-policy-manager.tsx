"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setFieldPolicy } from "@/server/field-editability/set-field-policy";
import { PERSON_EDITABLE_FIELDS } from "@/lib/field-editability/person-fields";
import { FIELD_POLICIES, type FieldPolicy } from "@/db/schema/field-policies-values";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ROADMAP Phase 3 item 3's "3-way policy admin UI" — scoped to entityType
// = 'person' (the concrete case built out this batch; other entity types
// stay read_only by field_policies' own default until a future batch
// wires them up the same way).
export function FieldPolicyManager({ policies }: { policies: Record<string, FieldPolicy> }) {
  const t = useTranslations("persons");
  const tf = useTranslations("fieldEditability");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingField, setSavingField] = useState<string | null>(null);

  function handleChange(fieldName: string, policy: FieldPolicy) {
    setSavingField(fieldName);
    startTransition(async () => {
      try {
        await setFieldPolicy({ entityType: "person", fieldName, policy });
        toast.success(tf("policySaved"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tf("errorGeneric"));
      } finally {
        setSavingField(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tf("policyManagerTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">{tf("policyManagerHint")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tf("fieldColumn")}</TableHead>
              <TableHead>{tf("policyColumn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERSON_EDITABLE_FIELDS.map((field) => {
              const current = policies[field.key] ?? "read_only";
              return (
                <TableRow key={field.key}>
                  <TableCell>{t(field.labelKey)}</TableCell>
                  <TableCell>
                    <Select
                      value={current}
                      onValueChange={(v) => handleChange(field.key, v as FieldPolicy)}
                      disabled={isPending && savingField === field.key}
                    >
                      <SelectTrigger id={`policy-${field.key}`} className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_POLICIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {tf(`policy_${p}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
