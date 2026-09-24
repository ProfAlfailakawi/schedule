/**
 * ── تدقيق الانتقال من الوارد إلى الورشة ─────────────────────────────────────
 *
 * الأستاذ يطلب مقرّراً جديداً، والقاعةُ والشعبةُ ليستا من اختياره. فكان
 * الوارد يقول «افتحها في الورشة» ويقف — طريقٌ مسدودٌ يترك المنسّقَ يعيد كتابةَ
 * ما قرأه للتوّ، وكلُّ حرفٍ منه فرصةُ خطأ.
 *
 * وما يلي حدودُ الحمل. وأخطرُها أن البذرةَ تبدو قراراً اتُّخذ: نموذجٌ ممتلئٌ
 * لا يُقرأ كاقتراح، بل كشيءٍ راجعه أحدٌ ووافق عليه. فما لم يقله الأستاذُ يبقى
 * فارغاً، وما قاله يُتحقَّق من شكله قبل أن يصل النموذج.
 */

import fs from "fs";
import path from "path";
import { handoffNotice, putHandoff, takeHandoff, type RequestHandoff } from "../src/utils/requestHandoff";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* التخزينُ ليس موجوداً خارج المتصفّح، فيُحاكى بأبسط ما يفي بالعقد. */
const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};

const seed = (over: Partial<RequestHandoff> = {}): RequestHandoff => ({
  requestId: "req-1", itemIndex: 2, instructorId: 7, instructorName: "د. سالم",
  courseId: 100, collegeId: 1, sectionId: 5, termId: 20,
  days: ["fsunday", "ftuesday"], start: "10:00", end: "10:50", ...over,
});

/* ── يُحمل ويُقرأ ──────────────────────────────────────────────────────── */

putHandoff(seed());
const taken = takeHandoff();
check(taken?.courseId === 100 && taken?.termId === 20, "ما قاله الأستاذ يصل كما هو");
check(taken?.days.length === 2, "وأيامُه كلُّها، لا أوّلُها");
check(taken?.itemIndex === 2 && taken?.requestId === "req-1", "ومعه البندُ وطلبُه، ليُعاد إليهما");

/* ويُمحى بأول قراءة: بذرةٌ تبقى تُزرع في كل فتحةٍ للورشة تُنتج نموذجاً مملوءاً
   بلا سبب، فيحفظه أحدٌ يوماً ظانّاً أنه فتحه بنفسه. */
check(takeHandoff() === null, "ويُمحى بأول قراءة، فلا يُزرع مرّتين");
check(takeHandoff() === null, "وقراءةٌ بلا بذرةٍ تُجيب بلا شيء، لا تُخطئ");

/* ── ما لا يصحّ لا يصل ─────────────────────────────────────────────────── */

const rejects = (raw: string, why: string) => {
  store.set("schedule.requestHandoff", raw);
  check(takeHandoff() === null, why);
};
rejects("{ليس", "نصٌّ مشوّهٌ لا يصل النموذج");
rejects(JSON.stringify({ ...seed(), courseId: 0 }), "وبذرةٌ بلا مقرّرٍ تُردّ");
rejects(JSON.stringify({ ...seed(), termId: 0 }), "وبلا فصلٍ تُردّ");
rejects(JSON.stringify({ ...seed(), requestId: "" }), "وبلا طلبٍ تُردّ");
/* `toMinutes` تقرأ ما ليس وقتاً صفراً، فنصٌّ حرٌّ كان يصير منتصفَ الليل. */
rejects(JSON.stringify({ ...seed(), start: "صباحاً" }), "ووقتٌ ليس وقتاً يُردّ");
rejects(JSON.stringify({ ...seed(), start: "" }), "وبلا بدايةٍ تُردّ");

store.set("schedule.requestHandoff", JSON.stringify({ ...seed(), days: ["fsunday", "الاثنين", 5] }));
const cleaned = takeHandoff();
check(cleaned?.days.length === 1 && cleaned.days[0] === "fsunday",
  "وأيامٌ لا يعرفها النظام تُنزع، ويبقى ما يعرفه");

/* التخزينُ قد يكون ممنوعاً: تُفتح الورشةُ فارغةً، وهو ما كان يحدث قبل هذا كلّه
   — ولا يُمنع الانتقالُ بسببه. */
const saved = (globalThis as any).sessionStorage;
(globalThis as any).sessionStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};
let threw = false;
try { putHandoff(seed()); } catch { threw = true; }
check(!threw, "وتخزينٌ ممنوعٌ لا يُسقط الشاشة عند الكتابة");
check(takeHandoff() === null, "ولا عند القراءة");
(globalThis as any).sessionStorage = saved;

/* ── الجملةُ التي تُقال للمنسّق ────────────────────────────────────────── */

const notice = handoffNotice(seed());
check(notice.includes("د. سالم"), "ويُقال من طلبها");
check(notice.includes("قرارُك"), "ويُقال إن الشعبةَ والقاعةَ قرارُه هو");

/* ── الطرفان ───────────────────────────────────────────────────────────── */

const inbox = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
const workshop = fs.readFileSync(path.join(process.cwd(), "src/components/Schedules.tsx"), "utf8");

check(inbox.includes("putHandoff({") && inbox.includes('onNavigate?.("schedules")'),
  "الواردُ يحمل البذرةَ ثم ينتقل");
check(!inbox.includes("throw new Error(\"الإضافة تُفتح في ورشة الجدول"),
  "ولم يبقَ الطريقُ المسدود");
check(inbox.includes('item.action === "add" ? "أضِفه الآن" : "ثبّت"'),
  "والزرُّ يقول ما سيفعل، فلا يَعِد بتثبيتٍ لا يقع");
check(workshop.includes("const handoff = takeHandoff();") && workshop.includes("setMessage(handoffNotice(handoff))"),
  "والورشةُ تلتقطها وتقول من أين جاءت");
/* نموذجٌ ممتلئٌ بلا تفسير يجعل القارئ يظنّ أنه فتحه بنفسه ونسي. */
check(workshop.includes("if (mode !== \"schedule\" || !courses.length) return;"),
  "وتنتظر الكتالوجَ، فلا يُعرض مقرّرٌ برقمٍ بلا اسم");

/* والقاعةُ والشعبةُ لا تُبذران: هما قرارُ القسم، وبذرُهما بقيمةٍ افتراضيةٍ
   يُنتج صفّاً ناقصاً يكتشفه أحدٌ بعد شهر. */
const seedBlock = workshop.slice(workshop.indexOf("if (seed?.collegeId)"), workshop.indexOf("setForm(next);"));
check(seedBlock.length > 40, "كتلةُ البذر مقروءةٌ للتدقيق");
/* ولا قيمةَ تُؤخذ لهما من البذرة: لا تحمل البذرةُ قاعةً أصلاً، ولا تُخترع
   هنا. وما يظهر من أسمائها في الكتلة محوٌ لما ورثه النموذج، لا بذر. */
check(!/=\s*seed[?.]*\.(roomCode|roomHall|roomId|buildingId|SCode)/.test(seedBlock),
  "ولا تُبذر شعبةٌ ولا قاعةٌ ولا مبنى من الطلب");


/* ── عطلان من مراجعةٍ آلية على العمل نفسه ──────────────────────────────── */

/* ١) البندُ كان يبقى معلّقاً إلى الأبد. الوارد يحمل البذرةَ وينتقل ولا يسجّل
      قراراً، والورشةُ تستهلكها ولا تحتفظ بمعرّف الطلب — فالإضافةُ تُحفظ،
      والبندُ يبقى كما هو، وزرُّه يُنشئها مرّةً بعد مرّة. */
check(workshop.includes("pendingHandoff.current = handoff;"),
  "الورشةُ تحتفظ بالطلب حتى يُحفظ الصفّ");
check(workshop.includes('`/api/instructor-requests/${handoff.requestId}/decide`')
  && workshop.includes('state: "fixed", scheduleId: createdRowId'),
  "ثم تسجّل القرارَ ومعه معرّفُ الصفّ الذي أنتجه الحفظ");
/* وترتيبُهما هو المهمّ: قرارٌ يُسجَّل قبل الحفظ يقول إن الطلب نُفِّذ وقد لا
   يكون — وهو الحارسُ نفسُه المفروض في الخادم. */
check(workshop.indexOf("const saved = await fetchJson(url,") < workshop.indexOf("const handoff = pendingHandoff.current;"),
  "والحفظُ أولاً، ثم القرار");
/* ومن يفتح البذرةَ ثم يتركها ويضيف موعداً آخرَ بيده كان سيُغلق بها بندَ
   الأستاذ على صفٍّ لا يخصّه. */
check(workshop.includes("const matchesHandoff = Boolean(handoff)") && workshop.includes("handoff && matchesHandoff"),
  "ولا يُغلق البندُ إلا على الصفّ المطلوب نفسِه");

/* ٢) النموذجُ يرث آخِرَ ما حُفظ — ومنه المبنى والقاعةُ ورقمُ الشعبة — فإضافةٌ
      يُفترض أن تنتظر قرارَ القسم في قاعتها كانت تُفتح وقاعةُ موعدٍ سابقٍ
      مكتوبةٌ فيها، فتُحفظ هناك سهواً. */
const clears = workshop.slice(workshop.indexOf("if (seed?.courseId) {"), workshop.indexOf("setForm(next);"));
check(/next\.AdRoomCode = "";/.test(clears) && /next\.roomId = undefined;/.test(clears)
  && /next\.buildingId = undefined;/.test(clears),
  "فتُمحى القاعةُ والمبنى الموروثان عند فتح بذرةِ طلب");
check(/next\.SCode = "";/.test(clears), "ويُمحى رقمُ الشعبة كذلك، فهو قرارُ القسم");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
