"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { createContract } from "@/server/contracts/create-contract";
import { activateContract } from "@/server/contracts/activate-contract";
import { parseContract, type ParseContractResult } from "@/server/contracts/parse-contract";
import { searchContractText, type ContractSearchHit } from "@/server/contracts/search-contract-text";
import { Info, Search } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const tErr = useTranslations("actionErrors");
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
  // design/09 11: the selected version drives the document + key terms
  // panels; defaults to the active one (else the newest).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = contracts.find((c) => c.id === selectedId) ?? contracts.find((c) => c.status === "active") ?? latest;
  const chain = [...contracts].sort((a, b) => a.version - b.version);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContractSearchHit[] | null>(null);
  const [isSearching, startSearching] = useTransition();
  const dateOnly = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    startSearching(async () => {
      try {
        setHits(await searchContractText({ tenancyId, query }));
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

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
        const result = await createContract(
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
        if (!result.ok) {
          setError(tErr(result.error));
          return;
        }
        toast.success(tc("save"));
        setOpen(false);
        setParseResult(null);
        form.reset();
        router.refresh();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  function handleActivate(contractId: string) {
    startTransition(async () => {
      try {
        const result = await activateContract({ contractId });
        if (!result.ok) {
          toast.error(tErr(result.error));
          return;
        }
        toast.success(tc("save"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
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
      <CardContent className="flex flex-col gap-4">
        {contracts.length === 0 || !selected ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            {/* Version chain: v1 — v2 — … (lineage via predecessor_contract_id) */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("versionChainLabel")}>
              {chain.map((c, i) => {
                const year = (c.termStart ?? c.signedAt)?.slice(0, 4);
                const label =
                  c.status === "active" && c.termEnd
                    ? t("chainActive", { version: c.version, date: dateOnly(c.termEnd) })
                    : `v${c.version}${year ? ` · ${year}` : ""}${c.status === "draft" ? ` · ${t("status_draft")}` : ""}`;
                return (
                  <span key={c.id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground" aria-hidden="true">—</span>}
                    <button
                      type="button"
                      aria-pressed={selected.id === c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "rounded-4xl border px-3 py-1 text-xs font-medium",
                        c.status === "active" ? "border-primary text-primary" : "border-border text-muted-foreground",
                        selected.id === c.id ? "bg-primary/10" : "bg-card hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  </span>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="flex min-w-0 flex-col gap-3">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchPlaceholder")}
                  />
                  <Button type="submit" variant="outline" disabled={isSearching || query.trim().length < 2} aria-label={t("search")}>
                    <Search className="size-4" aria-hidden="true" />
                  </Button>
                </form>
                {hits && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    {hits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("searchNoHits")}</p>
                    ) : (
                      hits.map((h) => (
                        <div key={h.contractId} className="flex flex-col gap-1">
                          <button type="button" className="self-start text-xs font-medium text-primary hover:underline" onClick={() => setSelectedId(h.contractId)}>
                            {t("versionLabel", { version: h.version })}
                          </button>
                          {h.snippets.map((sn, i) => (
                            <p key={i} className="text-sm text-muted-foreground">
                              {sn.before}
                              <mark className="rounded-sm bg-warning-bg px-0.5 text-foreground">{sn.match}</mark>
                              {sn.after}
                            </p>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
                {selected.documentUrl ? (
                  <iframe
                    src={selected.documentUrl}
                    title={t("documentFrameTitle", { version: selected.version })}
                    className="h-[28rem] w-full rounded-lg border border-border bg-muted"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    {t("noDocument")}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t("keyTermsTitle")}</span>
                  <Badge variant={selected.status === "active" ? "info" : "outline"}>{t(`status_${selected.status}`)}</Badge>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t("termLabel")}</dt>
                  <dd>
                    {selected.termStart ? dateOnly(selected.termStart) : "—"} – {selected.termEnd ? dateOnly(selected.termEnd) : t("noEndDate")}
                  </dd>
                  <dt className="text-muted-foreground">{t("depositLabel")}</dt>
                  <dd>{selected.depositAmount != null ? formatMoney(selected.depositAmount, selected.depositCurrency) : "—"}</dd>
                  <dt className="text-muted-foreground">{t("noticeLabel")}</dt>
                  <dd>{t("noticeDaysValue", { days: selected.noticeDays ?? 0 })}</dd>
                  <dt className="text-muted-foreground">{t("signedAtLabel")}</dt>
                  <dd>{selected.signedAt ? dateOnly(selected.signedAt) : "—"}</dd>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.documentUrl && (
                    <a href={selected.documentUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                      {t("download")}
                    </a>
                  )}
                  {selected.status === "draft" && (
                    <Button type="button" size="sm" disabled={isPending} onClick={() => handleActivate(selected.id)}>
                      {t("activate")}
                    </Button>
                  )}
                </div>
                <p className="flex items-start gap-2 rounded-md border border-info-border bg-info-bg p-2.5 text-xs text-info">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  {t("parseReviewNote")}
                </p>
              </div>
            </div>
          </>
        )}
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
