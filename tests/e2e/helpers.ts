import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// Fail closed: the smoke test logs in with magic links minted by the
// service role, so it must never point at production. The allowed project
// ref is the dev one unless explicitly overridden.
const ALLOWED_REF = process.env.E2E_ALLOWED_SUPABASE_REF ?? "kqrzqbocruwafvuodatb";
const PROD_REF = "zarpjgtcwkndtmlnhmdd";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "playwright-owner-emma@flatlord.test";
export const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL ?? "playwright-tenant-a@flatlord.test";

export function devAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.includes(ALLOWED_REF) || url.includes(PROD_REF)) {
    throw new Error(`Refusing to run e2e against ${url || "(unset)"}: only the dev project (${ALLOWED_REF}) is allowed`);
  }
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (dev project service-role key)");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface Session {
  context: BrowserContext;
  page: Page;
  errors: string[];
}

/**
 * Magic-link login without email: the service role mints the link, the
 * browser follows it to /auth/callback. The link lands on
 * /login#access_token=… and the client then redirects, so wait for the
 * role's home rather than the callback.
 */
export async function login(
  browser: Browser,
  admin: SupabaseClient,
  baseURL: string,
  email: string,
  opts: { viewport?: { width: number; height: number }; locale?: "hu" | "en" } = {},
): Promise<Session> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const link = new URL(data.properties.action_link);
  link.searchParams.set("redirect_to", `${baseURL}/auth/callback`);

  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 } });
  if (opts.locale) await context.addCookies([{ name: "NEXT_LOCALE", value: opts.locale, url: baseURL }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.goto(link.toString(), { waitUntil: "commit" });
  await page.waitForURL((u) => u.pathname === "/home" || u.pathname === "/dashboard", { timeout: 90_000 });
  return { context, page, errors };
}
