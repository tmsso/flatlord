import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function TenanciesPage() {
  const t = await getTranslations("tenancies");
  const supabase = await createClient();

  const { data: tenancies } = await supabase
    .from("tenancies")
    .select("id, term_start, term_end, status, properties(name), persons(given_name, family_name)")
    .order("term_start", { ascending: false });

  type PropertyRef = { name: string };
  type PersonRef = { given_name: string; family_name: string };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button size="sm" nativeButton={false} render={<Link href="/tenancies/new" />}>
          {t("addTenancy")}
        </Button>
      </div>
      {!tenancies || tenancies.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colUnit")}</TableHead>
              <TableHead>{t("colTenant")}</TableHead>
              <TableHead>{t("colTerm")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenancies.map((row) => {
              const property = row.properties as unknown as PropertyRef | PropertyRef[] | null;
              const p = Array.isArray(property) ? property[0] : property;
              const person = row.persons as unknown as PersonRef | PersonRef[] | null;
              const per = Array.isArray(person) ? person[0] : person;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/tenancies/${row.id}`} className="text-primary hover:underline">
                      {p?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{per ? `${per.given_name} ${per.family_name}` : "—"}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.term_start} – {row.term_end ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`status_${row.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
