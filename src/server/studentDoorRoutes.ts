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
import express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { Repository } from "../db/repository";
import type { AdCourse, StudentNeed, StudentProfile, StudentWishes } from "../types";
import { validateCivilId } from "../utils/civilId";
import { toEnglishDigits } from "../utils/digits";
import { byArabic } from "../utils/sorting";
import { AR, countOf } from "../utils/arabicCount";
import {
  AFTER_GRADUATION_DAYS, CODE_LENGTH, CODE_MAX_FAILURES, REMEMBER_DAYS, afterCodeFailure, codeProblem, expectedGraduation,
  lockState, planProgress, profileLifetime, resetLifetime, sanitizePassed, shouldTouch, unitsOf, RESET_COOLDOWN_DAYS,
} from "../utils/studentProfile";
import { buildSimulationOfferings, ticketContext } from "./simulationData";
import { auditSimOfferings } from "../utils/registrationSim";
import { verifiedUnresolvableStudentConflicts } from "../utils/studentCaseConflict";
import { remainingNeed, unmetPrereq } from "../utils/curriculumRules";
import { adviseStudent } from "../utils/studentAdvice";
import { buildStudentNotices } from "../utils/studentNotices";
import { studentNeedsCommitteeHelp } from "../utils/studentNeedRequest";
import { caseRefFor } from "../db/repository";
import { isCaseLevelNeed, studentCaseStatus } from "../utils/studentCaseDecision";
import { pickDoorTerm, readStudentPhase, studentTimeline } from "../utils/termStudentPhases";
import { deadlineDateShort } from "../utils/submissionDeadlines";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { createAttemptLimiter } from "./publicAttemptLimiter";
import { createTtlMemo } from "./notificationCache";
import {
  clearDoorCookie, codeVersion, doorCookie, hashCode, readCookie, readDoorSession, signDoorSession, verifyCode, DOOR_COOKIE,
} from "./studentDoor";

export interface StudentDoorDeps {
  surveyFingerprint: (civil: string) => Promise<string>;
  /** يختم الاسمَ والرقم المدني للطلب (AES-GCM) كما تفعل صفحةُ الاستبيان. */
  sealIdentity: (value: string) => Promise<string>;
  /** يفتح ما ختمه `sealIdentity` — ليرى الطالبُ اسمَه ويتأكّد أنّ بياناته صحيحة. */
  openIdentity?: (cipher: string) => Promise<string>;
  identityKey: () => Promise<Buffer>;
  isProduction: () => boolean;
  /** طلبُ الخريج: قواعدُ الاستبيان القديم وتحقّقُه من الصحيفة، تُحقن من الخادم فلا تُنسخ. */
  graduate?: {
    rule: (sectionId: number, planId: string | undefined, termName: string) => Promise<{ saved: boolean; summer: boolean; threshold?: number; minThreshold?: number; degreeUnits?: number }>;
    proof: (input: { collegeId: number; termId: number; civil: string; name: string; sectionId: number; bytes: Buffer; mime: string }) => Promise<{ status: number; body: any }>;
    submit: (input: { civil: string; sectionId: number; termId: number; proofToken: string }) => Promise<any>;
  };
}

/** صحيفةُ التخرّج المرفوعة: حدٌّ واحدٌ يُقال للطالب ويُفرض هنا (كما في الاستبيان القديم). */
const PROOF_MAX_BYTES = 14 * 1024 * 1024;
const GRADUATE_REASONS = ["field-conflict", "field-prerequisite-conflict"] as const;

/** وحداتُ الطالب في فصله: بين ١٢ و١٥. */
export const WISH_UNITS_MIN = 12;
export const WISH_UNITS_MAX = 15;
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
/** شعبٌ فُتحت من اقتراحٍ حديثاً: [مقرر → رمز الشعبة]. دقيقتان تكفيان: الإشعارُ لا يُلحّ. */
const openedMemo = createTtlMemo<Map<number, string>>({ ttlMs: 2 * 60_000 });
/** كم قسّمٌ أرسلوا رغباتهم: عددٌ واحد لكل (قسم، فصل)، لا قراءةَ كلّ الملفات لكل طالب. */
const wishCountMemo = createTtlMemo<{ n: number; of: number }>({ ttlMs: 10 * 60_000 });
const OPENED_WINDOW_DAYS = 21;
/** قواعدُ الصحيفة المعتمدة: تُقرأ في كل فتحةٍ لمساري، فتُحفظ دقائق. */
const ruleSetMemo = createTtlMemo<Awaited<ReturnType<typeof Repository.getRuleSet>> | null>({ ttlMs: 5 * 60_000 });
const ruleSetOf = (planId: string) => ruleSetMemo.get(planId, async () => (await Repository.getRuleSet(planId)) || null);

async function sectionCatalog(sectionId: number): Promise<SectionCatalog> {
  return catalogMemo.get(String(sectionId), async () => {
    const [plans, links, operational, courses] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId),
      Repository.getOperationalCourseIds(sectionId), Repository.getCourses(),
    ]);
    const live = plans.filter(plan => plan.status !== "archived");
    const byPlan = new Map<string, number[]>();
    /* المتطلباتُ العامة (مقررات أقسامٍ أخرى) تُحتسب في تقدّم الطالب من القواعد المعتمدة، ولا تدخل كتالوجَ القسم. */
    const approvedSets = new Map((await Promise.all(live.map(async plan => [plan.id, await Repository.getRuleSet(plan.id)] as const))));
    for (const plan of live) byPlan.set(plan.id, [...new Set([...links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)), ...(approvedSets.get(plan.id)?.externals || []).map(Number)])]);
    const known = new Map<number, { code: string; name: string; credit: number }>();
    for (const course of courses as AdCourse[]) {
      known.set(Number(course.AdCourseId), { code: String(course.CourseCode || ""), name: String(course.CourseName || ""), credit: Number(course.CourseCredit) || 0 });
    }
    const catalog = (courses as AdCourse[]).filter(course => Number(course.AdSectionId) === sectionId && operational.has(Number(course.AdCourseId))).map(course => Number(course.AdCourseId));
    return { plans: live.map(plan => ({ id: plan.id, name: plan.name, status: plan.status })), byPlan, catalog, courses: known };
  });
}

/** ما ينقص الطالبَ من مسبقاتٍ قبل أن يأخذ كل مقرر (أسماءٌ جاهزة للعرض). واحدةٌ للمطروح وللتذكرة. */
async function prereqNeeds(profile: StudentProfile, catalog: SectionCatalog): Promise<(id: number) => string[]> {
  const ruleSet = profile.curriculumPlanId ? await Repository.getRuleSet(profile.curriculumPlanId) : undefined;
  const passedSet = new Set(profile.passedCourseIds);
  const nameOf = (id: number) => catalog.courses.get(id)?.name || `مقرر ${id}`;
  return (id: number): string[] => {
    const rule = ruleSet?.rules.find(row => row.courseId === id);
    if (!rule?.prereq) return [];
    const lack = unmetPrereq(rule.prereq, passedSet, profile.passedUnits);
    return [...lack.all.map(nameOf), ...lack.anyOf.map(group => `(${group.map(nameOf).join(" أو ")})`), ...(lack.unitsShort ? [countOf(lack.unitsShort, AR.unit)] : [])];
  };
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
let identityOpener: ((cipher: string) => Promise<string>) | null = null;

/** اسمُ الطالب ورقمُه المدني مقنَّعاً (آخر ثلاثة أرقام) — لصاحب الجلسة وحده، ليتأكّد أنّ بياناته صحيحة. */
async function identityOf(profile: StudentProfile): Promise<{ name: string; civilMasked: string } | null> {
  if (!identityOpener || !profile.nameCipher || !profile.civilCipher) return null;
  try {
    const [name, civil] = await Promise.all([identityOpener(profile.nameCipher), identityOpener(profile.civilCipher)]);
    if (!name || !civil) return null;
    return { name, civilMasked: `${"•".repeat(Math.max(0, civil.length - 3))}${civil.slice(-3)}` };
  } catch { return null; }
}

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
    /* الاختياريُّ يُحسب بمجموعته: من أنجز «٢ من ٥» لا يبقى عليه الثلاثةُ الباقية — وإلا بالغنا في المتبقّي والفصول. */
    const rules = profile.curriculumPlanId ? await ruleSetOf(profile.curriculumPlanId) : null;
    if (rules && rules.groups.length) {
      const need = remainingNeed(allowedFor(catalog, profile.curriculumPlanId), rules, new Set(profile.passedCourseIds), credit);
      const total = Math.max(need.requiredUnits, progress.passedUnits);
      progress = { ...progress, totalUnits: total, remainingUnits: need.remainingUnits, percent: total > 0 ? Math.max(0, Math.min(100, Math.round(((total - need.remainingUnits) / total) * 100))) : 0 };
    }
  }
  return {
    setupDone, collegeId: profile.AdCollegeId || 0, sectionId: profile.AdSectionId, sectionName, planId: profile.curriculumPlanId || "", planName,
    passedCourseIds: profile.passedCourseIds, passedUnits: profile.passedUnits,
    progress, wishes: profile.wishes || null,
    createdAt: profile.createdAt, keepsUntil: profile.deleteAt, keepsReason: profile.deleteReason, hasIdentity: Boolean(profile.nameCipher && profile.civilCipher),
    identity: await identityOf(profile),
  };
}

/** الاسمُ الثلاثي: ٦–٨٠ حرفاً بلا أرقامٍ ولا رموز. فارغٌ إن لم يصلح. */
function cleanName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 6 && name.length <= 80 && !/[<>{}\\\d]/.test(name) ? name : "";
}

export function registerStudentDoorRoutes(app: Express, deps: StudentDoorDeps): void {
  identityOpener = deps.openIdentity || null;
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
        const name = cleanName(req.body?.name);
        if (!name) { fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
        const { hash, salt } = await hashCode(code);
        const nameCipher = await deps.sealIdentity(name), civilCipher = await deps.sealIdentity(civil);
        let existed = false;
        const iso = new Date(now).toISOString();
        const created = await Repository.updateStudentProfile(fingerprint, current => {
          if (current) { existed = true; return undefined; }
          const base = { createdAt: iso, lastSeenAt: iso };
          return {
            id: fingerprint, fingerprint, AdCollegeId: 0, AdSectionId: 0, passedCourseIds: [], passedUnits: 0,
            codeHash: hash, codeSalt: salt, nameCipher, civilCipher, updatedAt: iso, ...base, ...profileLifetime(base, new Date(now)),
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
  app.get("/api/public/me/catalog", async (req: Request, res: Response) => {
    const track = req.query.track === "boys" || req.query.track === "girls" ? String(req.query.track) : "";
    const data = await sectionsMemo.get("all", async () => {
      const [colleges, sections] = await Promise.all([Repository.getColleges(), Repository.getSections()]);
      return (colleges as any[]).map(college => ({
        id: Number(college.AdCollegeId), name: String(college.AdCollegeName || ""),
        campus: String(college.AdCollegeName || "").includes("الجهراء") ? "الجهراء" : String(college.AdCollegeName || "").includes("الفحيحيل") ? "الفحيحيل" : "المقر الرئيسي",
        sections: (sections as any[]).filter(section => Number(section.AdCollegeId) === Number(college.AdCollegeId))
          .map(section => ({ id: Number(section.AdSectionId), name: String(section.AdSectionName || "") }))
          .sort((a, b) => byArabic(a.name, b.name)),
      })).filter(college => college.sections.length).sort((a, b) => byArabic(a.name, b.name));
    });
    const basicEducation = data.filter(college => college.name.includes("التربية الأساسية") && (!track || (track === "boys" ? college.name.includes("بنين") : college.name.includes("بنات"))));
    const campusOrder = (campus: string) => campus === "المقر الرئيسي" ? 0 : campus === "الجهراء" ? 1 : 2;
    const bySpecialty = new Map<string, { id: number; name: string }>();
    basicEducation.slice().sort((a, b) => campusOrder(a.campus) - campusOrder(b.campus) || byArabic(a.name, b.name)).forEach(college => {
      college.sections.forEach(section => {
        const name = section.name.normalize("NFKC").replace(/\s+/g, " ").trim();
        const key = name.toLocaleLowerCase("ar");
        if (name && !bySpecialty.has(key)) bySpecialty.set(key, { id: section.id, name });
      });
    });
    const specializations = [...bySpecialty.values()].sort((a, b) => byArabic(a.name, b.name));
    res.setHeader("Cache-Control", "public, max-age=300"); res.json({ track: track || null, specializations: track ? specializations : [], tracks: ["boys", "girls"] });
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
    /* ما ينقصه مسبقُه لا يدخل رغباتِه: لا يطلب مقرراً لا يستطيع تسجيله، فلا يُفسد الرادار بطلبٍ وهميّ. */
    const needsOf = await prereqNeeds(profile, catalog);
    const wanted = sanitizePassed(req.body?.courseIds, remaining).filter(id => needsOf(id).length === 0).slice(0, 12);
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

  /* ── مقترحي: «سجّل هذه الثلاثة لأنها تفتح لك كذا وتتخرّج بعد كذا» — من صحيفته ومسبقاتها وما يُطرح فعلاً ── */
  app.get("/api/public/me/advice", requireDoor, async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const termId = Number(term.AdTermId);
    const [catalog, index, rules] = await Promise.all([sectionCatalog(profile.AdSectionId), offeringIndex(termId), profile.curriculumPlanId ? ruleSetOf(profile.curriculumPlanId) : Promise.resolve(null)]);
    const plan = allowedFor(catalog, profile.curriculumPlanId);
    if (!plan.length) { res.json({ ready: false, reason: "no-plan" }); return; }
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const advice = adviseStudent({
      planCourseIds: plan, passed: profile.passedCourseIds, passedUnits: profile.passedUnits,
      rules: rules?.rules || [], groups: rules?.groups || [], credit,
      name: id => catalog.courses.get(id)?.name || `مقرر ${id}`, code: id => catalog.courses.get(id)?.code || "",
      offered: id => (index.get(id)?.sections || 0) > 0,
      targetUnits: profile.wishes && profile.wishes.termId === termId ? profile.wishes.targetUnits : 15,
    });
    res.json({ ready: true, termName: String(term.AdTermName || ""), ...advice });
  });

  /* ── «أنت واحدٌ من …»: كم زميلٍ في قسمك أرسلوا رغباتهم. عددٌ فقط، ولا يظهر إلا حين يكثر العدد (لا يُستدلّ منه على أحد). ── */
  app.get("/api/public/me/wishes-count", requireDoor, async (_req: Request, res: Response) => {
    const { profile } = doorOf(res);
    noStore(res);
    const term = pickDoorTerm((await Repository.getTerms()) as any);
    if (!term || profile.AdSectionId <= 0 || !profile.wishes || profile.wishes.termId !== Number(term.AdTermId)) { res.json({ ready: false }); return; }
    const termId = Number(term.AdTermId), sectionId = profile.AdSectionId;
    const stat = await wishCountMemo.get(`${termId}:${sectionId}`, async () => {
      const list = (await Repository.getStudentProfilesByCollege(Number(profile.AdCollegeId))).filter(row => Number(row.AdSectionId) === sectionId && row.AdSectionId > 0);
      return { of: list.length, n: list.filter(row => row.wishes && row.wishes.termId === termId).length };
    });
    const n = Math.max(1, stat.n);
    res.json({ ready: true, n, of: Math.max(stat.of, n), show: stat.of >= 10 });
  });

  /* ── حالاتي: متابعة آمنة لطلبات الاستبيان القديم من ملف مساري ─────────── */
  app.get("/api/public/me/cases", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    noStore(res);
    const [needs, courses, terms] = await Promise.all([
      Repository.getStudentNeedHistoryByFingerprint(fingerprint), Repository.getCourses(), Repository.getTerms(),
    ]);
    const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const termById = new Map((terms as any[]).map(term => [Number(term.AdTermId), String(term.AdTermName || "الفصل") ] as const));
    const statusText: Record<string, string> = {
      pending: "وصل طلبك · قيد مراجعة القسم", approved: "وافقت اللجنة · بانتظار الإجراء التالي",
      "committee-rejected": "تعذّر قبول الطلب من اللجنة", registered: "اكتمل قرار الحالة داخل SCHEDULE",
      rejected: "تعذّر قبول الطلب في المراجعة التالية",
    };
    const rows = needs
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, 100)
      .map(need => {
        const status = isCaseLevelNeed(need)
          ? studentCaseStatus(need.caseState)
          : (need.courseStates || []).some(item => item.state === "committee-rejected") ? "committee-rejected"
            : (need.courseStates || []).some(item => item.state === "rejected") ? "rejected"
              : (need.courseStates || []).some(item => item.state === "awaiting-registration") ? "approved"
                : (need.courseStates || []).length && (need.courseStates || []).every(item => item.state === "registered") ? "registered" : "pending";
        const courseIds = [...new Set([...(need.courseIds || []), ...(need.courseStates || []).map(state => Number(state.courseId))])];
        const coursesForNeed = courseIds.map(id => {
          const course = courseById.get(Number(id));
          const state = (need.courseStates || []).find(item => Number(item.courseId) === Number(id));
          const courseStatus: Record<string, string> = {
            pending: "قيد مراجعة القسم", "awaiting-registration": "وافقت اللجنة · بانتظار الإجراء التالي",
            "committee-rejected": "تعذّر قبوله من اللجنة", registered: "اكتملت مراجعته داخل SCHEDULE",
            rejected: "تعذّر قبوله في المراجعة التالية",
          };
          return { code: String(course?.CourseCode || ""), name: String(course?.CourseName || "مقرر"),
            dropped: Boolean(state?.droppedByStudent), state: String(state?.state || "pending"),
            status: state?.droppedByStudent ? "أزلته من طلبك بعد القرار" : courseStatus[state?.state || "pending"] };
        });
        return {
          caseRef: caseRefFor(need), term: termById.get(Number(need.AdTermId)) || "فصل سابق",
          requestType: String(need.requestType || "new-course"), isCaseLevel: isCaseLevelNeed(need),
          title: need.requestType === "graduate" ? "مراجعة حالة التخرج والميداني" : need.requestType === "course-conflict" ? "مراجعة تعارض مقررات" : "مراجعة مقررات",
          status: statusText[status] || "وصل طلبك", statusCode: status,
          /* لا نعيد ملاحظات اللجنة الداخلية إلى بوابة الطالب؛ تُعرض فقط حالة
             القرار العامة. تفاصيل الطالب التي كتبها تبقى في سجل القسم. */
          courses: coursesForNeed, sentAt: String(need.createdAt || ""), updatedAt: String(need.updatedAt || need.createdAt || ""),
        };
      });
    res.json({ cases: rows });
  });

  /* ── طلب استثنائي من مساري: فتح مقرر أو تعارض، من الملف الموثّق نفسه ── */
  /* ── طلبُ الخريج / المتوقَّع تخرّجه: يعرف من وحداته المجتازة، ثم يرفع صحيفته للتدقيق كما كان في الاستبيان ── */
  const proofLimiter = createAttemptLimiter({ maxFailures: intFromEnv("STUDENT_DOOR_PROOF_MAX", 12), windowMs: 10 * 60_000, capacity: 20_000 });
  const identityOfProfile = async (profile: StudentProfile): Promise<{ name: string; civil: string } | null> => {
    if (!deps.openIdentity || !profile.nameCipher || !profile.civilCipher) return null;
    try {
      const [name, civil] = await Promise.all([deps.openIdentity(profile.nameCipher), deps.openIdentity(profile.civilCipher)]);
      return name && civil ? { name, civil } : null;
    } catch { return null; }
  };

  app.get("/api/public/me/graduate", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0 || !deps.graduate) { res.json({ ready: false, reason: "no-setup" }); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any[]);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId), termName = String(term.AdTermName || "");
    const rule = await deps.graduate.rule(profile.AdSectionId, profile.curriculumPlanId, termName);
    const need = (await Repository.getStudentNeedsByFingerprint(fingerprint, profile.AdCollegeId, termId)).find(row => row.requestType === "graduate");
    const passed = Number(profile.passedUnits) || 0;
    const threshold = rule.threshold ?? rule.minThreshold ?? 0;
    res.json({
      ready: true, canRequest: phase.mode !== "closed", line: phase.line, termName, summer: rule.summer,
      ruleSaved: rule.saved, threshold, thresholdExact: rule.threshold !== undefined, degreeUnits: rule.degreeUnits || 0,
      passedUnits: passed, enough: Boolean(rule.saved && threshold > 0 && passed >= threshold), short: rule.saved ? Math.max(0, threshold - passed) : 0,
      reasons: GRADUATE_REASONS.map(code => ({ code })),
      existing: need ? { caseRef: caseRefFor(need), eligibility: need.eligibility || "not-checked", reason: need.graduateReason || "" } : null,
    });
  });

  app.post("/api/public/me/graduate/proof", writeLimit, requireDoor, express.raw({ type: "application/octet-stream", limit: PROOF_MAX_BYTES }), async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (!deps.graduate) { fail(res, 404, "غير متاح.", "off"); return; }
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك الأكاديمي أولاً.", "no-setup"); return; }
    const identity = await identityOfProfile(profile);
    if (!identity) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل رفع الصحيفة.", "identity-needed"); return; }
    const attempt = proofLimiter.reserve(fingerprint);
    if (!attempt) { fail(res, 429, "محاولاتٌ كثيرة لرفع الصحيفة. انتظر دقائق ثم أعد المحاولة.", "rate"); return; }
    const term = pickDoorTerm((await Repository.getTerms()) as any[]);
    if (!term || readStudentPhase(term.AdTermStudentPhases).mode === "closed") { fail(res, 409, "الطلبات مغلقة الآن.", "requests-closed"); return; }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) { fail(res, 400, "ارفع صحيفة التخرج PDF أو صورة واضحة.", "no-file"); return; }
    const result = await deps.graduate.proof({
      collegeId: Number(profile.AdCollegeId), termId: Number(term.AdTermId), civil: identity.civil, name: identity.name,
      sectionId: profile.AdSectionId, bytes, mime: String(req.get("x-file-type") || "application/pdf").slice(0, 80),
    });
    if (result.status === 200) attempt.release();
    res.status(result.status).json(result.body);
  });

  /** إرسالُ طلب الخريج من «مساري»: الإثباتُ حيّ، والعتبةُ من القاعدة الحالية، والملاحظةُ والنوعُ مطلوبان — كالاستبيان تماماً. */
  async function submitGraduate(req: Request, res: Response, ctx: { fingerprint: string; profile: StudentProfile; termId: number; closed: boolean; line: string; termName: string }) {
    const { fingerprint, profile, termId } = ctx;
    if (!deps.graduate) { fail(res, 404, "غير متاح.", "off"); return; }
    if (ctx.closed) { fail(res, 409, "الطلبات مغلقة الآن.", "requests-closed", { line: ctx.line }); return; }
    const reason = GRADUATE_REASONS.find(code => code === req.body?.graduateReason);
    if (!reason) { fail(res, 400, "اختر نوع طلب الميداني.", "bad-reason"); return; }
    const details = String(req.body?.details || "").normalize("NFKC").replace(/[<>]/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600);
    if (details.length < 3) { fail(res, 400, "اكتب ملاحظات الطلب وسبب احتياجك قبل الإرسال.", "details-needed"); return; }
    const identity = await identityOfProfile(profile);
    if (!identity) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل إرسال طلب للقسم.", "identity-needed"); return; }
    const checked = await deps.graduate.submit({ civil: identity.civil, sectionId: profile.AdSectionId, termId, proofToken: String(req.body?.proofToken || "") });
    if (checked.error) { fail(res, checked.error.status, checked.error.body.error, checked.error.body.code); return; }
    const saved = await Repository.saveStudentNeed({
      fingerprint, AdCollegeId: Number(profile.AdCollegeId), AdSectionId: Number(profile.AdSectionId), studentSectionId: Number(profile.AdSectionId),
      surveySectionId: Number(profile.AdSectionId), AdTermId: termId, courseIds: [], requestType: "graduate",
      curriculumPlanId: checked.provenPlanId || profile.curriculumPlanId, nameCipher: profile.nameCipher!, civilCipher: profile.civilCipher!, details,
      graduateReason: reason, passedUnits: checked.passedUnits, requiredUnits: checked.requiredUnits, degreeUnits: checked.degreeUnits,
      eligibility: checked.eligibility, proofNameMatched: checked.nameMatched,
    });
    const sections = await Repository.getSections();
    noStore(res);
    res.status(201).json({ ok: true, requestType: "graduate", termId, caseRef: caseRefFor(saved), cases: [{
      sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === Number(profile.AdSectionId))?.AdSectionName || "القسم المختص"), caseRef: caseRefFor(saved), courseIds: [],
    }] });
  }

  app.get("/api/public/me/request-context", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const [terms, courses, catalog] = await Promise.all([Repository.getTerms(), Repository.getCourses(), sectionCatalog(profile.AdSectionId)]);
    const term = pickDoorTerm(terms as any[]);
    if (!term) { res.json({ ready: false, reason: "no-term" }); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    const eligible = studentNeedsCommitteeHelp(profile, run, ticket, termId);
    if (!eligible || !(phase.canEditWishes || phase.canReport)) {
      res.json({ ready: true, canRequest: false, line: phase.line, termId, termName: String(term.AdTermName || ""), courses: [], conflictOwnCourses: [], conflictCourses: [], conflictPairs: [] });
      return;
    }
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const openable = new Set(eligible ? ticket!.unmet.filter(item => item.reason === "not-offered" || item.reason === "full").map(item => Number(item.courseId)) : []);
    const conflictBlocked = new Set(eligible ? ticket!.unmet.filter(item => item.reason === "conflict").map(item => Number(item.courseId)) : []);
    const all = (courses as AdCourse[]).filter(course => Number(course.AdCollegeId) === Number(profile.AdCollegeId)
      && Number.isInteger(Number(course.AdCourseId)) && Number(course.AdCourseId) > 0)
      .map(course => ({ id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
        own: Number(course.AdSectionId) === Number(profile.AdSectionId), remaining: remaining.has(Number(course.AdCourseId)) }))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.name.localeCompare(b.name, "ar"));
    const courseById = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    let pairs: ReturnType<typeof verifiedUnresolvableStudentConflicts> = [], conflictCourses: Array<(typeof all)[number] & { sectionName: string }> = [];
    if (conflictBlocked.size && all.some(course => !course.own)) {
      const [schedules, sections, published] = await Promise.all([
        Repository.getSchedulesByScope({ termId }), Repository.getSections(), ticketContext(termId),
      ]);
      const table = buildSimulationOfferings(termId, schedules, courseById);
      const confirmed = auditSimOfferings(table.offerings).confirmed;
      pairs = verifiedUnresolvableStudentConflicts([...conflictBlocked], all.filter(course => !course.own).map(course => course.id), confirmed, published.signed,
        { collegeId: Number(profile.AdCollegeId), sectionId: Number(profile.AdSectionId) });
      const eligibleOtherIds = new Set(pairs.map(pair => pair.otherCourseId));
      const conflictCourseInfo = new Map(all.filter(course => eligibleOtherIds.has(course.id)).map(course => {
        const row = courseById.get(course.id);
        return [course.id, { ...course, sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === Number(row?.AdSectionId))?.AdSectionName || "قسم آخر") }];
      }));
      conflictCourses = [...conflictCourseInfo.values()];
    }
    res.json({ ready: true, canRequest: eligible && (phase.canEditWishes || phase.canReport), line: phase.line,
      termId, termName: String(term.AdTermName || ""),
      courses: eligible ? all.filter(course => course.own && course.remaining && openable.has(course.id)) : [],
      conflictOwnCourses: eligible ? all.filter(course => course.own && course.remaining && conflictBlocked.has(course.id)) : [],
      conflictCourses,
      conflictPairs: pairs });
  });

  app.post("/api/public/me/request", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك الأكاديمي أولاً.", "no-setup"); return; }
    if (!profile.nameCipher || !profile.civilCipher) { fail(res, 409, "حدّث بيانات هويتك في ملف مساري قبل إرسال طلب للقسم.", "identity-needed"); return; }
    if (req.body?.consent !== true) { fail(res, 400, "وافق على إرسال بيانات هويتك للقسم لمراجعة الطلب.", "consent-needed"); return; }
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any[]);
    if (!term) { fail(res, 409, "لا يوجد فصل دراسي مفتوح للطلبات الآن.", "no-term"); return; }
    const phase = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    /* الخريجُ لا ينتظر نافذة الرغبات: طلبُه مفتوحٌ ما دامت الطلبات لم تُغلق (كما كان في الاستبيان). */
    if (req.body?.requestType === "graduate") { await submitGraduate(req, res, { fingerprint, profile, termId, closed: phase.mode === "closed", line: phase.line, termName: String(term.AdTermName || "") }); return; }
    if (!phase.canEditWishes && !phase.canReport) { fail(res, 409, "نافذة الطلبات غير مفتوحة الآن.", "requests-closed", { line: phase.line }); return; }
    const [run, ticket] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint)]);
    if (!studentNeedsCommitteeHelp(profile, run, ticket, termId)) {
      fail(res, 409, "لا توجد حالة تعثر مؤكدة في آخر محاكاة تستدعي طلباً فردياً. حدّث رغباتك وانتظر إعادة الاحتساب.", "no-proven-blocker"); return;
    }
    const openable = new Set(ticket!.unmet.filter(item => item.reason === "not-offered" || item.reason === "full").map(item => Number(item.courseId)));

    const requestType = req.body?.requestType === "course-conflict" ? "course-conflict" : req.body?.requestType === "new-course" ? "new-course" : "";
    if (!requestType) { fail(res, 400, "اختر فتح مقرر أو مراجعة تعارض مقررين.", "bad-request-type"); return; }
    const [courses, catalog] = await Promise.all([Repository.getCourses(), sectionCatalog(profile.AdSectionId)]);
    const byId = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remaining = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const ids: number[] = [...new Set<number>((Array.isArray(req.body?.courseIds) ? req.body.courseIds : []).map(Number)
      .filter(id => Number.isInteger(id) && id > 0))];
    if (requestType === "new-course" && (ids.length < 1 || ids.length > 12 || ids.some(id => !remaining.has(id) || !openable.has(id) || Number(byId.get(id)?.AdSectionId) !== Number(profile.AdSectionId)))) {
      fail(res, 400, "اختر من مقرراتك المتبقية المتعذرة في المحاكاة (حتى 12 مقرراً).", "course-outside-plan"); return;
    }
    if (requestType === "course-conflict") {
      if (ids.length !== 2 || ids[0] === ids[1]) { fail(res, 400, "اختر مقررين مختلفين للتعارض.", "bad-conflict-pair"); return; }
      const rows = ids.map(id => byId.get(id));
      const ownId = ids.find(id => Number(byId.get(id)?.AdSectionId) === Number(profile.AdSectionId));
      const otherId = ids.find(id => id !== ownId);
      const schedules = await Repository.getSchedulesByScope({ termId });
      const table = buildSimulationOfferings(termId, schedules, byId);
      const confirmed = auditSimOfferings(table.offerings).confirmed;
      const published = await ticketContext(termId);
      const pairs = verifiedUnresolvableStudentConflicts(ownId ? [ownId] : [], otherId ? [otherId] : [], confirmed, published.signed,
        { collegeId: Number(profile.AdCollegeId), sectionId: Number(profile.AdSectionId) });
      if (!ownId || !otherId || rows.some(course => !course || Number(course.AdCollegeId) !== Number(profile.AdCollegeId))
        || !remaining.has(ownId) || !ticket!.unmet.some(item => Number(item.courseId) === ownId && item.reason === "conflict")
        || !pairs.some(pair => pair.ownCourseId === ownId && pair.otherCourseId === otherId)) {
        fail(res, 409, "لم يثبت تعذّر حل هذا التعارض من الجداول المنشورة المكتملة. جرّب الشعب البديلة أو حدّث المحاكاة.", "conflict-not-proven"); return;
      }
    }
    const details = String(req.body?.details || "").normalize("NFKC").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (details.length < 3) { fail(res, 400, "اكتب سبباً مختصراً يساعد القسم على مراجعة الطلب.", "details-needed"); return; }
    const existing = (await Repository.getStudentNeedsByFingerprint(fingerprint, profile.AdCollegeId, termId))
      .find(need => need.requestType === "graduate" && Number(need.surveySectionId || need.AdSectionId) === Number(profile.AdSectionId));
    if (existing?.requestType === "graduate" && existing.eligibility === "eligible") {
      fail(res, 409, "لديك حالة تخرج موثّقة لهذا الفصل. تابعها من «حالاتي» أو حدّثها من مسارها الحالي.", "verified-graduate-case"); return;
    }
    const requestGroupId = randomUUID();
    const grouped = new Map<number, number[]>();
    for (const id of ids) {
      const owner = Number(byId.get(id)?.AdSectionId);
      if (!owner) continue;
      grouped.set(owner, [...(grouped.get(owner) || []), id]);
    }
    const sections = await Repository.getSections();
    const byOwner: Array<{ sectionId: number; caseRef: string; courseIds: number[] }> = [];
    for (const [ownerSectionId, ownerCourseIds] of grouped) {
      const ownerCollegeId = Number(byId.get(ownerCourseIds[0])?.AdCollegeId);
      const paired = ids.filter(id => !ownerCourseIds.includes(id)).map(id => {
        const course = byId.get(id);
        return `${String(course?.CourseCode || "")} ${String(course?.CourseName || "")}`.trim();
      }).filter(Boolean);
      const ownerDetails = requestType === "course-conflict" && paired.length
        ? `${details} · تعارض مع: ${paired.join("، ")}` : details;
      const entry: Omit<StudentNeed, "id" | "createdAt"> = {
        fingerprint, AdCollegeId: ownerCollegeId,
        AdSectionId: ownerCollegeId === Number(profile.AdCollegeId) ? Number(profile.AdSectionId) : ownerSectionId,
        studentSectionId: Number(profile.AdSectionId), surveySectionId: ownerSectionId, AdTermId: termId,
        curriculumPlanId: profile.curriculumPlanId, courseIds: ownerCourseIds, requestType,
        requestGroupId, nameCipher: profile.nameCipher, civilCipher: profile.civilCipher,
        details: ownerDetails, eligibility: "not-checked",
      };
      const saved = await Repository.saveStudentNeed(entry);
      byOwner.push({ sectionId: ownerSectionId, caseRef: caseRefFor(saved), courseIds: ownerCourseIds });
    }
    const primary = byOwner.find(row => row.sectionId === Number(profile.AdSectionId)) || byOwner[0];
    noStore(res); res.status(201).json({ ok: true, caseRef: primary?.caseRef || "", cases: byOwner.map(row => ({
      sectionName: String((sections as any[]).find(section => Number(section.AdSectionId) === row.sectionId)?.AdSectionName || "القسم المختص"),
      caseRef: row.caseRef, courseIds: row.courseIds,
    })), requestGroupId, requestType, termId, courseIds: ids });
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
    /* قواعدُ الصحيفة المعتمدة (إن وُجدت): ما ينقص الطالبَ من مسبقاتٍ قبل أن يستطيع أخذ المقرر. */
    const needsOf = await prereqNeeds(profile, catalog);
    const courses = progress.remainingIds.map(id => {
      const info = catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
      return { id, ...info, sections: index.get(id)?.sections || 0, needs: needsOf(id) };
    }).sort((a, b) => b.sections - a.sections || a.code.localeCompare(b.code, "en"));
    const offered = courses.filter(course => course.sections > 0);
    res.json({
      ready: true, termName: String(term.AdTermName || ""), remainingCount: courses.length, offeredCount: offered.length,
      offeredUnits: offered.reduce((sum, course) => sum + course.credit, 0), courses,
    });
  });

  /* ── ما الجديد؟ ── إشعاراتُ الطالب مشتقّةٌ من حاله لحظةَ السؤال (utils/studentNotices). */
  app.get("/api/public/me/notices", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ notices: [] }); return; }
    const termId = Number(term.AdTermId);
    const reading = readStudentPhase(term.AdTermStudentPhases);
    const [run, ticket, needs, catalog] = await Promise.all([
      Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint),
      Repository.getStudentNeedsByFingerprint(fingerprint, 0, termId), profile.AdSectionId > 0 ? sectionCatalog(profile.AdSectionId) : Promise.resolve(null),
    ]);
    const courseNames = new Map((await Repository.getCourses() as any[]).map(course => [Number(course.AdCourseId), String(course.CourseName || "")] as const));
    const nameOf = (id: number) => courseNames.get(id) || catalog?.courses.get(id)?.name || `مقرر ${id}`;
    const live = run && ticket && ticket.runId === run.runId ? ticket : null;
    const round = live ? term.AdTermStudentPhases?.rounds?.[live.window - 1] : undefined;
    /* شعبٌ فتحها القسمُ حديثاً لما أراده الطالبُ أو لم يجد له مقعداً — يُقرأ من أصل صفّ الجدول (origin) لا من مخزنٍ جديد. */
    const wanted = new Set<number>([
      ...(profile.wishes && profile.wishes.termId === termId ? profile.wishes.courseIds : []),
      ...(profile.registration && profile.registration.termId === termId ? profile.registration.answers.filter(a => a.state === "stuck").map(a => a.courseId) : []),
      ...(live ? live.unmet.filter(entry => entry.reason === "full" || entry.reason === "not-offered").map(entry => entry.courseId) : []),
    ]);
    const openedAll = await openedMemo.get(String(termId), async () => {
      const out = new Map<number, string>();
      const since = Date.now() - OPENED_WINDOW_DAYS * 86_400_000;
      for (const row of await Repository.getSchedulesByScope({ termId })) {
        const origin = (row as any).origin as { kind?: string; refId?: string; at?: string } | undefined;
        if (!origin || (origin.kind !== "radar" && origin.kind !== "intelligence") || !String(origin.refId || "").startsWith("course:")) continue;
        if (!(Date.parse(String(origin.at || "")) >= since)) continue;
        out.set(Number(row.AdCourseId), String(row.SCode || ""));
      }
      return out;
    });
    const opened = [...wanted].filter(id => openedAll.has(id)).slice(0, 4).map(id => ({ courseId: id, name: nameOf(id), section: openedAll.get(id) || "" }));
    /* العددُ نفسُه الذي تعرضه بطاقةُ «هل سجلت؟»: خطّةُ (أ) إن وُجدت، وإلا ما طُرح من متبقّي صحيفته. */
    const reportCourses = profile.AdSectionId > 0 ? ((await reportContext(profile, fingerprint))?.ids.length || 0) : 0;
    const cases = needs.flatMap(need => need.courseIds.map(courseId => {
      const state = (need.courseStates || []).find(row => Number(row.courseId) === courseId);
      return { courseId, name: nameOf(courseId), state: (state?.state || "pending") as any, reasonCode: state?.reasonCode, note: state?.note, dropped: state?.droppedByStudent, opened: Boolean(state?.scheduleId) };
    }));
    res.json({
      notices: buildStudentNotices({
        setupDone: profile.AdSectionId > 0,
        phase: { mode: reading.mode, canEditWishes: reading.canEditWishes, canReport: reading.canReport, line: reading.line, nextAt: reading.nextAt ? deadlineDateShort(reading.nextAt) : "", nextLabel: reading.nextLabel },
        hasWishes: Boolean(profile.wishes && profile.wishes.termId === termId),
        ticket: live ? { stale: Date.parse(profile.updatedAt) > Date.parse(run!.ranAt), window: live.window, of: run!.rounds, windowName: round?.name, start: round?.start ? deadlineDateShort(round.start) : "", end: round?.end ? deadlineDateShort(round.end) : "" } : null,
        reportAnswered: Boolean(profile.registration && profile.registration.termId === termId),
        reportCourses, cases, opened,
      }),
    });
  });

  /* ── هل سجلت؟ ── بعد جولة التسجيل: ما سجّلتَه وما تعثّرتَ فيه ولماذا.
     من تعثّر وطلب المساعدة كتب اسمَه ورقمَه المدني (يُختمان) فتصل حالتُه قسمَ المقرر؛
     ولا يُحفظ الاسمُ في ملفّه الدائم أبداً. ما يقوله لنا يُضاف إلى عدّادات الرادار
     (أعداد لا أسماء) فيعرف صاحبُ القرار أين صدقت الرادارُ وأين لم تصدق. */
  const REASONS = new Set(["full", "prereq", "conflict", "other"]);
  const REASON_TEXT: Record<string, string> = { full: "امتلأت الشعب", prereq: "المسبق لا يسمح", conflict: "تعارض مع مقرر آخر", other: "سبب آخر" };

  async function reportContext(profile: StudentProfile, fingerprint: string) {
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) return null;
    const reading = readStudentPhase(term.AdTermStudentPhases);
    const termId = Number(term.AdTermId);
    const catalog = await sectionCatalog(profile.AdSectionId);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const [run, ticket, index] = await Promise.all([Repository.getRegistrationRun(termId), Repository.getRegistrationTicket(termId, fingerprint), offeringIndex(termId)]);
    const info = (id: number) => catalog.courses.get(id) || { code: "", name: `مقرر ${id}`, credit: 0 };
    const planned = run && ticket && ticket.runId === run.runId ? (ticket.plans.find(plan => plan.label === "A")?.items.map(item => item.courseId) || []) : [];
    const remaining = planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds.filter(id => (index.get(id)?.sections || 0) > 0);
    const ids = [...new Set([...planned, ...(planned.length ? [] : remaining.slice(0, 12))])];
    /* ما يُعرض له هو ما يُقبل منه: لا مقررَ مخفيّاً يُرسَل مباشرةً فيُفسد العدّادات أو يُنشئ حالةً لقسمٍ لم تكن في خطّته. */
    return { term, termId, reading, ids, info, allowed: new Set(ids) };
  }

  app.get("/api/public/me/report", requireDoor, async (_req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    noStore(res);
    if (profile.AdSectionId <= 0) { res.json({ ready: false, reason: "no-setup" }); return; }
    const ctx = await reportContext(profile, fingerprint);
    if (!ctx) { res.json({ ready: false, reason: "no-term" }); return; }
    const mine = profile.registration && profile.registration.termId === ctx.termId ? profile.registration : null;
    res.json({
      ready: true, canReport: ctx.reading.canReport, line: ctx.reading.line,
      courses: ctx.ids.map(id => ({ courseId: id, ...ctx.info(id) })),
      answers: mine?.answers || [], answeredAt: mine?.at || "",
    });
  });

  app.post("/api/public/me/report", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint, profile } = doorOf(res);
    if (profile.AdSectionId <= 0) { fail(res, 409, "أكمل ملفّك أولاً.", "no-setup"); return; }
    const ctx = await reportContext(profile, fingerprint);
    if (!ctx || !ctx.reading.canReport) { fail(res, 409, "سؤال «هل سجلت؟» غير مفتوح الآن.", "report-closed", { line: ctx?.reading.line || "" }); return; }
    const raw = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 40) : [];
    const answers: NonNullable<StudentProfile["registration"]>["answers"] = [];
    const seen = new Set<number>();
    for (const item of raw) {
      const courseId = Number(item?.courseId);
      if (!Number.isInteger(courseId) || seen.has(courseId) || !ctx.allowed.has(courseId)) continue;
      seen.add(courseId);
      if (item?.state === "registered") answers.push({ courseId, state: "registered" });
      else if (item?.state === "stuck") answers.push({ courseId, state: "stuck", reason: REASONS.has(String(item?.reason)) ? item.reason : "other" });
    }
    if (!answers.length) { fail(res, 400, "اختر حالة مقرّرٍ واحدٍ على الأقل.", "empty"); return; }
    const stuck = answers.filter(answer => answer.state === "stuck");
    const help = req.body?.help;
    /* الاسمُ والرقمُ مختومان في ملفّه منذ إنشائه: لا يُسألان ثانيةً. أما ملفٌّ أُنشئ قبل ذلك فيُسأل مرةً ويُحفظ مختوماً. */
    let sealed: { nameCipher: string; civilCipher: string } | null = profile.nameCipher && profile.civilCipher ? { nameCipher: profile.nameCipher, civilCipher: profile.civilCipher } : null;
    let remember: { nameCipher: string; civilCipher: string } | null = null;
    if (stuck.length && help && !sealed) {
      const civil = toEnglishDigits(help?.civil).replace(/\D/g, "");
      const name = cleanName(help?.name);
      if (!name) { fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
      if (civil.length !== 12 || !validateCivilId(civil).isValid) { fail(res, 400, "الرقم المدني غير صحيح.", "bad-civil"); return; }
      if ((await deps.surveyFingerprint(civil)) !== fingerprint) { fail(res, 403, "هذا الرقم المدني ليس رقمَ هذا الملف.", "civil-mismatch"); return; }
      sealed = remember = { nameCipher: await deps.sealIdentity(name), civilCipher: await deps.sealIdentity(civil) };
    }

    const saved = await Repository.recordRegistrationAnswers(fingerprint, ctx.termId, current => {
      if (!current) return undefined;
      return { ...current, ...(remember || {}), registration: { termId: ctx.termId, at: new Date().toISOString(), answers } };
    });
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }

    /* حالةٌ لكل قسمٍ يملك مقرراً تعثّر فيه: يصله الطلبُ على كشف التسجيل كأيّ طلب. */
    const cases: Array<{ sectionName: string; caseRef: string }> = [];
    if (sealed && help) {
      const [courses, sections] = await Promise.all([Repository.getCourses(), Repository.getSections()]);
      const courseOf = new Map((courses as any[]).map(course => [Number(course.AdCourseId), course] as const));
      const byOwner = new Map<number, typeof stuck>();
      for (const answer of stuck) {
        const owner = Number(courseOf.get(answer.courseId)?.AdSectionId) || 0;
        if (owner) byOwner.set(owner, [...(byOwner.get(owner) || []), answer]);
      }
      const { nameCipher, civilCipher } = sealed;
      for (const [ownerSectionId, list] of byOwner) {
        const ownerCollegeId = Number(courseOf.get(list[0].courseId)?.AdCollegeId) || profile.AdCollegeId;
        const homeInOwnerCollege = profile.AdCollegeId === ownerCollegeId;
        const need = await Repository.saveStudentNeed({
          fingerprint, AdCollegeId: ownerCollegeId, AdSectionId: homeInOwnerCollege ? profile.AdSectionId : ownerSectionId,
          studentSectionId: profile.AdSectionId, surveySectionId: ownerSectionId, AdTermId: ctx.termId,
          curriculumPlanId: profile.curriculumPlanId, courseIds: list.map(answer => answer.courseId), requestType: "new-course",
          nameCipher, civilCipher, eligibility: "not-checked",
          details: `من «مساري» بعد التسجيل — ${list.map(answer => `${ctx.info(answer.courseId).name}: ${REASON_TEXT[answer.reason || "other"]}`).join("؛ ")}`,
        } as any);
        cases.push({ sectionName: String((sections as any[]).find(row => Number(row.AdSectionId) === ownerSectionId)?.AdSectionName || ""), caseRef: caseRefFor(need) });
      }
    }
    noStore(res); res.json({ ok: true, registered: answers.length - stuck.length, stuck: stuck.length, cases });
  });

  /* ── تذكرتي: خططي (أ/ب/ج) ونافذتي من رادار التسجيل ──────────────────────────
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
    const alternativesFor = (courseId: number, currentId: string) => {
      const seen = new Set<string>();
      return ticket.plans.flatMap(plan => plan.items.filter(item => Number(item.courseId) === Number(courseId)).map(item => {
        const id = String(item.offeringId || ""), offering = context.offerings.get(id);
        if (!id || id === currentId || seen.has(id) || !offering?.slots.length
          || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`)) return null;
        seen.add(id);
        return { offeringId: id, section: offering.code, slots: offering.slots, tight: item.tight };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item)));
    };
    /* مخزنُ التبديل: كلُّ مقررٍ متبقٍّ له شعبٌ بمواعيد معتمدة — ليجرّب الطالبُ استبدال مقررٍ بآخر على أسبوعه.
       معاينةٌ شخصية: لا يُكتب منها شيء. ما ينقصه مسبقُه يُعرض مقفلاً بسببه. */
    const needsOf = await prereqNeeds(profile, catalog);
    const credit = new Map([...catalog.courses].map(([id, course]) => [id, course.credit]));
    const remainingIds = new Set(planProgress(allowedFor(catalog, profile.curriculumPlanId), profile.passedCourseIds, credit).remainingIds);
    const byCourse = new Map<number, Array<{ offeringId: string; section: string; slots: Array<{ day: number; start: number; end: number }> }>>();
    for (const [key, offering] of context.offerings) {
      const parts = key.split("|");
      if (parts.length !== 5) continue;
      const courseId = Number(parts[3]);
      if (!remainingIds.has(courseId) || !offering.slots.length || !context.signed.has(`${offering.collegeId}:${offering.sectionId}`)) continue;
      const list = byCourse.get(courseId) || [];
      if (list.length < 8) list.push({ offeringId: key, section: offering.code, slots: offering.slots });
      byCourse.set(courseId, list);
    }
    const pool = [...byCourse.entries()].slice(0, 40).map(([courseId, offerings]) => ({ courseId, ...info(courseId), needs: needsOf(courseId), offerings }))
      .sort((a, b) => a.needs.length - b.needs.length || a.code.localeCompare(b.code, "en"));
    const round = term.AdTermStudentPhases?.rounds?.[ticket.window - 1];
    res.json({
      ready: true, termName: String(term.AdTermName || ""), ranAt: run.ranAt, pool,
      stale: Date.parse(profile.updatedAt) > Date.parse(run.ranAt),
      window: { n: ticket.window, of: run.rounds, name: round?.name || "", start: round?.start || "", end: round?.end || "" },
      remainingUnits: ticket.remainingUnits, defaulted: ticket.defaulted,
      plans: ticket.plans.map(plan => ({
        label: plan.label, units: plan.units,
        items: plan.items.map(item => {
          const offering = context.offerings.get(item.offeringId);
          const visible = Boolean(offering && context.signed.has(`${offering.collegeId}:${offering.sectionId}`));
          return { courseId: item.courseId, ...info(item.courseId), tight: item.tight, timesVisible: visible,
            section: visible ? offering!.code : "", slots: visible ? offering!.slots : [],
            offeringId: visible ? item.offeringId : "", alternatives: visible ? alternativesFor(item.courseId, item.offeringId) : [] };
        }),
      })),
      unmet: ticket.unmet.map(entry => ({ courseId: entry.courseId, ...info(entry.courseId), reason: entry.reason })),
    });
  });

  /* ── اسمي: يصحّحه الطالبُ إن أخطأ (الرقمُ المدنيُّ هو المفتاح فلا يتغيّر) ── */
  app.put("/api/public/me/name", writeLimit, requireDoor, async (req: Request, res: Response) => {
    const { fingerprint } = doorOf(res);
    const name = cleanName(req.body?.name);
    if (!name) { fail(res, 400, "اكتب اسمك الثلاثي كما في الجامعة.", "bad-name"); return; }
    const nameCipher = await deps.sealIdentity(name);
    const saved = await Repository.updateStudentProfile(fingerprint, current => (current ? { ...current, nameCipher } : undefined));
    if (!saved) { fail(res, 401, "انتهت جلستك. أدخل من جديد.", "signed-out"); return; }
    noStore(res); res.json(await summaryOf(saved));
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
      .then(count => { if (count) log(`[student-door] حُذف ${countOf(count, AR.profile)} انتهى عمرها.`); })
      .catch(error => console.error("[student-door] تعذّر حذف الملفات المنتهية:", error instanceof Error ? error.message : error));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 6 * 3_600_000).unref?.();
}
