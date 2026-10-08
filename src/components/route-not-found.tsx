import { getTranslations } from "next-intl/server";
import { ErrorState } from "@/components/error-state";

// Body for every not-found.tsx: rendered when a page calls notFound()
// (e.g. a statement id the caller can't see). Unknown URLs never get
// here for a signed-in user — the proxy redirects unclassified paths.
export default async function RouteNotFound() {
  const t = await getTranslations("errors");
  return <ErrorState code="404" title={t("notFoundTitle")} body={t("notFoundBody")} homeLabel={t("home")} />;
}
