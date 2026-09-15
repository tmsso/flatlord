import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { signOut } from "@/server/auth/sign-out";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SignOutButton() {
  const t = await getTranslations("common");
  return (
    <form action={signOut}>
      {/* Icon-only below sm: the tenant header at 390px otherwise clips the
          Hungarian label ("Kijelentkezés"); the accessible name stays. */}
      <button
        type="submit"
        aria-label={t("signOut")}
        title={t("signOut")}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:size-8 max-sm:px-0")}
      >
        <LogOut className="size-4 sm:hidden" />
        <span className="max-sm:sr-only">{t("signOut")}</span>
      </button>
    </form>
  );
}
