/**
 * ── المقترح الدراسي: القواعد المشتركة (سلوكٌ لا نصوص) ─────────────────────────
 *
 * يختبر src/utils/studyProposal.ts على جداول اصطناعية: تطبيق العمليات على الجدول
 * الناتج، وعدم احتساب الموعد المستبدَل مرتين، وكشف ما تغيّر تحت المقترح، والنسخ
 * والردود، وجاهزية التثبيت. الحكمُ على التعارض نفسه يقوم به فاحصُ الجدول، ويُختبر
 * في tests/study-proposal-flow-audit.ts عبر الخادم.
 */
import type { AdCourse, FSchedule, StudyProposal, StudyProposalOp } from "../src/types";
import {
  applyProposalOps, commitReadiness, decisionStateOf, effectiveStatus, expiryAfterDays, materialFingerprint, nextSectionCodeFrom,
  proposalDrift, proposalMetrics, responseGate, snapshotOf, validateOps, tempRowId, assignmentIsAdjusted, PROPOSAL_MAX_OPS,
} from "../src/utils/studyProposal";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const PLACEHOLDER = 99, TEACHER = 7;
const courses: AdCourse[] = [
  { AdCourseId: 1, AdCollegeId: 1, AdSectionId: 1, CourseCode: "CS101", CourseName: "برمجة", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
  { AdCourseId: 2, AdCollegeId: 1, AdSectionId: 1, CourseCode: "CS201", CourseName: "بيانات", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
  { AdCourseId: 3, AdCollegeId: 1, AdSectionId: 1, CourseCode: "CS301", CourseName: "ذكاء", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
  { AdCourseId: 4, AdCollegeId: 1, AdSectionId: 1, CourseCode: "CS401", CourseName: "بلا ساعات", CourseCredit: 0, CourseHours: 0, MaxStudent: 30 },
];
const catalog = { courseById: new Map(courses.map(c => [c.AdCourseId, c])) as any };

const row = (id: number, course: number, scode: string, instructor: number, days: string, start: string, end: string, extra: Partial<FSchedule> = {}): FSchedule => ({
  id, rev: 1, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: course, AdCourseName: courses.find(c => c.AdCourseId === course)!.CourseName,
  SCode: scode, AdInstructorId: instructor,
  fsunday: days.includes("S"), fmonday: days.includes("M"), ftuesday: days.includes("T"), fwednesday: days.includes("W"), fthursday: days.includes("H"),
  fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: "101", buildingId: "b1", roomId: "r101", locationStatus: "VERIFIED", fdetail: "",
  ...extra,
} as FSchedule);

const term: FSchedule[] = [
  row(1, 1, "501", TEACHER, "ST", "08:00", "08:50"),          // موعد الأستاذ
  row(2, 2, "501", TEACHER, "MW", "10:00", "11:20"),          // موعد الأستاذ
  row(10, 3, "502", PLACEHOLDER, "ST", "12:00", "12:50"),     // شعبة «هيئة تدريسية»
  row(11, 3, "503", PLACEHOLDER, "MW", "12:00", "13:20"),     // شعبة «هيئة تدريسية» أخرى
  row(20, 1, "502", 55, "ST", "08:00", "08:50"),              // أستاذ آخر
];
const target = (c: number, scode: string, days: any[], s: string, e: string) => ({
  AdCollegeId: 1, AdSectionId: 1, AdCourseId: c, courseName: courses.find(x => x.AdCourseId === c)!.CourseName, courseCode: courses.find(x => x.AdCourseId === c)!.CourseCode,
  SCode: scode, days, fstarttime: s, fendtime: e, AdRoomCode: "B1", AdRoomHall: "101", buildingId: "b1", roomId: "r101", locationStatus: "VERIFIED" as const,
});
const snap = (id: number) => snapshotOf(term.find(r => r.id === id)!, catalog);
const ctx = { instructorId: TEACHER, termId: 1, placeholderId: PLACEHOLDER };

/* ── ١) إسناد شعبة قائمة: الصفُّ نفسُه ينتقل، ولا نسخة ثانية ──────────────── */
const assign: StudyProposalOp = { id: "a1", kind: "assign", source: snap(10), target: target(3, "502", ["fsunday", "ftuesday"], "12:00", "12:50") };
{
  const out = applyProposalOps(term, [assign], ctx);
  const moved = out.rows.filter(r => r.id === 10);
  check(out.rows.length === term.length, "الإسناد لا يضيف صفاً: عدد صفوف الفصل كما هو (لا نسخة جديدة من الشعبة)");
  check(moved.length === 1 && moved[0].AdInstructorId === TEACHER, "الشعبة نفسها (المعرّف 10) تصير للأستاذ المستهدف لا لـ«هيئة تدريسية»");
  check(out.incoming.get("a1")?.id === 10, "الموعد الداخل يحتفظ بمرجع الشعبة الأصلية");
  check(!assignmentIsAdjusted(assign), "إسنادها كما هي: لا تعديل في موعدها");
  check(assignmentIsAdjusted({ ...assign, target: { ...assign.target, fstarttime: "13:00", fendtime: "13:50" } }), "إسنادها مع تعديل موعدها يُعدّ تعديلاً");
}

/* ── ٢) شعبةٌ جديدة: تُنشأ في الجدول الناتج بمعرّف مؤقتٍ سالب فقط ───────── */
const create: StudyProposalOp = { id: "c1", kind: "create", target: target(2, "502", ["fthursday"], "09:00", "10:30") };
{
  const out = applyProposalOps(term, [create], ctx);
  const made = out.incoming.get("c1")!;
  check(out.rows.length === term.length + 1, "الجدول الناتج يحمل الشعبة الجديدة");
  check(Number(made.id) === tempRowId(0) && Number(made.id) < 0, "معرّفها مؤقتٌ سالب: لا موعد حقيقياً أُنشئ");
  check(!term.some(r => r.AdCourseId === 2 && r.SCode === "502"), "الجدول الفعلي (المدخل) لم يتغيّر");
  check(made.AdInstructorId === TEACHER && made.AdTermId === 1, "الأستاذ والفصل مقرّران سلفاً");
  check(made.fdetail === "5", "fdetail يُشتق من الأيام (الخميس = 5)");
}

/* ── ٣) تعديل موعد قائم ───────────────────────────────────────────────── */
const edit: StudyProposalOp = { id: "e1", kind: "edit", source: snap(2), target: target(2, "501", ["fmonday", "fwednesday"], "14:00", "15:20") };
{
  const out = applyProposalOps(term, [edit], ctx);
  const changed = out.rows.find(r => r.id === 2)!;
  check(out.rows.length === term.length, "التعديل لا يضيف صفاً");
  check(changed.fstarttime === "14:00" && changed.AdInstructorId === TEACHER, "الموعد المعدّل بوقته الجديد وأستاذه");
}

/* ── ٤) استبدال: يخرج موعدٌ ويدخل غيره، ولا يُحسب القديم والجديد معاً ──── */
const replace: StudyProposalOp = {
  id: "r1", kind: "replace", incoming: "assign", source: snap(10),
  out: { snapshot: snap(1), action: "unassign" }, target: target(3, "502", ["fsunday", "ftuesday"], "12:00", "12:50"),
};
{
  const before = proposalMetrics(term.filter(r => r.AdInstructorId === TEACHER), catalog.courseById);
  const out = applyProposalOps(term, [replace], ctx);
  const mine = out.rows.filter(r => r.AdInstructorId === TEACHER);
  const after = proposalMetrics(mine, catalog.courseById);
  check(mine.length === 2 && !mine.some(r => r.id === 1) && mine.some(r => r.id === 10), "الموعد الخارج لا يبقى في جدول الأستاذ والداخل يدخل");
  check(out.rows.find(r => r.id === 1)?.AdInstructorId === PLACEHOLDER, "فكُّ الإسناد يعيد الموعد إلى «هيئة تدريسية» ولا يحذفه من جدول القسم");
  check(after.sections === before.sections, "عدد الشعب بعد الاستبدال = قبله (لا تُحسب القديمة والجديدة معاً)");
  check(after.teachingMinutes === 260 && before.teachingMinutes === 260, "دقائق التدريس تُحسب على الجدول الناتج وحده");
  const deleted = applyProposalOps(term, [{ ...replace, out: { snapshot: snap(1), action: "delete" } }], ctx);
  check(!deleted.rows.some(r => r.id === 1) && deleted.outgoing[0].action === "delete", "حذف الموعد الخارج (إن صُرّح به) يزيله من الجدول الناتج");
  const noPlaceholder = applyProposalOps(term, [replace], { ...ctx, placeholderId: null });
  check(noPlaceholder.errors.some(e => e.code === "no-placeholder"), "فكُّ الإسناد بلا سجلّ «هيئة تدريسية» يُرفض بسببٍ صريح لا يُحذف صمتاً");
}

/* ── ٥) إزالة المادة من الأستاذ ≠ حذف الشعبة من القسم ───────────────────── */
{
  const out = applyProposalOps(term, [replace], ctx);
  check(out.rows.some(r => r.id === 1), "الشعبة المفكوك إسنادها ما زالت في جدول القسم");
}

/* ── ٦) عدة مواد معاً ─────────────────────────────────────────────────── */
{
  const out = applyProposalOps(term, [assign, create, edit], ctx);
  check(out.rows.length === term.length + 1, "ثلاث مواد: إسنادٌ وتعديلٌ لا يضيفان، والجديدة تضيف صفاً واحداً");
  check(out.touchedIds.sort((a, b) => a - b).join() === [2, 10].join(), "المواعيد القائمة المتأثرة محصورة بما يمسّه المقترح");
  const only = applyProposalOps(term, [assign, create, edit], { ...ctx, onlyOpIds: new Set(["c1"]) });
  check(only.rows.length === term.length + 1 && !only.incoming.has("a1") && only.rows.find(r => r.id === 10)!.AdInstructorId === PLACEHOLDER, "التثبيت الجزئي يطبّق المواد المحددة وحدها");
}

/* ── ٧) المقاييس: نصابٌ لا يُخمَّن ─────────────────────────────────────── */
{
  const m = proposalMetrics(term.filter(r => r.AdInstructorId === TEACHER), catalog.courseById);
  check(m.sections === 2 && m.loadUnits === 6, "النصاب بالساعات المعتمدة لكل شعبةٍ مرّة");
  check(m.attendanceDays === 4 && m.dayKeys.join() === "fsunday,fmonday,ftuesday,fwednesday", "أيام الحضور من الجدول الفعلي (أحد واثنين وثلاثاء وأربعاء)");
  check(m.presenceMinutes >= m.teachingMinutes, "ساعات الحضور تميّز عن دقائق التدريس ولا تقلّ عنها");
  const unknown = proposalMetrics([row(30, 4, "501", TEACHER, "S", "08:00", "08:50")], catalog.courseById);
  check(unknown.loadUnits === null && unknown.unknown.includes("load"), "ساعاتٌ غير مسجّلة: «غير متوفر» لا صفر");
  const none = proposalMetrics([], catalog.courseById);
  check(none.sections === 0 && none.loadUnits === 0 && !none.unknown.length, "أستاذ بلا مواعيد: أصفارٌ صادقة لا «غير متوفر»");
}

/* ── ٨) ما تغيّر تحت المقترح يُكشف ولا يُنفَّذ بديلٌ صامت ──────────────── */
{
  const none = proposalDrift([assign, replace], term, new Set([PLACEHOLDER]), { instructorId: TEACHER });
  check(none.length === 0, "جدولٌ لم يتغيّر: لا انحراف");
  const taken = term.map(r => r.id === 10 ? { ...r, AdInstructorId: 55, rev: 2 } : r);
  const d1 = proposalDrift([assign], taken, new Set([PLACEHOLDER]), { instructorId: TEACHER });
  check(d1.some(d => d.code === "reassigned") && d1.some(d => d.code === "revised"), "شعبة «هيئة تدريسية» أُسندت إلى شخصٍ آخر: انحرافٌ بسببٍ محدد");
  const gone = term.filter(r => r.id !== 10);
  check(proposalDrift([assign], gone, new Set([PLACEHOLDER]), { instructorId: TEACHER })[0]?.code === "gone", "شعبةٌ حُذفت بعد الإعداد");
  const outChanged = term.map(r => r.id === 1 ? { ...r, rev: 5 } : r);
  check(proposalDrift([replace], outChanged, new Set([PLACEHOLDER]), { instructorId: TEACHER }).some(d => d.code === "out-revised"), "الموعد الأصلي المستبدَل تغيّر بعد الإعداد");
  const moved = term.map(r => r.id === 2 ? { ...r, AdInstructorId: 55 } : r);
  check(proposalDrift([edit], moved, new Set([PLACEHOLDER]), { instructorId: TEACHER }).some(d => d.code === "reassigned"), "موعدٌ خرج من جدول الأستاذ قبل تعديله");
  const secondOwner = term.map(r => r.id === 10 ? { ...r, AdInstructorId: 66 } : r);
  check(proposalDrift([assign], secondOwner, new Set([PLACEHOLDER, 66]), { instructorId: TEACHER }).length === 0, "هويةٌ أخرى من «هيئة تدريسية» لا تُعدّ إسناداً لشخصٍ حقيقي");
}

/* ── ٩) التحقق من شكل المواد ─────────────────────────────────────────── */
{
  check(validateOps([assign, create, edit, replace]).length === 1, "المصدر المكرر وحده يُنبَّه إليه (الإسناد والاستبدال يستعملان الشعبة 10 معاً)");
  check(validateOps([{ ...create, target: { ...create.target, SCode: "ab" } }]).some(i => i.field === "SCode"), "رقم الشعبة أرقامٌ فقط");
  check(validateOps([{ ...create, target: { ...create.target, days: [] } }]).some(i => i.field === "days"), "يومٌ واحد على الأقل");
  check(validateOps([{ ...create, target: { ...create.target, fstarttime: "10:00", fendtime: "09:00" } }]).some(i => i.field === "time"), "النهاية بعد البداية");
  check(validateOps([{ ...create, target: { ...create.target, fstarttime: "06:00", fendtime: "07:00" } }]).some(i => i.field === "time"), "الوقت داخل ساعات اليوم الدراسي");
  check(validateOps([{ ...create, target: { ...create.target, buildingId: undefined } }]).some(i => i.field === "location"), "المكان مطلوب (أو «القاعة لم تُحدد»)");
  check(!validateOps([{ ...create, target: { ...create.target, roomId: undefined, locationStatus: "PENDING_ROOM" } }]).some(i => i.field === "location"), "«القاعة لم تُحدد» مقبولةٌ مع المبنى");
  check(validateOps([create, { ...create, id: "c2" }]).some(i => i.field === "SCode"), "رقمٌ مكرر لشعبتين جديدتين لمقررٍ واحد");
  const many = Array.from({ length: PROPOSAL_MAX_OPS + 1 }, (_, i) => ({ ...create, id: `x${i}`, target: { ...create.target, SCode: String(600 + i) } }));
  check(validateOps(many).some(i => i.field === "ops"), "سقف المواد في المسودة الواحدة");
  check(validateOps([{ ...replace, source: snap(1) }]).some(i => i.field === "source"), "لا يخرج الموعد ويدخل نفسه");
}

/* ── ١٠) النسخ والموافقات ────────────────────────────────────────────── */
const base = (over: Partial<StudyProposal> = {}): StudyProposal => ({
  id: "p", AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdInstructorId: TEACHER, requestId: "r", linkId: "l", title: "t",
  status: "sent", version: 1, sentVersion: 1, responseMode: "independent", message: "m", ops: [assign, create],
  versions: [{ version: 1, sentAt: "2026-10-01T00:00:00Z", sentBy: 1, message: "m", responseMode: "independent", ops: [assign, create], title: "t" }],
  responses: [], events: [], createdBy: 1, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", rev: 1, ...over,
}) as StudyProposal;
const answer = (version: number, decisions: Array<[string, "approve" | "changes"]>, at = "2026-10-02T00:00:00Z") => ({
  id: `${version}-${at}`, version, at, by: "instructor" as const, decisions: decisions.map(([opId, decision]) => ({ opId, decision })),
});
{
  check(decisionStateOf(base()).outcome === "waiting", "مقترحٌ بلا ردّ: بانتظار الأستاذ");
  const partial = decisionStateOf(base({ responses: [answer(1, [["a1", "approve"], ["c1", "changes"]])] }));
  check(partial.outcome === "partial" && partial.approved.join() === "a1" && partial.changes.join() === "c1", "المواد المستقلة: يوافق على مادةٍ ويطلب تعديل أخرى");
  const all = decisionStateOf(base({ responses: [answer(1, [["a1", "approve"], ["c1", "approve"]])] }));
  check(all.outcome === "approved", "موافقةٌ على كل المواد");
  const changed = decisionStateOf(base({ responses: [answer(1, [["a1", "approve"], ["c1", "approve"]]), answer(1, [["c1", "changes"]], "2026-10-03T00:00:00Z")] }));
  check(changed.outcome === "partial" && changed.changes.join() === "c1", "الردّ الأحدث على المادة يسبق الأقدم");
  const stale = decisionStateOf(base({ version: 2, sentVersion: 2, versions: [...base().versions, { ...base().versions[0], version: 2 }], responses: [answer(1, [["a1", "approve"], ["c1", "approve"]])] }));
  check(stale.outcome === "waiting" && stale.approved.length === 0, "موافقةُ النسخة ١ لا تنطبق على النسخة ٢");
  const linked = base({ responseMode: "linked", versions: [{ ...base().versions[0], responseMode: "linked" }], responses: [answer(1, [["a1", "approve"], ["c1", "approve"]])] });
  check(decisionStateOf(linked).outcome === "approved" && decisionStateOf(linked).approved.length === 2, "الترتيب المترابط: موافقة واحدة تسري على المجموعة");
  const linkedChange = base({ responseMode: "linked", versions: [{ ...base().versions[0], responseMode: "linked" }], responses: [answer(1, [["a1", "changes"], ["c1", "changes"]])] });
  check(decisionStateOf(linkedChange).outcome === "changes", "الترتيب المترابط: طلب التعديل يشمل الجميع");
  const reply = answer(1, [["a1", "approve"]]);
  check(decisionStateOf({ ...base(), responses: [{ ...reply, by: "department" as const }] }).outcome === "waiting", "ردودُ القسم لا تُحسب موافقاتٍ للأستاذ");
}
{
  const f1 = materialFingerprint([assign, create], "independent");
  check(f1 === materialFingerprint([{ ...assign, note: "ملاحظة جديدة" }, create], "independent"), "تغيير ملاحظة نصية لا يُبطل موافقة الأستاذ (ليس من تفاصيل المادة)");
  check(materialFingerprint([assign, { ...create, target: { ...create.target, fstarttime: "09:30" } }], "independent") !== f1, "تغيير وقتٍ وافق عليه الأستاذ يغيّر بصمة النسخة (يستلزم موافقةً جديدة)");
  check(materialFingerprint([assign, { ...create, target: { ...create.target, days: ["fsunday"] } }], "independent") !== f1, "تغيير الأيام يغيّر البصمة");
  check(materialFingerprint([assign, { ...create, target: { ...create.target, roomId: "r202" } }], "independent") !== f1, "تغيير القاعة يغيّر البصمة");
  check(materialFingerprint([assign, create], "linked") !== f1, "تغيير طريقة الرد يغيّر البصمة");
  check(materialFingerprint([create, assign], "independent") !== f1, "ترتيب المواد جزءٌ من البصمة (يُحفظ كما أُرسل)");
}

/* ── ١١) متى يُقبل الردّ، ومتى يُثبَّت ─────────────────────────────────── */
{
  const now = Date.parse("2026-10-03T00:00:00Z");
  const open = base({ expiresAt: "2026-10-08T00:00:00Z" });
  check(responseGate(open, now).open, "ردٌّ مفتوح قبل الصلاحية");
  check(!responseGate({ ...open, expiresAt: "2026-10-02T00:00:00Z" }, now).open, "انتهت الصلاحية: لا ردّ");
  check(!responseGate({ ...open, version: 2 }, now).open && /يعدّل القسم/.test(String(responseGate({ ...open, version: 2 }, now).reason)), "يعدّل القسم نسخةً جديدة: لا ردّ على القديمة");
  check(!responseGate({ ...open, status: "withdrawn" }, now).open, "مقترحٌ مسحوب");
  check(!responseGate({ ...open, status: "committed" }, now).open, "مقترحٌ مثبّت");
  check(!responseGate(open, now, true).open, "فصلٌ منتهٍ يمنع الرد");
  check(!responseGate({ ...open, status: "draft", sentVersion: 0 }, now).open, "مسودةٌ لم تُرسل");
  check(effectiveStatus(open, now) === "sent" && effectiveStatus({ ...open, expiresAt: "2026-10-02T00:00:00Z" }, now) === "expired", "الحالة المشتقة: مرسل ثم منتهي");
  check(effectiveStatus({ ...open, version: 2 }, now) === "draft", "نسخةٌ لم تُرسل: مسودة");
  check(!commitReadiness(open).ok && commitReadiness(open).code === "not-approved", "لا تثبيت بلا موافقة");
  const approved = base({ responses: [answer(1, [["a1", "approve"], ["c1", "approve"]])] });
  const ready = commitReadiness(approved);
  check(ready.ok && ready.opIds.length === 2 && !ready.partial, "موافقةٌ كاملة: تثبيتٌ كامل");
  const part = commitReadiness(base({ responses: [answer(1, [["a1", "approve"], ["c1", "changes"]])] }));
  check(part.ok && part.partial && part.opIds.join() === "a1", "المواد المستقلة: تثبيت ما وُوفق عليه وحده");
  const linkedPartial = base({ responseMode: "linked", versions: [{ ...base().versions[0], responseMode: "linked" }], responses: [answer(1, [["a1", "approve"]])] });
  check(commitReadiness(linkedPartial).ok, "الترتيب المترابط يعامل أي ردٍّ كردٍّ على المجموعة");
  check(!commitReadiness({ ...approved, version: 2 }).ok && commitReadiness({ ...approved, version: 2 }).code === "stale-version", "لا تثبيت لنسخةٍ أحدث لم يُردّ عليها");
  check(commitReadiness({ ...approved, status: "committed" }).code === "committed", "لا تثبيتٌ ثانٍ (تكرار الضغط)");
}

/* ── ١٢) أخرى ─────────────────────────────────────────────────────────── */
{
  check(nextSectionCodeFrom([]) === "501", "أول شعبة جديدة 501");
  check(nextSectionCodeFrom([501, 502, "503", 1, 21]) === "504", "التالي بعد أكبر رقمٍ مستخدم بين 501 و999 (والأرقام الأصغر لا تحسب)");
  check(nextSectionCodeFrom([999]) === "1000", "الحدّ الأعلى لا يُخفى بل يظهر للتحقق");
  const e = expiryAfterDays(7, 0);
  check(e.days === 7 && Date.parse(e.expiresAt) === 7 * 86400000, "صلاحية الرد: 7 أيام افتراضياً");
  check(expiryAfterDays(-5).days === 1 && expiryAfterDays(999).days === 30 && expiryAfterDays("x").days === 7, "حدّا الصلاحية ١–٣٠ يوماً");
}

/* ── ١٣) عقودٌ في الشيفرة: ما لا يجوز أن يتغيّر بلا قصد ───────────────────── */
import fs from "fs";
{
  const routes = fs.readFileSync("src/server/studyProposalRoutes.ts", "utf8");
  const engine = fs.readFileSync("src/server/studyProposalEngine.ts", "utf8");
  const server = fs.readFileSync("server.ts", "utf8");
  const staffRoutes = [...routes.matchAll(/app\.(?:get|post|put)\("(\/api\/study-proposals[^"]*)",\s*([^,]+),/g)];
  check(staffRoutes.length >= 8 && staffRoutes.every(m => m[2].trim() === "staff"), "كل مسارات القسم تمرّ بحارس صلاحية الجداول (٧)", staffRoutes.map(m => `${m[1]}:${m[2]}`));
  check(!/Repository\.(createSchedule|updateSchedule|deleteSchedule|moveSchedulesBatch)\(/.test(routes.slice(0, routes.indexOf("export async function seedDemoStudyProposals")) + engine), "لا كتابةَ في جدول المواعيد إلا عبر معاملة التثبيت (commitStudyProposal)");
  check((routes.match(/Repository\.commitStudyProposal\(/g) || []).length === 1, "التثبيت له موضعٌ واحد");
  check(!/\bfindConflicts\(/.test(routes + engine), "لا فاحصَ تعارضاتٍ ثانياً: الحكمُ لـscheduleConflicts نفسه");
  check(/scheduleConflicts\(req, \{ \.\.\.candidate/.test(engine) && /hypothetical/.test(server), "الفحص يمرّ ببوابة الحفظ على الجدول الناتج");
  check(!/AdInstructorCivil\s*[:=]/.test(routes) && /surveyFingerprint/.test(routes), "الرقم المدني يُتحقَّق منه وتُحفظ بصمتُه فقط");
  check(/verifyRequestSigner/.test(routes) && /Number\(req\.body\?\.version\) !== proposal\.sentVersion/.test(routes), "الردّ موقَّعٌ ومربوطٌ بنسخةٍ بعينها");
  check(/scheduleLockRefusal\(req, scope\.c, scope\.s, proposal\.AdTermId\)/.test(routes) && /proposalDrift\(proposal\.ops/.test(routes), "التثبيت يتحقق من القفل ومن تغيّر المواعيد الأصلية");
  check(/StudyProposalAlreadyCommitted/.test(routes) && /StudyProposalRevisionConflict/.test(routes), "التثبيتُ مانعٌ للتكرار ومقارِنٌ للمراجعة");
  check(/isScopeAllowed|canWriteScope/.test(routes), "الصلاحيات حسب القسم تُطبَّق في المسارات");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
