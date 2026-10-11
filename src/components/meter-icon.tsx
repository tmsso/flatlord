import { Droplet, Flame, Gauge, Thermometer, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { meterKind, type MeterKind } from "@/lib/billing/meter-kind";
import { cn } from "@/lib/utils";

// B-37: one glyph per meter type wherever meters are listed. The tone
// classes reuse the semantic tokens so both themes work without extra CSS.
const KIND_ICON: Record<MeterKind, { icon: typeof Zap; tone: string }> = {
  electricity: { icon: Zap, tone: "bg-warning-bg text-warning border-warning-border" },
  gas: { icon: Flame, tone: "bg-destructive-bg text-destructive border-destructive-border" },
  water: { icon: Droplet, tone: "bg-info-bg text-info border-info-border" },
  heat: { icon: Thermometer, tone: "bg-destructive-bg text-destructive border-destructive-border" },
  other: { icon: Gauge, tone: "bg-muted text-muted-foreground border-border" },
};

const SIZES = {
  sm: { box: "size-6 rounded", icon: "size-3.5" },
  md: { box: "size-10 rounded-md", icon: "size-5" },
} as const;

/**
 * Meter-type glyph. `code` is the charge type's machine code (e.g.
 * "water_kitchen"), `unit` the fallback signal when the code is custom.
 * `decorative` hides it from screen readers when the meter's type is
 * already spelled out next to it; otherwise it carries a translated label.
 */
export function MeterIcon({
  code,
  unit,
  size = "md",
  bare = false,
  decorative = false,
  className,
}: {
  code?: string | null;
  unit?: string | null;
  size?: keyof typeof SIZES;
  /** Icon only, no tinted box (for inline legends). */
  bare?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  const t = useTranslations("meterReadings");
  const kind = meterKind(code, unit);
  const { icon: Icon, tone } = KIND_ICON[kind];
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": t(`kind_${kind}`) };
  if (bare) {
    return (
      <span className={cn("inline-flex shrink-0", tone.split(" ").find((c) => c.startsWith("text-")), className)} {...a11y}>
        <Icon className={SIZES[size].icon} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center border", SIZES[size].box, tone, className)} {...a11y}>
      <Icon className={SIZES[size].icon} aria-hidden="true" />
    </span>
  );
}
