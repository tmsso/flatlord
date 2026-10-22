import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getTenantModules } from "@/server/modules/get-modules";

// B-45: a tenant follows the modules of their property's owner(s); with
// requests off, every page under /home/requests is not found.
export default async function TenantRequestsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase, { verify: "claims" });
  if (!(await getTenantModules(supabase, profile.personId)).has("requests")) notFound();
  return children;
}
