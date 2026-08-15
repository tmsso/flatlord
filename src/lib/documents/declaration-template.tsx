import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { ensurePdfFontsRegistered } from "./pdf-fonts";
import { declarationCopy, residenceKindFromRegistrationType } from "./declaration-content";

const styles = StyleSheet.create({
  page: { fontFamily: "IBM Plex Sans", fontSize: 10, padding: 48, color: "#25211d" },
  titleHu: { fontSize: 15, fontWeight: "bold", marginBottom: 2 },
  titleEn: { fontSize: 11, fontWeight: "semibold", color: "#5c574f", marginBottom: 10 },
  aliasNote: { fontSize: 8, color: "#7a746a", marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitleHu: { fontSize: 11, fontWeight: "bold", marginBottom: 4 },
  sectionTitleEn: { fontSize: 9, color: "#5c574f", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 150, fontWeight: "semibold" },
  fieldValue: { flex: 1 },
  paragraphHu: { marginBottom: 4, lineHeight: 1.4 },
  paragraphEn: { marginBottom: 12, lineHeight: 1.4, color: "#5c574f" },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  signatureBlock: { width: "42%" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#25211d", marginTop: 32, paddingTop: 4 },
  signatureLabelHu: { fontSize: 9 },
  signatureLabelEn: { fontSize: 8, color: "#5c574f" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 7, color: "#8b8577" },
});

export interface DeclarationOwner {
  name: string;
}

export interface DeclarationOccupant {
  name: string;
  dob: string | null;
  documentNumber: string | null;
  citizenship: string | null;
  registrationType: string | null;
}

export interface DeclarationProperty {
  addressLine: string | null;
  hrsz: string | null;
}

function Field({ labelHu, labelEn, value }: { labelHu: string; labelEn: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.fieldLabel}>
        {labelHu} / {labelEn}
      </Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// Renders the single generic "address-registration / accommodation-
// provider consent" declaration (see declaration-content.ts for why this
// is one template, not two) for a given property, owner, and occupant.
export function DeclarationDocument({
  owners,
  property,
  occupant,
  issueDate,
}: {
  owners: DeclarationOwner[];
  property: DeclarationProperty;
  occupant: DeclarationOccupant;
  issueDate: string;
}) {
  ensurePdfFontsRegistered();
  const residence = residenceKindFromRegistrationType(occupant.registrationType);
  const consent = declarationCopy.consentStatement(residence);
  const ownerNames = owners.map((o) => o.name).join(", ") || "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titleHu}>{declarationCopy.title.hu}</Text>
        <Text style={styles.titleEn}>{declarationCopy.title.en}</Text>
        <Text style={styles.aliasNote}>
          {declarationCopy.aliasNote.hu} / {declarationCopy.aliasNote.en}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitleHu}>{declarationCopy.ownerSectionTitle.hu}</Text>
          <Text style={styles.sectionTitleEn}>{declarationCopy.ownerSectionTitle.en}</Text>
          <Field labelHu={declarationCopy.fields.name.hu} labelEn={declarationCopy.fields.name.en} value={ownerNames} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitleHu}>{declarationCopy.propertySectionTitle.hu}</Text>
          <Text style={styles.sectionTitleEn}>{declarationCopy.propertySectionTitle.en}</Text>
          <Field labelHu={declarationCopy.fields.address.hu} labelEn={declarationCopy.fields.address.en} value={property.addressLine ?? "—"} />
          {property.hrsz && (
            <Field labelHu={declarationCopy.fields.hrsz.hu} labelEn={declarationCopy.fields.hrsz.en} value={property.hrsz} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitleHu}>{declarationCopy.occupantSectionTitle.hu}</Text>
          <Text style={styles.sectionTitleEn}>{declarationCopy.occupantSectionTitle.en}</Text>
          <Field labelHu={declarationCopy.fields.name.hu} labelEn={declarationCopy.fields.name.en} value={occupant.name} />
          {occupant.dob && <Field labelHu={declarationCopy.fields.dob.hu} labelEn={declarationCopy.fields.dob.en} value={occupant.dob} />}
          {occupant.documentNumber && (
            <Field labelHu={declarationCopy.fields.documentNumber.hu} labelEn={declarationCopy.fields.documentNumber.en} value={occupant.documentNumber} />
          )}
          {occupant.citizenship && (
            <Field labelHu={declarationCopy.fields.citizenship.hu} labelEn={declarationCopy.fields.citizenship.en} value={occupant.citizenship} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.paragraphHu}>{declarationCopy.consentIntro.hu}</Text>
          <Text style={styles.paragraphEn}>{declarationCopy.consentIntro.en}</Text>
          <Text style={styles.paragraphHu}>{consent.hu}</Text>
          <Text style={styles.paragraphEn}>{consent.en}</Text>
        </View>

        <Text>
          {declarationCopy.dateLabel.hu} / {declarationCopy.dateLabel.en}: {issueDate}
        </Text>

        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabelHu}>{declarationCopy.ownerSignatureLabel.hu}</Text>
              <Text style={styles.signatureLabelEn}>{declarationCopy.ownerSignatureLabel.en}</Text>
            </View>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabelHu}>{declarationCopy.occupantSignatureLabel.hu}</Text>
              <Text style={styles.signatureLabelEn}>{declarationCopy.occupantSignatureLabel.en}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {declarationCopy.generatedNote.hu} / {declarationCopy.generatedNote.en}
        </Text>
      </Page>
    </Document>
  );
}
