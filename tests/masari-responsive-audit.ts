/**
 * فحصُ ثبات تجربة «مساري» على الحاسوب والهاتف.
 * يُمسك تضارب CSS الذي كان يضغط أسماء المقررات إلى عمودٍ بعرض 14px،
 * والتوسّع المفاجئ إلى 1180px بعد اكتمال طلب الخريطة.
 */
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { STUDENT_HOME_CSS, STUDENT_HOME_SCRIPT, studentHomePage } from "../src/server/studentHomePage";
import { STUDENT_MAP_CSS } from "../src/server/studentMapUi";

assert.match(STUDENT_HOME_CSS, /\.app\{max-inline-size:520px/);
/* الشريط العلوي يلتفّ على الهاتف الضيق (شارة التجربة + الفصل + «الرحلة») فلا يُنتج تمريراً أفقياً. */
assert.match(STUDENT_HOME_CSS, /\.topr\{[^}]*flex-wrap:wrap[^}]*min-inline-size:0/);
assert.match(STUDENT_HOME_CSS, /header\.top\{flex-wrap:wrap\}/);
assert.doesNotMatch(STUDENT_MAP_CSS, /\.app\.km-on\{max-inline-size:1180px/);
assert.doesNotMatch(STUDENT_MAP_CSS, /@media\s*\(min-width:900px\)/);
assert.match(STUDENT_MAP_CSS, /@media\s*\(min-width:0px\)/);
assert.match(STUDENT_MAP_CSS, /\.kchbr>\.ln\{display:block;inline-size:14px/);
assert.doesNotMatch(STUDENT_MAP_CSS, /(?:^|\})\.ln\{display:block;inline-size:14px/m);
assert.match(STUDENT_MAP_CSS, /\.tk \.ln \.tx b[^\n]*overflow-wrap:anywhere/);

const html = studentHomePage("audit-nonce", "girls");
assert.match(html, /name="viewport" content="width=device-width,initial-scale=1/);
assert.match(html, /class="app"/);
assert.match(html, /audit-nonce/);
// الحقيقي والديمو يبدآن بصفحة «الآن»؛ الرابط الصريح #plan فقط يفتح «خطتي».
assert.match(STUDENT_HOME_SCRIPT, /S\.tab="now";/);
assert.match(STUDENT_HOME_SCRIPT, /data-tab="now" aria-selected="true"/);
assert.match(STUDENT_HOME_SCRIPT, /location\.hash==="#plan"\?"plan":""/);
/* ورقة إضافة مقرر: زر الإغلاق العلوي يبقى مرئياً، واللمس خارج الورقة يغلقها على الهاتف. */
assert.match(STUDENT_HOME_CSS, /\.sheet\.pool-sheet\{max-block-size:calc\(100vh - 64px\)/);
assert.match(STUDENT_HOME_CSS, /\.pool-sheet-head\{position:sticky/);
assert.match(STUDENT_HOME_SCRIPT, /el\.addEventListener\("pointerdown",function\(e\)\{if\(e\.target===el\)closeSheet\(\)\}\)/);
assert.match(STUDENT_HOME_SCRIPT, /class="pool-sheet-close" aria-label="إغلاق النافذة"/);
assert.match(STUDENT_HOME_SCRIPT, /el\.querySelector\("\.sheet"\)\.classList\.add\("pool-sheet"\)/);
assert.match(STUDENT_HOME_SCRIPT, /document\.getElementById\("pc"\)\.addEventListener\("click",closeSheet\)/);
/* بطاقات أ/ب/ج تُبقى في أماكن ثابتة، وتحتسب تعديلات كل خطة حتى عندما لا تكون مختارة. */
assert.match(STUDENT_HOME_SCRIPT, /function tkPlanCompare\(plans,current\)\{/);
assert.match(STUDENT_HOME_SCRIPT, /"ABC"\.indexOf\(a\.label\)-"ABC"\.indexOf\(b\.label\)/);
assert.match(STUDENT_HOME_SCRIPT, /t\.plans\.map\(function\(p\)\{return\{label:p\.label,items:tkItems\(p\)\}\}\)/);
assert.match(STUDENT_HOME_SCRIPT, /var next=b\.getAttribute\("data-l"\);if\(next===S\.tkPlan\)return/);
assert.match(STUDENT_HOME_SCRIPT, /'<section class="card tk"><div class="hd">/);

const jsFn = (name: string, next: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  const end = STUDENT_HOME_SCRIPT.indexOf("function " + next + "(", begin + 1);
  assert.ok(begin >= 0 && end > begin, "تستخرج دالة " + name + " من سكربت الطالب");
  return STUDENT_HOME_SCRIPT.slice(begin, end);
};
const ctx: Record<string, any> = {
  S: {
    tkRemoved: { "A:5": true, "B:15": true },
    tkAdded: {}, tkOverrides: {},
    state: { profile: { wishes: { termId: 1, targetUnits: 15, constraints: {} } }, term: { id: 1 } },
  },
  countOf: (n: number, unit: string) => n + " " + unit,
  ic: () => "", esc: (v: unknown) => String(v),
  AR: { day: "day", hour: "hour", unit: "unit", section: "section" },
};
runInNewContext([
  jsFn("tkItems", "tkOptions"),
  jsFn("tkPlanFit", "tkPlanCompare"),
  jsFn("tkPlanCompare", "tkGrid"),
].join("\n"), ctx);
const mkItems = (start: number, count: number) => Array.from({ length: count }, (_, i) => ({
  courseId: start + i, name: "Course", code: "C", credit: 3, tight: false,
  timesVisible: true, slots: [{ day: i % 5, start: 600, end: 660 }],
}));
const rawPlans = [
  { label: "C", items: mkItems(21, 4) },
  { label: "B", items: mkItems(11, 5) },
  { label: "A", items: mkItems(1, 5) },
]; // ورود الخطط بعكس ترتيبها لا يجوز أن يغيّر ترتيبها المرئي
const results = ["A", "B", "C"].map((current) => {
  const html = ctx.tkPlanCompare(rawPlans.map((p) => ({ label: p.label, items: ctx.tkItems(p) })), current) as string;
  const choices = [...html.matchAll(/data-l="([ABC])" aria-pressed="(true|false)" style="--score:(\d+)%"/g)];
  assert.equal(choices.map((m) => m[1]).join(","), "A,B,C", "أماكن أ وب وج ثابتة في كل اختيار");
  assert.deepEqual(choices.filter((m) => m[2] === "true").map((m) => m[1]), [current], "فقط الخطة التي لمسها الطالب نشطة");
  for (const label of ["A", "B", "C"]) {
    assert.ok(html.includes("الخطة " + ({ A: "أ", B: "ب", C: "ج" } as Record<string, string>)[label] + " · 12 unit"),
      "بيانات " + label + " تراعي حذف المقرر سواء كانت مختارة أم لا");
  }
  return choices.map((m) => m[1] + ":" + m[3]).join(",");
});
assert.equal(new Set(results).size, 1, "النقاط ومواقع البطاقات لا تقفز عند التنقل بين أ وب وج");

console.log("✓ مساري: العرض ثابت، النصوص غير مضغوطة، والخطط أ/ب/ج تتبدّل بثبات على الهاتف والحاسوب");