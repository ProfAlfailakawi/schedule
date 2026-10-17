/**
 * ── بياناتٌ وهميةٌ للفصل السابق (البيئة التجريبية) ──────────────────────────────
 *
 * الفصلُ السابق يُفتح «للعرض فقط» (شريط «فصل سابق · للعرض فقط» وأزرارٌ معطّلة). ومن يعرض
 * النظام لا يريد أن يرى هذه الحالة فارغةً، فيُبذر لكل قسمٍ له جدولٌ في التاريخ:
 *
 *   • كشفُ التسجيل: طلباتُ طلبةٍ بحالاتٍ مختلفة (تنتظر اللجنة، سلّمتها اللجنة، سُجّلت، رُدّت،
 *     لم توافق اللجنة، تعارضُ مقرّرين، خريج).
 *   • رغباتُ الأساتذة: طلباتٌ بحالاتٍ مختلفة (ثُبّت، رُفض ببدائل فاختار الأستاذ، ينتظر قرار القسم،
 *     رُفض وينتظر اختيار الأستاذ) ومقترحاتٌ دراسية (ثُبّت، وافق، طلب تعديلاً، انتهت صلاحيته).
 *   • تغييراتُ الجدول: من دورة الاعتماد المبذورة في demoSandbox (seedPreviousTermUniverse).
 *
 * يُبذر داخل صندوق الزائر وحده، بدوالّ الخادم نفسها، وكلُّ الأسماء والأرقام وهمية.
 */
import { Repository } from "../db/repository";
import { DEMO_PREVIOUS_TERM_ID } from "../db/demoSandbox";
import { generateSyntheticCivilId, normalizeCivilId } from "../utils/civilId";
import { verificationCode } from "../utils/approvalWorkflow";
import { endForRequest, type RequestDayKey } from "../utils/instructorRequestVerdict";
import { snapshotOf, specOfSnapshot } from "../utils/studyProposal";
import { requestsCloseAtFromDate, termLinkExpiresAt } from "../utils/shareLinkLifetime";
import type {
  AdCourse, FSchedule, InstructorRequest, InstructorRequestEvent, InstructorRequestItem, InstructorRequestSlot, StudentNeed,
  StudyProposal, StudyProposalOp,
} from "../types";

export interface PreviousTermSeedDeps {
  sealIdentity: (value: string) => Promise<string>;
  fingerprintOf: (civil: string) => Promise<string>;
  requestItemFromRow: (row: any, courseName: string, collegeNameById: Map<number, string>) => InstructorRequestItem;
  dayLetters: Record<RequestDayKey, string>;
  /** حكمُ النظام على بنود الطلب (judgeRequestItems في الخادم): تُنتقى به مواعيدُ «جاهزة للتثبيت» لا «ممنوعة». */
  judge?: (request: InstructorRequest) => Promise<InstructorRequest>;
}

/** الأقسامُ التي لها جدولٌ في التاريخ، فلها كشفٌ ورغباتٌ في الفصل السابق. */
export const DEMO_PREVIOUS_TERM_SCOPES: ReadonlyArray<{ collegeId: number; sectionId: number }> = [
  { collegeId: 1, sectionId: 1 }, { collegeId: 1, sectionId: 2 }, { collegeId: 2, sectionId: 3 },
  { collegeId: 2, sectionId: 4 }, { collegeId: 3, sectionId: 5 }, { collegeId: 1, sectionId: 9 },
  { collegeId: 1, sectionId: 6 }, { collegeId: 2, sectionId: 7 }, { collegeId: 3, sectionId: 8 },
];
/** الفصلُ الجاري: كلُّ الأقسام عدا علوم الحاسب (لها قصّتُها في seedDemoStories). */
export const DEMO_CURRENT_TERM_EXTRA_SCOPES = DEMO_PREVIOUS_TERM_SCOPES.filter(scope => scope.sectionId !== 1);

type Phase = "past" | "now";

const DAY_KEYS: RequestDayKey[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const START_CHOICES = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "10:00", "13:30"];

/** الفصلُ السابق: كلُّ شيءٍ مضى وانتهى، فيُقرأ «للعرض فقط». */
export async function seedDemoPreviousTerm(deps: PreviousTermSeedDeps): Promise<void> {
  await seedTermStories(deps, DEMO_PREVIOUS_TERM_ID, "past", DEMO_PREVIOUS_TERM_SCOPES);
}

/** الفصلُ الجاري: طلباتُ طلبةٍ وأساتذةٌ ومقترحاتٌ حيّةٌ في الأقسام التي لا قصّةَ لها بعد. */
export async function seedDemoCurrentTermStories(deps: PreviousTermSeedDeps, termId: number): Promise<void> {
  await seedTermStories(deps, termId, "now", DEMO_CURRENT_TERM_EXTRA_SCOPES);
}

/** نهايةُ موعدٍ يبدأ عند `start` بمدة المحاضرة القائمة نفسها. */
function endAfter(start: string, row: Pick<FSchedule, "fstarttime" | "fendtime">): string {
  const minutes = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
  const length = Math.max(30, minutes(String(row.fendtime || "")) - minutes(String(row.fstarttime || "")));
  const total = minutes(start) + length;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function seedTermStories(deps: PreviousTermSeedDeps, termId: number, phase: Phase, scopes: ReadonlyArray<{ collegeId: number; sectionId: number }>): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const past = phase === "past";
  const [terms, sections, courses, instructors, colleges, rows] = await Promise.all([
    Repository.getTerms(), Repository.getSections(), Repository.getCourses(), Repository.getInstructors(), Repository.getColleges(),
    Repository.getSchedulesByScope({ termId }),
  ]);
  const term = terms.find(row => Number(row.AdTermId) === termId);
  if (!term || !rows.length) return;
  if (past && (await Repository.getStudyProposalsByTerm(termId)).length) return; // مبذورٌ من قبل
  const termRows = rows as FSchedule[];
  /* «مضى منذ n يوماً»: للفصل السابق تُقاس n من نحو نصف سنةٍ مضت (فكلُّ تاريخٍ قبل الفصل الجاري)، وللجاري تُصغَّر. */
  const d = (n: number) => new Date(Date.now() - (past ? 150 + n : Math.max(1, Math.round(n / 8))) * 86_400_000).toISOString();
  const ahead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const committee = { id: 16, name: "د. رئيس لجنة جدول الحاسب", role: "رئيس لجنة الجدول" };
  const registrarRole = "موظف التسجيل";
  const courseById = new Map((courses as AdCourse[]).map(row => [Number(row.AdCourseId), row] as const));
  const collegeNameById = new Map(colleges.map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const catalog = {
    courseById: courseById as any,
    instructorNameById: new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")])),
  };
  let studentNo = past ? 600 : 800;

  for (const { collegeId, sectionId } of scopes) {
    const section = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
    if (!section) continue;
    const sectionRows = termRows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
    const sectionCourses = (courses as AdCourse[]).filter(row => Number(row.AdSectionId) === sectionId);
    if (!sectionRows.length || !sectionCourses.length) continue;
    const sectionName = String(section.AdSectionName || "");

    /* ── كشف التسجيل: رابطُ استبيان، وطلباتُ طلبةٍ بكل حالاتها ─────────────────── */
    const survey = await Repository.createShareLink({
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, SystemUserId: committee.id, userName: committee.name,
      kind: "survey", label: `استبيان المقررات · ${sectionName} · ${String(term.AdTermName || "")}`, expiresAt: past ? d(10) : ahead(30), showInstructors: true,
    } as any);
    /* رابطُ بطاقات الأساتذة للقسم (يفتحه المنسّق من لوحة النشر كما في علوم الحاسب). */
    const staff = await Repository.createShareLink({
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, SystemUserId: committee.id, userName: committee.name,
      kind: "staff", label: `بطاقات الأساتذة · ${String(term.AdTermName || "")}`, expiresAt: past ? d(10) : termLinkExpiresAt(term),
      ...(past ? {} : { requestsCloseAt: requestsCloseAtFromDate(ahead(14).slice(0, 10)) }), showInstructors: true,
    } as any);
    for (let opened = 0; opened < 9 + sectionId; opened += 1) await Repository.touchShareLink(staff.id);
    for (let opened = 0; opened < 18 + sectionId; opened += 1) await Repository.touchShareLink(survey.id);
    const pick = (n: number) => sectionCourses[n % sectionCourses.length];
    const save = async (entry: Partial<StudentNeed>) => {
      studentNo += 1;
      const civil = generateSyntheticCivilId();
      const name = `${studentNo % 2 ? "طالب تجريبي" : "طالبة تجريبية"} ${studentNo}`;
      return Repository.saveStudentNeed({
        fingerprint: await deps.fingerprintOf(civil), AdCollegeId: collegeId, AdSectionId: sectionId, studentSectionId: sectionId,
        surveySectionId: sectionId, surveyLinkId: survey.id, AdTermId: termId, courseIds: [], requestType: "new-course",
        nameCipher: await deps.sealIdentity(name), civilCipher: await deps.sealIdentity(civil), details: "", eligibility: "not-checked",
        ...entry,
      } as any);
    };
    const state = (needId: string, courseId: number, next: Record<string, unknown>) =>
      Repository.setStudentCourseState(needId, { courseId, at: d(20), ...next } as any);

    await save({ courseIds: [Number(pick(0).AdCourseId)], details: "أحتاج المقرر لإكمال خطتي هذا الفصل." }); // بلا قرار: ينتظر اللجنة
    const awaiting = await save({ courseIds: [Number(pick(1).AdCourseId)], details: "امتلأت الشعب المتاحة." });
    await state(awaiting.id, Number(pick(1).AdCourseId), { state: "awaiting-registration", by: "department", byRole: committee.role });
    const registered = await save({ courseIds: [Number(pick(2).AdCourseId), Number(pick(0).AdCourseId)] });
    await state(registered.id, Number(pick(2).AdCourseId), { state: "registered", by: "registration", byRole: registrarRole });
    await state(registered.id, Number(pick(0).AdCourseId), { state: "awaiting-registration", by: "department", byRole: committee.role });
    const rejected = await save({ courseIds: [Number(pick(1).AdCourseId)], details: "طلبتُ فتح شعبة مسائية." });
    await state(rejected.id, Number(pick(1).AdCourseId), { state: "rejected", reasonCode: "no-seat", note: "لا مقاعد في الشعب المفتوحة.", by: "registration", byRole: registrarRole });
    const refused = await save({ courseIds: [Number(pick(2).AdCourseId)] });
    await state(refused.id, Number(pick(2).AdCourseId), { state: "committee-rejected", reasonCode: "prerequisite", note: "يلزم اجتياز المتطلب السابق أولاً.", by: "department", byRole: committee.role });
    if (sectionCourses.length > 1) {
      await save({ requestType: "course-conflict", courseIds: [Number(pick(0).AdCourseId), Number(pick(1).AdCourseId)], details: "يتعارض موعد المقررين في جدولي." });
    }
    const graduate = await save({
      requestType: "graduate", graduateReason: "field-conflict", details: "التطبيق الميداني يتعارض مع آخر مقرر في خطتي.",
      passedUnits: 118, requiredUnits: 118, degreeUnits: 130, eligibility: "eligible", proofNameMatched: true,
    });
    await Repository.setStudentCaseDecision(graduate.id, "committee", { state: "approved", note: "الحالة مستوفية؛ أُحيلت إلى التسجيل.", byRole: committee.role, at: d(19) });
    if (past) await Repository.setStudentCaseDecision(graduate.id, "registrar", { state: "approved", note: "نُفّذ الترتيب.", byRole: registrarRole, at: d(18) });

    /* ── رغبات الأساتذة: طلباتٌ بحالاتٍ مختلفة لأساتذة القسم ─────────────────── */
    /* الماضي: ثُبّت · ينتظر قرار القسم · رُفض فاختار الأستاذ بديلاً · رُفض وينتظر اختيار الأستاذ.
       الجاري: ينتظر قرار القسم · رُفض وينتظر الأستاذ · ثُبّت · أُرسل له الرابط ولم يفتحه. */
    const stages = past ? (["fixed", "submitted", "chosen", "review"] as const) : (["submitted", "review", "fixed", "sent"] as const);
    const teachers = [...new Set(sectionRows.map(row => Number(row.AdInstructorId)).filter(Boolean))].slice(0, 4);
    const requests: Array<{ request: InstructorRequest; stage: typeof stages[number] }> = [];
    for (const [index, instructorId] of teachers.entries()) {
      const person = (instructors as any[]).find(row => Number(row.AdInstructorId) === instructorId);
      if (!person) continue;
      const own = termRows.filter(row => Number(row.AdInstructorId) === instructorId);
      const target = own.findIndex(row => Number(row.AdSectionId) === sectionId);
      if (target < 0) continue;
      const stage = stages[index % stages.length];
      const link = await Repository.createShareLink({
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, SystemUserId: committee.id, userName: committee.name,
        kind: "request", AdInstructorId: instructorId, label: `طلب جدول — ${instructorId}`, expiresAt: past ? d(5) : ahead(21), showInstructors: false,
      } as any);
      if (stage !== "sent") for (let opened = 0; opened < 3 + index; opened += 1) await Repository.touchShareLink(link.id);
      const items: InstructorRequestItem[] = own.map(row => deps.requestItemFromRow(row, courseById.get(Number(row.AdCourseId))?.CourseName || String(row.AdCourseName || ""), collegeNameById));
      const row = own[target];
      /* نمطُ الطلب: الاثنين والأربعاء (80 دقيقةً للّقاء بحسب اللائحة فيغطّي ساعاتِ المقرّر في أي قسم). */
      const days: RequestDayKey[] = ["fmonday", "fwednesday"];
      const startNow = String(row.fstarttime || "").slice(0, 5);
      const asked = START_CHOICES.filter(start => start !== startNow);
      const endOf = (start: string) => endForRequest(days, start);
      const slotOf = (start: string): InstructorRequestSlot => ({ day: days[0], days, start, end: endOf(start) });
      const withMove = (start: string, decision?: InstructorRequestItem["decision"], extra: Partial<InstructorRequestItem> = {}) => items.map((item, at) => at !== target ? item : {
        ...item, action: "change" as const,
        after: { ...item.before!, room: undefined, days: days.map(day => deps.dayLetters[day]).join(" · "), time: `${start} – ${endOf(start)}` },
        slots: days.map(day => ({ day, start, end: endOf(start) })),
        verdict: "clear" as const, excuse: "يتوافق مع ساعاتي المكتبية وتدريب الطلبة الميداني.",
        ...(decision ? { decision } : {}), ...extra,
      });
      /* كلُّ موعدٍ يُطلب أو يُعرض بديلاً يمرّ بحكم النظام نفسه أولاً (إن وُجد)، فلا طلبَ «ممنوعاً» ولا بديلَ يرفضه النظام. */
      const rotation = [...asked.slice((index + sectionId) % asked.length), ...asked.slice(0, (index + sectionId) % asked.length)];
      let acceptable = rotation;
      if (deps.judge) {
        const clear: string[] = [];
        for (const start of rotation) {
          const attempt = await deps.judge({ id: "probe", AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructorId, linkId: "probe",
            window: { opensAt: d(60), closesAt: ahead(10) }, source: "draft", status: "sent", items: withMove(start), timeline: [], createdAt: d(60), updatedAt: d(60) } as InstructorRequest);
          if (attempt.items[target]?.verdict === "clear") clear.push(start);
          if (clear.length >= 3) break;
        }
        if (clear.length) acceptable = clear;
      }
      const want = acceptable[0], alt1 = acceptable[1] ?? acceptable[0], alt2 = acceptable[2] ?? acceptable[1] ?? acceptable[0];
      const changed = (decision?: InstructorRequestItem["decision"], extra: Partial<InstructorRequestItem> = {}) => withMove(want, decision, extra);
      const opened = d(60), submittedAt = d(55 - index), decidedAt = d(50 - index);
      const created = await Repository.createInstructorRequest({
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructorId, linkId: link.id,
        window: { opensAt: opened, closesAt: past ? d(45) : ahead(10) }, source: "draft", status: "sent", items,
        ...(stage === "sent" ? {} : { linkOpenedAt: d(59) }),
        timeline: [{ kind: "link-created", at: opened, by: "القسم" }, ...(stage === "sent" ? [] : [{ kind: "link-opened" as const, at: d(59) }])],
      });
      const signature = {
        at: submittedAt, fingerprint: await deps.fingerprintOf(normalizeCivilId(person.AdInstructorCivil)),
        verifyCode: verificationCode(created.id, instructorId, submittedAt),
      };
      const head: InstructorRequestEvent[] = [...created.timeline, { kind: "submitted", at: submittedAt, detail: "1" }, { kind: "received", at: submittedAt, by: "القسم" }];
      let saved: InstructorRequest;
      if (stage === "sent") {
        saved = created;
      } else if (stage === "submitted") {
        saved = { ...created, status: "submitted", submittedAt, signature, items: changed(), timeline: head };
      } else if (stage === "fixed") {
        saved = {
          ...created, status: "settled", submittedAt, signature,
          timeline: [...head, { kind: "item-fixed", at: decidedAt, by: committee.role, itemIndex: target }, { kind: "settled", at: decidedAt, by: committee.role }, ...(past ? [{ kind: "schedule-approved" as const, at: d(40) }] : [])],
          items: changed({ state: "fixed", decidedBy: committee.role, decidedAt, scheduleId: Number(row.id) }),
        };
      } else {
        const alternatives = [slotOf(alt1), slotOf(alt2)];
        const decision = { state: "rejected" as const, reasonCode: "room" as const, note: "لا قاعة مناسبة في هذا الموعد؛ اختر أحد البديلين.", alternatives, decidedBy: committee.role, decidedAt };
        const rejectedEvents: InstructorRequestEvent[] = [...head, { kind: "item-rejected", at: decidedAt, by: committee.role, itemIndex: target, detail: "room" }, { kind: "alternative-offered", at: decidedAt, by: committee.role, itemIndex: target }];
        saved = stage === "chosen"
          ? { ...created, status: "settled", submittedAt, signature, items: changed(decision, { chosenAlternative: alternatives[0] }),
              timeline: [...rejectedEvents, { kind: "alternative-chosen", at: d(48 - index), itemIndex: target }, { kind: "settled", at: d(48 - index), by: committee.role }] }
          : { ...created, status: "in-review", submittedAt, signature, items: changed(decision), timeline: rejectedEvents };
      }
      requests.push({ request: await Repository.saveInstructorRequest(saved), stage });
    }

    /* ── مقترحاتٌ دراسية بحالاتٍ مختلفة ─────────────────────────────────────────
       الماضي: ثُبّت · وافق الأستاذ · طلب تعديلاً · انتهت صلاحيته. الجاري: أُرسل · مسودة · طلب تعديلاً · وافق. */
    const statuses: Array<StudyProposal["status"]> = past ? ["committed", "approved", "changes", "expired"] : ["sent", "draft", "changes", "approved"];
    for (const [index, { request, stage }] of requests.entries()) {
      if (stage === "sent") continue;
      const status = statuses[index % statuses.length];
      const source = termRows.find(row => Number(row.AdInstructorId) === Number(request.AdInstructorId) && Number(row.AdSectionId) === sectionId);
      if (!source) continue;
      const snapshot = snapshotOf(source, catalog as any);
      const start = START_CHOICES[(index + sectionId + 3) % START_CHOICES.length];
      const target = { ...specOfSnapshot(snapshot), fstarttime: start, fendtime: endAfter(start, source) };
      const op: StudyProposalOp = { id: `op-${phase}-${sectionId}-${index}`, kind: "edit", source: snapshot, target };
      const sentAt = d(54 - index), title = "مقترح دراسي — بعد مراجعة رغباتك", by = committee.name;
      const message = "اقترحنا ترتيباً يناسب ساعاتك المكتبية؛ نرجو الموافقة أو طلب التعديل.";
      const expiresAt = status === "expired" ? d(48) : past ? d(40) : ahead(7);
      const respondedAt = d(52 - index);
      const answered = status === "approved" || status === "changes" || status === "committed";
      const response = status === "changes"
        ? { id: `resp-${phase}-${sectionId}-${index}`, version: 1, at: respondedAt, by: "instructor" as const, decisions: [{ opId: op.id, decision: "changes" as const }], reason: "time" as const, note: "أفضّل موعداً أبكر قليلاً.", suggestedStart: "08:00" }
        : { id: `resp-${phase}-${sectionId}-${index}`, version: 1, at: respondedAt, by: "instructor" as const, decisions: [{ opId: op.id, decision: "approve" as const }], verifyCode: verificationCode(request.id, request.AdInstructorId, respondedAt) };
      const sent = status !== "draft";
      await Repository.createStudyProposal({
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: request.AdInstructorId, requestId: request.id, linkId: request.linkId,
        itemIndex: null, title: sent ? title : "مقترح دراسي — مسودة", status, version: 1, sentVersion: sent ? 1 : 0, responseMode: "independent", message, ops: [op], expiryDays: 7,
        ...(sent ? { expiresAt } : {}),
        versions: sent ? [{ version: 1, sentAt, sentBy: committee.id, sentByName: by, message, responseMode: "independent", expiresAt, ops: [op], title }] : [],
        responses: answered ? [response] : [],
        events: [
          { kind: "created", at: sentAt, by, version: 1 },
          ...(sent ? [{ kind: "sent" as const, at: sentAt, by, version: 1 }] : []),
          ...(status === "expired" ? [{ kind: "expired" as const, at: expiresAt }] : []),
          ...(answered ? [{ kind: (status === "changes" ? "changes" : "approved") as "changes" | "approved", at: respondedAt, by: "الأستاذ", version: 1 }] : []),
          ...(status === "committed" ? [{ kind: "committed" as const, at: d(40), by, version: 1 }] : []),
        ],
        ...(status === "committed" ? { commit: { at: d(40), by: committee.id, byName: by, version: 1, results: [{ opId: op.id, state: "applied" as const, updatedRowIds: [Number(source.id)] }] } } : {}),
        createdBy: committee.id, createdByName: by,
      });
    }
  }
}
