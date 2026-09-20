/**
 * ── الورقةُ تقول من وقّعها، وبأيِّ أرقامٍ تُقرأ ──────────────────────────────
 *
 * ورقةٌ تخرج من الطابعة تُوزَّع وتُصوَّر وتُبنى عليها قرارات، وتعيش أطولَ من
 * الشاشة التي أنتجتها. فإن لم تحمل من وقّعها ولا حالَها من الدورة، صارت
 * مواعيدَ بلا قائل: تُقرأ بعد شهرٍ فلا يُعرف أهي المعتمدة أم مسوّدةٌ نُسخت
 * يوماً.
 *
 * وكانت خاناتُ التوقيع وعلامةُ «نسخة غير معتمدة» في التقرير الشامل وحدَه، وما
 * سواه من أوراق الاستعلام يخرج عارياً منهما.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
const printCss = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");

/* ── الختمُ والتواقيعُ خاصّيةُ الطباعة، لا خاصّيةُ نوعٍ منها ──────────────── */

check(reports.includes("function PrintSheetBody("),
  "جسمُ الورقة انفصل عن غلافها، فلا يُكرَّر الختمُ في اثني عشر فرعاً");
check(reports.includes("function PrintSheet(props: React.ComponentProps<typeof PrintSheetBody>)"),
  "والغلافُ يأخذ ما يأخذه الجسم نفسُه، فلا يفترقان عند أول حقلٍ يُضاف");
check(reports.includes('<footer className="print-sheet-attestation">')
  && reports.includes("<PrintSignatures approval={approval} />"),
  "وكلُّ ورقةٍ تحمل خاناتِ توقيعها");
check(reports.includes('<div className="print-unapproved-mark" aria-hidden="true">نسخة غير معتمدة</div>'),
  "وما لم يُعتمد يُقال على وجهه، لا في حاشيةٍ تُقصّ");

/* والشاملُ يُستثنى لأنه يحملهما في كل صفحةٍ أصلاً — لا لأنه لا يحتاجهما. */
check(reports.includes('if (kind === "comprehensive" || kind === "comprehensive-branch") return <PrintSheetBody {...props} />;'),
  "والشاملُ وحدَه يُستثنى، فهو يحملهما في كل صفحةٍ من صفحاته");

check(printCss.includes(".print-sheet-attestation{") && /\.print-sheet-attestation\{[^}]*break-inside:avoid/.test(printCss),
  "وشريطُ التواقيع لا يُقطع بين صفحتين، فلا يخرج توقيعٌ بلا اسمه");

/* ── الأرقامُ لاتينيةٌ في كل موضع ─────────────────────────────────────────
 *
 * «٢٠ سبتمبر ٢٠٢٦» بأرقامٍ هنديةٍ بجانب «C5A4BN» و«12:30» يقرؤه الناظرُ
 * رقمين مختلفين من نظامين، وهو رقمٌ واحد. والاتّفاق صريح: الأرقامُ والتواريخُ
 * في الموقع كلِّه لاتينية.
 */
const sources = [
  "server.ts",
  ...fs.readdirSync(path.join(process.cwd(), "src/components")).map(name => `src/components/${name}`),
  ...fs.readdirSync(path.join(process.cwd(), "src/utils")).map(name => `src/utils/${name}`),
].filter(file => /\.(ts|tsx)$/.test(file));

const offenders = sources.filter(file => {
  const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  /* اللغةُ بلا نظامِ ترقيمٍ صريح تُسلّم الأمرَ إلى المتصفّح، وهو يختار الهندية
     للعربية. والعلاجُ لاحقةٌ واحدةٌ يستعملها النظام كلُّه. */
  return /toLocale(?:Date|Time)?String\(\s*"ar-[A-Z]{2}"/.test(text)
    || /new Intl\.(?:DateTimeFormat|NumberFormat)\(\s*"ar-[A-Z]{2}"/.test(text);
});
check(offenders.length === 0,
  `ولا موضعَ يُنسِّق بالعربية بلا نظامِ ترقيمٍ لاتيني${offenders.length ? `: ${offenders.join("، ")}` : ""}`);

/* وبلا لغةٍ أصلاً يتبع النظامُ لغةَ جهاز القارئ — فتختلف الورقةُ بين جهازين. */
const bare = sources.filter(file =>
  /toLocale(?:Date|Time)?String\(\s*\)/.test(fs.readFileSync(path.join(process.cwd(), file), "utf8")));
check(bare.length === 0,
  `ولا موضعَ يترك التنسيقَ للغة الجهاز${bare.length ? `: ${bare.join("، ")}` : ""}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
