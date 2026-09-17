import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getDashboardData } from "@/lib/dashboard/get-dashboard-data";
import { AdminDashboard } from "@/components/admin-dashboard";

function shiftMonth(periodMonth: string, delta: number): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}-01`;
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const viewMonth = month ?? `${today.slice(0, 7)}-01`;

  const data = await getDashboardData(supabase, profile.personId, today, viewMonth);

  return (
    <AdminDashboard
      data={data}
      today={today}
      viewMonth={viewMonth}
      previousMonthHref={`/dashboard?month=${shiftMonth(viewMonth, -1)}`}
      nextMonthHref={`/dashboard?month=${shiftMonth(viewMonth, 1)}`}
    />
  );
}
