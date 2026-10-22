import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getOwnerModules } from "@/server/modules/get-modules";
import { listActiveTenancies, pickTenancy } from "@/lib/tenancies/list-active-tenancies";

function shiftMonth(periodMonth: string, delta: number): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}-01`;
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string; tenancy?: string }> }) {
  const { month, tenancy: requestedTenancyId } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const viewMonth = month ?? `${today.slice(0, 7)}-01`;

  const [modules, tenancyOptions] = await Promise.all([
    getOwnerModules(supabase, profile.userId),
    listActiveTenancies(supabase),
  ]);
  const selectedTenancyId = pickTenancy(tenancyOptions, requestedTenancyId)?.id ?? null;
  const data = await getDashboardData(supabase, profile.personId, today, viewMonth, modules, selectedTenancyId);
  // Month links keep the chosen tenancy (B-51).
  const tenancyQuery = requestedTenancyId && selectedTenancyId === requestedTenancyId ? `&tenancy=${selectedTenancyId}` : "";

  return (
    <AdminDashboard
      data={data}
      today={today}
      viewMonth={viewMonth}
      previousMonthHref={`/dashboard?month=${shiftMonth(viewMonth, -1)}${tenancyQuery}`}
      nextMonthHref={`/dashboard?month=${shiftMonth(viewMonth, 1)}${tenancyQuery}`}
      tenancyOptions={tenancyOptions}
      selectedTenancyId={selectedTenancyId}
    />
  );
}
