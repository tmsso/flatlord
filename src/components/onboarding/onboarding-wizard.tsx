"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PersonForm } from "@/components/person-form";
import { PropertyCreateForm } from "@/components/property-create-form";
import { TenancyCreateForm } from "@/components/tenancy-create-form";
import { UnitBillingSetup } from "@/components/billing-setup/unit-billing-setup";
import { TenancyRates } from "@/components/billing-setup/tenancy-rates";
import { TenantAccessCard } from "@/components/tenant-access-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ONBOARDING_FLOWS, type OnboardingStep } from "@/lib/onboarding/progress";
import type { OnboardingData } from "@/server/onboarding/load-onboarding";

// The onboarding wizard (B-42): a composition of the same components the
// flat and tenancy pages use, not a parallel code path. Which step shows
// comes from the URL (?step=) or, by default, the first one the database
// says is missing; unit/tenancy ids ride along in the URL once created.
export function OnboardingWizard({
  data,
  step,
  loginUrl,
  today,
  personId,
}: {
  data: OnboardingData;
  step: OnboardingStep | null;
  loginUrl: string;
  today: string;
  /** Preselected tenant after "New person" in the tenant step. */
  personId?: string;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [showNewPerson, setShowNewPerson] = useState(false);
  const keys = ONBOARDING_FLOWS[data.flow] as readonly OnboardingStep[];

  function href(next: { step?: OnboardingStep | "done" | null; unit?: string | null; tenancy?: string | null; person?: string | null }) {
    const q = new URLSearchParams();
    if (data.flow !== "full") q.set("flow", data.flow);
    const unit = next.unit === undefined ? data.unit?.id : next.unit;
    const tenancy = next.tenancy === undefined ? data.tenancy?.id : next.tenancy;
    if (unit) q.set("unit", unit);
    if (tenancy) q.set("tenancy", tenancy);
    if (next.person) q.set("person", next.person);
    if (next.step) q.set("step", next.step);
    const s = q.toString();
    return `/onboarding${s ? `?${s}` : ""}`;
  }

  // "Continue" goes to the next step in the flow, or to the summary after the last one.
  function nextOf(current: OnboardingStep): OnboardingStep | "done" {
    const i = keys.indexOf(current);
    return i >= 0 && i < keys.length - 1 ? keys[i + 1] : "done";
  }
  function go(next: OnboardingStep | "done", ids: { unit?: string; tenancy?: string } = {}) {
    router.push(href({ step: next, ...ids }));
  }

  const isDone = (key: OnboardingStep) => data.progress.steps.find((s) => s.key === key)?.done ?? false;
  const showSummary = step === null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t(`title_${data.flow}`)}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label={t(`title_${data.flow}`)}>
        {data.progress.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={href({ step: s.key })}
              aria-current={s.key === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]",
                s.key === step ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {s.done ? <Check className="size-3.5" aria-label={t("stepDone")} /> : <span className="tabular-nums">{i + 1}.</span>}
              {t(`step_${s.key}`)}
            </Link>
          </li>
        ))}
      </ol>

      {showSummary && (
        <Card className="flex flex-col items-start gap-3 p-5">
          <h2 className="text-lg font-semibold">{t("doneTitle")}</h2>
          <p className="text-sm">{t("doneBody", { name: data.unit?.name ?? "" })}</p>
          <div className="flex flex-wrap gap-2">
            {data.tenancy && (
              <Button nativeButton={false} render={<Link href={`/tenancies/${data.tenancy.id}`} />}>
                {t("openTenancy")}
              </Button>
            )}
            {data.unit && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/properties/${data.unit.id}`} />}>
                {t("openUnit")}
              </Button>
            )}
            <Button variant="ghost" nativeButton={false} render={<Link href="/dashboard" />}>
              {t("toDashboard")}
            </Button>
          </div>
        </Card>
      )}

      {step && (
        <section className="flex flex-col gap-3" aria-labelledby="onboarding-step-title">
          <div>
            <h2 id="onboarding-step-title" className="text-base font-semibold">
              {t(`step_${step}`)}
            </h2>
            <p className="text-sm text-muted-foreground">{t(`desc_${step}`)}</p>
          </div>

          {step === "you" && (
            <PersonForm
              mode="edit"
              personId={data.me.id}
              requirements={[]}
              initialValues={{
                givenName: data.me.given_name,
                familyName: data.me.family_name,
                documentType: (data.me.document_type as never) ?? null,
                documentNumber: data.me.document_number ?? "",
                dob: data.me.dob ?? "",
                birthName: data.me.birth_name ?? "",
                birthPlace: data.me.birth_place ?? "",
                mothersName: data.me.mothers_name ?? "",
                citizenship: data.me.citizenship ?? "",
                addressCardNumber: data.me.address_card_number ?? "",
                taxId: data.me.tax_id ?? "",
                phone: data.me.phone ?? "",
                contactEmail: data.me.contact_email ?? "",
                registeredAddress: data.me.registered_address ?? "",
                temporaryAddress: data.me.temporary_address ?? "",
              }}
              onSaved={() => go(nextOf("you"))}
            />
          )}

          {step === "flat" && (
            <>
              <PropertyCreateForm parentCandidates={data.parentCandidates} onCreated={(id) => go(nextOf("flat"), { unit: id })} />
              {data.parentCandidates.length > 0 && !data.unit && <p className="text-xs text-muted-foreground">{t("needUnitFirst")}</p>}
            </>
          )}

          {step === "billing" &&
            (data.unit ? (
              <>
                <UnitBillingSetup unitId={data.unit.id} chargeTypes={data.chargeTypes} meters={data.meters} />
                <StepFooter canContinue={isDone("billing")} onContinue={() => go(nextOf("billing"))} label={t("continue")} />
              </>
            ) : (
              <NeedFirst text={t("needUnitFirst")} href={href({ step: "flat" })} label={t("step_flat")} />
            ))}

          {step === "tenant" &&
            (data.unit ? (
              <>
                <TenancyCreateForm
                  // key: re-mount with the new person preselected after "New person"
                  key={personId ?? "none"}
                  units={[{ id: data.unit.id, name: data.unit.name, type: "flat" }]}
                  persons={data.persons}
                  defaultUnitId={data.unit.id}
                  defaultPersonId={personId}
                  defaultStatus="active"
                  onCreated={(id) => go(nextOf("tenant"), { tenancy: id })}
                />
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{t("newPersonTitle")}</h3>
                      <p className="text-xs text-muted-foreground">{t("newPersonHint")}</p>
                    </div>
                    {!showNewPerson && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowNewPerson(true)}>
                        {t("newPersonTitle")}
                      </Button>
                    )}
                  </div>
                  {showNewPerson && (
                    <PersonForm
                      mode="create"
                      requirements={[]}
                      onSaved={(id) => {
                        setShowNewPerson(false);
                        router.push(href({ step: "tenant", person: id }));
                      }}
                    />
                  )}
                </Card>
              </>
            ) : (
              <NeedFirst text={t("needUnitFirst")} href={href({ step: "flat" })} label={t("step_flat")} />
            ))}

          {step === "rates" &&
            (data.tenancy && data.unit ? (
              <>
                <TenancyRates
                  tenancyId={data.tenancy.id}
                  unitId={data.unit.id}
                  chargeTypes={data.chargeTypes}
                  schedules={data.schedules}
                  lastBilledPeriod={data.lastBilledPeriod}
                  termStart={data.tenancy.termStart}
                  today={today}
                />
                <StepFooter canContinue={isDone("rates")} onContinue={() => go(nextOf("rates"))} label={t("continue")} />
              </>
            ) : (
              <NeedFirst text={t("needTenancyFirst")} href={href({ step: "tenant" })} label={t("step_tenant")} />
            ))}

          {step === "invite" &&
            (data.tenancy && data.tenantAccess ? (
              <>
                <TenantAccessCard
                  tenancyId={data.tenancy.id}
                  tenantName={data.tenancy.tenantName}
                  defaultEmail={data.tenancy.tenantEmail}
                  access={data.tenantAccess}
                  loginUrl={loginUrl}
                />
                <StepFooter canContinue={isDone("invite")} onContinue={() => go("done")} label={t("finish")} />
              </>
            ) : (
              <NeedFirst text={t("needTenancyFirst")} href={href({ step: "tenant" })} label={t("step_tenant")} />
            ))}
        </section>
      )}
    </div>
  );
}

function StepFooter({ canContinue, onContinue, label }: { canContinue: boolean; onContinue: () => void; label: string }) {
  return (
    <div className="flex justify-end">
      <Button type="button" disabled={!canContinue} onClick={onContinue}>
        {label}
      </Button>
    </div>
  );
}

function NeedFirst({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-4 text-sm">
      <p>{text}</p>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
        {label}
      </Button>
    </Card>
  );
}
