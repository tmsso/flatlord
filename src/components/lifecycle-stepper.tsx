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
export function LifecycleStepper({ steps }: { steps: LifecycleStep[] }) {
  return (
    <div className="flex items-start">
      {steps.map((step, i) => (
        <div key={step.label} className="contents">
          <div className="flex flex-1 flex-col items-center">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full",
                step.state === "done" && "bg-success",
                step.state === "current" && "border-2 border-primary bg-card",
                step.state === "pending" && "border-2 border-dashed border-input bg-card",
                step.state === "overdue" && "border-2 border-destructive bg-destructive-bg",
              )}
            >
              {step.state === "done" && <Check className="size-3 text-primary-foreground" />}
              {step.state === "current" && <div className="size-2 rounded-full bg-primary" />}
              {step.state === "overdue" && <span className="text-xs font-bold text-destructive">!</span>}
            </div>
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
