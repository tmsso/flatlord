import { AlertCircle, ArrowRight, Check, CircleDashed, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Design doc's explicit rule: label + icon, never colour alone. Bespoke
// (not the generic shadcn Badge cva variants — success/warning/info/
// destructive is this project's own semantic status set, not the
// primary/secondary/outline set Badge's variants cover).
type StatusTone = "muted" | "info" | "warning" | "success" | "destructive";

const toneClasses: Record<StatusTone, string> = {
  muted: "bg-muted text-muted-foreground border-input border-dashed",
  info: "bg-info-bg text-info border-info-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  success: "bg-success-bg text-success border-success-border",
  destructive: "bg-destructive-bg text-destructive border-destructive-border",
};

export function StatusPill({
  tone,
  icon: Icon,
  children,
}: {
  tone: StatusTone;
  icon: typeof Check;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-4xl border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  );
}

export type StatementDisplayStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue";

const statementStatusConfig: Record<StatementDisplayStatus, { tone: StatusTone; icon: typeof Check }> = {
  draft: { tone: "muted", icon: CircleDashed },
  issued: { tone: "info", icon: ArrowRight },
  partially_paid: { tone: "warning", icon: Clock },
  paid: { tone: "success", icon: Check },
  overdue: { tone: "destructive", icon: AlertCircle },
};

export function StatementStatusBadge({ status, label }: { status: StatementDisplayStatus; label: string }) {
  const config = statementStatusConfig[status];
  return (
    <StatusPill tone={config.tone} icon={config.icon}>
      {label}
    </StatusPill>
  );
}

export type MeterReadingStatus = "submitted" | "verified" | "rejected";

const meterReadingStatusConfig: Record<MeterReadingStatus, { tone: StatusTone; icon: typeof Check }> = {
  submitted: { tone: "muted", icon: Clock },
  verified: { tone: "success", icon: Check },
  rejected: { tone: "destructive", icon: AlertCircle },
};

export function MeterReadingStatusBadge({ status, label }: { status: MeterReadingStatus; label: string }) {
  const config = meterReadingStatusConfig[status];
  return (
    <StatusPill tone={config.tone} icon={config.icon}>
      {label}
    </StatusPill>
  );
}
