/**
 * الصفحاتُ العامة (بطاقة الأستاذ، رابط الطلب، الاستبيانان، حالة الطالب) تُكتب
 * سكربتاتُها داخل قوالب نصّية في الخادم؛ علامةُ اقتباسٍ ناقصةٌ واحدة تُبقي
 * الصفحةَ على «يفتح…» إلى الأبد ولا يراها مترجمُ TypeScript. هنا تُقرأ كلُّ
 * دالّة صفحةٍ بمحلّل TypeScript نفسه، وتُبنى، ويُفحص كلُّ سكربتٍ فيها.
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import ts from "typescript";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const file = path.join(process.cwd(), "server.ts");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);

const PAGES = ["staffCardPage", "surveyPage", "studentCaseSurveyPage", "instructorRequestPage", "studentCaseStatusPage"];
const found = new Map<string, ts.FunctionDeclaration>();
source.forEachChild(node => {
  if (ts.isFunctionDeclaration(node) && node.name && PAGES.includes(node.name.text)) found.set(node.name.text, node);
});

for (const name of PAGES) {
  const node = found.get(name);
  if (!node) { check(false, `${name}: موجودة`); continue; }
  const js = ts.transpileModule(node.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const args = node.parameters.map(() => JSON.stringify("x")).join(",");
  const sandbox: any = { out: "" };
  try {
    vm.runInNewContext(`${js}\nout = ${name}(${args});`, sandbox);
  } catch (error: any) {
    check(false, `${name}: تُبنى الصفحة — ${error?.message}`);
    continue;
  }
  const html = String(sandbox.out || "");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script[^>]*>/gi)].map(m => m[1]).filter(code => code.trim());
  const errors: string[] = [];
  for (const code of scripts) {
    try { new vm.Script(code); } catch (error: any) { errors.push(String(error?.message)); }
  }
  check(scripts.length > 0 && !errors.length, `${name}: ${scripts.length} سكربت، كلُّها سليمة الصياغة${errors.length ? ` — ${errors[0]}` : ""}`);
}

console.log(`\nPublic pages syntax audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
