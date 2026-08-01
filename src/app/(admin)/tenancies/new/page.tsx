import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TenancyCreateForm } from "@/components/tenancy-create-form";

export default async function NewTenancyPage() {
  const t = await getTranslations("tenancies");
  const supabase = await createClient();

  const { data: units } = await supabase
    .from("properties")
    .select("id, name, type")
    .in("type", ["flat", "room"])
    .order("name");
  const { data: persons } = await supabase.from("persons").select("id, given_name, family_name").order("family_name");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("addTenancy")}</h1>
      <TenancyCreateForm
        units={(units ?? []).map((u) => ({ id: u.id, name: u.name, type: u.type }))}
        persons={(persons ?? []).map((p) => ({ id: p.id, name: `${p.given_name} ${p.family_name}` }))}
      />
    </div>
  );
}
