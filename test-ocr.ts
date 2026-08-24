import { readFileSync } from "fs";
const file = readFileSync("src/utils/documentOcr.ts", "utf8");

// Extract fold and isHeaderLine
const foldMatch = file.match(/const fold=\(value:string\)=>.+?;/);
const isHeaderMatch = file.match(/function isHeaderLine[\s\S]+?return false;\n}/);

if (!foldMatch || !isHeaderMatch) {
  console.log("Could not find functions");
  process.exit(1);
}

const code = `
${foldMatch[0]}
${isHeaderMatch[0]}

const tests = [
  "التسجيل التقرير SWRSCHA :",
  "جدول الفصل | جميع الشعب | التاريخ صفحة : 14:50 2026-06-02 1 من 4",
  "الفصل : الفصل الدراسي الاول 2026-2027 | الكلية : 01 كليه التربيه الاساسيه",
  "القسم : 0101 التربيه الاسلاميه | الفرع : 012 كليه التربيه الاساسيه بنات",
  "التسجيل التقرير SWRSCHA",
  " الفصل : 01"
];

for (const t of tests) {
  console.log('Testing:', t);
  console.log('Folded:', fold(t));
  console.log('isHeaderLine:', isHeaderLine(t));
  console.log('-----------------');
}
`;

require('fs').writeFileSync('test-ocr.js', require('typescript').transpile(code));
