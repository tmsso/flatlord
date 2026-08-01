import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PropertyTree, type PropertyTreeNode } from "@/components/property-tree";
import { Button } from "@/components/ui/button";

export default async function PropertiesPage() {
  const t = await getTranslations("properties");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("properties")
    .select("id, parent_id, root_property_id, type, name, hrsz, active")
    .order("root_property_id")
    .order("parent_id", { nullsFirst: true });

  const nodes: PropertyTreeNode[] = (rows ?? []).map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    type: r.type,
    name: r.name,
    hrsz: r.hrsz,
    active: r.active,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button size="sm" nativeButton={false} render={<Link href="/properties/new" />}>
          {t("addProperty")}
        </Button>
      </div>
      <PropertyTree nodes={nodes} />
    </div>
  );
}
