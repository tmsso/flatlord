import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function PersonsPage() {
  const t = await getTranslations("persons");
  const supabase = await createClient();

  const { data: persons } = await supabase
    .from("persons")
    .select("id, given_name, family_name, document_number, dob")
    .order("family_name");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button size="sm" nativeButton={false} render={<Link href="/persons/new" />}>
          {t("newPerson")}
        </Button>
      </div>
      {!persons || persons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex max-w-md flex-col gap-2">
          {persons.map((p) => (
            <Link
              key={p.id}
              href={`/persons/${p.id}`}
              className="flex items-center justify-between rounded-md border border-border bg-card p-2.5 text-sm hover:bg-muted"
            >
              <span className="font-medium">
                {p.given_name} {p.family_name}
              </span>
              {!p.document_number && !p.dob && <span className="text-xs text-muted-foreground">{t("nameOnly")}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
