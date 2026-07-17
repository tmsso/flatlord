"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { createInvite } from "@/server/auth/create-invite";
import { revokeInvite } from "@/server/auth/revoke-invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Invite = {
  id: string;
  email: string;
  role: "owner" | "tenant";
  expiresAt: string;
};

export function InviteManager({ invites }: { invites: Invite[] }) {
  const t = useTranslations("invites");
  const format = useFormatter();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "tenant">("tenant");
  const [lastCreated, setLastCreated] = useState<{ email: string; role: "owner" | "tenant" } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // The one-time token create-invite.ts returns isn't part of the
        // actual sign-in gate (handle_new_user matches by email only, per
        // migration 0004) — there's no acceptance page to redeem it on. The
        // real instruction to relay is which email to sign in with.
        await createInvite({ email, role });
        setLastCreated({ email, role });
        setEmail("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleRevoke(id: string) {
    setError(null);
    setRevokingId(id);
    startTransition(async () => {
      try {
        await revokeInvite({ inviteId: id });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      } finally {
        setRevokingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="invite-email">{t("emailLabel")}</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">{t("roleLabel")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "owner" | "tenant")}>
                <SelectTrigger id="invite-role" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">{t("roleTenant")}</SelectItem>
                  <SelectItem value="owner">{t("roleOwner")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isPending}>
              {t("send")}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {lastCreated && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("createdNote", {
                email: lastCreated.email,
                role: lastCreated.role === "owner" ? t("roleOwner") : t("roleTenant"),
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pendingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colEmail")}</TableHead>
                  <TableHead>{t("colRole")}</TableHead>
                  <TableHead>{t("colExpires")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const expired = new Date(invite.expiresAt) < new Date();
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {invite.role === "owner" ? t("roleOwner") : t("roleTenant")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <span className="text-warning">{t("expired")}</span>
                        ) : (
                          format.dateTime(new Date(invite.expiresAt), { dateStyle: "medium" })
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isPending && revokingId === invite.id}
                          onClick={() => handleRevoke(invite.id)}
                        >
                          {t("revoke")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
