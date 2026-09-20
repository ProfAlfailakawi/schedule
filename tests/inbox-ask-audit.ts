/**
 * ── تدقيق سؤال الوارد ───────────────────────────────────────────────────────
 *
 * الشريط الذي فوق دورة الاعتماد يَعِد بشيءٍ واحد: أن الجملة التي تُكتب فيه
 * تُقرأ كما قصدها كاتبها، أو لا تُقرأ فيُقال ذلك صراحةً. وما يلي هو البرهان،
 * لأن مرشّحاً يُقصي بطاقةً بصمتٍ أسوأُ من مرشّحٍ لا يعمل: الأول يُخفي قسماً
 * متأخّراً عن موظّفٍ يظنّ أنه رأى الوارد كلّه.
 */

import { EMPTY_INBOX_ASK, matchesInboxAsk, parseInboxAsk, type InboxAskCandidate } from "../src/utils/inboxAsk";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── الفراغ ─────────────────────────────────────────────────────────────── */

check(parseInboxAsk("").status === "all", "سؤالٌ فارغٌ لا يفلتر بحالة");
check(parseInboxAsk("   ").note === "", "الفراغ لا يدّعي فهماً");
check(parseInboxAsk("").understood === false, "الفراغ يُعلن أنه لم يفهم شيئاً");
check(EMPTY_INBOX_ASK.signals.length === 0, "الجملة الفارغة بلا إشارات");

/* ── الحالات ────────────────────────────────────────────────────────────── */

check(parseInboxAsk("بانتظار المراجعة").status === "submitted", "«بانتظار المراجعة» حالةُ إرسال");
check(parseInboxAsk("مرسلة").status === "submitted", "«مرسلة» حالةُ إرسال");
check(parseInboxAsk("عند القسم").status === "returned", "«عند القسم» حالةُ ردّ");
check(parseInboxAsk("مرتجع").status === "returned", "«مرتجع» حالةُ ردّ");
check(parseInboxAsk("معتمد").status === "accepted", "«معتمد» حالةُ اعتماد");
check(parseInboxAsk("اعتمدت").status === "accepted", "«اعتمدت» حالةُ اعتماد");

/* «القسم» وحدها لا تعني حالة — وهي أكثرُ كلمةٍ تردُ في أسماء الأقسام، فلو
   قُرئت حالةً لأقصت كلَّ بطاقةٍ لم تُردّ بعد عن من يبحث باسمٍ فيه «قسم». */
check(parseInboxAsk("قسم اللغة العربية").status === "all", "«قسم» في اسمٍ ليست حالة");
check(parseInboxAsk("قسم اللغة العربية").text.includes("اللغة"), "ما لم يُفهم يبقى نصّاً للبحث");

/* ── التأخّر ────────────────────────────────────────────────────────────── */

check(parseInboxAsk("متأخر").lateOnly === true, "«متأخر» تفلتر المتأخّرين");
check(parseInboxAsk("المتأخرة").lateOnly === true, "«المتأخرة» تفلتر المتأخّرين");
check(parseInboxAsk("فات الموعد").lateOnly === true, "«فات الموعد» تفلتر المتأخّرين");
check(parseInboxAsk("معتمد").lateOnly === false, "حالةٌ بلا تأخّرٍ لا تدّعي تأخّراً");

/* ── الإشارات ───────────────────────────────────────────────────────────── */

check(parseInboxAsk("فيه موانع").signals.includes("blocking"), "«موانع» إشارةُ منع");
check(parseInboxAsk("تعارضات").signals.includes("blocking"), "«تعارضات» إشارةُ منع");
check(parseInboxAsk("ملاحظات مفتوحة").signals.includes("openNotes"), "«ملاحظات مفتوحة» إشارةُ ملاحظة");
check(parseInboxAsk("ردود").signals.includes("answered"), "«ردود» إشارةُ ردّ ينتظر");
check(parseInboxAsk("شعب تنتظر").signals.includes("pendingAdditions"), "«شعب تنتظر» إشارةُ إقرار");
check(parseInboxAsk("بانتظار رئيس القسم").signals.includes("pendingAdditions"), "«بانتظار رئيس القسم» إقرارٌ لا إرسال");

/* الأطولُ أولاً: «بانتظار رئيس القسم» لا تُقرأ «بانتظار» فتصير حالةَ إرسال. */
check(parseInboxAsk("بانتظار رئيس القسم").status === "all", "العبارة الأطول تسبق، فلا تُقرأ حالةً خطأً");

/* ── الجمع ──────────────────────────────────────────────────────────────── */

const mixed = parseInboxAsk("الأقسام المتأخرة اللي عندها موانع");
check(mixed.lateOnly === true && mixed.signals.includes("blocking"), "شرطان في جملةٍ واحدةٍ يُقرآن معاً");
check(mixed.understood === true, "الجملة المفهومة تُعلن ذلك");

const named = parseInboxAsk("ملاحظات مفتوحة في التربية");
check(named.signals.includes("openNotes") && named.text === "التربية", "ما فُهم يُنزع، وما بقي اسمٌ يُبحث به");

/* ── الملاحظة المعروضة ──────────────────────────────────────────────────── */

check(parseInboxAsk("متأخر").note.includes("متأخّر"), "ما فُهم يُقال للقارئ");
check(parseInboxAsk("قسم الرياضيات").note.includes("«الرياضيات»"), "البحث بالاسم يُعرض بين قوسين");
check(parseInboxAsk("xyz").understood === false, "ما لم يُفهم لا يُدّعى فهمه");

/* ── الأرقام العربية والتطويل ───────────────────────────────────────────── */

check(parseInboxAsk("معتمـــد").status === "accepted", "التطويل لا يمنع الفهم");

/* ── المطابقة ───────────────────────────────────────────────────────────── */

const card = (extra: Partial<InboxAskCandidate> = {}): InboxAskCandidate => ({
  status: "submitted", late: false, blockingConflicts: 0, openNotes: 0,
  answeredNotes: 0, pendingAdditions: 0,
  sectionName: "اللغة العربية", collegeName: "التربية الأساسية", ...extra,
});

check(matchesInboxAsk(card(), EMPTY_INBOX_ASK), "الجملة الفارغة تُبقي كل بطاقة");
check(!matchesInboxAsk(card({ status: "accepted" }), parseInboxAsk("بانتظار المراجعة")), "الحالة تُقصي ما لا يطابقها");
check(matchesInboxAsk(card({ late: true, blockingConflicts: 2 }), mixed), "بطاقةٌ تستوفي الشرطين تمرّ");
check(!matchesInboxAsk(card({ late: true, blockingConflicts: 0 }), mixed), "استيفاءُ شرطٍ واحدٍ لا يكفي — الشروط تُجمع بـ«و»");
check(matchesInboxAsk(card(), parseInboxAsk("العربية")), "البحث بالاسم يطابق اسم القسم");
check(matchesInboxAsk(card(), parseInboxAsk("التربية")), "البحث بالاسم يطابق اسم الكلية");
check(matchesInboxAsk(card(), parseInboxAsk("الأساسية التربية")), "ترتيب الكلمات لا يمنع المطابقة");
check(!matchesInboxAsk(card(), parseInboxAsk("الهندسة")), "اسمٌ غيرُ موجودٍ يُقصي البطاقة");

/* حرفُ الجرّ وحدَه ليس اسمَ قسم: لو بقي لأقصى كلَّ بطاقةٍ لا تحمله في اسمها. */
check(matchesInboxAsk(card(), parseInboxAsk("ملاحظات في العربية")) === false, "«ملاحظات» شرطٌ حقيقيٌّ لا يُتجاهل");
check(parseInboxAsk("ملاحظات في العربية").text === "العربية", "حروف الجرّ تُنزع من نصّ البحث");
check(matchesInboxAsk(card({ openNotes: 3 }), parseInboxAsk("ملاحظات في العربية")), "البطاقة المستوفية للشرطين تمرّ");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
