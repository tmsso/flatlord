"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  const [hashError, setHashError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hashHandledRef = useRef(false);

  // Links from supabase.auth.admin.generateLink() have no client-side PKCE
  // code_verifier to pair with (nothing requested one), so Supabase falls
  // back to returning tokens directly in the URL hash instead of a `?code=`
  // — and a hash fragment never reaches the server, so /auth/callback's
  // route handler can't see it; this has to run client-side instead. Real
  // end-user magic-link clicks (browser calls signInWithOtp, which does
  // register a code_verifier) go through the `?code=` path in
  // /auth/callback/route.ts and never hit this. This exists for
  // admin-generated links: today's Phase 0 bootstrap, and ROADMAP Phase 5's
  // planned admin emergency-login-link feature, which will hit the exact
  // same shape.
  useEffect(() => {
    // Next dev runs effects twice (React Strict Mode) to surface exactly
    // this kind of bug: two overlapping setSession() calls for the same
    // one-time tokens raced and Chrome aborted one mid-flight
    // (net::ERR_ABORTED), silently killing the sign-in with no visible
    // error. Guard so the token exchange only ever starts once.
    if (hashHandledRef.current) return;
    const hash = window.location.hash;
    if (!hash) return;
    hashHandledRef.current = true;
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      const supabase = createClient();
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) setHashError(error.message);
          else window.location.replace("/");
        })
        .catch((err) => setHashError(err instanceof Error ? err.message : String(err)));
      return;
    }
    const description = params.get("error_description");
    if (description) queueMicrotask(() => setHashError(description.replace(/\+/g, " ")));
  }, []);

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
      {hashError && (
        <p className="text-sm text-destructive" role="alert">
          {hashError}
        </p>
      )}
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
