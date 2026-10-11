import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

// Shared route-group loading state (Next's loading.tsx): a page-header bar
// plus card-shaped blocks, so navigation shows structure instead of a
// blank pane while server components fetch.
export async function RouteLoading({ variant }: { variant: "admin" | "tenant" }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-7 w-48" />
      {variant === "admin" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-72" />
        </>
      ) : (
        <>
          <Skeleton className="h-36" />
          <Skeleton className="h-12" />
          <Skeleton className="h-48" />
        </>
      )}
    </div>
  );
}
