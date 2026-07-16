import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function TenantHomePage() {
  const t = await getTranslations("nav");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Tenant shell placeholder — amount due, meter submission and notices
        land here in later phases.
      </CardContent>
    </Card>
  );
}
