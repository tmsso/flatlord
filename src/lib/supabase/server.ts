import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Components / Server Actions / Route Handlers only. Never import
// the service-role client here — it must stay server-only and separate
// (see service-role.ts), since it bypasses RLS entirely.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (no request/response cycle to
            // write to) — safe to ignore as long as middleware refreshes
            // the session on every request.
          }
        },
      },
    },
  );
}
