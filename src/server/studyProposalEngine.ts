/**
 * ── محرّك فحص المقترح الدراسي (الخادم) ──────────────────────────────────────
 *
 * يبني «الجدول الناتج» بتطبيق عمليات المقترح على نسخةٍ من جدول الفصل في
 * الذاكرة، ثم يسأل بوابةَ الحفظ نفسها (`scheduleConflicts`) عن كل موعدٍ داخلٍ
 * إلى جدول الأستاذ — فلا يكون هناك فاحصٌ ثانٍ يحكم بغير ما تحكم به شاشة
 * «إضافة موعد». ما ليس مانعاً هناك (ما عُلِّم soft) يبقى ملاحظةً هنا ولا يصير
 * مانعاً.
 *
 * ما يُكشف للمستخدم محدودٌ بصلاحيته: موعدُ أستاذٍ في قسمٍ خارج نطاقه يظهر
 * إشغالاً وحسب — لا مقرّر ولا شعبة ولا كلية.
 */
import { Repository } from "../db/repository";
import type {
  AdCourse, AdInstructor, FSchedule, StudyProposalDayKey, StudyProposalOp, StudyProposalRowSnapshot,
} from "../types";
import { isBlockingConflict, timeToMinutes, minutesToTime } from "../utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../utils/instructorIdentity";
import { reviewSchedule } from "../utils/scheduleRegulations";
import {
  applyProposalOps, daysLabel, daysOf, durationOf, GridItem, placeLabel, ProposalEvaluation, ProposalFinding,
  proposalDrift, proposalMetrics, snapshotOf, validateOps, PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, type ProposalCatalog,
  type OpIssue,
} from "../utils/studyProposal";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../utils/scheduleTime";

export interface EngineDeps {
  scheduleConflicts: (req: any, row: any, excludeId?: number, hypothetical?: FSchedule[]) => Promise<any[]>;
  scheduleLockRefusal: (req: any, collegeId: number, sectionId: number, termId: number, options?: { registrarLock?: boolean }) => Promise<string | null>;
  /** هل يملك المستخدم الكتابة في هذا القسم؟ */
  canWrite: (req: any, collegeId: number, sectionId: number) => boolean;
  /** هل يحق له رؤية تفاصيل هذا الموعد؟ */
  canSee: (req: any, collegeId: number, sectionId: number) => boolean;
  /** صلاحية المكان وتوحيده بقواعد الحفظ نفسها (المبنى والقاعة ونطاق القسم). */
  canonicalizeLocation?: (row: any, collegeId: number, sectionId: number) => Promise<{ ok: boolean; message?: string; canonical?: any }>;
}

export interface EvaluateInput {
  instructorId: number;
  termId: number;
  collegeId: number;
  sectionId: number;
  ops: StudyProposalOp[];
  proposalId?: string;
  /** عمليات بعينها فقط (التثبيت الجزئي). */
  onlyOpIds?: string[];
  /** يتخطى فحص القفل (للإرسال: القفل يمنع التثبيت لا الإرسال). */
  includeLock?: boolean;
}

export interface LoadedWorld {
  termRows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  colleges: Array<{ AdCollegeId: number; AdCollegeName: string }>;
  sections: Array<{ AdSectionId: number; AdCollegeId: number; AdSectionName: string }>;
  catalog: ProposalCatalog;
  placeholders: Set<number>;
  instructor?: AdInstructor;
  term?: { AdTermId: number; AdTermName: string; AdTermClosed?: boolean };
}

export async function loadWorld(termId: number, instructorId: number): Promise<LoadedWorld> {
  const [termRows, courses, instructors, colleges, sections, terms] = await Promise.all([
    Repository.getSchedulesByScope({ termId }) as Promise<FSchedule[]>,
    Repository.getCourses() as Promise<AdCourse[]>,
    Repository.getInstructors() as Promise<AdInstructor[]>,
    Repository.getColleges() as Promise<any[]>,
    Repository.getSections() as Promise<any[]>,
    Repository.getTerms() as Promise<any[]>,
  ]);
  const courseById = new Map<number, AdCourse>(courses.map(row => [Number(row.AdCourseId), row]));
  const instructorNameById = new Map<number, string>(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  return {
    termRows, courses, instructors, colleges, sections,
    catalog: { courseById: courseById as any, instructorNameById },
    placeholders: placeholderInstructorIds(instructors as any),
    instructor: instructors.find(row => Number(row.AdInstructorId) === instructorId),
    term: terms.find(row => Number(row.AdTermId) === termId),
  };
}

export const keyOfRow = (id: number) => `row:${id}`;
export const keyOfNew = (opId: string) => `new:${opId}`;

export function gridItem(
  row: FSchedule, world: LoadedWorld, deps: EngineDeps, req: any,
  patch: Partial<GridItem> & Pick<GridItem, "state" | "key">,
): GridItem {
  const visible = deps.canSee(req, Number(row.AdCollegeId), Number(row.AdSectionId));
  const days = daysOf(row as any);
  if (!visible) {
    return {
      rowId: Number(row.id), courseName: "", courseCode: "", SCode: "", days,
      start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
      place: "", placeKnown: false, outside: true,
      ...patch, state: "outside" as const,
    } as GridItem;
  }
  const course = world.catalog.courseById.get(Number(row.AdCourseId));
  const place = placeLabel(row);
  const college = world.colleges.find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId));
  const section = world.sections.find(c => Number(c.AdSectionId) === Number(row.AdSectionId));
  return {
    rowId: Number(row.id),
    courseName: String(course?.CourseName || row.CourseNameSnapshot || row.AdCourseName || ""),
    courseCode: String(course?.CourseCode || row.CourseCodeSnapshot || ""),
    SCode: String(row.SCode ?? ""),
    days, start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
    place: place.text, placeKnown: place.known,
    collegeName: college?.AdCollegeName, sectionName: section?.AdSectionName,
    src: {
      courseId: Number(row.AdCourseId), collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), rev: Number(row.rev || 0),
      buildingId: row.buildingId, roomId: row.roomId, locationStatus: row.locationStatus,
      roomCode: String(row.AdRoomCode || ""), roomHall: String(row.AdRoomHall || ""),
    },
    ...patch,
  } as GridItem;
}

const dayOverlap = (a: FSchedule, b: FSchedule): { day?: StudyProposalDayKey; start?: string; end?: string } => {
  const day = PROPOSAL_DAY_KEYS.find(key => Boolean((a as any)[key]) && Boolean((b as any)[key]));
  if (!day) return {};
  const start = Math.max(timeToMinutes(a.fstarttime), timeToMinutes(b.fstarttime));
  const end = Math.min(timeToMinutes(a.fendtime), timeToMinutes(b.fendtime));
  return end > start ? { day, start: minutesToTime(start), end: minutesToTime(end) } : { day };
};

const REASON_BY_TYPE: Record<string, { reason: string; fix: string }> = {
  instructor: { reason: "الأستاذ لا يحضر محاضرتين في وقتٍ واحد.", fix: "غيّر اليوم أو الوقت، أو جرّب أحد الأوقات البديلة." },
  room: { reason: "القاعة لا تُشغل بمحاضرتين في وقتٍ واحد.", fix: "اختر قاعةً أخرى أو غيّر الوقت." },
  duplicate: { reason: "يوجد موعدٌ مطابقٌ تماماً لنفس المقرر والشعبة.", fix: "تأكد أن المادة لا تُضاف مرتين، أو غيّر رقم الشعبة." },
  hallBarter: { reason: "القاعة محجوزةٌ لقسمٍ آخر عبر استعارة القاعات.", fix: "اختر قاعةً أخرى أو اطلب نافذةً من «استعارة القاعات»." },
  hallBarterWindow: { reason: "الموعد خارج نافذة الاستعارة المعتمدة للقاعة.", fix: "اجعل الموعد داخل النافذة المعتمدة أو اطلب نافذةً إضافية." },
  roomScope: { reason: "القاعة مسجّلةٌ لقسمٍ آخر ولا تُستعمل إلا بنافذة استعارةٍ معتمدة.", fix: "اختر قاعةً من قاعات القسم أو اطلب استعارة." },
  cohort: { reason: "مقرّران يشترك فيهما طلابٌ حسب استبيان القسم.", fix: "راجع إن كان التقاؤهما مقبولاً أو غيّر أحد الوقتين." },
  doorway: { reason: "الفاصل بين محاضرتين في القاعة نفسها أقصر من المقرّر.", fix: "أضف فاصلاً كافياً بين المحاضرتين إن أمكن." },
  sectionTwice: { reason: "الشعبة نفسها مسجّلة بالأيام والوقت نفسيهما في موضعين.", fix: "تأكد أنهما شعبتان مقصودتان." },
};

function makeId(parts: Array<string | number>): string {
  return parts.join(":");
}

export async function evaluateProposal(deps: EngineDeps, req: any, input: EvaluateInput, preloaded?: LoadedWorld): Promise<ProposalEvaluation> {
  const world = preloaded || await loadWorld(input.termId, input.instructorId);
  const incompleteReasons: string[] = [];
  const onlyOpIds = input.onlyOpIds ? new Set(input.onlyOpIds) : undefined;
  const ops = input.ops.filter(op => !onlyOpIds || onlyOpIds.has(op.id));
  const placeholderId = [...world.placeholders].sort((a, b) => a - b)[0] || null;

  const instructorRowsBefore = world.termRows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const opIssues: OpIssue[] = validateOps(ops);
  const invalidOps = new Set(opIssues.map(issue => issue.opId).filter(Boolean));
  const validOps = ops.filter(op => !invalidOps.has(op.id));
  const drift = proposalDrift(ops, world.termRows, world.placeholders, { instructorId: input.instructorId });
  const driftOps = new Set(drift.map(d => d.opId));

  const applied = applyProposalOps(world.termRows, validOps.filter(op => !driftOps.has(op.id)), {
    instructorId: input.instructorId, termId: input.termId, placeholderId,
  });
  const appliedErrors = new Map(applied.errors.map(e => [e.opId, e]));

  const findings: ProposalFinding[] = [];
  const addFinding = (finding: Omit<ProposalFinding, "id">) => {
    const id = makeId([finding.code, finding.opId || "-", findings.length]);
    findings.push({ ...finding, id });
    return id;
  };

  /* ── ما لا يُفحص ولماذا ───────────────────────────────────────────────── */
  if (!ops.length) incompleteReasons.push("لم تُضف مادةٌ إلى المقترح بعد.");
  for (const issue of opIssues) {
    if (!issue.opId) continue;
    incompleteReasons.push(issue.message);
  }
  for (const issue of drift) {
    addFinding({
      kind: "blocker", code: `drift-${issue.code}`, title: "تغيّرت بيانات الجدول بعد إعداد المادة", detail: issue.message,
      reason: "المقترح مبنيٌّ على لقطةٍ لم تعد تطابق الجدول الحالي.",
      fix: "أعد اختيار الشعبة أو الموعد من القائمة لتحديث اللقطة ثم راجع الفحص.", opId: issue.opId,
    });
  }
  for (const error of applied.errors) {
    addFinding({ kind: "blocker", code: `apply-${error.code}`, title: "تعذّر تطبيق المادة", detail: error.message, opId: error.opId,
      fix: error.code === "no-placeholder" ? "اختر «حذف الموعد» إن كان مصرحاً لك به، أو أضف سجل «هيئة تدريسية»." : "راجع المادة من القائمة." });
  }

  /* ── الصلاحيات والقفل والمقرر المؤرشف ─────────────────────────────────── */
  const lockCache = new Map<string, string | null>();
  const archived = new Map<number, Set<number>>();
  for (const op of validOps) {
    const scopes: Array<{ collegeId: number; sectionId: number; label: string }> = [
      { collegeId: op.target.AdCollegeId, sectionId: op.target.AdSectionId, label: "الشعبة المقترحة" },
    ];
    if (op.out) scopes.push({ collegeId: op.out.snapshot.AdCollegeId, sectionId: op.out.snapshot.AdSectionId, label: "الموعد الخارج" });
    if (op.source) scopes.push({ collegeId: op.source.AdCollegeId, sectionId: op.source.AdSectionId, label: "الموعد المرجعي" });
    for (const scope of scopes) {
      if (!deps.canWrite(req, scope.collegeId, scope.sectionId)) {
        addFinding({
          kind: "blocker", code: "scope-denied", title: "خارج صلاحياتك", opId: op.id,
          detail: `${scope.label} تتبع قسماً لا تملك التعديل فيه.`,
          reason: "التثبيت يمرّ بصلاحيات الحفظ نفسها.", fix: "اطلب من صاحب القسم إعداد هذه المادة.",
        });
      }
      if (input.includeLock) {
        const lockKey = `${scope.collegeId}:${scope.sectionId}`;
        if (!lockCache.has(lockKey)) lockCache.set(lockKey, await deps.scheduleLockRefusal(req, scope.collegeId, scope.sectionId, input.termId));
        const lock = lockCache.get(lockKey);
        if (lock) addFinding({
          kind: "blocker", code: "schedule-locked", title: "الجدول مقفل الآن", detail: lock, opId: op.id,
          reason: "اعتماد الجدول أو إغلاق الفصل يمنع التعديل.", fix: "انتظر فتح الجدول أو راجع من يملك الصلاحية.",
        });
      }
    }
    if (op.kind === "create" || (op.kind === "replace" && op.incoming === "create")) {
      const sectionId = op.target.AdSectionId;
      if (!archived.has(sectionId)) archived.set(sectionId, await Repository.getOperationalCourseIds(sectionId));
      if (!archived.get(sectionId)!.has(op.target.AdCourseId)) addFinding({
        kind: "blocker", code: "course-archived", title: "المقرر مؤرشف", opId: op.id,
        detail: `${op.target.courseName || "المقرر"} مؤرشف أكاديمياً ولا يُضاف إلى جدولٍ جديد.`,
        fix: "اختر مقرراً قائماً في الكتالوج.",
      });
      const taken = world.termRows.some(row => Number(row.AdCourseId) === op.target.AdCourseId && String(row.SCode) === String(op.target.SCode));
      if (taken) addFinding({
        kind: "blocker", code: "section-code-taken", title: "رقم الشعبة مستخدم", opId: op.id,
        detail: `الشعبة ${op.target.SCode} موجودةٌ فعلاً لـ ${op.target.courseName || "هذا المقرر"} في هذا الفصل.`,
        reason: "الشعبة المقترحة جديدة، فلا يجوز أن تشارك رقماً قائماً.", fix: "استعمل الرقم المقترح التالي.",
      });
    }
  }

  /* ── الحكم على كل موعدٍ داخل: بوابة الحفظ نفسها على الجدول الناتج ───── */
  const seenPairs = new Set<string>();
  const gridKeyOf = (opId: string) => {
    const row = applied.incoming.get(opId);
    return row ? (Number(row.id) < 0 ? keyOfNew(opId) : keyOfRow(Number(row.id))) : "";
  };
  for (const op of validOps) {
    const row = applied.incoming.get(op.id);
    if (!row || driftOps.has(op.id) || appliedErrors.has(op.id)) continue;
    let raw: any[] = [];
    let candidate: FSchedule = row;
    if (deps.canonicalizeLocation) {
      try {
        const located = await deps.canonicalizeLocation({ ...row }, Number(row.AdCollegeId), Number(row.AdSectionId));
        if (!located.ok) {
          addFinding({
            kind: "blocker", code: "location-invalid", opId: op.id, title: "المكان غير صالح",
            detail: located.message || "المبنى أو القاعة لا يوافق سجل الأماكن.",
            reason: "الحفظ يتحقق من المكان بالقواعد نفسها.", fix: "اختر المبنى والقاعة من القائمة.",
          });
          continue;
        }
        candidate = { ...row, ...(located.canonical || {}) } as FSchedule;
      } catch { /* the gate below still speaks for the raw hall */ }
    }
    try {
      raw = await deps.scheduleConflicts(req, { ...candidate, AdTermId: input.termId }, Number(row.id), applied.rows);
    } catch (error) {
      incompleteReasons.push(`تعذّر فحص ${op.target.courseName || "مادة"}: ${(error as Error)?.message || "خطأ غير متوقع"}.`);
      continue;
    }
    for (const conflict of raw) {
      const otherId = Number(conflict.otherId || 0);
      const pair = otherId ? `${conflict.type}|${[Number(row.id), otherId].sort((x, y) => x - y).join("|")}` : "";
      if (pair) { if (seenPairs.has(pair)) continue; seenPairs.add(pair); }
      const blocking = !conflict.soft && (isBlockingConflict(conflict) || ["hallBarter", "hallBarterWindow", "roomScope"].includes(conflict.type));
      const informational = ["memory", "rhythm"].includes(conflict.type);
      const kind = blocking ? "blocker" : informational ? "info" : "review";
      const other = otherId ? world.termRows.find(r => Number(r.id) === otherId) || applied.rows.find(r => Number(r.id) === otherId) : undefined;
      const shared = other ? dayOverlap(row, other) : { day: PROPOSAL_DAY_KEYS.find(k => Boolean((row as any)[k])) };
      const keys = [gridKeyOf(op.id)];
      if (other && Number(other.AdInstructorId) === input.instructorId) {
        keys.push(Number(other.id) < 0 ? (() => { for (const [id, r] of applied.incoming) if (Number(r.id) === Number(other.id)) return keyOfNew(id); return ""; })() : keyOfRow(Number(other.id)));
      }
      const advice = REASON_BY_TYPE[String(conflict.type)] || { reason: "", fix: "" };
      addFinding({
        kind, code: String(conflict.type || "conflict"),
        title: String(conflict.message || "نتيجة فحص"),
        detail: String(conflict.detail || ""),
        reason: advice.reason || undefined, fix: advice.fix || undefined,
        opId: op.id, gridKeys: keys.filter(Boolean),
        day: shared.day as StudyProposalDayKey | undefined, start: (shared as any).start, end: (shared as any).end,
      });
    }
  }

  /* ── ملاحظات اللائحة: تُقال ولا تمنع ──────────────────────────────────── */
  const incomingIds = new Set([...applied.incoming.values()].map(row => Number(row.id)));
  if (incomingIds.size) {
    try {
      const touchedScopes = new Set([...applied.incoming.values()].map(row => `${row.AdCollegeId}:${row.AdSectionId}`));
      const around = applied.rows.filter(row => touchedScopes.has(`${row.AdCollegeId}:${row.AdSectionId}`) || Number(row.AdInstructorId) === input.instructorId);
      const review = reviewSchedule({
        rows: around, courses: world.catalog.courseById as any,
        instructors: new Map(world.instructors.map(row => [Number(row.AdInstructorId), row])),
      }).filter(finding => finding.rowIds.some(id => incomingIds.has(Number(id))));
      for (const finding of review) {
        const opEntry = [...applied.incoming.entries()].find(([, row]) => finding.rowIds.includes(Number(row.id)));
        addFinding({
          kind: finding.approvalEffect === "note" ? "info" : "review", code: `regulation:${finding.rule}`,
          title: finding.title, detail: finding.detail, reason: finding.article ? `المرجع: ${finding.article}` : undefined,
          opId: opEntry?.[0], gridKeys: opEntry ? [gridKeyOf(opEntry[0])] : undefined,
        });
      }
    } catch { incompleteReasons.push("تعذّر تطبيق ملاحظات اللائحة على الجدول الناتج."); }
  }

  /* ── المواد المقترحة نفسُها لأكثر من أستاذ ───────────────────────────── */
  if (input.proposalId !== undefined) {
    const others = (await Repository.getStudyProposalsByTerm(input.termId))
      .filter(p => p.id !== input.proposalId && p.sentVersion > 0 && !["withdrawn", "committed", "expired"].includes(p.status));
    for (const op of validOps) {
      if (!op.source || op.kind === "edit") continue;
      const sharing = others.filter(p => p.ops.some(o => o.source?.id === op.source!.id && o.kind !== "edit"));
      if (sharing.length) addFinding({
        kind: "review", code: "shared-section", opId: op.id, title: "الشعبة مقترحةٌ أيضاً في مقترحٍ آخر",
        detail: `هذه الشعبة واردةٌ في ${sharing.length === 1 ? "مقترحٍ نشطٍ آخر" : `${sharing.length} مقترحاتٍ نشطةٍ أخرى`}. الإرسال لا يحجزها؛ من يوافق أولاً ويُثبَّت أولاً يأخذها.`,
        reason: "المقترح المرسل ليس حجزاً فعلياً للشعبة.", fix: "حدّد لمن تُسند الشعبة قبل التثبيت.",
      });
    }
  }

  /* ── الأثر على الجدول الناتج ───────────────────────────────────────────── */
  const instructorRowsAfter = applied.rows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const before = proposalMetrics(instructorRowsBefore, world.catalog.courseById);
  const after = proposalMetrics(instructorRowsAfter, world.catalog.courseById);
  const loadCap = Number((world.instructor as any)?.AdInstructorLoad || 0) || null;
  if (after.unknown.includes("load")) addFinding({
    kind: "info", code: "load-unknown", title: "تعذّر حساب النصاب",
    detail: "ساعات بعض المقررات غير مسجّلة في الكتالوج، فلا يُعرض نصابٌ تخميني.", fix: "سجّل الساعات المعتمدة للمقرر.",
  });
  else if (loadCap && after.loadUnits !== null && after.loadUnits > loadCap) addFinding({
    kind: "review", code: "load-over", title: "النصاب بعد المقترح يتجاوز المسجّل",
    detail: `النصاب بعد المقترح ${after.loadUnits} ساعة والمسجّل ${loadCap}.`,
    reason: "النصاب يُحسب بالساعات المعتمدة لكل شعبةٍ مرّة.", fix: "راجع المواد أو وافق على التجاوز بقرار القسم.",
  });
  for (const op of validOps) {
    if (op.target.locationStatus === "PENDING_ROOM" || !op.target.roomId) addFinding({
      kind: "info", code: "place-pending", opId: op.id, title: "القاعة لم تُحدد",
      detail: `${op.target.courseName || "المادة"} بلا قاعةٍ محدّدة؛ يُعاد فحص القاعة عند تحديدها.`,
    });
  }
  for (const out of applied.outgoing) addFinding({
    kind: "info", code: "outgoing", opId: out.opId,
    title: out.action === "delete" ? "سيُحذف موعدٌ من الجدول" : "سيخرج موعدٌ من جدول الأستاذ",
    detail: `${world.catalog.courseById.get(Number(out.before.AdCourseId))?.CourseName || out.before.AdCourseName || "المقرر"} (شعبة ${out.before.SCode}) — ${out.action === "delete" ? "حذف الموعد من جدول القسم" : "يُفكّ إسناده فقط ويبقى في جدول القسم"}.`,
  });

  /* ── الشبكتان ─────────────────────────────────────────────────────────── */
  const beforeItems = instructorRowsBefore.map(row => gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }));
  const afterItems: GridItem[] = [];
  const ghosts: GridItem[] = [];
  const incomingById = new Map<number, string>();
  for (const [opId, row] of applied.incoming) incomingById.set(Number(row.id), opId);
  const opById = new Map(ops.map(op => [op.id, op]));
  for (const row of instructorRowsAfter) {
    const opId = incomingById.get(Number(row.id));
    const op = opId ? opById.get(opId) : undefined;
    if (!op) afterItems.push(gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }));
    else if (op.kind === "edit") {
      afterItems.push(gridItem(row, world, deps, req, { state: "modified", key: keyOfRow(Number(row.id)), opId, replaces: keyOfRow(Number(row.id)) }));
      const old = world.termRows.find(r => Number(r.id) === Number(op.source!.id));
      if (old) ghosts.push(gridItem(old, world, deps, req, { state: "out", key: `old:${op.source!.id}`, opId, replaces: keyOfRow(Number(row.id)) }));
    } else {
      afterItems.push(gridItem(row, world, deps, req, { state: "proposed", key: Number(row.id) < 0 ? keyOfNew(opId!) : keyOfRow(Number(row.id)), opId }));
    }
  }
  for (const out of applied.outgoing) {
    ghosts.push(gridItem(out.before, world, deps, req, { state: "out", key: `old:${out.rowId}`, opId: out.opId, outAction: out.action }));
  }

  /* ── حالة كل مادة والجاهزية للإرسال ──────────────────────────────────── */
  const perOp: ProposalEvaluation["perOp"] = {};
  for (const op of ops) {
    const own = findings.filter(f => f.opId === op.id);
    const ids = own.map(f => f.id);
    const unchecked = invalidOps.has(op.id) || (!applied.incoming.has(op.id) && !driftOps.has(op.id) && !appliedErrors.has(op.id));
    perOp[op.id] = {
      state: own.some(f => f.kind === "blocker") ? "blocked" : unchecked ? "unchecked" : own.some(f => f.kind === "review") ? "review" : "ok",
      findingIds: ids,
    };
  }
  const counts = {
    blockers: findings.filter(f => f.kind === "blocker").length,
    reviews: findings.filter(f => f.kind === "review").length,
    infos: findings.filter(f => f.kind === "info").length,
  };
  const complete = incompleteReasons.length === 0;
  const reasons: string[] = [];
  if (!ops.length) reasons.push("أضف مادةً واحدةً على الأقل.");
  if (!complete && ops.length) reasons.push("بيانات المقترح أو الفحص غير مكتملة.");
  if (counts.blockers) reasons.push(counts.blockers === 1 ? "يوجد مانعٌ واحد." : `يوجد ${counts.blockers} موانع.`);
  return {
    status: complete ? "complete" : "partial",
    incompleteReasons,
    computedAt: new Date().toISOString(),
    before: { items: beforeItems, metrics: before },
    after: { items: afterItems, ghosts, metrics: after },
    loadCap,
    findings, counts, perOp, drift, opIssues,
    readiness: { canSend: ops.length > 0 && complete && counts.blockers === 0 && drift.length === 0, reasons },
  };
}

/* ── الأوقات البديلة ─────────────────────────────────────────────────────── */

export interface AlternativeSuggestion {
  days: StudyProposalDayKey[];
  start: string;
  end: string;
  reasons: string[];
  blockers: number;
  reviews: number;
  gapDelta: number;
}

const SHORT_FAMILY: StudyProposalDayKey[] = ["fsunday", "ftuesday", "fthursday"];

function dayVariants(days: StudyProposalDayKey[]): StudyProposalDayKey[][] {
  const out: StudyProposalDayKey[][] = [days];
  if (days.every(d => SHORT_FAMILY.includes(d))) {
    const n = days.length;
    const subsets: StudyProposalDayKey[][] = [];
    for (let mask = 1; mask < 8; mask++) {
      const subset = SHORT_FAMILY.filter((_, i) => mask & (1 << i));
      if (subset.length === n && subset.join() !== days.join()) subsets.push(subset);
    }
    out.push(...subsets);
  }
  return out;
}

/**
 * يقترح أوقاتاً بديلةً لمادةٍ متعارضة. النمطُ والمدة محفوظان: تتحرك البداية،
 * وقد تتبدّل أيامُ اللقاء داخل الأسرة نفسها فقط (٥٠ دقيقة لا تُجعل ٨٠).
 * كلُّ بديلٍ يمرّ ببوابة الحفظ على الجدول الناتج للمقترح كلّه.
 */
export async function suggestAlternatives(
  deps: EngineDeps, req: any, input: EvaluateInput, opId: string, world?: LoadedWorld,
): Promise<{ suggestions: AlternativeSuggestion[]; note?: string }> {
  const w = world || await loadWorld(input.termId, input.instructorId);
  const op = input.ops.find(o => o.id === opId);
  if (!op) return { suggestions: [], note: "المادة غير موجودة في المقترح." };
  const duration = durationOf(op.target);
  const baseStart = timeToMinutes(op.target.fstarttime);
  if (!duration) return { suggestions: [], note: "حدّد وقت البداية والنهاية أولاً." };

  const baseOps = input.ops;
  const baseEval = await evaluateProposal(deps, req, { ...input, ops: baseOps }, w);
  const baseGap = baseEval.after.metrics.gapMinutes;
  const baseDays = baseEval.after.metrics.attendanceDays;

  const variants = dayVariants(daysOf(op.target));
  const pool: Array<{ days: StudyProposalDayKey[]; start: number; score: number }> = [];
  for (const days of variants) {
    for (let start = SCHEDULE_DAY_START; start + duration <= SCHEDULE_DAY_END; start += 10) {
      if (days.join() === daysOf(op.target).join() && start === baseStart) continue;
      const dayShift = days.join() === daysOf(op.target).join() ? 0 : 60;
      pool.push({ days, start, score: Math.abs(start - baseStart) + dayShift });
    }
  }
  pool.sort((a, b) => a.score - b.score);

  const placeholderId = [...w.placeholders].sort((a, b) => a - b)[0] || null;
  const ownBase = applyProposalOps(w.termRows, input.ops.filter(o => o.id !== opId), { instructorId: input.instructorId, termId: input.termId, placeholderId });
  const ownRows = ownBase.rows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const nonLecturer = (a: { days: StudyProposalDayKey[]; start: number }) => !ownRows.some(row =>
    a.days.some(d => Boolean((row as any)[d])) && a.start < timeToMinutes(row.fendtime) && timeToMinutes(row.fstarttime) < a.start + duration);

  const survivors = pool.filter(nonLecturer).slice(0, 14);
  const suggestions: AlternativeSuggestion[] = [];
  for (const candidate of survivors) {
    if (suggestions.length >= 4) break;
    const nextOps = input.ops.map(o => o.id !== opId ? o : {
      ...o, target: { ...o.target, days: candidate.days, fstarttime: minutesToTime(candidate.start), fendtime: minutesToTime(candidate.start + duration) },
    });
    const result = await evaluateProposal(deps, req, { ...input, ops: nextOps }, w);
    const own = result.findings.filter(f => f.opId === opId);
    if (own.some(f => f.kind === "blocker")) continue;
    const reasons: string[] = [];
    const gapDelta = result.after.metrics.gapMinutes - baseGap;
    if (gapDelta < 0) reasons.push(`يقلّل الفراغات بين المحاضرات بمقدار ${Math.abs(gapDelta)} دقيقة`);
    else if (gapDelta === 0) reasons.push("لا يزيد الفراغات بين المحاضرات");
    if (result.after.metrics.attendanceDays <= baseDays) reasons.push(result.after.metrics.attendanceDays < baseDays ? "يقلّل أيام الحضور" : "يُبقي أيام الحضور كما هي");
    const shift = Math.abs(candidate.start - baseStart);
    if (shift && candidate.days.join() === daysOf(op.target).join()) reasons.push(`قريب من الوقت الحالي (${shift} دقيقة)`);
    if (candidate.days.join() !== daysOf(op.target).join()) reasons.push(`أيام لقاءٍ مختلفة في النمط نفسه (${daysLabel(candidate.days)})`);
    suggestions.push({
      days: candidate.days, start: minutesToTime(candidate.start), end: minutesToTime(candidate.start + duration),
      reasons, blockers: 0, reviews: own.filter(f => f.kind === "review").length, gapDelta,
    });
  }
  suggestions.sort((a, b) => (a.reviews - b.reviews) || (a.gapDelta - b.gapDelta));
  return suggestions.length
    ? { suggestions }
    : { suggestions: [], note: "لا يوجد وقتٌ بديلٌ صالحٌ يحافظ على نمط اللقاءات ومدتها. جرّب تغيير القاعة أو الأيام." };
}

export { snapshotOf, PROPOSAL_DAY_NAMES };
export type { StudyProposalRowSnapshot };
