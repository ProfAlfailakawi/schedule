/**
 * ── رادارُ التسجيل: مسارات العاملين ─────────────────────────────────────────
 *
 * التشغيلُ لإدارة النظام (يحسب لكل الطلبة معاً)، والقراءةُ لكل صاحب نطاقٍ بحدود
 * نطاقه: القسمُ يرى مقرراتِه، والعمادةُ والتسجيلُ يرون كلّ شيء. أعدادٌ لا أسماء —
 * الملفُّ لا يحمل اسماً أصلاً — وكلُّ رقمٍ يحمل أساسَه (كم ملفاً، كم منهم بلا رغبات،
 * كم صحيفةً بلا قواعد معتمدة).
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCourse, RegistrationOutcomeShard } from "../types";
import { createTtlMemo } from "./notificationCache";
import { AR, countOf } from "../utils/arabicCount";
import { pickDoorTerm, readStudentPhase } from "../utils/termStudentPhases";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { evaluateScheduleChange, loadSimulationInput, runRegistrationSimulation } from "./simulationData";
import { radarInsightFor } from "./radarInsight";
import { predictiveReadingFor } from "./predictiveInsight";
import { predictiveNarrow, predictiveSummaryOf } from "../utils/predictiveScope";
import { emptyCauseTotals } from "../utils/registrationCauses";

export interface SimulationDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  actorName: (req: any) => string;
  /* مفتاحُ الذاكرة يحمل عالَمه (real| أو demo:<الجلسة>|) — القاعدة في dataContextCache.ts؛ فلا يقرأ صندوقٌ تجريبي ذاكرةَ آخر. */
  dataContextKey?: (key: string | number) => string;
}

let running = false;
const outcomeMemo = createTtlMemo<RegistrationOutcomeShard[]>({ ttlMs: 30_000 });
/* قراءةُ كل الملفات ثقيلة: تُشارَك دقيقةً بين طلبات «ماذا لو؟» المتتابعة. */
const inputMemo = createTtlMemo<Awaited<ReturnType<typeof loadSimulationInput>>>({ ttlMs: 60_000 });

export function registerSimulationRoutes(app: Express, deps: SimulationDeps): void {
  const ctxKey = (key: string | number): string => (deps.dataContextKey ? deps.dataContextKey(key) : String(key));
  const fail = (res: Response, status: number, error: string, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });

  app.get("/api/simulation/summary", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ term: null, run: null, canRun: deps.isPowerUser(req) }); return; }
    const run = await Repository.getRegistrationRun(Number(term.AdTermId));
    if (run?.stale) kickRadarRefresh();
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const power = deps.isPowerUser(req);
    const inScope = (rows: NonNullable<typeof run>["courses"] | undefined) => (rows || [])
      .filter(row => power || deps.isScopeAllowed(req, row.collegeId, row.sectionId))
      .map(row => {
        const course = catalog.get(row.courseId);
        return { ...row, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${row.courseId}`) };
      });
    const visible = power ? null : (run?.scopes || []).filter(scope => deps.isScopeAllowed(req, scope.collegeId, scope.sectionId));
    const bands = () => ({ canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 });
    const scoped = { students: 0, population: 0, withoutRules: 0, defaulted: 0, windows: Array.from({ length: run?.rounds || 1 }, () => 0), capacity: bands(), projected: { students: 0, capacity: bands() }, dataQuality: { total: 0, ready: 0, excluded: 0, issues: {} as Record<string, number> } };
    for (const scope of visible || []) {
      for (const key of ["students", "population", "withoutRules", "defaulted"] as const) scoped[key] += scope[key];
      scope.windows.forEach((count, index) => { scoped.windows[index] = (scoped.windows[index] || 0) + count; });
      for (const key of Object.keys(scoped.capacity) as Array<keyof typeof scoped.capacity>) {
        scoped.capacity[key] += scope.capacity[key]; scoped.projected.capacity[key] += scope.projected.capacity[key];
      }
      scoped.projected.students += scope.projected.students;
      for (const key of ["total", "ready", "excluded"] as const) scoped.dataQuality[key] += scope.dataQuality[key];
      for (const [key, count] of Object.entries(scope.dataQuality.issues)) scoped.dataQuality.issues[key] = (scoped.dataQuality.issues[key] || 0) + count;
    }
    res.json({
      term: { id: Number(term.AdTermId), name: String(term.AdTermName || "") },
      canRun: power,
      auto: radarAutoSettings(),
      phase: (() => { const reading = readStudentPhase(term.AdTermStudentPhases); return { mode: reading.mode, label: reading.label, line: reading.line, namesVisible: reading.namesVisible }; })(),
      run: run ? {
        ranAt: run.ranAt, ranBy: run.ranBy, students: power ? run.students : scoped.students, withoutRules: power ? run.withoutRules : scoped.withoutRules, defaulted: power ? run.defaulted : scoped.defaulted,
        population: power ? (run.population ?? run.students + run.defaulted) : scoped.population,
        capacity: power ? (run.capacity || null) : (run.scopes ? scoped.capacity : null),
        projected: power ? (run.projected ? { students: run.projected.students, capacity: run.projected.capacity } : null) : (run.scopes ? scoped.projected : null),
        dataQuality: power ? (run.dataQuality || null) : (run.scopes ? scoped.dataQuality : null),
        stale: Boolean(run.stale || (!power && !run.scopes)), staleAt: run.staleAt || null,
        sourceFingerprint: run.sourceFingerprint || null,
        rounds: run.rounds, windows: power ? run.windows : scoped.windows, scoped: !power,
      } : null,
      courses: inScope(run?.courses),
      projectedCourses: inScope(run?.projected?.courses),
    });
  });

  /* ── ماذا لو؟ أثرُ اقتراحٍ على الطلبة قبل اعتماده. لا يكتب شيئاً؛ أعدادٌ لا أسماء. ── */
  app.post("/api/schedules/what-if", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    const termId = Number(req.body?.termId);
    if (!term || Number(term.AdTermId) !== termId) { fail(res, 409, "الأثرُ يُقاس على فصل الرادار فقط.", "other-term"); return; }
    const power = deps.isPowerUser(req);
    const kind = String(req.body?.kind || "");
    try {
      /* المفتاحُ يحمل وسمَ «قديم» الذي ترفعه كلُّ كتابةٍ في الجدول أو الصحائف أو الرغبات: فلا يُقاس الأثرُ على حالٍ مضت. */
      const run = await Repository.getRegistrationRun(termId);
      const loaded = await inputMemo.get(ctxKey(`${termId}:${run?.staleAt || ""}:${run?.ranAt || ""}`), () => loadSimulationInput(term, Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2)));
      const rows = loaded.schedules as import("../types").FSchedule[];
      const dayFlags = (day: string) => ({ fsunday: day === "fsunday", fmonday: day === "fmonday", ftuesday: day === "ftuesday", fwednesday: day === "fwednesday", fthursday: day === "fthursday" });
      let revised: import("../types").FSchedule[];
      let changes = 0;
      let scopes: Array<{ collegeId: number; sectionId: number }> = [];
      if (kind === "move" || kind === "swap") {
        const moves = (Array.isArray(req.body?.moves) ? req.body.moves : []).slice(0, 2) as Array<{ rowId: number; to: { day: string; start: string; end: string } }>;
        if (!moves.length || (kind === "swap" && moves.length !== 2)) { fail(res, 400, "حدّد الموعد المقترح."); return; }
        const byId = new Map(moves.map(move => [Number(move.rowId), move.to] as const));
        const found = rows.filter(row => byId.has(Number(row.id)));
        if (found.length !== byId.size) { fail(res, 409, "تغيّر الجدول: لم يعد أحد المواعيد موجوداً.", "stale"); return; }
        if (!power && found.some(row => !deps.isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId)))) { fail(res, 403, "خارج نطاق صلاحياتك.", "not-allowed"); return; }
        revised = rows.map(row => { const to = byId.get(Number(row.id)); return to ? { ...row, ...dayFlags(to.day), fstarttime: to.start, fendtime: to.end } : row; });
        changes = found.length;
        scopes = [...new Map(found.map(row => [`${row.AdCollegeId}:${row.AdSectionId}`, { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId) }] as const)).values()];
      } else if (kind === "opening" || kind === "openings") {
        /* «openings»: دفعةٌ من الشعب معاً (تنزيل الشعب)؛ الأثر يُقاس على الجدول بعد إضافتها كلها لا واحدةً واحدة. */
        const list: Array<{ collegeId: number; sectionId: number; courseId: number; slot: any }> = kind === "opening"
          ? [{ collegeId: Number(req.body?.collegeId), sectionId: Number(req.body?.sectionId), courseId: Number(req.body?.courseId), slot: req.body?.placement || {} }]
          : (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 60).map((item: any) => ({ collegeId: Number(item?.collegeId), sectionId: Number(item?.sectionId), courseId: Number(item?.courseId), slot: item?.placement || {} }));
        if (!list.length) { fail(res, 400, "حدّد المقرر والموعد."); return; }
        const added: import("../types").FSchedule[] = [];
        let nextId = Math.max(0, ...rows.map(row => Number(row.id) || 0)) + 1;
        for (const item of list) {
          if (!power && !deps.isScopeAllowed(req, item.collegeId, item.sectionId)) { fail(res, 403, "خارج نطاق صلاحياتك.", "not-allowed"); return; }
          const course = loaded.courses.get(item.courseId);
          if (!course || !item.slot.day || !item.slot.start || !item.slot.end) { fail(res, 400, "حدّد المقرر والموعد."); return; }
          added.push({ id: nextId++, AdCollegeId: item.collegeId, AdSectionId: item.sectionId, AdTermId: termId, AdCourseId: item.courseId, AdCourseName: course.CourseName,
            SCode: String(item.slot.sectionCode || "NEW"), AdInstructorId: Number(item.slot.instructorId) || 0, ...dayFlags(String(item.slot.day)), fstarttime: String(item.slot.start), fendtime: String(item.slot.end),
            AdRoomCode: String(item.slot.roomCode || ""), AdRoomHall: String(item.slot.roomHall || ""), buildingId: item.slot.buildingId, roomId: item.slot.roomId, locationStatus: "VERIFIED" } as unknown as import("../types").FSchedule);
        }
        revised = [...rows, ...added];
        changes = added.length;
        scopes = [...new Map(list.map(item => [`${item.collegeId}:${item.sectionId}`, { collegeId: item.collegeId, sectionId: item.sectionId }] as const)).values()];
      } else { fail(res, 400, "نوع الاقتراح غير معروف."); return; }
      const impact = evaluateScheduleChange(loaded.input, rows, loaded.courses, termId, revised, changes, scopes, power);
      res.json({ ok: true, impact, basis: "من أجابوا من هذا القسم عن رغباتهم في هذا الفصل", stale: Boolean(run?.stale) });
    } catch (error) {
      console.error("[simulation] what-if:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر قياس الأثر الآن. يمكنك الاعتماد دونه أو إعادة المحاولة.");
    }
  });

  /* ── لماذا لم يبلغوا 12؟ وأيّ شعبةٍ بيانُها ناقص؟ ── يُحسب عند الطلب، بحدود النطاق. */
  app.get("/api/simulation/insight", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) { res.json({ ready: false }); return; }
    const run = await Repository.getRegistrationRun(Number(term.AdTermId));
    if (!run) { res.json({ ready: false }); return; }
    try {
      const insight = await radarInsightFor(term, run.rounds || 2);
      const power = deps.isPowerUser(req);
      const mine = (collegeId: number, sectionId: number) => power || deps.isScopeAllowed(req, collegeId, sectionId);
      const causes = emptyCauseTotals();
      let short = 0, students = 0;
      for (const scope of insight.scopes) if (mine(scope.collegeId, scope.sectionId)) {
        short += scope.short; students += scope.students;
        for (const key of Object.keys(causes) as Array<keyof typeof causes>) causes[key] += scope.causes[key];
      }
      const scopedQuality = insight.quality.filter(item => mine(item.collegeId, item.sectionId));
      const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
      res.json({
        ready: true, computedAt: insight.computedAt, stale: Boolean(run.stale) || (run.sourceFingerprint || "") !== insight.fingerprint,
        students, short, causes, scoped: !power,
        quality: scopedQuality.slice(0, 300).map(item => ({ ...item, courseName: String(catalog.get(item.courseId)?.CourseName || ""), courseCode: String(catalog.get(item.courseId)?.CourseCode || "") })),
        qualityTruncated: scopedQuality.length > 300 || insight.qualityTruncated,
      });
    } catch (error) {
      console.error("[simulation] insight:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر حساب أسباب النقص الآن. أعد المحاولة بعد قليل.");
    }
  });

  /* ── الذكاء التنبّؤي: ماذا يحتاج الفصلُ القادم؟ ── قراءةٌ فقط، بحدود نطاق القارئ، وكلُّ رقمٍ يحمل ثقتَه وعددَ فصوله. */
  const predictiveMemo = createTtlMemo<Awaited<ReturnType<typeof predictiveReadingFor>>>({ ttlMs: 5 * 60_000 });
  /* قراءةٌ واحدة تخدم اللوحة والملخّص معاً: الذاكرة نفسها، ومفتاحُها يشمل العالمَ (ctxKey) وصاحبَ الطلب والنطاق. */
  const predictiveFor = async (req: Request) => {
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) return null;
    const termId = Number(term.AdTermId);
    const run = await Repository.getRegistrationRun(termId);
    const power = deps.isPowerUser(req);
    /* مفتاحُ «الكلية / القسم» في مركز القراءات: يضيّق النطاقَ ولا يوسّعه أبداً (يبقى شرطُ صلاحيات القارئ). */
    const narrow = predictiveNarrow(req.query, await Repository.getSections());
    const permitted = (collegeId: number, sectionId: number) => power || deps.isScopeAllowed(req, collegeId, sectionId);
    const allowed = (collegeId: number, sectionId: number) => permitted(collegeId, sectionId) && (!narrow || narrow.match(collegeId, sectionId));
    const loaded = await inputMemo.get(ctxKey(`${termId}:${run?.staleAt || ""}:${run?.ranAt || ""}`), () => loadSimulationInput(term, Math.max(1, term.AdTermStudentPhases?.rounds?.length || 2)));
    /* مفتاحُ الذاكرة يشمل صاحبَ الطلب: نطاقُه لا يُستنتج من شعب الفصل وحدها، فلا يشارك قارئٌ ذاكرةَ آخر. */
    const scopeKey = `${power ? "all" : `u${Number((req as any).user?.SystemUserId || 0)}`}:${narrow ? narrow.key : "-"}`;
    const reading = await predictiveMemo.get(ctxKey(`${termId}:${run?.ranAt || ""}:${run?.staleAt || ""}:${scopeKey}`), () => predictiveReadingFor({ term, run, loaded, allowed }));
    return { reading, scoped: !power };
  };
  app.get("/api/simulation/predictive", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const got = await predictiveFor(req);
      if (!got) { res.json({ ready: false }); return; }
      res.json({ ready: true, scoped: got.scoped, reading: got.reading });
    } catch (error) {
      console.error("[simulation] predictive:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر حساب التنبّؤات الآن. أعد المحاولة بعد قليل.");
    }
  });
  /* ملخّصٌ صغير لبطاقة مركز الذكاء: أعدادٌ فقط، من القراءة المخزَّنة نفسها (فتحُ اللوحة بعده فوريّ). */
  app.get("/api/simulation/predictive-summary", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const got = await predictiveFor(req);
      if (!got) { res.json({ ready: false }); return; }
      res.json({ ready: true, scoped: got.scoped, summary: predictiveSummaryOf(got.reading) });
    } catch (error) {
      console.error("[simulation] predictive-summary:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر حساب ملخّص التنبّؤ الآن.");
    }
  });

  /* ما قاله الطلبةُ بعد التسجيل («هل سجلت؟»): أعدادٌ لكل مقرر، بحدود النطاق. */
  app.get("/api/simulation/outcome", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ term: null, answered: 0, courses: [] }); return; }
    const termId = Number(term.AdTermId);
    const shards = await outcomeMemo.get(ctxKey(termId), () => Repository.getRegistrationOutcome(termId));
    const merged = new Map<number, { registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }>();
    let answered = 0;
    for (const shard of shards) {
      answered += Number(shard.students) || 0;
      for (const [id, row] of Object.entries(shard.byCourse || {})) {
        const sum = merged.get(Number(id)) || { registered: 0, stuck: 0, full: 0, prereq: 0, conflict: 0, other: 0 };
        for (const key of Object.keys(sum) as Array<keyof typeof sum>) sum[key] += Number(row[key]) || 0;
        merged.set(Number(id), sum);
      }
    }
    const power = deps.isPowerUser(req);
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const courses = [...merged].flatMap(([courseId, row]) => {
      const course = catalog.get(courseId);
      if (!course || (!power && !deps.isScopeAllowed(req, Number(course.AdCollegeId), Number(course.AdSectionId)))) return [];
      return [{ courseId, code: String(course.CourseCode || ""), name: String(course.CourseName || ""), ...row }];
    }).sort((a, b) => b.stuck - a.stuck || a.code.localeCompare(b.code, "en"));
    /* عددُ المجيبين الكلّيُّ لا يُقال لمن يرى مقرراتِه وحدها: طلبةٌ أجابوا عن أقسامٍ أخرى لا يصفون نتائجَه.
       يُقال له عددُ الأجوبة عن مقرراتِه (جوابٌ لكل مقرر). */
    const answers = courses.reduce((sum, c) => sum + c.registered + c.stuck, 0);
    res.json({ term: { id: termId, name: String(term.AdTermName || "") }, answered: power ? answered : null, answers, scoped: !power, courses });
  });

  app.post("/api/simulation/run", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isPowerUser(req)) { fail(res, 403, "تحديث الرادار لإدارة النظام.", "not-allowed"); return; }
    /* العلَمُ يُرفع قبل أيّ انتظار (تشغيلان في العملية نفسها)، ثم القفلُ في قاعدة البيانات
       (نسختان من الخادم). وكلاهما يُفكّ في finally. */
    if (running) { fail(res, 409, "الرادار يُحدَّث الآن. انتظر انتهاءه.", "busy"); return; }
    running = true;
    let lease: { termId: number; holder: string } | null = null;
    try {
      const terms = await Repository.getTerms();
      const term = pickDoorTerm(terms as any);
      if (!term) { fail(res, 409, "لا فصلَ جارياً أو قادماً يُبنى له الرادار.", "no-term"); return; }
      const holder = `${process.pid}-${Date.now()}`;
      if (!(await Repository.acquireRegistrationRunLease(Number(term.AdTermId), holder))) { fail(res, 409, "الرادار يُحدَّث الآن على خادمٍ آخر. انتظر انتهاءه.", "busy"); return; }
      lease = { termId: Number(term.AdTermId), holder };
      const run = await runRegistrationSimulation(term, deps.actorName(req));
      res.locals.auditChanges = `رادار تسجيل «${term.AdTermName || term.AdTermId}»: ${countOf(run.students, AR.profile)}`;
      res.json({ ok: true, students: run.students, ranAt: run.ranAt });
    } catch (error) {
      console.error("[simulation] run:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر تحديث الرادار. أعد المحاولة بعد قليل.");
    } finally {
      running = false;
      if (lease) await Repository.releaseRegistrationRunLease(lease.termId, lease.holder).catch(() => undefined);
    }
  });
}

/**
 * ما يخصّ الجرسَ من الرادار وأجوبة «هل سجلت؟»: عددٌ واحدٌ لكل منهما بحدود نطاق الحساب.
 * يقرأ الملخّصَ المحفوظ والعدّاداتِ المشاظِرة فقط — لا يحسب شيئاً ولا يقرأ ملفّات الطلبة.
 */
export async function radarNoticeFor(req: any, deps: Pick<SimulationDeps, "isScopeAllowed" | "isPowerUser" | "dataContextKey">): Promise<{ radar: { ranAt: string; needsDecision: number; scoped: boolean } | null; outcome: { answered: number; stuck: number; scoped: boolean } | null; termId: number; termName: string }> {
  const none = { radar: null, outcome: null, termId: 0, termName: "" };
  const term = pickDoorTerm((await Repository.getTerms()) as any);
  if (!term) return none;
  const termId = Number(term.AdTermId), power = deps.isPowerUser(req);
  const [run, shards] = await Promise.all([Repository.getRegistrationRun(termId), outcomeMemo.get(deps.dataContextKey ? deps.dataContextKey(termId) : String(termId), () => Repository.getRegistrationOutcome(termId))]);
  const mine = (collegeId: number, sectionId: number) => power || deps.isScopeAllowed(req, collegeId, sectionId);
  const radar = run ? {
    ranAt: run.ranAt, scoped: !power,
    needsDecision: run.courses.filter(row => mine(row.collegeId, row.sectionId) && (row.unmet.full > 0 || row.unmet["not-offered"] > 0)).length,
  } : null;
  let outcome: { answered: number; stuck: number; scoped: boolean } | null = null;
  const answered = shards.reduce((sum, shard) => sum + (Number(shard.students) || 0), 0);
  if (answered > 0) {
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    let stuck = 0, answers = 0;
    for (const shard of shards) for (const [id, row] of Object.entries(shard.byCourse || {})) {
      const course = catalog.get(Number(id));
      if (course && mine(Number(course.AdCollegeId), Number(course.AdSectionId))) { stuck += Number(row.stuck) || 0; answers += (Number(row.stuck) || 0) + (Number(row.registered) || 0); }
    }
    outcome = { answered: power ? answered : answers, stuck, scoped: !power };
  }
  return { radar, outcome, termId, termName: String(term.AdTermName || "") };
}

/* ── التشغيل التلقائي ──────────────────────────────────────────────────────────
 * لا يحتاج أحدٌ أن يضغط كلَّ مرة: يُحدَّث الرادارُ وحدَه مرةً كل ٢٤ ساعة (RADAR_AUTO_HOURS) ما دامت
 * رغباتُ الطلبة مفتوحةً أو بعدها (حتى إغلاق الطلبات)، ومرةً أخيرةً بعد إغلاق الرغبات مباشرةً كي
 * تُبنى التذاكرُ على الرغبات النهائية. والتحديثُ الآلي يقرأ ملفّاتِ
 * الطلبة كلَّها (قراءةً لكل ملف)، فلا يُجعل أقصرَ من ذلك بلا حاجة. RADAR_AUTO=false يُوقفه. */
export const RADAR_RUN_MODES = new Set(["wishes", "frozen", "report"]);

export function radarDue(input: {
  mode: string; wishesClose?: string; today: string; ranAt?: string; now: number; everyMs: number;
  /** الرادار عُلِّم قديماً بتعديلٍ في الجدول أو الصحائف: يُحدَّث بعد هدوءٍ قصير لا بعد ٢٤ ساعة. */
  stale?: boolean; staleAt?: string; quietMs?: number; minGapMs?: number;
}): boolean {
  if (!RADAR_RUN_MODES.has(input.mode)) return false;
  if (!input.ranAt) return true;
  const ranMs = Date.parse(input.ranAt);
  if (!Number.isFinite(ranMs)) return true;
  /* أُغلقت الرغباتُ بعد آخر تحديث: تحديثٌ أخيرٌ بالرغبات النهائية. */
  if (input.wishesClose && input.today > input.wishesClose && kuwaitDateISO(new Date(ranMs)) <= input.wishesClose) return true;
  /* قديمٌ بتعديل: بعد أن يهدأ التعديل (quiet) كي لا يُعاد الحساب مع كل صفٍّ في استيرادٍ كبير، وبفاصلٍ أدنى بين تشغيلين. */
  if (input.stale) {
    const staleMs = Date.parse(input.staleAt || "");
    const quiet = input.quietMs ?? 120_000, gap = input.minGapMs ?? 600_000;
    if (Number.isFinite(staleMs) ? input.now - staleMs >= quiet && input.now - ranMs >= gap : input.now - ranMs >= gap) return true;
  }
  return input.now - ranMs >= input.everyMs;
}

export function radarAutoSettings(): { enabled: boolean; everyHours: number } {
  const hours = Number(process.env.RADAR_AUTO_HOURS);
  return { enabled: String(process.env.RADAR_AUTO ?? "").trim().toLowerCase() !== "false", everyHours: Number.isFinite(hours) && hours >= 1 ? Math.floor(hours) : 24 };
}

/** فحصٌ واحد: هل الرادارُ مستحقُّ التحديث؟ فإن كان حدّثه بقفل قاعدة البيانات (خادمٌ واحدٌ فقط يعمل). */
export async function refreshRadarIfDue(log: (message: string) => void = console.log): Promise<boolean> {
  const { enabled, everyHours } = radarAutoSettings();
  if (!enabled || running || Repository.isDemoMode()) return false;
  running = true;
  let lease: { termId: number; holder: string } | null = null;
  try {
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) return false;
    const reading = readStudentPhase(term.AdTermStudentPhases);
    const run = await Repository.getRegistrationRun(Number(term.AdTermId));
    if (!radarDue({
      mode: reading.mode, wishesClose: term.AdTermStudentPhases?.wishesClose, today: kuwaitDateISO(), ranAt: run?.ranAt, now: Date.now(), everyMs: everyHours * 3_600_000,
      stale: Boolean(run?.stale), staleAt: run?.staleAt,
    })) return false;
    const holder = `auto-${process.pid}-${Date.now()}`;
    if (!(await Repository.acquireRegistrationRunLease(Number(term.AdTermId), holder))) return false; // خادمٌ آخر يعمل
    lease = { termId: Number(term.AdTermId), holder };
    const done = await runRegistrationSimulation(term, "تلقائي");
    log(`[radar] تحديثٌ تلقائي${run?.stale ? " بعد تعديل" : ""}: ${countOf(done.students, AR.profile)}`);
    return true;
  } catch (error) {
    console.error("[radar] auto:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    running = false;
    if (lease) await Repository.releaseRegistrationRunLease(lease.termId, lease.holder).catch(() => undefined);
  }
}

/** من يفتح الرادار وهو قديم يُوقظ التحديث ولا ينتظره (مرةً في الدقيقة على الأكثر): الخطّ الذي لا يعتمد على مؤقّتٍ قد لا يعمل بين الطلبات. */
let lastKickAt = 0;
export function kickRadarRefresh(log: (message: string) => void = console.log): void {
  const now = Date.now();
  if (now - lastKickAt < 60_000) return;
  lastKickAt = now;
  void refreshRadarIfDue(log);
}

export function scheduleRadarAutoRun(log: (message: string) => void = console.log): void {
  if (!radarAutoSettings().enabled) return;
  setTimeout(() => void refreshRadarIfDue(log), 2 * 60_000).unref();
  /* كل خمس دقائق فحصٌ رخيص (وثيقةٌ واحدة)؛ التشغيلُ الفعليّ لا يقع إلا حين يستحقّ. */
  setInterval(() => void refreshRadarIfDue(log), 5 * 60_000).unref();
}
