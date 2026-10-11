import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import hu from "../../messages/hu.json";
import {
  contractStatusEnum,
  depositTransactionTypeEnum,
  documentTypeEnum,
  inventoryItemStatusEnum,
  inventoryReconfirmationItemStatusEnum,
  inventoryReconfirmationStatusEnum,
  registrationTypeEnum,
  tenancyStatusEnum,
} from "../../src/db/schema/enums";
import { FIELD_POLICIES } from "../../src/db/schema/field-policies-values";
import { NOTICE_SEQUENCES, NOTICE_TYPES } from "../../src/db/schema/notices";
import { REQUEST_CATEGORIES, REQUEST_STATUSES } from "../../src/db/schema/requests";

// B-33 / B-34 (prod testing 2026-10-11): a Base UI <Select.Value /> with
// neither an `items` map on the Root nor a render-function child shows
// the raw *value* in the closed trigger — a UUID for id-valued selects,
// an untranslated enum code ("other") for enum-valued ones. That read as
// "dropdowns in mixed languages". This guard fails on any such Select.

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// Every `<Select` root (not SelectTrigger etc.) with the text up to its
// matching `</Select>`; Selects aren't nested, so the first close is it.
function selectBlocks(source: string): { tag: string; body: string }[] {
  const blocks: { tag: string; body: string }[] = [];
  const re = /<Select(?=[\s>])/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const close = source.indexOf("</Select>", m.index);
    const block = source.slice(m.index, close);
    // End of the opening tag: first `>` not inside a `{…}` expression.
    let depth = 0;
    let end = 0;
    for (let i = 0; i < block.length; i++) {
      const c = block[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && block[i - 1] !== "=") {
        end = i;
        break;
      }
    }
    blocks.push({ tag: block.slice(0, end + 1), body: block.slice(end + 1) });
  }
  return blocks;
}

describe("Select labels (B-33/B-34)", () => {
  const files = tsxFiles(join(__dirname, "../../src")).filter((f) => !f.includes("/components/ui/"));

  it("finds the app's Selects (sanity)", () => {
    const count = files.reduce((n, f) => n + selectBlocks(readFileSync(f, "utf8")).length, 0);
    expect(count).toBeGreaterThan(20);
  });

  it("every Select maps values to labels (items prop or SelectValue render child)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { tag, body } of selectBlocks(readFileSync(file, "utf8"))) {
        const hasItems = /\bitems=\{/.test(tag);
        const hasRenderChild = /<SelectValue[^>]*>\s*\{/.test(body);
        if (!hasItems && !hasRenderChild) offenders.push(`${file.split("/src/")[1]}: ${tag.split("\n")[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// Enum labels outside Selects too: every value an enum can hold must have
// a catalog key in both locales, or next-intl renders the key path.
type Catalog = Record<string, Record<string, unknown>>;
const ENUM_KEYS: [string, string, readonly string[]][] = [
  ["requests", "category_", REQUEST_CATEGORIES],
  ["requests", "status_", REQUEST_STATUSES],
  ["notices", "type_", NOTICE_TYPES],
  ["notices", "sequence_", NOTICE_SEQUENCES],
  ["fieldEditability", "policy_", FIELD_POLICIES],
  ["tenancies", "status_", tenancyStatusEnum.enumValues],
  ["tenancies", "registrationType_", registrationTypeEnum.enumValues],
  ["tenancies", "relationship_", ["co_occupant", "guest"]],
  ["persons", "documentType_", documentTypeEnum.enumValues],
  ["contracts", "status_", contractStatusEnum.enumValues],
  ["deposits", "type_", depositTransactionTypeEnum.enumValues],
  ["inventory", "itemStatus_", inventoryItemStatusEnum.enumValues],
  ["inventory", "campaignStatus_", inventoryReconfirmationStatusEnum.enumValues],
  ["inventory", "reconfirmationStatus_", inventoryReconfirmationItemStatusEnum.enumValues],
];

describe("enum catalog coverage (B-34)", () => {
  for (const [locale, catalog] of [
    ["en", en],
    ["hu", hu],
  ] as const) {
    it(`${locale} has a label for every enum value`, () => {
      const missing = ENUM_KEYS.flatMap(([ns, prefix, values]) =>
        values.filter((v) => typeof (catalog as Catalog)[ns]?.[`${prefix}${v}`] !== "string").map((v) => `${ns}.${prefix}${v}`),
      );
      expect(missing).toEqual([]);
    });
  }
});
