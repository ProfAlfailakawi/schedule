/**
 * ── تدقيق تقرير التغييرات والملاحظة على الخانة ──────────────────────────────
 *
 * هذا التقرير هو ما يفتحه موظّف التسجيل عشرين مرّة في اليوم. وخطأٌ فيه ليس
 * خطأً في شاشة: هو أن يُقال له «تغيّرت» عمّا لم يتغيّر — فيفقد الثقة في
 * التقرير كله ويعود يقرأ الجدول من أوّله، وهو ما بُني التقرير ليُغنيه عنه.
 */

import fs from "fs";
import path from "path";
import { DIFF_FIELD_LABEL, daysText, diffSchedules, fieldValue, summarizeDiff } from "../src/utils/scheduleDiff";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20,
  AdCourseId: 100, AdCourseName: "تفاضل وتكامل", SCode: "01", AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "09:30", AdRoomCode: "أ", AdRoomHall: "101",
  ...over,
}) as any;

const names = {
  instructorById: new Map([[7, "د. سارة"], [8, "د. خالد"]]),
  courseById: new Map([[100, "تفاضل وتكامل"], [200, "جبر خطّي"]]),
};

/* ── لا تغييرَ زائف ──────────────────────────────────────────────────────── */

const same = diffSchedules([row()], [row()], names);
check(same.counts.changed === 0 && same.counts.unchanged === 1, "جدولٌ لم يُمسّ لا يُبلَّغ عنه");
check(same.entries.length === 0, "التقرير يعرض ما تحرّك فقط، لا الجدول كله");
check(summarizeDiff(same) === "لم يتغيّر شيء منذ مراجعتك", "«لم يتغيّر شيء» جوابٌ كامل يُقال صراحة");

/* أخطر ما في المقارنة: اختلاف صيغة الكتابة عن صيغة القراءة. */
const clockShapes = diffSchedules([row({ fstarttime: "8:00", fendtime: "9:30" })], [row({ fstarttime: "08:00", fendtime: "09:30" })], names);
check(clockShapes.counts.changed === 0, "«8:00» و«08:00» وقتٌ واحد: لا تغييرَ من صيغةٍ لا من قيمة");

const roomShapes = diffSchedules([row({ AdRoomCode: "أ", AdRoomHall: "101" })], [row({ AdRoomCode: "أ", AdRoomHall: "101" })], names);
check(roomShapes.counts.changed === 0, "القاعة نفسها لا تُبلَّغ");

/* ── ما تغيّر يُقال بخانته وبقيمتيه ────────────────────────────────────── */

const movedRoom = diffSchedules([row()], [row({ AdRoomHall: "205" })], names);
check(movedRoom.counts.changed === 1, "تغيير القاعة يُلتقط");
check(movedRoom.entries[0].changes.length === 1, "خانةٌ واحدة تغيّرت، فخانةٌ واحدة تُعرض — لا الصفّ كله");
check(movedRoom.entries[0].changes[0].field === "room", "الخانة تُسمّى بنفسها");
check(movedRoom.entries[0].changes[0].before === "أ / 101" && movedRoom.entries[0].changes[0].after === "أ / 205",
  "القيمة قبلُ وبعدُ معاً: «من ماذا إلى ماذا» هو السؤال دائماً");

const movedTime = diffSchedules([row()], [row({ fstarttime: "10:00", fendtime: "11:30" })], names);
check(movedTime.entries[0].changes[0].after === "10:00 – 11:30", "الوقت يُعرض مدىً مقروءاً");

const swappedInstructor = diffSchedules([row()], [row({ AdInstructorId: 8 })], names);
check(swappedInstructor.entries[0].changes[0].before === "د. سارة" && swappedInstructor.entries[0].changes[0].after === "د. خالد",
  "الأستاذ يُعرض باسمه لا برقمه: التقرير يُقرأ لا يُفكّ");

const noName = diffSchedules([row()], [row({ AdInstructorId: 99 })], { instructorById: new Map(), courseById: new Map() });
check(noName.entries[0].changes[0].after.includes("99"), "أستاذٌ بلا اسمٍ مسجّل يُعرض برقمه لا فراغاً");

const dropped = diffSchedules([row()], [row({ AdInstructorId: 0 })], names);
check(dropped.entries[0].changes[0].after === "بدون أستاذ", "الشعبة التي فقدت أستاذها تقولها صراحة");

const multi = diffSchedules([row()], [row({ AdRoomHall: "205", fstarttime: "10:00", fendtime: "11:30", AdInstructorId: 8 })], names);
check(multi.entries[0].changes.length === 3, "ثلاث خاناتٍ تغيّرت فثلاثٌ تُعرض");
check(new Set(multi.entries[0].changes.map(change => change.field)).size === 3, "لا تكرار في الخانات المعروضة");

/* ── المضاف والمحذوف ───────────────────────────────────────────────────── */

const added = diffSchedules([row()], [row(), row({ id: 2, SCode: "02" })], names);
check(added.counts.added === 1 && added.counts.unchanged === 1, "الشعبة المضافة تُلتقط وحدها");
check(added.entries[0].kind === "added" && added.entries[0].scheduleId === 2, "المضاف يُعرف بمعرّفه");

const removed = diffSchedules([row(), row({ id: 2, SCode: "02" })], [row()], names);
check(removed.counts.removed === 1, "الشعبة المحذوفة تُلتقط");
check(removed.entries[0].kind === "removed", "المحذوف يُعرض أولاً: الصفّ المضاف يراه الناظر في الجدول، والمحذوف لا أثر له فيه");
check(removed.entries[0].row.SCode === "02", "المحذوف يُعرض بما كان عليه قبل حذفه");

const mixed = diffSchedules(
  [row(), row({ id: 2, SCode: "02" }), row({ id: 3, SCode: "03" })],
  [row({ AdRoomHall: "205" }), row({ id: 3, SCode: "03" }), row({ id: 4, SCode: "04" })],
  names,
);
check(mixed.counts.added === 1 && mixed.counts.removed === 1 && mixed.counts.changed === 1 && mixed.counts.unchanged === 1,
  "الأنواع الأربعة تُحصى معاً بلا تداخل");
check(mixed.entries[0].kind === "removed" && mixed.entries[mixed.entries.length - 1].kind === "changed",
  "الترتيب كما يُقرأ: محذوفٌ ثم مضافٌ ثم معدّل");
check(summarizeDiff(mixed) === "1 مضاف · 1 محذوف · 1 معدّل", "السطر الملخّص يقول الثلاثة بترتيبٍ ثابت");

/* ── أول مراجعة ────────────────────────────────────────────────────────── */

const first = diffSchedules(undefined, [row(), row({ id: 2 })], names);
check(first.firstReview && first.counts.added === 2, "أول مراجعةٍ: كل صفٍّ مضاف — وهذا صحيحٌ منطقياً لا استثناء");
check(summarizeDiff(first).includes("جدولٌ جديد"), "أول مراجعةٍ تُسمّى باسمها لا تُعرض «٤٠ مضافاً»");
check(diffSchedules([], [row()], names).firstReview, "قائمةٌ فارغة كغيابها");
check(!diffSchedules([row()], [row()], names).firstReview, "أساسٌ موجود ليس أول مراجعة");

const emptied = diffSchedules([row(), row({ id: 2 })], [], names);
check(emptied.counts.removed === 2, "جدولٌ أُفرغ: كل صفٍّ محذوف — وهو أهمّ تقريرٍ ممكن");

/* ── العرض ─────────────────────────────────────────────────────────────── */

check(daysText(row()) === "ح ث", "الأيام حروفٌ تُقرأ لا أرقامٌ تُفكّ");
check(daysText(row({ fsunday: true, fmonday: true, ftuesday: true, fwednesday: true, fthursday: true })) === "ح ن ث ر خ", "الأسبوع كامل بترتيبه");
check(fieldValue(row({ fsunday: false, ftuesday: false }), "days") === "—", "خانةٌ بلا قيمةٍ تُعرض شرطةً لا فراغاً");
check(Object.keys(DIFF_FIELD_LABEL).length === 6, "ست خاناتٍ تُقارَن");
check(Object.values(DIFF_FIELD_LABEL).every(label => /[؀-ۿ]/.test(label)), "كل خانةٍ لها اسمٌ عربي");

/* ── ما رُكّب في الخادم ────────────────────────────────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes('app.get("/api/reports/schedule-changes"'), "تقرير التغييرات له مسار");
check(server.includes('app.get("/api/approvals/inbox"'), "صندوق الوارد له مسار");
check(server.includes("diffSchedules(baselineVersion?.rows"), "المقارنة بآخر نسخةٍ رآها التسجيل، لا بملفّ الاعتماد");
check(server.includes("noteFieldValue"), "قيمة الخانة تُلتقط لحظة الملاحظة");
check(server.includes('function noteState'), "حالة الملاحظة تُحسب من الواقع");
check(server.includes('return noteFieldValue(row, field) !== String(note.valueAtNote ?? "") ? "changed" : "open";'),
  "«عُولجت» تُستنتج من تغيّر الخانة، فلا يمكن أن تُدّعى وهي على حالها");
check(server.includes('app.post("/api/schedule-notes/:id/rebut"'), "ردّ القسم على الملاحظة له مسار");
check(server.includes("اكتب سبب الإبقاء"), "الردّ بلا سببٍ مرفوض");
check(server.includes('app.post("/api/schedule-notes/:id/verdict"'), "قرار التسجيل على الردّ له مسار");
/* المحو يُطلب بقائمة أسماء لا بقيمةٍ غائبة: تمريرُ `undefined` كان يُسقَط قبل
   الكتابة، فيبقى الردّ وتبقى الخانة رماديةً إلى الأبد. */
check(server.includes('rebuttalVerdict: "insisted",') && server.includes('}, ["rebuttal"]);'),
  "الإصرار يمحو الردّ: الخانة تعود برتقاليةً تنتظر، لا رماديةً أُجيب عنها");
check(server.includes("insistCount: Number(note.insistCount || 0) + 1"),
  "ويُعدّ: الخلافُ الذي تكرّر ثلاثاً لم يعد خلافاً على قاعة");

/* ── الدورة تُغلق فعلاً ───────────────────────────────────────────────────
 *
 * أخطرُ خللٍ ممكنٍ في هذا الباب ليس رسالةً خاطئة: هو أن يعالج القسم كل
 * الملاحظات فلا يُسمح له بإعادة الإرسال، ولا سبيل أمامه إلى إغلاقها. فتقف
 * الدورة عند أول جولة، ويعود الطرفان إلى الهاتف.
 *
 * والسبب الوحيد الذي يوقعها فيه: أن يُعدّ المفتوحُ من علَمٍ مخزّن لا من
 * الحالة المحسوبة. ولذلك يُحرس العدّ هنا صراحةً. */
const submitAt = server.indexOf('app.post("/api/approvals/submit"');
const submitBody = server.slice(submitAt, submitAt + 3000);
check(submitBody.includes("await notesWithState("),
  "عدّ الملاحظات قبل الإرسال من الحالة المحسوبة");
check(submitBody.includes('note.state === "open"'),
  "المفتوح وحده يمنع الإرسال: ما عُولج لا يُحسب");
check(!submitBody.includes("!note.resolved"),
  "لا يُقرأ علَم `resolved`: لا شيء يرفعه عن ملاحظةٍ عالجها القسم، فقراءته تقفل الدورة إلى الأبد");

const returnAt = server.indexOf('app.post("/api/approvals/return"');
const returnBody = server.slice(returnAt, returnAt + 3000);
check(returnBody.includes("await notesWithState("), "والإرجاع يعدّ بالمقياس نفسه");
check(!returnBody.includes("!note.resolved"), "ولا يقرأ العلَم هو أيضاً");

/* ══════════════════════════════════════════════════════════════════════════
   ما بقي من الخطة، بنداً بنداً
   ══════════════════════════════════════════════════════════════════════════ */

const changes = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleChanges.tsx"), "utf8");
const appSrc = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
const roles = fs.readFileSync(path.join(process.cwd(), "src/utils/academicRoles.ts"), "utf8");
const ask = fs.readFileSync(path.join(process.cwd(), "src/utils/inboxAsk.ts"), "utf8");

/* ── ١) رئيس القسم يعلّق ولا يعدّل ───────────────────────────────────────
 * أوّلُ ما طُلب في هذا العمل. وكانت الخاناتُ تُفتح لمن يقرّر، فبقي من يعلّق
 * بلا باب: يرى ملاحظات التسجيل ولا يملك أن يكتب واحدة. */
check(roles.includes("export function canAnnotateCells"), "التعليق على الخانة صفةٌ قائمة بذاتها");
check(changes.includes("const canAnnotate = role.canAnnotate;"), "والشاشة تقرؤها");
check(changes.includes("canAnnotate && annotatable ? (") && changes.includes('className="changes-note-add"'),
  "وتفتح الخانات لمن يعلّق، لا لمن يقرّر");
check(!changes.includes("{isRegistrar && entry.kind !== \"removed\" ? ("),
  "فلم يبقَ بابٌ مقفلٌ في وجه رئيس القسم");
check(server.includes("if (!canAnnotateCells(req.user?.Role) && !isPowerUser(req))"),
  "والخادم يقرأ الإذن من الدالّة نفسها: لا يُفتح في إحداهما ما يُقفل في الأخرى");
check(changes.includes('note.origin === "department" ? <em> · من القسم</em>'),
  "ومصدرُ الملاحظة يُقال: ملاحظةُ التسجيل تمنع الإرسال، وملاحظةُ القسم لا تمنع");

/* ── ٢) عميد التسجيل يفتح الوارد ولا يقرّر فيه ──────────────────────────── */
check(roles.includes("export function watchesInbox"), "فتحُ الوارد صفةٌ قائمة بذاتها");
check(/registrarDean/.test(roles.slice(roles.indexOf("export function watchesInbox"), roles.indexOf("export function watchesInbox") + 400)),
  "وعميدُ التسجيل منها");
check(appSrc.includes("const opensChangesScreen ="), "والشاشة تُفتح بمن يقرّر أو يعلّق أو يطّلع");
check(!appSrc.includes("sessionRole.canReview || sessionRole.signatureStage ? ("),
  "لا بمن يقرّر وحده");
check(server.includes("canReviewSubmissions(req.user?.Role) || watchesInbox(req.user?.Role)"),
  "وعدّادُ الوارد يصله كما يصل موظّفيه");

/* ── ٣) السببُ جاهزٌ قبل أن يُكتب ───────────────────────────────────────── */
check(server.includes("async function noteSuggestions"), "النظام يقترح سببَ الملاحظة مما يعرفه");
check(server.includes('put(ownId, "room", `القاعة محجوزة في هذا الوقت'), "من فاحص التعارضات");
check(server.includes("const findings = reviewSchedule({"), "ومن فاحص اللائحة");
check(changes.includes("report.suggestions?.[`${scheduleId}:${field}`]"),
  "ويُملأ في الصندوق: اقتراحٌ لا حكم، يُمحى إن شاء ويُكتب غيره");

/* ── ٤) المقرر المشترك: يُعرض ولا يُعلَّق عليه ──────────────────────────── */
check(server.includes("async function crossScopeClashes"), "التعارضُ مع قسمٍ آخر يُحسب");
check(server.includes("visible: Boolean(req.user?.IsAdminUser || isScopeAllowed("),
  "وتفاصيلُ الموعد المقابل لا تخرج إلى من ليس في نطاقه");
check(changes.includes("changes-cross"), "ويُعرض تحت صفّه");
check(changes.includes("بمقايضة القاعات بين القسمين، لا بملاحظةٍ على هذا الصفّ"),
  "ويقول أين بابُه: المقايضةُ القائمة، لا صندوقُ الملاحظات");

/* ── ٥) نقطةٌ واحدة، معنىً واحد ─────────────────────────────────────────
 * نقطةُ الجدول تخصّ مقايضة القاعات منذ قبل هذا العمل. وجمعُ عدّاد الملاحظات
 * إليها كان يجعلها تقول شيئين لا يُفرَّق بينهما. فبقيت لصاحبها، وعدّادُ
 * الملاحظات على أيقونته — ومعه شريطُ الاعتماد فوق الجدول يقول الخبر بنصّه. */
check(appSrc.includes("badge={barterPending}"), "نقطةُ المقايضة بقيت لمعناها وحده");
check(appSrc.includes("badge={changesBadge}"), "وعدّادُ الملاحظات على أيقونة تغييرات الجدول");
check(appSrc.includes("const opensChangesScreen ="), "وهي مفتوحةٌ لكل من يشارك في الدورة، فيصله عدّاده");

/* ── ٦) ما طُلب وما فُعل ────────────────────────────────────────────────── */
check(server.includes("changedRowCount = moved.counts.added + moved.counts.removed + moved.counts.changed;"),
  "كلُّ جولةٍ تحمل عدد الصفوف التي تحرّكت رداً على ملاحظاتها");
check(server.includes("/* عددٌ يُعرض، لا شرطٌ يُحتسب: تعذّره لا يمنع الإرسال. */"),
  "وحسابُه لا يمنع إرسالاً");
check(changes.includes("فتحرّك ${round.changedRowCount} صفّاً"),
  "ويُقرأ في الشريط الزمني بجانب ما طُلب");

/* ── ٧) خلافٌ لم يُحسم ──────────────────────────────────────────────────── */
check(changes.includes('Number(note.insistCount || 0) >= 3'), "الخانةُ المختلَف عليها ثلاثاً تُعلَن");
check(changes.includes("إعلامٌ لرئيس القسم، ولا شيء يقف عليه"),
  "إعلاماً لا إجباراً: لا شيء في النظام يقف عليه");

/* ── ٨) سؤالٌ وفلترٌ بالحالة في الوارد ──────────────────────────────────────
 * الأقسام كثيرة، فطُلب بحثٌ سريعٌ وفلتر. وصار البحثُ سؤالاً بالعربية في
 * الشريط نفسه الذي فوق مركز الاستعلام — الضمانُ هو هو، وموضعُه تغيّر:
 * المطابقةُ بالاسم انتقلت إلى `matchesInboxAsk` لتُختبر وحدها في
 * `inbox-ask-audit`، والشرائحُ نزلت إلى «المزيد» ولم تُلغَ. */
check(changes.includes("<ScopeAskBar") && changes.includes('askPlaceholder="اسأل'),
  "الوارد يبدأ بسؤالٍ بالعربية، بالشريط نفسه الذي فوق مركز الاستعلام");
check(changes.includes('className="changes-filter-chips"') && changes.includes('setStatusFilter('),
  "وفلترٌ بالحالة بشرائح تحمل أعدادها");
check(changes.includes("matchesInboxAsk(row, effective)"),
  "والبحثُ يطابق اسمَ القسم والكلية معاً — في دالّةٍ نقيّةٍ مُختبرة");
check(ask.includes("`${row.sectionName || \"\"} ${row.collegeName || \"\"}`"),
  "والمطابقةُ نفسها تقرأ الاسمين معاً، لا أحدَهما");
check(ask.includes("words.every(word => haystack.includes(word))"),
  "وتطابق بالكلمات، فترتيبُ كلمتين لا يُخفي قسماً");
/* «اختر الفصل» خيارٌ يُنقر، ونقرُه يُفرّغ الفصل فيختفي الشريطُ الذي يحمل
   قائمته. فلولا منتقي الفصل في ركن العنوان لبقي القارئ أمام شاشةٍ فارغةٍ لا
   مخرجَ منها إلا إعادة التحميل. */
check(changes.includes("terms.length > 1 && (active || !termId)"),
  "ومنتقي الفصل يبقى مطروقاً حين لا فصلَ مختار، فلا تُغلق الشاشةُ على نفسها");

/* ── ٩) الجدول كامل مع الملاحظات، لا الملاحظات وحدها ───────────────────────
 * أهمُّ ما طلبه القسم: أن يرى جدولَه كلَّه والملاحظات في مواضعها. */
check(changes.includes('view === "full"') && changes.includes('className="changes-full"'),
  "شاشةٌ تعرض الجدول كاملاً");
check(changes.includes('className="changes-view-toggle"'),
  "وتبديلٌ بين «ما تحرّك» و«الجدول كامل»");
check(changes.includes("rowExtras(row.scheduleId, true,") && changes.includes("rowExtras(entry.scheduleId,"),
  "والملاحظاتُ تظهر في العرضين معاً، فلا الجدول بلا ملاحظات ولا الملاحظات بلا جدول");
check(server.includes("const fullSchedule =") && server.includes("fullSchedule,"),
  "والخادم يرسل الجدول كاملاً مشكّلاً كما تُقرأ خاناتُه");

/* ── ١٠) زرُّ تعليقٍ واحدٍ بدل ستّة أزرار ───────────────────────────────────
 * الصفُّ من ستّة أزرارٍ لكل موعدٍ كان تلوّثاً بصرياً؛ صار زرّاً واحداً يفتح ورقةً
 * فيها اختيار الخانة. */
check(!changes.includes("changes-note-targets"),
  "لم يبقَ صفُّ الأزرار الستّة الذي يزاحم كل موعد");
check(changes.includes('<span>الخانة</span>') && changes.includes("Object.keys(DIFF_FIELD_LABEL) as DiffFieldKey[]"),
  "واختيارُ الخانة انتقل إلى داخل ورقة الملاحظة");

/* ── ١١) رئيس القسم واللجنة يوقّعان من شاشة التغييرات، لا من ورشة تعديل ──────
 * رئيس القسم يقرأ ولا يعدّل: لا ورشةَ له، وشريطُ الاعتماد يُعرض في شاشة
 * التغييرات لجهة القسم (من يوقّع)، لا للتسجيل (من يقرّر بالقبول والإرجاع). */
check(changes.includes('import ApprovalBar from "./ApprovalBar"'), "شاشة التغييرات تحمل شريط الاعتماد");
check(changes.includes("role.signatureStage && !isRegistrar ? ("),
  "ويُعرض لجهة القسم (من يوقّع) لا للتسجيل (من يقرّر)");
// كتلةُ تعريف رئيس القسم وحدها: من معرّفه إلى أول `order:` بعده.
const deptBlock = (() => {
  const start = roles.indexOf('id: "departmentHead"');
  const order = roles.indexOf("order:", start);
  return start >= 0 ? roles.slice(start, order) : "";
})();
check(deptBlock.includes('landing: "changes"'), "ورئيس القسم يفتح على شاشة التغييرات");
// سطرُ الصلاحيات وحده، لا الكتلة كلها (تعليقُها يذكر اسم الشاشة شرحاً).
const deptFormIds = (deptBlock.match(/formIds:\s*\[[^\]]*\]/) || [""])[0];
check(deptFormIds && !deptFormIds.includes("SCHEDULE_WORKSPACE"), "ولا يملك شاشة الورشة: لا تعديل ولا حذف");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
