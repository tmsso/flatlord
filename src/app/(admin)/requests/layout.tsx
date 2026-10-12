import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getOwnerModules } from "@/server/modules/get-modules";

// B-45: the requests module can be switched off per owner; off = not found
// for every page under /requests (data is kept, D-33).
export default async function AdminRequestsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!(await getOwnerModules(supabase, profile.userId)).has("requests")) notFound();
  return children;
}
