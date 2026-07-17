import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const t = await getTranslations("nav");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Admin shell placeholder — properties, tenancies and billing data land
        here in later phases.
      </CardContent>
    </Card>
  );
}
