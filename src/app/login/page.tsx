import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("tagline")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === "not_invited" && (
            <p className="text-sm text-destructive" role="alert">
              {t("errorNotInvited")}
            </p>
          )}
          {error === "auth_failed" && (
            <p className="text-sm text-destructive" role="alert">
              {t("errorGeneric")}
            </p>
          )}
          <LoginForm />
          <div className="border-t border-border pt-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">{t("privateNote")}</p>
            <p className="text-xs text-muted-foreground">{t("roleNote")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
