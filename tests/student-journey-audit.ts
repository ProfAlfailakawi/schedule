/**
 * ── تدقيق رحلة الطالب (مراجعة الأدوار الستة، 2026-09-25) ────────────────────
 *
 * كل قسمٍ هنا يقابل ملاحظةً من قائمة «الطالب» (S1…S22). الفحوص إمّا سلوكية
 * (تستدعي الدالة المصدّرة نفسها) وإمّا بنيوية (تثبت أن القاعدة مكتوبة في
 * مكانٍ واحد وأن كلّ مستدعٍ يمرّ بها).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { validateCivilId } from "../src/utils/civilId";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const server = read("server.ts");
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

/* ── S1 الخصوصية: لا بيانات طالبٍ حقيقي في المستودع ─────────────────────── */
{
  const jpg = fs.readFileSync(path.join(ROOT, "public/graduation-sheet-example.jpg"));
  check(jpg[0] === 0xff && jpg[1] === 0xd8, "S1 نموذج صحيفة التخرج صورة JPEG صالحة");
  check(!jpg.includes(Buffer.from("Exif")), "S1 النموذج بلا بيانات EXIF (ليس لقطة شاشة من جهاز)");
  const generator = read("scripts/make-graduation-sheet-example.mjs");
  check(generator.includes("طالب تجريبي") && generator.includes("بيانات وهمية"),
    "S1 النموذج يُولَّد برمجياً ببيانات وهمية معلنة");
  const synthetic = new Set(["300010100122", "300123100006"]);
  const tracked = execSync("git ls-files server.ts src tests scripts public", { cwd: ROOT }).toString().trim().split("\n")
    .filter(file => /\.(ts|tsx|js|mjs|cjs|py|html|json)$/.test(file))
    /* The generated location registry holds 12-digit building/hall keys, not people. */
    .filter(file => !file.startsWith("src/generated/"));
  const leaks: string[] = [];
  for (const file of tracked) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of text.matchAll(/(?<![\d_])[23]\d{11}(?!\d)/g)) {
      const value = match[0];
      if (synthetic.has(value) || !validateCivilId(value).isValid) continue;
      leaks.push(`${file}:${value.slice(0, 2)}…`);
    }
    for (const match of text.matchAll(/(?<!\d)([23]\d{3})[ .-](\d{4})[ .-](\d{4})(?!\d)/g)) {
      const value = match[1] + match[2] + match[3];
      if (synthetic.has(value) || !validateCivilId(value).isValid) continue;
      leaks.push(`${file}:${value.slice(0, 2)}… (مجزّأ)`);
    }
  }
  check(leaks.length === 0, `S1 لا رقم مدني صالح غير وهمي في الشيفرة أو الاختبارات${leaks.length ? " — " + leaks.join(", ") : ""}`);
}

export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
finish();
