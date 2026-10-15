// A personal-data change request carrying a change_payload is a field-
// editability approval (CLAUDE.md §3.5), not a free-form request. Field
// editability is core — it has no module switch — so these stay visible
// and reachable for the owner even with the requests module off (B-48,
// D-40). Everything else under /requests follows the switch.
export function isFieldApprovalRequest(request: { category: string; change_payload: unknown }): boolean {
  return request.category === "personal_data_change" && request.change_payload != null;
}
