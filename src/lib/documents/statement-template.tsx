import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ensurePdfFontsRegistered } from "./pdf-fonts";
import { statementCopy as C, bilingual } from "./statement-content";

const styles = StyleSheet.create({
  page: { fontFamily: "IBM Plex Sans", fontSize: 10, padding: 48, color: "#25211d" },
  titleHu: { fontSize: 15, fontWeight: "bold", marginBottom: 2 },
  titleEn: { fontSize: 11, fontWeight: "semibold", color: "#5c574f", marginBottom: 16 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 170, fontWeight: "semibold" },
  metaValue: { flex: 1 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 6, textTransform: "uppercase", color: "#5c574f" },
  groupTitle: { fontSize: 9, fontWeight: "semibold", color: "#7a746a", marginTop: 8, marginBottom: 3 },
  lineRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e0dcd4" },
  lineDesc: { flex: 1, paddingRight: 12 },
  lineSub: { fontSize: 8, color: "#7a746a", marginTop: 1 },
  lineAmount: { width: 90, textAlign: "right" },
  lineAmountMuted: { width: 90, textAlign: "right", color: "#8b8577" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#25211d" },
  totalLabel: { fontWeight: "bold", fontSize: 11 },
  totalAmount: { fontWeight: "bold", fontSize: 11, width: 120, textAlign: "right" },
  remainingRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  remainingAmount: { width: 120, textAlign: "right", fontWeight: "semibold" },
  instructions: { marginTop: 4, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 7, color: "#8b8577" },
});

type Locale = "hu" | "en";

export interface StatementPdfLineItem {
  description: string;
  quantity: number | null;
  unitRate: number | null;
  amount: number;
  isBillable: boolean;
  group: "fixed" | "metered" | "adjustments";
}

export interface StatementPdfPayment {
  amount: number;
  paidAt: string;
  method: string;
}

export interface StatementPdfData {
  periodMonth: string;
  status: string;
  issuedAt: string | null;
  dueDate: string | null;
  total: number;
  currency: string;
  propertyName: string;
  propertyAddress: string | null;
  tenantName: string;
  landlordNames: string;
  paymentInstructions: string | null;
  lineItems: StatementPdfLineItem[];
  payments: StatementPdfPayment[];
}

function fmtMoney(amount: number, currency: string, locale: Locale): string {
  const numberLocale = locale === "hu" ? "hu-HU" : "en-US";
  return new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string, locale: Locale): string {
  const numberLocale = locale === "hu" ? "hu-HU" : "en-US";
  return new Intl.DateTimeFormat(numberLocale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const GROUP_ORDER = ["fixed", "metered", "adjustments"] as const;

// Read-only rendering of an issued (or draft) statement — the same line-
// item grouping the on-screen StatementLineItemsTable uses (derived from
// which FK the row carries), so the PDF and the web view never drift.
export function StatementDocument({ data, locale }: { data: StatementPdfData; locale: Locale }) {
  ensurePdfFontsRegistered();
  const L = (pair: { hu: string; en: string }) => (locale === "hu" ? pair.hu : pair.en);

  const paidSum = data.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = data.total - paidSum;
  const statusText = C.statusLabel[data.status] ? bilingual(C.statusLabel[data.status]) : data.status;

  const groups = GROUP_ORDER.map((key) => ({
    key,
    items: data.lineItems.filter((li) => li.group === key),
  })).filter((g) => g.items.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titleHu}>{C.title.hu}</Text>
        <Text style={styles.titleEn}>{C.title.en}</Text>

        <Meta label={bilingual(C.period)} value={fmtDate(data.periodMonth, locale)} />
        <Meta label={bilingual(C.status)} value={statusText} />
        {data.issuedAt && <Meta label={bilingual(C.issuedAt)} value={fmtDate(data.issuedAt, locale)} />}
        {data.dueDate && <Meta label={bilingual(C.dueDate)} value={fmtDate(data.dueDate, locale)} />}
        <Meta
          label={bilingual(C.property)}
          value={data.propertyAddress ? `${data.propertyName} — ${data.propertyAddress}` : data.propertyName}
        />
        <Meta label={bilingual(C.tenant)} value={data.tenantName} />
        <Meta label={bilingual(C.landlord)} value={data.landlordNames} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L(C.lineItemsTitle)}</Text>
          {groups.map((group) => (
            <View key={group.key}>
              <Text style={styles.groupTitle}>{L(C.group[group.key])}</Text>
              {group.items.map((li, i) => (
                <View key={i} style={styles.lineRow} wrap={false}>
                  <View style={styles.lineDesc}>
                    <Text>{li.description}</Text>
                    {li.quantity != null && li.unitRate != null && (
                      <Text style={styles.lineSub}>
                        {li.quantity} × {fmtMoney(li.unitRate, data.currency, locale)}
                      </Text>
                    )}
                  </View>
                  <Text style={li.isBillable ? styles.lineAmount : styles.lineAmountMuted}>
                    {li.isBillable ? fmtMoney(li.amount, data.currency, locale) : L(C.notCharged)}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{L(C.total)}</Text>
            <Text style={styles.totalAmount}>{fmtMoney(data.total, data.currency, locale)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L(C.paymentsTitle)}</Text>
          {data.payments.length === 0 ? (
            <Text>{L(C.noPayments)}</Text>
          ) : (
            <>
              {data.payments.map((p, i) => {
                const methodPair = C.paymentMethod[p.method];
                const methodText = methodPair ? L(methodPair) : p.method;
                return (
                  <View key={i} style={styles.lineRow} wrap={false}>
                    <Text style={styles.lineDesc}>
                      {fmtDate(p.paidAt, locale)} · {methodText}
                    </Text>
                    <Text style={styles.lineAmount}>{fmtMoney(p.amount, data.currency, locale)}</Text>
                  </View>
                );
              })}
              <View style={styles.remainingRow}>
                <Text>{L(C.remaining)}</Text>
                <Text style={styles.remainingAmount}>{fmtMoney(remaining, data.currency, locale)}</Text>
              </View>
            </>
          )}
        </View>

        {data.paymentInstructions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{L(C.paymentInstructionsTitle)}</Text>
            <Text style={styles.instructions}>{data.paymentInstructions}</Text>
          </View>
        )}

        <Text style={styles.footer}>{bilingual(C.generatedNote)}</Text>
      </Page>
    </Document>
  );
}
