import assert from "node:assert/strict";
import { parseAuthorityHeaderText } from "../src/utils/documentOcr.ts";

const generatedPhysical = `
01كليه التربيه الاساسيه الكلية : الفصل الدراسي الاول 2027-2026 الفصل :
012كليه التربيه الاساسيه بنات الفرع : التربيه الاسلاميه 0101 القسم :
`;
const generated = parseAuthorityHeaderText(generatedPhysical);
assert.equal(generated.term?.season, "first");
assert.deepEqual(generated.term?.years, [2026, 2027]);
assert.equal(generated.branch?.code, "012");
assert.match(generated.branch?.name || "", /التربيه الاساسيه بنات/);
assert.equal(generated.department?.code, "0101");
assert.match(generated.department?.name || "", /التربيه الاسلاميه/);
assert.doesNotMatch(generated.department?.label || "", /^012\s+0101|012\s/);

/* Real CamScanner-style OCR from the photographed Authority page. The OCR can
   damage the first label (القصل/الفقصل) and omit «القسم», but the independent
   0101 department + 012 branch evidence remains visible and must stay separate. */
const scannedOcr = `
SWRSCHA: التقرير
القصل: الفقصل الدراسي الصيفي 2026-2025 01 كليه التربيه الاساسيه
Cd 0101 _ التربيه الاسلاميه الفرع : 012 كليه التربيه الاساسيه بنات
`;
const scanned = parseAuthorityHeaderText(scannedOcr);
assert.equal(scanned.term?.season, "summer");
assert.deepEqual(scanned.term?.years, [2025, 2026]);
assert.equal(scanned.branch?.code, "012");
assert.match(scanned.branch?.name || "", /بنات/);
assert.equal(scanned.department?.code, "0101");
assert.equal(scanned.department?.name, "التربيه الاسلاميه");

const logical = parseAuthorityHeaderText(`
الفصل: الفصل الدراسي الاول 2027-2026
الفرع: 012 كلية التربية الأساسية بنات
القسم: 0101 التربية الإسلامية
`);
assert.equal(logical.branch?.code, "012");
assert.equal(logical.department?.code, "0101");

console.log(JSON.stringify({ passed: 3, checks: [
  "generated RTL text layer keeps 012 branch and 0101 department separate",
  "CamScanner OCR recovers branch/department independently",
  "logical Authority header remains supported",
] }, null, 2));
