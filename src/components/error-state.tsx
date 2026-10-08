import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Presentational shell shared by the error and not-found pages. Plain
// props (no translation hooks) so both the client error boundary and the
// server not-found page can render it.
export function ErrorState({
  code,
  title,
  body,
  reference,
  homeLabel,
  action,
}: {
  code: string;
  title: string;
  body: string;
  reference?: string;
  homeLabel: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4 py-2">
          <span className="font-mono text-sm text-muted-foreground">{code}</span>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
          {reference && <p className="font-mono text-xs text-muted-foreground">{reference}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {action}
            {/* "/" redirects to the caller's role home (or /login) in the proxy. */}
            <Link href="/" className={cn(buttonVariants({ variant: action ? "outline" : "default" }))}>
              {homeLabel}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
