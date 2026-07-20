import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LifecycleStep {
  label: string;
  dateLabel: string | null;
  state: "done" | "current" | "pending";
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
              )}
            >
              {step.state === "done" && <Check className="size-3 text-primary-foreground" />}
              {step.state === "current" && <div className="size-2 rounded-full bg-primary" />}
            </div>
            <div className={cn("mt-1.5 text-xs", step.state === "current" ? "font-semibold" : "font-medium")}>
              {step.label}
            </div>
            {step.dateLabel && <div className="text-[11px] text-muted-foreground">{step.dateLabel}</div>}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mt-3 h-0.5 flex-1", step.state === "done" ? "bg-success" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}
