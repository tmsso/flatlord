import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LifecycleStep {
  label: string;
  dateLabel: string | null;
  // "overdue" (design/04's dashboard billing-cycle widget: a destructive
  // ring + "!" on the payment step) is additive — statement-detail.tsx's
  // only other call site never passes it, so its three-state stepper is
  // unaffected.
  state: "done" | "current" | "pending" | "overdue";
}

// draft -> issued -> paid, per design doc's three-state stepper
// (checkmark / current-ring / dashed-pending), each step's date underneath.
// `variant="inline"` (design/05's page header): icon, label and date on
// one line per step, short connectors between — compact enough to sit
// under the title instead of in its own card.
export function LifecycleStepper({ steps, variant = "stacked" }: { steps: LifecycleStep[]; variant?: "stacked" | "inline" }) {
  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {steps.map((step, i) => (
          <div key={step.label} className="contents">
            <div className="flex items-center gap-2 text-xs">
              <StepIcon state={step.state} />
              <span
                className={cn(
                  "font-semibold",
                  step.state === "overdue" && "text-destructive",
                  step.state === "pending" && "font-medium text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {step.dateLabel && (
                <span className={step.state === "overdue" ? "text-destructive" : "text-muted-foreground"}>{step.dateLabel}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cn("h-0.5 w-12", step.state === "done" ? "bg-success" : "bg-border")} />
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start">
      {steps.map((step, i) => (
        <div key={step.label} className="contents">
          <div className="flex flex-1 flex-col items-center">
            <StepIcon state={step.state} />
            <div
              className={cn(
                "mt-1.5 text-xs",
                (step.state === "current" || step.state === "overdue") && "font-semibold",
                step.state === "overdue" ? "text-destructive" : "font-medium",
              )}
            >
              {step.label}
            </div>
            {step.dateLabel && (
              <div className={cn("text-[11px]", step.state === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                {step.dateLabel}
              </div>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mt-3 h-0.5 flex-1", step.state === "done" ? "bg-success" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepIcon({ state }: { state: LifecycleStep["state"] }) {
  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full",
        state === "done" && "bg-success",
        state === "current" && "border-2 border-primary bg-card",
        state === "pending" && "border-2 border-dashed border-input bg-card",
        state === "overdue" && "border-2 border-destructive bg-destructive-bg",
      )}
    >
      {state === "done" && <Check className="size-3 text-primary-foreground" />}
      {state === "current" && <div className="size-2 rounded-full bg-primary" />}
      {state === "overdue" && <span className="text-xs font-bold text-destructive">!</span>}
    </div>
  );
}
