"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { inviteTenant } from "@/server/tenancies/invite-tenant";
import type { TenantAccess } from "@/server/tenancies/get-tenant-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Portal access for a tenancy's primary tenant: shows whether they can
// sign in, and invites them bound to their person record. No email is
// sent by the app — the owner relays the copyable instruction (Resend is
// sandbox-only until a domain is verified, B-01).
export function TenantAccessCard({
  tenancyId,
  tenantName,
  defaultEmail,
  access,
  loginUrl,
}: {
  tenancyId: string;
  tenantName: string;
  defaultEmail: string | null;
  access: TenantAccess;
  loginUrl: string;
}) {
  const t = useTranslations("tenantAccess");
  const format = useFormatter();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(access.kind === "none");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setError(null);
    startTransition(async () => {
      try {
        const result = await inviteTenant({ tenancyId, email });
        if (!result.ok) return setError(t("invalidEmail"));
        setShowForm(false);
        router.refresh();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(t("message", { url: loginUrl, email }));
      toast.success(t("copied"));
    } catch {
      toast.error(t("errorGeneric"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("title")}</CardTitle>
          {access.kind === "active" && <Badge variant="secondary">✓</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-[13px]">
        {access.kind === "active" && <p>{t("active", { name: tenantName })}</p>}
        {access.kind === "invited" && (
          <>
            <p>{t("invited", { email: access.email, date: format.dateTime(new Date(access.expiresAt), { dateStyle: "medium" }) })}</p>
            <p className="text-muted-foreground">{t("howTo", { name: tenantName, url: loginUrl, email: access.email })}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => copy(access.email)}>
                {t("copy")}
              </Button>
              {!showForm && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(true)}>
                  {t("reinvite")}
                </Button>
              )}
            </div>
          </>
        )}
        {access.kind === "none" && <p>{t("none", { name: tenantName })}</p>}
        {access.kind !== "active" && showForm && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="tenant-invite-email">{t("emailLabel")}</Label>
              <Input
                id="tenant-invite-email"
                name="email"
                type="email"
                required
                defaultValue={(access.kind === "none" ? access.lastEmail : access.email) ?? defaultEmail ?? ""}
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {t("invite")}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
