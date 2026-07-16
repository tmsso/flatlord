import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { cn } from "@/lib/utils";

export default function RootPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Flatlord</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Phase 0 scaffold. Auth and role-based redirect land in a later
            milestone — for now, jump straight into either shell.
          </p>
          <div className="flex gap-2">
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "default" }), "flex-1")}>
              Admin
            </Link>
            <Link href="/home" className={cn(buttonVariants({ variant: "outline" }), "flex-1")}>
              Tenant
            </Link>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
