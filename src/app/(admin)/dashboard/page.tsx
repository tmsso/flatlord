import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const supabase = await createClient();

  // owner_scope_statements RLS already limits this to the caller's own
  // properties. Draft statements are what the auto-draft cron produces
  // and what "one-click issue" acts on — surfacing the count here saves
  // the admin hunting through the statements list for them.
  const { data: drafts } = await supabase.from("statements").select("id").eq("status", "draft");
  const draftCount = drafts?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("draftsAwaitingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 text-sm">
          {draftCount > 0 ? (
            <>
              <p>{t("draftsAwaitingBody", { count: draftCount })}</p>
              <Button size="sm" nativeButton={false} render={<Link href="/statements" />}>
                {t("draftsAwaitingCta")}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t("draftsNoneBody")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tNav("dashboard")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("placeholder")}</CardContent>
      </Card>
    </div>
  );
}
