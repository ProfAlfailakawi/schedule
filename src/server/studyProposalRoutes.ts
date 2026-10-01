/**
 * ── مسارات المقترح الدراسي ──────────────────────────────────────────────────
 *
 * مسودةٌ يعدّها القسم لأستاذٍ، تبقى مستقلةً عن الجدول الفعلي حتى يوافق ويُثبَّت.
 * هذه الوحدة تسجّل مساراتِ القسم (`/api/study-proposals*`) ومساراتِ الأستاذ
 * (`/api/public/request/:token/proposals*`)، وكلُّ ما تحتاجه من server.ts
 * يأتيها حقناً (`StudyProposalRouteDeps`) حتى لا تُكرَّر قاعدةٌ ولا يُنشأ فاحصٌ ثانٍ.
 *
 * ثوابتُ لا تُكسر:
 *   · لا كتابةَ في الجدول إلا في «التثبيت»، وفي معاملةٍ واحدة (commitStudyProposal).
 *   · الإرسالُ ليس حجزاً: لا شعبةَ ولا قاعةَ تُحجز به.
 *   · موافقةُ نسخةٍ لا تنطبق على غيرها؛ وتعديلُ تفاصيل ما أُرسل ينشئ نسخةً جديدة.
 *   · الرقمُ المدني لا يُخزَّن: يُتحقَّق منه ثم تُحفظ بصمتُه ورمزُ التوقيع.
 */
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import type { Express, Request, RequestHandler, Response } from "express";
import {
  Repository, ScheduleRevisionConflict, StudyProposalAlreadyCommitted, StudyProposalRevisionConflict,
} from "../db/repository";
import type {
  AdCourse, FSchedule, InstructorRequest, InstructorRequestEventKind, StudyProposal, StudyProposalEvent,
  StudyProposalOp, StudyProposalOpKind, StudyProposalResponse, StudyProposalResponseMode, StudyProposalRowSpec,
  StudyProposalDayKey, StudyProposalVersion,
} from "../types";
import { toEnglishDigits } from "../utils/digits";
import { normalizeClock, withinScheduleDay } from "../utils/scheduleTime";
import { timeToMinutes } from "../utils/scheduleIntelligence";
import {
  applyProposalOps, commitReadiness, decisionStateOf, defaultTitle, effectiveStatus, expiryAfterDays,
  legacyDetailOf, materialFingerprint, nextSectionCodeFrom, opSummary, PROPOSAL_DAY_KEYS, PROPOSAL_DEFAULT_MESSAGE,
  PROPOSAL_MAX_OPS, PROPOSAL_MESSAGE_LIMIT, PROPOSAL_NOTE_LIMIT, proposalDrift, proposalMetrics, responseGate,
  snapshotOf, STATUS_LABEL, daysOf, type DecisionState, type GridItem,
} from "../utils/studyProposal";
import {
  evaluateProposal, gridItem, keyOfNew, keyOfRow, loadWorld, suggestAlternatives, type EngineDeps, type LoadedWorld,
} from "./studyProposalEngine";

export interface StudyProposalRouteDeps extends EngineDeps {
  requirePermission: (formNameId: number) => RequestHandler;
  broadcastNotify: (demoSessionId?: string) => void;
  resolveRequestLink: (token: string) => Promise<
    | { link: { id: string; AdTermId: number; AdInstructorId?: number }; request: InstructorRequest }
    | { error: string; status: number }>;
  verifyRequestSigner: (request: InstructorRequest, req: Request, res: Response) => Promise<string>;
  surveyFingerprint: (civil: string) => Promise<string>;
  verificationCode: (versionId: string, userId: number, at: string) => string;
  captureScopeVersion: (req: any, collegeId: number, sectionId: number, termId: number, label: string, source?: any) => Promise<any>;
  recordVersionAfter: (version: any, after: any[] | ((before: any[]) => any[])) => Promise<void>;
  noteScheduleMutation: (req: any, collegeId: number, sectionId: number, termId: number, change: { kind: "add" | "edit" | "delete"; row?: any; rows?: any[] }) => Promise<void>;
  /** أقسام الأسرة العلمية نفسها في كلياتها: مقرّرات تُقترح منها شعبٌ جديدة. */
  departmentScopes?: (request: InstructorRequest) => Promise<Array<{ collegeId: number; collegeName: string; sectionId: number }>>;
  roleLabel: (role: unknown) => string;
  demoSessionId: () => string;
}

const heavyLimit = rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: "طلباتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});
const publicLimit = rateLimit({
  windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

const OP_KINDS: StudyProposalOpKind[] = ["assign", "create", "edit", "replace"];
const LOCATION_STATUSES = new Set(["VERIFIED", "PENDING_ROOM", "LOCATION_REVIEW_REQUIRED", "INVALID_HISTORICAL"]);
const CHANGE_REASONS = new Set(["time", "place", "days", "load", "other"]);

/* ── التنقية: لا يُوثَق بشيءٍ من المتصفح غير ما يختاره المنسّق ──────────── */

const text = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);

function cleanDays(raw: unknown): StudyProposalDayKey[] {
  const set = new Set(Array.isArray(raw) ? raw.map(String) : []);
  return PROPOSAL_DAY_KEYS.filter(key => set.has(key));
}

async function sanitizeOps(
  raw: unknown, world: LoadedWorld, stored?: StudyProposal,
): Promise<{ ops: StudyProposalOp[]; error?: string }> {
  if (!Array.isArray(raw)) return { ops: [], error: "قائمة المواد غير صالحة." };
  if (raw.length > PROPOSAL_MAX_OPS) return { ops: [], error: `الحدّ الأقصى ${PROPOSAL_MAX_OPS} مادة في المقترح الواحد.` };
  const ops: StudyProposalOp[] = [];
  const used = new Set<string>();
  const liveById = new Map<number, FSchedule>(world.termRows.map(row => [Number(row.id), row]));
  const keepSnapshots = Boolean(stored && stored.sentVersion > 0);
  for (const item of raw as any[]) {
    const kind = OP_KINDS.includes(item?.kind) ? (item.kind as StudyProposalOpKind) : null;
    if (!kind) return { ops: [], error: "نوع العملية غير معروف." };
    let id = /^[A-Za-z0-9_-]{4,40}$/.test(String(item?.id || "")) ? String(item.id) : randomUUID();
    if (used.has(id)) id = randomUUID();
    used.add(id);
    const previous = stored?.ops.find(op => op.id === id);

    const snapshotFor = (rawSnapshot: any, prior?: { id: number } & any) => {
      const rowId = Number(rawSnapshot?.id || 0);
      const live = liveById.get(rowId);
      if (!live) return { error: "أحد المواعيد المرجعية لم يعد موجوداً في الجدول." } as const;
      if (keepSnapshots && prior && Number(prior.id) === rowId) return { snapshot: prior } as const;
      return { snapshot: snapshotOf(live, world.catalog) } as const;
    };

    let source = undefined as StudyProposalOp["source"];
    let out = undefined as StudyProposalOp["out"];
    let incoming: StudyProposalOp["incoming"];
    if (kind === "replace") {
      incoming = item?.incoming === "create" ? "create" : item?.incoming === "assign" ? "assign" : undefined;
      if (!incoming) return { ops: [], error: "حدّد هل الداخل في الاستبدال شعبةٌ قائمة أم جديدة." };
      const action = item?.out?.action === "delete" ? "delete" : "unassign";
      const got = snapshotFor(item?.out?.snapshot, previous?.out?.snapshot);
      if ("error" in got) return { ops: [], error: got.error };
      out = { snapshot: got.snapshot, action };
    }
    const needsSource = kind === "assign" || kind === "edit" || (kind === "replace" && incoming === "assign");
    if (needsSource) {
      const got = snapshotFor(item?.source, previous?.source);
      if ("error" in got) return { ops: [], error: got.error };
      source = got.snapshot;
    }

    /* المقرر يأتي من الكتالوج لا من المتصفح، وقسمُه وكليتُه منه. */
    const rawTarget = item?.target || {};
    const courseId = needsSource ? Number(source!.AdCourseId) : Number(rawTarget.AdCourseId || 0);
    const course = world.catalog.courseById.get(courseId) as AdCourse | undefined;
    if (!course) return { ops: [], error: "المقرر المختار غير موجود في الكتالوج." };
    const days = cleanDays(rawTarget.days);
    const status = LOCATION_STATUSES.has(String(rawTarget.locationStatus)) ? (String(rawTarget.locationStatus) as any) : undefined;
    const target: StudyProposalRowSpec = {
      AdCollegeId: Number(course.AdCollegeId),
      AdSectionId: Number(course.AdSectionId),
      AdCourseId: Number(course.AdCourseId),
      courseName: String(course.CourseName || ""),
      courseCode: String(course.CourseCode || ""),
      /* الإسناد والتعديل لا يغيّران رقم شعبةٍ قائمة؛ أما الجديدة فتُكتب أرقاماً لاتينية. */
      SCode: needsSource ? String(source!.SCode) : toEnglishDigits(rawTarget.SCode).replace(/\D/g, "").slice(0, 20),
      days,
      fstarttime: normalizeClock(rawTarget.fstarttime),
      fendtime: normalizeClock(rawTarget.fendtime),
      AdRoomCode: text(rawTarget.AdRoomCode, 40),
      AdRoomHall: text(rawTarget.AdRoomHall, 40),
      buildingId: rawTarget.buildingId ? text(rawTarget.buildingId, 80) : undefined,
      roomId: rawTarget.roomId ? text(rawTarget.roomId, 80) : undefined,
      locationStatus: status,
    };
    ops.push({ id, kind, source, out, incoming, target, note: item?.note ? text(item.note, 300) : undefined });
  }
  return { ops };
}

/* ── تحويل الوثيقة إلى ما يُعرض ──────────────────────────────────────────── */

function compact(proposal: StudyProposal) {
  return { ...proposal, versions: proposal.versions.map(v => ({ ...v, ops: undefined, opCount: v.ops.length })) };
}

function staffView(proposal: StudyProposal, termClosed = false) {
  const decision = decisionStateOf(proposal);
  return {
    proposal,
    status: effectiveStatus(proposal),
    statusLabel: STATUS_LABEL[effectiveStatus(proposal)],
    decision,
    gate: responseGate(proposal, Date.now(), termClosed),
    commitReadiness: commitReadiness(proposal),
  };
}

function conflictBody(current: StudyProposal) {
  return { error: "عدّل شخصٌ آخر هذا المقترح أثناء عملك. أعيد تحميل آخر نسخة.", conflict: "revision", current };
}

function pushEvent(proposal: StudyProposal, event: Omit<StudyProposalEvent, "at"> & { at?: string }): StudyProposalEvent[] {
  return [...proposal.events, { at: new Date().toISOString(), ...event }].slice(-120);
}

/** يضيف حدثاً إلى سجل طلب الأستاذ (يظهر في الحوار). فشلُه لا يُبطل ما كُتب. */
async function noteOnRequest(requestId: string, kind: InstructorRequestEventKind, by: string | undefined, detail: string): Promise<void> {
  try {
    const request = await Repository.getInstructorRequest(requestId);
    if (!request) return;
    await Repository.saveInstructorRequest({
      ...request,
      timeline: [...(request.timeline || []), { kind, at: new Date().toISOString(), ...(by ? { by } : {}), detail }].slice(-300),
    });
  } catch (error) {
    console.error("[study-proposal] تعذّر تسجيل الحدث في الحوار:", error instanceof Error ? error.message : error);
  }
}

export function registerStudyProposalRoutes(app: Express, deps: StudyProposalRouteDeps): void {
  const staff = deps.requirePermission(7);
  const admin = (req: any) => Boolean(req.user?.IsAdminUser);
  const canSeeScope = (req: any, c: number, s: number) => admin(req) || deps.canSee(req, c, s);
  const canWriteScope = (req: any, c: number, s: number) => admin(req) || deps.canWrite(req, c, s);

  async function loadForStaff(req: any, res: Response, id: string, write = false): Promise<StudyProposal | null> {
    const proposal = await Repository.getStudyProposal(String(id || ""));
    if (!proposal) { res.status(404).json({ error: "لا يوجد مقترحٌ بهذا المعرّف." }); return null; }
    const ok = write ? canWriteScope(req, proposal.AdCollegeId, proposal.AdSectionId) : canSeeScope(req, proposal.AdCollegeId, proposal.AdSectionId);
    if (!ok) { res.status(403).json({ error: "هذا المقترح خارج نطاقك." }); return null; }
    return proposal;
  }

  async function loadRequestForStaff(req: any, res: Response, requestId: string): Promise<InstructorRequest | null> {
    const request = await Repository.getInstructorRequest(String(requestId || ""));
    if (!request) { res.status(404).json({ error: "لا يوجد طلبٌ بهذا المعرّف." }); return null; }
    if (!canSeeScope(req, Number(request.AdCollegeId), Number(request.AdSectionId))) {
      res.status(403).json({ error: "هذا الطلب خارج نطاقك." }); return null;
    }
    return request;
  }

  const termClosedOf = (world: LoadedWorld) => world.term?.AdTermClosed === true;

  /** انتهاءُ الصلاحية يُسجَّل مرّةً واحدة عند أول قراءةٍ بعده. */
  async function settleExpiry(proposal: StudyProposal): Promise<StudyProposal> {
    if (proposal.status !== "sent" || !proposal.expiresAt || Date.parse(proposal.expiresAt) >= Date.now()) return proposal;
    if (effectiveStatus(proposal) !== "expired") return proposal;
    try {
      const saved = await Repository.saveStudyProposal(
        { ...proposal, status: "expired", events: pushEvent(proposal, { kind: "expired", version: proposal.sentVersion }) }, proposal.rev);
      await noteOnRequest(proposal.requestId, "study-proposal-expired", undefined, proposal.id);
      return saved;
    } catch { return proposal; }
  }

  /* ════════════════ القسم ════════════════ */

  /** قائمة المقترحات في النطاق. */
  app.get("/api/study-proposals", staff, async (req: any, res: Response) => {
    const termId = Number(req.query.termId || 0);
    const collegeId = Number(req.query.collegeId || 0);
    const sectionId = Number(req.query.sectionId || 0);
    if (!termId) { res.status(400).json({ error: "حدّد الفصل." }); return; }
    const requestId = String(req.query.requestId || "");
    let rows = requestId ? await Repository.getStudyProposalsByRequest(requestId) : await Repository.getStudyProposalsByTerm(termId);
    rows = rows.filter(row => Number(row.AdTermId) === termId
      && (!collegeId || Number(row.AdCollegeId) === collegeId) && (!sectionId || Number(row.AdSectionId) === sectionId)
      && canSeeScope(req, row.AdCollegeId, row.AdSectionId));
    const settled = await Promise.all(rows.map(settleExpiry));
    res.setHeader("Cache-Control", "no-store");
    res.json({ proposals: settled.map(p => ({ ...staffView(p), proposal: compact(p) })) });
  });

  /** كل ما تحتاجه مساحة العمل لتفتح: الأستاذ، جدوله، الكتالوج، الشعب المتاحة. */
  app.get("/api/study-proposals/context", staff, heavyLimit, async (req: any, res: Response) => {
    const request = await loadRequestForStaff(req, res, String(req.query.requestId || ""));
    if (!request) return;
    const termId = Number(request.AdTermId);
    const world = await loadWorld(termId, Number(request.AdInstructorId));
    if (!world.instructor) { res.status(404).json({ error: "لم يُعثر على الأستاذ." }); return; }

    const baseScopes = deps.departmentScopes
      ? await deps.departmentScopes(request)
      : [{ collegeId: Number(request.AdCollegeId), collegeName: "", sectionId: Number(request.AdSectionId) }];
    const scopes = baseScopes.filter(scope => canWriteScope(req, scope.collegeId, scope.sectionId));
    const courseRows: Array<Record<string, unknown>> = [];
    for (const scope of scopes) {
      const [courses, operational] = await Promise.all([
        Repository.getCoursesBySection(scope.sectionId), Repository.getOperationalCourseIds(scope.sectionId),
      ]);
      const college = world.colleges.find(c => Number(c.AdCollegeId) === scope.collegeId);
      for (const course of courses as AdCourse[]) {
        if (!operational.has(Number(course.AdCourseId))) continue;
        courseRows.push({
          id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
          hours: Number(course.CourseHours || course.CourseCredit || 0), collegeId: scope.collegeId,
          collegeName: scope.collegeName || college?.AdCollegeName || "", sectionId: scope.sectionId,
        });
      }
    }
    const courseIds = new Set(courseRows.map(row => Number(row.id)));
    const usedCodes: Record<number, number[]> = {};
    for (const row of world.termRows) {
      const id = Number(row.AdCourseId);
      if (!courseIds.has(id)) continue;
      (usedCodes[id] ||= []).push(Number(row.SCode));
    }
    const faculty = world.termRows
      .filter(row => world.placeholders.has(Number(row.AdInstructorId)) && canWriteScope(req, Number(row.AdCollegeId), Number(row.AdSectionId)))
      .slice(0, 1500)
      .map(row => ({
        snapshot: snapshotOf(row, world.catalog),
        item: gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }),
      }));
    const instructorRows = world.termRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
    const current = instructorRows.map(row => gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }));
    const scopeCollege = world.colleges.find(c => Number(c.AdCollegeId) === Number(request.AdCollegeId));
    const scopeSection = world.sections.find(c => Number(c.AdSectionId) === Number(request.AdSectionId));
    const mine = await Repository.getStudyProposalsByRequest(request.id);
    const settled = await Promise.all(mine.filter(row => canSeeScope(req, row.AdCollegeId, row.AdSectionId)).map(settleExpiry));
    let proposal: ReturnType<typeof staffView> | null = null;
    const wanted = String(req.query.proposalId || "");
    if (wanted) {
      const found = settled.find(row => row.id === wanted);
      if (!found) { res.status(404).json({ error: "لا يوجد مقترحٌ بهذا المعرّف في هذا الطلب." }); return; }
      proposal = staffView(found, termClosedOf(world));
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      request: {
        id: request.id, linkId: request.linkId, status: request.status, collegeId: request.AdCollegeId, sectionId: request.AdSectionId,
        items: (request.items || []).map((item, index) => ({
          index, action: item.action, courseName: item.after?.courseName || item.before?.courseName || "",
          sectionCode: item.after?.sectionCode || item.before?.sectionCode || "", decision: item.decision?.state || "pending",
        })),
      },
      instructor: {
        id: Number(world.instructor.AdInstructorId), name: String(world.instructor.AdInstructorName || ""),
        loadCap: Number((world.instructor as any).AdInstructorLoad || 0) || null,
        retired: (world.instructor as any).AdInstructorStatus === "retired",
      },
      term: { id: termId, name: String(world.term?.AdTermName || ""), closed: termClosedOf(world) },
      scope: {
        collegeId: Number(request.AdCollegeId), collegeName: scopeCollege?.AdCollegeName || "",
        sectionId: Number(request.AdSectionId), sectionName: scopeSection?.AdSectionName || "",
      },
      courses: courseRows, usedCodes, faculty,
      current: { items: current, metrics: proposalMetrics(instructorRows, world.catalog.courseById) },
      hasPlaceholder: world.placeholders.size > 0,
      proposals: settled.map(p => ({ ...staffView(p, termClosedOf(world)), proposal: compact(p) })),
      proposal,
      serverNow: new Date().toISOString(),
    });
  });

  /** فحصُ العمل الجاري (لم يُحفظ بعد). لا يكتب شيئاً. */
  app.post("/api/study-proposals/evaluate", staff, heavyLimit, async (req: any, res: Response) => {
    const request = await loadRequestForStaff(req, res, String(req.body?.requestId || ""));
    if (!request) return;
    const world = await loadWorld(Number(request.AdTermId), Number(request.AdInstructorId));
    const stored = req.body?.proposalId ? await Repository.getStudyProposal(String(req.body.proposalId)) : undefined;
    const clean = await sanitizeOps(req.body?.ops, world, stored);
    if (clean.error) { res.status(400).json({ error: clean.error }); return; }
    const evaluation = await evaluateProposal(deps, req, {
      instructorId: Number(request.AdInstructorId), termId: Number(request.AdTermId),
      collegeId: Number(request.AdCollegeId), sectionId: Number(request.AdSectionId),
      ops: clean.ops, proposalId: stored?.id ?? "", includeLock: req.body?.includeLock === true,
    }, world);
    res.setHeader("Cache-Control", "no-store");
    res.json({ evaluation });
  });

  /** أوقاتٌ بديلة لمادةٍ بعينها، مفحوصةٌ على المقترح كلّه. */
  app.post("/api/study-proposals/alternatives", staff, heavyLimit, async (req: any, res: Response) => {
    const request = await loadRequestForStaff(req, res, String(req.body?.requestId || ""));
    if (!request) return;
    const world = await loadWorld(Number(request.AdTermId), Number(request.AdInstructorId));
    const stored = req.body?.proposalId ? await Repository.getStudyProposal(String(req.body.proposalId)) : undefined;
    const clean = await sanitizeOps(req.body?.ops, world, stored);
    if (clean.error) { res.status(400).json({ error: clean.error }); return; }
    const opId = String(req.body?.opId || "");
    if (!clean.ops.some(op => op.id === opId)) { res.status(400).json({ error: "المادة غير موجودة في المقترح." }); return; }
    const result = await suggestAlternatives(deps, req, {
      instructorId: Number(request.AdInstructorId), termId: Number(request.AdTermId),
      collegeId: Number(request.AdCollegeId), sectionId: Number(request.AdSectionId), ops: clean.ops, proposalId: stored?.id ?? "",
    }, opId, world);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  });

  /** يحفظ مسودةً جديدة. */
  app.post("/api/study-proposals", staff, heavyLimit, async (req: any, res: Response) => {
    const request = await loadRequestForStaff(req, res, String(req.body?.requestId || ""));
    if (!request) return;
    if (!canWriteScope(req, Number(request.AdCollegeId), Number(request.AdSectionId))) {
      res.status(403).json({ error: "لا تملك إعداد مقترحٍ لهذا القسم." }); return;
    }
    const lock = await deps.scheduleLockRefusal(req, Number(request.AdCollegeId), Number(request.AdSectionId), Number(request.AdTermId), { registrarLock: false });
    if (lock) { res.status(409).json({ error: lock, code: "schedule-locked" }); return; }
    const world = await loadWorld(Number(request.AdTermId), Number(request.AdInstructorId));
    const clean = await sanitizeOps(req.body?.ops || [], world);
    if (clean.error) { res.status(400).json({ error: clean.error }); return; }
    const itemIndex = Number.isInteger(Number(req.body?.itemIndex)) && req.body?.itemIndex !== null && req.body?.itemIndex !== "" ? Number(req.body.itemIndex) : null;
    const mode: StudyProposalResponseMode = req.body?.responseMode === "linked" ? "linked" : "independent";
    const name = String(world.instructor?.AdInstructorName || "");
    const by = String(req.user?.Name || req.user?.SystemUserLogin || "");
    const now = new Date().toISOString();
    const created = await Repository.createStudyProposal({
      AdCollegeId: Number(request.AdCollegeId), AdSectionId: Number(request.AdSectionId), AdTermId: Number(request.AdTermId),
      AdInstructorId: Number(request.AdInstructorId), requestId: request.id, linkId: request.linkId, itemIndex,
      title: text(req.body?.title, 160) || defaultTitle(name, String(world.term?.AdTermName || "")),
      status: "draft", version: 1, sentVersion: 0, responseMode: mode,
      message: text(req.body?.message, PROPOSAL_MESSAGE_LIMIT) || PROPOSAL_DEFAULT_MESSAGE,
      ops: clean.ops, expiryDays: expiryAfterDays(req.body?.expiryDays).days,
      versions: [], responses: [], events: [{ kind: "created", at: now, by, version: 1 }],
      createdBy: Number(req.user?.SystemUserId || 0), createdByName: by,
    });
    deps.broadcastNotify(deps.demoSessionId());
    res.status(201).json(staffView(created, termClosedOf(world)));
  });

  /** يحفظ تعديل المسودة. تغييرُ تفاصيل ما أُرسل ينشئ نسخةً جديدة. */
  app.put("/api/study-proposals/:id", staff, heavyLimit, async (req: any, res: Response) => {
    const proposal = await loadForStaff(req, res, String(req.params.id), true);
    if (!proposal) return;
    if (proposal.commit || proposal.status === "committed" || proposal.status === "withdrawn") {
      res.status(409).json({ error: proposal.status === "withdrawn" ? "هذا المقترح مسحوب." : "ثُبّت هذا المقترح ولا يُعدَّل." }); return;
    }
    const expectedRev = Number(req.body?.rev);
    if (!Number.isInteger(expectedRev)) { res.status(400).json({ error: "رقم المراجعة مطلوب." }); return; }
    if (expectedRev !== proposal.rev) { res.status(409).json(conflictBody(proposal)); return; }
    const world = await loadWorld(Number(proposal.AdTermId), Number(proposal.AdInstructorId));
    const clean = await sanitizeOps(req.body?.ops ?? proposal.ops, world, proposal);
    if (clean.error) { res.status(400).json({ error: clean.error }); return; }
    const mode: StudyProposalResponseMode = req.body?.responseMode === "linked" ? "linked" : req.body?.responseMode === "independent" ? "independent" : proposal.responseMode;
    const lastSent = proposal.versions.find(v => v.version === proposal.sentVersion);
    const changedFromSent = Boolean(lastSent)
      && materialFingerprint(clean.ops, mode) !== materialFingerprint(lastSent!.ops, lastSent!.responseMode);
    const bump = proposal.sentVersion > 0 && proposal.version === proposal.sentVersion && changedFromSent;
    const version = bump ? proposal.version + 1 : proposal.version;
    const by = String(req.user?.Name || req.user?.SystemUserLogin || "");
    const next: StudyProposal = {
      ...proposal,
      title: text(req.body?.title, 160) || proposal.title,
      message: req.body?.message !== undefined ? text(req.body.message, PROPOSAL_MESSAGE_LIMIT) : proposal.message,
      responseMode: mode, ops: clean.ops, version,
      expiryDays: req.body?.expiryDays !== undefined ? expiryAfterDays(req.body.expiryDays).days : proposal.expiryDays,
      status: bump ? "draft" : proposal.status,
      events: pushEvent(proposal, { kind: "saved", by, version, detail: bump ? "نسخةٌ جديدة بعد تعديل ما أُرسل" : undefined }),
    };
    try {
      const saved = await Repository.saveStudyProposal(next, expectedRev);
      deps.broadcastNotify(deps.demoSessionId());
      res.json(staffView(saved, termClosedOf(world)));
    } catch (error) {
      if (error instanceof StudyProposalRevisionConflict) { res.status(409).json(conflictBody(error.current)); return; }
      throw error;
    }
  });

  /** يرسل النسخة الحالية للأستاذ بعد إعادة الفحص. لا يحجز شيئاً. */
  app.post("/api/study-proposals/:id/send", staff, heavyLimit, async (req: any, res: Response) => {
    const proposal = await loadForStaff(req, res, String(req.params.id), true);
    if (!proposal) return;
    if (proposal.commit || proposal.status === "committed") { res.status(409).json({ error: "ثُبّت هذا المقترح من قبل." }); return; }
    if (proposal.status === "withdrawn") { res.status(409).json({ error: "هذا المقترح مسحوب. أنشئ مقترحاً جديداً." }); return; }
    const expectedRev = Number(req.body?.rev);
    if (!Number.isInteger(expectedRev)) { res.status(400).json({ error: "رقم المراجعة مطلوب." }); return; }
    /* ضغطتان على «إرسال»: الثانية ترى النسخة نفسها مرسلةً فلا تُرسل مرتين. */
    if (proposal.sentVersion === proposal.version && proposal.sentVersion > 0 && effectiveStatus(proposal) !== "expired") {
      res.json({ ...staffView(proposal), alreadySent: true }); return;
    }
    if (expectedRev !== proposal.rev) { res.status(409).json(conflictBody(proposal)); return; }
    const lock = await deps.scheduleLockRefusal(req, proposal.AdCollegeId, proposal.AdSectionId, proposal.AdTermId, { registrarLock: false });
    if (lock) { res.status(409).json({ error: lock, code: "schedule-locked" }); return; }
    const link = await deps.resolveRequestLink(proposal.linkId);
    if ("error" in link) { res.status(409).json({ error: "رابط الأستاذ موقوف أو منتهٍ؛ أصدر له رابطاً جديداً قبل الإرسال.", code: "link-unavailable" }); return; }
    const world = await loadWorld(proposal.AdTermId, proposal.AdInstructorId);
    if (termClosedOf(world)) { res.status(409).json({ error: "انتهى هذا الفصل ولا تُرسل فيه مقترحات.", code: "term-closed" }); return; }
    const evaluation = await evaluateProposal(deps, req, {
      instructorId: proposal.AdInstructorId, termId: proposal.AdTermId, collegeId: proposal.AdCollegeId, sectionId: proposal.AdSectionId,
      ops: proposal.ops, proposalId: proposal.id,
    }, world);
    if (!evaluation.readiness.canSend) {
      res.status(409).json({ error: evaluation.readiness.reasons[0] || "المقترح غير جاهزٍ للإرسال.", code: "not-ready", evaluation }); return;
    }
    const by = String(req.user?.Name || req.user?.SystemUserLogin || "");
    const message = text(req.body?.message ?? proposal.message, PROPOSAL_MESSAGE_LIMIT) || PROPOSAL_DEFAULT_MESSAGE;
    const expiry = expiryAfterDays(req.body?.expiryDays ?? proposal.expiryDays);
    const revised = proposal.sentVersion > 0;
    const sentAt = new Date().toISOString();
    const snapshot: StudyProposalVersion = {
      version: proposal.version, sentAt, sentBy: Number(req.user?.SystemUserId || 0), sentByName: by, message,
      responseMode: proposal.responseMode, expiresAt: expiry.expiresAt, ops: proposal.ops, title: proposal.title,
      impact: { before: evaluation.before.metrics, after: evaluation.after.metrics, loadCap: evaluation.loadCap },
    };
    const next: StudyProposal = {
      ...proposal, message, status: "sent", sentVersion: proposal.version, expiresAt: expiry.expiresAt, expiryDays: expiry.days,
      versions: [...proposal.versions.filter(v => v.version !== proposal.version), snapshot],
      events: pushEvent(proposal, { kind: revised ? "revised" : "sent", by, version: proposal.version }),
    };
    try {
      const saved = await Repository.saveStudyProposal(next, expectedRev);
      await noteOnRequest(proposal.requestId, revised ? "study-proposal-revised" : "study-proposal-sent", by, `${saved.id}|${saved.version}`);
      deps.broadcastNotify(deps.demoSessionId());
      res.json({ ...staffView(saved, termClosedOf(world)), alreadySent: false, evaluation });
    } catch (error) {
      if (error instanceof StudyProposalRevisionConflict) { res.status(409).json(conflictBody(error.current)); return; }
      throw error;
    }
  });

  /** يسحب المقترح: لا يعود الأستاذ قادراً على الرد عليه. */
  app.post("/api/study-proposals/:id/withdraw", staff, heavyLimit, async (req: any, res: Response) => {
    const proposal = await loadForStaff(req, res, String(req.params.id), true);
    if (!proposal) return;
    if (proposal.commit || proposal.status === "committed") { res.status(409).json({ error: "ثُبّت هذا المقترح ولا يُسحب." }); return; }
    if (proposal.status === "withdrawn") { res.json(staffView(proposal)); return; }
    const expectedRev = Number(req.body?.rev);
    if (expectedRev !== proposal.rev) { res.status(409).json(conflictBody(proposal)); return; }
    const by = String(req.user?.Name || req.user?.SystemUserLogin || "");
    try {
      const saved = await Repository.saveStudyProposal({ ...proposal, status: "withdrawn", events: pushEvent(proposal, { kind: "withdrawn", by, version: proposal.version }) }, expectedRev);
      if (proposal.sentVersion > 0) await noteOnRequest(proposal.requestId, "study-proposal-withdrawn", by, saved.id);
      deps.broadcastNotify(deps.demoSessionId());
      res.json(staffView(saved));
    } catch (error) {
      if (error instanceof StudyProposalRevisionConflict) { res.status(409).json(conflictBody(error.current)); return; }
      throw error;
    }
  });

  /**
   * «مراجعة وتثبيت». بلا `confirm` تُعيد الفحصَ وتقول ما سيحدث دون أن تكتب؛ ومع
   * `confirm` تنفّذ المجموعة كلَّها في معاملةٍ واحدة، أو لا تنفّذ شيئاً.
   */
  app.post("/api/study-proposals/:id/commit", staff, heavyLimit, async (req: any, res: Response) => {
    const proposal = await loadForStaff(req, res, String(req.params.id), true);
    if (!proposal) return;
    if (proposal.commit || proposal.status === "committed") { res.json({ ...staffView(proposal), alreadyCommitted: true }); return; }
    const ready = commitReadiness(proposal);
    if (!ready.ok) { res.status(409).json({ error: ready.message, code: ready.code }); return; }
    const confirm = req.body?.confirm === true;
    const expectedRev = Number(req.body?.rev);
    if (confirm && expectedRev !== proposal.rev) { res.status(409).json(conflictBody(proposal)); return; }

    const world = await loadWorld(proposal.AdTermId, proposal.AdInstructorId);
    const ops = proposal.ops.filter(op => ready.opIds.includes(op.id));
    const refuse = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
      res.status(status).json({ error, code, ...extra });

    /* الصلاحيات والقفل لكل قسمٍ تمسّه العملية. */
    const scopes = new Map<string, { c: number; s: number }>();
    for (const op of ops) {
      for (const scope of [
        { c: op.target.AdCollegeId, s: op.target.AdSectionId },
        ...(op.source ? [{ c: op.source.AdCollegeId, s: op.source.AdSectionId }] : []),
        ...(op.out ? [{ c: op.out.snapshot.AdCollegeId, s: op.out.snapshot.AdSectionId }] : []),
      ]) scopes.set(`${scope.c}:${scope.s}`, scope);
    }
    for (const scope of scopes.values()) {
      if (!canWriteScope(req, scope.c, scope.s)) return void refuse(403, "scope-denied", "إحدى مواد المقترح تتبع قسماً لا تملك التعديل فيه.");
      const lock = await deps.scheduleLockRefusal(req, scope.c, scope.s, proposal.AdTermId);
      if (lock) return void refuse(409, "schedule-locked", lock);
    }
    if (termClosedOf(world)) return void refuse(409, "term-closed", "انتهى هذا الفصل ولا يُثبَّت فيه جديد.");

    const placeholderId = [...world.placeholders].sort((a, b) => a - b)[0] || null;
    const drift = proposalDrift(proposal.ops, world.termRows, world.placeholders, { instructorId: proposal.AdInstructorId, onlyOpIds: new Set(ready.opIds) });
    if (drift.length) return void refuse(409, "proposal-stale", "تغيّرت بيانات الجدول بعد إرسال المقترح. راجع التغييرات قبل التثبيت.", { drift });

    const evaluation = await evaluateProposal(deps, req, {
      instructorId: proposal.AdInstructorId, termId: proposal.AdTermId, collegeId: proposal.AdCollegeId, sectionId: proposal.AdSectionId,
      ops: proposal.ops, onlyOpIds: ready.opIds, proposalId: proposal.id,
    }, world);
    if (evaluation.counts.blockers || evaluation.status !== "complete") {
      return void refuse(409, "proposal-blocked", evaluation.findings.find(f => f.kind === "blocker")?.title || "يوجد ما يمنع التثبيت.", { evaluation });
    }
    if (!confirm) { res.json({ ok: true, dryRun: true, opIds: ready.opIds, partial: ready.partial, evaluation }); return; }

    /* ── التنفيذ ─────────────────────────────────────────────────────────── */
    const applied = applyProposalOps(world.termRows, ops, {
      instructorId: proposal.AdInstructorId, termId: proposal.AdTermId, placeholderId, onlyOpIds: new Set(ready.opIds),
    });
    if (applied.errors.length) return void refuse(409, "proposal-stale", applied.errors[0].message);
    const liveById = new Map(world.termRows.map(row => [Number(row.id), row]));
    const creates: Array<Omit<FSchedule, "id">> = [];
    const createOpIds: string[] = [];
    const updates: Array<{ id: number; fields: Partial<FSchedule>; expectedRev: number }> = [];
    const deletes: Array<{ id: number; expectedRev: number }> = [];
    const perOp = new Map<string, { created: number[]; updated: number[]; deleted: number[] }>();
    const entry = (opId: string) => { const e = perOp.get(opId) || { created: [], updated: [], deleted: [] }; perOp.set(opId, e); return e; };
    const curriculumCache = new Map<number, any>();
    const planFor = async (sectionId: number, courseId: number) => {
      if (!curriculumCache.has(sectionId)) {
        const [plans, members] = await Promise.all([Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId)]);
        curriculumCache.set(sectionId, { plans, members });
      }
      const { plans, members } = curriculumCache.get(sectionId);
      const ids = new Set(members.filter((m: any) => Number(m.AdCourseId) === courseId).map((m: any) => m.planId));
      return plans.find((p: any) => p.status === "active" && ids.has(p.id)) || plans.find((p: any) => p.status === "transition" && ids.has(p.id));
    };
    const outcomeRows: FSchedule[] = [];
    for (const op of ops) {
      const row = applied.incoming.get(op.id);
      if (!row) continue;
      let canonical: any = {};
      if (deps.canonicalizeLocation) {
        const located = await deps.canonicalizeLocation({ ...row }, Number(row.AdCollegeId), Number(row.AdSectionId));
        if (!located.ok) return void refuse(409, "location-invalid", located.message || "المكان لم يعد صالحاً.");
        canonical = located.canonical || {};
      }
      const place = {
        AdRoomCode: String(canonical.AdRoomCode ?? row.AdRoomCode ?? ""), AdRoomHall: String(canonical.AdRoomHall ?? row.AdRoomHall ?? ""),
        buildingId: canonical.buildingId ?? row.buildingId, roomId: canonical.roomId ?? row.roomId,
        locationStatus: canonical.locationStatus ?? row.locationStatus,
      };
      if (Number(row.id) < 0) {
        const plan = await planFor(Number(row.AdSectionId), Number(row.AdCourseId));
        creates.push({
          AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: proposal.AdTermId, AdCourseId: row.AdCourseId,
          AdCourseName: row.AdCourseName, CourseCodeSnapshot: row.CourseCodeSnapshot, CourseNameSnapshot: row.CourseNameSnapshot,
          CurriculumPlanIdSnapshot: plan?.id, SCode: row.SCode, AdInstructorId: proposal.AdInstructorId,
          fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday, fwednesday: !!row.fwednesday, fthursday: !!row.fthursday,
          fstarttime: normalizeClock(row.fstarttime), fendtime: normalizeClock(row.fendtime), ...place,
          sourceOrder: Math.max(1_000_000, Date.now()), fdetail: legacyDetailOf(daysOf(row as any)),
        } as Omit<FSchedule, "id">);
        createOpIds.push(op.id);
      } else {
        const live = liveById.get(Number(row.id))!;
        updates.push({
          id: Number(row.id), expectedRev: Number(live.rev || 0),
          fields: {
            AdInstructorId: proposal.AdInstructorId, fsunday: !!row.fsunday, fmonday: !!row.fmonday, ftuesday: !!row.ftuesday,
            fwednesday: !!row.fwednesday, fthursday: !!row.fthursday, fstarttime: normalizeClock(row.fstarttime),
            fendtime: normalizeClock(row.fendtime), fdetail: legacyDetailOf(daysOf(row as any)), ...place,
          },
        });
        entry(op.id).updated.push(Number(row.id));
      }
    }
    for (const out of applied.outgoing) {
      const live = liveById.get(out.rowId)!;
      if (out.action === "delete") { deletes.push({ id: out.rowId, expectedRev: Number(live.rev || 0) }); entry(out.opId).deleted.push(out.rowId); }
      else { updates.push({ id: out.rowId, expectedRev: Number(live.rev || 0), fields: { AdInstructorId: placeholderId! } }); entry(out.opId).updated.push(out.rowId); }
    }
    void outcomeRows;

    const touchedScopes = [...scopes.values()];
    const versions = await Promise.all(touchedScopes.map(scope =>
      deps.captureScopeVersion(req, scope.c, scope.s, proposal.AdTermId, "قبل تثبيت مقترح دراسي", "manual")));
    const by = String(req.user?.Name || req.user?.SystemUserLogin || "");
    try {
      const result = await Repository.commitStudyProposal({
        proposalId: proposal.id, expectedRev, creates, updates, deletes,
        build: created => {
          createOpIds.forEach((opId, index) => entry(opId).created.push(created[index].id));
          const at = new Date().toISOString();
          return {
            ...proposal, status: "committed",
            events: pushEvent(proposal, { kind: "committed", at, by, version: proposal.sentVersion }),
            commit: {
              at, by: Number(req.user?.SystemUserId || 0), byName: by, version: proposal.sentVersion,
              results: proposal.ops.map(op => {
                const e = perOp.get(op.id);
                return ready.opIds.includes(op.id)
                  ? { opId: op.id, state: "applied" as const, createdRowIds: e?.created, updatedRowIds: e?.updated, deletedRowIds: e?.deleted }
                  : { opId: op.id, state: "skipped" as const };
              }),
            },
          } as StudyProposal;
        },
      });
      const touchedIds = new Set([...result.updated.map(r => r.id), ...deletes.map(d => d.id)]);
      for (let i = 0; i < touchedScopes.length; i += 1) {
        const scope = touchedScopes[i];
        const inScope = (row: any) => Number(row.AdCollegeId) === scope.c && Number(row.AdSectionId) === scope.s;
        await deps.recordVersionAfter(versions[i], (before: any[]) => {
          const updatedById = new Map(result.updated.map(r => [r.id, r]));
          const deletedIds = new Set(deletes.map(d => d.id));
          return before.filter(r => !deletedIds.has(r.id)).map(r => updatedById.get(r.id) || r)
            .concat(result.created.filter(inScope));
        });
        for (const row of result.created.filter(inScope)) await deps.noteScheduleMutation(req, scope.c, scope.s, proposal.AdTermId, { kind: "add", row });
        for (const row of result.updated.filter(inScope)) await deps.noteScheduleMutation(req, scope.c, scope.s, proposal.AdTermId, { kind: "edit", row });
        const gone = deletes.map(d => liveById.get(d.id)).filter(row => row && inScope(row));
        for (const row of gone) await deps.noteScheduleMutation(req, scope.c, scope.s, proposal.AdTermId, { kind: "delete", row });
      }
      void touchedIds;
      await noteOnRequest(proposal.requestId, "study-proposal-committed", by, proposal.id);
      deps.broadcastNotify(deps.demoSessionId());
      res.json({ ...staffView(result.proposal, termClosedOf(world)), committed: true });
    } catch (error) {
      if (error instanceof StudyProposalAlreadyCommitted) { res.json({ ...staffView(error.current), alreadyCommitted: true }); return; }
      if (error instanceof StudyProposalRevisionConflict) { res.status(409).json(conflictBody(error.current)); return; }
      if (error instanceof ScheduleRevisionConflict) { refuse(409, "proposal-stale", "تغيّر أحد المواعيد أثناء التثبيت؛ لم يُكتب شيء. راجع المقترح."); return; }
      throw error;
    }
  });

  /* ════════════════ الأستاذ (الرابط الشخصي) ════════════════ */

  const openDeps: EngineDeps = { ...deps, canSee: () => true, canWrite: () => false };

  /** ما يراه الأستاذ عن مقترحه: النسخة المرسلة الأخيرة، وجدوله قبل وبعد. */
  async function publicView(proposal: StudyProposal, world: LoadedWorld, full: boolean) {
    const sent = proposal.versions.find(v => v.version === proposal.sentVersion);
    const status = effectiveStatus(proposal);
    const termClosed = termClosedOf(world);
    const decision = decisionStateOf(proposal);
    const base = {
      id: proposal.id, title: sent?.title || proposal.title, status, statusLabel: STATUS_LABEL[status],
      version: proposal.sentVersion, workingVersion: proposal.version, message: sent?.message || "",
      responseMode: sent?.responseMode || proposal.responseMode, expiresAt: proposal.expiresAt, sentAt: sent?.sentAt,
      sentByName: sent?.sentByName, gate: responseGate(proposal, Date.now(), termClosed), decision,
      committedAt: proposal.commit?.at,
      history: proposal.versions.map(v => ({ version: v.version, sentAt: v.sentAt, message: v.message })),
      responses: proposal.responses.filter(r => r.by === "instructor").map(r => ({
        version: r.version, at: r.at, decisions: r.decisions, reason: r.reason, note: r.note, suggestedStart: r.suggestedStart,
        suggestedDays: r.suggestedDays, verifyCode: r.verifyCode,
      })),
    };
    if (!full || !sent) return base;
    const ops = sent.ops;
    const rowsOf = (rows: FSchedule[]) => rows.filter(r => Number(r.AdInstructorId) === proposal.AdInstructorId);
    const before = rowsOf(world.termRows);
    const placeholderId = [...world.placeholders].sort((a, b) => a - b)[0] || null;
    const applied = applyProposalOps(world.termRows, ops, {
      instructorId: proposal.AdInstructorId, termId: proposal.AdTermId, placeholderId,
      onlyOpIds: proposal.commit ? undefined : undefined,
    });
    const incomingRowIds = new Map<number, string>();
    for (const [opId, row] of applied.incoming) incomingRowIds.set(Number(row.id), opId);
    const afterRows = rowsOf(applied.rows);
    const beforeItems = before.map(row => gridItem(row, world, openDeps, null, { state: "current", key: keyOfRow(Number(row.id)) }));
    const opById = new Map(ops.map(op => [op.id, op]));
    const afterItems: GridItem[] = [];
    const ghosts: GridItem[] = [];
    for (const row of afterRows) {
      const opId = incomingRowIds.get(Number(row.id));
      const op = opId ? opById.get(opId) : undefined;
      if (!op) afterItems.push(gridItem(row, world, openDeps, null, { state: "current", key: keyOfRow(Number(row.id)) }));
      else if (op.kind === "edit") {
        afterItems.push(gridItem(row, world, openDeps, null, { state: "modified", key: keyOfRow(Number(row.id)), opId }));
        const old = world.termRows.find(r => Number(r.id) === Number(op.source!.id));
        if (old) ghosts.push(gridItem(old, world, openDeps, null, { state: "out", key: `old:${op.source!.id}`, opId }));
      } else afterItems.push(gridItem(row, world, openDeps, null, { state: "proposed", key: Number(row.id) < 0 ? keyOfNew(opId!) : keyOfRow(Number(row.id)), opId }));
    }
    for (const out of applied.outgoing) ghosts.push(gridItem(out.before, world, openDeps, null, { state: "out", key: `old:${out.rowId}`, opId: out.opId, outAction: out.action }));
    const drift = !proposal.commit && proposalDrift(ops, world.termRows, world.placeholders, { instructorId: proposal.AdInstructorId }).length > 0;
    return {
      ...base,
      stale: drift,
      ops: ops.map(op => ({
        id: op.id, kind: op.kind, summary: opSummary(op), incoming: op.incoming, target: {
          courseName: op.target.courseName, courseCode: op.target.courseCode, SCode: op.target.SCode, days: op.target.days,
          start: op.target.fstarttime, end: op.target.fendtime, ...(() => { const p = gridItem({ ...(applied.incoming.get(op.id) || ({} as any)), AdRoomCode: op.target.AdRoomCode, AdRoomHall: op.target.AdRoomHall, locationStatus: op.target.locationStatus, roomId: op.target.roomId, AdCollegeId: op.target.AdCollegeId, AdSectionId: op.target.AdSectionId, AdCourseId: op.target.AdCourseId } as any, world, openDeps, null, { state: "current", key: "x" }); return { place: p.place, placeKnown: p.placeKnown, collegeName: p.collegeName, sectionName: p.sectionName }; })(),
        },
        before: op.source && op.kind !== "assign" ? { days: op.source.days, start: op.source.fstarttime, end: op.source.fendtime, place: [op.source.AdRoomCode, op.source.AdRoomHall].filter(Boolean).join(" · ") } : undefined,
        adjusted: op.kind === "assign" && Boolean(op.source) && (
          op.source!.fstarttime !== op.target.fstarttime || op.source!.fendtime !== op.target.fendtime ||
          op.source!.days.join() !== daysOf(op.target).join() || (op.source!.AdRoomHall || "") !== (op.target.AdRoomHall || "")),
        out: op.out ? { courseName: op.out.snapshot.courseName, courseCode: op.out.snapshot.courseCode, SCode: op.out.snapshot.SCode, days: op.out.snapshot.days, start: op.out.snapshot.fstarttime, end: op.out.snapshot.fendtime, action: op.out.action } : undefined,
        result: proposal.commit?.results.find(r => r.opId === op.id)?.state,
      })),
      schedule: {
        before: { items: beforeItems, metrics: proposalMetrics(before, world.catalog.courseById) },
        after: { items: afterItems, ghosts, metrics: proposalMetrics(afterRows, world.catalog.courseById) },
        loadCap: sent.impact?.loadCap ?? (Number((world.instructor as any)?.AdInstructorLoad || 0) || null),
      },
    };
  }

  async function resolvePublic(req: Request, res: Response) {
    const resolved = await deps.resolveRequestLink(String(req.params.token || ""));
    if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return null; }
    return resolved;
  }

  app.get("/api/public/request/:token/proposals", publicLimit, async (req: Request, res: Response) => {
    const resolved = await resolvePublic(req, res);
    if (!resolved) return;
    const all = (await Repository.getStudyProposalsByRequest(resolved.request.id)).filter(p => p.sentVersion > 0);
    const settled = await Promise.all(all.map(settleExpiry));
    const world = await loadWorld(Number(resolved.request.AdTermId), Number(resolved.request.AdInstructorId));
    const list = await Promise.all(settled.map(p => publicView(p, world, false)));
    res.setHeader("Cache-Control", "no-store");
    res.json({ proposals: list, termName: String(world.term?.AdTermName || ""), instructorName: String(world.instructor?.AdInstructorName || "") });
  });

  app.get("/api/public/request/:token/proposals/:pid", publicLimit, async (req: Request, res: Response) => {
    const resolved = await resolvePublic(req, res);
    if (!resolved) return;
    const proposal = await Repository.getStudyProposal(String(req.params.pid || ""));
    /* مقترحُ أستاذٍ آخر وغيرُ الموجود جوابٌ واحد. */
    if (!proposal || proposal.requestId !== resolved.request.id || proposal.sentVersion === 0) { res.status(404).json({ error: "لا يوجد مقترحٌ بهذا المعرّف." }); return; }
    const settled = await settleExpiry(proposal);
    const world = await loadWorld(Number(resolved.request.AdTermId), Number(resolved.request.AdInstructorId));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      proposal: await publicView(settled, world, true),
      termName: String(world.term?.AdTermName || ""), instructorName: String(world.instructor?.AdInstructorName || ""),
    });
  });

  /** ردُّ الأستاذ: موافقةٌ أو طلبُ تعديل، موقّعاً بالرقم المدني، على النسخة الحالية وحدها. */
  app.post("/api/public/request/:token/proposals/:pid/respond", publicLimit, async (req: Request, res: Response) => {
    const resolved = await resolvePublic(req, res);
    if (!resolved) return;
    const first = await Repository.getStudyProposal(String(req.params.pid || ""));
    if (!first || first.requestId !== resolved.request.id || first.sentVersion === 0) { res.status(404).json({ error: "لا يوجد مقترحٌ بهذا المعرّف." }); return; }
    const world = await loadWorld(Number(resolved.request.AdTermId), Number(resolved.request.AdInstructorId));

    const civil = await deps.verifyRequestSigner(resolved.request, req, res);
    if (!civil) return;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const proposal = await Repository.getStudyProposal(first.id);
      if (!proposal) { res.status(404).json({ error: "لا يوجد مقترحٌ بهذا المعرّف." }); return; }
      const gate = responseGate(proposal, Date.now(), termClosedOf(world));
      /* الردُّ على نسخةٍ قديمة لا يُقبل ولا يُنسب إلى الأحدث. */
      if (Number(req.body?.version) !== proposal.sentVersion) {
        res.status(409).json({ error: "وصلتك نسخةٌ أحدث من هذا المقترح. أعد فتحه لتراجع الجديد.", code: "stale-version", currentVersion: proposal.sentVersion }); return;
      }
      if (!gate.open) { res.status(409).json({ error: gate.reason, code: "closed" }); return; }
      const sent = proposal.versions.find(v => v.version === proposal.sentVersion);
      if (!sent) { res.status(409).json({ error: "المقترح غير مرسل.", code: "closed" }); return; }
      const opIds = sent.ops.map(op => op.id);
      let decisions: Array<{ opId: string; decision: "approve" | "changes" }> = [];
      if (sent.responseMode === "linked") {
        const one = req.body?.decision === "approve" ? "approve" : req.body?.decision === "changes" ? "changes" : null;
        if (!one) { res.status(400).json({ error: "اختر الموافقة أو طلب التعديل." }); return; }
        decisions = opIds.map(opId => ({ opId, decision: one }));
      } else {
        const raw = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
        const seen = new Set<string>();
        for (const item of raw) {
          if (!opIds.includes(String(item?.opId)) || seen.has(String(item.opId))) continue;
          if (item?.decision !== "approve" && item?.decision !== "changes") continue;
          seen.add(String(item.opId));
          decisions.push({ opId: String(item.opId), decision: item.decision });
        }
        if (!decisions.length) { res.status(400).json({ error: "اختر ردّك على مادةٍ واحدةٍ على الأقل." }); return; }
      }
      const wantsChange = decisions.some(d => d.decision === "changes");
      const note = text(req.body?.note, PROPOSAL_NOTE_LIMIT);
      const reason = CHANGE_REASONS.has(String(req.body?.reason)) ? (String(req.body.reason) as StudyProposalResponse["reason"]) : undefined;
      if (wantsChange && !reason && !note) { res.status(400).json({ error: "اختر سبباً مختصراً أو اكتب ملاحظةً عمّا تحتاج تعديله." }); return; }
      let suggestedStart = normalizeClock(req.body?.suggestedStart);
      if (suggestedStart && !withinScheduleDay(timeToMinutes(suggestedStart), timeToMinutes(suggestedStart) + 50)) suggestedStart = "";
      const suggestedDays = cleanDays(req.body?.suggestedDays);

      /* ضغطةٌ مكرّرة بالرد نفسه لا تُسجَّل مرتين. */
      const last = [...proposal.responses].reverse().find(r => r.by === "instructor" && r.version === proposal.sentVersion);
      const same = last && JSON.stringify(last.decisions) === JSON.stringify(decisions) && (last.note || "") === note && (last.reason || "") === (reason || "");
      if (same) { res.json({ ok: true, duplicate: true, proposal: await publicView(proposal, world, true) }); return; }

      const at = new Date().toISOString();
      const response: StudyProposalResponse = {
        id: randomUUID(), version: proposal.sentVersion, at, by: "instructor",
        verifyCode: deps.verificationCode(proposal.id, proposal.AdInstructorId, at), fingerprint: await deps.surveyFingerprint(civil),
        decisions, reason: wantsChange ? reason : undefined, note: note || undefined,
        suggestedStart: wantsChange && suggestedStart ? suggestedStart : undefined,
        suggestedDays: wantsChange && suggestedDays.length ? suggestedDays : undefined,
      };
      const drafted: StudyProposal = { ...proposal, responses: [...proposal.responses, response].slice(-200) };
      const outcome = decisionStateOf(drafted).outcome;
      const nextStatus = outcome === "approved" ? "approved" : outcome === "partial" ? "partial" : outcome === "changes" ? "changes" : "sent";
      const kind = outcome === "approved" ? "approved" : outcome === "partial" ? "partial" : "changes";
      try {
        const saved = await Repository.saveStudyProposal({
          ...drafted, status: nextStatus,
          events: pushEvent(proposal, { kind, by: "الأستاذ", version: proposal.sentVersion }),
        }, proposal.rev);
        await noteOnRequest(proposal.requestId, outcome === "approved" ? "study-proposal-approved" : "study-proposal-changes", undefined, `${saved.id}|${saved.sentVersion}`);
        deps.broadcastNotify(deps.demoSessionId());
        res.json({ ok: true, proposal: await publicView(saved, world, true) });
        return;
      } catch (error) {
        if (error instanceof StudyProposalRevisionConflict) continue;
        throw error;
      }
    }
    res.status(409).json({ error: "تعذّر تسجيل ردّك الآن لأن المقترح يتغيّر. أعد المحاولة.", code: "busy" });
  });
}

export const __testing = { sanitizeOps, nextSectionCodeFrom };
