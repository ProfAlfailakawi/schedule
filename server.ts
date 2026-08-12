import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { configureRuntimeEnvironment } from "./src/server/runtimeEnv";
import { randomBytes } from "crypto";
import zlib from "zlib";
import { initDatabase, Repository } from "./src/db/repository";
import { validateCivilId } from "./src/utils/civilId";
import { activeDays, analyzeSchedule, autoScheduleProposal, compareTerms, conflictSolutions, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "./src/utils/scheduleIntelligence";
import { buildScheduleGenome, buildWarRoom, evaluateScheduleConstraints, forecastScheduleMove, runScheduleAutopilot } from "./src/utils/scheduleInnovation";
import { buildConflictTopology, buildDecisionMemoryInsight, buildFairnessEngine, buildFragilityMap, buildOneMinuteBrief, buildRoomResilience, buildScheduleHealth2, buildSchedulePulse, createEmergencyPlans, explainScheduleDecision } from "./src/utils/livingSchedule";
import type { FSchedule, ScheduleShareLink } from "./src/types";
import { DAY_FLAGS, DAY_LABELS, parseNaturalQuery } from "./src/utils/naturalQuery";

// Resolve environment/private paths before database initialization.
configureRuntimeEnvironment();

let globalDbError: Error | null = null;

const app = express();
const PORT = process.env.APPLET_ID ? 3000 : Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use((req, res, next) => {
  if (globalDbError && req.path.startsWith("/api/")) {
    res.status(503).json({ error: "تعذر الاتصال بقاعدة البيانات. يرجى التأكد من إضافة مفاتيح Firestore في إعدادات النشر السحابية. " + globalDbError.message });
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "1mb" }));

// Text responses are compressed in-process so a bare Node deployment behaves
// like one sitting behind a compressing proxy. Binary and already-encoded
// bodies pass through untouched.
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml)|image\/svg)/i;
app.use((req, res, next) => {
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) { next(); return; }
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let gzip: zlib.Gzip | null = null;

  const start = () => {
    if (gzip !== null) return true;
    if (res.getHeader("Content-Encoding")) return false;
    const type = String(res.getHeader("Content-Type") || "");
    if (!COMPRESSIBLE.test(type)) return false;
    res.removeHeader("Content-Length");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    gzip = zlib.createGzip({ level: 6 });
    gzip.on("data", chunk => originalWrite(chunk));
    gzip.on("end", () => originalEnd());
    return true;
  };

  res.write = ((chunk: any, ...rest: any[]) => {
    if (!start() || !gzip) return originalWrite(chunk, ...rest);
    return gzip.write(chunk);
  }) as typeof res.write;

  res.end = ((chunk?: any, ...rest: any[]) => {
    if (!start() || !gzip) return originalEnd(chunk, ...rest);
    if (chunk) gzip.write(chunk);
    gzip.end();
    return res;
  }) as typeof res.end;

  next();
});



// CSRF hardening without changing the legacy UI: reject cross-site state-changing API requests.
// SameSite=Lax cookies provide a second browser-level layer.
app.use((req, res, next) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!mutating || !req.path.startsWith("/api/")) { next(); return; }

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    res.status(403).json({ error: "الطلب غير مسموح" });
    return;
  }

  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "الطلب غير مسموح" });
        return;
      }
    } catch {
      res.status(403).json({ error: "الطلب غير مسموح" });
      return;
    }
  }
  next();
});

// Helper to parse cookies
function getCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach(cookie => {
    const parts = cookie.split("=");
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join("="));
    }
  });
  return list;
}

// Rate limiting for login (simple in-memory)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.count >= 5 && now - attempt.lastAttempt < 60000) {
      res.status(429).json({ error: "محاولات تسجيل دخول كثيرة جداً. يرجى المحاولة بعد دقيقة." });
      return;
    }
    if (now - attempt.lastAttempt > 60000) {
      loginAttempts.set(ip, { count: 1, lastAttempt: now });
    } else {
      attempt.count += 1;
      attempt.lastAttempt = now;
    }
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  }
  next();
}

const SERVER_IDLE_SESSION_MS = 15 * 60 * 1000;

// Middleware to load session user
interface AuthenticatedRequest extends Request {
  userId?: number;
  user?: any;
  scopes?: { AdCollegeId: number; AdSectionId: number }[];
}

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookies = getCookies(req);
  const sessionId = cookies["session_id"];
  if (sessionId) {
    const sess = await Repository.getSession(sessionId);
    if (sess) {
      req.userId = sess.userId;
      const user = await Repository.getUserById(sess.userId);
      if (user && user.IsActive && !user.IsLocked && !user.IsDeleted) {
        req.user = user;
        req.scopes = await Repository.getUserAssigns(user.SystemUserId);
        if (sess.expiresAt - Date.now() < 10 * 60 * 1000)
          await Repository.refreshSession(sessionId, SERVER_IDLE_SESSION_MS);
        next();
        return;
      }
      await Repository.deleteSession(sessionId);
    }
  }
  next();
}

app.use(authMiddleware as express.RequestHandler);

// Additive audit trail for successful state-changing API calls. No request body is stored,
// so passwords and other sensitive values never enter the operational history.
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const skip = req.path.startsWith("/auth/") || req.path.endsWith("/check-conflicts");
  if (!mutating || skip) { next(); return; }
  const startedUser = req.user ? { id: Number(req.user.SystemUserId), name: String(req.user.Name || req.user.SystemUserLogin || "") } : null;
  res.on("finish", () => {
    if (!startedUser || res.statusCode < 200 || res.statusCode >= 400) return;
    const pieces = req.path.split("/").filter(Boolean);
    const entity = pieces[0] || "system";
    const entityId = pieces.length > 1 ? pieces[pieces.length - 1] : undefined;
    const action = req.path.includes("/safety-net/") && req.path.endsWith("/undo")
      ? "تراجع"
      : req.path.includes("/versions/") && req.path.endsWith("/restore")
        ? "استرجاع"
        : req.path.includes("/drafts/") && req.path.endsWith("/publish")
          ? "نشر"
          : req.path.includes("/copy")
            ? "نسخ"
            : req.method === "POST"
              ? "إضافة"
              : req.method === "DELETE"
                ? "حذف"
                : "تعديل";
    void Repository.createAuditLog({
      SystemUserId: startedUser.id, userName: startedUser.name, method: req.method, path: req.originalUrl,
      action, entity, entityId, status: res.statusCode
    }).catch(error => console.error("Audit log write failed:", error));
  });
  next();
});

// Require authenticated user
function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" });
    return;
  }
  next();
}

// Screens that are intentionally reserved for the main administrator.
// The department scheduler keeps the operational schedule/search/report tools only.
const powerOnlyFormIds = new Set([2, 3, 4, 5, 6, 11, 12, 15]);
function isPowerUser(req: AuthenticatedRequest): boolean {
  return Boolean(req.user && (req.user.IsAdminUser || req.user.SystemUserId === 1));
}
function requirePowerAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
  if (!isPowerUser(req)) { res.status(403).json({ error: "هذه الأداة مخصصة لإدارة النظام الرئيسية" }); return; }
  next();
}

// Require Form permission
function requirePermission(formNameId: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" });
      return;
    }
    // Keep the single department scheduler inside the operational workspace even if
    // an old FormSecurity record accidentally grants a legacy administrative screen.
    if (powerOnlyFormIds.has(formNameId) && !isPowerUser(req)) {
      res.status(403).json({ error: "هذه الشاشة مخصصة لإدارة النظام الرئيسية" });
      return;
    }
    // Legacy navigation is driven by FormSecurity even when IsAdminUser=true.
    const perms = await Repository.getSecurityByUser(req.user.SystemUserId);
    const hasPerm = perms.some(p => p.FormNameId === formNameId);
    if (!hasPerm) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" });
      return;
    }
    next();
  };
}

function requireAnyPermission(formNameIds: number[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" });
      return;
    }
    if (formNameIds.every(id => powerOnlyFormIds.has(id)) && !isPowerUser(req)) {
      res.status(403).json({ error: "هذه الشاشة مخصصة لإدارة النظام الرئيسية" });
      return;
    }
    const perms = await Repository.getSecurityByUser(req.user.SystemUserId);
    if (!perms.some(p => formNameIds.includes(p.FormNameId))) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" });
      return;
    }
    next();
  };
}

// Check if section/college is in user's academic scopes
function isScopeAllowed(req: AuthenticatedRequest, collegeId: number, sectionId: number): boolean {
  if (!req.user) return false;
  if (req.user.IsAdminUser) return true;
  if (!req.scopes) return false;
  // If sectionId is 0, we check if user has access to ANY section in this college
  if (sectionId === 0) {
    return req.scopes.some(s => s.AdCollegeId === collegeId);
  }
  return req.scopes.some(s => s.AdCollegeId === collegeId && s.AdSectionId === sectionId);
}

// Filter arrays based on allowed user scopes
function filterByScope<T extends { AdCollegeId: number; AdSectionId: number }>(req: AuthenticatedRequest, list: T[]): T[] {
  if (!req.user) return [];
  if (req.user.IsAdminUser) return list;
  if (!req.scopes) return [];
  return list.filter(item =>
    req.scopes!.some(s => s.AdCollegeId === item.AdCollegeId && s.AdSectionId === item.AdSectionId)
  );
}

// Legacy FSchedule.fdetail stores weekday numbers, not display names:
// 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday.
function legacyFDetail(days: { fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown }): string {
  return [
    days.fsunday && "1",
    days.fmonday && "2",
    days.ftuesday && "3",
    days.fwednesday && "4",
    days.fthursday && "5"
  ].filter(Boolean).join(",");
}

function safeSystemUser(user: any) {
  const { SystemUserPass: _passwordHash, SystemUserPassVault: _passwordVault, ...safe } = user || {};
  return safe;
}


async function captureScopeVersion(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, label: string, source: "manual"|"draft"|"publish"|"undo"|"copy"|"import" = "manual") {
  if (!req.user) return undefined;
  const rows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
  return Repository.createScheduleVersion({
    SystemUserId: Number(req.user.SystemUserId), userName: String(req.user.Name || req.user.SystemUserLogin || ""),
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, label, source, rows
  });
}

function safeDraftRows(input: unknown, collegeId: number, sectionId: number, termId: number): any[] {
  if (!Array.isArray(input)) return [];
  if (input.length > 450) throw new Error("المسودة أكبر من الحد الآمن المسموح");
  return input.map((raw: any, index: number) => ({
    id: Number.isInteger(Number(raw?.id)) ? Number(raw.id) : -(index + 1),
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    AdCourseId: Number(raw?.AdCourseId || 0), AdCourseName: String(raw?.AdCourseName || ""), SCode: String(raw?.SCode || ""),
    AdInstructorId: Number(raw?.AdInstructorId || 0),
    fsunday: Boolean(raw?.fsunday), fmonday: Boolean(raw?.fmonday), ftuesday: Boolean(raw?.ftuesday), fwednesday: Boolean(raw?.fwednesday), fthursday: Boolean(raw?.fthursday),
    fstarttime: String(raw?.fstarttime || ""), fendtime: String(raw?.fendtime || ""),
    AdRoomCode: String(raw?.AdRoomCode || ""), AdRoomHall: String(raw?.AdRoomHall || ""),
    fdetail: legacyFDetail(raw || {})
  }));
}

async function validateSmartRows(rows: any[], collegeId: number, sectionId: number) {
  const termId = Number(rows[0]?.AdTermId || 0);
  const [courses, instructors, currentSchedules] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(), Repository.getSchedulesByScope({ termId })
  ]);
  const courseById = new Map(courses.map(course => [course.AdCourseId, course]));
  const instructorIds = new Set(instructors.map(instructor => instructor.AdInstructorId));
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const course = courseById.get(Number(row.AdCourseId));
    if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) errors.push(`السطر ${index + 1}: المقرر غير صالح للقسم المحدد`);
    if (!instructorIds.has(Number(row.AdInstructorId))) errors.push(`السطر ${index + 1}: أستاذ المقرر غير صالح`);
    if (!/^\d+$/.test(String(row.SCode || ""))) errors.push(`السطر ${index + 1}: رقم الشعبة يجب أن يكون بالأرقام الإنجليزية`);
    if (!row.AdRoomCode || !row.AdRoomHall) errors.push(`السطر ${index + 1}: بيانات القاعة ناقصة`);
    if (timeToMinutes(row.fendtime) <= timeToMinutes(row.fstarttime)) errors.push(`السطر ${index + 1}: وقت النهاية يجب أن يكون بعد البداية`);
    if (activeDays(row).length === 0) errors.push(`السطر ${index + 1}: لم يتم تحديد يوم للمحاضرة`);
    if (course) row.AdCourseName = course.CourseName;
  });
  if (!errors.length && rows.length) {
    const external = currentSchedules.filter(item => !(item.AdCollegeId === collegeId && item.AdSectionId === sectionId));
    const universe = [...external, ...rows];
    const conflicts = findConflicts(rows as any, universe as any).filter((item:any) => item.severity === "high" || item.type === "duplicate");
    conflicts.slice(0, 20).forEach((item:any) => errors.push(item.message || item.detail || "يوجد تعارض يمنع الاعتماد"));
  }
  return [...new Set(errors)].slice(0, 30);
}

function smartContextFrom(req: AuthenticatedRequest) {
  const source = req.method === "GET" ? req.query : req.body || {};
  return { collegeId: Number(source.collegeId || source.AdCollegeId || 0), sectionId: Number(source.sectionId || source.AdSectionId || 0), termId: Number(source.termId || source.AdTermId || 0) };
}


async function resolveSmartContext(req: AuthenticatedRequest) {
  const requested = smartContextFrom(req);
  const [terms, sections] = await Promise.all([Repository.getTerms(), Repository.getSections()]);
  const termId = requested.termId || terms.reduce((max,row)=>Math.max(max,Number(row.AdTermId)||0),0);
  let sectionId = requested.sectionId;
  if (!sectionId) {
    const schedules = await Repository.getSchedulesByScope({ termId });
    const allowedSectionIds = req.user?.IsAdminUser ? new Set(sections.map(row=>row.AdSectionId)) : new Set((req.scopes||[]).map(row=>Number(row.AdSectionId)));
    const counts = new Map<number,number>();
    schedules.filter(row=>allowedSectionIds.has(row.AdSectionId)).forEach(row=>counts.set(row.AdSectionId,(counts.get(row.AdSectionId)||0)+1));
    sectionId = [...allowedSectionIds].sort((a,b)=>(counts.get(b)||0)-(counts.get(a)||0))[0] || 0;
  }
  const section = sections.find(row=>row.AdSectionId===sectionId);
  const collegeId = requested.collegeId || Number(section?.AdCollegeId || 0);
  return { collegeId, sectionId, termId, section };
}

async function scopedScheduleUniverse(collegeId: number, sectionId: number, termId: number) {
  const [rows, universe] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId })
  ]);
  return { rows, universe };
}


// --- AUTH API ---

app.post("/api/auth/login", rateLimitLogin, async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "الرجاء إدخال اسم المستخدم وكلمة السر" });
    return;
  }

  const user = await Repository.getUserByLogin(username);
  if (!user) {
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  if (!Repository.verifyPassword(password, user.SystemUserPass)) {
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  if (!user.IsActive) {
    res.status(403).json({ error: "هذا الحساب غير فعال" });
    return;
  }

  if (user.IsLocked) {
    res.status(403).json({ error: "هذا الحساب مقفل" });
    return;
  }

  if (user.IsDeleted) {
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }

  // Generate Session ID
  const sessionId = `sess_${randomBytes(32).toString("hex")}`;
  await Repository.createSession(sessionId, user.SystemUserId, SERVER_IDLE_SESSION_MS);

  // Set Cookie
  res.setHeader(
    "Set-Cookie",
    `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  loginAttempts.delete(req.ip || "unknown");
  const safeUser = safeSystemUser(user);
  const userPerms = await Repository.getSecurityByUser(user.SystemUserId);
  const permissions = userPerms.map(p => p.FormNameId);
  const scopes = await Repository.getUserAssigns(user.SystemUserId);

  res.json({ user: safeUser, permissions, scopes });
});

app.post("/api/auth/logout", async (req: AuthenticatedRequest, res: Response) => {
  const cookies = getCookies(req);
  const sessionId = cookies["session_id"];
  if (sessionId) {
    await Repository.deleteSession(sessionId);
  }
  res.setHeader("Set-Cookie", `session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ success: true });
});

app.get("/api/auth/me", async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  const safeUser = safeSystemUser(req.user);
  const userPerms = await Repository.getSecurityByUser(req.user.SystemUserId);
  const permissions = userPerms.map(p => p.FormNameId);
  const scopes = req.scopes || [];
  res.json({ user: safeUser, permissions, scopes });
});

// Activity heartbeat: the server session still expires after 15 minutes of real
// inactivity, while active users can keep the session alive without a fixed
// browser-cookie deadline logging them out mid-work.
app.post("/api/auth/heartbeat", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, idleTimeoutMs: SERVER_IDLE_SESSION_MS });
});

app.get("/api/dashboard", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  // Legacy Home/Index parity is intentionally preserved here, including the historical
  // Sunday/weekend day-name quirk and the difference between the displayed total and table rows.
  const terms = await Repository.getTerms();
  const latestTermId = terms.reduce((max, term) => Math.max(max, Number(term.AdTermId) || 0), 0);
  const latestTerm = terms.find(term => term.AdTermId === latestTermId);
  const [allCourses, latestTermSchedules, allInstructors, allSections, allColleges, scheduleCount] = await Promise.all([
    Repository.getCourses(), Repository.getSchedulesByScope({ termId: latestTermId }), Repository.getInstructors(), Repository.getSections(), Repository.getColleges(), Repository.countSchedules()
  ]);
  const assignedSectionIds = new Set((req.scopes || []).map(scope => Number(scope.AdSectionId)));

  const latestScopedSchedules = latestTermSchedules.filter(row => assignedSectionIds.has(Number(row.AdSectionId)));
  const scopedCourses = allCourses.filter(course => assignedSectionIds.has(Number(course.AdSectionId)));

  // ASP.NET DayOfWeek returned 0 for Sunday, but the legacy view checked d == 7.
  // Therefore Sunday, Friday and Saturday retain Sunday's rows while dname stays blank.
  const weekday = new Date().getDay();
  let dayKey: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday" = "fsunday";
  let dayName = "";
  if (weekday === 1) { dayKey = "fmonday"; dayName = "الاثنين"; }
  if (weekday === 2) { dayKey = "ftuesday"; dayName = "الثلاثاء"; }
  if (weekday === 3) { dayKey = "fwednesday"; dayName = "الأربعاء"; }
  if (weekday === 4) { dayKey = "fthursday"; dayName = "الخميس"; }

  const daySchedules = latestTermSchedules
    .filter(row => Boolean(row[dayKey]))
    .sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)));

  // The old table always used AdCollegeUserAssign section IDs, even for IsAdminUser users.
  const visibleTableRows = daySchedules.filter(row => assignedSectionIds.has(Number(row.AdSectionId)));
  const instructorIds = new Set(latestScopedSchedules.map(row => row.AdInstructorId));
  const coursesById = new Map(allCourses.map(course => [course.AdCourseId, course]));
  const instructorsById = new Map(allInstructors.map(instructor => [instructor.AdInstructorId, instructor]));
  const sectionsById = new Map(allSections.map(section => [section.AdSectionId, section]));
  const collegesById = new Map(allColleges.map(college => [college.AdCollegeId, college]));

  const metrics = req.user.IsAdminUser ? {
    courses: allCourses.length,
    schedules: scheduleCount,
    terms: terms.length,
    instructors: allInstructors.length
  } : {
    courses: scopedCourses.length,
    schedules: latestScopedSchedules.length,
    terms: terms.length,
    instructors: instructorIds.size
  };

  // Modern workspace analytics are additive: legacy dashboard fields above remain untouched.
  const linkedInstructorId = Number(req.user.AdInstructorId || 0);
  const personalRows = linkedInstructorId ? latestTermSchedules.filter(row => row.AdInstructorId === linkedInstructorId) : [];
  const workspaceRows = req.user.IsAdminUser ? latestTermSchedules : (linkedInstructorId ? personalRows : latestScopedSchedules);
  const dayDefs = [
    ["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]
  ] as const;
  const roomKey = (row: any) => `${String(row.AdRoomCode || "").trim()} / ${String(row.AdRoomHall || "").trim()}`;
  const uniqueRooms = Array.from(new Set(workspaceRows.map(roomKey).filter(key => key !== " / ")));
  const minute = (value: string) => { const [h,m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const slotRooms = new Map<string, Set<string>>();
  const hourLoad = new Map<string, number>();
  const roomLoad = new Map<string, number>();
  for (const row of workspaceRows) {
    const start = minute(row.fstarttime), end = minute(row.fendtime);
    const hour = String(row.fstarttime || "").slice(0,2) || "--";
    hourLoad.set(hour, (hourLoad.get(hour) || 0) + 1);
    const rKey = roomKey(row);
    roomLoad.set(rKey, (roomLoad.get(rKey) || 0) + 1);
    for (const [key] of dayDefs) if (row[key]) {
      for (let slot = Math.floor(start / 30); slot < Math.ceil(end / 30); slot++) {
        const bucket = `${key}:${slot}`;
        if (!slotRooms.has(bucket)) slotRooms.set(bucket, new Set());
        slotRooms.get(bucket)!.add(rKey);
      }
    }
  }
  const peakOccupiedRooms = Math.max(0, ...Array.from(slotRooms.values()).map(set => set.size));
  const roomOccupancyPeak = uniqueRooms.length ? Math.round((peakOccupiedRooms / uniqueRooms.length) * 100) : 0;
  const weekdayLoad = dayDefs.map(([key,label]) => ({ key, label, count: workspaceRows.filter(row => Boolean(row[key])).length }));
  const busiestHours = Array.from(hourLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([hour,count])=>({ hour: `${hour}:00`, count }));
  const busiestRooms = Array.from(roomLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([room,count])=>({ room, count }));
  const personalToday = personalRows.filter(row => Boolean(row[dayKey])).sort((a,b)=>String(a.fstarttime).localeCompare(String(b.fstarttime)));

  res.json({
    metrics,
    latestTermId,
    latestTermName: latestTerm?.AdTermName || "",
    dayName,
    // Legacy CountSchedule: admin = all rows for the selected day; non-admin = all scoped rows in latest term.
    dashboardTotal: req.user.IsAdminUser ? daySchedules.length : latestScopedSchedules.length,
    today: visibleTableRows.map(row => ({
      id: row.id,
      instructorName: instructorsById.get(row.AdInstructorId)?.AdInstructorName || "",
      courseCode: coursesById.get(row.AdCourseId)?.CourseCode || "",
      courseName: coursesById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "",
      startTime: row.fstarttime,
      endTime: row.fendtime,
      roomCode: row.AdRoomCode,
      roomHall: row.AdRoomHall
    })),
    workspace: {
      mode: req.user.IsAdminUser ? "admin" : (linkedInstructorId ? "personal" : "scope"),
      activeSchedules: workspaceRows.length,
      uniqueRooms: uniqueRooms.length,
      uniqueInstructors: new Set(workspaceRows.map(row => row.AdInstructorId)).size,
      roomOccupancyPeak,
      peakOccupiedRooms,
      weekdayLoad,
      busiestHours,
      busiestRooms,
      scopeCount: (req.scopes || []).length,
      linkedInstructorName: linkedInstructorId ? (instructorsById.get(linkedInstructorId)?.AdInstructorName || "") : "",
      personalToday: personalToday.map(row => ({
        id: row.id,
        courseCode: coursesById.get(row.AdCourseId)?.CourseCode || "",
        courseName: coursesById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "",
        startTime: row.fstarttime,
        endTime: row.fendtime,
        days: legacyFDetail(row),
        roomCode: row.AdRoomCode,
        roomHall: row.AdRoomHall,
        sectionName: sectionsById.get(row.AdSectionId)?.AdSectionName || "",
        collegeName: collegesById.get(row.AdCollegeId)?.AdCollegeName || ""
      }))
    }
  });
});

// One search entry point for the entire academic workspace. It respects the current user's
// academic scope and only returns entities related to schedules visible to that user.
app.get("/api/search", requireAnyPermission([7, 8, 9, 10, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || "").trim().toLocaleLowerCase("ar");
  if (q.length < 2) { res.json({ schedules: [], instructors: [], courses: [], rooms: [] }); return; }
  const terms = await Repository.getTerms();
  const latestTermId = terms.reduce((max, term) => Math.max(max, Number(term.AdTermId) || 0), 0);
  const scheduleRead = req.user.IsAdminUser
    ? Repository.getSchedulesByScope({ termId: latestTermId })
    : Promise.all([...new Set((req.scopes || []).map(scope => Number(scope.AdSectionId)).filter(Boolean))].map(sectionId => Repository.getSchedulesByScope({ sectionId, termId: latestTermId }))).then(groups => groups.flat());
  const [allSchedules, instructors, courses, sections, colleges, security] = await Promise.all([
    scheduleRead, Repository.getInstructors(), Repository.getCourses(), Repository.getSections(), Repository.getColleges(), Repository.getSecurityByUser(req.user!.SystemUserId)
  ]);
  const formIds = new Set(security.map(item => item.FormNameId));
  const canSchedule = formIds.has(7);
  const canInstructor = formIds.has(8);
  const canRoom = formIds.has(9) || formIds.has(16);
  const canTime = formIds.has(10) || formIds.has(16);
  const canAdvanced = formIds.has(17);
  const schedules = filterByScope(req, allSchedules);
  const instructorById = new Map(instructors.map(item => [item.AdInstructorId, item]));
  const courseById = new Map(courses.map(item => [item.AdCourseId, item]));
  const sectionById = new Map(sections.map(item => [item.AdSectionId, item]));
  const collegeById = new Map(colleges.map(item => [item.AdCollegeId, item]));
  const matches = (value: unknown) => String(value ?? "").toLocaleLowerCase("ar").includes(q);
  const matchedSchedules = schedules.filter(row => {
    const ins = instructorById.get(row.AdInstructorId), course = courseById.get(row.AdCourseId);
    return [ins?.AdInstructorName, ins?.AdInstructorCivil, course?.CourseName, course?.CourseCode, row.SCode, row.AdRoomCode, row.AdRoomHall, sectionById.get(row.AdSectionId)?.AdSectionName, collegeById.get(row.AdCollegeId)?.AdCollegeName].some(matches);
  });
  const visibleInstructorIds = new Set(schedules.map(row => row.AdInstructorId));
  const visibleCourseIds = new Set(schedules.map(row => row.AdCourseId));
  const scheduleResults = (canSchedule || canAdvanced || canTime) ? matchedSchedules.slice(0, 12).map(row => ({
    id: row.id, kind: "schedule", title: courseById.get(row.AdCourseId)?.CourseName || row.AdCourseName || "مقرر دراسي",
    subtitle: `${canInstructor || canSchedule || canAdvanced ? instructorById.get(row.AdInstructorId)?.AdInstructorName || "" : ""}${canRoom || canSchedule || canAdvanced ? ` — ${row.AdRoomCode}/${row.AdRoomHall}` : ""} — ${row.fstarttime}-${row.fendtime}`,
    meta: `${courseById.get(row.AdCourseId)?.CourseCode || ""} / شعبة ${row.SCode}`
  })) : [];
  const instructorResults = (canInstructor || canSchedule || canAdvanced) ? instructors.filter(item => visibleInstructorIds.has(item.AdInstructorId) && (matches(item.AdInstructorName) || matches(item.AdInstructorCivil))).slice(0, 8).map(item => ({ id: item.AdInstructorId, kind: "instructor", title: item.AdInstructorName, subtitle: item.AdInstructorCivil, meta: "أستاذ مقرر" })) : [];
  const courseResults = (canSchedule || canAdvanced) ? courses.filter(item => visibleCourseIds.has(item.AdCourseId) && (matches(item.CourseName) || matches(item.CourseCode))).slice(0, 8).map(item => ({ id: item.AdCourseId, kind: "course", title: item.CourseName, subtitle: item.CourseCode, meta: sectionById.get(item.AdSectionId)?.AdSectionName || "" })) : [];
  const roomMap = new Map<string, {building:string;hall:string;count:number}>();
  schedules.forEach(row => { const key=`${row.AdRoomCode}|${row.AdRoomHall}`; const prev=roomMap.get(key); roomMap.set(key,{building:row.AdRoomCode,hall:row.AdRoomHall,count:(prev?.count||0)+1}); });
  const roomResults = (canRoom || canSchedule || canAdvanced) ? Array.from(roomMap.values()).filter(item => matches(item.building) || matches(item.hall)).slice(0, 8).map((item,index) => ({ id: `${item.building}|${item.hall}`, kind: "room", title: `مبنى ${item.building} — قاعة ${item.hall}`, subtitle: `${item.count} موعد في الجداول`, meta: "قاعة", building:item.building, hall:item.hall })) : [];
  res.json({ schedules: scheduleResults, instructors: instructorResults, courses: courseResults, rooms: roomResults });
});

// --- COLLEGE API ---

app.get("/api/colleges", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const colleges = await Repository.getColleges();
  if (req.user.IsAdminUser) {
    res.json(colleges);
    return;
  }
  // Filter colleges based on user sections scope
  const allowedCollegeIds = new Set(req.scopes?.map(s => s.AdCollegeId) || []);
  const filtered = colleges.filter(c => allowedCollegeIds.has(c.AdCollegeId));
  res.json(filtered);
});

app.post("/api/colleges", requirePermission(2), async (req: Request, res: Response) => {
  const { AdCollegeCode, AdCollegeName } = req.body;
  if (!AdCollegeCode || !AdCollegeName) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  const newC = await Repository.createCollege(AdCollegeCode, AdCollegeName);
  res.status(201).json(newC); // using created code helper
});

app.put("/api/colleges/:id", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (!req.user.IsAdminUser && !isScopeAllowed(req, id, 0)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const { AdCollegeCode, AdCollegeName } = req.body;
  if (!AdCollegeCode || !AdCollegeName) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  try {
    const updated = await Repository.updateCollege(id, AdCollegeCode, AdCollegeName);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/colleges/:id", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (!req.user.IsAdminUser && !isScopeAllowed(req, id, 0)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  // Legacy SQL has AdSection -> AdCollege FK. The old SaveChanges fails while sections exist.
  if ((await Repository.getSectionsByCollege(id)).length > 0) {
    res.status(409).json({ error: "لا يمكن حذف الكلية لوجود أقسام علمية مرتبطة بها" });
    return;
  }
  await Repository.deleteCollege(id);
  res.json({ success: true });
});

const collegeMobilityHistoryCache=new Map<number,{expiresAt:number;history:any[]}>();
app.get("/api/colleges/:id/mobility", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.params.id||0);if(!collegeId){res.status(400).json({error:"الكلية غير صالحة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,collegeId,0)){res.status(403).json({error:"خارج صلاحيات الكلية"});return;}
  const [college,profile]=await Promise.all([Repository.getCollegeById(collegeId),Repository.getCampusMobilityProfile(collegeId)]);
  if(!college){res.status(404).json({error:"الكلية غير موجودة"});return;}
  const cachedHistory=collegeMobilityHistoryCache.get(collegeId);
  const history=cachedHistory&&cachedHistory.expiresAt>Date.now()?cachedHistory.history:await Repository.getSchedulesByScope({collegeId});
  if(!cachedHistory||cachedHistory.expiresAt<=Date.now())collegeMobilityHistoryCache.set(collegeId,{history,expiresAt:Date.now()+10*60*1000});
  const usage=new Map<string,number>();history.forEach((row:any)=>{const b=normalizedBuilding(row.AdRoomCode);if(b)usage.set(b,(usage.get(b)||0)+1);});
  const buildings=[...usage.entries()].sort((a,b)=>b[1]-a[1]).map(([code,count])=>({code,count}));
  res.json({collegeId,collegeName:college.AdCollegeName,profile,buildings,source:"historical-room-usage"});
});

app.put("/api/colleges/:id/mobility", requirePermission(2), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.params.id||0);if(!collegeId){res.status(400).json({error:"الكلية غير صالحة"});return;}
  if(!req.user.IsAdminUser&&!isScopeAllowed(req,collegeId,0)){res.status(403).json({error:"خارج صلاحيات الكلية"});return;}
  const college=await Repository.getCollegeById(collegeId);if(!college){res.status(404).json({error:"الكلية غير موجودة"});return;}
  const rawPairs=Array.isArray(req.body?.pairs)?req.body.pairs:[];const seen=new Set<string>(),pairs:any[]=[];
  for(const raw of rawPairs){const fromBuilding=normalizedBuilding(raw?.fromBuilding).slice(0,40),toBuilding=normalizedBuilding(raw?.toBuilding).slice(0,40),minutes=Math.max(1,Math.min(120,Number(raw?.minutes)||0));if(!fromBuilding||!toBuilding||fromBuilding.toLocaleLowerCase()===toBuilding.toLocaleLowerCase())continue;const key=travelPairKey(fromBuilding,toBuilding);if(seen.has(key))continue;seen.add(key);pairs.push({fromBuilding,toBuilding,minutes});}
  const profile=await Repository.upsertCampusMobilityProfile({AdCollegeId:collegeId,defaultTravelMinutes:Math.max(1,Math.min(120,Number(req.body?.defaultTravelMinutes)||15)),sameBuildingMinutes:Math.max(0,Math.min(30,Number(req.body?.sameBuildingMinutes)||3)),pairs,updatedAt:new Date().toISOString(),updatedBy:req.user.Name});
  res.json(profile);
});

// --- SECTIONS API ---

app.get("/api/sections", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = req.query.collegeId ? parseInt(req.query.collegeId as string) : undefined;
  let sections = collegeId ? await Repository.getSectionsByCollege(collegeId) : await Repository.getSections();
  sections = filterByScope(req, sections);
  res.json(sections);
});

app.post("/api/sections", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const { AdCollegeId, AdSectionCode, AdSectionName } = req.body;
  if (!AdCollegeId || !AdSectionCode || !AdSectionName) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  const collegeId = parseInt(AdCollegeId);
  const college = await Repository.getCollegeById(collegeId);
  if (!college) { res.status(400).json({ error: "الكلية المختارة غير صالحة" }); return; }
  if (!isScopeAllowed(req, collegeId, 0) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const newSec = await Repository.createSection(collegeId, AdSectionCode, AdSectionName);
  res.status(201).json(newSec);
});

app.put("/api/sections/:id", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { AdCollegeId, AdSectionCode, AdSectionName } = req.body;
  if (!AdCollegeId || !AdSectionCode || !AdSectionName) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  const current = await Repository.getSectionById(id);
  if (!current) { res.status(404).json({ error: "القسم العلمي غير موجود" }); return; }
  const targetCollegeId = parseInt(AdCollegeId);
  const targetCollege = await Repository.getCollegeById(targetCollegeId);
  if (!targetCollege) { res.status(400).json({ error: "الكلية المختارة غير صالحة" }); return; }
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, current.AdCollegeId, current.AdSectionId) || !isScopeAllowed(req, targetCollegeId, 0))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  try {
    const updated = await Repository.updateSection(id, targetCollegeId, AdSectionCode, AdSectionName);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/sections/:id", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const section = await Repository.getSectionById(id);
  if (section && !isScopeAllowed(req, section.AdCollegeId, id) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  // Legacy SQL has AdCourse -> AdSection FK. Preserve the same delete constraint.
  if ((await Repository.getCoursesBySection(id)).length > 0) {
    res.status(409).json({ error: "لا يمكن حذف القسم العلمي لوجود مقررات دراسية مرتبطة به" });
    return;
  }
  await Repository.deleteSection(id);
  res.json({ success: true });
});

// --- TERMS API ---

app.get("/api/terms", requireAuth, async (req: Request, res: Response) => {
  const terms = await Repository.getTerms();
  res.json(terms);
});

app.post("/api/terms", requirePermission(5), async (req: Request, res: Response) => {
  const { AdTermName } = req.body;
  if (!AdTermName) {
    res.status(400).json({ error: "اسم الفصل الدراسي مطلوب" });
    return;
  }
  const newTerm = await Repository.createTerm(AdTermName);
  res.status(201).json(newTerm);
});

app.put("/api/terms/:id", requirePermission(5), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { AdTermName } = req.body;
  if (!AdTermName) {
    res.status(400).json({ error: "اسم الفصل الدراسي مطلوب" });
    return;
  }
  try {
    const updated = await Repository.updateTerm(id, AdTermName);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/terms/:id", requirePermission(5), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await Repository.deleteTerm(id);
  res.json({ success: true });
});

// --- INSTRUCTORS API ---

app.get("/api/instructors", requireAnyPermission([3, 7, 8, 9, 10, 14, 16, 17]), async (req: Request, res: Response) => {
  const instructors = await Repository.getInstructors();
  res.json(instructors);
});

app.post("/api/instructors", requirePermission(3), async (req: Request, res: Response) => {
  const { AdInstructorCivil, AdInstructorName, AdInstructorMobile } = req.body;
  if (!AdInstructorCivil || !String(AdInstructorName || "").trim()) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  // Validate Civil ID
  const valResult = validateCivilId(AdInstructorCivil);
  if (!valResult.isValid) {
    res.status(400).json({ error: valResult.message });
    return;
  }

  // Duplicate Check
  const exists = await Repository.getInstructorByCivil(AdInstructorCivil);
  if (exists) {
    res.status(400).json({ error: "تم التسجيل من قبل" });
    return;
  }

  const newIns = await Repository.createInstructor(AdInstructorCivil, AdInstructorName, AdInstructorMobile || "");
  res.status(201).json(newIns);
});

app.put("/api/instructors/:id", requirePermission(3), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { AdInstructorCivil, AdInstructorName, AdInstructorMobile } = req.body;
  if (!AdInstructorCivil || !String(AdInstructorName || "").trim()) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  const valResult = validateCivilId(AdInstructorCivil);
  if (!valResult.isValid) {
    res.status(400).json({ error: valResult.message });
    return;
  }

  const exists = await Repository.getInstructorByCivil(AdInstructorCivil);
  if (exists && exists.AdInstructorId !== id) {
    res.status(400).json({ error: "تم التسجيل من قبل" });
    return;
  }

  try {
    const updated = await Repository.updateInstructor(id, AdInstructorCivil, AdInstructorName, AdInstructorMobile || "");
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/instructors/:id", requirePermission(3), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await Repository.deleteInstructor(id);
  res.json({ success: true });
});

// --- COURSES API ---

app.get("/api/courses", requireAnyPermission([6, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = req.query.sectionId ? parseInt(req.query.sectionId as string) : undefined;
  let courses = sectionId ? await Repository.getCoursesBySection(sectionId) : await Repository.getCourses();
  courses = filterByScope(req, courses);
  res.json(courses);
});

app.post("/api/courses", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const { AdCollegeId, AdSectionId, CourseCode, CourseName, CourseCredit, CourseHours, MaxStudent } = req.body;

  if (!AdCollegeId || !AdSectionId || !CourseCode || !CourseName || !CourseCredit || !CourseHours) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  // Legacy only blocked non-English typing in the browser. The SQL column itself is text and
  // the real database contains historical course codes with tabs/whitespace, so the API must
  // preserve those values when an old record is edited. The modern UI still enforces English
  // numeric typing for newly-entered codes.

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId);
  const section = await Repository.getSectionById(sectionId);
  if (!section || section.AdCollegeId !== collegeId) {
    res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" });
    return;
  }
  if (!isScopeAllowed(req, collegeId, sectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }

  // Duplicate CourseCode check within section
  const sectionCourses = await Repository.getCoursesBySection(sectionId);
  const codeExists = sectionCourses.some(c => c.CourseCode === CourseCode);
  if (codeExists) {
    res.status(400).json({ error: "تم تسجيل رمز المقرر الدراسي هذا من قبل" });
    return;
  }

  const newC = await Repository.createCourse(
    parseInt(AdCollegeId),
    parseInt(AdSectionId),
    CourseCode,
    CourseName,
    parseInt(CourseCredit),
    parseFloat(String(CourseHours || 0)),
    parseInt(MaxStudent || 0)
  );
  res.status(201).json(newC);
});

app.put("/api/courses/:id", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { AdCollegeId, AdSectionId, CourseCode, CourseName, CourseCredit, CourseHours, MaxStudent } = req.body;

  if (!AdCollegeId || !AdSectionId || !CourseCode || !CourseName || !CourseCredit || !CourseHours) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  // Do not reject historical text/whitespace already present in CourseCode (legacy parity).

  const currentCourse = await Repository.getCourseById(id);
  if (!currentCourse) { res.status(404).json({ error: "المقرر الدراسي غير موجود" }); return; }
  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId);
  const targetSection = await Repository.getSectionById(sectionId);
  if (!targetSection || targetSection.AdCollegeId !== collegeId) {
    res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" });
    return;
  }
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, currentCourse.AdCollegeId, currentCourse.AdSectionId) || !isScopeAllowed(req, collegeId, sectionId))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }

  const sectionCourses = await Repository.getCoursesBySection(sectionId);
  const codeExists = sectionCourses.some(c => c.CourseCode === CourseCode && c.AdCourseId !== id);
  if (codeExists) {
    res.status(400).json({ error: "تم تسجيل رمز المقرر الدراسي هذا من قبل" });
    return;
  }

  try {
    const updated = await Repository.updateCourse(
      id,
      collegeId,
      sectionId,
      CourseCode,
      CourseName,
      parseInt(CourseCredit),
      parseFloat(String(CourseHours || 0)),
      parseInt(MaxStudent || 0)
    );
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/courses/:id", requirePermission(6), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const course = await Repository.getCourseById(id);
  if (course && !isScopeAllowed(req, course.AdCollegeId, course.AdSectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  // Legacy SQL has FSchedule -> AdCourse FK. Do not silently orphan schedule rows in Firestore.
  if (await Repository.hasSchedulesForCourse(id)) {
    res.status(409).json({ error: "لا يمكن حذف المقرر الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي" });
    return;
  }
  await Repository.deleteCourse(id);
  res.json({ success: true });
});

// --- SCHEDULES (FSchedule) API ---

const SCHEDULE_DAY_KEYS=["fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const;
const scheduleOverlap=(aStart:string,aEnd:string,bStart:string,bEnd:string)=>aStart<bEnd&&aEnd>bStart;
const roomAffinityCache=new Map<string,{expiresAt:number;history:any[]}>();
function schedulePayloadIssues(row:any){const issues:string[]=[];if(!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))issues.push("يجب اختيار يوم واحد على الأقل للمحاضرة");if(row?.fstarttime&&row?.fendtime&&timeToMinutes(String(row.fendtime))<=timeToMinutes(String(row.fstarttime)))issues.push("وقت النهاية يجب أن يكون بعد وقت البداية");return issues;}
async function roomScopeNotice(row:any){
  const roomCode=String(row?.AdRoomCode||"").trim(),roomHall=String(row?.AdRoomHall||"").trim();
  const collegeId=Number(row?.AdCollegeId||0),sectionId=Number(row?.AdSectionId||0);
  if(!roomCode||!roomHall||!collegeId||!sectionId)return null;
  const key=`${roomCode.toLocaleLowerCase()}|${roomHall.toLocaleLowerCase()}`;
  const cached=roomAffinityCache.get(key); let history:any[];
  if(cached&&cached.expiresAt>Date.now())history=cached.history;
  else{history=await Repository.getSchedulesByRoom(roomCode,roomHall);roomAffinityCache.set(key,{history,expiresAt:Date.now()+5*60*1000});}
  if(history.length<3)return null;
  const counts=new Map<string,{collegeId:number;sectionId:number;count:number}>();
  for(const item of history){const k=`${item.AdCollegeId}:${item.AdSectionId}`;const hit=counts.get(k)||{collegeId:Number(item.AdCollegeId),sectionId:Number(item.AdSectionId),count:0};hit.count++;counts.set(k,hit);}
  const ranked=[...counts.values()].sort((a,b)=>b.count-a.count),dominant=ranked[0];
  if(!dominant||dominant.sectionId===sectionId||dominant.count<3||dominant.count/history.length<0.55)return null;
  const current=ranked.find(x=>x.collegeId===collegeId&&x.sectionId===sectionId)?.count||0;
  if(current>=Math.max(2,Math.ceil(dominant.count*0.25)))return null;
  const [section,college]=await Promise.all([Repository.getSectionById(dominant.sectionId),Repository.getCollegeById(dominant.collegeId)]);
  const owner=[section?.AdSectionName,college?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر";
  return{type:"roomScope",severity:"warning",rowId:0,message:`تنبيه نطاق القاعة: ${roomCode}/${roomHall} مرتبطة تاريخياً بـ ${owner}`,detail:`استُخدمت القاعة في ${dominant.count} من ${history.length} موعداً مسجلاً لهذا النطاق التاريخي. يمكن المتابعة إذا كان الاختيار مقصوداً؛ هذا تنبيه تنظيمي وليس تعارضاً زمنياً.`};
}
function normalizedBuilding(value: unknown){return String(value||"").trim();}
function travelPairKey(a:string,b:string){const x=normalizedBuilding(a).toLocaleLowerCase(),y=normalizedBuilding(b).toLocaleLowerCase();return [x,y].sort().join("|");}
function travelMinutesFor(profile:any,fromBuilding:string,toBuilding:string){
  const from=normalizedBuilding(fromBuilding),to=normalizedBuilding(toBuilding);
  if(!from||!to)return 0;
  if(from.toLocaleLowerCase()===to.toLocaleLowerCase())return Math.max(0,Number(profile?.sameBuildingMinutes)||3);
  const pair=(profile?.pairs||[]).find((item:any)=>travelPairKey(item.fromBuilding,item.toBuilding)===travelPairKey(from,to));
  return Math.max(1,Math.min(120,Number(pair?.minutes)||Number(profile?.defaultTravelMinutes)||15));
}
function rowsOverlapOnDay(a:any,b:any,dayKey:string){return Boolean(a?.[dayKey]&&b?.[dayKey])&&scheduleOverlap(String(a.fstarttime||""),String(a.fendtime||""),String(b.fstarttime||""),String(b.fendtime||""));}
function spatialBurnoutAnalysis(scopeRows:any[],termRows:any[],profile:any,instructors:any[]=[]){
  const instructorName=new Map(instructors.map((i:any)=>[Number(i.AdInstructorId),i.AdInstructorName]));
  const risks:any[]=[];
  const days=[{key:"fsunday",label:"الأحد"},{key:"fmonday",label:"الاثنين"},{key:"ftuesday",label:"الثلاثاء"},{key:"fwednesday",label:"الأربعاء"},{key:"fthursday",label:"الخميس"}];
  const targetInstructorIds=new Set(scopeRows.map((r:any)=>Number(r.AdInstructorId)).filter(Boolean));
  for(const instructorId of targetInstructorIds){
    const own=termRows.filter((r:any)=>Number(r.AdInstructorId)===instructorId);
    for(const day of days){
      const ordered=own.filter((r:any)=>Boolean(r[day.key])).sort((a:any,b:any)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
      for(let i=1;i<ordered.length;i++){
        const prev=ordered[i-1],next=ordered[i];
        const from=normalizedBuilding(prev.AdRoomCode),to=normalizedBuilding(next.AdRoomCode);
        if(!from||!to||from.toLocaleLowerCase()===to.toLocaleLowerCase())continue;
        const gap=Math.max(0,timeToMinutes(next.fstarttime)-timeToMinutes(prev.fendtime));
        const needed=travelMinutesFor(profile,from,to),margin=gap-needed;
        const level=margin<0?"high":margin<=10?"guarded":"low";
        if(level==="low")continue;
        risks.push({instructorId,instructorName:instructorName.get(instructorId)||`أستاذ ${instructorId}`,day:day.key,dayLabel:day.label,fromRowId:prev.id,toRowId:next.id,fromBuilding:from,toBuilding:to,gapMinutes:gap,requiredMinutes:needed,marginMinutes:margin,level,title:level==="high"?"خطر الإرهاق الجسدي":"انتقال جغرافي ضيق",detail:level==="high"?`الفاصل ${gap} دقيقة بينما الانتقال التقريبي يحتاج ${needed} دقيقة.`:`المتاح ${gap} دقيقة والانتقال يحتاج قرابة ${needed} دقيقة؛ هامش الحركة ${margin} دقائق فقط.`});
      }
    }
  }
  risks.sort((a,b)=>a.marginMinutes-b.marginMinutes);
  const high=risks.filter(r=>r.level==="high").length,guarded=risks.length-high;
  const score=Math.max(0,100-high*18-guarded*6);
  return {enabled:true,score,highRisk:high,guardedRisk:guarded,totalRisks:risks.length,risks:risks.slice(0,40),profile};
}
function roomIsFreeForRow(room:{code:string;hall:string},target:any,termRows:any[],ignoreIds:Set<number>){
  return termRows.every((other:any)=>{
    if(ignoreIds.has(Number(other.id)))return true;
    if(normalizedBuilding(other.AdRoomCode).toLocaleLowerCase()!==normalizedBuilding(room.code).toLocaleLowerCase()||String(other.AdRoomHall||"").trim().toLocaleLowerCase()!==String(room.hall||"").trim().toLocaleLowerCase())return true;
    return !["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>Boolean(target[day]&&other[day])&&scheduleOverlap(target.fstarttime,target.fendtime,other.fstarttime,other.fendtime));
  });
}
function roomCastlingProposals(scopeRows:any[],termRows:any[],profile:any,instructors:any[]=[]){
  const radar=spatialBurnoutAnalysis(scopeRows,termRows,profile,instructors);
  // A castling suggestion is only considered safe when it improves the target
  // problem without making geographic pressure worse anywhere else in the term.
  const globalBefore=spatialBurnoutAnalysis(termRows,termRows,profile,instructors);
  const verifyChanges=(changes:any[])=>{
    const byId=new Map(changes.map(change=>[Number(change.id),change]));
    const next=termRows.map(row=>byId.has(Number(row.id))?{...row,...byId.get(Number(row.id))}:row);
    const globalAfter=spatialBurnoutAnalysis(next,next,profile,instructors);
    return {safe:globalAfter.highRisk<=globalBefore.highRisk&&globalAfter.score>=globalBefore.score,globalAfter};
  };
  const roomMap=new Map<string,{code:string;hall:string,count:number}>();
  termRows.forEach((r:any)=>{const code=normalizedBuilding(r.AdRoomCode),hall=String(r.AdRoomHall||"").trim();if(!code||!hall)return;const key=`${code.toLocaleLowerCase()}|${hall.toLocaleLowerCase()}`,v=roomMap.get(key)||{code,hall,count:0};v.count++;roomMap.set(key,v);});
  const rooms=[...roomMap.values()].sort((a,b)=>b.count-a.count);
  const proposals:any[]=[];
  for(const risk of radar.risks.filter((r:any)=>r.level==="high").slice(0,12)){
    const target=termRows.find((r:any)=>Number(r.id)===Number(risk.toRowId));if(!target)continue;
    const desired=risk.fromBuilding;
    const candidates=rooms.filter(room=>room.code.toLocaleLowerCase()===desired.toLocaleLowerCase()&&roomIsFreeForRow(room,target,termRows,new Set([Number(target.id)])));
    const best=candidates[0];
    if(best){
      const changes=[{id:target.id,AdRoomCode:best.code,AdRoomHall:best.hall}],verified=verifyChanges(changes);
      if(verified.safe)proposals.push({kind:"free-room",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:`تقريب القاعة إلى مبنى ${best.code}`,reason:`يحوّل الانتقال من ${risk.fromBuilding} → ${risk.toBuilding} إلى نفس المبنى قبل المحاضرة التالية، بعد فحص أثره على حركة جميع الأساتذة في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:best.code,roomHall:best.hall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,best.code)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});
      if(verified.safe)continue;
    }
    const swap=termRows.find((other:any)=>Number(other.id)!==Number(target.id)&&normalizedBuilding(other.AdRoomCode).toLocaleLowerCase()===desired.toLocaleLowerCase()&&["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>rowsOverlapOnDay(target,other,day))&&roomIsFreeForRow({code:other.AdRoomCode,hall:other.AdRoomHall},target,termRows,new Set([Number(target.id),Number(other.id)]))&&roomIsFreeForRow({code:target.AdRoomCode,hall:target.AdRoomHall},other,termRows,new Set([Number(target.id),Number(other.id)])));
    if(swap){const changes=[{id:target.id,AdRoomCode:swap.AdRoomCode,AdRoomHall:swap.AdRoomHall},{id:swap.id,AdRoomCode:target.AdRoomCode,AdRoomHall:target.AdRoomHall}],verified=verifyChanges(changes);if(verified.safe)proposals.push({kind:"swap",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:"Room Castling · تبديل شطرنجي للقاعتين",reason:`تبديل القاعتين يقلل عبور ${risk.instructorName} بين المباني من دون تغيير الوقت أو الأستاذ أو أيام المحاضرة، ولا يُعرض إلا إذا لم يزد خطر الحركة على أي أستاذ آخر في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:swap.AdRoomCode,roomHall:swap.AdRoomHall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,swap.AdRoomCode)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});}
  }
  return {radar,proposals:proposals.slice(0,8)};
}

async function scheduleConflicts(req:AuthenticatedRequest,row:any,excludeId=0){
  const termId=Number(row?.AdTermId||0);
  if(!termId||!row?.fstarttime||!row?.fendtime||!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))return[];
  const candidate:any={...row,id:excludeId||Number(row?.id||-900000),AdTermId:termId};
  const [candidateRows, instructor, roomNotice]=await Promise.all([
    Repository.getScheduleConflictCandidates(candidate),
    Number(candidate.AdInstructorId||0) ? Repository.getInstructorById(Number(candidate.AdInstructorId)) : Promise.resolve(null),
    roomScopeNotice(candidate),
  ]);
  const all=candidateRows.filter(item=>item.id!==excludeId);
  const raw=findConflicts([candidate],all);
  const conflicts=raw.map((conflict:any)=>{
    const other=all.find(item=>item.id===conflict.otherId);
    const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
    if(conflict.type==="instructor"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`الأستاذ ${instructor?.AdInstructorName||""} لديه محاضرة متداخلة`,detail:visible?`${other.AdCourseName||"مقرر"} — ${other.fstarttime}-${other.fendtime}`:`يوجد له موعد متداخل خارج نطاق القسم — ${other.fstarttime}-${other.fendtime}`};
    if(conflict.type==="room"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`القاعة ${other.AdRoomCode}/${other.AdRoomHall} مشغولة في نفس الوقت`,detail:visible?`${other.AdCourseName||"مقرر"} — ${other.fstarttime}-${other.fendtime}`:`يوجد حجز متداخل خارج نطاق القسم — ${other.fstarttime}-${other.fendtime}`};
    return{...conflict,severity:"high",rowId:visible&&other?other.id:0,message:"نفس المقرر والشعبة موجودان في الفصل",detail:visible&&other?`${other.fstarttime}-${other.fendtime}`:"يوجد سجل مطابق خارج نطاق العرض الحالي"};
  });
  return roomNotice?[...conflicts,roomNotice]:conflicts;
}

app.get("/api/schedules", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  let termId=Number(req.query.termId||0);
  // Operational screens default to the newest term. Historical reads are still
  // available by sending termId explicitly, but a blank filter can no longer scan
  // the university's entire ten-year schedule collection.
  if(!termId){const terms=await Repository.getTerms();termId=terms.reduce((max,t)=>Math.max(max,Number(t.AdTermId)||0),0);}
  let list = await Repository.getSchedulesByScope({collegeId,sectionId,termId});
  list = filterByScope(req, list);

  if (req.query.instructorId) {
    list = list.filter(s => s.AdInstructorId === parseInt(req.query.instructorId as string));
  }
  if (req.query.building) {
    list = list.filter(s => String(s.AdRoomCode || "").includes(req.query.building as string));
  }
  if (req.query.hall) {
    list = list.filter(s => String(s.AdRoomHall || "").includes(req.query.hall as string));
  }
  const requestedStartTime = req.query.startTime as string | undefined;
  const requestedEndTime = req.query.endTime as string | undefined;
  if (requestedStartTime && requestedEndTime) {
    list = list.filter(s =>
      (s.fstarttime <= requestedStartTime && s.fendtime >= requestedStartTime) ||
      (s.fstarttime <= requestedEndTime && s.fendtime >= requestedEndTime)
    );
  }
  // Exact legacy MainReport day semantics: selected weekdays are OR-ed together.
  const requestedDays = [
    req.query.sun === "true" && "fsunday",
    req.query.mon === "true" && "fmonday",
    req.query.tue === "true" && "ftuesday",
    req.query.wed === "true" && "fwednesday",
    req.query.thr === "true" && "fthursday"
  ].filter(Boolean) as ("fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday")[];
  if (requestedDays.length) list = list.filter(s => requestedDays.some(day => Boolean(s[day])));

  res.json(list);
});

app.post("/api/schedules/check-conflicts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => { const row=req.body||{}; res.json({conflicts:await scheduleConflicts(req,row,Number(row.excludeId||0))}); });

app.post("/api/schedules", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {
    AdCollegeId,
    AdSectionId,
    AdTermId,
    AdCourseId,
    SCode,
    AdInstructorId,
    fsunday,
    fmonday,
    ftuesday,
    fwednesday,
    fthursday,
    fstarttime,
    fendtime,
    AdRoomCode,
    AdRoomHall
  } = req.body;

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !AdRoomCode || !AdRoomHall) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  if (!/^\d+$/.test(String(SCode))) {
    res.status(400).json({ error: "الرجاء كتابة الأرقام بالانجليزي" });
    return;
  }
  const payloadIssues=schedulePayloadIssues(req.body);
  if(payloadIssues.length){res.status(400).json({error:payloadIssues[0],issues:payloadIssues.map(message=>({type:"validation",severity:"high",message}))});return;}

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), termId = parseInt(AdTermId), courseId = parseInt(AdCourseId), instructorId = parseInt(AdInstructorId);
  if (!isScopeAllowed(req, collegeId, sectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }

  const [section, course, term, instructor] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getCourseById(courseId), Repository.getTermById(termId), Repository.getInstructorById(instructorId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) { res.status(400).json({ error: "المقرر المختار غير صالح" }); return; }
  if (!term) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }
  if (!instructor) { res.status(400).json({ error: "أستاذ المقرر المختار غير صالح" }); return; }
  const conflicts=await scheduleConflicts(req,{...req.body,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId});
  if(conflicts.length){res.status(409).json({error:conflicts[0].message||"يوجد تعارض يمنع الحفظ",issues:conflicts});return;}

  await captureScopeVersion(req, collegeId, sectionId, termId, "قبل إضافة موعد دراسي", "manual");

  const newSched = await Repository.createSchedule({
    AdCollegeId: collegeId,
    AdSectionId: sectionId,
    AdTermId: termId,
    AdCourseId: courseId,
    AdCourseName: course.CourseName,
    SCode,
    AdInstructorId: instructorId,
    fsunday: !!fsunday,
    fmonday: !!fmonday,
    ftuesday: !!ftuesday,
    fwednesday: !!fwednesday,
    fthursday: !!fthursday,
    fstarttime,
    fendtime,
    AdRoomCode: AdRoomCode || "",
    AdRoomHall: AdRoomHall || "",
    fdetail: legacyFDetail({ fsunday, fmonday, ftuesday, fwednesday, fthursday })
  });

  res.status(201).json(newSched);
});

app.put("/api/schedules/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const {
    AdCollegeId,
    AdSectionId,
    AdTermId,
    AdCourseId,
    SCode,
    AdInstructorId,
    fsunday,
    fmonday,
    ftuesday,
    fwednesday,
    fthursday,
    fstarttime,
    fendtime,
    AdRoomCode,
    AdRoomHall
  } = req.body;

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !AdRoomCode || !AdRoomHall) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  if (!/^\d+$/.test(String(SCode))) {
    res.status(400).json({ error: "الرجاء كتابة الأرقام بالانجليزي" });
    return;
  }
  const payloadIssues=schedulePayloadIssues(req.body);
  if(payloadIssues.length){res.status(400).json({error:payloadIssues[0],issues:payloadIssues.map(message=>({type:"validation",severity:"high",message}))});return;}

  const existing = await Repository.getScheduleById(id);
  if (!existing) { res.status(404).json({ error: "الجدول غير موجود" }); return; }
  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), termId = parseInt(AdTermId), courseId = parseInt(AdCourseId), instructorId = parseInt(AdInstructorId);
  if (!req.user.IsAdminUser && (!isScopeAllowed(req, existing.AdCollegeId, existing.AdSectionId) || !isScopeAllowed(req, collegeId, sectionId))) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [section, course, term, instructor] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getCourseById(courseId), Repository.getTermById(termId), Repository.getInstructorById(instructorId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) { res.status(400).json({ error: "المقرر المختار غير صالح" }); return; }
  if (!term) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }
  if (!instructor) { res.status(400).json({ error: "أستاذ المقرر المختار غير صالح" }); return; }
  const conflicts=await scheduleConflicts(req,{...req.body,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId},id);
  if(conflicts.length){res.status(409).json({error:conflicts[0].message||"يوجد تعارض يمنع التعديل",issues:conflicts});return;}

  try {
    await captureScopeVersion(req, existing.AdCollegeId, existing.AdSectionId, existing.AdTermId, "قبل تعديل موعد دراسي", "manual");
    if (existing.AdCollegeId !== collegeId || existing.AdSectionId !== sectionId || existing.AdTermId !== termId) {
      await captureScopeVersion(req, collegeId, sectionId, termId, "قبل نقل موعد إلى هذا الجدول", "manual");
    }
    const updated = await Repository.updateSchedule(id, {
      AdCollegeId: collegeId,
      AdSectionId: sectionId,
      AdTermId: termId,
      AdCourseId: courseId,
      AdCourseName: course.CourseName,
      SCode,
      AdInstructorId: instructorId,
      fsunday: !!fsunday,
      fmonday: !!fmonday,
      ftuesday: !!ftuesday,
      fwednesday: !!fwednesday,
      fthursday: !!fthursday,
      fstarttime,
      fendtime,
      AdRoomCode: AdRoomCode || "",
      AdRoomHall: AdRoomHall || "",
      fdetail: legacyFDetail({ fsunday, fmonday, ftuesday, fwednesday, fthursday })
    });
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/schedules/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const sched = await Repository.getScheduleById(id);
  if (sched && !isScopeAllowed(req, sched.AdCollegeId, sched.AdSectionId) && !req.user.IsAdminUser) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  if (sched) await captureScopeVersion(req, sched.AdCollegeId, sched.AdSectionId, sched.AdTermId, "قبل حذف موعد دراسي", "manual");
  await Repository.deleteSchedule(id);
  res.json({ success: true });
});

// --- COPY SCHEDULES API ---

app.get("/api/schedules/copy-preview", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user.SystemUserId !== 1) { res.status(403).json({ error: "ليس لديك صلاحية لنسخ الجداول الدراسية. هذه العملية مقتصرة على المدير الرئيسي" }); return; }
  const collegeId=Number(req.query.collegeId||0), sectionId=Number(req.query.sectionId||0), fromTermId=Number(req.query.fromTermId||0), toTermId=Number(req.query.toTermId||0);
  if(!collegeId||!sectionId||!fromTermId||!toTermId){res.status(400).json({error:"جميع الحقول مطلوبة"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [source,target,courses,instructors]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId:fromTermId}),Repository.getSchedulesByScope({collegeId,sectionId,termId:toTermId}),Repository.getCourses(),Repository.getInstructors()
  ]);
  const courseById=new Map(courses.map(item=>[item.AdCourseId,item])); const instructorById=new Map(instructors.map(item=>[item.AdInstructorId,item]));
  res.json({sourceCount:source.length,targetCount:target.length,canCopy:source.length>0&&target.length===0,preview:source.slice(0,12).map(row=>({id:row.id,courseCode:courseById.get(row.AdCourseId)?.CourseCode||"",courseName:courseById.get(row.AdCourseId)?.CourseName||row.AdCourseName||"",sectionCode:row.SCode,instructorName:instructorById.get(row.AdInstructorId)?.AdInstructorName||"",time:`${row.fstarttime} - ${row.fendtime}`,room:`${row.AdRoomCode}/${row.AdRoomHall}`}))});
});

app.post("/api/schedules/copy", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { AdCollegeId, AdSectionId, fromTermId, toTermId } = req.body;

  if (!AdCollegeId || !AdSectionId || !fromTermId || !toTermId) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }

  // Copy schedule has a custom legacy check: must be SystemUserId == 1
  if (req.user.SystemUserId !== 1) {
    res.status(403).json({ error: "ليس لديك صلاحية لنسخ الجداول الدراسية. هذه العملية مقتصرة على المدير الرئيسي" });
    return;
  }

  const collegeId = parseInt(AdCollegeId), sectionId = parseInt(AdSectionId), sourceTermId = parseInt(fromTermId), targetTermId = parseInt(toTermId);
  if (!isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [section, sourceTerm, targetTerm] = await Promise.all([
    Repository.getSectionById(sectionId), Repository.getTermById(sourceTermId), Repository.getTermById(targetTermId)
  ]);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  if (!sourceTerm || !targetTerm) { res.status(400).json({ error: "الفصل الدراسي المختار غير صالح" }); return; }

  const undoVersion = await captureScopeVersion(req, collegeId, sectionId, targetTermId, "قبل نسخ الفصل الدراسي", "copy");
  const count = await Repository.copySchedule(collegeId, sectionId, sourceTermId, targetTermId);
  if (count === -1) {
    res.status(409).json({ error: "Already Schedule Available On this Term.....!" });
    return;
  }
  res.json({ success: true, count, message: "تم نسخ الفصل الدراسي بنجاح", undoVersion: undoVersion ? { id: undoVersion.id, label: undoVersion.label } : null });
});

// --- SMART SCHEDULE WORKSPACE (additive; legacy schedule endpoints remain unchanged) ---

app.get("/api/intelligence/overview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, section } = await resolveSmartContext(req);
  if (!collegeId || !sectionId || !termId || !section) { res.status(400).json({ error: "لا يوجد قسم أو فصل دراسي متاح للتحليل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [scheduleData, courses, instructors, colleges, terms, drafts, publication, mobilityProfile] = await Promise.all([
    scopedScheduleUniverse(collegeId, sectionId, termId), Repository.getCourses(), Repository.getInstructors(), Repository.getColleges(), Repository.getTerms(),
    Repository.getScheduleDrafts(collegeId, sectionId, termId), Repository.getSchedulePublication(collegeId, sectionId, termId), Repository.getCampusMobilityProfile(collegeId)
  ]);
  const {rows:target,universe:termRows}=scheduleData;
  const analysis = analyzeSchedule(target, termRows, courses, instructors);
  const spatial = roomCastlingProposals(target, termRows, mobilityProfile, instructors);
  const universityHeatmap:any[]=[];
  for(const day of SCHEDULE_DAYS){for(let minute=8*60;minute<18*60;minute+=30){const count=termRows.filter(row=>Boolean((row as any)[day.key])&&timeToMinutes(row.fstarttime)<minute+30&&timeToMinutes(row.fendtime)>minute).length;universityHeatmap.push({day:day.key,label:day.label,time:minutesToTime(minute),count})}}
  const universityPeak=Math.max(0,...universityHeatmap.map(x=>x.count));
  res.json({
    context:{collegeId,sectionId,termId,collegeName:colleges.find(x=>x.AdCollegeId===collegeId)?.AdCollegeName||"",sectionName:section.AdSectionName,termName:terms.find(x=>x.AdTermId===termId)?.AdTermName||""},
    ...analysis,
    draftCount:drafts.filter(d=>d.status==="draft").length,
    latestDraft:drafts.find(d=>d.status==="draft") ? {id:drafts.find(d=>d.status==="draft")!.id,name:drafts.find(d=>d.status==="draft")!.name,updatedAt:drafts.find(d=>d.status==="draft")!.updatedAt,source:drafts.find(d=>d.status==="draft")!.source} : null,
    publication:publication||null, universityHeatmap, universityPeak,
    spatialBurnout: spatial.radar, roomCastling: spatial.proposals
  });
});

app.get("/api/intelligence/spatial-burnout", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,instructors,profile]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getInstructors(),Repository.getCampusMobilityProfile(collegeId)]);
  const result=roomCastlingProposals(scheduleData.rows,scheduleData.universe,profile,instructors);
  res.json(result);
});

app.post("/api/intelligence/conflict-solutions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body=req.body||{}; const collegeId=Number(body.AdCollegeId||body.collegeId||0),sectionId=Number(body.AdSectionId||body.sectionId||0),termId=Number(body.AdTermId||body.termId||0);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rows=safeDraftRows([body],collegeId,sectionId,termId); if(!rows.length){res.status(400).json({error:"بيانات الموعد غير مكتملة"});return;}
  const errors=await validateSmartRows(rows,collegeId,sectionId); if(errors.length){res.status(400).json({error:errors[0],issues:errors});return;}
  const termRows=await Repository.getSchedulesByScope({termId});
  res.json({solutions:conflictSolutions(rows[0],termRows,5)});
});

// Ripple Forecast is deliberately read-only. It forecasts the exact drag target before the UI drops it.
app.post("/api/intelligence/ripple/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0),targetDay=String(req.body?.targetDay||""),targetStart=String(req.body?.targetStart||"").slice(0,5);
  const row=await Repository.getScheduleById(id); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;}
  if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(!SCHEDULE_DAYS.some(d=>d.key===targetDay)||!/^\d{2}:\d{2}$/.test(targetStart)){res.status(400).json({error:"موضع السحب غير صالح"});return;}
  const duration=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime)),start=timeToMinutes(targetStart);
  if(start<7*60||start>20*60){res.status(400).json({error:"وقت المعاينة خارج نطاق الجدول"});return;}
  const candidate:any={...row,fstarttime:targetStart,fendtime:minutesToTime(start+duration)};
  const selectedDays=activeDays(row);if(selectedDays.length===1)for(const day of SCHEDULE_DAYS)candidate[day.key]=day.key===targetDay;
  const [scheduleData,courses,instructors,mobilityProfile]=await Promise.all([scopedScheduleUniverse(row.AdCollegeId,row.AdSectionId,row.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getCampusMobilityProfile(row.AdCollegeId)]);
  const {rows:scopeRows,universe:termRows}=scheduleData;
  const forecast:any=forecastScheduleMove(row,candidate,scopeRows,termRows,courses,instructors,selectedDays.length===1?targetDay:selectedDays[0]);
  const nextScope=scopeRows.map(item=>item.id===row.id?candidate:item), nextUniverse=termRows.map(item=>item.id===row.id?candidate:item);
  const beforeSpatial=spatialBurnoutAnalysis(scopeRows,termRows,mobilityProfile,instructors),afterSpatial=spatialBurnoutAnalysis(nextScope,nextUniverse,mobilityProfile,instructors);
  const relevant=afterSpatial.risks.filter((risk:any)=>risk.fromRowId===row.id||risk.toRowId===row.id).slice(0,3);
  forecast.spatialBurnout={beforeScore:beforeSpatial.score,afterScore:afterSpatial.score,delta:afterSpatial.score-beforeSpatial.score,risks:relevant};
  if(relevant.length){const worst=relevant[0];forecast.effects=[...(forecast.effects||[]),{tone:worst.level==="high"?"warn":"neutral",text:worst.level==="high"?`خطر الإرهاق الجسدي: انتقال ${worst.fromBuilding} → ${worst.toBuilding} يحتاج ${worst.requiredMinutes} دقيقة والمتاح ${worst.gapMinutes} فقط`:`هامش انتقال جغرافي ضيق: ${worst.marginMinutes} دقائق`}];forecast.delta={...(forecast.delta||{}),spatialBurnout:afterSpatial.score-beforeSpatial.score};}
  res.json(forecast);
});

app.get("/api/intelligence/lookups", requirePermission(7), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);
  res.json({courses,instructors});
});

app.get("/api/intelligence/genome", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [sectionRows,terms,courses,instructors]=await Promise.all([Repository.getSchedulesByScope({collegeId,sectionId}),Repository.getTerms(),Repository.getCourses(),Repository.getInstructors()]);
  res.json(buildScheduleGenome(sectionRows,terms,termId,courses,instructors));
});

app.get("/api/intelligence/constraints", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  res.json(await Repository.getScheduleConstraints(collegeId,sectionId,termId));
});
app.post("/api/intelligence/constraints", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const type=String(req.body?.type||"");const allowed=new Set(["instructor_latest_end","instructor_day_off","department_day_off","course_room","max_instructor_gap"]);if(!allowed.has(type)){res.status(400).json({error:"نوع القاعدة غير صالح"});return;}
  const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);const instructorId=Number(req.body?.AdInstructorId||0),courseId=Number(req.body?.AdCourseId||0),day=String(req.body?.day||""),time=String(req.body?.time||"").slice(0,5),roomCode=String(req.body?.roomCode||"").trim().slice(0,40),roomHall=String(req.body?.roomHall||"").trim().slice(0,40),maxMinutes=Math.max(30,Math.min(480,Number(req.body?.maxMinutes||120)));
  const instructor=instructors.find(i=>i.AdInstructorId===instructorId),course=courses.find(c=>c.AdCourseId===courseId&&c.AdCollegeId===collegeId&&c.AdSectionId===sectionId);
  if((type==="instructor_latest_end"||type==="instructor_day_off"||(type==="max_instructor_gap"&&instructorId))&&!instructor){res.status(400).json({error:"اختر أستاذ مقرر صالح"});return;}
  if(type==="instructor_latest_end"&&!/^\d{2}:\d{2}$/.test(time)){res.status(400).json({error:"حدد آخر وقت مسموح"});return;}
  if((type==="instructor_day_off"||type==="department_day_off")&&!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"حدد يوماً صالحاً"});return;}
  if(type==="course_room"&&(!course||!roomCode||!roomHall)){res.status(400).json({error:"اختر المقرر وحدد المبنى والقاعة"});return;}
  const dayLabel=SCHEDULE_DAYS.find(d=>d.key===day)?.label||"";const label=type==="instructor_latest_end"?`${instructor?.AdInstructorName}: لا محاضرات بعد ${time}`:type==="instructor_day_off"?`${instructor?.AdInstructorName}: ${dayLabel} يوم محجوز`:type==="department_day_off"?`${dayLabel}: يوم محجوز للقسم`:type==="course_room"?`${course?.CourseCode||course?.CourseName}: القاعة ${roomCode}/${roomHall}`:instructor?`${instructor.AdInstructorName}: الفراغ لا يتجاوز ${maxMinutes} دقيقة`:`أي أستاذ: الفراغ لا يتجاوز ${maxMinutes} دقيقة`;
  const created=await Repository.createScheduleConstraint({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,type:type as any,label,enabled:true,AdInstructorId:(type==="instructor_latest_end"||type==="instructor_day_off"||type==="max_instructor_gap")?(instructorId||undefined):undefined,AdCourseId:type==="course_room"?(courseId||undefined):undefined,day:(type==="instructor_day_off"||type==="department_day_off")&&SCHEDULE_DAYS.some(d=>d.key===day)?day as any:undefined,time:type==="instructor_latest_end"?(time||undefined):undefined,roomCode:type==="course_room"?(roomCode||undefined):undefined,roomHall:type==="course_room"?(roomHall||undefined):undefined,maxMinutes:type==="max_instructor_gap"?maxMinutes:undefined});res.status(201).json(created);
});
app.put("/api/intelligence/constraints/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id=String(req.params.id);
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const item=(await Repository.getScheduleConstraints(collegeId,sectionId,termId)).find(c=>c.id===id);if(!item){res.status(404).json({error:"القاعدة غير موجودة في هذا النطاق"});return;}
  res.json(await Repository.updateScheduleConstraint(id,{enabled:typeof req.body?.enabled==="boolean"?req.body.enabled:item.enabled}));
});
app.delete("/api/intelligence/constraints/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const item=(await Repository.getScheduleConstraints(collegeId,sectionId,termId)).find(c=>c.id===String(req.params.id));if(!item){res.status(404).json({error:"القاعدة غير موجودة في هذا النطاق"});return;}await Repository.deleteScheduleConstraint(item.id);res.json({success:true});
});

app.post("/api/intelligence/war-room", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.status(400).json({error:"لا يوجد جدول لبناء غرفة قرار"});return;}
  res.json(buildWarRoom(base,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined));
});

app.post("/api/intelligence/autopilot", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req),goal=String(req.body?.goal||"قلل التعارضات والفراغات بأقل تغيير ممكن").trim().slice(0,240);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.status(400).json({error:"لا توجد مواعيد لتشغيل الجدولة المساعدة"});return;}
  res.json(runScheduleAutopilot(base,universe,courses,instructors,constraints,goal,240));
});

app.post("/api/intelligence/evaluate", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rows=safeDraftRows(req.body?.rows,collegeId,sectionId,termId); const errors=await validateSmartRows(rows,collegeId,sectionId);
  if(errors.length){res.status(400).json({error:"المسودة تحتوي بيانات تحتاج مراجعة",issues:errors});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);
  const {rows:baseline,universe}=scheduleData;
  const external=universe.filter(row=>!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));
  res.json({baseline:analyzeSchedule(baseline,universe,courses,instructors),scenario:analyzeSchedule(rows,[...external,...rows],courses,instructors),constraints:{baseline:evaluateScheduleConstraints(baseline,constraints),scenario:evaluateScheduleConstraints(rows,constraints)}});
});

app.post("/api/intelligence/auto-schedule", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]);
  const {rows:target,universe}=scheduleData;
  if(!target.length){res.status(400).json({error:"لا توجد مواعيد في هذا القسم والفصل لإنشاء مقترح"});return;}
  const proposal=autoScheduleProposal(target,universe);
  const external=universe.filter(row=>row.AdTermId===termId&&!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));
  const before=analyzeSchedule(target,universe.filter(row=>row.AdTermId===termId),courses,instructors);
  const proposedAnalysis=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors);
  const safeImprovement=proposedAnalysis.metrics.criticalConflicts<before.metrics.criticalConflicts||(proposedAnalysis.metrics.criticalConflicts===before.metrics.criticalConflicts&&proposedAnalysis.score>=before.score);
  const chosenRows=safeImprovement?proposal.rows:target,changed=safeImprovement?proposal.changed:0,after=safeImprovement?proposedAnalysis:before;
  const summary=changed?`اقتراح آمن غيّر وقت ${changed} موعداً فقط، مع إبقاء المقرر والأستاذ والأيام والقاعة كما هي. التعارضات الحرجة ${before.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts}، والجودة ${before.score} ← ${after.score}.`:`حللت البدائل ولم أجد تغييراً آمناً أفضل من الجدول الحالي ضمن القيود نفسها؛ لذلك لم أقترح أي تعديل تلقائي.`;
  res.json({rows:chosenRows,changed,before,after,summary});
});

app.post("/api/intelligence/copilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const prompt=String(req.body?.prompt||"").trim();
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(prompt.length<2){res.status(400).json({error:"اكتب سؤالك للمساعد"});return;}
  const [scheduleData,courses,instructors,sections]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getSections()]);
  const {rows:target,universe}=scheduleData;
  const analysis=analyzeSchedule(target,universe,courses,instructors); const bullets:string[]=[]; let title="قراءة ذكية للجدول"; let summary=`جودة الجدول الحالية ${analysis.score}/100، مع ${analysis.metrics.criticalConflicts} تعارضات حرجة و${analysis.metrics.avgInstructorGap} دقيقة كمتوسط فراغ للأساتذة.`;
  const normalized=prompt.replace(/[؟?]/g,"").toLowerCase();
  const dayMatch=SCHEDULE_DAYS.find(day=>normalized.includes(day.label));
  const hourMatch=normalized.match(/(?:إلى|الى|الساعة|وقت)\s*(\d{1,2})(?::(\d{2}))?/);
  const requestedHour=hourMatch?Math.min(23,Number(hourMatch[1]))*60+Number(hourMatch[2]||0):null;
  const profHint=normalized.match(/(?:د\.?|دكتور|الدكتور)\s*([^\s]+)/)?.[1];
  const requestedInstructor=instructors.find(i=>normalized.includes(String(i.AdInstructorName||"").toLowerCase())||(profHint&&String(i.AdInstructorName||"").toLowerCase().includes(profHint)));
  if(normalized.includes("المشكلة الأكبر")||normalized.includes("اكبر مشكلة")||normalized.includes("أكبر مشكلة")||normalized.includes("وين المشكلة")){
    const topAlert=analysis.alerts?.[0],topFactor=[...(analysis.factors||[])].sort((a:any,b:any)=>b.penalty-a.penalty)[0];title="أكبر نقطة تحتاج تدخلك الآن";summary=topAlert?`${topAlert.title}: ${topAlert.detail}`:topFactor&&topFactor.penalty>0?`أكبر خصم من جودة الجدول حالياً هو ${topFactor.label} (-${topFactor.penalty}).`:`لا تظهر مشكلة حرجة حالياً؛ جودة الجدول ${analysis.score}/100.`;analysis.alerts.slice(1,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
  } else if(normalized.includes("فراغ")){
    title=requestedInstructor?`فراغات ${requestedInstructor.AdInstructorName}`:"تحليل فراغات الأساتذة";
    if(requestedInstructor){const profRows=target.filter(r=>r.AdInstructorId===requestedInstructor.AdInstructorId);if(dayMatch){const items=profRows.filter(r=>Boolean((r as any)[dayMatch.key])).sort((a,b)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));const gaps:any[]=[];for(let i=1;i<items.length;i++){const gap=timeToMinutes(items[i].fstarttime)-timeToMinutes(items[i-1].fendtime);if(gap>0)gaps.push({from:items[i-1].fendtime,to:items[i].fstarttime,mins:gap});}summary=items.length?gaps.length?`في ${dayMatch.label} لدى ${requestedInstructor.AdInstructorName} ${gaps.length} فترة فراغ بين المحاضرات، بإجمالي ${gaps.reduce((n,g)=>n+g.mins,0)} دقيقة.`:`في ${dayMatch.label} لا يوجد فراغ بين محاضرات ${requestedInstructor.AdInstructorName} الظاهرة ضمن هذا القسم.`:`لا توجد محاضرات ظاهرة لـ ${requestedInstructor.AdInstructorName} يوم ${dayMatch.label} ضمن هذا القسم.`;gaps.slice(0,6).forEach(g=>bullets.push(`${g.from}–${g.to}: ${Math.floor(g.mins/60)}س ${g.mins%60}د.`));}else{const load=analysis.professorLoads.find((x:any)=>x.id===requestedInstructor.AdInstructorId);summary=load?`أكبر فراغ لـ ${requestedInstructor.AdInstructorName} هو ${Math.floor(load.maxGap/60)}س ${load.maxGap%60}د، والحمل الأسبوعي ${load.weeklyHours} ساعة.`:`لا توجد بيانات حمل ظاهرة لهذا الأستاذ في النطاق الحالي.`;}}
    else{const threshold=(Number(normalized.match(/(\d+)\s*ساع/)?.[1]||3))*60; const long=analysis.professorLoads.filter((x:any)=>x.maxGap>=threshold);summary=long.length?`وجدت ${long.length} أستاذاً لديهم فراغ يساوي أو يتجاوز ${Math.round(threshold/60)} ساعات في يوم واحد.`:"لا يوجد أستاذ يتجاوز حد الفراغ المطلوب في هذا الجدول.";long.slice(0,6).forEach((x:any)=>bullets.push(`${x.name}: أكبر فراغ ${Math.floor(x.maxGap/60)}س ${x.maxGap%60}د، والحمل الأسبوعي ${x.weeklyHours} ساعة.`));}
  } else if(dayMatch && normalized.includes("مزدحم")){
    title=`لماذا ${dayMatch.label} مزدحم؟`; const day=analysis.dayLoad.find((x:any)=>x.key===dayMatch.key); const peaks=analysis.heatmap.filter((x:any)=>x.day===dayMatch.key).sort((a:any,b:any)=>b.count-a.count).slice(0,3);
    summary=`في ${dayMatch.label} يوجد ${day?.count||0} موعداً؛ أعلى تزامن ظاهر يصل إلى ${peaks[0]?.count||0} محاضرات في نصف ساعة واحدة.`;
    peaks.forEach((x:any)=>bullets.push(`${x.time}: ${x.count} محاضرات متزامنة.`));
  } else if(normalized.includes("إذا نقلت")||normalized.includes("اذا نقلت")){
    title="محاكاة نقل موعد"; const code=courses.find(c=>normalized.includes(String(c.CourseCode).toLowerCase())); const row=code?target.find(r=>r.AdCourseId===code.AdCourseId):target[0];
    if(row&&requestedHour!=null){const dur=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));const candidate={...row,fstarttime:minutesToTime(requestedHour),fendtime:minutesToTime(requestedHour+dur)};const before=findConflicts([row],universe).length,after=findConflicts([candidate],universe.filter(x=>x.id!==row.id).concat(candidate)).length;summary=`نقل ${code?.CourseCode||row.AdCourseName} إلى ${candidate.fstarttime} يغيّر التعارضات المحتملة من ${before} إلى ${after}.`;bullets.push(`الوقت المقترح: ${candidate.fstarttime}–${candidate.fendtime}.`,after===0?"لا يظهر تعارض في الأستاذ أو القاعة.":"يوجد تعارض؛ استخدم زر حل التعارض للحصول على بدائل مرتبة.");}
    else summary="حدد رمز المقرر والساعة في السؤال، مثال: إذا نقلت 101 إلى الساعة 11 شنو يتأثر؟";
  } else if(normalized.includes("أفضل توزيع")||normalized.includes("افضل توزيع")||normalized.includes("قلل الفراغ")||normalized.includes("تقليل الفراغ")){
    title="اقتراح تحسين التوزيع"; const proposal=autoScheduleProposal(target,universe); const external=universe.filter(r=>!(r.AdCollegeId===collegeId&&r.AdSectionId===sectionId)); const after=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors); const safer=after.metrics.criticalConflicts<analysis.metrics.criticalConflicts||(after.metrics.criticalConflicts===analysis.metrics.criticalConflicts&&after.score>=analysis.score);
    summary=safer&&proposal.changed?`يمكن إنشاء سيناريو يغيّر وقت ${proposal.changed} موعداً: التعارضات الحرجة ${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts} والجودة ${analysis.score}/100 ← ${after.score}/100، دون تغيير المقرر أو الأستاذ أو أيام اللقاء أو القاعة.`:"حللت التوزيع الحالي ولم أجد نقلاً تلقائياً آمناً أفضل ضمن القيود نفسها؛ الأفضل تجربة «ماذا لو؟» يدوياً أو تحديد قيد إضافي للمساعد.";
    if(dayMatch)bullets.push(`ذكرت ${dayMatch.label}. سأتعامل معه كأولوية تحليل، لكن لن أغيّر نمط أيام المقرر تلقائياً لأن ذلك قد يكون قيداً أكاديمياً.`);
    bullets.push("افتح «المحاكاة» لمراجعة كل تغيير قبل اعتماده.");
  } else if(normalized.includes("قاعة")){
    title="ذكاء القاعات"; const low=[...analysis.rooms].sort((a:any,b:any)=>a.utilization-b.utilization).slice(0,5); summary=`أقل القاعات استخداماً داخل نطاق القسم حالياً تظهر أدناه. التوفر الفعلي لأي موعد يُفحص أيضاً مقابل حجوزات الأقسام الأخرى.`; low.forEach((r:any)=>bullets.push(`${r.code}/${r.hall}: استخدام تقريبي ${r.utilization}% (${r.sessions} مواعيد).`));
  } else {
    analysis.alerts.slice(0,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
    const sectionName=sections.find(s=>s.AdSectionId===sectionId)?.AdSectionName||"القسم"; summary=`قرأت جدول ${sectionName} فقط ضمن صلاحياتك. ${summary}`;
  }
  res.json({title,summary,bullets,guardrail:"المساعد يحلل ويقترح فقط. لا يكتب أي تغيير على الجدول الحقيقي."});
});

app.get("/api/intelligence/context/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0); const selected=await Repository.getScheduleById(id); if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}
  if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [termRows,courses,instructors,comments]=await Promise.all([Repository.getSchedulesByScope({termId:selected.AdTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleComments(id)]);
  const visible=req.user.IsAdminUser?termRows:filterByScope(req,termRows); const termVisible=visible;
  const related={
    professor:termVisible.filter(r=>r.AdInstructorId===selected.AdInstructorId).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime)),
    course:termVisible.filter(r=>r.AdCourseId===selected.AdCourseId),
    room:termVisible.filter(r=>r.AdRoomCode===selected.AdRoomCode&&r.AdRoomHall===selected.AdRoomHall).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime))
  };
  const externalConflicts=findConflicts([selected],termRows).map(c=>({...c,otherId:visible.some(v=>v.id===c.otherId)?c.otherId:0}));
  res.json({selected,course:courses.find(c=>c.AdCourseId===selected.AdCourseId)||null,instructor:instructors.find(i=>i.AdInstructorId===selected.AdInstructorId)||null,related,conflicts:externalConflicts,comments});
});

app.get("/api/intelligence/replay/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0),selected=await Repository.getScheduleById(id);if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [versions,drafts,comments,publication,audits]=await Promise.all([Repository.getScheduleVersions(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId,100),Repository.getScheduleDrafts(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getScheduleComments(id),Repository.getSchedulePublication(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getAuditLogs(2000)]);
  const same=(r:any)=>r&&Number(r.AdCourseId)===selected.AdCourseId&&String(r.SCode)===String(selected.SCode);const state=(r:any)=>({time:`${r.fstarttime}–${r.fendtime}`,start:r.fstarttime,end:r.fendtime,room:`${r.AdRoomCode}/${r.AdRoomHall}`,instructorId:r.AdInstructorId,days:activeDays(r)});const stateKey=(r:any)=>r?`${r.AdInstructorId}|${activeDays(r).join(",")}|${r.fstarttime}|${r.fendtime}|${r.AdRoomCode}|${r.AdRoomHall}`:"missing";
  const ordered=[...versions].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const snapshots:any[]=[];for(const v of ordered){const r=v.rows.find(same);if(!r)continue;const conflicts=findConflicts([r],v.rows).length;const last=snapshots[snapshots.length-1];if(!last||last.key!==stateKey(r))snapshots.push({key:stateKey(r),timestamp:v.createdAt,userName:v.userName,label:v.label,source:v.source,row:r,state:state(r),conflicts})}
  const currentKey=stateKey(selected);if(!snapshots.length||snapshots[snapshots.length-1].key!==currentKey)snapshots.push({key:currentKey,timestamp:new Date().toISOString(),userName:"الوضع الحالي",label:"الوضع الحالي",source:"current",row:selected,state:state(selected),conflicts:findConflicts([selected],await Repository.getSchedulesByScope({termId:selected.AdTermId})).length});
  const events:any[]=[];if(snapshots.length)events.push({timestamp:snapshots[0].timestamp,type:"origin",title:"أقدم أثر متاح للموعد",detail:`${snapshots[0].state.time} · ${snapshots[0].state.room}`,actor:snapshots[0].userName,tone:"neutral"});
  for(let i=1;i<snapshots.length;i++){const a=snapshots[i-1],b=snapshots[i],changes:string[]=[];if(a.state.time!==b.state.time)changes.push(`الوقت ${a.state.time} ← ${b.state.time}`);if(a.state.room!==b.state.room)changes.push(`القاعة ${a.state.room} ← ${b.state.room}`);if(a.state.instructorId!==b.state.instructorId)changes.push("تغيّر أستاذ المقرر");if(a.state.days.join(",")!==b.state.days.join(","))changes.push("تغيّرت أيام اللقاء");if(changes.length)events.push({timestamp:b.timestamp,type:"move",title:"تغيّر قرار الموعد",detail:changes.join(" · "),actor:b.userName,tone:b.conflicts<a.conflicts?"good":b.conflicts>a.conflicts?"warn":"neutral"});if(a.conflicts===0&&b.conflicts>0)events.push({timestamp:b.timestamp,type:"conflict",title:"ظهر تعارض في هذه المرحلة",detail:`النسخة تحمل ${b.conflicts} علاقة تعارض لهذا الموعد.`,actor:b.userName,tone:"warn"});if(a.conflicts>0&&b.conflicts===0)events.push({timestamp:b.timestamp,type:"resolved",title:"اختفى التعارض الظاهر",detail:"النسخة التالية لم تعد تحمل التعارض السابق لهذا الموعد.",actor:b.userName,tone:"good"})}
  drafts.filter(d=>d.rows.some(same)).slice(0,20).forEach(d=>{const r=d.rows.find(same)!;events.push({timestamp:d.updatedAt,type:"draft",title:d.status==="published"?"مرّ عبر مسودة منشورة":"جُرّب بديل داخل المحاكاة",detail:`${d.name} · ${r.fstarttime}–${r.fendtime} · ${r.AdRoomCode}/${r.AdRoomHall}`,actor:d.userName,tone:d.status==="published"?"good":"info"})});
  comments.forEach(c=>events.push({timestamp:c.createdAt,type:"comment",title:c.resolved?"ملاحظة أُغلقت":"ملاحظة قرار",detail:c.text,actor:c.userName,tone:c.resolved?"good":"info"}));if(publication)events.push({timestamp:publication.publishedAt,type:"publish",title:"تم اعتماد جدول هذا النطاق",detail:publication.draftId?`الاعتماد مرتبط بالمسودة ${publication.draftId}`:"اعتماد مباشر",actor:publication.userName,tone:"good"});
  audits.filter(a=>a.path===`/schedules/${id}`||a.path===`/api/schedules/${id}`||a.path.endsWith(`/schedules/${id}`)).slice(0,30).forEach(a=>events.push({timestamp:a.timestamp,type:"audit",title:`${a.action} مباشر على الموعد`,detail:`${a.method} ${a.path}`,actor:a.userName,tone:"neutral"}));events.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  res.json({schedule:{id:selected.id,courseName:selected.AdCourseName,sectionCode:selected.SCode,current:state(selected)},events,coverage:{versions:versions.length,drafts:drafts.filter(d=>d.rows.some(same)).length,comments:comments.length,note:"سجل القرار يعيد بناء القصة من النسخ الزمنية والمسودات والملاحظات والسجل التشغيلي المتاح منذ تفعيل هذه الطبقات؛ لا يخترع أحداثاً أقدم غير مسجلة."}});
});

app.get("/api/intelligence/room", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const code=String(req.query.code||"").trim(),hall=String(req.query.hall||"").trim(),termId=Number(req.query.termId||0); if(!code||!hall||!termId){res.status(400).json({error:"حدد المبنى والقاعة والفصل الدراسي"});return;}
  const [roomHistory,sections]=await Promise.all([Repository.getSchedulesByRoom(code,hall),Repository.getSections()]); const rows=roomHistory.filter(r=>r.AdTermId===termId); const visible=req.user.IsAdminUser?rows:filterByScope(req,rows); const visibleIds=new Set(visible.map(r=>r.id));
  const occupancy:any[]=[]; const freeWindows:any[]=[];
  for(const day of SCHEDULE_DAYS){const intervals=rows.filter(r=>Boolean((r as any)[day.key])).map(r=>({start:timeToMinutes(r.fstarttime),end:timeToMinutes(r.fendtime)})).sort((a,b)=>a.start-b.start);const merged:any[]=[];for(const item of intervals){const last=merged[merged.length-1];if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);else merged.push({...item})}let cursor=8*60;for(const item of merged){if(item.start>cursor)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:minutesToTime(Math.min(item.start,18*60))});cursor=Math.max(cursor,item.end)}if(cursor<18*60)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:"18:00"}); for(const row of rows.filter(r=>Boolean((r as any)[day.key])))occupancy.push({day:day.label,start:row.fstarttime,end:row.fendtime,visible:visibleIds.has(row.id),sectionName:visibleIds.has(row.id)||req.user.IsAdminUser?sections.find(s=>s.AdSectionId===row.AdSectionId)?.AdSectionName||"":"حجز من قسم آخر"})}
  const usage=new Map<string,{name:string,count:number}>(); rows.forEach(r=>{const canSee=req.user.IsAdminUser||isScopeAllowed(req,r.AdCollegeId,r.AdSectionId);const name=canSee?(sections.find(s=>s.AdSectionId===r.AdSectionId)?.AdSectionName||"قسم"):`أقسام أخرى`;const key=canSee?String(r.AdSectionId):"external";const cur=usage.get(key)||{name,count:0};cur.count+=activeDays(r).length;usage.set(key,cur)});
  res.json({code,hall,totalAppointments:rows.length,visibleAppointments:visible.length,occupancy,freeWindows:freeWindows.filter(x=>timeToMinutes(x.end)-timeToMinutes(x.start)>=30),departments:[...usage.values()].sort((a,b)=>b.count-a.count)});
});

app.get("/api/intelligence/professor/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const instructorId=Number(req.params.id||0),termId=Number(req.query.termId||0); if(!instructorId||!termId){res.status(400).json({error:"حدد الأستاذ والفصل الدراسي"});return;} const [termRows,courses,instructors]=await Promise.all([Repository.getSchedulesByScope({termId}),Repository.getCourses(),Repository.getInstructors()]); const rows=termRows.filter(r=>r.AdInstructorId===instructorId); const visible=req.user.IsAdminUser?rows:filterByScope(req,rows); if(!req.user.IsAdminUser&&!visible.length){res.status(403).json({error:"الأستاذ لا يظهر ضمن نطاق القسم المسموح لك"});return;} const analysis=analyzeSchedule(rows,termRows,courses,instructors); const load=analysis.professorLoads.find((x:any)=>x.id===instructorId)||null; res.json({instructor:instructors.find(i=>i.AdInstructorId===instructorId)||null,load,visibleRows:visible,externalCommitments:Math.max(0,rows.length-visible.length),conflicts:analysis.conflicts.length});
});

app.get("/api/intelligence/comments/:scheduleId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} res.json(await Repository.getScheduleComments(scheduleId));
});
app.post("/api/intelligence/comments/:scheduleId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0),text=String(req.body?.text||"").trim(); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(text.length<2||text.length>600){res.status(400).json({error:"اكتب ملاحظة واضحة لا تتجاوز 600 حرف"});return;} const comment=await Repository.createScheduleComment({SystemUserId:req.user.SystemUserId,userName:req.user.Name,scheduleId,AdCollegeId:row.AdCollegeId,AdSectionId:row.AdSectionId,AdTermId:row.AdTermId,text}); res.status(201).json(comment);
});
app.put("/api/intelligence/comments/:scheduleId/:commentId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId=Number(req.params.scheduleId||0); const row=await Repository.getScheduleById(scheduleId); if(!row){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,row.AdCollegeId,row.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} await Repository.setScheduleCommentResolved(String(req.params.commentId),Boolean(req.body?.resolved)); res.json({success:true});
});

app.get("/api/intelligence/drafts", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} res.json(await Repository.getScheduleDrafts(collegeId,sectionId,termId));
});
app.post("/api/intelligence/drafts", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const rows=safeDraftRows(req.body?.rows,collegeId,sectionId,termId); const issues=await validateSmartRows(rows,collegeId,sectionId); if(issues.length){res.status(400).json({error:"لا يمكن حفظ المسودة قبل معالجة البيانات",issues});return;} const draft=await Repository.createScheduleDraft({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,name:String(req.body?.name||"سيناريو جديد").slice(0,100),source:["what-if","auto","import","manual"].includes(req.body?.source)?req.body.source:"what-if",rows}); res.status(201).json(draft);
});
app.put("/api/intelligence/drafts/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const draft=await Repository.getScheduleDraftById(String(req.params.id)); if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;} if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const fields:any={}; if(typeof req.body?.name==="string")fields.name=req.body.name.slice(0,100); if(Array.isArray(req.body?.rows)){const rows=safeDraftRows(req.body.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId);const issues=await validateSmartRows(rows,draft.AdCollegeId,draft.AdSectionId);if(issues.length){res.status(400).json({error:"المسودة تحتوي بيانات تحتاج مراجعة",issues});return;}fields.rows=rows;} res.json(await Repository.updateScheduleDraft(draft.id,fields));
});
app.post("/api/intelligence/drafts/:id/publish", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="publish"){res.status(409).json({error:"يتطلب النشر تأكيداً صريحاً من واجهة الاعتماد"});return;}
  const draft=await Repository.getScheduleDraftById(String(req.params.id)); if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;} if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const issues=await validateSmartRows(draft.rows,draft.AdCollegeId,draft.AdSectionId); if(issues.length){res.status(400).json({error:"لا يمكن نشر المسودة قبل معالجة البيانات",issues});return;} await captureScopeVersion(req,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId,`قبل نشر: ${draft.name}`,"publish"); const rows=await Repository.replaceScheduleScope(draft.AdCollegeId,draft.AdSectionId,draft.AdTermId,draft.rows); await Repository.updateScheduleDraft(draft.id,{status:"published",rows,publishedAt:new Date().toISOString()}); const publication=await Repository.upsertSchedulePublication({AdCollegeId:draft.AdCollegeId,AdSectionId:draft.AdSectionId,AdTermId:draft.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:draft.id}); res.json({success:true,count:rows.length,publication});
});

app.get("/api/intelligence/versions", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,80); res.json(versions.map(({rows,...meta})=>({...meta,rowCount:rows.length})));
});
app.get("/api/intelligence/versions/compare", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const a=await Repository.getScheduleVersionById(String(req.query.fromId||"")),b=await Repository.getScheduleVersionById(String(req.query.toId||"")); if(!a||!b){res.status(404).json({error:"إحدى النسختين غير موجودة"});return;} if(a.scopeKey!==b.scopeKey||!isScopeAllowed(req,a.AdCollegeId,a.AdSectionId)){res.status(403).json({error:"لا يمكن مقارنة نسخ خارج نطاق القسم"});return;} const key=(r:any)=>`${r.AdCourseId}:${r.SCode}:${r.AdInstructorId}:${activeDays(r).join(",")}:${r.fstarttime}:${r.fendtime}:${r.AdRoomCode}:${r.AdRoomHall}`; const ak=new Set(a.rows.map(key)),bk=new Set(b.rows.map(key)); res.json({from:{id:a.id,label:a.label,createdAt:a.createdAt,count:a.rows.length,rows:a.rows},to:{id:b.id,label:b.label,createdAt:b.createdAt,count:b.rows.length,rows:b.rows},added:[...bk].filter(x=>!ak.has(x)).length,removed:[...ak].filter(x=>!bk.has(x)).length,unchanged:[...bk].filter(x=>ak.has(x)).length});
});
app.post("/api/intelligence/versions/:id/restore", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="restore"){res.status(409).json({error:"يتطلب الاسترجاع تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"النسخة غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل استرجاع: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,version.rows); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`restore:${version.id}`}); res.json({success:true,count:rows.length});
});

app.get("/api/intelligence/compare-terms", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),fromTermId=Number(req.query.fromTermId||0),toTermId=Number(req.query.toTermId||0); if(!collegeId||!sectionId||!fromTermId||!toTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [fromData,toData,courses,instructors,terms]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,fromTermId),scopedScheduleUniverse(collegeId,sectionId,toTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms()]); const from=fromData.rows,to=toData.rows; res.json({...compareTerms(from,to),fromTermName:terms.find(t=>t.AdTermId===fromTermId)?.AdTermName||"",toTermName:terms.find(t=>t.AdTermId===toTermId)?.AdTermName||"",fromScore:analyzeSchedule(from,fromData.universe,courses,instructors).score,toScore:analyzeSchedule(to,toData.universe,courses,instructors).score});
});

app.post("/api/intelligence/import-preview", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const raw=Array.isArray(req.body?.rows)?req.body.rows:[]; if(!raw.length){res.status(400).json({error:"الملف لا يحتوي صفوفاً قابلة للقراءة"});return;} if(raw.length>450){res.status(400).json({error:"الملف أكبر من الحد الآمن للاستيراد"});return;} const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]); const sectionCourses=courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId); const byCode=new Map(sectionCourses.map(c=>[String(c.CourseCode).trim().toLowerCase(),c])); const byCivil=new Map(instructors.map(i=>[String(i.AdInstructorCivil).trim(),i])); const byName=new Map(instructors.map(i=>[String(i.AdInstructorName).trim().toLowerCase(),i])); const issues:string[]=[]; const rows:any[]=[];
  raw.forEach((item:any,index:number)=>{const code=String(item["رمز المقرر"]??item.CourseCode??item.courseCode??"").trim();const course=byCode.get(code.toLowerCase());const civil=String(item["الرقم المدني"]??item.AdInstructorCivil??item.civil??"").trim();const iname=String(item["أستاذ المقرر"]??item.AdInstructorName??item.instructor??"").trim();const instructor=byCivil.get(civil)||byName.get(iname.toLowerCase());const sectionCode=String(item["الشعبة"]??item.SCode??item.section??"").trim();const time=String(item["الوقت"]??item.time??"").trim();const parts=time.split(/\s*[-–—]\s*/);const start=String(item.fstarttime??item.startTime??parts[0]??"").trim().slice(0,5),end=String(item.fendtime??item.endTime??parts[1]??"").trim().slice(0,5);const dayText=String(item["الأيام"]??item.days??"");const row:any={id:-(index+1),AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:course?.AdCourseId||0,AdCourseName:course?.CourseName||String(item["المقرر الدراسي"]??""),SCode:sectionCode,AdInstructorId:instructor?.AdInstructorId||0,fsunday:dayText.includes("الأحد")||Boolean(item.fsunday),fmonday:dayText.includes("الاثنين")||Boolean(item.fmonday),ftuesday:dayText.includes("الثلاثاء")||Boolean(item.ftuesday),fwednesday:dayText.includes("الأربعاء")||Boolean(item.fwednesday),fthursday:dayText.includes("الخميس")||Boolean(item.fthursday),fstarttime:start,fendtime:end,AdRoomCode:String(item["المبنى"]??item.AdRoomCode??"").trim(),AdRoomHall:String(item["القاعة"]??item.AdRoomHall??"").trim(),fdetail:""}; row.fdetail=legacyFDetail(row); if(!course)issues.push(`السطر ${index+1}: لم أجد رمز المقرر ${code||"(فارغ)"} في هذا القسم`);if(!instructor)issues.push(`السطر ${index+1}: لم أتعرف على أستاذ المقرر`);rows.push(row);}); const validation=await validateSmartRows(rows,collegeId,sectionId); issues.push(...validation); const duplicateKeys=new Set<string>(),duplicates:string[]=[]; rows.forEach((r:any,i:number)=>{const key=`${r.AdCourseId}:${r.SCode}`;if(duplicateKeys.has(key))duplicates.push(`السطر ${i+1}: مقرر/شعبة مكرر`);duplicateKeys.add(key)});issues.push(...duplicates); res.json({rows,issues:[...new Set(issues)].slice(0,40),valid:issues.length===0,count:rows.length,preview:rows.slice(0,20)});
});

function rowSignatureServer(row:any){return `${row.AdCourseId||0}:${row.SCode||""}:${row.AdInstructorId||0}:${activeDays(row).join(",")}:${row.fstarttime||""}:${row.fendtime||""}:${row.AdRoomCode||""}|${row.AdRoomHall||""}`}


// --- LIVING SCHEDULE LAYER --------------------------------------------------
// All routes below are additive. They read the verified schedule tables and either
// return analysis or create a draft/memory record; none bypasses the existing
// schedule CRUD validation or publication gate.
app.get("/api/intelligence/living", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, section } = await resolveSmartContext(req);
  if (!collegeId || !sectionId || !termId || !section) { res.status(400).json({ error: "لا يوجد قسم أو فصل دراسي متاح للتحليل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const [scheduleData, courses, instructors, terms, constraints] = await Promise.all([
    scopedScheduleUniverse(collegeId,sectionId,termId), Repository.getCourses(), Repository.getInstructors(), Repository.getTerms(), Repository.getScheduleConstraints(collegeId, sectionId, termId)
  ]);
  const {rows,universe}=scheduleData;
  const pulse = buildSchedulePulse(rows, universe, courses, instructors);
  const health = buildScheduleHealth2(rows, universe, courses, instructors);
  const fairness = buildFairnessEngine(rows, instructors);
  const fragility = buildFragilityMap(rows, universe, courses, instructors);
  const roomIntelligence = buildRoomResilience(rows, universe);
  const topology = isPowerUser(req) ? buildConflictTopology(rows, universe, courses, instructors) : undefined;
  const brief = isPowerUser(req) ? buildOneMinuteBrief(rows, universe, courses, instructors) : undefined;
  const memories = isPowerUser(req) ? await Repository.getScheduleDecisionMemories(collegeId, sectionId, 120) : [];
  res.json({
    context:{collegeId,sectionId,termId,sectionName:section.AdSectionName,termName:terms.find(t=>t.AdTermId===termId)?.AdTermName||""},
    pulse,health,fairness,fragility,roomIntelligence,
    topology,brief,
    memory:isPowerUser(req)?buildDecisionMemoryInsight(memories):undefined,
    constraints:{count:constraints.filter(c=>c.enabled).length},
    capabilities:{powerAdmin:isPowerUser(req),emergency:isPowerUser(req),genesis:isPowerUser(req),decisionMemory:isPowerUser(req),meetingIntelligence:isPowerUser(req)}
  });
});

app.post("/api/intelligence/why", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rowId=Number(req.body?.rowId||req.body?.id||0); const selected=await Repository.getScheduleById(rowId);
  if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const raw={...selected,...(req.body?.candidate||{})};
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)]);
  const candidate=safeDraftRows([raw],selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)[0] as any; candidate.id=selected.id;
  const issues=await validateSmartRows([candidate],selected.AdCollegeId,selected.AdSectionId); if(issues.length){res.status(400).json({error:issues[0],issues});return;}
  const {rows:scope,universe}=scheduleData;
  const explanation=explainScheduleDecision(scope,universe,candidate,courses,instructors,constraints);
  const memories=isPowerUser(req)?await Repository.getScheduleDecisionMemories(selected.AdCollegeId,selected.AdSectionId,120):[];
  res.json({...explanation,memory:isPowerUser(req)?buildDecisionMemoryInsight(memories,selected.AdCourseId):undefined,guardrail:"هذه قراءة تفسيرية فقط؛ لا يتم حفظ أي تعديل من شاشة «لماذا؟»."});
});

app.post("/api/intelligence/why-not", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rowId=Number(req.body?.rowId||req.body?.id||0); const selected=await Repository.getScheduleById(rowId);
  if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;} if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const raw={...selected,...(req.body?.candidate||{})};
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)]);
  const candidate=safeDraftRows([raw],selected.AdCollegeId,selected.AdSectionId,selected.AdTermId)[0] as any; candidate.id=selected.id;
  const issues=await validateSmartRows([candidate],selected.AdCollegeId,selected.AdSectionId); if(issues.length){res.status(400).json({error:issues[0],issues});return;}
  const {rows:scope,universe}=scheduleData;
  const explanation=explainScheduleDecision(scope,universe,candidate,courses,instructors,constraints);
  const answer=explanation.warnings.length?`ممكن، لكن ${explanation.warnings[0]}`:explanation.tradeoffs.length?`ممكن، لكن ${explanation.tradeoffs[0]}`:explanation.delta.score>0?"ممكن، وهذا البديل أفضل وفق المؤشرات الحالية.":"ممكن، لكن لا يظهر مكسب واضح مقارنة بالوضع الحالي.";
  const memories=isPowerUser(req)?await Repository.getScheduleDecisionMemories(selected.AdCollegeId,selected.AdSectionId,120):[];
  res.json({...explanation,question:String(req.body?.question||"ليش مو هذا الحل؟").slice(0,240),answer,memory:isPowerUser(req)?buildDecisionMemoryInsight(memories,selected.AdCourseId):undefined,guardrail:"«لماذا لا؟» يفسر أثر الخيار ولا يطبقه."});
});

app.get("/api/intelligence/decision-memory", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId}=smartContextFrom(req); if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const courseId=Number(req.query.courseId||0); const memories=await Repository.getScheduleDecisionMemories(collegeId,sectionId,250);
  res.json(buildDecisionMemoryInsight(memories,courseId||undefined));
});

app.post("/api/intelligence/decision-memory", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const reason=String(req.body?.reason||"").trim(); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(reason.length<3||reason.length>700){res.status(400).json({error:"اكتب سبباً واضحاً بين 3 و700 حرف"});return;}
  const scheduleId=Number(req.body?.scheduleId||0); let row=scheduleId?await Repository.getScheduleById(scheduleId):undefined; if(row&&(row.AdCollegeId!==collegeId||row.AdSectionId!==sectionId)){res.status(403).json({error:"الموعد خارج نطاق هذا القسم"});return;}
  const kind=["rejected-option","accepted-note","meeting-decision"].includes(String(req.body?.kind))?String(req.body.kind) as any:"rejected-option";
  const memory=await Repository.createScheduleDecisionMemory({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:Number(req.body?.AdCourseId||row?.AdCourseId||0)||undefined,SCode:String(req.body?.SCode||row?.SCode||"")||undefined,scheduleId:scheduleId||undefined,optionSignature:String(req.body?.optionSignature||"").slice(0,500)||undefined,kind,reason});
  res.status(201).json(memory);
});

app.post("/api/intelligence/context-copilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const contextType=String(req.body?.contextType||"schedule"),action=String(req.body?.action||"improve"); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول في هذا النطاق"});return;}
  if(contextType==="schedule"){
    const row=rows.find(r=>r.id===Number(req.body?.rowId||req.body?.contextId||0)); if(!row){res.status(404).json({error:"الموعد غير موجود في هذا القسم"});return;} const solutions=conflictSolutions(row,universe,5); const options=solutions.slice(0,3).map(sol=>{const candidate={...row,fstarttime:sol.start,fendtime:sol.end,AdRoomCode:sol.roomCode,AdRoomHall:sol.roomHall};const why=explainScheduleDecision(rows,universe,candidate,courses,instructors,constraints);return{rank:sol.rank,title:sol.conflicts?`بديل مع ${sol.conflicts} تعارض محتمل`:"بديل نظيف",candidate,verdict:why.verdict,delta:why.delta,positives:why.positives.slice(0,3),tradeoffs:why.tradeoffs.slice(0,2)}}); const best=options[0]; res.json({title:`مساعد القرار · ${row.AdCourseName} / شعبة ${row.SCode}`,summary:best?`أقوى تحسين حالي: ${best.verdict}. الجودة ${best.delta.score>=0?"+":""}${best.delta.score}، والتعارضات ${best.delta.conflicts>=0?"+":""}${best.delta.conflicts}.`:"لا يظهر بديل آمن أفضل من الموعد الحالي.",context:{type:"schedule",rowId:row.id},options,guardrail:"الاقتراحات لا تحفظ شيئاً؛ افتح البديل في نموذج التعديل إذا قررت استخدامه."}); return;
  }
  if(contextType==="room"){
    const key=String(req.body?.value||req.body?.contextId||""); const intel=buildRoomResilience(rows,universe); const room=intel.rooms.find(r=>r.key===key)||intel.rooms[0]; if(!room){res.status(404).json({error:"لا توجد بيانات قاعات"});return;} res.json({title:`مساعد القرار · القاعة ${room.code}/${room.hall}`,summary:room.singlePoint?`هذه القاعة نقطة اعتماد حساسة: ${room.sessions} مواعيد و${room.recoverabilityPct}% فقط قابلة للنقل إلى قاعات بديلة بنفس الوقت.`:`اعتماد القسم على هذه القاعة تحت السيطرة؛ نسبة الاسترداد التقديرية ${room.recoverabilityPct}%.`,context:{type:"room",key:room.key},options:intel.rooms.filter(r=>r.key!==room.key&&r.risk<room.risk).slice(0,3).map(r=>({title:`${r.code}/${r.hall}`,detail:`مخاطرة ${r.risk}/100 · استخدام ${r.sessions} مواعيد`})),guardrail:"هذه قراءة تشغيلية؛ التوفر النهائي يُفحص عند نقل كل موعد."});return;
  }
  if(contextType==="instructor"){
    const id=Number(req.body?.value||req.body?.contextId||0); const fairness=buildFairnessEngine(rows,instructors); const prof=fairness.profiles.find(p=>p.id===id)||fairness.profiles[0]; if(!prof){res.status(404).json({error:"لا توجد بيانات أستاذ"});return;} const own=rows.filter(r=>r.AdInstructorId===prof.id); const suggestions=own.map(row=>{const best=conflictSolutions(row,universe,2)[0];return best?{rowId:row.id,course:row.AdCourseName,current:`${row.fstarttime}–${row.fendtime}`,candidate:`${best.start}–${best.end}`,room:`${best.roomCode}/${best.roomHall}`,conflicts:best.conflicts}:null}).filter(Boolean).slice(0,4); res.json({title:`مساعد القرار · ${prof.name}`,summary:`حمله ${prof.weeklyHours} ساعة على ${prof.days} أيام، وإجمالي الفراغ ${prof.gapMinutes} دقيقة. ${prof.deltaFromAverage>0?`أعلى من متوسط القسم بـ${Math.round(prof.deltaFromAverage)} نقطة.`:"ضمن متوسط القسم تقريباً."}`,context:{type:"instructor",id:prof.id},options:suggestions,guardrail:"ضغط أيام الأستاذ يحتاج مراجعة أكاديمية؛ الاقتراحات لا تطبق تلقائياً."});return;
  }
  if(contextType==="day"){
    const day=String(req.body?.value||req.body?.contextId||""); if(!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"اليوم غير صالح"});return;} const plans=createEmergencyPlans("day",day,rows,universe,courses,instructors,constraints).plans; const best=[...plans].sort((a,b)=>b.score-a.score||a.changed-b.changed)[0]; const count=rows.filter(r=>Boolean((r as any)[day])).length; res.json({title:`مساعد القرار · ${SCHEDULE_DAYS.find(d=>d.key===day)?.label}`,summary:`اليوم يحمل ${count} موعداً. أفضل سيناريو تخفيف يغيّر ${best?.changed||0} مواعيد مع جودة ${best?.score||0}/100.`,context:{type:"day",day},options:best?best.rows.filter(r=>{const base=rows.find(x=>x.id===r.id);return base&&rowSignatureServer(base)!==rowSignatureServer(r)}).slice(0,5).map(r=>({rowId:r.id,course:r.AdCourseName,time:`${r.fstarttime}–${r.fendtime}`,days:activeDays(r).map(k=>SCHEDULE_DAYS.find(d=>d.key===k)?.label).join("، ")})):[],guardrail:"تخفيف اليوم معروض كسيناريو فقط ولا يغيّر الجدول الحقيقي."});return;
  }
  res.status(400).json({error:"سياق مساعد القرار غير معروف"});
});

app.post("/api/intelligence/emergency", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const kind=String(req.body?.kind||"") as "room"|"day"|"instructor"; if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(!["room","day","instructor"].includes(kind)){res.status(400).json({error:"نوع الحالة الطارئة غير صالح"});return;}
  const value=kind==="instructor"?Number(req.body?.value||0):String(req.body?.value||""); if((kind==="instructor"&&!value)||(kind!=="instructor"&&!value)){res.status(400).json({error:"حدد العنصر المتأثر بالطوارئ"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول في هذا النطاق"});return;}
  const result=createEmergencyPlans(kind,value,rows,universe,courses,instructors,constraints); if(!result.affected){res.status(400).json({error:"لم أجد مواعيد تتأثر بهذه الحالة"});return;} res.json({...result,guardrail:"الخطط الثلاث سيناريوهات فقط. لا شيء يُنشر قبل حفظه كمسودة ثم اعتماده صراحة."});
});

app.post("/api/intelligence/genesis", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),targetTermId=Number(req.body?.targetTermId||req.body?.termId||0),sourceTermId=Number(req.body?.sourceTermId||0); if(!collegeId||!sectionId||!targetTermId||!sourceTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(sourceTermId===targetTermId){res.status(400).json({error:"اختر فصلاً سابقاً مختلفاً عن الفصل الجديد"});return;}
  const [source,targetUniverse,courses,instructors,terms,constraints]=await Promise.all([Repository.getSchedulesByScope({collegeId,sectionId,termId:sourceTermId}),Repository.getSchedulesByScope({termId:targetTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms(),Repository.getScheduleConstraints(collegeId,sectionId,targetTermId)]); if(!source.length){res.status(400).json({error:"الفصل السابق لا يحتوي جدولاً لهذا القسم"});return;}
  const validCourseIds=new Set(courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId).map(c=>c.AdCourseId)); const rows=source.filter(r=>validCourseIds.has(r.AdCourseId)).map((r,index)=>({...r,id:-(index+1),AdTermId:targetTermId})); const issues=await validateSmartRows(rows,collegeId,sectionId); if(issues.length){res.status(400).json({error:"تعذر بناء بداية الفصل بسبب بيانات تحتاج مراجعة",issues});return;}
  const universe=targetUniverse.filter(r=>!(r.AdCollegeId===collegeId&&r.AdSectionId===sectionId)).concat(rows); const analysis=analyzeSchedule(rows,universe,courses,instructors); const rules=evaluateScheduleConstraints(rows,constraints); const draft=await Repository.createScheduleDraft({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:targetTermId,name:`بداية الفصل · ${terms.find(t=>t.AdTermId===sourceTermId)?.AdTermName||sourceTermId} → ${terms.find(t=>t.AdTermId===targetTermId)?.AdTermName||targetTermId}`,source:"auto",rows});
  res.status(201).json({draft:{id:draft.id,name:draft.name,status:draft.status,rowCount:draft.rows.length},analysis:{score:analysis.score,conflicts:analysis.metrics.criticalConflicts,avgGap:analysis.metrics.avgInstructorGap,constraintViolations:rules.total},coverage:{sourceRows:source.length,copiedRows:rows.length,skippedRows:source.length-rows.length},guardrail:"بداية الفصل أنشأت مسودة فقط؛ الجدول الحقيقي لم يتغير."});
});

app.get("/api/intelligence/brief", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,versions]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleVersions(collegeId,sectionId,termId,2)]); const {rows,universe}=scheduleData; let changedSince: number|undefined=undefined; if(versions[0]){const before=new Map(versions[0].rows.map(r=>[r.id,rowSignatureServer(r)]));changedSince=rows.filter(r=>before.get(r.id)!==rowSignatureServer(r)).length+versions[0].rows.filter(r=>!rows.some(x=>x.id===r.id)).length;} res.json(buildOneMinuteBrief(rows,universe,courses,instructors,changedSince));
});

app.post("/api/intelligence/meeting-minutes", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,constraints,memories]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId),Repository.getScheduleDecisionMemories(collegeId,sectionId,120)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول لبناء محضر قرار"});return;} const war=buildWarRoom(rows,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined); const chosen=war.options?.find((x:any)=>x.id===String(req.body?.optionId||""))||war.options?.[0]; const issueRowId=war.issue?.rowId; const comments=issueRowId?await Repository.getScheduleComments(issueRowId):[]; const recentMemory=memories.filter(m=>!war.issue?.rowId||m.scheduleId===war.issue.rowId||m.AdCourseId===rows.find(r=>r.id===war.issue.rowId)?.AdCourseId).slice(0,5); const minutes={title:"محضر قرار الجدول",problem:war.issue?`${war.issue.courseName} · شعبة ${war.issue.sectionCode} — ${war.issue.conflictCount} علاقة تعارض ظاهرة.`:"مراجعة عامة للجدول",alternatives:(war.options||[]).map((o:any)=>({id:o.id,title:o.title,reason:o.reason,score:o.score,conflicts:o.conflicts,changed:o.changed})),selected:chosen?{id:chosen.id,title:chosen.title,reason:chosen.reason,score:chosen.score,conflicts:chosen.conflicts,changed:chosen.changed}:null,expectedImpact:chosen?`الجودة ${war.baseline.score} ← ${chosen.score}، التعارضات ${war.baseline.conflicts} ← ${chosen.conflicts}، وعدد المواعيد المتغيرة ${chosen.changed}.`:"لم يُحدد بديل.",discussion:comments.slice(0,8).map(c=>({text:c.text,user:c.userName,createdAt:c.createdAt,resolved:c.resolved})),memory:recentMemory.map(m=>({reason:m.reason,kind:m.kind,createdAt:m.createdAt,user:m.userName})),approvedBy:String(req.body?.approvedBy||req.user.Name).slice(0,120),generatedAt:new Date().toISOString()}; res.json(minutes);
});

app.get("/api/intelligence/safety-net", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,18); res.json(versions.map(v=>({id:v.id,createdAt:v.createdAt,label:v.label,source:v.source,userName:v.userName,rowCount:v.rows.length,decisionLabel:`استرجع الجدول إلى ${v.label}`})));
});

app.post("/api/intelligence/safety-net/:id/undo", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="decision-undo"){res.status(409).json({error:"يتطلب التراجع عن القرار تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"نقطة الأمان غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل التراجع عن القرار: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,version.rows); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`decision-undo:${version.id}`}); res.json({success:true,count:rows.length,message:`تمت العودة إلى ${version.label}`});
});


app.get("/api/audit-logs", requireAuth, requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const limit = Number(req.query.limit || 250);
  res.json(await Repository.getAuditLogs(limit));
});

app.get("/api/admin-user-options", requireAuth, requirePowerAdmin, async (_req: Request, res: Response) => {
  const list = (await Repository.getUsers()).filter(user => !user.IsDeleted);
  res.json(list.map(user => safeSystemUser(user)));
});

// Optional instructor link for personal dashboards. Restricted to user administrators.
app.get("/api/admin-instructor-options", requirePermission(11), async (_req: Request, res: Response) => {
  const list = await Repository.getInstructors();
  res.json(list.map(item => ({ AdInstructorId: item.AdInstructorId, AdInstructorName: item.AdInstructorName, AdInstructorCivil: item.AdInstructorCivil })));
});

// --- ADMIN SYSTEM USERS API ---

app.get("/api/users", requirePermission(11), async (req: Request, res: Response) => {
  const usersList = (await Repository.getUsers()).filter(user => !user.IsDeleted);
  const users = usersList.map(user => ({
    ...safeSystemUser(user),
    // Legacy SystemUser/Index displayed the password. The value is recovered only for users
    // who already passed FormName 11 authorization; Firestore stores AES-GCM ciphertext, not plaintext.
    SystemUserPassDisplay: Repository.decryptPasswordFromVault(user.SystemUserPassVault)
  }));
  res.json(users);
});

app.post("/api/users", requirePermission(11), async (req: Request, res: Response) => {
  const { Name, SystemUserLogin, password, IsAdminUser, IsActive, IsLocked, AdInstructorId } = req.body;
  if (!Name || !SystemUserLogin || !password) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }
  const exists = await Repository.getUserByLogin(SystemUserLogin);
  if (exists) {
    res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
    return;
  }
  const newUser = await Repository.createUser({
    Name,
    SystemUserLogin,
    SystemUserPass: Repository.hashPassword(password),
    SystemUserPassVault: Repository.encryptPasswordForVault(password),
    IsAdminUser: !!IsAdminUser,
    IsActive: IsActive !== undefined ? !!IsActive : true,
    IsLocked: !!IsLocked,
    IsDeleted: false,
    AdInstructorId: Number(AdInstructorId) || 0
  });
  res.status(201).json({ ...safeSystemUser(newUser), SystemUserPassDisplay: Repository.decryptPasswordFromVault(newUser.SystemUserPassVault) });
});

app.put("/api/users/:id", requirePermission(11), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { Name, SystemUserLogin, password, IsAdminUser, IsActive, IsLocked, AdInstructorId } = req.body;
  if (!Name || !SystemUserLogin) {
    res.status(400).json({ error: "جميع الحقول الأساسية مطلوبة" });
    return;
  }

  const exists = await Repository.getUserByLogin(SystemUserLogin);
  if (exists && exists.SystemUserId !== id) {
    res.status(400).json({ error: "اسم المستخدم مسجل مسبقاً" });
    return;
  }

  const fields: Partial<typeof exists> = {
    Name,
    SystemUserLogin,
    IsAdminUser: !!IsAdminUser,
    IsActive: !!IsActive,
    IsLocked: !!IsLocked,
    AdInstructorId: Number(AdInstructorId) || 0
  };

  if (password && password.trim() !== "") {
    fields.SystemUserPass = Repository.hashPassword(password);
    fields.SystemUserPassVault = Repository.encryptPasswordForVault(password);
  }

  try {
    const updated = await Repository.updateUser(id, fields);
    res.json({ ...safeSystemUser(updated), SystemUserPassDisplay: Repository.decryptPasswordFromVault(updated.SystemUserPassVault) });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/users/:id", requirePermission(11), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await Repository.deleteUser(id);
  res.json({ success: true });
});

// --- USER PERMISSIONS (FormSecurity) API ---

app.get("/api/permissions/forms", requirePermission(12), async (_req: Request, res: Response) => {
  res.json(await Repository.getFormNames());
});

app.get("/api/permissions", requirePermission(12), async (_req: Request, res: Response) => {
  res.json(await Repository.getFormSecurity());
});

app.post("/api/permissions", requirePermission(12), async (req: Request, res: Response) => {
  const userId = Number(req.body.SystemUserId);
  const formId = Number(req.body.FormNameId);
  if (!userId || !formId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  // Legacy FormSecurity has a row Id and no unique constraint on user/form. Preserve that CRUD model.
  const row = await Repository.createSecurity(userId, formId);
  res.status(201).json(row);
});

app.put("/api/permissions/:id", requirePermission(12), async (req: Request, res: Response) => {
  const legacyId = Number(req.params.id), userId = Number(req.body.SystemUserId), formId = Number(req.body.FormNameId);
  if (!legacyId || !userId || !formId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  try { res.json(await Repository.updateSecurity(legacyId, userId, formId)); }
  catch (e:any) { res.status(404).json({ error:e.message }); }
});

app.delete("/api/permissions/:id", requirePermission(12), async (req: Request, res: Response) => {
  const legacyId = Number(req.params.id);
  if (!legacyId) { res.status(400).json({ error: "الصلاحية غير موجودة" }); return; }
  await Repository.deleteSecurity(legacyId);
  res.json({ success: true });
});

// --- USER COLLEGE & SECTION ASSIGN (AdCollegeUserAssign) API ---

app.get("/api/user-scopes", requirePermission(15), async (_req: Request, res: Response) => {
  res.json(await Repository.getCollegeUserAssigns());
});

app.post("/api/user-scopes", requirePermission(15), async (req: Request, res: Response) => {
  const userId = Number(req.body.SystemUserId), collegeId = Number(req.body.AdCollegeId), sectionId = Number(req.body.AdSectionId);
  if (!userId || !collegeId || !sectionId) { res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" }); return; }
  const section = await Repository.getSectionById(sectionId);
  if (!section || section.AdCollegeId !== collegeId) { res.status(400).json({ error: "القسم العلمي المختار لا يتبع الكلية المختارة" }); return; }
  // Duplicated scope rows exist in the real legacy DB, therefore creation must not silently de-duplicate.
  res.status(201).json(await Repository.createUserAssign(userId, collegeId, sectionId));
});

app.put("/api/user-scopes/:id", requirePermission(15), async (req: Request, res: Response) => {
  const legacyId=Number(req.params.id), userId=Number(req.body.SystemUserId), collegeId=Number(req.body.AdCollegeId), sectionId=Number(req.body.AdSectionId);
  if(!legacyId||!userId||!collegeId||!sectionId){res.status(400).json({error:"الرجاء إدخال الحقول المطلوبة بالأحمر"});return;}
  const section=await Repository.getSectionById(sectionId);
  if(!section||section.AdCollegeId!==collegeId){res.status(400).json({error:"القسم العلمي المختار لا يتبع الكلية المختارة"});return;}
  try{res.json(await Repository.updateUserAssign(legacyId,userId,collegeId,sectionId));}
  catch(e:any){res.status(404).json({error:e.message});}
});

app.delete("/api/user-scopes/:id", requirePermission(15), async (req: Request, res: Response) => {
  const legacyId=Number(req.params.id);
  if(!legacyId){res.status(400).json({error:"صلاحية الكلية والقسم العلمي غير موجودة"});return;}
  await Repository.deleteUserAssign(legacyId);
  res.json({ success: true });
});

// --- EXCEL EXPORTS (STANDALONE REAL IMPLEMENTATION) ---
import * as XLSX from "xlsx";

app.get("/api/reports/excel/:type", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const reportType = req.params.type;
  const permissionByType: Record<string, number> = {
    ListofTeacherCourseExcel: 14, TeacherWithCourseExcel: 8, ScheduleExcel: 7
  };
  const required = permissionByType[reportType];
  if (!required) { res.status(400).json({ error: "نوع التقرير غير صحيح" }); return; }
  const perms = await Repository.getSecurityByUser(req.user.SystemUserId);
  if (!perms.some(p => p.FormNameId === required)) { res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذا القسم" }); return; }
  const { termId, collegeId, sectionId, instructorId, building, hall } = req.query;
  let resolvedTermId=Number(termId||0);
  if(!resolvedTermId){const terms=await Repository.getTerms();resolvedTermId=terms.reduce((max,t)=>Math.max(max,Number(t.AdTermId)||0),0);}
  let schedules = await Repository.getSchedulesByScope({termId:resolvedTermId,collegeId:Number(collegeId||0),sectionId:Number(sectionId||0)});
  schedules = filterByScope(req, schedules);

  if (instructorId) schedules = schedules.filter(s => s.AdInstructorId === parseInt(instructorId as string));
  if (building) schedules = schedules.filter(s => s.AdRoomCode === (building as string));
  if (hall) schedules = schedules.filter(s => s.AdRoomHall === (hall as string));

  // Load reference data once. The legacy implementation performed four database
  // lookups per schedule row (N+1), which became very expensive with a decade of data.
  const [colleges, sections, instructors, courses] = await Promise.all([
    Repository.getColleges(),
    Repository.getSections(),
    Repository.getInstructors(),
    Repository.getCourses(),
  ]);
  const collegeById = new Map(colleges.map(x => [x.AdCollegeId, x]));
  const sectionById = new Map(sections.map(x => [x.AdSectionId, x]));
  const instructorById = new Map(instructors.map(x => [x.AdInstructorId, x]));
  const courseById = new Map(courses.map(x => [x.AdCourseId, x]));

  const reportData = schedules.map(s => {
    const coll = collegeById.get(s.AdCollegeId);
    const sec = sectionById.get(s.AdSectionId);
    const inst = instructorById.get(s.AdInstructorId);
    const course = courseById.get(s.AdCourseId);

    const days = [
      s.fsunday ? "الأحد" : "",
      s.fmonday ? "الاثنين" : "",
      s.ftuesday ? "الثلاثاء" : "",
      s.fwednesday ? "الأربعاء" : "",
      s.fthursday ? "الخميس" : ""
    ].filter(Boolean).join(" - ");

    return {
      "الكلية": coll?.AdCollegeName || "",
      "القسم العلمي": sec?.AdSectionName || "",
      "رمز المقرر": course?.CourseCode || "",
      "المقرر الدراسي": s.AdCourseName || course?.CourseName || "",
      "الشعبة": s.SCode || "",
      "الوحدات": course?.CourseCredit || 0,
      "الساعات": course?.CourseHours || 0,
      "أستاذ المقرر": inst?.AdInstructorName || "",
      "الرقم المدني": inst?.AdInstructorCivil || "",
      "الوقت": `${s.fstarttime} - ${s.fendtime}`,
      "الأيام": days,
      "المبنى": s.AdRoomCode || "",
      "القاعة": s.AdRoomHall || ""
    };
  });

  const ws = XLSX.utils.json_to_sheet(reportData);
  ws["!cols"] = [
    {wch:22},{wch:24},{wch:14},{wch:30},{wch:10},{wch:9},{wch:9},{wch:24},{wch:16},{wch:18},{wch:24},{wch:12},{wch:12}
  ];
  ws["!autofilter"] = { ref: ws["!ref"] || "A1:M1" };
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "الجدول الدراسي");

  // Generate buffer
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=schedule_report_${reportType}.xlsx`);
  res.send(excelBuffer);
});


// ============================================================================
// NATURAL QUERY — the command palette answers instead of filtering
// Rules only: the same sentence always resolves to the same rows, offline.
// ============================================================================

app.get("/api/search/natural", requireAnyPermission([7, 8, 9, 10, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = parseNaturalQuery(String(req.query.q || ""));
  if (parsed.intent === "unknown") { res.json({ intent: "unknown", title: "", rows: [] }); return; }

  const { collegeId, sectionId, termId } = await resolveSmartContext(req);
  if (!termId) { res.json({ intent: parsed.intent, title: "", rows: [] }); return; }

  const [scoped, courses, instructors] = await Promise.all([
    scopedScheduleUniverse(collegeId, sectionId, termId),
    Repository.getCourses(),
    Repository.getInstructors()
  ]);
  const { rows, universe } = scoped;
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const onDay = (row: FSchedule, day: number | null) => day === null || Boolean((row as any)[DAY_FLAGS[day]]);
  const atTime = (row: FSchedule, time: string | null) => {
    if (!time) return true;
    const point = toMinutes(time);
    return toMinutes(row.fstarttime) <= point && toMinutes(row.fendtime) > point;
  };
  const shape = (row: FSchedule) => ({
    id: row.id,
    code: courseById.get(row.AdCourseId)?.CourseCode || "",
    name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
    section: row.SCode,
    instructor: instructorById.get(row.AdInstructorId)?.AdInstructorName || "",
    start: row.fstarttime, end: row.fendtime,
    room: row.AdRoomCode || "", hall: row.AdRoomHall || "",
    days: DAY_FLAGS.map((flag, index) => ((row as any)[flag] ? DAY_LABELS[index] : null)).filter(Boolean).join(" · ")
  });
  const dayLabel = parsed.day === null ? "" : DAY_LABELS[parsed.day];
  const whenLabel = [dayLabel, parsed.time].filter(Boolean).join(" · ");

  if (parsed.intent === "freeRooms") {
    // A room is free when nothing in the whole term occupies it at that moment.
    const known = new Map<string, { room: string; hall: string }>();
    universe.forEach(row => {
      if (!row.AdRoomCode) return;
      known.set(`${row.AdRoomCode}|${row.AdRoomHall}`, { room: row.AdRoomCode, hall: row.AdRoomHall });
    });
    const busy = new Set(
      universe.filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
        .map(row => `${row.AdRoomCode}|${row.AdRoomHall}`)
    );
    const free = [...known.entries()].filter(([key]) => !busy.has(key)).map(([, value]) => value);
    res.json({
      intent: "freeRooms",
      title: `قاعات متاحة${whenLabel ? ` · ${whenLabel}` : ""}`,
      count: free.length,
      rooms: free.slice(0, 60),
      rows: []
    });
    return;
  }

  if (parsed.intent === "room") {
    const matched = rows
      .filter(row => String(row.AdRoomCode || "").includes(parsed.room || ""))
      .filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
      .sort((a, b) => a.fstarttime.localeCompare(b.fstarttime));
    res.json({ intent: "room", title: `قاعة ${parsed.room}${whenLabel ? ` · ${whenLabel}` : ""}`, count: matched.length, rows: matched.slice(0, 40).map(shape) });
    return;
  }

  const named = parsed.name
    ? instructors.filter(row => String(row.AdInstructorName || "").includes(parsed.name as string))
    : [];
  const targetIds = new Set(named.map(row => row.AdInstructorId));

  if (parsed.intent === "gaps" && targetIds.size) {
    const dayIndexes = parsed.day === null ? [0, 1, 2, 3, 4] : [parsed.day];
    const gaps: Array<{ day: string; from: string; to: string; minutes: number }> = [];
    for (const index of dayIndexes) {
      const busy = universe
        .filter(row => targetIds.has(row.AdInstructorId) && (row as any)[DAY_FLAGS[index]])
        .sort((a, b) => toMinutes(a.fstarttime) - toMinutes(b.fstarttime));
      for (let i = 1; i < busy.length; i++) {
        const gap = toMinutes(busy[i].fstarttime) - toMinutes(busy[i - 1].fendtime);
        if (gap >= 30) gaps.push({ day: DAY_LABELS[index], from: busy[i - 1].fendtime, to: busy[i].fstarttime, minutes: gap });
      }
    }
    res.json({
      intent: "gaps",
      title: `فراغات ${named[0]?.AdInstructorName || parsed.name}${dayLabel ? ` · ${dayLabel}` : ""}`,
      count: gaps.length,
      gaps: gaps.slice(0, 30),
      rows: []
    });
    return;
  }

  const matched = rows
    .filter(row => (targetIds.size ? targetIds.has(row.AdInstructorId) : true))
    .filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
    .sort((a, b) => a.fstarttime.localeCompare(b.fstarttime));
  res.json({
    intent: targetIds.size ? "instructor" : "time",
    title: targetIds.size
      ? `${named[0]?.AdInstructorName}${whenLabel ? ` · ${whenLabel}` : ""}`
      : `مواعيد${whenLabel ? ` · ${whenLabel}` : ""}`,
    count: matched.length,
    rows: matched.slice(0, 40).map(shape)
  });
});

/**
 * Room load and free windows.
 *
 * "Is this room free?" cannot be answered from one department's rows — a hall
 * booked by another college is still occupied. The occupancy grid is therefore
 * built from the whole term, but it carries only room, day and time: no course,
 * no instructor, nothing that belongs to another department. Rooms the caller
 * owns are marked so the screen can separate "my load" from "campus load".
 */
app.get("/api/reports/room-load", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  let termId = Number(req.query.termId || 0);
  if (!termId) { const terms = await Repository.getTerms(); termId = terms.reduce((max, t) => Math.max(max, Number(t.AdTermId) || 0), 0); }

  const { rows, universe } = await scopedScheduleUniverse(collegeId, sectionId, termId);
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const mineKeys = new Set(rows.filter(row => row.AdRoomCode).map(row => `${row.AdRoomCode}|${row.AdRoomHall}`));

  const rooms = new Map<string, { room: string; hall: string; mine: boolean; busy: Array<{ day: number; from: number; to: number; mine: boolean }> }>();
  const mineIds = new Set(rows.map(row => row.id));
  universe.forEach(row => {
    if (!row.AdRoomCode) return;
    const key = `${row.AdRoomCode}|${row.AdRoomHall}`;
    const entry = rooms.get(key) || { room: String(row.AdRoomCode), hall: String(row.AdRoomHall || ""), mine: mineKeys.has(key), busy: [] };
    const from = toMinutes(row.fstarttime), to = toMinutes(row.fendtime);
    if (to > from) {
      DAY_FLAGS.forEach((flag, day) => {
        if ((row as any)[flag]) entry.busy.push({ day, from, to, mine: mineIds.has(row.id) });
      });
    }
    rooms.set(key, entry);
  });

  res.json({
    termId,
    dayStart: 8 * 60,
    dayEnd: 21 * 60,
    rooms: [...rooms.values()].sort((a, b) => a.room.localeCompare(b.room, "ar") || a.hall.localeCompare(b.hall, "ar"))
  });
});

// ============================================================================
// READ-ONLY PUBLICATION — share links, public page, calendar subscription
// A token is a long random string, expires on its own, and never exposes a
// civil ID, phone number, account or any scope beyond the one it was made for.
// ============================================================================

const SHARE_DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const SHARE_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const SHARE_ICS_DAYS = ["SU", "MO", "TU", "WE", "TH"];
const SHARE_MAX_DAYS = 180;

function shareDayIndexes(row: FSchedule): number[] {
  return SHARE_DAY_KEYS.map((key, index) => (row as any)[key] ? index : -1).filter(index => index >= 0);
}

/** Resolves a token to its live scope, or explains precisely why it cannot be read. */
async function resolveShareToken(token: string) {
  const link = await Repository.getShareLink(String(token || ""));
  if (!link || link.revoked) return { error: "الرابط غير موجود أو تم إيقافه", status: 404 as const };
  if (new Date(link.expiresAt).getTime() < Date.now()) return { error: "انتهت صلاحية هذا الرابط", status: 410 as const };
  return { link };
}

async function buildSharePayload(link: ScheduleShareLink) {
  const [rows, courses, instructors, sections, colleges, terms] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId: link.AdCollegeId, sectionId: link.AdSectionId, termId: link.AdTermId }),
    Repository.getCourses(), Repository.getInstructors(), Repository.getSections(), Repository.getColleges(), Repository.getTerms()
  ]);
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));
  return {
    label: link.label,
    college: colleges.find(row => row.AdCollegeId === link.AdCollegeId)?.AdCollegeName || "",
    section: sections.find(row => row.AdSectionId === link.AdSectionId)?.AdSectionName || "",
    term: terms.find(row => row.AdTermId === link.AdTermId)?.AdTermName || "",
    expiresAt: link.expiresAt,
    showInstructors: link.showInstructors !== false,
    rows: rows
      .slice()
      .sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)))
      .map(row => ({
        id: row.id,
        code: courseById.get(row.AdCourseId)?.CourseCode || "",
        name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
        section: row.SCode || "",
        start: row.fstarttime,
        end: row.fendtime,
        days: shareDayIndexes(row),
        room: row.AdRoomCode || "",
        hall: row.AdRoomHall || "",
        instructor: link.showInstructors !== false ? (instructorById.get(row.AdInstructorId)?.AdInstructorName || "") : ""
      }))
  };
}

app.get("/api/share", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.json(await Repository.getShareLinks(collegeId, sectionId, termId));
});

app.post("/api/share", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const days = Math.min(SHARE_MAX_DAYS, Math.max(1, Number(req.body?.days || 30)));
  const [sections, terms] = await Promise.all([Repository.getSections(), Repository.getTerms()]);
  const label = `${sections.find(row => row.AdSectionId === sectionId)?.AdSectionName || "قسم"} · ${terms.find(row => row.AdTermId === termId)?.AdTermName || ""}`.trim();
  const link = await Repository.createShareLink({
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    label,
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
    SystemUserId: Number(req.user!.SystemUserId),
    userName: String(req.user!.Name || ""),
    showInstructors: req.body?.showInstructors !== false
  });
  res.status(201).json(link);
});

app.delete("/api/share/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const link = await Repository.getShareLink(String(req.params.id));
  if (!link) { res.status(404).json({ error: "الرابط غير موجود" }); return; }
  if (!isScopeAllowed(req, link.AdCollegeId, link.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  await Repository.revokeShareLink(link.id);
  res.json({ ok: true });
});

// --- Public surface (no account) --------------------------------------------

app.get("/api/public/schedule/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(await buildSharePayload(resolved.link));
});

app.get("/api/public/ics/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }
  const payload = await buildSharePayload(resolved.link);
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);

  // Anchor the series on the coming week and repeat it for the rest of the term.
  const anchor = new Date(); anchor.setHours(0, 0, 0, 0);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const escape = (value: string) => String(value || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SCHEDULE//Academic Workspace//AR",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(payload.label || "الجدول الدراسي")}`,
    "X-WR-TIMEZONE:Asia/Kuwait"
  ];
  for (const row of payload.rows) {
    for (const dayIndex of row.days) {
      const first = new Date(anchor);
      first.setDate(first.getDate() + ((dayIndex - first.getDay() + 7) % 7));
      const [sh, sm] = String(row.start || "08:00").split(":").map(Number);
      const [eh, em] = String(row.end || "09:00").split(":").map(Number);
      const startAt = new Date(first); startAt.setHours(sh || 0, sm || 0, 0, 0);
      const endAt = new Date(first); endAt.setHours(eh || 0, em || 0, 0, 0);
      if (endAt <= startAt) endAt.setTime(startAt.getTime() + 3600000);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${row.id}-${dayIndex}@schedule`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(startAt)}`,
        `DTEND:${stamp(endAt)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${SHARE_ICS_DAYS[dayIndex]};COUNT=16`,
        `SUMMARY:${escape(`${row.code} · ${row.name}`)}`,
        `LOCATION:${escape([row.room, row.hall].filter(Boolean).join(" / "))}`,
        `DESCRIPTION:${escape([row.section && `شعبة ${row.section}`, row.instructor].filter(Boolean).join(" · "))}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="schedule.ics"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(lines.join("\r\n"));
});

/** Standalone read-only page: one file, no bundle, works on any phone. */
app.get("/s/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  res.setHeader("Cache-Control", "no-store");
  res.type("html; charset=utf-8");
  if ("error" in resolved) {
    res.status(resolved.status).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SCHEDULE</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a100f;color:#eef2ee;font-family:-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif}p{font-size:15px;color:#93a09a}</style></head><body><div style="text-align:center"><div style="font:600 13px/1 system-ui;letter-spacing:.24em;color:#c79b5f">SCHEDULE</div><p>${esc(resolved.error)}</p></div></body></html>`);
    return;
  }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  const payload = await buildSharePayload(resolved.link);
  const byDay = SHARE_DAY_NAMES.map((name, index) => ({
    name,
    rows: payload.rows.filter(row => row.days.includes(index)).sort((a, b) => String(a.start).localeCompare(String(b.start)))
  })).filter(day => day.rows.length);
  const expires = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(payload.expiresAt));
  const icsUrl = `/api/public/ics/${encodeURIComponent(resolved.link.id)}`;

  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a100f">
<meta name="robots" content="noindex,nofollow">
<title>${esc(payload.section)} · ${esc(payload.term)}</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<style>
:root{--bg:#0a100f;--card:#121a18;--line:#212b28;--ink:#eef2ee;--muted:#93a09a;--accent:#69c0a8;--brass:#d0a663}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:24px 18px 56px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.mark{font:600 12px/1 system-ui;letter-spacing:.24em;color:var(--brass)}
h1{margin:18px 0 4px;font-size:26px;font-weight:600;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:14px}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 8px}
.tools a{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:0 16px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none;font-size:14px;font-weight:600}
.tools a.primary{background:var(--accent);border-color:var(--accent);color:#04100d}
section{margin-top:26px}
h2{margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:.1em;color:var(--brass)}
article{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}
article:last-child{border-bottom:0}
time{direction:ltr;font:600 14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);white-space:nowrap}
time small{display:block;color:var(--muted);font-weight:400}
b{display:block;font-size:15px;font-weight:600}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.meta span{padding:2px 9px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);font-size:12px}
.code{direction:ltr;unicode-bidi:isolate;color:var(--brass);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.empty{padding:48px 0;text-align:center;color:var(--muted)}
@media print{body{background:#fff;color:#000}.tools{display:none}article,header,footer{border-color:#ccc}.meta span{border-color:#ccc;background:#fff}time{color:#000}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="mark">SCHEDULE</span>
    <span class="sub">${esc(payload.college)}</span>
  </header>
  <h1>${esc(payload.section)}</h1>
  <p class="sub">${esc(payload.term)}</p>
  <div class="tools">
    <a class="primary" href="${icsUrl}">إضافة إلى التقويم</a>
    <a href="javascript:window.print()">طباعة</a>
  </div>
  ${byDay.length ? byDay.map(day => `<section>
    <h2>${esc(day.name)}</h2>
    ${day.rows.map(row => `<article>
      <time>${esc(row.start)}<small>${esc(row.end)}</small></time>
      <div>
        <b>${esc(row.name)}</b>
        <div class="meta">
          ${row.code ? `<span class="code">${esc(row.code)}</span>` : ""}
          ${row.section ? `<span>شعبة ${esc(row.section)}</span>` : ""}
          ${row.room || row.hall ? `<span>${esc([row.room, row.hall].filter(Boolean).join(" / "))}</span>` : ""}
          ${row.instructor ? `<span>${esc(row.instructor)}</span>` : ""}
        </div>
      </div>
    </article>`).join("")}
  </section>`).join("") : `<p class="empty">لا توجد مواعيد منشورة</p>`}
  <footer>
    <span>عرض للقراءة فقط</span>
    <span>ينتهي ${esc(expires)}</span>
  </footer>
</div>
</body>
</html>`);
});

// --- VITE DEV SERVER OR STATIC SERVING ---

async function startServer() {
  // Wait for the data layer before accepting any requests. In Firestore mode this also
  // completes the one-time import of the verified legacy snapshot when the target is empty.
  try {
    await initDatabase();
  } catch (error) {
    console.error("Database initialization failed. Server will continue to serve UI, but APIs will return 503.", error);
    globalDbError = error instanceof Error ? error : new Error(String(error));
  }

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  const isProduction = process.env.NODE_ENV === "production" || 
                       process.env.npm_lifecycle_event === "start" || 
                       process.argv[1]?.endsWith("server.cjs");

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Hashed build assets and self-hosted fonts never change under the same
    // name, so they can be cached for a year. index.html must stay revalidated
    // or a release would never reach an open tab.
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        if (/\.(?:js|css|woff2?|png|svg|jpg|webp)$/i.test(filePath) && !filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Server initialization failed with unrecoverable error:", error);
  process.exitCode = 1;
});
