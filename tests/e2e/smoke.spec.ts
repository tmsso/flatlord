import { expect, test } from "@playwright/test";
import { devAdmin, login, OWNER_EMAIL, TENANT_EMAIL } from "./helpers";

// B-08: every route for both roles × both locales — HTTP 200, no page or
// console errors, and (tenant, 390px) no horizontal page overflow. The
// route-sweep each batch used to rewrite by hand, committed once.
const admin = devAdmin();

async function fixtureIds() {
  const { data: tenantProfile } = await admin.auth.admin
    .listUsers({ perPage: 1000 })
    .then((r) => ({ data: r.data.users.find((u) => u.email === TENANT_EMAIL) }));
  if (!tenantProfile) throw new Error(`dev fixture user ${TENANT_EMAIL} not found`);
  const { data: profile } = await admin.from("profiles").select("person_id").eq("id", tenantProfile.id).single();
  const { data: tenancy } = await admin
    .from("tenancies")
    .select("id")
    .eq("primary_tenant_id", profile!.person_id)
    .eq("status", "active")
    .single();
  const { data: statement } = await admin
    .from("statements")
    .select("id")
    .eq("tenancy_id", tenancy!.id)
    .neq("status", "draft")
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { tenancyId: tenancy!.id as string, statementId: (statement?.id as string | undefined) ?? null };
}

for (const locale of ["hu", "en"] as const) {
  test(`owner routes render cleanly (${locale})`, async ({ browser, baseURL }) => {
    const { tenancyId, statementId } = await fixtureIds();
    const routes = [
      "/dashboard",
      "/statements",
      ...(statementId ? [`/statements/${statementId}`] : []),
      "/meters",
      `/meters/${tenancyId}`,
      "/properties",
      "/tenancies",
      `/tenancies/${tenancyId}`,
      "/persons",
      "/requests",
      "/notices",
      "/settings",
    ];
    const { context, page, errors } = await login(browser, admin, baseURL!, OWNER_EMAIL, { locale });
    for (const path of routes) {
      errors.length = 0;
      const res = await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect.soft(res?.status(), `${path} status`).toBe(200);
      expect.soft(errors, `${path} errors`).toEqual([]);
    }
    await context.close();
  });

  test(`tenant routes render cleanly at 390px (${locale})`, async ({ browser, baseURL }) => {
    const { statementId } = await fixtureIds();
    const routes = [
      "/home",
      "/home/meters",
      "/home/statements",
      ...(statementId ? [`/home/statements/${statementId}`] : []),
      "/home/requests",
      "/home/notices",
      "/home/settings",
    ];
    const { context, page, errors } = await login(browser, admin, baseURL!, TENANT_EMAIL, {
      locale,
      viewport: { width: 390, height: 844 },
    });
    for (const path of routes) {
      errors.length = 0;
      const res = await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect.soft(res?.status(), `${path} status`).toBe(200);
      expect.soft(errors, `${path} errors`).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect.soft(overflow, `${path} horizontal overflow (px)`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });

  test(`a tenant can't open owner pages (${locale})`, async ({ browser, baseURL }) => {
    const { tenancyId } = await fixtureIds();
    const { context, page } = await login(browser, admin, baseURL!, TENANT_EMAIL, { locale });
    for (const path of ["/dashboard", `/tenancies/${tenancyId}`, "/statements"]) {
      await page.goto(path);
      expect.soft(new URL(page.url()).pathname, `${path} should bounce`).not.toBe(path);
    }
    await context.close();
  });
}
