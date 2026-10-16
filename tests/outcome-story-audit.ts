/**
 * «بعد التسجيل: ماذا حدث؟» بالنقاط: كل نقطةٍ طالب، لونُها سببُه، وكل سببٍ بجملةٍ بسيطة وما يفعله القسم.
 */
import fs from "fs";
import { pictogram, REASON_INFO, REASON_ORDER, topReason, type OutcomeCounts } from "../src/utils/outcomeStory";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const row = (over: Partial<OutcomeCounts>): OutcomeCounts => ({ registered: 0, stuck: 0, full: 0, prereq: 0, conflict: 0, other: 0, ...over });

{
  const p = pictogram(row({ registered: 3, stuck: 3, full: 2, conflict: 1 }));
  check(p.perDot === 1 && p.dots.length === 6, "ستة طلاب = ست نقاط", p);
  check(p.dots.filter(d => d === "ok").length === 3 && p.dots.filter(d => d === "full").length === 2 && p.dots.filter(d => d === "conflict").length === 1, "الأخضر لمن سجّل، واللون سببُ من تعثّر");
  check(p.dots[0] === "ok" && p.dots.indexOf("full") < p.dots.indexOf("conflict"), "الترتيب ثابت: من سجّل أولاً ثم الأسباب بترتيبها");
}
{
  const big = pictogram(row({ registered: 200, stuck: 40, full: 30, prereq: 9, other: 1 }), 16);
  check(big.perDot > 1 && big.dots.length <= 16 + REASON_ORDER.length, `عددٌ كبير: نقطةٌ لكل ${big.perDot} طلاب، والنقاط ${big.dots.length}`, big);
  check(big.dots.includes("other"), "سببٌ واحدُه طالبٌ واحد لا يختفي (نقطةٌ على الأقل)");
}
{
  const none = pictogram(row({}));
  check(none.dots.length === 0, "بلا أجوبة: لا نقاط مخترعة");
}
{
  const top = topReason([row({ full: 2, conflict: 1 }), row({ full: 1, prereq: 1 }), row({ other: 1 })]);
  check(top?.reason === "full" && top.count === 3 && top.total === 6, "السببُ الأكثر بين كل المتعثّرين", top);
  check(topReason([row({ registered: 5 })]) === null, "لا متعثّر: لا سبب");
}
{
  check(REASON_ORDER.every(reason => REASON_INFO[reason].title && REASON_INFO[reason].plain && REASON_INFO[reason].action), "كلُّ سببٍ بعنوانٍ وجملةٍ بسيطة وما يفعله القسم");
  const ui = fs.readFileSync("src/components/RegistrationRehearsal.tsx", "utf8"), story = fs.readFileSync("src/components/OutcomeStory.tsx", "utf8");
  check(ui.includes("<OutcomeLegend rows={outcome.courses} />") && ui.includes("<OutcomeCourse key={c.courseId} row={c} />"), "قسم «بعد التسجيل» يرسم الأسبابَ ومقرراتِها بالنقاط");
  check(!ui.includes("السعة انتهت {c.full}") && !ui.includes("sm-chip ${tone}\">{label ===") , "لا شرائحَ مبهمة «السعة انتهت 2»");
  check(story.includes("AR.student") && story.includes("REASON_INFO[reason].action"), "الأعدادُ طلبةٌ بالعدّ العربي الصحيح، وتحتها ما يُفعل");
  check(ui.includes("<b>{countOf(x.n, AR.student)}</b> — {x.label}"), "قائمة «تحتاج قراراً»: كلُّ عددٍ طلبةٌ وتُقرأ جملتُه بعده");
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
