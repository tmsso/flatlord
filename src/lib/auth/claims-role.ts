// B-03: the role the custom access-token hook (migration 0037) puts in the
// JWT as `user_role`. Anything else — no claim (hook off, token issued
// before the hook, no profile) or an unexpected value — is null, and the
// caller falls back to querying profiles (D-47).
export function roleFromClaims(claims: Record<string, unknown> | null | undefined): "owner" | "tenant" | null {
  const role = claims?.user_role;
  return role === "owner" || role === "tenant" ? role : null;
}
