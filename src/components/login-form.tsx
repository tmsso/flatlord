"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { sendMagicLink } from "@/server/auth/send-magic-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGoogle() {
    const supabase = createClient();
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await sendMagicLink({ email });
      setSent(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleGoogle}
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        {t("google")}
      </button>
      <p className="text-xs text-muted-foreground -mt-2">{t("googleNote")}</p>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">{t("or")}</span>
        <Separator className="flex-1" />
      </div>

      {sent ? (
        <p className="text-sm text-success">{t("magicLinkSent")}</p>
      ) : (
        <form onSubmit={handleMagicLinkSubmit} className="flex flex-col gap-2">
          <Label htmlFor="email">{t("magicLinkLabel")}</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={isPending}
            className={cn(buttonVariants({ variant: "default" }), "w-full mt-1")}
          >
            {t("magicLinkSubmit")}
          </button>
          <p className="text-xs text-muted-foreground">{t("magicLinkNote")}</p>
        </form>
      )}
    </div>
  );
}
