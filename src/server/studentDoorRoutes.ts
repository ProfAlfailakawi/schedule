/**
 * ── بابُ الطالب: رابطٌ واحدٌ للجامعة ────────────────────────────────────────
 *
 * كان لكل قسمٍ رابطُه، فيضيع الطالبُ بين الروابط، وكان ما يراه الطالبُ يتحدّد
 * بالرابط الذي وصله. هنا **الطالبُ هو المفتاح**: رقمُه المدني ورمزُه الشخصي،
 * وما يراه يتحدّد بحالته وبمرحلة الفصل (utils/termStudentPhases) لا بالرابط.
 *
 * ثوابتُ لا تُكسر:
 *   · لا اسمَ ولا رقمَ مدنيّاً في الملف الدائم — بصمةٌ وأرقامُ مقرّرات.
 *   · الرمزُ الشخصي مُلحَّم (scrypt)، وخطؤه يُعدّ على الملف نفسه ويقفل، لا على
 *     العنوان وحده (شبكةُ جامعةٍ واحدةٌ تخدم ألوفاً).
 *   · الجلسةُ كوكي موقَّع لا يحمل هويةً، وتغييرُ الرمز يُنهي كلَّ الجلسات.
 *   · قراءةُ ما يُطرح تأتي من فهرسٍ في الذاكرة يُجدَّد كل بضع دقائق، لا من
 *     قاعدة البيانات في كل زيارة: ٢٥ ألف طالبٍ لا يقرأون الجدولَ ٢٥ ألف مرة.
 *   · ما يراه الطالبُ من الجدول أعدادٌ لا مواعيد: المسودةُ للأقسام والعمادة.
 */
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { Repository } from "../db/repository";
import type { AdCourse, StudentProfile, StudentWishes } from "../types";
import { validateCivilId } from "../utils/civilId";
import { toEnglishDigits } from "../utils/digits";
import { byArabic } from "../utils/sorting";
import { AR, countOf } from "../utils/arabicCount";
import {
  AFTER_GRADUATION_DAYS, CODE_LENGTH, CODE_MAX_FAILURES, REMEMBER_DAYS, afterCodeFailure, codeProblem, expectedGraduation,
  lockState, planProgress, profileLifetime, resetLifetime, sanitizePassed, shouldTouch, unitsOf, RESET_COOLDOWN_DAYS,
} from "../utils/studentProfile";
import { ticketContext } from "./simulationData";
import { pickDoorTerm, readStudentPhase, studentTimeline } from "../utils/termStudentPhases";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { createAttemptLimiter } from "./publicAttemptLimiter";
import { createTtlMemo } from "./notificationCache";
import {
  clearDoorCookie, codeVersion, doorCookie, hashCode, readCookie, readDoorSession, signDoorSession, verifyCode, DOOR_COOKIE,
} from "./studentDoor";

export interface StudentDoorDeps {
  surveyFingerprint: (civil: string) => Promise<string>;
  identityKey: () => Promise<Buffer>;
  isProduction: () => boolean;
}

/** أقصى وحداتٍ يطلبها الطالبُ لفصله، وأدناها: الهدفُ ١٢–١٥ والسقفُ ١٨. */
export const WISH_UNITS_MIN = 12;
export const WISH_UNITS_MAX = 18;
const SESSION_HOURS = 12;

type Door = { fingerprint: string; profile: StudentProfile };

const intFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
};

/* ── ما يُقرأ مراراً: كتالوجُ القسم وفهرسُ المطروح ─────────────────────────── */

interface SectionCatalog {
  plans: Array<{ id: string; name: string; status: string }>;
  /** مقرراتُ كل صحيفة. */
  byPlan: Map<string, number[]>;
  /** بلا صحائف: كتالوجُ القسم الفعّال. */
  catalog: number[];
  courses: Map<number, { code: string; name: string; credit: number }>;
}

const catalogMemo = createTtlMemo<SectionCatalog>({ ttlMs: 10 * 60_000 });
const sectionsMemo = createTtlMemo<any>({ ttlMs: 10 * 60_000 });
const offeringMemo = createTtlMemo<Map<number, { sections: number }>>({ ttlMs: 5 * 60_000 });

async function sectionCatalog(sectionId: number): Promise<SectionCatalog> {
  return catalogMemo.get(String(sectionId), async () => {
    const [plans, links, operational, courses] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId),
      Repository.getOperationalCourseIds(sectionId), Repository.getCourses(),
    ]);
    const live = plans.filter(plan => plan.status !== "archived");
    const byPlan = new Map<string, number[]>();
    for (const plan of live) byPlan.set(plan.id, [...new Set(links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)))]);
    const known = new Map<number, { code: string; name: string; credit: number }>();
    for (const course of courses as AdCourse[]) {
      known.set(Number(course.AdCourseId), { code: String(course.CourseCode || ""), name: String(course.CourseName || ""), credit: Number(course.CourseCredit) || 0 });
    }
    const catalog = (courses as AdCourse[]).filter(course => Number(course.AdSectionId) === sectionId && operational.has(Number(course.AdCourseId))).map(course => Number(course.AdCourseId));
    return { plans: live.map(plan => ({ id: plan.id, name: plan.name, status: plan.status })), byPlan, catalog, courses: known };
  });
}

/** مقرراتُ صحيفةٍ بعينها، أو كتالوجُ القسم إن لم تكن له صحائف. */
function allowedFor(catalog: SectionCatalog, planId?: string): number[] {
  if (planId && catalog.byPlan.has(planId)) return catalog.byPlan.get(planId)!;
  return catalog.plans.length ? [] : catalog.catalog;
}

/** كم شعبةً تُطرح من كل مقرّر في فصل الباب (من المسودة أو المعتمد): أعدادٌ فقط. */
async function offeringIndex(termId: number): Promise<Map<number, { sections: number }>> {
  return offeringMemo.get(String(termId), async () => {
    const rows = await Repository.getSchedulesByScope({ termId });
    const seen = new Map<number, Set<string>>();
    for (const row of rows) {
      const course = Number(row.AdCourseId);
      if (!seen.has(course)) seen.set(course, new Set());
      seen.get(course)!.add(String(row.SCode || row.id));
    }
    return new Map([...seen].map(([course, codes]) => [course, { sections: codes.size }]));
  });
}

/** ما يعرفه الطالبُ عن ملفّه. لا رمزَ ولا تجزئة ولا بصمة. */
async function summaryOf(profile: StudentProfile) {
  const setupDone = profile.AdSectionId > 0;
  let progress = null as null | ReturnType<typeof planProgress>;
  let sectionName = "", planName = "";
  if (setupDone) {
    const [sections, catalog] = await Promise.all([Repository.getSections(), sectionCatalog(profile.AdSectionId)]);
    sectionName = String((sections as any[]).find(row => Number(row.AdSectionId) === profile.AdSectionId)?.AdSectionName || "");
    planName = catalog.plans.find(plan => plan.id === profile.curriculumPlanId)?.name || "";
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    progress = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit);
  }
  return {
    setupDone, sectionId: profile.AdSectionId, sectionName, planId: profile.curriculumPlanId || "", planName,
    passedCourseIds: profile.passedCourseIds, passedUnits: profile.passedUnits,
    progress, wishes: profile.wishes || null,
    createdAt: profile.createdAt, keepsUntil: profile.deleteAt, keepsReason: profile.deleteReason,
  };
}

export function registerStudentDoorRoutes(app: Express, deps: StudentDoorDeps): void {
  /* الهويةُ تُسأل كثيراً (كل طالبٍ مرة)، فيُعدّ كل سؤالٍ بحدٍّ سخيّ؛ أما الرمز فيُعدّ خطؤه وحده. */
  const identityLimiter = createAttemptLimiter({ maxFailures: intFromEnv("STUDENT_DOOR_IDENTITY_MAX", 240), windowMs: 10 * 60_000, capacity: 20_000 });
  const codeLimiter = createAttemptLimiter({ maxFailures: intFromEnv("STUDENT_DOOR_CODE_MAX_FAILURES", 40), windowMs: 10 * 60_000, capacity: 20_000 });
  const ip = (req: Request) => req.ip || "unknown";
  const secure = deps.isProduction();

  const writeLimit = rateLimit({
    windowMs: 60_000, limit: intFromEnv("STUDENT_DOOR_WRITES_PER_MINUTE", 60), standardHeaders: true, legacyHeaders: false,
    message: { error: "طلباتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
  });
  const noStore = (res: Response) => { res.setHeader("Cache-Control", "no-store"); };
  const fail = (res: Response, status: number, error: string, code?: string, extra: Record<string, unknown> = {}) => {
    noStore(res); res.status(status).json({ error, ...(code ? { code } : {}), ...extra });
  };
  const civilOf = (body: any): string | null => {
    const civil = toEnglishDigits(body?.civil).replace(/\D/g, "");
    return civil.length === 12 && validateCivilId(civil).isValid ? civil : null;
  };

  const issueSession = async (res: Response, profile: StudentProfile, remember: boolean) => {
    const maxAgeSeconds = remember ? REMEMBER_DAYS * 86_400 : SESSION_HOURS * 3600;
    const token = signDoorSession(await deps.identityKey(), {
      fingerprint: profile.fingerprint, exp: Date.now() + maxAgeSeconds * 1000, cv: codeVersion(profile.codeHash),
    });
    res.setHeader("Set-Cookie", doorCookie(token, { remember, maxAgeSeconds, secure }));
  };

  /** من هذا الزائر؟ كوكي موقَّع + ملفٌّ ما زال بالرمز نفسه. */
  const readDoor = async (req: Request): Promise<Door | null> => {
    const session = readDoorSession(await deps.identityKey(), readCookie(req.headers.cookie, DOOR_COOKIE), Date.now());
    if (!session) return null;
    let profile = await Repository.getStudentProfile(session.fingerprint);
    if (!profile || codeVersion(profile.codeHash) !== session.cv) return null;
    const now = Date.now();
    /* صاحبُ الجلسة حاضر: مرةً في اليوم يُكتب حضورُه، ويُلغى طلبُ الحذف إن كان. */
    if (shouldTouch(profile.lastSeenAt, now) || profile.resetRequestedAt) {
      profile = (await Repository.updateStudentProfile(session.fingerprint, current => {
        if (!current) return undefined;
        const lastSeenAt = new Date(now).toISOString();
        return { ...current, resetRequestedAt: undefined, lastSeenAt, ...profileLifetime({ ...current, lastSeenAt }, new Date(now)) };
      })) || profile;
    }
    return { fingerprint: session.fingerprint, profile };
  };
  const requireDoor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const door = await readDoor(req);
      if (!door) { fail(res, 401, "انتهت جلستك. أدخل رقمك المدني ورمزك من جديد.", "signed-out"); return; }
      (res.locals as any).door = door;
      next();
    } catch (error) { next(error); }
  };
  const doorOf = (res: Response): Door => (res.locals as any).door;

  /* ── الحالة: أيُّ مرحلة، وهل أنت داخل ───────────────────────────────────── */
  app.get("/api/public/me/state", async (req: Request, res: Response) => {
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    const today = kuwaitDateISO();
    const reading = readStudentPhase(term?.AdTermStudentPhases, today);
    const door = await readDoor(req).catch(() => null);
    res.json({
      term: term ? { id: Number(term.AdTermId), name: String(term.AdTermName || "") } : null,
      phase: {
        key: reading.key, mode: reading.mode, label: reading.label, line: reading.line,
        canEditWishes: reading.canEditWishes, canReport: reading.canReport, nextAt: reading.nextAt || "", nextLabel: reading.nextLabel || "",
        roundName: reading.round?.name || "",
      },
      timeline: studentTimeline(term?.AdTermStudentPhases, term?.AdTermSubmissionDeadline, today),
      signedIn: Boolean(door),
      profile: door ? await summaryOf(door.profile) : null,
      limits: { codeLength: CODE_LENGTH, wishUnitsMin: WISH_UNITS_MIN, wishUnitsMax: WISH_UNITS_MAX, afterGraduationDays: AFTER_GRADUATION_DAYS },
    });
  });

  /* ── الهوية: هل لهذا الرقم ملف؟ (نعم/لا فقط) ───────────────────────────── */
  app.post("/api/public/me/identity", async (req: Request, res: Response) => {
    if (identityLimiter.blocked(ip(req))) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    identityLimiter.fail(ip(req));
    const civil = civilOf(req.body);
    if (!civil) { fail(res, 400, "الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك.", "bad-civil"); return; }
    const profile = await Repository.getStudentProfile(await deps.surveyFingerprint(civil));
    noStore(res); res.json({ exists: Boolean(profile), resetPending: Boolean(profile?.resetRequestedAt), resetAt: profile?.resetRequestedAt ? profile.deleteAt : "" });
  });

  /* ── نسيتُ رمزي ──────────────────────────────────────────────────────────── */
  app.post("/api/public/me/reset", writeLimit, async (req: Request, res: Response) => {
    if (identityLimiter.blocked(ip(req))) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    identityLimiter.fail(ip(req));
    const civil = civilOf(req.body);
    if (!civil) { fail(res, 400, "الرقم المدني غير صحيح.", "bad-civil"); return; }
    const now = new Date();
    const saved = await Repository.updateStudentProfile(await deps.surveyFingerprint(civil), current => {
      if (!current) return undefined;
      return { ...current, resetRequestedAt: current.resetRequestedAt || now.toISOString(), ...resetLifetime(current, now) };
    });
    if (!saved) { fail(res, 404, "لا ملف لهذا الرقم المدني.", "no-profile"); return; }
    noStore(res); res.json({ ok: true, deleteAt: saved.deleteAt, days: RESET_COOLDOWN_DAYS });
  });

  /* ── الدخول والإنشاء ─────────────────────────────────────────────────────── */
  app.post("/api/public/me/enter", writeLimit, async (req: Request, res: Response) => {
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "أخطأت في الرمز مراتٍ كثيرة من هذا الاتصال. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    const done = () => attempt.release();
    try {
      const civil = civilOf(req.body);
      if (!civil) { fail(res, 400, "الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك.", "bad-civil"); return; }
      const code = toEnglishDigits(req.body?.code).replace(/\D/g, "");
      const remember = req.body?.remember === true;
      const fingerprint = await deps.surveyFingerprint(civil);
      const now = Date.now();

      if (req.body?.create === true) {
        if (req.body?.agree !== true) { fail(res, 400, "وافق على حفظ ملفك أولاً.", "no-consent"); return; }
        const problem = codeProblem(code);
        if (problem) { fail(res, 400, problem, "weak-code"); return; }
        const { hash, salt } = await hashCode(code);
        let existed = false;
        const iso = new Date(now).toISOString();
        const created = await Repository.updateStudentProfile(fingerprint, current => {
          if (current) { existed = true; return undefined; }
          const base = { createdAt: iso, lastSeenAt: iso };
          return {
            id: fingerprint, fingerprint, AdCollegeId: 0, AdSectionId: 0, passedCourseIds: [], passedUnits: 0,
            codeHash: hash, codeSalt: salt, updatedAt: iso, ...base, ...profileLifetime(base, new Date(now)),
          };
        });
        if (existed || !created) { fail(res, 409, "لهذا الرقم المدني ملفٌّ بالفعل — أدخل رمزك.", "exists"); return; }
        done();
        await issueSession(res, created, remember);
        noStore(res); res.status(201).json({ ok: true, profile: await summaryOf(created) });
        return;
      }

      const profile = await Repository.getStudentProfile(fingerprint);
      if (!profile) { fail(res, 404, "لا ملف لهذا الرقم المدني. أنشئ ملفك أولاً.", "no-profile"); return; }
      const lock = lockState(profile, now);
      if (lock.locked) {
        fail(res, 423, `أخطأت في الرمز مراتٍ كثيرة. جرّب بعد ${countOf(Math.ceil(lock.retryInMs / 60_000), AR.minute)}.`, "locked", { retryInSeconds: Math.ceil(lock.retryInMs / 1000) });
        return;
      }
      if (!(await verifyCode(code, profile.codeHash, profile.codeSalt))) {
        let left = CODE_MAX_FAILURES, locked = false;
        await Repository.updateStudentProfile(fingerprint, current => {
          if (!current) return undefined;
          /* قفلٌ نشأ بينما كان التحقّق جارياً (طلباتٌ متوازية): يبقى كما هو ولا يُستبدل بعدّادٍ جديد. */
          if (lockState(current, now).locked) { locked = true; left = 0; return current; }
          const failures = afterCodeFailure(current, now);
          locked = Boolean(failures.lockedUntil);
          left = locked ? 0 : CODE_MAX_FAILURES - failures.count;
          return { ...current, codeFailures: failures };
        });
        fail(res, 401, locked ? "أخطأت في الرمز مراتٍ كثيرة. جرّب بعد ١٥ دقيقة." : "الرمز غير صحيح.", locked ? "locked" : "bad-code", { attemptsLeft: left });
        return;
      }
      done();
      let lockedMeanwhile = false;
      const entered = (await Repository.updateStudentProfile(fingerprint, current => {
        if (!current) return undefined;
        /* رمزٌ صحيح وصل بعد أن قُفل الملفُّ بخطأٍ متوازٍ: القفلُ يسري ولا يُمحى. */
        if (lockState(current, now).locked) { lockedMeanwhile = true; return current; }
        const lastSeenAt = new Date(now).toISOString();
        return { ...current, codeFailures: undefined, resetRequestedAt: undefined, lastSeenAt, ...profileLifetime({ ...current, lastSeenAt }, new Date(now)) };
      })) || profile;
      if (lockedMeanwhile) {
        fail(res, 423, "أخطأت في الرمز مراتٍ كثيرة. جرّب بعد ١٥ دقيقة.", "locked");
        return;
      }
      await issueSession(res, entered, remember);
      noStore(res); res.json({ ok: true, profile: await summaryOf(entered) });
    } catch (error) {
      done();
      console.error("[student-door] enter:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر الدخول الآن. أعد المحاولة بعد قليل.");
    }
  });

  app.post("/api/public/me/exit", (_req: Request, res: Response) => {
    res.setHeader("Set-Cookie", clearDoorCookie(secure));
    noStore(res); res.json({ ok: true });
  });

  /* ── الأقسام (عامّة): قائمةُ اختيار القسم ───────────────────────────────── */
  app.get("/api/public/me/catalog", async (_req: Request, res: Response) => {
    const data = await sectionsMemo.get("all", async () => {
      const [colleges, sections] = await Promise.all([Repository.getColleges(), Repository.getSections()]);
      return (colleges as any[]).map(college => ({
        id: Number(college.AdCollegeId), name: String(college.AdCollegeName || ""),
        sections: (sections as any[]).filter(section => Number(section.AdCollegeId) === Number(college.AdCollegeId))
          .map(section => ({ id: Number(section.AdSectionId), name: String(section.AdSectionName || "") }))
          .sort((a, b) => byArabic(a.name, b.name)),
      })).filter(college => college.sections.length).sort((a, b) => byArabic(a.name, b.name));
    });
    res.setHeader("Cache-Control", "public, max-age=300"); res.json({ colleges: data });
  });

  /* ── صحيفةُ قسمٍ: الصحائف ومقرراتها ─────────────────────────────────────── */
  app.get("/api/public/me/plan", requireDoor, async (req: Request, res: Response) => {
    const sectionId = Number(req.query.sectionId || 0);
    const sections = await Repository.getSections();
    if (!sectionId || !(sections as any[]).some(row => Number(row.AdSectionId) === sectionId)) { fail(res, 400, "اختر قسماً صحيحاً.", "bad-section"); return; }
    const catalog = await sectionCatalog(sectionId);
    const toCourse = (id: number) => ({ id, ...(catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 }) });
    const lists = catalog.plans.length
      ? catalog.plans.map(plan => ({ ...plan, courses: (catalog.byPlan.get(plan.id) || []).map(toCourse).sort((a, b) => a.code.localeCompare(b.code, "en")) }))
      : [{ id: "", name: "مقررات القسم", status: "catalog", courses: catalog.catalog.map(toCourse).sort((a, b) => a.code.localeCompare(b.code, "en")) }];
    noStore(res); res.json({ source: catalog.plans.length ? "plan" : "catalog", plans: lists });
  });

  /* ── ملفي: القراءة والحفظ ────────────────────────────────────────────────── */
  app.get("/api/public/me/profile", requireDoor, async (_req: Request, res: Response) => {
    noStore(res); res.json(await summaryOf(doorOf(res).profile));
  });

  app.put("/api/public/me/profile", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const sectionId = Number(req.body?.sectionId || 0);
    const section = (await Repository.getSections() as any[]).find(row => Number(row.AdSectionId) === sectionId);
    if (!section) { fail(res, 400, "اختر قسمك العلمي.", "bad-section"); return; }
    const catalog = await sectionCatalog(sectionId);
    let planId = String(req.body?.curriculumPlanId || "");
    if (catalog.plans.length === 1) planId = catalog.plans[0].id;
    if (catalog.plans.length >= 2 && !catalog.plans.some(plan => plan.id === planId)) { fail(res, 400, "اختر صحيفتك: السابقة أم الجديدة.", "bad-plan"); return; }
    if (!catalog.plans.length) planId = "";
    const allowed = allowedFor(catalog, planId);
    const passed = sanitizePassed(req.body?.passedCourseIds, new Set(allowed));
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const progress = planProgress(allowed, passed, credit);
    const now = new Date();
    const saved = await Repository.updateStudentProfile(fingerprint, current => {
      if (!current) return undefined;
      const sameSection = current.AdSectionId === sectionId;
      const base = { ...current, AdCollegeId: Number(section.AdCollegeId), AdSectionId: sectionId, curriculumPlanId: planId || undefined,
        passedCourseIds: passed, passedUnits: unitsOf(passed, credit), updatedAt: now.toISOString(),
        expectedGraduationAt: expectedGraduation(progress.remainingUnits, now),
        /* الرغباتُ تُبقى ما دامت صالحةً للصحيفة الجديدة: القسمُ نفسُه والصحيفةُ نفسُها،
           وما أُنجز من مقرراتها المرغوبة يسقط منها. */
        wishes: sameSection && (current.curriculumPlanId || "") === planId && current.wishes
          ? { ...current.wishes, courseIds: current.wishes.courseIds.filter(id => allowed.includes(id) && !passed.includes(id)) }
          : undefined };
      return { ...base, ...profileLifetime(base, now) };
    });
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json(await summaryOf(saved));
  });

  /* ── الرغبات: ما أريده هذا الفصل (مرحلة الرغبات وحدها) ──────────────────── */
  app.put("/api/public/me/wishes", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    const reading = readStudentPhase(term?.AdTermStudentPhases);
    if (!term || !reading.canEditWishes) { fail(res, 409, "الرغبات غير مفتوحة الآن.", "wishes-closed", { line: reading.line }); return; }
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك أولاً: القسم والمقررات المنجزة.", "no-setup"); return; }
    const units = Math.round(Number(req.body?.targetUnits));
    if (!Number.isFinite(units) || units < WISH_UNITS_MIN || units > WISH_UNITS_MAX) { fail(res, 400, `الوحدات من ${WISH_UNITS_MIN} إلى ${WISH_UNITS_MAX}.`, "bad-units"); return; }
    const catalog = await sectionCatalog(profile.AdSectionId);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const wanted = sanitizePassed(req.body?.courseIds, remaining).slice(0, 12);
    const c = req.body?.constraints || {};
    const wishes: StudentWishes = {
      termId: Number(term.AdTermId), targetUnits: units, courseIds: wanted,
      constraints: { noMorning: c.noMorning === true, noAfternoon: c.noAfternoon === true, freeDay: c.freeDay === true },
      updatedAt: new Date().toISOString(),
    };
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, wishes } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json({ ok: true, wishes });
  });

  /* ── المطروح لي: متبقّي صحيفتي أيُّه يُطرح هذا الفصل؟ (أعدادٌ لا مواعيد) ─── */
  app.get("/api/public/me/offered", requireDoor, async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const [catalog, index] = await Promise.all([sectionCatalog(profile.AdSectionId), offeringIndex(Number(term.AdTermId))]);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const progress = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit);
    const courses = progress.remainingIds.map(id => {
      const info = catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
      return { id, ...info, sections: index.get(id)?.sections || 0 };
    }).sort((a, b) => b.sections - a.sections || a.code.localeCompare(b.code, "en"));
    const offered = courses.filter(course => course.sections > 0);
    res.json({
      ready: true, termName: String(term.AdTermName || ""), remainingCount: courses.length, offeredCount: offered.length,
      offeredUnits: offered.reduce((sum, course) => sum + course.credit, 0), courses,
    });
  });

  /* ── تذكرتي: خططي (أ/ب/ج) ونافذتي من بروفة التسجيل ──────────────────────────
     تقديرٌ لا حجز. والشعبةُ وموعدُها لا يظهران إلا إن وُقّع جدولُ قسمها؛ قبل ذلك
     يرى الطالبُ المقرراتِ ووحداتها، لا الأوقات (المسوّداتُ للأقسام والعمادة). */
  app.get("/api/public/me/ticket", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const termId = Number(term.AdTermId);
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    if (!run || !ticket || ticket.runId !== run.runId) { res.json({ ready: false, reason: profile.AdSectionId > 0 ? "no-run" : "no-setup" }); return; }
    const [catalog, context] = await Promise.all([sectionCatalog(profile.AdSectionId), ticketContext(termId)]);
    const info = (id: number) => catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
    const round = term.AdTermStudentPhases?.rounds?.[ticket.window - 1];
    res.json({
      ready: true, termName: String(term.AdTermName || ""), ranAt: run.ranAt,
      stale: Date.parse(profile.updatedAt) > Date.parse(run.ranAt),
      window: { n: ticket.window, of: run.rounds, name: round?.name || "", start: round?.start || "", end: round?.end || "" },
      remainingUnits: ticket.remainingUnits, defaulted: ticket.defaulted,
      plans: ticket.plans.map(plan => ({
        label: plan.label, units: plan.units,
        items: plan.items.map(item => {
          const offering = context.offerings.get(item.offeringId);
          const visible = Boolean(offering && context.signed.has(`${offering.collegeId}:${offering.sectionId}`));
          return { courseId: item.courseId, ...info(item.courseId), tight: item.tight, timesVisible: visible, section: visible ? offering!.code : "", slots: visible ? offering!.slots : [] };
        }),
      })),
      unmet: ticket.unmet.map(entry => ({ courseId: entry.courseId, ...info(entry.courseId), reason: entry.reason })),
    });
  });

  /* ── الرمز: تغييرٌ، ونسيانُ الملف كلِّه ──────────────────────────────────── */
  app.post("/api/public/me/code", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق.", "rate"); return; }
    const oldCode = toEnglishDigits(req.body?.oldCode).replace(/\D/g, ""), newCode = toEnglishDigits(req.body?.newCode).replace(/\D/g, "");
    if (!(await verifyCode(oldCode, profile.codeHash, profile.codeSalt))) { fail(res, 401, "الرمز الحالي غير صحيح.", "bad-code"); return; }
    attempt.release();
    const problem = codeProblem(newCode);
    if (problem) { fail(res, 400, problem, "weak-code"); return; }
    const { hash, salt } = await hashCode(newCode);
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, codeHash: hash, codeSalt: salt, codeFailures: undefined, updatedAt: new Date().toISOString() } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك.", "signed-out"); return; }
    await issueSession(res, saved, req.body?.remember === true);
    noStore(res); res.json({ ok: true });
  });

  app.post("/api/public/me/forget", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    const attempt = codeLimiter.reserve(ip(req));
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة. انتظر دقائق.", "rate"); return; }
    const code = toEnglishDigits(req.body?.code).replace(/\D/g, "");
    if (!(await verifyCode(code, profile.codeHash, profile.codeSalt))) { fail(res, 401, "الرمز غير صحيح.", "bad-code"); return; }
    attempt.release();
    await Repository.updateStudentProfile(fingerprint, () => null);
    res.setHeader("Set-Cookie", clearDoorCookie(secure));
    noStore(res); res.json({ ok: true });
  });
}

/**
 * حذفُ الملفات التي انتهى عمرُها: عند الإقلاع ثم كل ست ساعات. دفعةٌ محدودة
 * (الحذفُ يُحسب من الحصة اليومية)، ومكرّرةُ الأمان بين النسخ.
 */
export function scheduleStudentProfilePurge(log: (message: string) => void = console.log): void {
  const tick = () => {
    Repository.purgeExpiredStudentProfiles(new Date().toISOString())
      .then(count => { if (count) log(`[student-door] حُذف ${count} ملف طالبٍ انتهى عمره.`); })
      .catch(error => console.error("[student-door] تعذّر حذف الملفات المنتهية:", error instanceof Error ? error.message : error));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 6 * 3_600_000).unref?.();
}
