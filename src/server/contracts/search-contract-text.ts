"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { contractSnippets } from "@/lib/contracts/contract-snippets";

const SearchContractTextSchema = z.object({
  tenancyId: z.string().uuid(),
  query: z.string().trim().min(2).max(100),
});

export interface ContractSearchHit {
  contractId: string;
  version: number;
  snippets: { before: string; match: string; after: string }[];
}

/**
 * B-16 / design/09 11: full-text search over a tenancy's contract
 * versions. `contracts.search_vector` (GIN, 'simple' config, migration
 * 0015) decides which versions match — websearch syntax, so "felmondás"
 * or "notice period" both work. Snippets around each hit are cut from
 * `document_text` in code (no ts_headline RPC needed for one tenancy's
 * handful of versions). Owner-only; RLS scopes the rows anyway.
 */
export async function searchContractText(input: { tenancyId: string; query: string }): Promise<ContractSearchHit[]> {
  const parsed = SearchContractTextSchema.parse(input);
  const supabase = await createClient();
  await requireOwnerPersonId(supabase);

  const { data, error } = await supabase
    .from("contracts")
    .select("id, version, document_text")
    .eq("tenancy_id", parsed.tenancyId)
    .textSearch("search_vector", parsed.query, { type: "websearch", config: "simple" })
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    contractId: c.id,
    version: c.version,
    snippets: contractSnippets(c.document_text ?? "", parsed.query),
  }));
}
