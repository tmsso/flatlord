import { createClient } from "@/lib/supabase/server";
import { loadOnboarding } from "@/server/onboarding/load-onboarding";
import { parseFlow, resolveStep } from "@/lib/onboarding/progress";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

// B-42 onboarding wizard. ?flow=full|flat|tenant, ?unit= / ?tenancy= keep
// the focus, ?step= picks a step (default: the first one the database says
// is missing; "done" or a finished flow shows the summary).
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; step?: string; unit?: string; tenancy?: string; person?: string }>;
}) {
  const params = await searchParams;
  const flow = parseFlow(params.flow);
  const supabase = await createClient();
  const data = await loadOnboarding(supabase, flow, { unit: params.unit, tenancy: params.tenancy });
  const step = params.step === "done" ? null : resolveStep(flow, params.step, data.progress);

  return (
    <div className="p-6">
      <OnboardingWizard
        data={data}
        step={step}
        loginUrl={`${process.env.NEXT_PUBLIC_APP_URL}/login`}
        today={new Date().toISOString().slice(0, 10)}
        personId={params.person}
      />
    </div>
  );
}
