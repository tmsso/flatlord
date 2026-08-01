import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PropertyCreateForm } from "@/components/property-create-form";

export default async function NewPropertyPage() {
  const t = await getTranslations("properties");
  const supabase = await createClient();

  const { data: parentCandidates } = await supabase
    .from("properties")
    .select("id, name, type")
    .in("type", ["house", "flat"])
    .order("name");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("addProperty")}</h1>
      <PropertyCreateForm parentCandidates={(parentCandidates ?? []).map((p) => ({ id: p.id, name: p.name, type: p.type }))} />
    </div>
  );
}
