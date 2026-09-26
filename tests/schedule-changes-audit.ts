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

check(daysText(row()) === "الأحد · الثلاثاء", "الأيام بأسمائها لا حروفٌ ولا أرقامٌ تُفكّ");
check(daysText(row({ fsunday: true, fmonday: true, ftuesday: true, fwednesday: true, fthursday: true })) === "الأحد · الاثنين · الثلاثاء · الأربعاء · الخميس", "الأسبوع كامل بترتيبه");
check(fieldValue(row({ fsunday: false, ftuesday: false }), "days") === "—", "خانةٌ بلا قيمةٍ تُعرض شرطةً لا فراغاً");
check(Object.keys(DIFF_FIELD_LABEL).length === 6, "ست خاناتٍ تُقارَن");
check(Object.values(DIFF_FIELD_LABEL).every(label => /[؀-ۿ]/.test(label)), "كل خانةٍ لها اسمٌ عربي");

/* ── ما رُكّب في الخادم ────────────────────────────────────────────────── */

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const baselineSrc = fs.readFileSync(path.join(process.cwd(), "src/utils/changesBaseline.ts"), "utf8");
check(server.includes('app.get("/api/reports/schedule-changes"'), "تقرير التغييرات له مسار");
check(server.includes('app.get("/api/approvals/inbox"'), "صندوق الوارد له مسار");
check(server.includes("diffSchedules(baselineVersion?.rows"), "لقطة الجولة تبقى بديلاً للفصول القديمة التي لا وثيقة هيئة لها");
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
/* العدُّ صار في `insistOutcome` (R19)، يُكتب معه لحظةُ بلوغ الحدّ. */
check(server.includes("const outcome = insistOutcome(note, at);")
  && fs.readFileSync(path.join(process.cwd(), "src/utils/approvalWorkflow.ts"), "utf8").includes("const insistCount = Number(note.insistCount || 0) + 1;"),
  "ويُعدّ: الخلافُ الذي تكرّر ثلاثاً لم يعد خلافاً على قاعة");

/* ── الدورة تُغلق فعلاً ───────────────────────────────────────────────────
 *
 * أخطرُ خللٍ ممكنٍ في هذا الباب ليس رسالةً خاطئة: هو أن يعالج القسم كل
 * الملاحظات فلا يُسمح له بإعادة الإرسال، ولا سبيل أمامه إلى إغلاقها. فتقف
 * الدورة عند أول جولة، ويعود الطرفان إلى الهاتف.
 *
 * والسبب الوحيد الذي يوقعها فيه: أن يُعدّ المفتوحُ من علَمٍ مخزّن لا من
 * الحالة المحسوبة. ولذلك يُحرس العدّ هنا صراحةً. */
const submitAt = server.indexOf("async function submitToRegistrar(");
const submitBody = server.slice(submitAt, submitAt + 3000);
check(submitBody.includes("countOpenRegistrarNotes(await notesWithState("),
  "عدّ الملاحظات قبل الإرسال من الحالة المحسوبة");
check(fs.readFileSync(path.join(process.cwd(), "src/utils/approvalWorkflow.ts"), "utf8").includes('return note.origin === "registrar" && note.state === "open";'),
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
const approvalBar = fs.readFileSync(path.join(process.cwd(), "src/components/ApprovalBar.tsx"), "utf8");
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
/* ويُسمّى كاتبُها (R12): ملاحظاتُ القسم لكلٍّ كاتبُها. */
check(changes.includes('note.origin === "department" ? <em> · من القسم — <bdi>{note.userName}</bdi></em>'),
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

/* ── ٤) عزل القسم: لا تتسرّب تفاصيل قسمٍ آخر ───────────────────────── */
check(!server.includes("async function crossScopeClashes"),
  "لا تُبنى حمولةٌ تفصيلية لقسمٍ آخر ثم تُترك قرب الاستجابة");
check(server.includes('other ? " مع حجز آخر خارج نطاق القسم"'),
  "واقتراحُ السبب يذكر وجود الحجز الخارجي بلا اسم مقررٍ أو شعبة");
check(!/suggestions,\s*crossScope,\s*blockingConflicts/.test(server),
  "تقرير القسم لا يعيد crossScope في الحمولة");
check(!changes.includes("changes-cross") && !changes.includes("otherSectionName"),
  "واجهة تغييرات الجدول لا تعرض اسم أو تفاصيل قسم آخر");

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
check(changes.includes("فتحرّك ${countOf(round.changedRowCount, AR.row)}"),
  "ويُقرأ في الشريط الزمني بجانب ما طُلب");

/* ── ٧) خلافٌ لم يُحسم ──────────────────────────────────────────────────── */
check(changes.includes('Number(note.insistCount || 0) >= ESCALATE_AFTER_INSISTS')
  && fs.readFileSync(path.join(process.cwd(), "src/utils/approvalWorkflow.ts"), "utf8").includes("export const ESCALATE_AFTER_INSISTS = 3;"),
  "الخانةُ المختلَف عليها ثلاثاً تُعلَن");
/* والرسالةُ صادقة (R19): كانت تقول «إعلامٌ لرئيس القسم» ولا شيء يُعلمه. صار
   يُعرض له في شريطه، والرسالةُ تقول أين. */
check(changes.includes("ظهرت لرئيس القسم في شريط الاعتماد. إعلامٌ لا يوقف شيئاً."),
  "إعلاماً لا إجباراً: لا شيء في النظام يقف عليه");

/* ── ٨) سؤالٌ وفلترٌ بالحالة في الوارد ──────────────────────────────────────
 * الأقسام كثيرة، فطُلب بحثٌ سريعٌ وفلتر. وصار البحثُ سؤالاً بالعربية في
 * الشريط نفسه الذي فوق مركز الاستعلام — الضمانُ هو هو، وموضعُه تغيّر:
 * المطابقةُ بالاسم انتقلت إلى `matchesInboxAsk` لتُختبر وحدها في
 * `inbox-ask-audit`، والشرائحُ نزلت إلى «المزيد» ولم تُلغَ. */
check(changes.includes("<ScopeAskBar") && /askPlaceholder=\{?[^\n]*"اسأل/.test(changes),
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
check(changes.includes('view === "full"') && changes.includes('className="changes-full agenda-list"'),
  "شاشةٌ تعرض الجدول كاملاً");
/* ── وبالشكل الذي يقرؤه الناسُ كلَّ يوم ────────────────────────────────────
 * «مواعيد القسم» في ورشة الجدول هي الشكلُ المستقرّ الذي يستعمله الجميع. وكانت
 * هذه الشاشةُ تعرض اسمَ المقرّر ورقمَ الشعبة وحدهما، فيقرأ الموظّفُ «تغيّرت
 * القاعة» ولا يعرف في أيِّ موعدٍ من الأسبوع ولا من يُدرّسه. */
check(changes.includes("function ScheduleRowCard("),
  "وللصفّ مُصيّرٌ واحد، يلبسه الطرفان — ما تحرّك والجدولُ كامل");
check(changes.includes('<article className="agenda-card changes-row"'),
  "وهو `agenda-card` بأصنافه نفسِها، لا شكلٌ يشبهه فيفترق عنه عند أول تحسين");
/* ── وأين وقع التغييرُ بالضبط ─────────────────────────────────────────────
 * قائمةٌ تحت الصفّ تقول «القاعة: من ١٢٠ إلى ١٢٤» تجعل القارئ يقرأ الصفَّ ثم
 * القائمةَ ثم يربط بينهما بعينه — وهو ربطٌ يُخطئ فيه من يراجع عشرين قسماً في
 * كل جولة. فالتغييرُ يُعلَّم في خانته نفسِها، حيث يقرأ القارئُ تلك القيمة. */
check(changes.includes('<span className="changes-moved"'),
  "والتغييرُ يُعلَّم في خانته: القديمُ مشطوبٌ والجديدُ بعده");
check(changes.includes('const moved = new Map((changes || []).map(change => [change.field, change]));'),
  "وكلُّ خانةٍ تسأل عن نفسها، فلا يُعلَّم ما لم يتحرّك");
check(!changes.includes('<dl className="changes-fields">'),
  "ولم تبقَ القائمةُ المكرّرةُ تحته، فلا يُقرأ الشيءُ مرّتين");
check(changes.includes('data-changed={moved.has("time") || undefined}')
  && changes.includes('data-changed={moved.has("room") || undefined}')
  && changes.includes('data-changed={moved.has("days") || undefined}')
  && changes.includes('data-changed={moved.has("instructor") || undefined}'),
  "والخاناتُ الأربعُ تُلمَّح، فتجدها العينُ قبل أن تقرأ");
/* والأيامُ بأسمائها: «ح ث» اختصارٌ يعرفه من وضعه. */
check(server.includes('const namedDays = (row: any) =>') && server.includes('["fsunday", "الأحد"]'),
  "والأيامُ بأسمائها كما تُقرأ في الجدول الدراسيّ نفسِه");
check(server.includes('days: namedDays(row) || "بدون أيام",'),
  "وتصل الشاشةَ كذلك");

check(changes.includes('<div className="agenda-index">') && changes.includes('className="code-chip"')
  && changes.includes('<div className="agenda-time"') && changes.includes('<div className="agenda-place"'),
  "فيه الرقمُ ورمزُ المقرّر والوقتُ والمكان، كما هناك");
/* والخادم يرسل الصفَّ مشكّلاً مرّةً واحدة للطرفين: اشتقاقان يفترقان يوماً. */
check(server.includes("const asDisplayRow = (row: any) => ({") && server.includes("courseCode:"),
  "والخادمُ يشكّله مرّةً واحدةً للطرفين، فلا اشتقاقان يفترقان");
check(changes.includes('className="changes-view-toggle"'),
  "وتبديلٌ بين «ما تحرّك» و«الجدول كامل»");
check(changes.includes("rowExtras(row.scheduleId, true,") && changes.includes("rowExtras(entry.scheduleId,"),
  "والملاحظاتُ تظهر في العرضين معاً، فلا الجدول بلا ملاحظات ولا الملاحظات بلا جدول");
check(server.includes("const fullSchedule =") && server.includes("fullSchedule,"),
  "والخادم يرسل الجدول كاملاً مشكّلاً كما تُقرأ خاناتُه");
check(server.includes("const removedRows = diff.entries") && server.includes("...removedRows"),
  "والجدول الكامل يحتفظ بالمحذوف ملوّناً مع بقية المقررات");

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
check(changes.includes("role.signatureStage && !isRegistrar && !archive ? ("),
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

/* ── ١٠) أساسٌ لا يسقط إلى العدم ──────────────────────────────────────────
 *
 * حين لا تُوجد نسخةُ جولةٍ سابقة كان التقريرُ يقارن الجدولَ بلا شيء: كلُّ صفٍّ
 * «مضاف»، ولا معدَّلٌ ولا محذوفٌ البتّة. وليست حالاً نادرة — الجولةُ التي تُفتح
 * تلقائياً حين يعدّل القسمُ جدولاً مقبولاً تُنشأ بلا نسخة، فقسمٌ جولاتُه كلُّها
 * من هذا النوع لا يملك أساساً أبداً، ويقرأ موظّفُ التسجيل جدولاً كاملاً وقد
 * تحرّك فيه صفّان. */
check(server.includes("let baselineVersion = roundBaseline;")
  && server.includes('let baselineSource: "authority" | "round" | "capture" | "reviewed" | "none"'),
  "وللمقارنة أساسٌ يُسمّى مصدرُه، لا أساسٌ يغيب بصمت");
check(server.includes("await Repository.getScheduleVersions(collegeId, sectionId, termId, 100)"),
  "فإن لم تحمل الجولاتُ نسخةً، يُؤخذ من اللقطات المحفوظة — وهي تُلتقط عند كل تعديل");
check(baselineSrc.includes("historyNewestFirst.filter(item => item.id !== currentRound?.reviewedVersionId"),
  "ولا تُقارن الجولةُ بنسخةِ نفسِها، فتخرج بلا فرقٍ دائماً");
/* ولحظةُ الأساس فتحُ الجولة لا آخرُ تعديل: النُّسَخُ تُلتقط عند كلِّ تعديل،
   فأحدثُها يسبق آخرَ تعديلٍ وحدَه — وقسمٌ حذف خمسةَ صفوفٍ ثم غيّر أستاذَ سادس
   كان يُعرض للتسجيل «معدَّلٌ واحد» والحذوفُ الخمسةُ لا أثر لها. ومراجعةٌ تبدو
   صحيحةً وهي ناقصة أسوأُ من مراجعةٍ تبدو ناقصة. */
check(baselineSrc.includes('const lastLookAt = currentRound?.returnedAt || currentRound?.acceptedAt')
  && baselineSrc.includes("|| previousRound?.returnedAt || previousRound?.acceptedAt;"),
  "والمرساةُ لحظةُ آخِرِ نظرةٍ للتسجيل، لا لحظةُ آخِرِ تعديلٍ للقسم");
/* والإرسالُ ليس نظرة. ولو جُعل مرساةً لانكسرت أولُ مراجعة: القسمُ يعدّل ويوقّع
   قبل الإرسال وبعده فتُلتقط نُسَخ، فيُعرض على التسجيل «تعديلٌ واحدٌ منذ
   الإرسال» بدل الجدول كلِّه وهو أولُ مرّةٍ يراه فيها. */
check(!server.includes("|| currentRound?.submittedAt") && !baselineSrc.includes("submittedAt"),
  "والإرسالُ ليس نظرة، فلا يكون مرساة");
check(baselineSrc.includes("const candidates = historyNewestFirst.filter")
  && baselineSrc.includes("(!lastLookAt || String(item.createdAt) >= String(lastLookAt))"),
  "ومن لم ينظر إليه التسجيلُ بعدُ يستعمل أقدم لقطة محفوظة بدلاً من المقارنة بالعدم");
/* وجهةُ البحث بعد المرساة لا قبلها. واللقطةُ تحفظ ما كان قبل التعديل وتُنشأ
   لحظةَ التعديل، فكلُّ لقطةٍ لهذه الجولة أحدثُ من المرساة بالضرورة — والبحثُ
   قبلها لا ينطبق عليه شيءٌ أبداً، فيسقط الأساسُ إلى العدم ويعود البلاغُ كما
   كان. وقد وقع هذا فعلاً، وأظهره تحقّقٌ سلوكيٌّ على خادمٍ يعمل. */
check(baselineSrc.includes('String(item.createdAt) >= String(lastLookAt)'),
  "والبحثُ بعد المرساة، لأن اللقطةَ تُنشأ لحظةَ التعديل وتحفظ ما قبله");
check(baselineSrc.includes("const oldest = candidates[candidates.length - 1];")
  && server.includes("chooseCaptureBaseline(approval.rounds as any, round, history as any)"),
  "ويُؤخذ أقدمُ ما بعدها — حالُ الجدول قبل أوّلِ تعديلٍ في هذه الجولة");
check(server.includes("baselineSource,"),
  "والمصدرُ يصل الشاشة");
check(changes.includes('report.baselineSource === "none"')
  && changes.includes('report.baselineSource === "capture"')
  && changes.includes('report.baselineSource === "authority"'),
  "والشاشةُ تقول من أين تبدأ المقارنة، فلا يُقرأ «كلُّ صفٍّ مضاف» خبراً عن الجدول وهو خبرٌ عن المقارنة");
check(server.includes("authorityDraftForScope(collegeId, sectionId, termId)")
  && server.includes("const authorityComparison=buildAuthorityPdfDiff(scopedBaseline,live as any"),
  "وشاشة تغييرات الجدول تستخدم وثيقة الهيئة ومحرك تقريرها نفسه، فتظهر المحذوفات والتعديلات لا المضاف وحده");

/* ── ١١) اللائحة في موضع المراجعة نفسه ────────────────────────────────── */
check(server.includes("regulationNotices: await regulationNoticesForScope"),
  "وتصل الملاحظات اللائحية بتفاصيلها إلى شاشة التغييرات");
check(changes.includes("<RegulationReview notices={report.regulationNotices || []} onJump={onJump} rowsById={rowsById} />")
  && changes.includes('className={`review-finding'),
  "وتُعرض بتقديم شاشة الاعتماد نفسه، لا بعدّادٍ مكرر عند زر التوقيع");
check(!approvalBar.includes("approval-sign-notices") && !approvalBar.includes("regulationNotices"),
  "وشريط الاعتماد لا يكرر عدّاد اللائحة أو حالته");

/* كما في «الجدول الدراسي»: الضغطُ يفتح الملاحظةَ في مكانها بأسماء الأساتذة
   وشعبهم، والانتقالُ إلى الجدول زرٌّ صريحٌ بعدها — لا تحويلٌ عند أول ضغطة. */
check(changes.includes("const [open, setOpen] = useState(false)")
  && changes.includes('aria-expanded={open}')
  && changes.includes("setOpenBlocker(current => current === key ? null : key)")
  && changes.includes("<FindingRows rowIds={blocker.rowIds} rowsById={rowsById} onJump={onJump} />")
  && changes.includes('className="review-person-head"')
  && changes.includes("onClick={() => onJump([row.scheduleId])}")
  && !changes.includes("انتقل إلى المواعيد في الجدول")
  && !changes.includes('onClick={() => onJump(blocker.rowIds)}'),
  "ومراجعة الاعتماد مغلقة افتراضياً، والملاحظة تُفتح في مكانها بأساتذتها، والضغط على المقرّر ينقل إلى موعده وحده");
check(changes.includes('document.getElementById(`schedule-row-${id}`)')
  && changes.includes('scrollIntoView({ behavior: "smooth", block: "center" })')
  && changes.includes('changes-row-focus'),
  "والانتقال يفتح الجدول الكامل ويقف على السطر نفسه مع إبراز مؤقت");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
