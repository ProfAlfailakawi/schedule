/**
 * مرقاةُ الرحلة: الحركةُ تُظهر الحقيقة ولا تصنعها.
 *
 *  ١) الاستهداف: آخرُ محطةٍ مكتملةٍ أو حاليةٍ فقط؛ لا تُضاء محطةٌ حقيقتُها معلّقة/مُرجَعة/متوقفة.
 *  ٢) أثناء المقدمة تُعرض المحطاتُ بعد المؤشّر «لاحقة»، وبعد التسوية تعود حالاتُها الحقيقية.
 *  ٣) الإيقاعُ محصورٌ بين ٣٥٠ و٧٥٠ مللي ثانية وزمنُ الكلّ لا يتجاوز ٤٫٥ ثوانٍ تقريباً.
 *  ٤) لا يُعاد التشغيلُ لنفس الكيان (playKey).
 *  ٥) الاستخدامُ العاديّ بلا reveal لا يتغيّر في شيء؛ والعرضُ على الخادم يخرج بالحالة النهائية كاملةً.
 *  ٦) النصُّ لقارئ الشاشة وaria-current يتبعان الحقيقة لا المقدمة.
 */
import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DnaStepper } from "../src/components/dna/DnaKit";
import {
  JOURNEY_SETTLE_MS, journeyAlreadyPlayed, journeyShown, journeyStepMs, journeyTarget, resetJourneyPlayed,
} from "../src/components/dna/useJourneyReveal";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

check(journeyTarget(["done", "done", "current", "pending"]) === 3, "الهدف: حتى المحطة الحالية ضمناً");
check(journeyTarget(["done", "done", "done"]) === 3, "الهدف: كلُّها مكتملة");
check(journeyTarget(["pending", "pending"]) === 0, "الهدف: لا شيء مضاء → صفر (لا مقدمة)");
check(journeyTarget(["done", "returned", "pending"]) === 1, "الهدف: لا يتخطّى محطةً مُرجَعة");
check(journeyTarget(["done", "blocked"]) === 1, "الهدف: لا يتخطّى محطةً متوقفة");

check(journeyShown("done", 0, 0) === "pending" && journeyShown("done", 0, 1) === "done", "العرض: ما بعد المؤشّر لاحقة");
check(journeyShown("returned", 1, 5) === "returned" && journeyShown("blocked", 1, null) === "blocked", "العرض: الحالات غير المضيئة تبقى كما هي حين تُبلغ");
check(journeyShown("done", 9, null) === "done", "التسوية: الحالات الحقيقية");

check(journeyStepMs(3) === 750 && journeyStepMs(100) === 350 && journeyStepMs(8) === 500, "الإيقاع محصور بين ٣٥٠ و٧٥٠");
check(journeyStepMs(5) * 5 <= 4000 && JOURNEY_SETTLE_MS <= 1600, "إيقاعُ خمس محطات ضمن ٤ ثوانٍ، والهالة الأخيرة ١٫٦ث");

resetJourneyPlayed();
check(!journeyAlreadyPlayed("a") && !journeyAlreadyPlayed(null) && !journeyAlreadyPlayed(undefined), "لا مفتاح → لا ذاكرة");

const steps = [
  { key: "a", label: "أ", state: "done" as const },
  { key: "b", label: "ب", state: "current" as const },
  { key: "c", label: "ج", state: "pending" as const },
];
const plain = renderToStaticMarkup(React.createElement(DnaStepper, { steps }));
check(!/data-journey|data-reveal|data-lit|data-just/.test(plain), "بلا reveal: لا سمات جديدة إطلاقاً");
const ssr = renderToStaticMarkup(React.createElement(DnaStepper, { steps, reveal: true, playKey: "k" }));
check(/data-journey/.test(ssr) && /data-reveal="done"/.test(ssr), "على الخادم: الحالة النهائية (data-reveal=done)");
check(/data-state="done"/.test(ssr) && /data-state="current"/.test(ssr) && !/data-lit/.test(ssr), "على الخادم: الحالات الحقيقية كاملة بلا إخفاء");
check(/aria-current="step"/.test(ssr) && /الحالية/.test(ssr), "aria-current ونصُّ القارئ حاضران");
check(/data-link="done"/.test(ssr), "الوصلة بعد المحطة المكتملة مضاءة");

const css = fs.readFileSync("src/components/dna/dna.css", "utf8");
const theme = fs.readFileSync("src/components/dna/dna-theme.css", "utf8");
check(/\[data-journey\][^{]*::after[\s\S]*?scaleX\(0\)/.test(css), "CSS: وصلةٌ تتعبّأ بـ scaleX");
check(/:dir\(ltr\)::after \{ transform-origin: left/.test(css), "CSS: اتجاهان (RTL افتراضي، LTR يسار)");
check(/dna-journey-halo 1\.5s var\(--dna-ease\) 1;/.test(css), "CSS: هالةٌ واحدة لا تتكرّر");
check(/prefers-reduced-motion: reduce[\s\S]*data-journey/.test(css), "CSS: حركةٌ مخفّضة تعطّل الانتقال والهالة");
check(/--journey-fill: var\(--brass\)/.test(theme), "الثيم: لون التعبئة سطرٌ واحد (البرونزي)");

/* ── محطات قراءة PDF: من أطوار الخادم الفعلية فقط ───────────────────────── */
import { importStageStates, noteImportPhase } from "../src/utils/importStages";
{
  const st = (...p: string[]) => importStageStates(p.reduce((a: string[], x) => noteImportPhase(a, x), []));
  check(st().join() === "current,pending,pending,pending", "قبل أي حدث: التجهيز جارٍ");
  check(st("render").join() === "current,pending,pending,pending", "render: التجهيز");
  check(st("read", "orient").join() === "current,pending,pending,pending" || st("read", "orient")[1] === "current", "read قبل orient: لا رجوع إلى الوراء");
  check(st("render", "read")[0] === "done" && st("render", "read")[1] === "current", "read: التجهيز اكتمل والقراءة جارية");
  check(st("render", "read", "match").join() === "done,done,skipped,current", "match دون rescue: التدقيق «لم يلزم» لا «اكتمل»");
  check(st("render", "read", "rescue", "match").join() === "done,done,done,current", "rescue ثم match: كلها حقيقية");
  check(st("bogus").join() === "current,pending,pending,pending", "طورٌ مجهول يُهمل");
  check(noteImportPhase(["read"], "read").length === 1, "التكرار لا يضيف");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
