// Middleware (src/lib/supabase/middleware.ts) redirects every request away
// from here: unauthenticated -> /login, authenticated -> /dashboard or
// /home by role. This only ever renders if middleware is bypassed.
export default function RootPage() {
  return null;
}
