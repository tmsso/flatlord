import { cn } from "@/lib/utils";

// Loading placeholder (Phase 4c item 6). Pulses on the muted token so it
// reads correctly in both themes; aria-hidden — the route-level wrapper
// carries the single "loading" announcement.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
