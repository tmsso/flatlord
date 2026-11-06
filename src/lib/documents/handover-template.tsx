import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ensurePdfFontsRegistered } from "./pdf-fonts";
import { handoverCopy as c } from "./handover-content";
import type { SnapshotInventoryItem, SnapshotMeter } from "@/lib/handover/build-snapshot";

const styles = StyleSheet.create({
  page: { fontFamily: "IBM Plex Sans", fontSize: 9, padding: 40, color: "#25211d" },
  title: { fontSize: 14, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: "#5c574f", marginBottom: 12 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, fontWeight: "semibold" },
  value: { flex: 1 },
  section: { marginTop: 14, fontSize: 11, fontWeight: "bold", marginBottom: 4 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#25211d", paddingBottom: 2, marginBottom: 2, fontWeight: "semibold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d6d1c7", paddingVertical: 2 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signature: { width: "42%", borderTopWidth: 1, borderTopColor: "#25211d", paddingTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7, color: "#8b8577" },
});

const bi = (x: { hu: string; en: string }) => `${x.hu} / ${x.en}`;

export interface HandoverPdfData {
  kind: "move_in" | "move_out";
  takenAt: string; // formatted
  propertyName: string;
  tenantName: string;
  note: string | null;
  meters: SnapshotMeter[];
  inventory: SnapshotInventoryItem[];
}

export function HandoverDocument({ data }: { data: HandoverPdfData }) {
  ensurePdfFontsRegistered();
  const title = c.title[data.kind];
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title.hu}</Text>
        <Text style={styles.subtitle}>{title.en}</Text>
        {[
          [bi(c.takenAt), data.takenAt],
          [bi(c.property), data.propertyName],
          [bi(c.tenant), data.tenantName],
          ...(data.note ? [[bi(c.note), data.note]] : []),
        ].map(([l, v]) => (
          <View key={l} style={styles.row}>
            <Text style={styles.label}>{l}</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}

        <Text style={styles.section}>{bi(c.metersTitle)}</Text>
        <View style={styles.th}>
          <Text style={{ flex: 2 }}>{bi(c.meter)}</Text>
          <Text style={{ flex: 1 }}>{bi(c.value)}</Text>
          <Text style={{ flex: 1 }}>{bi(c.date)}</Text>
        </View>
        {data.meters.length === 0 && <Text>{bi(c.none)}</Text>}
        {data.meters.map((m) => (
          <View key={m.meterId} style={styles.tr} wrap={false}>
            <Text style={{ flex: 2 }}>{m.label}</Text>
            <Text style={{ flex: 1 }}>{`${m.value} ${m.unit ?? ""}`.trim()}</Text>
            <Text style={{ flex: 1 }}>{m.readingDate ?? bi(c.baseValue)}</Text>
          </View>
        ))}

        <Text style={styles.section}>{bi(c.inventoryTitle)}</Text>
        <View style={styles.th}>
          <Text style={{ flex: 2 }}>{bi(c.item)}</Text>
          <Text style={{ flex: 2 }}>{bi(c.condition)}</Text>
          <Text style={{ flex: 1 }}>{bi(c.ownedBy)}</Text>
          <Text style={{ flex: 1 }}>{bi(c.photos)}</Text>
        </View>
        {data.inventory.length === 0 && <Text>{bi(c.none)}</Text>}
        {data.inventory.map((i) => (
          <View key={i.id} style={styles.tr} wrap={false}>
            <Text style={{ flex: 2 }}>{i.title}</Text>
            <Text style={{ flex: 2 }}>{i.condition ?? "—"}</Text>
            <Text style={{ flex: 1 }}>{c.owned[i.ownedBy] ? bi(c.owned[i.ownedBy]) : i.ownedBy}</Text>
            <Text style={{ flex: 1 }}>{String(i.photos.length)}</Text>
          </View>
        ))}

        <View style={styles.signatureRow}>
          <Text style={styles.signature}>{bi(c.signatureOwner)}</Text>
          <Text style={styles.signature}>{bi(c.signatureTenant)}</Text>
        </View>
        <Text style={styles.footer} fixed>
          {c.footer.hu} {c.footer.en}
        </Text>
      </Page>
    </Document>
  );
}
