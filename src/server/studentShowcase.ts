/**
 * ── «مساري» للعرض ────────────────────────────────────────────────────────────
 *
 * يُفتح من شريط البيئة التجريبية («جرّب كطالب») أو من الرابط `/me/demo` ليرى
 * الزائرُ «خريطتي» كما يراها طالبٌ حقيقي: طالبةٌ في قسم تكنولوجيا التعليم، أنجزت
 * المستوى الأول تقريباً، ومقرراتُها من أقسامٍ أخرى وسلاسل مسبقاتٍ حقيقية — كلُّه
 * من الصحيفة المرجعية نفسها.
 *
 * العزل (لا استثناء):
 *  • كلُّ زائرٍ له صندوقُ ذاكرةٍ خاصّ (`Repository.createShowcaseSandbox`) فارغٌ من
 *    البيانات الحقيقية؛ يُربط به كوكي `sh_demo_stu` فتُنفَّذ طلباتُ `/api/public/me/*`
 *    داخله. فلا يقرأ منه الحقيقيُّ ولا يكتب فيه (كلُّ مسارٍ في المستودع يتفرّع
 *    على `demoSandboxContext` قبل Firestore).
 *  • جلسةُ الباب موقَّعةٌ ببصمةٍ لا وجودَ لها خارج الصندوق: لو بقي كوكيها بعد انتهاء
 *    الصندوق فهي 401 في الحقيقي.
 *  • عددُ الصناديق محدود، والإنشاءُ بمعدّلٍ محدود، والصندوقُ ينتهي بعد ساعتين.
 */
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import type { Express, NextFunction, Request, Response } from "express";
import { Repository } from "../db/repository";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";
import { buildReferenceRules } from "../utils/referenceApply";
import { referenceCodeKey } from "../utils/curriculumReference";
import { profileLifetime, unitsOf } from "../utils/studentProfile";
import { runRegistrationSimulation } from "./simulationData";
import { codeVersion, doorCookie, signDoorSession, clearDoorCookie, readCookie } from "./studentDoor";

export const SHOWCASE_COOKIE = "sh_demo_stu";
const TTL_MS = 2 * 60 * 60_000;
const MAX_SANDBOXES = 150;

const DEPT: Record<string, string> = { "01": "الدراسات الإسلامية", "02": "اللغة العربية", "03": "الاجتماعيات", "05": "الرياضيات", "06": "العلوم", "07": "التربية البدنية", "08": "التربية الفنية", "09": "تكنولوجيا التعليم", "10": "التربية الموسيقية", "11": "علم النفس", "12": "المكتبات", "13": "الحاسوب", "14": "أصول التربية", "15": "التربية الخاصة", "16": "الإدارة التربوية", "19": "التربية الخاصة", "20": "المناهج", "21": "المناهج وطرق التدريس", "24": "الهندسة", "30": "اللغة الإنجليزية", "65": "علوم أخرى" };
/** الشعبُ المطروحة هذا الفصل: بعضُ المقررات فقط، فيظهر الفرقُ بين «مطروح» و«غير مطروح». */
const OFFERED = new Set(["0109220", "0109221", "0109224", "0109233", "0109122", "0109123", "0130164", "0102115", "0119150", "0109321", "0109322", "0109226", "0109315", "0101102", "0103116", "0109105"]);
/** ما أنجزته الطالبةُ الافتراضية: المستوى الأول تقريباً وبعضُ الثاني والعامة. */
const PASSED = ["0109105", "0109108", "0109121", "0109122", "0109123", "0102114", "0102115", "0101102", "0103105", "0103116", "0130099", "0130161", "0102101", "0106101", "0109220", "0109221"];
export const SHOWCASE_STUDENT_NAME = "سارة محمد العتيبي";

const dayAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** حالةُ الصندوق (خالصة): أقسامٌ ومقرراتٌ وصحائفٌ وقواعدُ معتمدة وشعبٌ وفصلٌ بباب رغبات مفتوح. */
export function buildShowcaseSeed(todayISO: string) {
  const ref = TECHNOLOGY_EDUCATION_CURRICULA.find(r => r.id === "new");
  if (!ref) throw new Error("الصحيفة المرجعية لقسم تكنولوجيا التعليم غير موجودة");
  const sections: any[] = [], sid = new Map<string, number>();
  const sectionOf = (dept: string) => {
    if (!sid.has(dept)) { const id = 100 + sid.size; sid.set(dept, id); sections.push({ AdSectionId: id, AdCollegeId: 1, AdSectionCode: dept, AdSectionName: `قسم ${DEPT[dept] || dept}` }); }
    return sid.get(dept)!;
  };
  const tech = sectionOf("09");
  const courses: any[] = [], idByCode = new Map<string, number>(), seen = new Set<string>();
  let next = 1000;
  for (const group of ref.groups) for (const c of group.courses) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    const id = next++;
    idByCode.set(referenceCodeKey(c.code), id);
    courses.push({ AdCourseId: id, AdCollegeId: 1, AdSectionId: sectionOf(c.code.slice(2, 4)), CourseCode: c.code, CourseName: c.name, CourseCredit: c.credit, CourseHours: c.hours, MaxStudent: 40 });
  }
  const own = courses.filter(c => c.AdSectionId === tech);
  const schedules: any[] = [];
  let row = 1;
  for (const c of courses) if (OFFERED.has(c.CourseCode)) for (const code of ["01", "02", "03"].slice(0, 1 + (row % 3))) {
    schedules.push({ id: row++, AdCollegeId: 1, AdSectionId: c.AdSectionId, AdTermId: 1, AdCourseId: c.AdCourseId, AdCourseName: c.CourseName, SCode: code, AdInstructorId: 1, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "09:00", fendtime: "10:30", AdRoomCode: "", AdRoomHall: "" });
  }
  const stamp = new Date(`${todayISO}T00:00:00Z`).toISOString();
  const approved = (planId: string, sectionId: number, built: { rules: any; groups: any }, externals?: number[]) =>
    ({ id: planId, planId, AdCollegeId: 1, AdSectionId: sectionId, version: 1, approvedAt: stamp, approvedBy: "demo", rules: built.rules, groups: built.groups, ...(externals ? { externals } : {}) });
  const ruleSets: any[] = [];
  const memberOwn = new Map(own.map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId] as const));
  const planId = "tech-new";
  ruleSets.push(approved(planId, tech, buildReferenceRules(ref, memberOwn, idByCode, new Set()), courses.filter(c => c.AdSectionId !== tech).map(c => c.AdCourseId)));
  for (const [dept, id] of sid) {
    if (dept === "09") continue;
    const members = new Map(courses.filter(c => c.AdSectionId === id).map(c => [referenceCodeKey(c.CourseCode), c.AdCourseId] as const));
    ruleSets.push(approved(`ext-${id}`, id, { ...buildReferenceRules(ref, members, idByCode, new Set()), groups: [] }));
  }
  const passedCourseIds = PASSED.map(code => idByCode.get(code)!).filter(Boolean);
  const credit = new Map(courses.map(c => [c.AdCourseId, c.CourseCredit] as const));
  return {
    state: {
      terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: dayAdd(todayISO, 30), AdTermWeeks: 14, AdTermClosed: false,
        AdTermStudentPhases: { wishesOpen: dayAdd(todayISO, -3), wishesClose: dayAdd(todayISO, 12), rounds: [{ id: "r1", name: "مبكر", start: dayAdd(todayISO, 16), end: dayAdd(todayISO, 22) }, { id: "r2", name: "عادي", start: dayAdd(todayISO, 23), end: dayAdd(todayISO, 30) }] } }],
      colleges: [{ AdCollegeId: 1, AdCollegeCode: "01", AdCollegeName: "كلية التربية الأساسية" }], sections,
      instructors: [{ AdInstructorId: 1, AdInstructorName: "د. أحمد", AdInstructorCivil: "", AdInstructorMobile: "" }],
      courses, schedules,
      curriculumPlans: [{ id: planId, AdCollegeId: 1, AdSectionId: tech, name: "خطة 2026/2027", status: "active", createdAt: "2026-02-01" }],
      curriculumPlanCourses: own.map(c => ({ id: `l${c.AdCourseId}`, planId, AdCollegeId: 1, AdSectionId: tech, AdCourseId: c.AdCourseId, createdAt: "2026-01-01" })),
      curriculumRuleSets: ruleSets,
    } as any,
    profile: { AdCollegeId: 1, AdSectionId: tech, curriculumPlanId: planId, passedCourseIds, passedUnits: unitsOf(passedCourseIds, credit) },
  };
}

export interface ShowcaseDeps {
  identityKey: () => Promise<Buffer>;
  sealIdentity: (value: string) => Promise<string>;
  isProduction: () => boolean;
}

export function registerStudentShowcase(app: Express, deps: ShowcaseDeps): void {
  const live: Array<{ id: string; at: number }> = [];
  const prune = () => {
    const now = Date.now();
    while (live.length && (live[0].at + TTL_MS <= now || live.length >= MAX_SANDBOXES)) Repository.dropDemoSandbox(live.shift()!.id);
  };
  const secure = deps.isProduction();
  const cookie = (id: string, maxAge: number) => `${SHOWCASE_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const limit = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: "طلباتٌ كثيرة لفتح التجربة. انتظر دقائق ثم أعد المحاولة." });

  /* الصندوقُ يحكم كلَّ طلبٍ لمساري يحمل كوكيَه: داخله يُقرأ الطالبُ ويُكتب، وخارجه لا شيء. */
  app.use("/api/public/me", (req: Request, res: Response, next: NextFunction) => {
    const id = readCookie(req.headers.cookie, SHOWCASE_COOKIE);
    if (!id || !id.startsWith("demo_stu_")) { next(); return; }
    if (Repository.runDemoSandbox(id, next)) return;
    res.setHeader("Set-Cookie", [cookie("", 0), clearDoorCookie(secure)]);
    next();
  });
  /* الخروجُ من التجربة يمسح الكوكيَّين معاً (مسارُ الباب العاديّ يمسح كوكيَه وحده). */
  app.post("/api/public/me/exit", (req: Request, res: Response, next: NextFunction) => {
    if (!readCookie(req.headers.cookie, SHOWCASE_COOKIE)) { next(); return; }
    const id = readCookie(req.headers.cookie, SHOWCASE_COOKIE)!;
    if (id.startsWith("demo_stu_")) Repository.dropDemoSandbox(id);
    res.setHeader("Set-Cookie", [cookie("", 0), clearDoorCookie(secure)]);
    res.setHeader("Cache-Control", "no-store"); res.json({ ok: true });
  });

  app.get("/me/demo", limit, async (req: Request, res: Response) => {
    try {
      prune();
      const id = `demo_stu_${randomUUID()}`;
      const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
      const { state, profile } = buildShowcaseSeed(today);
      Repository.createShowcaseSandbox(id, TTL_MS, state);
      live.push({ id, at: Date.now() });
      const fingerprint = `demo-${randomUUID()}`;
      const iso = new Date().toISOString();
      const base = { createdAt: iso, lastSeenAt: iso };
      const codeHash = randomUUID();
      const nameCipher = await deps.sealIdentity(SHOWCASE_STUDENT_NAME), civilCipher = await deps.sealIdentity("000000000000");
      await Repository.withDemoSandbox(id, async () => {
        const sampleWishes = state.courses
          .filter(course => Number(course.AdSectionId) === profile.AdSectionId
            && OFFERED.has(String(course.CourseCode))
            && !profile.passedCourseIds.includes(Number(course.AdCourseId)))
          .slice(0, 8)
          .map(course => Number(course.AdCourseId));
        await Repository.updateStudentProfile(fingerprint, () => ({
          id: fingerprint, fingerprint, ...profile,
          /* رغباتٌ تجريبية كي تظهر تذكرةٌ حقيقية البنية بخططها الثلاث في «مساري»،
             من دون تشغيل الرادار أو إنشاء أي سجل خارج صندوق هذه الزيارة. */
          wishes: { termId: 1, targetUnits: 15, courseIds: sampleWishes, constraints: {}, updatedAt: iso },
          codeHash, codeSalt: "demo", nameCipher, civilCipher, updatedAt: iso, ...base, ...profileLifetime(base, new Date()),
        } as any));
        const term = (await Repository.getTerms() as any[]).find(row => Number(row.AdTermId) === 1);
        if (term) await runRegistrationSimulation(term, "عرض مساري التجريبي");
      });
      const token = signDoorSession(await deps.identityKey(), { fingerprint, exp: Date.now() + TTL_MS, cv: codeVersion(codeHash) });
      res.setHeader("Set-Cookie", [cookie(id, TTL_MS / 1000), doorCookie(token, { remember: true, maxAgeSeconds: TTL_MS / 1000, secure })]);
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, "/me?track=girls#plan");
    } catch (error) {
      console.error("[student-showcase]", error instanceof Error ? error.message : error);
      res.status(500).type("text/plain; charset=utf-8").send("تعذّر فتح التجربة الآن. أعد المحاولة بعد قليل.");
    }
  });
}
