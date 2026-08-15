"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { createContract } from "@/server/contracts/create-contract";
import { activateContract } from "@/server/contracts/activate-contract";
import { parseContract, type ParseContractResult } from "@/server/contracts/parse-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface ContractRow {
  id: string;
  version: number;
  status: "draft" | "active" | "superseded";
  termStart: string | null;
  termEnd: string | null;
  noticeDays: number | null;
  depositAmount: number | null;
  depositCurrency: string;
  signedAt: string | null;
  documentUrl: string | null;
}

export function ContractsSection({ tenancyId, contracts }: { tenancyId: string; contracts: ContractRow[] }) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isParsing, startParsing] = useTransition();
  const [parseResult, setParseResult] = useState<ParseContractResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const termStartRef = useRef<HTMLInputElement>(null);
  const termEndRef = useRef<HTMLInputElement>(null);
  const noticeDaysRef = useRef<HTMLInputElement>(null);
  const depositAmountRef = useRef<HTMLInputElement>(null);

  const latest = contracts[0] ?? null;

  function formatMoney(amount: number, currency: string) {
    return format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });
  }

  function handleFileChange() {
    const file = fileRef.current?.files?.[0];
    setParseResult(null);
    if (!file) return;
    startParsing(async () => {
      try {
        const result = await parseContract(file);
        setParseResult(result);
      } catch {
        // Extraction/proposal is a convenience, not a requirement — a
        // failure here shouldn't block the admin from filling the form
        // manually and saving, so it's swallowed rather than surfaced.
        setParseResult({ hasText: false, proposals: {} });
      }
    });
  }

  function applySuggestion(ref: React.RefObject<HTMLInputElement | null>, value: string | number) {
    if (ref.current) ref.current.value = String(value);
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("fileRequired"));
      return;
    }
    setError(null);
    const noticeDaysRaw = String(data.get("noticeDays") ?? "");
    const depositRaw = String(data.get("depositAmount") ?? "");
    if (!/^\d+$/.test(noticeDaysRaw)) {
      setError(t("noticeDaysInvalid"));
      return;
    }
    if (depositRaw && !/^\d+$/.test(depositRaw)) {
      setError(t("depositAmountInvalid"));
      return;
    }
    startTransition(async () => {
      try {
        await createContract(
          {
            tenancyId,
            predecessorContractId: latest?.id ?? null,
            termStart: String(data.get("termStart") ?? ""),
            termEnd: data.get("termEnd") ? String(data.get("termEnd")) : null,
            noticeDays: Number(noticeDaysRaw),
            depositAmount: depositRaw ? Number(depositRaw) : null,
            depositCurrency: String(data.get("depositCurrency") || "HUF"),
            signedAt: data.get("signedAt") ? String(data.get("signedAt")) : null,
          },
          file,
        );
        toast.success(tc("save"));
        setOpen(false);
        setParseResult(null);
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleActivate(contractId: string) {
    startTransition(async () => {
      try {
        await activateContract({ contractId });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setParseResult(null);
          }}
        >
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addVersion")}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("addVersion")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractFile">{t("fileLabel")}</Label>
                <Input
                  id="contractFile"
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={handleFileChange}
                />
                {isParsing && <p className="text-xs text-muted-foreground">{t("parsing")}</p>}
                {parseResult && !isParsing && !parseResult.hasText && (
                  <p className="text-xs text-muted-foreground">{t("ocrNotConfigured")}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractTermStart">{t("termStartLabel")}</Label>
                <Input id="contractTermStart" name="termStart" type="date" ref={termStartRef} required />
                {parseResult?.proposals.termStart && (
                  <SuggestionHint
                    label={t("suggestedValue", { value: parseResult.proposals.termStart.value })}
                    snippet={parseResult.proposals.termStart.snippet}
                    onUse={() => applySuggestion(termStartRef, parseResult.proposals.termStart!.value)}
                    useLabel={t("useSuggestion")}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractTermEnd">{t("termEndLabel")}</Label>
                <Input id="contractTermEnd" name="termEnd" type="date" ref={termEndRef} />
                {parseResult?.proposals.termEnd && (
                  <SuggestionHint
                    label={t("suggestedValue", { value: parseResult.proposals.termEnd.value })}
                    snippet={parseResult.proposals.termEnd.snippet}
                    onUse={() => applySuggestion(termEndRef, parseResult.proposals.termEnd!.value)}
                    useLabel={t("useSuggestion")}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractNoticeDays">{t("noticeDaysLabel")}</Label>
                <Input
                  id="contractNoticeDays"
                  name="noticeDays"
                  type="number"
                  step={1}
                  defaultValue={30}
                  ref={noticeDaysRef}
                  required
                />
                {parseResult?.proposals.noticeDays && (
                  <SuggestionHint
                    label={t("suggestedValue", { value: parseResult.proposals.noticeDays.value })}
                    snippet={parseResult.proposals.noticeDays.snippet}
                    onUse={() => applySuggestion(noticeDaysRef, parseResult.proposals.noticeDays!.value)}
                    useLabel={t("useSuggestion")}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractDepositAmount">{t("depositAmountLabel")}</Label>
                <Input
                  id="contractDepositAmount"
                  name="depositAmount"
                  type="number"
                  step={1}
                  ref={depositAmountRef}
                />
                {parseResult?.proposals.depositAmount && (
                  <SuggestionHint
                    label={t("suggestedValue", { value: parseResult.proposals.depositAmount.value })}
                    snippet={parseResult.proposals.depositAmount.snippet}
                    onUse={() => applySuggestion(depositAmountRef, parseResult.proposals.depositAmount!.value)}
                    useLabel={t("useSuggestion")}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractSignedAt">{t("signedAtLabel")}</Label>
                <Input id="contractSignedAt" name="signedAt" type="date" />
              </div>
              <input type="hidden" name="depositCurrency" value="HUF" />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {tc("save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contracts.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {contracts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("versionLabel", { version: c.version })}</span>
                <Badge variant="outline">{t(`status_${c.status}`)}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.termStart ? format.dateTime(new Date(c.termStart)) : "—"} –{" "}
                {c.termEnd ? format.dateTime(new Date(c.termEnd)) : t("noEndDate")}
                {" · "}
                {t("noticeDaysValue", { days: c.noticeDays ?? 0 })}
                {c.depositAmount != null && ` · ${formatMoney(c.depositAmount, c.depositCurrency)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {c.documentUrl && (
                <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  {t("download")}
                </a>
              )}
              {c.status === "draft" && (
                <Button type="button" size="sm" disabled={isPending} onClick={() => handleActivate(c.id)}>
                  {t("activate")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Per-field proposal shown under an input (ROADMAP Phase 2 "contract
// intake parsing" — accept per field, nothing auto-committed). The
// snippet is the actual matched text from the document so the admin can
// judge the suggestion at a glance instead of trusting it blindly.
function SuggestionHint({
  label,
  snippet,
  onUse,
  useLabel,
}: {
  label: string;
  snippet: string;
  onUse: () => void;
  useLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-xs font-medium">{label}</span>
        <span className="truncate text-xs text-muted-foreground" title={snippet}>
          &ldquo;{snippet}&rdquo;
        </span>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onUse}>
        {useLabel}
      </Button>
    </div>
  );
}
