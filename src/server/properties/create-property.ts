"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const CreatePropertySchema = z
  .object({
    type: z.enum(["house", "flat", "room"]),
    name: z.string().min(1, "nameRequired"),
    parentId: z.string().uuid().nullable(),
    addressLine: z.string().nullable().optional(),
    hrsz: z.string().nullable().optional(),
    lettingMode: z.enum(["whole", "by_room"]).nullable().optional(),
  })
  .refine((v) => v.type === "room" || v.parentId !== null || v.addressLine, {
    message: "addressRequired",
    path: ["addressLine"],
  });

export async function createProperty(input: z.infer<typeof CreatePropertySchema>) {
  const parsed = CreatePropertySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  let rootPropertyId: string;
  if (parsed.parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("properties")
      .select("root_property_id")
      .eq("id", parsed.parentId)
      .single();
    if (parentError || !parent) throw new Error("Parent property not found");
    rootPropertyId = parent.root_property_id;
  } else {
    rootPropertyId = randomUUID();
  }
  const id = parsed.parentId ? randomUUID() : rootPropertyId;

  const { error } = await supabase.from("properties").insert({
    id,
    root_property_id: rootPropertyId,
    parent_id: parsed.parentId,
    type: parsed.type,
    name: parsed.name,
    address_line: parsed.type === "room" ? null : (parsed.addressLine ?? null),
    hrsz: parsed.type === "room" ? null : (parsed.hrsz ?? null),
    letting_mode: parsed.type === "flat" ? (parsed.lettingMode ?? "whole") : null,
  });
  if (error) throw new Error(error.message);

  // Root properties auto-assign the creating admin as 100% owner (design
  // 11 shows the owner chip pre-filled, not an optional pick-someone-else
  // step) — and this isn't just a UX nicety: without an ownership row,
  // owner_scope_properties' SELECT policy has nothing to match against,
  // so the property is invisible to everyone (including its own creator)
  // the moment this call returns. Confirmed the hard way via Playwright:
  // a property created without an owner 404s immediately after redirect.
  // Additional co-owners are added afterward via the detail page.
  if (!parsed.parentId) {
    const { error: ownershipError } = await supabase.from("property_ownership").insert({
      property_id: id,
      person_id: personId,
      percentage: "100",
    });
    if (ownershipError) throw new Error(ownershipError.message);
  }

  await logAudit(supabase, {
    entityType: "property",
    entityId: id,
    actorId: personId,
    action: "create",
    after: {
      type: parsed.type,
      name: parsed.name,
      parentId: parsed.parentId,
      addressLine: parsed.addressLine,
      hrsz: parsed.hrsz,
      lettingMode: parsed.lettingMode,
    },
  });

  return { id };
}
