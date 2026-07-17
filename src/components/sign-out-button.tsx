import { getTranslations } from "next-intl/server";
import { signOut } from "@/server/auth/sign-out";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function SignOutButton() {
  const t = await getTranslations("common");
  return (
    <form action={signOut}>
      <button type="submit" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        {t("signOut")}
      </button>
    </form>
  );
}
