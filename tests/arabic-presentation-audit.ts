/**
 * أسماء المقررات المنسوخة من PDF تُحفظ حروفاً عادية: القاعدة في arabicText،
 * وتُطبَّق في موضع الكتابة الوحيد (createCourse/updateCourse).
 */
import fs from "fs";
import { arabicMatchKey, hasArabicPresentationForms, normalizeArabicText } from "../src/utils/arabicText";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const pdf = "ﺍﻟﺘﺼﻮﻳﺮ ﺍﻟﻀﻮﺋﻲ ﻭﺍﻹﺿﺎءﺓ";
check(hasArabicPresentationForms(pdf), "يكشف أشكال العرض");
check(normalizeArabicText(pdf) === "التصوير الضوئي والإضاءة", "NFKC يعيدها حروفاً عادية");
check(!hasArabicPresentationForms(normalizeArabicText("ورشة ﻻ")), "لام-ألف المركّبة تُفكّ");
check(normalizeArabicText("مبادئ التصوير الضوئي 2") === "مبادئ التصوير الضوئي 2", "النص العادي لا يتغيّر");
check(arabicMatchKey("قسم الدراسات الإجتماعية") === arabicMatchKey("قسم الدراسات الاجتماعية"), "المطابقة تتجاوز الهمزة");

const repo = fs.readFileSync("src/db/repository.ts", "utf8");
for (const fn of ["createCourse", "updateCourse"]) {
  const start = repo.indexOf(`  ${fn}: async (`);
  const body = repo.slice(start, repo.indexOf("invalidateReference", start));
  check(/name = normalizeArabicText\(name\)/.test(body), `${fn} يطبّع الاسم قبل الكتابة`);
}
const server = fs.readFileSync("server.ts", "utf8");
check(!/\.normalize\("NFKC"\)[^\n]*CourseName/.test(server), "لا نسخة ثانية للقاعدة في الخادم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
