// B-45 / B-48: the requests module gate lives on the pages, not here —
// /requests/[id] must stay reachable for field-change approvals, which are
// core field editability, not the switchable requests module (D-40).
export default function AdminRequestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
