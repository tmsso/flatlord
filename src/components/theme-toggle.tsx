"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// No-op subscription: this store only ever needs to distinguish "server
// snapshot" from "the value once we're actually running in the browser"
// — useSyncExternalStore's own contract (server/client snapshot split)
// is the React-recommended way to read a hydration-only signal, without
// the cascading-render risk of setState-in-effect.
const subscribeNever = () => () => {};
function useHasMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("theme");
  // next-themes can't know the persisted theme during SSR (it lives in
  // localStorage). The icon toggle itself is pure CSS (`dark:` variants
  // driven by the class next-themes' no-flash script sets before
  // hydration), so it's fine either way — but `aria-label` is computed
  // from `resolvedTheme` in JS, which is `undefined` on the server and
  // only resolves post-mount, so a returning user with a saved "dark"
  // preference got a real hydration mismatch on every page load
  // (server always guessed "light" -> "dark" label, client corrected to
  // "light" label). Deferring the label to a neutral, stable string until
  // mounted avoids that without touching the CSS-based icon swap.
  const mounted = useHasMounted();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={mounted ? (resolvedTheme === "dark" ? t("light") : t("dark")) : t("toggle")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 scale-100 dark:scale-0 transition-transform" />
      <Moon className="absolute size-4 scale-0 dark:scale-100 transition-transform" />
    </Button>
  );
}
