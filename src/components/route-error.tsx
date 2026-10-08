"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";

// Error boundary body for app/error.tsx and the (admin)/(tenant) group
// boundaries — the group ones keep the nav shell around the error.
// `digest` is the server-side error id Next attaches in production (the
// message itself is redacted there); showing it gives a non-developer
// something concrete to send that matches the Vercel log line.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      code="500"
      title={t("errorTitle")}
      body={t("errorBody")}
      reference={error.digest ? t("reference", { code: error.digest }) : undefined}
      homeLabel={t("home")}
      action={<Button onClick={reset}>{t("retry")}</Button>}
    />
  );
}
