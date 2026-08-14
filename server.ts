import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import path from "path";
import { configureRuntimeEnvironment } from "./src/server/runtimeEnv";
import { randomBytes } from "crypto";
import { activeDataMode, initDatabase, Repository } from "./src/db/repository";
import { clearScheduleCacheQuietly, onSchedulesInvalidated } from "./src/db/referenceCache";
import { isCloudRunRuntime } from "./src/db/snapshot";
import { validateCivilId } from "./src/utils/civilId";
import { activeDays, analyzeSchedule, autoScheduleProposal, compareTerms, conflictSolutions, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "./src/utils/scheduleIntelligence";
import { buildScheduleGenome, buildWarRoom, evaluateScheduleConstraints, forecastScheduleMove, runScheduleAutopilot } from "./src/utils/scheduleInnovation";
import { buildConflictTopology, buildDecisionMemoryInsight, buildFairnessEngine, buildFragilityMap, buildOneMinuteBrief, buildRoomResilience, buildScheduleHealth2, buildSchedulePulse, createEmergencyPlans, explainScheduleDecision } from "./src/utils/livingSchedule";
import type { FSchedule, ScheduleShareLink } from "./src/types";
import { DAY_FLAGS, DAY_LABELS, parseNaturalQuery } from "./src/utils/naturalQuery";
import { coerceScopeValues } from "./src/utils/scopeContext";
import { learnAll } from "./src/utils/courseNature";
import { firstLast } from "./src/utils/weekVisual";
import { Campus, DEFAULT_TRAVEL_MINUTES, SAME_BUILDING_MINUTES, campusOf, interCampusMinutes } from "./src/utils/campusTravel";
import {
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_END_TIME,
  SCHEDULE_DAY_START,
  SCHEDULE_DAY_START_TIME,
  SCHEDULE_SLOT_MINUTES,
  withinScheduleDay,
} from "./src/utils/scheduleTime";

// Resolve environment/private paths before database initialization.
configureRuntimeEnvironment();

const app = express();
const PORT = process.env.APPLET_ID ? 3000 : Number(process.env.PORT || 3000);

/**
 * A rejected promise must reach the error handler, not the process.
 *
 * Express 4 predates async handlers: it calls them, ignores the promise they
 * return, and never learns that one rejected. The rejection then rises as an
 * unhandled rejection, which modern Node treats as fatal — so one slow moment
 * from Firestore could kill an instance mid-day, dropping every request in
 * flight and every live schedule stream with it.
 *
 * Rather than remember a wrapper at four hundred call sites, the routing verbs
 * are taught it once, here, before any route is registered. Handlers keep their
 * shape: a four-argument error handler is left exactly as written, a returned
 * promise gets `.catch(next)`, and a synchronous throw is forwarded too. Any
 * properties a middleware carries (a mounted router, Vite's connect app) are
 * copied onto the wrapper so nothing that inspects them notices the difference.
 */
const asyncSafe = (handler: any) => {
  if (typeof handler !== "function" || handler.length >= 4) return handler;
  const wrapped = function (this: unknown, req: Request, res: Response, next: NextFunction) {
    try {
      const outcome = handler.call(this, req, res, next);
      if (outcome && typeof outcome.then === "function") outcome.catch(next);
      return outcome;
    } catch (error) {
      next(error);
      return undefined;
    }
  };
  return Object.assign(wrapped, handler);
};
for (const verb of ["get", "post", "put", "patch", "delete", "all", "use"] as const) {
  const original = (app as any)[verb].bind(app);
  (app as any)[verb] = (...args: any[]) => original(...args.map(asyncSafe));
}
// The last line of defence: whatever escapes everything above is written down,
// and the university's server keeps serving.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandled-rejection] الخادم مستمر في العمل:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[uncaught-exception] الخادم مستمر في العمل:", error?.stack || error);
});

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
// Every text response leaves the building gzipped. The largest payloads here —
// a term's schedule rows, the intelligence readings, the app bundle itself —
// are JSON and JavaScript, which compress to a quarter of their size or less;
// on Cloud Run the wire is the slow part, not the CPU. Event streams are left
// alone (compression buffers them into silence), and anything under 1KB is not
// worth the header.
app.use(compression({
  threshold: 1024,
  filter: (req: Request, res: Response) => {
    const type = String(res.getHeader("Content-Type") || "");
    if (type.includes("text/event-stream")) return false;
    return compression.filter(req, res);
  },
}));
app.use(express.json({ limit: "1mb" }));

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
  /** FormName ids this session holds, resolved once with the identity. */
  permissions?: number[];
}

/**
 * Who is asking, resolved once instead of three times per request.
 *
 * Identifying the caller meant three sequential database round trips — the
 * session, then the user, then their scopes — and it ran for every request,
 * including stylesheets and fonts. On a hosted database that was roughly half a
 * second of waiting before any handler had started, on every single call, which
 * is most of what made the application feel slow.
 *
 * The answer is now held for a few seconds per session. It is dropped the
 * moment the person signs out, and whenever an account or its scopes are
 * edited, so a revoked or locked account cannot keep working from memory.
 */
// Twenty seconds was too tight: past it, the first request of every burst paid
// for three database round trips again, which is exactly the half second the
// cache existed to remove. Two minutes still bounds how long a revoked account
// could linger, and sign-out and account edits drop the entry immediately.
const AUTH_CACHE_MS = 120_000;
const authCache = new Map<string, { at: number; userId: number; user: any; scopes: any[]; permissions: number[] }>();
export function forgetAuthSession(sessionId?: string) {
  if (sessionId) authCache.delete(sessionId);
  else authCache.clear();
}
Repository.onIdentityChanged?.(() => authCache.clear());

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookies = getCookies(req);
  const sessionId = cookies["session_id"];
  if (!sessionId) { next(); return; }

  const cached = authCache.get(sessionId);
  if (cached && Date.now() - cached.at < AUTH_CACHE_MS) {
    req.userId = cached.userId;
    req.user = cached.user;
    req.scopes = cached.scopes;
    req.permissions = cached.permissions;
    next();
    return;
  }

  const sess = await Repository.getSession(sessionId);
  if (sess) {
    req.userId = sess.userId;
    const user = await Repository.getUserById(sess.userId);
    if (user && user.IsActive && !user.IsLocked && !user.IsDeleted) {
      req.user = user;
      /**
       * The permission list joins the identity, instead of being re-read on
       * every single gated call.
       *
       * `requirePermission` runs in front of nearly every route, and it was the
       * one identity read with no cache — so each API call still paid for a
       * Firestore round trip even when the user and scopes were already known.
       * Every permission write announces an identity change, which clears this
       * cache immediately, so a revoked screen closes as fast as it ever did.
       */
      const [assigns, security] = await Promise.all([
        Repository.getUserAssigns(user.SystemUserId),
        Repository.getSecurityByUser(user.SystemUserId),
      ]);
      req.scopes = assigns;
      req.permissions = security.map(item => Number(item.FormNameId));
      authCache.set(sessionId, { at: Date.now(), userId: sess.userId, user, scopes: req.scopes || [], permissions: req.permissions });
      if (sess.expiresAt - Date.now() < 10 * 60 * 1000)
        await Repository.refreshSession(sessionId, SERVER_IDLE_SESSION_MS);
      next();
      return;
    }
    authCache.delete(sessionId);
    await Repository.deleteSession(sessionId);
  } else {
    authCache.delete(sessionId);
  }
  next();
}

/**
 * The one gate every API call passes before anything else.
 *
 * Registered at load, so it sits ahead of every route: if the database never
 * came up, no handler runs and no caller is left guessing at a Firestore stack
 * trace. The interface itself is untouched — it loads and shows this reason.
 */
let databaseDown: string | null = null;
app.use("/api", (_req, res, next) => {
  if (!databaseDown) { next(); return; }
  res.status(503).type("application/json; charset=utf-8").send(JSON.stringify({
    error: "الخدمة متوقفة: تعذر الاتصال بقاعدة البيانات الحقيقية.",
    detail: databaseDown
  }));
});

// Only the API needs to know who is calling. Stylesheets, fonts and the shell
// were paying for an identity lookup they never read.
app.use("/api", authMiddleware as express.RequestHandler);

// Additive audit trail for successful state-changing API calls. No request body is stored,
// so passwords and other sensitive values never enter the operational history.
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  /**
   * Sign-ins belong in the record, and so do refusals.
   *
   * The trail used to skip everything under /auth/ and everything that failed —
   * so the two questions an investigation actually opens with ("who was in the
   * system that afternoon?" and "did anyone try and get turned away?") had no
   * answer at all. Login, logout and denied attempts are recorded now; the
   * heartbeat is not, because a heartbeat every four minutes per person would
   * bury the log it is written in.
   */
  /**
   * The path is read NOW, not when the response finishes.
   *
   * Express rewrites `req.url` while dispatching mounted middleware and puts it
   * back afterwards — so by the time the `finish` event fires, `req.path` is the
   * full original path again. Reading it there labelled every sign-in as a
   * sign-out, and derived the entity from "api" instead of the collection.
   */
  const routePath = req.path;
  const authKind = routePath === "/auth/login" ? "login" : routePath === "/auth/logout" ? "logout" : null;
  const authEvent = authKind !== null;
  const skip = (routePath.startsWith("/auth/") && !authEvent) || routePath.endsWith("/check-conflicts");
  if (!mutating || skip) { next(); return; }
  const startedUser = req.user ? { id: Number(req.user.SystemUserId), name: String(req.user.Name || req.user.SystemUserLogin || "") } : null;
  res.on("finish", () => {
    // A login has no `req.user` when it starts — the account is only known once
    // it succeeds — so the auth trail reads the id the handler left behind.
    const actor = startedUser
      || (authEvent && res.locals?.auditUser ? res.locals.auditUser as { id: number; name: string } : null)
      || (authEvent ? { id: 0, name: String(req.body?.username || "مجهول") } : null);
    if (!actor) return;
    const refused = res.statusCode >= 400;
    // Everything that changed state is kept; of the refusals, only the ones
    // worth investigating — a rejected login, a permission wall, a conflict.
    if (refused && !authEvent && ![403, 409].includes(res.statusCode)) return;
    if (!refused && !startedUser && !authEvent) return;
    const pieces = routePath.split("/").filter(Boolean);
    const entity = pieces[0] || "system";
    const entityId = pieces.length > 1 ? pieces[pieces.length - 1] : undefined;
    const action = routePath.includes("/safety-net/") && routePath.endsWith("/undo")
      ? "تراجع"
      : routePath.includes("/versions/") && routePath.endsWith("/restore")
        ? "استرجاع"
        : routePath.includes("/drafts/") && routePath.endsWith("/publish")
          ? "نشر"
          : routePath.includes("/copy")
            ? "نسخ"
            : req.method === "POST"
              ? "إضافة"
              : req.method === "DELETE"
                ? "حذف"
                : "تعديل";
    const finalAction = authKind
      ? (authKind === "login" ? (refused ? "محاولة دخول مرفوضة" : "تسجيل دخول") : "تسجيل خروج")
      : refused
        ? (res.statusCode === 403 ? `${action} — مرفوض (خارج الصلاحية)` : `${action} — مرفوض (تعارض)`)
        : action;
    void Repository.createAuditLog({
      SystemUserId: actor.id, userName: actor.name, method: req.method, path: req.originalUrl,
      action: finalAction, entity, entityId,
      // What actually changed, when the handler was able to say. A log that
      // records "موعد #418 عُدّل" answers nothing; the question is always
      // "from what, to what".
      changes: (res.locals?.auditChanges as string | undefined) || undefined,
      status: res.statusCode
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
    // Resolved once per session by authMiddleware; the fallback covers a caller
    // that reached here without passing through it.
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    const hasPerm = granted.includes(formNameId);
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
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    if (!granted.some(id => formNameIds.includes(id))) {
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
    else if (!withinScheduleDay(timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime))) errors.push(`السطر ${index + 1}: وقت المحاضرة يجب أن يكون بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`);
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
    // The trail records who was tried, not merely that something failed.
    res.locals.auditUser = { id: Number(user.SystemUserId), name: String(user.Name || user.SystemUserLogin || "") };
    res.status(400).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    return;
  }
  res.locals.auditUser = { id: Number(user.SystemUserId), name: String(user.Name || user.SystemUserLogin || "") };

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
    // Drop the remembered identity before the record, so no request in flight
    // can be served from memory after the person has signed out.
    forgetAuthSession(sessionId);
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
  // The interface says out loud when it is not on the university's database.
  res.json({ user: safeUser, permissions, scopes, data: activeDataMode() });
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
  // `weekend` lets the screen say so out loud instead of labelling Sunday's
  // lectures with Friday's date, which is what the client's own clock did.
  const weekday = new Date().getDay();
  const weekend = weekday === 5 || weekday === 6;
  let dayKey: "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday" = "fsunday";
  let dayName = weekday === 0 ? "الأحد" : "";
  if (weekday === 1) { dayKey = "fmonday"; dayName = "الاثنين"; }
  if (weekday === 2) { dayKey = "ftuesday"; dayName = "الثلاثاء"; }
  if (weekday === 3) { dayKey = "fwednesday"; dayName = "الأربعاء"; }
  if (weekday === 4) { dayKey = "fthursday"; dayName = "الخميس"; }

  const daySchedules = latestTermSchedules
    .filter(row => Boolean(row[dayKey]))
    .sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)));

  /**
   * The administrator sees the university; everyone else sees their department.
   *
   * The legacy table filtered by AdCollegeUserAssign for everyone, including
   * IsAdminUser — and the main administrator normally holds no assignment rows
   * at all, so the day list came back empty. The result was a dashboard that
   * said "لا محاضرات اليوم" directly beside a tile counting thousands of them:
   * two numbers from the same page contradicting each other, and the one the
   * reader trusts is the one that is wrong. A coordinator's view is unchanged.
   */
  const visibleTableRows = req.user.IsAdminUser
    ? daySchedules
    : daySchedules.filter(row => assignedSectionIds.has(Number(row.AdSectionId)));
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

  /**
   * The same headline numbers, one term earlier.
   *
   * A count on its own says how big the term is; next to the term before it,
   * the same count says which way the department is moving. Only the figures
   * that are comparable are returned — appointments, halls and teaching staff
   * within the same scope — so the dashboard can show a direction without
   * inventing a trend for things that do not have one.
   */
  const scopeRows = (list: any[]) => req.user.IsAdminUser
    ? list
    : (linkedInstructorId
      ? list.filter(row => row.AdInstructorId === linkedInstructorId)
      : list.filter(row => assignedSectionIds.has(Number(row.AdSectionId))));

  // The last four terms, oldest first. A single comparison shows a jump; four
  // points show a direction, which is the thing a coordinator is deciding
  // against. The reads are cached, so this costs nothing after the first visit.
  const recentTermIds = terms
    .map(term => Number(term.AdTermId) || 0)
    .filter(id => id && id <= latestTermId)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reverse();
  const history = await Promise.all(recentTermIds.map(async termId => {
    const termRows = termId === latestTermId
      ? latestTermSchedules
      : await Repository.getSchedulesByScope({ termId });
    const scoped = scopeRows(termRows);
    return {
      termId,
      termName: terms.find(term => Number(term.AdTermId) === termId)?.AdTermName || "",
      schedules: scoped.length,
      rooms: new Set(scoped.map(roomKey).filter(key => key !== " / ")).size,
      instructors: new Set(scoped.map(row => row.AdInstructorId)).size
    };
  }));
  const previous = history.length > 1 ? history[history.length - 2] : null;

  res.json({
    previous,
    history,
    metrics,
    latestTermId,
    latestTermName: latestTerm?.AdTermName || "",
    dayName,
    // Friday and Saturday are not taught. The list below is Sunday's, by legacy
    // design — so the screen is told plainly, instead of stamping today's date
    // on another day's lectures.
    weekend,
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
  const profile=await Repository.upsertCampusMobilityProfile({AdCollegeId:collegeId,defaultTravelMinutes:Math.max(1,Math.min(120,Number(req.body?.defaultTravelMinutes)||DEFAULT_TRAVEL_MINUTES)),sameBuildingMinutes:Math.max(0,Math.min(30,Number(req.body?.sameBuildingMinutes)||SAME_BUILDING_MINUTES)),pairs,updatedAt:new Date().toISOString(),updatedBy:req.user.Name});
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

/**
 * The teaching register.
 *
 * The whole register is a hundred kilobytes and every screen was loading it to
 * name the dozen people who teach in one department. Passing `sectionId`
 * answers with the staff who actually appear in that department's term, which
 * is what a picker opens on; the full register is still one request away for
 * the moment someone searches beyond their own department; that search itself
 * returns at most forty matching people instead of the whole register.
 */
app.get("/api/instructors", requireAnyPermission([3, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = Number(req.query.sectionId || 0);
  const collegeId = Number(req.query.collegeId || 0);
  const termId = Number(req.query.termId || 0);
  if (sectionId) {
    const canReadSection = Boolean(req.user?.IsAdminUser || req.scopes?.some(scope => scope.AdSectionId === sectionId));
    if (!canReadSection) { res.status(403).json({ error: "القسم خارج نطاق صلاحيتك" }); return; }
    res.json(await Repository.getInstructorsByScope(sectionId, termId));
    return;
  }

  // A wider lookup is an explicit search, never an eager 743-row payload.
  const query = String(req.query.q || "").trim();
  const limit = Math.max(1, Math.min(60, Number(req.query.limit || 40)));
  if (collegeId && !req.user?.IsAdminUser && !req.scopes?.some(scope => scope.AdCollegeId === collegeId)) {
    res.status(403).json({ error: "الكلية خارج نطاق صلاحيتك" });
    return;
  }
  const instructors = collegeId
    ? await Repository.getInstructorsByScheduleScope({ collegeId, termId })
    : await Repository.getInstructors();
  if (!query) { res.json(instructors); return; }
  const fold = (value: string) => String(value || "")
    .replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^ء-ي0-9a-zA-Z ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const needle = fold(query);
  res.json(instructors.filter(person => {
    const name = fold(person.AdInstructorName);
    return name.includes(needle) || String(person.AdInstructorCivil || "").includes(needle);
  }).slice(0, limit));
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
  const statusRaw = req.body?.AdInstructorStatus;
  const status = statusRaw === "retired" || statusRaw === "sabbatical" ? statusRaw : null;
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
    const updated = await Repository.updateInstructor(id, AdInstructorCivil, AdInstructorName, AdInstructorMobile || "", status);
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

/**
 * The course catalogue.
 *
 * The record is already lean — code, name, credit, hours, capacity — so there
 * is nothing to trim per field. What was expensive was the *number* of records:
 * screens asked for all 1,400 courses in the university to resolve the handful
 * belonging to one department. Passing `sectionId` answers with that department
 * alone, which is the same information at a fortieth of the size.
 */
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
function schedulePayloadIssues(row:any){const issues:string[]=[];if(!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))issues.push("يجب اختيار يوم واحد على الأقل للمحاضرة");if(row?.fstarttime&&row?.fendtime){const start=timeToMinutes(String(row.fstarttime)),end=timeToMinutes(String(row.fendtime));if(end<=start)issues.push("وقت النهاية يجب أن يكون بعد وقت البداية");else if(!withinScheduleDay(start,end))issues.push(`وقت المحاضرة يجب أن يكون بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`);}return issues;}
/**
 * Who does this hall belong to?
 *
 * Nothing in the data says "this hall is the English department's", but the
 * history says it plainly: if four fifths of everything ever booked there
 * belongs to one department, that is whose hall it is. Answering this needs
 * only the room — not a day, not a time — so a coordinator learns they have
 * reached into another department's hall the moment they type it, instead of
 * after filling in the rest of the form.
 */
async function roomOwnership(roomCodeRaw:unknown,roomHallRaw:unknown,collegeId:number,sectionId:number){
  const roomCode=String(roomCodeRaw||"").trim(),roomHall=String(roomHallRaw||"").trim();
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
  // A department that already teaches here regularly is a co-tenant, not a guest.
  const current=ranked.find(x=>x.collegeId===collegeId&&x.sectionId===sectionId)?.count||0;
  if(current>=Math.max(2,Math.ceil(dominant.count*0.25)))return null;
  const [section,college]=await Promise.all([Repository.getSectionById(dominant.sectionId),Repository.getCollegeById(dominant.collegeId)]);
  return{
    room:roomCode,hall:roomHall,
    section:section?.AdSectionName||"",
    college:college?.AdCollegeName||"",
    owner:[section?.AdSectionName,college?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر",
    samples:history.length,
    ownerSamples:dominant.count,
    share:Math.round(dominant.count/history.length*100)
  };
}

async function roomScopeNotice(row:any){
  const owner=await roomOwnership(row?.AdRoomCode,row?.AdRoomHall,Number(row?.AdCollegeId||0),Number(row?.AdSectionId||0));
  if(!owner)return null;
  return{type:"roomScope",severity:"warning",rowId:0,message:`تنبيه نطاق القاعة: ${owner.room}/${owner.hall} مرتبطة تاريخياً بـ ${owner.owner}`,detail:`استُخدمت القاعة في ${owner.ownerSamples} من ${owner.samples} موعداً مسجلاً لهذا النطاق التاريخي. يمكن المتابعة إذا كان الاختيار مقصوداً؛ هذا تنبيه تنظيمي وليس تعارضاً زمنياً.`};
}
function normalizedBuilding(value: unknown){return String(value||"").trim();}
function travelPairKey(a:string,b:string){const x=normalizedBuilding(a).toLocaleLowerCase(),y=normalizedBuilding(b).toLocaleLowerCase();return [x,y].sort().join("|");}
function travelMinutesFor(profile:any,fromBuilding:string,toBuilding:string,fromCampus?:Campus,toCampus?:Campus){
  // A move between the college's remote campuses (الجهراء / الفحيحيل / الرئيسي) is a
  // commute, not a walk between halls — it overrides the per-building matrix.
  if(fromCampus&&toCampus){const inter=interCampusMinutes(fromCampus,toCampus);if(inter!=null)return inter;}
  const from=normalizedBuilding(fromBuilding),to=normalizedBuilding(toBuilding);
  if(!from||!to)return 0;
  if(from.toLocaleLowerCase()===to.toLocaleLowerCase())return Math.max(0,Number(profile?.sameBuildingMinutes)||SAME_BUILDING_MINUTES);
  const pair=(profile?.pairs||[]).find((item:any)=>travelPairKey(item.fromBuilding,item.toBuilding)===travelPairKey(from,to));
  return Math.max(1,Math.min(120,Number(pair?.minutes)||Number(profile?.defaultTravelMinutes)||DEFAULT_TRAVEL_MINUTES));
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

const CAMPUS_LABEL: Record<string, string> = { jahra: "الجهراء", fahaheel: "الفحيحيل", main: "الحرم الرئيسي" };
/**
 * Note 38 — a soft "too little time between campuses" warning.
 *
 * The instructor's appointments are fetched across the whole term (every
 * college), so a new placement can be checked against a same-day lecture on a
 * different campus. If the gap is smaller than the commute (الجهراء/الفحيحيل/
 * العارضية rules), we surface a `soft` warning: it explains the risk but never
 * blocks the save — a real timetable sometimes has to accept a tight transfer.
 */
async function interCampusWarnings(candidate: any, all: any[]) {
  const instructorId = Number(candidate.AdInstructorId || 0);
  if (!instructorId || !candidate.fstarttime || !candidate.fendtime) return [];
  const colleges = await Repository.getColleges();
  const campusById = new Map<number, ReturnType<typeof campusOf>>(colleges.map((c: any) => [Number(c.AdCollegeId), campusOf(c.AdCollegeName)]));
  const candCampus = campusById.get(Number(candidate.AdCollegeId));
  if (!candCampus) return [];
  const own = all.filter(r => Number(r.AdInstructorId) === instructorId && Number(r.id) !== Number(candidate.id));
  const days: Array<[string, string]> = [["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]];
  const cStart = timeToMinutes(candidate.fstarttime), cEnd = timeToMinutes(candidate.fendtime);
  const seen = new Set<string>();
  const warnings: any[] = [];
  for (const [key, label] of days) {
    if (!candidate[key]) continue;
    for (const other of own) {
      if (!other[key]) continue;
      const otherCampus = campusById.get(Number(other.AdCollegeId));
      if (!otherCampus) continue;
      const need = interCampusMinutes(candCampus, otherCampus);
      if (need == null) continue; // same campus — the per-building matrix handles it
      const oStart = timeToMinutes(other.fstarttime), oEnd = timeToMinutes(other.fendtime);
      // Gap only when the two do not overlap (an overlap is already a hard conflict).
      const gap = cStart >= oEnd ? cStart - oEnd : (oStart >= cEnd ? oStart - cEnd : -1);
      if (gap < 0 || gap >= need) continue;
      const dedupe = `${key}:${[candCampus, otherCampus].sort().join("-")}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      warnings.push({
        type: "travel", severity: "warning", soft: true, rowId: 0,
        message: `انتقال ضيّق بين ${CAMPUS_LABEL[candCampus]} و${CAMPUS_LABEL[otherCampus]}`,
        detail: `${label}: التنقّل يحتاج قرابة ${need} دقيقة، والمتاح ${gap} دقيقة فقط بين موعدَي الأستاذ. يمكنك الحفظ مع الانتباه لهذا الفارق.`,
      });
    }
  }
  return warnings.slice(0, 3);
}
/**
 * The one sentence the audit log was missing.
 *
 * "تعديل · موعد #418" records that something happened; nobody has ever opened a
 * log to learn that. The question is always what moved and where it moved to,
 * so a placement change is written the way a person would say it — days, time,
 * hall and instructor, each named only when it actually changed.
 */
function describeScheduleChange(before: any, after: any, instructorName?: (id: number) => string): string {
  const dayText = (row: any) => SCHEDULE_DAY_KEYS.map((key, index) => (row?.[key] ? DAY_LABELS[index] : null)).filter(Boolean).join("، ") || "بلا أيام";
  const parts: string[] = [];
  const beforeDays = dayText(before), afterDays = dayText(after);
  if (beforeDays !== afterDays) parts.push(`الأيام ${beforeDays} ← ${afterDays}`);
  if (before?.fstarttime !== after?.fstarttime || before?.fendtime !== after?.fendtime)
    parts.push(`الوقت ${before?.fstarttime}-${before?.fendtime} ← ${after?.fstarttime}-${after?.fendtime}`);
  const beforeRoom = `${before?.AdRoomCode || ""}/${before?.AdRoomHall || ""}`;
  const afterRoom = `${after?.AdRoomCode || ""}/${after?.AdRoomHall || ""}`;
  if (beforeRoom !== afterRoom) parts.push(`القاعة ${beforeRoom} ← ${afterRoom}`);
  if (Number(before?.AdInstructorId || 0) !== Number(after?.AdInstructorId || 0))
    parts.push(`الأستاذ ${instructorName?.(Number(before?.AdInstructorId || 0)) || before?.AdInstructorId} ← ${instructorName?.(Number(after?.AdInstructorId || 0)) || after?.AdInstructorId}`);
  if (String(before?.SCode || "") !== String(after?.SCode || "")) parts.push(`الشعبة ${before?.SCode} ← ${after?.SCode}`);
  return parts.join(" · ");
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
    if(conflict.type==="room"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`القاعة ${other.AdRoomCode}/${other.AdRoomHall} مشغولة في نفس الوقت`,detail:visible?`${other.AdCourseName||"مقرر"} — ${other.fstarttime}-${other.fendtime}`:`يوجد حجز متداخل خارج نطاق العرض الحالي`};
    // A repeated course and section is only a duplicate when it is the very same
    // placement; a lecture on Sunday and its laboratory on Tuesday share a
    // section number by design and must not be refused.
    return{...conflict,severity:"high",rowId:visible&&other?other.id:0,message:"يوجد موعد مطابق تماماً لنفس المقرر والشعبة",detail:visible&&other?`نفس الأيام ونفس الوقت ${other.fstarttime}-${other.fendtime}`:"يوجد سجل مطابق خارج نطاق العرض الحالي"};
  });
  const softTravel = await interCampusWarnings(candidate, all);
  return [...conflicts, ...(roomNotice ? [roomNotice] : []), ...softTravel];
}

/**
 * The living schedule: one message the moment anything changes.
 *
 * Every write to the timetable — a save, a drag, a delete, a term copy, an
 * import — already announces itself by clearing the schedule cache. This
 * channel forwards that announcement to every open screen as a server-sent
 * event, so a colleague's change appears on your board by itself, without
 * anyone pressing refresh. The event deliberately carries no rows: each
 * listener re-reads its own scope through the normal scoped road, so the
 * permission walls stay exactly where they are.
 *
 * A short debounce turns a burst of writes (a six-card drag, an import) into
 * one message, sent after the write has actually landed.
 */
const scheduleEventClients = new Set<Response>();
let scheduleEventTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleEventSerial = 0;
/** Writes the event to every screen attached to THIS instance. */
function broadcastScheduleChange() {
  scheduleEventSerial += 1;
  const payload = `id: ${scheduleEventSerial}\nevent: schedules\ndata: {"changedAt":${Date.now()}}\n\n`;
  for (const client of scheduleEventClients) {
    try { client.write(payload); } catch { scheduleEventClients.delete(client); }
  }
}
onSchedulesInvalidated(() => {
  if (scheduleEventTimer) return;
  scheduleEventTimer = setTimeout(() => {
    scheduleEventTimer = null;
    broadcastScheduleChange();
    // …and tell the other instances, which never saw this write at all.
    void Repository.markSchedulesChanged();
  }, 350);
});
/**
 * The other half of the live channel.
 *
 * Without this, "live" quietly meant "live for whoever shares my instance" —
 * the moment Cloud Run runs a second copy, half the users stop receiving their
 * colleagues' changes and nothing on screen suggests anything is wrong. The
 * beacon document is watched here, so a change written anywhere is announced
 * everywhere. The listener is started once the database is up.
 */
let stopScheduleBeacon: (() => void) | null = null;
function listenForScheduleChangesAcrossInstances() {
  if (stopScheduleBeacon) return;
  stopScheduleBeacon = Repository.watchSchedulesChanged(() => {
    // Another instance wrote. Our cached rows are stale, so they are dropped —
    // quietly, because announcing a change we did not make would send the
    // beacon straight back out and the two instances would echo forever.
    clearScheduleCacheQuietly();
    broadcastScheduleChange();
  });
}

app.get("/api/schedules/events", requirePermission(7), (req: AuthenticatedRequest, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Each stream holds a connection for its whole life, so the door has a
  // capacity. Past it the screen simply falls back to reading on demand.
  if (scheduleEventClients.size >= 400) { res.end(); return; }
  res.write("retry: 4000\n\n");
  scheduleEventClients.add(res);
  // Proxies drop silent connections; a comment line every while keeps this one open.
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* close event does the cleanup */ }
  }, 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    scheduleEventClients.delete(res);
  });
});

/**
 * The whole workspace in one request.
 *
 * Opening the schedule used to be a conversation: colleges, then sections, then
 * terms, then the rows, then the department's instructors and courses and its
 * visiting roster — six requests in three waits, and on the campus connection
 * every wait is the slow part. The account already names its department, so the
 * server can resolve the scope itself and answer with everything that scope
 * needs in a single round trip. The administrator gets the same single answer
 * for whichever scope they ask about; everyone else is answered only from the
 * sections that are theirs.
 */
app.get("/api/schedules/workspace", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const requestedCollege = Number(req.query.collegeId || 0);
  const requestedSection = Number(req.query.sectionId || 0);
  const requestedTerm = Number(req.query.termId || 0);
  const resolveDefaults = String(req.query.resolve || "") === "1";

  const [allColleges, allSections, terms] = await Promise.all([
    Repository.getColleges(), Repository.getSections(), Repository.getTerms(),
  ]);
  const colleges = req.user.IsAdminUser
    ? allColleges
    : allColleges.filter(college => (req.scopes || []).some(scope => Number(scope.AdCollegeId) === college.AdCollegeId));
  const sections = filterByScope(req, allSections);
  const termId = requestedTerm && terms.some(term => Number(term.AdTermId) === requestedTerm)
    ? requestedTerm
    : terms.reduce((max, term) => Math.max(max, Number(term.AdTermId) || 0), 0);

  let collegeId = requestedCollege, sectionId = requestedSection;
  if (!req.user.IsAdminUser) {
    // Whatever was asked for, the answer stays inside the account's own sections.
    const coerced = coerceScopeValues(req.scopes || [], collegeId, sectionId, false);
    collegeId = coerced.collegeId; sectionId = coerced.sectionId;
  } else {
    if (sectionId && !sections.some(section => section.AdSectionId === sectionId && (!collegeId || section.AdCollegeId === collegeId))) sectionId = 0;
    if (sectionId && !collegeId) collegeId = Number(sections.find(section => section.AdSectionId === sectionId)?.AdCollegeId || 0);
    if (collegeId && !colleges.some(college => college.AdCollegeId === collegeId)) { collegeId = 0; sectionId = 0; }
    if (resolveDefaults) {
      // First open: land on a real department instead of an empty "الكل".
      if (!collegeId) collegeId = Number(sections[0]?.AdCollegeId || colleges[0]?.AdCollegeId || 0);
      if (!sectionId) sectionId = Number(sections.find(section => section.AdCollegeId === collegeId)?.AdSectionId || 0);
    }
  }

  const [rows, instructors, courses, visitingInstructorIds] = await Promise.all([
    readSchedulesForRequest(req, collegeId, sectionId, termId),
    sectionId
      ? Repository.getInstructorsByScope(sectionId, termId)
      : (collegeId ? Repository.getInstructorsByScheduleScope({ collegeId, termId }) : Promise.resolve([])),
    sectionId ? Repository.getCoursesBySection(sectionId) : Promise.resolve([]),
    sectionId && collegeId ? Repository.getVisitingRoster(collegeId, sectionId, termId) : Promise.resolve([] as number[]),
  ]);

  res.json({
    context: { collegeId, sectionId, termId },
    colleges, sections, terms,
    rows, instructors, courses,
    visitingInstructorIds,
  });
});

/**
 * The scoped read, shaped by who is asking.
 *
 * A department coordinator's account already says which sections are theirs, so
 * a request with no section filter must not scan the whole university term and
 * throw the surplus away — it reads the handful of sections the account owns,
 * which is the same answer at a fraction of the weight. The administrator keeps
 * the wide read, because for them the wide read is the answer.
 */
async function readSchedulesForRequest(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number): Promise<FSchedule[]> {
  if (!req.user?.IsAdminUser && !sectionId) {
    const scopeSectionIds = [...new Set((req.scopes || [])
      .filter(scope => !collegeId || Number(scope.AdCollegeId) === collegeId)
      .map(scope => Number(scope.AdSectionId)).filter(Boolean))];
    const groups = await Promise.all(scopeSectionIds.map(scopeSectionId =>
      Repository.getSchedulesByScope({ sectionId: scopeSectionId, termId })));
    return filterByScope(req, groups.flat());
  }
  return filterByScope(req, await Repository.getSchedulesByScope({ collegeId, sectionId, termId }));
}

app.get("/api/schedules", requireAnyPermission([7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  let termId=Number(req.query.termId||0);
  // Operational screens default to the newest term. Historical reads are still
  // available by sending termId explicitly, but a blank filter can no longer scan
  // the university's entire ten-year schedule collection.
  if(!termId){const terms=await Repository.getTerms();termId=terms.reduce((max,t)=>Math.max(max,Number(t.AdTermId)||0),0);}
  let list = await readSchedulesForRequest(req, collegeId, sectionId, termId);

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
    // Any shared minute is a match, including a lecture wholly inside the
    // window; an appointment that merely ends as the window opens is not.
    // Same rule as scheduleOverlap, so search and conflict-detection agree.
    list = list.filter(s => s.fstarttime < requestedEndTime && s.fendtime > requestedStartTime);
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

/**
 * Natural-language MOVE (Idea 3). Parses "انقل 101 إلى 11:00" / "حرّك 344 إلى
 * الأربعاء", finds the lecture in the open scope and returns a PREVIEW only —
 * before/after plus any conflicts. Applying is a second, explicit step through
 * /api/schedules/move-batch, so a sentence never writes on the schedule by itself.
 */
app.post("/api/intelligence/nl-move", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const parsed=parseNaturalQuery(String(req.body?.q||""));
  if(parsed.intent!=="move"||!parsed.code){res.json({ok:false,hint:"اكتب أمر نقل، مثل: انقل 101 إلى 11:00 · أو: حرّك 344 إلى الأربعاء"});return;}
  const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]);
  const rows=scheduleData.rows;
  const courseById=new Map(courses.map(c=>[c.AdCourseId,c]));
  const dayLabelsOf=(r:any)=>SCHEDULE_DAY_KEYS.map((k,i)=>r[k]?DAY_LABELS[i]:null).filter(Boolean).join("، ")||"—";
  const matches=rows.filter(r=>String(courseById.get(r.AdCourseId)?.CourseCode||"").trim()===parsed.code);
  if(!matches.length){res.json({ok:false,hint:`لم أجد مقرراً برمز ${parsed.code} في هذا القسم والفصل.`});return;}
  let target=matches[0];
  if(matches.length>1){
    const byDay=parsed.day!==null?matches.filter(r=>Boolean((r as any)[SCHEDULE_DAY_KEYS[parsed.day!]])):matches;
    if(byDay.length===1)target=byDay[0];
    else{res.json({ok:false,ambiguous:true,hint:`للمقرر ${parsed.code} أكثر من موعد — حدّد الشعبة أو اليوم.`,options:matches.slice(0,6).map(r=>({id:r.id,section:r.SCode,days:dayLabelsOf(r),start:r.fstarttime,end:r.fendtime}))});return;}
  }
  const dur=Math.max(30,timeToMinutes(target.fendtime)-timeToMinutes(target.fstarttime));
  const newStart=parsed.time||target.fstarttime;
  const newEnd=parsed.time?minutesToTime(timeToMinutes(newStart)+dur):target.fendtime;
  const fields:any={fstarttime:newStart,fendtime:newEnd};
  SCHEDULE_DAY_KEYS.forEach((k,i)=>{fields[k]=parsed.day!==null?i===parsed.day:Boolean((target as any)[k]);});
  const after={...target,...fields};
  const issues=schedulePayloadIssues(after);
  if(issues.length){res.json({ok:false,hint:issues[0]});return;}
  const conflicts=await scheduleConflicts(req,{...after,AdTermId:termId},target.id);
  const blocking=conflicts.filter((c:any)=>!c.soft&&(c.severity==="high"||c.type==="duplicate"));
  res.json({
    ok:true,
    move:{id:target.id,fields},
    preview:{
      course:courseById.get(target.AdCourseId)?.CourseName||target.AdCourseName||"",
      code:parsed.code,section:target.SCode||"",
      instructor:instructors.find(i=>i.AdInstructorId===target.AdInstructorId)?.AdInstructorName||"",
      room:`${target.AdRoomCode||""}/${target.AdRoomHall||""}`.replace(/^\/$/,"—"),
      before:{days:dayLabelsOf(target),start:target.fstarttime,end:target.fendtime},
      after:{days:dayLabelsOf(after),start:newStart,end:newEnd},
    },
    conflicts,
    canApply:blocking.length===0,
    blockedReason:blocking.length?blocking[0].message:"",
  });
});

/**
 * One request, one verdict, one write.
 *
 * The drag used to save as "check, then N separate PUTs" — two windows for
 * disaster: the check could pass while another user was writing, and a network
 * failure mid-loop left the party half-moved. This endpoint re-checks every
 * candidate ON the server, treats the travelling party as already-moved when
 * judging (a sibling about to vacate its slot is not a clash), and commits the
 * whole party through one atomic batch. 409 carries the human-readable reason;
 * nothing is written when anything is refused.
 */
app.post("/api/schedules/move-batch", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const rawMoves = Array.isArray(req.body?.moves) ? req.body.moves : [];
  const strict = Boolean(req.body?.strict);
  if (!rawMoves.length || rawMoves.length > 60) { res.status(400).json({ error: "حدد من موعد واحد إلى ستين للنقل الواحد" }); return; }
  const ALLOWED = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fstarttime", "fendtime", "AdRoomCode", "AdRoomHall"] as const;
  const originals: FSchedule[] = [];
  for (const move of rawMoves) {
    const row = await Repository.getScheduleById(Number(move?.id || 0));
    if (!row) { res.status(404).json({ error: "أحد المواعيد غير موجود" }); return; }
    if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
    originals.push(row);
  }
  const movedIds = new Set(originals.map(r => r.id));
  const candidates = rawMoves.map((move: any, index: number) => {
    const fields: any = {};
    for (const key of ALLOWED) if (move?.fields && key in move.fields) fields[key] = move.fields[key];
    fields.fdetail = legacyFDetail({ ...originals[index], ...fields });
    return { row: { ...originals[index], ...fields } as FSchedule, fields };
  });
  const blocked: any[] = [];
  for (const candidate of candidates) {
    const payloadIssues = schedulePayloadIssues(candidate.row);
    if (payloadIssues.length) { res.status(400).json({ error: payloadIssues[0], issues: payloadIssues }); return; }
    const conflicts = await scheduleConflicts(req, candidate.row, candidate.row.id);
    blocked.push(...conflicts.filter((c: any) =>
      !c.soft && !movedIds.has(Number(c.rowId)) && (strict || c.severity === "high" || c.type === "duplicate")));
  }
  if (blocked.length) {
    const first = blocked[0];
    res.status(409).json({
      error: `لم يُنقل: ${first?.message || "تعارض يمنع الحفظ"}${blocked.length > 1 ? ` (+${blocked.length - 1} أخرى)` : ""}`,
      conflicts: blocked,
    });
    return;
  }
  const updated = await Repository.moveSchedulesBatch(candidates.map(c => ({ id: c.row.id, fields: c.fields })));
  // The drag is the most common change in the product, so it is the one the
  // log most needs to describe: what moved, from where, to where.
  const originalById = new Map(originals.map(row => [row.id, row]));
  res.locals.auditChanges = updated
    .map(row => {
      const before = originalById.get(row.id);
      const sentence = before ? describeScheduleChange(before, row) : "";
      return sentence ? `${before?.AdCourseName || `موعد ${row.id}`}: ${sentence}` : "";
    })
    .filter(Boolean).join(" || ") || undefined;
  res.json({ success: true, rows: updated });
});

/**
 * Carry a whole term out, and bring one back.
 *
 * Export writes the schedule as plain JSON with the names spelled out, so the
 * file is readable by a person and not only by this program — a department that
 * wants to check a term in a spreadsheet, or hand it to an auditor, should not
 * need us. Import matches by code rather than by internal identifier, because
 * the identifiers of one installation mean nothing in another.
 *
 * Import never overwrites: it reports exactly what it would add and what it
 * cannot place, and only writes when explicitly told to commit. A schedule is
 * a term of somebody's teaching; replacing one silently is not a feature.
 */
app.get("/api/schedules/export", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  const rows = filterByScope(req, await Repository.getSchedulesByScope({ collegeId, sectionId, termId }));
  const [courses, instructors, terms, colleges, sections] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(), Repository.getTerms(),
    Repository.getColleges(), Repository.getSections()
  ]);
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));

  /**
   * Everything the scope contains, not only its timetable.
   *
   * The file used to hold appointments alone, which meant an import into a
   * fresh installation could match nothing: the courses it referred to did not
   * exist there, nor the staff, nor the halls. A department handed this file
   * was handed a list of times with no way to read them.
   *
   * So the export now carries the catalogue it depends on — the courses of this
   * department, the staff who teach in it, the halls it uses, and the visiting
   * roster of the term — each keyed by its own code rather than by an internal
   * identifier, because identifiers of one installation mean nothing in
   * another. The rows are unchanged, so files written by the old version still
   * import.
   */
  const scopedCourses = courses.filter(course =>
    (!sectionId || Number(course.AdSectionId) === sectionId) &&
    (!collegeId || Number(course.AdCollegeId) === collegeId));
  const teachingIds = new Set(rows.map(row => Number(row.AdInstructorId)).filter(Boolean));
  const scopedInstructors = instructors.filter(person => teachingIds.has(Number(person.AdInstructorId)));
  const halls = [...new Map(rows
    .filter(row => row.AdRoomCode || row.AdRoomHall)
    .map(row => [`${row.AdRoomCode}|${row.AdRoomHall}`, { building: row.AdRoomCode, hall: row.AdRoomHall }]))
    .values()];
  // The roster is stored as instructor ids; the file carries civil ids so it
  // can be read by an installation that never saw ours.
  let visiting: Array<{ civil: string; name: string }> = [];
  try {
    const roster = await Repository.getVisitingRoster(collegeId, sectionId, termId);
    const ids = Array.isArray(roster) ? roster : [];
    visiting = ids
      .map(id => instructors.find(person => Number(person.AdInstructorId) === Number(id)))
      .filter(Boolean)
      .map(person => ({ civil: person!.AdInstructorCivil, name: person!.AdInstructorName }));
  } catch { visiting = []; }

  const payload = {
    format: "schedule-export/2",
    exportedAt: new Date().toISOString(),
    scope: {
      term: terms.find(row => Number(row.AdTermId) === termId)?.AdTermName || "",
      college: colleges.find(row => Number(row.AdCollegeId) === collegeId)?.AdCollegeName || "",
      section: sections.find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || ""
    },
    counts: {
      rows: rows.length, courses: scopedCourses.length,
      instructors: scopedInstructors.length, halls: halls.length, visiting: visiting.length
    },
    courses: scopedCourses.map(course => ({
      code: course.CourseCode, name: course.CourseName,
      credit: course.CourseCredit, hours: course.CourseHours, maxStudents: course.MaxStudent
    })),
    instructors: scopedInstructors.map(person => ({
      civil: person.AdInstructorCivil, name: person.AdInstructorName, mobile: person.AdInstructorMobile || ""
    })),
    halls,
    visiting,
    rows: rows.map(row => ({
      courseCode: courseById.get(row.AdCourseId)?.CourseCode || "",
      courseName: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
      section: row.SCode,
      instructorCivil: instructorById.get(row.AdInstructorId)?.AdInstructorCivil || "",
      instructorName: instructorById.get(row.AdInstructorId)?.AdInstructorName || "",
      building: row.AdRoomCode, hall: row.AdRoomHall,
      start: row.fstarttime, end: row.fendtime,
      days: DAY_FLAGS.map((flag, index) => ((row as any)[flag] ? DAY_LABELS[index] : null)).filter(Boolean)
    }))
  };
  const name = `schedule-${payload.scope.section || "term"}-${termId || "all"}.json`.replace(/[^\w.\-]+/g, "-");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.type("application/json; charset=utf-8").send(JSON.stringify(payload, null, 2));
});

app.post("/api/schedules/import", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const commit = body.commit === true;
  const collegeId = Number(body.collegeId || 0);
  const sectionId = Number(body.sectionId || 0);
  const termId = Number(body.termId || 0);
  const incoming: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل قبل الاستيراد." }); return; }
  if (!incoming.length) { res.status(400).json({ error: "الملف لا يحتوي مواعيد." }); return; }

  const [courses, instructors, existing] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId })
  ]);
  const courseByCode = new Map(courses.filter(row => Number(row.AdSectionId) === sectionId)
    .map(row => [String(row.CourseCode || "").trim().toLowerCase(), row]));
  const instructorByCivil = new Map(instructors.map(row => [String(row.AdInstructorCivil || "").trim(), row]));
  const seen = new Set(existing.map(row => `${row.AdCourseId}|${String(row.SCode).trim()}`));

  /**
   * A file that brought its own catalogue may plant it.
   *
   * Version 2 of the export carries the courses and the staff its rows depend
   * on. Without this step every row of such a file is rejected for referring to
   * a course that does not exist here yet — which is a true statement and a
   * useless one, because the definition was in the file all along. Anything
   * already present is left exactly as it is; this only fills gaps, and only
   * when the operator has asked to commit.
   */
  const planted = { courses: 0, instructors: 0 };
  if (commit) {
    for (const entry of (Array.isArray(body.courses) ? body.courses : [])) {
      const code = String(entry?.code || "").trim();
      if (!code || courseByCode.has(code.toLowerCase())) continue;
      try {
        const created = await Repository.createCourse(
          collegeId, sectionId, code, String(entry?.name || code).trim(),
          Number(entry?.credit || 0), Number(entry?.hours || 0), Number(entry?.maxStudents || 0),
        );
        courseByCode.set(code.toLowerCase(), created as any);
        planted.courses += 1;
      } catch { /* a course we cannot add is reported by its rows below */ }
    }
    for (const entry of (Array.isArray(body.instructors) ? body.instructors : [])) {
      const civil = String(entry?.civil || "").trim();
      if (!civil || instructorByCivil.has(civil)) continue;
      try {
        const created = await Repository.createInstructor(
          civil, String(entry?.name || civil).trim(), String(entry?.mobile || "").trim(),
        );
        instructorByCivil.set(civil, created as any);
        planted.instructors += 1;
      } catch { /* likewise */ }
    }
  }

  const ready: any[] = [];
  const rejected: Array<{ line: number; reason: string; label: string }> = [];
  incoming.forEach((entry, index) => {
    const label = `${entry?.courseCode || "?"} · شعبة ${entry?.section || "?"}`;
    const course = courseByCode.get(String(entry?.courseCode || "").trim().toLowerCase());
    if (!course) { rejected.push({ line: index + 1, reason: "رمز المقرر غير موجود في هذا القسم", label }); return; }
    const instructor = instructorByCivil.get(String(entry?.instructorCivil || "").trim());
    if (!instructor) { rejected.push({ line: index + 1, reason: "الرقم المدني للأستاذ غير مسجّل", label }); return; }
    const key = `${course.AdCourseId}|${String(entry?.section || "").trim()}`;
    if (seen.has(key)) { rejected.push({ line: index + 1, reason: "الشعبة موجودة بالفعل", label }); return; }
    const dayNames: string[] = Array.isArray(entry?.days) ? entry.days : [];
    const candidate = {
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName,
      SCode: String(entry?.section || "").trim(),
      AdInstructorId: instructor.AdInstructorId,
      AdRoomCode: String(entry?.building || "").trim(),
      AdRoomHall: String(entry?.hall || "").trim(),
      fstarttime: String(entry?.start || "").trim(),
      fendtime: String(entry?.end || "").trim(),
      ...Object.fromEntries(DAY_FLAGS.map((flag, index) => [flag, dayNames.includes(DAY_LABELS[index])]))
    };
    const payloadIssues = schedulePayloadIssues(candidate);
    if (payloadIssues.length) { rejected.push({ line: index + 1, reason: payloadIssues[0], label }); return; }
    seen.add(key);
    ready.push(candidate);
  });

  if (!commit) {
    // A dry run tells the operator what the file would plant as well as place.
    const newCourses = (Array.isArray(body.courses) ? body.courses : [])
      .filter((entry: any) => !courseByCode.has(String(entry?.code || "").trim().toLowerCase())).length;
    const newInstructors = (Array.isArray(body.instructors) ? body.instructors : [])
      .filter((entry: any) => !instructorByCivil.has(String(entry?.civil || "").trim())).length;
    res.json({ preview: true, ready: ready.length, rejected, sample: ready.slice(0, 5), willAdd: { courses: newCourses, instructors: newInstructors } });
    return;
  }

  let added = 0;
  for (const row of ready) {
    try { await Repository.createSchedule(row); added += 1; }
    catch (error) { rejected.push({ line: 0, reason: error instanceof Error ? error.message : "تعذر الحفظ", label: row.SCode }); }
  }
  res.json({ preview: false, added, rejected, planted });
});

/**
 * The department's seconded staff for this term.
 *
 * Visiting instructors are a different thing from the permanent register: they
 * change every term, they belong to the department that invited them, and next
 * term usually starts from the same list. Keeping the roster per scope and per
 * term makes "copy last term's visitors" a single press instead of retyping
 * twenty names, and lets the schedule mark who is seconded without inventing a
 * second kind of person in the data.
 */
app.get("/api/visiting-roster", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.json({ instructorIds: [] }); return; }
  // The roster is a department's own record of who it invited; every other write
  // path in this file asks this question, and this one used to take the caller's
  // word for which department it was reading.
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.json({ instructorIds: await Repository.getVisitingRoster(collegeId, sectionId, termId) });
});

// All delegate instructor ids across every roster, for the «منتدب» badge (Note 1).
app.get("/api/delegates", requireAnyPermission([3, 7]), async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ instructorIds: await Repository.getAllDelegateInstructorIds() });
});

app.put("/api/visiting-roster", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const ids: number[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.json({ instructorIds: await Repository.saveVisitingRoster(collegeId, sectionId, termId, ids) });
});

/** Start this term's roster from another term's, instead of retyping it. */
app.post("/api/visiting-roster/copy", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const fromTermId = Number(req.body?.fromTermId || 0);
  const toTermId = Number(req.body?.toTermId || 0);
  if (!collegeId || !sectionId || !fromTermId || !toTermId) { res.status(400).json({ error: "حدد الفصلين." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const source = await Repository.getVisitingRoster(collegeId, sectionId, fromTermId);
  const target = await Repository.getVisitingRoster(collegeId, sectionId, toTermId);
  const merged = [...new Set([...target, ...source])];
  res.json({ instructorIds: await Repository.saveVisitingRoster(collegeId, sectionId, toTermId, merged), copied: source.length });
});

/**
 * Retire a member of staff out of a whole term in one move.
 *
 * Copying a term brings last year's staff with it, and some of them have
 * retired, resigned or been released. Chasing their name through forty
 * appointments by hand is the kind of work that produces mistakes, so this
 * either hands every one of their appointments to a named replacement, or
 * clears the instructor and leaves the appointments visibly unassigned for the
 * department to fill. It never deletes teaching.
 */
app.post("/api/schedules/replace-instructor", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const fromId = Number(req.body?.fromInstructorId || 0);
  const toId = Number(req.body?.toInstructorId || 0);
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const commit = req.body?.commit === true;
  if (!fromId || !termId) { res.status(400).json({ error: "حدد الأستاذ والفصل." }); return; }

  const rows = filterByScope(req, await Repository.getSchedulesByScope({ collegeId, sectionId, termId }))
    .filter(row => Number(row.AdInstructorId) === fromId);
  if (!commit) { res.json({ preview: true, affected: rows.length }); return; }

  for (const row of rows) await Repository.updateSchedule(row.id, { AdInstructorId: toId || 0 } as any);
  res.json({ preview: false, moved: rows.length, cleared: !toId });
});

/**
 * What the department's courses actually are, learned from every term on record.
 *
 * Returned for a whole department at once, because the screens that want it —
 * the editor, the adoption review — want it for everything they are showing.
 * The read is cached, so asking is nearly free after the first time.
 */
app.get("/api/courses/nature", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = Number(req.query.sectionId || 0);
  if (!sectionId) { res.json({ nature: {} }); return; }
  const courses = await Repository.getCoursesBySection(sectionId);
  const history = await Repository.getScheduleHistoryForCourses(courses.map(course => course.AdCourseId));
  const learned = learnAll(history);
  res.json({
    nature: Object.fromEntries([...learned.entries()].map(([id, value]) => [id, value])),
    terms: new Set(history.map(row => Number(row.AdTermId))).size,
    observations: history.length
  });
});

/** Answers "whose hall is this?" from the room alone — no day, no time. */
app.get("/api/rooms/owner", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const owner = await roomOwnership(
    req.query.room, req.query.hall,
    Number(req.query.collegeId || 0), Number(req.query.sectionId || 0)
  );
  res.json({ owner });
});

/**
 * Where should this lecture go?
 *
 * Choosing a time and a hall by hand means holding four things in your head at
 * once: is the instructor free, is the hall free, does this strand the
 * instructor with an hour of nothing, and can they physically get there from
 * wherever they teach before it. This walks every half hour of the teaching
 * week against every hall the department already uses, throws away anything
 * that collides, and ranks what survives by the three costs that actually hurt:
 * idle time created for the instructor, the walk between buildings, and how
 * scattered the students' day becomes.
 *
 * It proposes; nothing is written. The coordinator still decides.
 */
app.post("/api/schedules/suggest-slots", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const collegeId = Number(body.AdCollegeId || 0), sectionId = Number(body.AdSectionId || 0), termId = Number(body.AdTermId || 0);
  const instructorId = Number(body.AdInstructorId || 0);
  const excludeId = Number(body.excludeId || 0);
  const dayKeys = SCHEDULE_DAY_KEYS.filter(key => Boolean(body[key]));
  const duration = Math.max(30, Math.min(300, Number(body.durationMinutes || 60)));

  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!dayKeys.length) { res.status(400).json({ error: "اختر يوماً واحداً على الأقل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }

  const [universe, mobility] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getCampusMobilityProfile(collegeId)
  ]);
  const live = universe.filter(row => Number(row.id) !== excludeId);
  const sectionRows = live.filter(row => row.AdCollegeId === collegeId && row.AdSectionId === sectionId);

  // Only halls this department already teaches in are proposed: a suggestion
  // that sends a class to an unfamiliar building is not a helpful one.
  const halls = Array.from(new Set(
    sectionRows.filter(row => row.AdRoomCode).map(row => `${row.AdRoomCode}|${row.AdRoomHall || ""}`)
  )).map(key => { const [room, hall] = key.split("|"); return { room, hall }; });
  if (!halls.length) { res.json({ slots: [], note: "لا توجد قاعات مسجلة لهذا القسم بعد" }); return; }

  const DAY_START = SCHEDULE_DAY_START, DAY_END = SCHEDULE_DAY_END, STEP = SCHEDULE_SLOT_MINUTES;
  const busy = (rows: any[], dayKey: string, from: number, to: number) =>
    rows.some(row => Boolean(row[dayKey]) && timeToMinutes(row.fstarttime) < to && timeToMinutes(row.fendtime) > from);

  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const instructorRows = instructorId ? live.filter(row => Number(row.AdInstructorId) === instructorId) : [];

  const candidates: any[] = [];
  for (let start = DAY_START; start + duration <= DAY_END; start += STEP) {
    const end = start + duration;
    for (const hall of halls) {
      const hallRows = live.filter(row => row.AdRoomCode === hall.room && (row.AdRoomHall || "") === hall.hall);
      let blocked = false;
      let idle = 0, walk = 0, spread = 0;
      const reasons: string[] = [];

      for (const dayKey of dayKeys) {
        if (busy(hallRows, dayKey, start, end)) { blocked = true; break; }
        if (instructorId && busy(instructorRows, dayKey, start, end)) { blocked = true; break; }

        const dayOfInstructor = instructorRows
          .filter(row => Boolean(row[dayKey]))
          .sort((a, b) => timeToMinutes(a.fstarttime) - timeToMinutes(b.fstarttime));
        const before = [...dayOfInstructor].reverse().find(row => timeToMinutes(row.fendtime) <= start);
        const after = dayOfInstructor.find(row => timeToMinutes(row.fstarttime) >= end);

        // Idle minutes this placement would create on either side.
        if (before) idle += Math.max(0, start - timeToMinutes(before.fendtime));
        if (after) idle += Math.max(0, timeToMinutes(after.fstarttime) - end);
        if (!before && !after && dayOfInstructor.length === 0) idle += 90; // a lone trip to campus

        // Can they actually get here, and from here to the next one?
        if (before) {
          const need = travelMinutesFor(mobility, before.AdRoomCode, hall.room);
          const have = start - timeToMinutes(before.fendtime);
          if (have < need) { blocked = true; reasons.push("الانتقال بين المبنيين لا يكفي"); break; }
          walk += need;
        }
        if (after) {
          const need = travelMinutesFor(mobility, hall.room, after.AdRoomCode);
          const have = timeToMinutes(after.fstarttime) - end;
          if (have < need) { blocked = true; reasons.push("الانتقال بين المبنيين لا يكفي"); break; }
          walk += need;
        }

        // A students' day that is already running keeps its shape.
        const dayOfSection = sectionRows.filter(row => Boolean(row[dayKey]));
        if (dayOfSection.length) {
          const from = Math.min(...dayOfSection.map(row => timeToMinutes(row.fstarttime)));
          const to = Math.max(...dayOfSection.map(row => timeToMinutes(row.fendtime)));
          spread += Math.max(0, from - start) + Math.max(0, end - to);
        }
      }
      if (blocked) continue;

      const perDay = dayKeys.length;
      const score = Math.round(Math.max(0, 100 - (idle / perDay) / 3 - (walk / perDay) / 2 - (spread / perDay) / 6));
      if (idle === 0) reasons.push("لا يترك فراغاً للأستاذ");
      else reasons.push(`فراغ ${Math.round(idle / perDay)} دقيقة`);
      if (walk === 0) reasons.push("بلا انتقال بين المباني");
      else reasons.push(`انتقال ${Math.round(walk / perDay)} دقيقة`);
      if (spread === 0) reasons.push("داخل يوم القسم الحالي");

      candidates.push({
        start: clock(start), end: clock(end),
        room: hall.room, hall: hall.hall,
        days: dayKeys, score,
        idleMinutes: Math.round(idle / perDay),
        walkMinutes: Math.round(walk / perDay),
        reasons: reasons.slice(0, 3)
      });
    }
  }

  // One suggestion per time: three options that differ only by hall is not a choice.
  const seen = new Set<string>();
  const slots = candidates
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
    .filter(slot => { if (seen.has(slot.start)) return false; seen.add(slot.start); return true; })
    .slice(0, 3);

  res.json({ slots, considered: candidates.length });
});

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
  // Soft warnings (e.g. a tight inter-campus transfer, Note 38) are surfaced by
  // the live check but never block the save.
  const blockingSave=conflicts.filter((c:any)=>!c.soft);
  if(blockingSave.length){res.status(409).json({error:blockingSave[0].message||"يوجد تعارض يمنع الحفظ",issues:blockingSave});return;}

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
  const blockingEdit=conflicts.filter((c:any)=>!c.soft);
  if(blockingEdit.length){res.status(409).json({error:blockingEdit[0].message||"يوجد تعارض يمنع التعديل",issues:blockingEdit});return;}

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
    // Hand the audit trail the sentence describing what actually moved.
    res.locals.auditChanges = describeScheduleChange(existing, updated) || undefined;
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
  if (sched) {
    await captureScopeVersion(req, sched.AdCollegeId, sched.AdSectionId, sched.AdTermId, "قبل حذف موعد دراسي", "manual");
    // A deletion has no "after", so the record keeps what was standing there.
    res.locals.auditChanges = `حُذف: ${sched.AdCourseName || "موعد"} · شعبة ${sched.SCode} · ${sched.fstarttime}-${sched.fendtime} · ${sched.AdRoomCode}/${sched.AdRoomHall}`;
  }
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
  const sourceIssues=[...new Set(source.flatMap((row:any)=>schedulePayloadIssues(row)))];
  const courseById=new Map(courses.map(item=>[item.AdCourseId,item])); const instructorById=new Map(instructors.map(item=>[item.AdInstructorId,item]));
  res.json({sourceCount:source.length,targetCount:target.length,sourceIssues,canCopy:source.length>0&&target.length===0&&!sourceIssues.length,preview:source.slice(0,12).map(row=>({id:row.id,courseCode:courseById.get(row.AdCourseId)?.CourseCode||"",courseName:courseById.get(row.AdCourseId)?.CourseName||row.AdCourseName||"",sectionCode:row.SCode,instructorName:instructorById.get(row.AdInstructorId)?.AdInstructorName||"",time:`${row.fstarttime} - ${row.fendtime}`,room:`${row.AdRoomCode}/${row.AdRoomHall}`}))});
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

  const sourceRows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId: sourceTermId });
  const copiedRows = safeDraftRows(sourceRows, collegeId, sectionId, targetTermId);
  const copyIssues = await validateSmartRows(copiedRows, collegeId, sectionId);
  if (copyIssues.length) {
    res.status(400).json({ error: "لا يمكن نسخ الجدول قبل معالجة بياناته", issues: copyIssues });
    return;
  }

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
  for(const day of SCHEDULE_DAYS){for(let minute=SCHEDULE_DAY_START;minute<SCHEDULE_DAY_END;minute+=SCHEDULE_SLOT_MINUTES){const count=termRows.filter(row=>Boolean((row as any)[day.key])&&timeToMinutes(row.fstarttime)<minute+SCHEDULE_SLOT_MINUTES&&timeToMinutes(row.fendtime)>minute).length;universityHeatmap.push({day:day.key,label:day.label,time:minutesToTime(minute),count})}}
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
  if(!withinScheduleDay(start,start+duration)){res.status(400).json({error:`وقت المعاينة يجب أن يكون بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`});return;}
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
  if(type==="instructor_latest_end"&&(!/^\d{2}:\d{2}$/.test(time)||timeToMinutes(time)<SCHEDULE_DAY_START||timeToMinutes(time)>SCHEDULE_DAY_END)){res.status(400).json({error:`حدد آخر وقت مسموح بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`});return;}
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
  const {collegeId,sectionId,termId}=smartContextFrom(req),goal=String(req.body?.goal||"حافظ على خلو الجدول من الموانع وقلل الفراغات بأقل تغيير ممكن").trim().slice(0,240);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
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
  const summary=changed?`اقتراح آمن غيّر وقت ${changed} موعداً فقط، مع إبقاء المقرر والأستاذ والأيام والقاعة كما هي. موانع الحفظ ${before.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts}، والجودة ${before.score} ← ${after.score}.`:`حللت البدائل ولم أجد تغييراً آمناً أفضل من الجدول الحالي ضمن القيود نفسها؛ لذلك لم أقترح أي تعديل تلقائي.`;
  res.json({rows:chosenRows,changed,before,after,summary});
});

app.post("/api/intelligence/copilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const prompt=String(req.body?.prompt||"").trim();
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(prompt.length<2){res.status(400).json({error:"اكتب سؤالك للمساعد"});return;}
  const [scheduleData,courses,instructors,sections]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getSections()]);
  const {rows:target,universe}=scheduleData;
  const analysis=analyzeSchedule(target,universe,courses,instructors); const bullets:string[]=[]; let title="قراءة ذكية للجدول"; let summary=`جودة الجدول الحالية ${analysis.score}/100، مع ${analysis.metrics.criticalConflicts} موضعاً يحتاج تحقق و${analysis.metrics.avgInstructorGap} دقيقة كمتوسط فراغ للأساتذة.`;
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
    if(row&&requestedHour!=null){const dur=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));const candidate={...row,fstarttime:minutesToTime(requestedHour),fendtime:minutesToTime(requestedHour+dur)};const before=findConflicts([row],universe).length,after=findConflicts([candidate],universe.filter(x=>x.id!==row.id).concat(candidate)).length;summary=`نقل ${code?.CourseCode||row.AdCourseName} إلى ${candidate.fstarttime} يغيّر موانع الحفظ المحتملة من ${before} إلى ${after}.`;bullets.push(`الوقت المقترح: ${candidate.fstarttime}–${candidate.fendtime}.`,after===0?"الموضع صالح ولا يظهر حجز مزدوج للأستاذ أو القاعة.":"الموضع غير مسموح؛ استخدم اقتراح البديل الآمن.");}
    else summary="حدد رمز المقرر والساعة في السؤال، مثال: إذا نقلت 101 إلى الساعة 11 شنو يتأثر؟";
  } else if(normalized.includes("أفضل توزيع")||normalized.includes("افضل توزيع")||normalized.includes("قلل الفراغ")||normalized.includes("تقليل الفراغ")){
    title="اقتراح تحسين التوزيع"; const proposal=autoScheduleProposal(target,universe); const external=universe.filter(r=>!(r.AdCollegeId===collegeId&&r.AdSectionId===sectionId)); const after=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors); const safer=after.metrics.criticalConflicts<analysis.metrics.criticalConflicts||(after.metrics.criticalConflicts===analysis.metrics.criticalConflicts&&after.score>=analysis.score);
    summary=safer&&proposal.changed?`يمكن إنشاء سيناريو يغيّر وقت ${proposal.changed} موعداً: موانع الحفظ ${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts} والجودة ${analysis.score}/100 ← ${after.score}/100، دون تغيير المقرر أو الأستاذ أو أيام اللقاء أو القاعة.`:"حللت التوزيع الحالي ولم أجد نقلاً تلقائياً آمناً أفضل ضمن القيود نفسها؛ الأفضل تجربة «ماذا لو؟» يدوياً أو تحديد قيد إضافي للمساعد.";
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
  for(const day of SCHEDULE_DAYS){const intervals=rows.filter(r=>Boolean((r as any)[day.key])).map(r=>({start:timeToMinutes(r.fstarttime),end:timeToMinutes(r.fendtime)})).sort((a,b)=>a.start-b.start);const merged:any[]=[];for(const item of intervals){const last=merged[merged.length-1];if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);else merged.push({...item})}let cursor=SCHEDULE_DAY_START;for(const item of merged){if(item.start>cursor)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:minutesToTime(Math.min(item.start,SCHEDULE_DAY_END))});cursor=Math.max(cursor,item.end)}if(cursor<SCHEDULE_DAY_END)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:SCHEDULE_DAY_END_TIME}); for(const row of rows.filter(r=>Boolean((r as any)[day.key])))occupancy.push({day:day.label,start:row.fstarttime,end:row.fendtime,visible:visibleIds.has(row.id),sectionName:visibleIds.has(row.id)||req.user.IsAdminUser?sections.find(s=>s.AdSectionId===row.AdSectionId)?.AdSectionName||"":"حجز من قسم آخر"})}
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
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,80); res.json(versions.map(({rows,...meta})=>({...meta,rowCount:Number(meta.rowCount ?? rows.length)})));
});
app.get("/api/intelligence/versions/compare", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const a=await Repository.getScheduleVersionById(String(req.query.fromId||"")),b=await Repository.getScheduleVersionById(String(req.query.toId||"")); if(!a||!b){res.status(404).json({error:"إحدى النسختين غير موجودة"});return;} if(a.scopeKey!==b.scopeKey||!isScopeAllowed(req,a.AdCollegeId,a.AdSectionId)){res.status(403).json({error:"لا يمكن مقارنة نسخ خارج نطاق القسم"});return;} const key=(r:any)=>`${r.AdCourseId}:${r.SCode}:${r.AdInstructorId}:${activeDays(r).join(",")}:${r.fstarttime}:${r.fendtime}:${r.AdRoomCode}:${r.AdRoomHall}`; const ak=new Set(a.rows.map(key)),bk=new Set(b.rows.map(key)); res.json({from:{id:a.id,label:a.label,createdAt:a.createdAt,count:a.rows.length,rows:a.rows},to:{id:b.id,label:b.label,createdAt:b.createdAt,count:b.rows.length,rows:b.rows},added:[...bk].filter(x=>!ak.has(x)).length,removed:[...ak].filter(x=>!bk.has(x)).length,unchanged:[...bk].filter(x=>ak.has(x)).length});
});
app.post("/api/intelligence/versions/:id/restore", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="restore"){res.status(409).json({error:"يتطلب الاسترجاع تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"النسخة غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId); if(issues.length){res.status(400).json({error:"لا يمكن استرجاع نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل استرجاع: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`restore:${version.id}`}); res.json({success:true,count:rows.length});
});

app.get("/api/intelligence/compare-terms", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),fromTermId=Number(req.query.fromTermId||0),toTermId=Number(req.query.toTermId||0); if(!collegeId||!sectionId||!fromTermId||!toTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [fromData,toData,courses,instructors,terms]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,fromTermId),scopedScheduleUniverse(collegeId,sectionId,toTermId),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms()]); const from=fromData.rows,to=toData.rows; const diff=compareTerms(from,to);
  const courseById=new Map(courses.map(row=>[row.AdCourseId,row]));
  const instructorName=(id:number)=>instructors.find(row=>row.AdInstructorId===id)?.AdInstructorName||"";
  // Rows are shaped for reading, not for editing: code, section, and the
  // properties that differ. Nothing here is writable from this screen.
  const shapeRow=(row:any)=>({
    id:row.id,
    code:courseById.get(row.AdCourseId)?.CourseCode||"",
    name:row.AdCourseName||courseById.get(row.AdCourseId)?.CourseName||"",
    section:row.SCode||"",
    time:`${row.fstarttime}–${row.fendtime}`,
    room:[row.AdRoomCode,row.AdRoomHall].filter(Boolean).join("/"),
    instructor:instructorName(Number(row.AdInstructorId||0))
  });
  res.json({
    ...diff,
    appeared:diff.appeared.slice(0,80).map(shapeRow),
    disappeared:diff.disappeared.slice(0,80).map(shapeRow),
    moved:diff.moved.slice(0,80).map(entry=>{
      // roomKey joins with a pipe for comparison; a reader wants a slash.
      const readable=(side:any)=>({...side,room:String(side.room||"").replace("|","/"),instructor:instructorName(side.instructorId)});
      return {...shapeRow(entry.row),fields:entry.fields,before:readable(entry.from),after:readable(entry.to)};
    }),
    fromTermName:terms.find(t=>t.AdTermId===fromTermId)?.AdTermName||"",
    toTermName:terms.find(t=>t.AdTermId===toTermId)?.AdTermName||"",
    fromScore:analyzeSchedule(from,fromData.universe,courses,instructors).score,
    toScore:analyzeSchedule(to,toData.universe,courses,instructors).score
  });
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
    const row=rows.find(r=>r.id===Number(req.body?.rowId||req.body?.contextId||0)); if(!row){res.status(404).json({error:"الموعد غير موجود في هذا القسم"});return;} const solutions=conflictSolutions(row,universe,5); const options=solutions.slice(0,3).map(sol=>{const candidate={...row,fstarttime:sol.start,fendtime:sol.end,AdRoomCode:sol.roomCode,AdRoomHall:sol.roomHall};const why=explainScheduleDecision(rows,universe,candidate,courses,instructors,constraints);return{rank:sol.rank,title:sol.conflicts?`بديل غير قابل للحفظ (${sol.conflicts} مانع)`:"بديل صالح",candidate,verdict:why.verdict,delta:why.delta,positives:why.positives.slice(0,3),tradeoffs:why.tradeoffs.slice(0,2)}}); const best=options[0]; res.json({title:`مساعد القرار · ${row.AdCourseName} / شعبة ${row.SCode}`,summary:best?`أقوى تحسين حالي: ${best.verdict}. الجودة ${best.delta.score>=0?"+":""}${best.delta.score}، وموانع الحفظ ${best.delta.conflicts>=0?"+":""}${best.delta.conflicts}.`:"لا يظهر بديل آمن أفضل من الموعد الحالي.",context:{type:"schedule",rowId:row.id},options,guardrail:"الاقتراحات لا تحفظ شيئاً؛ افتح البديل في نموذج التعديل إذا قررت استخدامه."}); return;
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
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,constraints,memories]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId),Repository.getScheduleDecisionMemories(collegeId,sectionId,120)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول لبناء محضر قرار"});return;} const war=buildWarRoom(rows,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined); const chosen=war.options?.find((x:any)=>x.id===String(req.body?.optionId||""))||war.options?.[0]; const issueRowId=war.issue?.rowId; const comments=issueRowId?await Repository.getScheduleComments(issueRowId):[]; const recentMemory=memories.filter(m=>!war.issue?.rowId||m.scheduleId===war.issue.rowId||m.AdCourseId===rows.find(r=>r.id===war.issue.rowId)?.AdCourseId).slice(0,5); const minutes={title:"محضر قرار الجدول",problem:war.issue?`${war.issue.courseName} · شعبة ${war.issue.sectionCode} — ${war.issue.conflictCount} موضع يحتاج تحقق قبل الاعتماد.`:"مراجعة عامة للجدول",alternatives:(war.options||[]).map((o:any)=>({id:o.id,title:o.title,reason:o.reason,score:o.score,conflicts:o.conflicts,changed:o.changed})),selected:chosen?{id:chosen.id,title:chosen.title,reason:chosen.reason,score:chosen.score,conflicts:chosen.conflicts,changed:chosen.changed}:null,expectedImpact:chosen?`الجودة ${war.baseline.score} ← ${chosen.score}، وموانع الحفظ ${war.baseline.conflicts} ← ${chosen.conflicts}، وعدد المواعيد المتغيرة ${chosen.changed}.`:"لم يُحدد بديل.",discussion:comments.slice(0,8).map(c=>({text:c.text,user:c.userName,createdAt:c.createdAt,resolved:c.resolved})),memory:recentMemory.map(m=>({reason:m.reason,kind:m.kind,createdAt:m.createdAt,user:m.userName})),approvedBy:String(req.body?.approvedBy||req.user.Name).slice(0,120),generatedAt:new Date().toISOString()}; res.json(minutes);
});

app.get("/api/intelligence/safety-net", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,18); res.json(versions.map(v=>({id:v.id,createdAt:v.createdAt,label:v.label,source:v.source,userName:v.userName,rowCount:Number(v.rowCount ?? v.rows.length),decisionLabel:`استرجع الجدول إلى ${v.label}`})));
});

app.post("/api/intelligence/safety-net/:id/undo", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="decision-undo"){res.status(409).json({error:"يتطلب التراجع عن القرار تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"نقطة الأمان غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId); if(issues.length){res.status(400).json({error:"لا يمكن التراجع إلى نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل التراجع عن القرار: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`decision-undo:${version.id}`}); res.json({success:true,count:rows.length,message:`تمت العودة إلى ${version.label}`});
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
  /**
   * A password is never sent to a browser, not even an administrator's.
   *
   * The legacy SystemUser/Index screen printed the password in a column, and
   * this endpoint reproduced it faithfully by decrypting the vault on every
   * read. Faithful, and wrong: it meant one borrowed admin session — or one
   * screenshot in a meeting, or one browser cache on a shared machine — was
   * every credential in the university at once.
   *
   * What an administrator actually needs from this screen is whether a password
   * exists, so an account that was never given one can be spotted. That single
   * fact is what leaves the building now; setting a new password still works
   * exactly as before, because setting one never required reading the old one.
   */
  const users = usersList.map(user => ({
    ...safeSystemUser(user),
    HasPassword: Boolean(String(user.SystemUserPass || "").trim())
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
  res.status(201).json({ ...safeSystemUser(newUser), HasPassword: true });
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
    res.json({ ...safeSystemUser(updated), HasPassword: Boolean(String(updated.SystemUserPass || "").trim()) });
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
  /**
   * The spreadsheet must contain exactly what the screen contains.
   *
   * Export used to accept six filters while the query screen offered eleven, so
   * narrowing to "Sunday, course 321, before noon" and pressing Excel produced
   * the department's entire term instead — a file that looks like an answer and
   * is not one. The whole filter set travels now, and the two string filters use
   * the same `includes` the screen uses rather than an exact match.
   */
  const { termId, collegeId, sectionId, instructorId, building, hall, courseId, courseCode, civil, startTime, endTime } = req.query;
  let resolvedTermId=Number(termId||0);
  if(!resolvedTermId){const terms=await Repository.getTerms();resolvedTermId=terms.reduce((max,t)=>Math.max(max,Number(t.AdTermId)||0),0);}
  let schedules = await Repository.getSchedulesByScope({termId:resolvedTermId,collegeId:Number(collegeId||0),sectionId:Number(sectionId||0)});
  schedules = filterByScope(req, schedules);

  if (instructorId) schedules = schedules.filter(s => s.AdInstructorId === parseInt(instructorId as string));
  if (building) schedules = schedules.filter(s => String(s.AdRoomCode || "").includes(String(building)));
  if (hall) schedules = schedules.filter(s => String(s.AdRoomHall || "").includes(String(hall)));
  if (courseId) schedules = schedules.filter(s => s.AdCourseId === parseInt(courseId as string));
  if (startTime && endTime) schedules = schedules.filter(s => s.fstarttime < String(endTime) && s.fendtime > String(startTime));
  const exportDays = [
    req.query.sun === "true" && "fsunday", req.query.mon === "true" && "fmonday",
    req.query.tue === "true" && "ftuesday", req.query.wed === "true" && "fwednesday",
    req.query.thr === "true" && "fthursday",
  ].filter(Boolean) as Array<"fsunday"|"fmonday"|"ftuesday"|"fwednesday"|"fthursday">;
  if (exportDays.length) schedules = schedules.filter(s => exportDays.some(day => Boolean(s[day])));

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

  // These two read through a relation, so they wait for the maps above.
  if (courseCode) schedules = schedules.filter(s => (courseById.get(s.AdCourseId)?.CourseCode || "") === String(courseCode).trim());
  if (civil) schedules = schedules.filter(s => String(instructorById.get(s.AdInstructorId)?.AdInstructorCivil || "").includes(String(civil).trim()));

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
/**
 * ميزان الأقسام — the one report only the main administrator can act on.
 *
 * Every other report answers for a single department, which means the person
 * who can see all of them has been comparing by eye: open the fairness lens,
 * write the number down, change the department, repeat. The comparison itself
 * was never on a screen.
 *
 * This puts every department of the term on one line each — how many
 * appointments it carries, how many staff and halls it uses, how its teaching
 * load splits between morning and evening, how evenly the burden falls across
 * its instructors, and how many collisions it still holds. Nothing here is new
 * analysis; it is the readings the product already computes, finally side by
 * side. It reads the whole term once and derives every row from that, so the
 * page costs one read rather than one per department.
 */
app.get("/api/reports/department-balance", requirePermission(14), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  let termId = Number(req.query.termId || 0);
  const terms = await Repository.getTerms();
  if (!termId) termId = terms.reduce((max, term) => Math.max(max, Number(term.AdTermId) || 0), 0);
  const [termRows, sections, colleges, instructors, courses] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getSections(), Repository.getColleges(), Repository.getInstructors(), Repository.getCourses(),
  ]);
  const collegeById = new Map(colleges.map(item => [item.AdCollegeId, item]));
  const bySection = new Map<number, FSchedule[]>();
  for (const row of termRows) {
    const list = bySection.get(Number(row.AdSectionId));
    if (list) list.push(row); else bySection.set(Number(row.AdSectionId), [row]);
  }
  const MORNING_END = 14 * 60;
  const departments = [...bySection.entries()].map(([sectionId, rows]) => {
    const section = sections.find(item => item.AdSectionId === sectionId);
    const fairness = buildFairnessEngine(rows, instructors);
    const analysis = analyzeSchedule(rows, termRows, courses, instructors);
    let morning = 0, evening = 0;
    for (const row of rows) {
      const meetings = Math.max(1, activeDays(row).length);
      (timeToMinutes(row.fstarttime) < MORNING_END ? (morning += meetings) : (evening += meetings));
    }
    const meetings = Math.max(1, morning + evening);
    const rooms = new Set(rows.filter(row => row.AdRoomCode).map(row => `${row.AdRoomCode}|${row.AdRoomHall}`));
    return {
      sectionId,
      sectionName: section?.AdSectionName || `قسم ${sectionId}`,
      collegeName: collegeById.get(Number(section?.AdCollegeId || 0))?.AdCollegeName || "",
      rows: rows.length,
      instructors: new Set(rows.map(row => row.AdInstructorId).filter(Boolean)).size,
      rooms: rooms.size,
      morningPct: Math.round((morning / meetings) * 100),
      eveningPct: Math.round((evening / meetings) * 100),
      fairness: fairness.score,
      heaviest: fairness.profiles[0]?.name || "",
      quality: analysis.score,
      conflicts: analysis.metrics.criticalConflicts,
      lateRows: analysis.metrics.lateRows,
    };
  }).sort((a, b) => b.rows - a.rows);
  res.json({
    termId,
    termName: terms.find(term => term.AdTermId === termId)?.AdTermName || "",
    departments,
    totals: {
      departments: departments.length,
      rows: departments.reduce((sum, item) => sum + item.rows, 0),
      conflicts: departments.reduce((sum, item) => sum + item.conflicts, 0),
    },
  });
});

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
    dayStart: SCHEDULE_DAY_START,
    dayEnd: SCHEDULE_DAY_END,
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

/**
 * The instructor card.
 *
 * Instructors outnumber accounts by an order of magnitude and will never be
 * given credentials, so the card has to work with nothing but a link. A civil
 * ID on its own would be a public directory — colleagues know each other's
 * numbers — so the link is the permission and the civil ID is only the
 * selector: without the link nothing is reachable at all, and with it a person
 * can reach exactly one card, their own, inside the college that issued it.
 *
 * Guesses are rate limited per link, a wrong number and a person who teaches
 * nothing this term get the same answer, and the card never shows a civil ID,
 * a phone number or anyone else's row.
 */
const staffAttempts = new Map<string, { count: number; first: number }>();
const STAFF_WINDOW_MS = 10 * 60 * 1000;
const STAFF_MAX_TRIES = 10;

function staffLookupAllowed(token: string, ip: string): boolean {
  const key = `${token}|${ip}`;
  const now = Date.now();
  const seen = staffAttempts.get(key);
  if (!seen || now - seen.first > STAFF_WINDOW_MS) {
    staffAttempts.set(key, { count: 1, first: now });
    return true;
  }
  seen.count += 1;
  if (staffAttempts.size > 5000) staffAttempts.clear();
  return seen.count <= STAFF_MAX_TRIES;
}

async function buildStaffCard(link: ScheduleShareLink, civil: string, requestedTermId = 0) {
  const digits = String(civil || "").replace(/\D/g, "");
  if (digits.length < 8) return null;

  const [instructors, courses, colleges, terms] = await Promise.all([
    Repository.getInstructors(), Repository.getCourses(), Repository.getColleges(), Repository.getTerms()
  ]);
  const person = instructors.find(row => String(row.AdInstructorCivil || "").replace(/\D/g, "") === digits);
  if (!person) return null;

  // Security gate: the instructor must actually appear in the link's OWN term, so
  // a wrong number and "teaches nothing" stay one indistinguishable 404 at the
  // door. Only after passing may they pin another term (Idea 2).
  const linkRows = (await Repository.getSchedulesByScope({ collegeId: link.AdCollegeId, termId: link.AdTermId }))
    .filter(row => row.AdInstructorId === person.AdInstructorId);
  if (!linkRows.length) return null;

  // The card covers the college that issued the link, so an instructor teaching
  // several of its sections sees one complete week rather than a fragment.
  const displayTermId = requestedTermId && terms.some(t => t.AdTermId === requestedTermId) ? requestedTermId : link.AdTermId;
  const rows = displayTermId === link.AdTermId
    ? linkRows
    : (await Repository.getSchedulesByScope({ collegeId: link.AdCollegeId, termId: displayTermId }))
        .filter(row => row.AdInstructorId === person.AdInstructorId);

  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const shaped = rows
    .map(row => ({
      id: row.id,
      code: courseById.get(row.AdCourseId)?.CourseCode || "",
      name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
      section: row.SCode || "",
      start: row.fstarttime, end: row.fendtime,
      days: shareDayIndexes(row),
      room: row.AdRoomCode || "", hall: row.AdRoomHall || ""
    }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const weeklyMinutes = shaped.reduce(
    (total, row) => total + Math.max(0, toMinutes(row.end) - toMinutes(row.start)) * row.days.length, 0
  );
  const byDay = SHARE_DAY_NAMES.map((name, index) => {
    const dayRows = shaped.filter(row => row.days.includes(index));
    // A gap is idle time between two of the day's own lectures — the thing an
    // instructor actually plans around.
    const gaps: Array<{ from: string; to: string; minutes: number }> = [];
    for (let i = 1; i < dayRows.length; i++) {
      const idle = toMinutes(dayRows[i].start) - toMinutes(dayRows[i - 1].end);
      if (idle >= 30) gaps.push({ from: dayRows[i - 1].end, to: dayRows[i].start, minutes: idle });
    }
    const first = dayRows[0], last = dayRows[dayRows.length - 1];
    return {
      name, rows: dayRows, gaps,
      span: first ? { from: first.start, to: last.end } : null
    };
  });

  return {
    name: person.AdInstructorName || "",
    college: colleges.find(row => row.AdCollegeId === link.AdCollegeId)?.AdCollegeName || "",
    term: terms.find(row => row.AdTermId === displayTermId)?.AdTermName || "",
    termId: displayTermId,
    // Newest first, so the instructor can pin any semester from the card (Idea 2).
    availableTerms: [...terms].sort((a, b) => Number(b.AdTermId) - Number(a.AdTermId)).map(t => ({ id: t.AdTermId, name: t.AdTermName })),
    expiresAt: link.expiresAt,
    weeklyMinutes,
    lectureCount: shaped.length,
    dayCount: byDay.filter(day => day.rows.length).length,
    rooms: Array.from(new Set(shaped.map(row => `${row.room}/${row.hall}`).filter(value => value !== "/"))),
    longestGap: Math.max(0, ...byDay.flatMap(day => day.gaps.map(gap => gap.minutes))),
    byDay,
    rows: shaped
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
  const kind = req.body?.kind === "staff" ? "staff" : "department";
  const [sections, terms] = await Promise.all([Repository.getSections(), Repository.getTerms()]);
  const sectionName = sections.find(row => row.AdSectionId === sectionId)?.AdSectionName || "قسم";
  const termName = terms.find(row => row.AdTermId === termId)?.AdTermName || "";
  const label = kind === "staff"
    ? `بطاقات الأساتذة · ${termName}`.trim()
    : `${sectionName} · ${termName}`.trim();
  const link = await Repository.createShareLink({
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    label,
    kind,
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
  // A staff link is a door to one card, never to the department's whole feed.
  if (resolved.link.kind === "staff") { res.status(404).json({ error: "هذا الرابط بطاقة أستاذ" }); return; }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(await buildSharePayload(resolved.link));
});

app.get("/api/public/ics/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }
  if (resolved.link.kind === "staff") { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
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

app.post("/api/public/staff/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "staff") { res.status(404).json({ error: "هذا الرابط ليس بطاقة أستاذ" }); return; }
  if (!staffLookupAllowed(token, req.ip || "unknown")) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }
  const card = await buildStaffCard(resolved.link, String(req.body?.civil || ""), Number(req.body?.termId || 0));
  // One answer for a wrong number and for someone with no lectures this term:
  // the page must not become a way to test which numbers exist.
  if (!card) { res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return; }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(card);
});

app.get("/api/public/staff-ics/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }
  if (resolved.link.kind !== "staff") { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
  if (!staffLookupAllowed(token, req.ip || "unknown")) { res.status(429).type("text/plain; charset=utf-8").send("Too many requests"); return; }
  const card = await buildStaffCard(resolved.link, String(req.query.civil || ""));
  if (!card) { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }

  const anchor = new Date(); anchor.setHours(0, 0, 0, 0);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const escape = (value: string) => String(value || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SCHEDULE//Academic Workspace//AR",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(card.name || "جدولي")}`,
    "X-WR-TIMEZONE:Asia/Kuwait"
  ];
  for (const row of card.rows) {
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
        `UID:staff-${row.id}-${dayIndex}@schedule`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(startAt)}`,
        `DTEND:${stamp(endAt)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${SHARE_ICS_DAYS[dayIndex]};COUNT=16`,
        `SUMMARY:${escape(`${row.code} · ${row.name}`)}`,
        `LOCATION:${escape([row.room, row.hall].filter(Boolean).join(" / "))}`,
        `DESCRIPTION:${escape(row.section ? `شعبة ${row.section}` : "")}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="my-schedule.ics"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(lines.join("\r\n"));
});

/**
 * The instructor card page: one file, no bundle, no account.
 *
 * It opens on a single question — the civil ID — and turns into a personal
 * week once answered. Everything is inline so it loads on a weak connection
 * and keeps working when the campus network is slow.
 */
function staffCardPage(token: string, label: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a100f">
<meta name="robots" content="noindex,nofollow">
<title>بطاقتي · SCHEDULE</title>
<style>
*,*::before,*::after{box-sizing:border-box}
:root{--bg:#0a100f;--card:#111917;--line:#1e2a27;--ink:#eef2ee;--dim:#8d9a94;--jade:#69c0a8;--brass:#c79b5f}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;
  -webkit-font-smoothing:antialiased;padding:max(20px,env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom))}
.wrap{max-width:760px;margin:0 auto}
.mark{font:600 12px/1 ui-monospace,monospace;letter-spacing:.26em;color:var(--brass)}
.gate{margin-top:22vh;text-align:center;animation:rise .4s ease both}
.gate h1{margin:18px 0 6px;font-size:26px;font-weight:600;letter-spacing:-.02em}
.gate p{margin:0 0 26px;color:var(--dim);font-size:14px;line-height:1.8}
.field{display:flex;gap:10px;max-width:380px;margin:0 auto}
input{flex:1;min-width:0;height:52px;padding:0 16px;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);font:600 17px/1 ui-monospace,monospace;letter-spacing:.06em;
  text-align:center;direction:ltr;outline:none;transition:border-color .16s,box-shadow .16s}
input:focus{border-color:var(--jade);box-shadow:0 0 0 3px rgba(105,192,168,.16)}
button{height:52px;padding:0 22px;border:0;border-radius:14px;background:var(--jade);color:#07100d;
  font:600 15px/1 inherit;cursor:pointer;transition:transform .12s,filter .16s}
button:active{transform:scale(.98)}
button[disabled]{filter:grayscale(.5);opacity:.6;cursor:default}
.note{margin-top:16px;min-height:20px;color:#e0a08c;font-size:13px}
.hint{margin-top:26px;color:#5f6d67;font-size:12px;line-height:1.9}
.card{display:none;animation:rise .45s ease both}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:22px 0 20px;
  padding-bottom:18px;border-bottom:1px solid var(--line)}
.head h1{margin:6px 0 0;font-size:clamp(24px,6vw,32px);font-weight:600;letter-spacing:-.03em;line-height:1.2}
.head small{display:block;color:var(--dim);font-size:13px}
.term-switch{display:flex;align-items:center;gap:10px;margin:0 0 20px;flex-wrap:wrap}
.term-switch label{color:var(--dim);font-size:12px;font-weight:600}
.term-switch select{flex:1;min-width:180px;min-height:44px;padding:0 14px;font-size:16px;
  border:1px solid var(--line);border-radius:12px;background:var(--card);color:inherit}
.pub-empty{padding:32px 16px;text-align:center;color:var(--dim);font-size:15px;
  border:1px dashed var(--line);border-radius:16px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin-bottom:22px}
.stat{padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
.stat b{display:block;font-size:26px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.stat span{display:block;margin-top:2px;color:var(--dim);font-size:12px}
.day{margin-bottom:14px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}
.day>h2{display:flex;align-items:center;justify-content:space-between;margin:0;padding:14px 16px;
  font-size:15px;font-weight:600;border-bottom:1px solid var(--line)}
.day>h2 em{font-style:normal;color:var(--dim);font:500 12px/1 ui-monospace,monospace;direction:ltr}
.slot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:13px 16px;border-bottom:1px solid var(--line)}
.slot:last-child{border-bottom:0}
.slot strong{font-size:15px;font-weight:600;line-height:1.4}
.slot time{color:var(--jade);font:600 13px/1.6 ui-monospace,monospace;direction:ltr;white-space:nowrap}
.slot small{grid-column:1/-1;color:var(--dim);font-size:12.5px}
.gap{display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(199,155,95,.07);
  color:var(--brass);font-size:12.5px;border-bottom:1px solid var(--line)}
.gap i{flex:none;width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
.gap time{font:600 12px/1 ui-monospace,monospace;direction:ltr}
.tools{display:flex;gap:10px;margin:22px 0 8px}
.tools a{flex:1;height:48px;display:grid;place-items:center;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);font-size:14px;font-weight:600;text-decoration:none}
.foot{margin-top:26px;color:#4d5a55;font-size:11.5px;text-align:center;line-height:1.9}
/* The approved report table — the same five-column week the reports print,
   so the professor's shared card and the official sheet read as one family. */
.pub-week{width:100%;margin:0 0 18px;border-collapse:collapse;table-layout:fixed;background:var(--card);border-radius:16px;overflow:hidden}
.pub-week th{padding:9px 4px;text-align:center;font-size:12px;font-weight:650;color:var(--brass);border:1px solid var(--line);background:rgba(255,255,255,.03)}
.pub-week td{border:1px solid var(--line);padding:0;vertical-align:top}
.pub-week th.t{width:52px;font:600 10.5px/1.4 ui-monospace,monospace;color:var(--jade);vertical-align:top;padding-top:9px}
.pub-week .wslot{display:block;padding:8px 9px;border-bottom:1px dashed var(--line)}
.pub-week .wslot:last-child{border-bottom:0}
.pub-week .wslot b{display:block;font-size:12px;font-weight:650;line-height:1.35}
.pub-week .wslot time{display:block;margin-top:2px;font:600 10.5px/1.4 ui-monospace,monospace;color:var(--jade);direction:ltr}
.pub-week .wslot small{display:block;margin-top:1px;color:var(--dim);font-size:10.5px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media print{body{background:#fff;color:#000;padding:0}.gate,.tools,.foot{display:none}
  .day,.stat{border-color:#bbb;background:#fff}.slot time{color:#111}
  .pub-week{background:#fff;border-radius:0}
  .pub-week th{color:#111;background:#f0f0ec;border-color:#9aa3a0}
  .pub-week td{border-color:#9aa3a0}
  .pub-week .wslot b,.pub-week .wslot time{color:#111}.pub-week .wslot small{color:#444}}
</style>
</head>
<body>
<div class="wrap">
  <div class="gate" id="gate">
    <div class="mark">SCHEDULE</div>
    <h1>بطاقتي</h1>
    <p>${label}<br>اكتب رقمك المدني لعرض جدولك.</p>
    <form class="field" id="form">
      <input id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="الرقم المدني" aria-label="الرقم المدني">
      <button type="submit" id="go">عرض</button>
    </form>
    <div class="note" id="note" role="status" aria-live="polite"></div>
    <p class="hint">صفحة للقراءة فقط · لا تحتاج حساباً<br>لا تُعرض أرقام هواتف ولا بيانات زملائك.</p>
  </div>

  <div class="card" id="card">
    <div class="head">
      <div>
        <div class="mark">بطاقتي</div>
        <h1 id="name"></h1>
        <small id="scope"></small>
      </div>
    </div>
    <div class="term-switch">
      <label for="termPick">الفصل الدراسي</label>
      <select id="termPick" aria-label="اختر الفصل الدراسي"></select>
    </div>
    <div class="stats" id="stats"></div>
    <div id="days"></div>
    <div class="tools">
      <a id="ics" href="#">إضافة إلى التقويم</a>
      <a href="#" id="print">طباعة</a>
    </div>
    <div class="foot" id="foot"></div>
  </div>
</div>
<script>
(function(){
  var TOKEN=${JSON.stringify(token)};
  var gate=document.getElementById("gate"),card=document.getElementById("card");
  var note=document.getElementById("note"),go=document.getElementById("go"),civil=document.getElementById("civil");
  var ar=function(n){try{return Number(n||0).toLocaleString("ar-KW-u-nu-latn")}catch(e){return String(n)}};
  var hours=function(m){var h=Math.floor(m/60),r=m%60;return r?ar(h)+"٫"+ar(Math.round(r/6)):ar(h)};
  var esc=function(s){var d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML};

  document.getElementById("print").addEventListener("click",function(e){e.preventDefault();window.print()});

  document.getElementById("form").addEventListener("submit",function(event){
    event.preventDefault();
    var value=(civil.value||"").replace(/[^0-9٠-٩۰-۹]/g,"")
      .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
      .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))});
    if(value.length<8){note.textContent="اكتب الرقم المدني كاملاً.";return}
    note.textContent="";go.disabled=true;go.textContent="…";
    fetch("/api/public/staff/"+encodeURIComponent(TOKEN),{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:value})
    }).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
      .then(function(res){
        go.disabled=false;go.textContent="عرض";
        if(!res.ok){note.textContent=res.data&&res.data.error?res.data.error:"تعذر العرض";return}
        render(res.data,value);
      })
      .catch(function(){go.disabled=false;go.textContent="عرض";note.textContent="تعذر الاتصال. تحقق من الإنترنت."});
  });

  var currentCivil="";
  function switchTerm(termId){
    var pick=document.getElementById("termPick");if(pick)pick.disabled=true;
    fetch("/api/public/staff/"+encodeURIComponent(TOKEN),{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({civil:currentCivil,termId:termId})
    }).then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
      .then(function(res){if(pick)pick.disabled=false;if(res.ok)render(res.data,currentCivil);else if(pick)note.textContent=res.data&&res.data.error?res.data.error:"";})
      .catch(function(){if(pick)pick.disabled=false});
  }
  function render(d,value){
    currentCivil=value;
    document.getElementById("name").textContent=d.name;
    document.getElementById("scope").textContent=d.college||"";
    var termPick=document.getElementById("termPick");
    if(termPick&&d.availableTerms&&d.availableTerms.length){
      termPick.innerHTML=d.availableTerms.map(function(t){return '<option value="'+t.id+'"'+(t.id===d.termId?' selected':'')+'>'+esc(t.name)+'</option>'}).join("");
      termPick.onchange=function(){switchTerm(Number(termPick.value)||0)};
    }
    document.getElementById("stats").innerHTML=[
      ["ساعة أسبوعياً",hours(d.weeklyMinutes)],
      ["محاضرة",ar(d.lectureCount)],
      ["أيام",ar(d.dayCount)],
      ["قاعات",ar(d.rooms.length)]
    ].map(function(x){return '<div class="stat"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>'}).join("");

    // The approved five-column week first — the report everyone recognises —
    // then the per-day detail with its waiting-gap annotations underneath.
    // Days across the top, starting hours down the right edge — the paper shape.
    var starts=[];d.byDay.forEach(function(day){day.rows.forEach(function(r){if(starts.indexOf(r.start)<0)starts.push(r.start)})});starts.sort();
    var weekTable='<table class="pub-week"><colgroup><col style="width:52px">'+d.byDay.map(function(){return '<col>'}).join("")+
      '</colgroup><thead><tr><th class="t">الوقت</th>'+d.byDay.map(function(day){return '<th>'+esc(day.name)+'</th>'}).join("")+
      '</tr></thead><tbody>'+starts.map(function(start){
        return '<tr><th class="t" dir="ltr">'+esc(start)+'</th>'+d.byDay.map(function(day){
          return '<td>'+day.rows.filter(function(r){return r.start===start}).map(function(row){
            return '<span class="wslot"><b>'+esc(row.name||row.code)+'</b>'+
              '<time>–'+esc(row.end)+'</time>'+
              '<small>'+[row.code,(row.room||row.hall)&&(esc(row.room||"")+"/"+esc(row.hall||""))].filter(Boolean).join(" · ")+'</small></span>';
          }).join("")+'</td>';
        }).join("")+'</tr>';
      }).join("")+'</tbody></table>';
    document.getElementById("days").innerHTML=weekTable+d.byDay.filter(function(day){return day.rows.length}).map(function(day){
      // The gap sits where it happens — between the two lectures it separates.
      var body=day.rows.map(function(row,i){
        var lead="";
        if(i>0){
          var before=day.gaps.filter(function(g){return g.to===row.start});
          if(before.length){
            lead='<div class="gap"><i></i>فراغ <time>'+esc(before[0].from)+'–'+esc(before[0].to)+'</time> · '+ar(before[0].minutes)+' دقيقة</div>';
          }
        }
        return lead+'<div class="slot"><strong>'+esc(row.name||row.code)+'</strong>'+
               '<time>'+esc(row.start)+'–'+esc(row.end)+'</time>'+
               '<small>'+[row.code,row.section&&("شعبة "+row.section),(row.room||row.hall)&&(esc(row.room)+"/"+esc(row.hall))].filter(Boolean).join(" · ")+'</small></div>';
      }).join("");
      return '<section class="day"><h2>'+esc(day.name)+'<em>'+esc(day.span?day.span.from+"–"+day.span.to:"")+'</em></h2>'+body+'</section>';
    }).join("");
    if(!d.lectureCount) document.getElementById("days").innerHTML='<div class="pub-empty">لا محاضرات لك في هذا الفصل — جرّب فصلاً آخر من الأعلى.</div>';

    document.getElementById("ics").setAttribute("href",
      "/api/public/staff-ics/"+encodeURIComponent(TOKEN)+"?civil="+encodeURIComponent(value));
    try{
      var until=new Intl.DateTimeFormat("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric"}).format(new Date(d.expiresAt));
      document.getElementById("foot").textContent="هذا الرابط صالح حتى "+until+" · للقراءة فقط";
    }catch(e){}
    gate.style.display="none";card.style.display="block";
    window.scrollTo(0,0);
  }
})();
</script>
</body>
</html>`;
}

app.get("/s/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  res.setHeader("Cache-Control", "no-store");
  // `res.type("html; charset=utf-8")` is not a shorthand Express understands —
  // it fell through to application/octet-stream, so phones offered to download
  // the page instead of showing it. Set the header outright.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if ("error" in resolved) {
    res.status(resolved.status).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SCHEDULE</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a100f;color:#eef2ee;font-family:-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif}p{font-size:15px;color:#93a09a}</style></head><body><div style="text-align:center"><div style="font:600 13px/1 system-ui;letter-spacing:.24em;color:#c79b5f">SCHEDULE</div><p>${esc(resolved.error)}</p></div></body></html>`);
    return;
  }
  if (resolved.link.kind === "staff") {
    res.send(staffCardPage(resolved.link.id, esc(resolved.link.label || "بطاقة الأستاذ")));
    return;
  }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  const payload = await buildSharePayload(resolved.link);
  const byDay = SHARE_DAY_NAMES.map((name, index) => ({
    name,
    rows: payload.rows.filter(row => row.days.includes(index)).sort((a, b) => String(a.start).localeCompare(String(b.start)))
  })).filter(day => day.rows.length);

  /**
   * The published page IS the approved report.
   *
   * The application already has one week format everyone signs off on — the
   * reports' five-column table, a day per column and the day's lectures
   * stacked inside it in time order. The share page used to draw its own
   * absolutely-positioned grid instead, with no lane logic, so two lectures
   * at the same hour painted on top of each other and one of them simply
   * vanished. A table cannot overlap by construction: every lecture is a row
   * in its day's stack, however crowded the hour. Same markup shape, same
   * borders, same order as the printed report.
   */
  /* Rows are the starting hours, read down the right edge; days run across
     the top — the exact shape of the paper sheet this page replaces. A cell
     holds whatever begins at that hour on that day. */
  const startTimes = [...new Set(payload.rows.map(row => String(row.start)))].sort();
  const slotHtml = (row: typeof payload.rows[number]) => `<span class="slot">
      <b>${esc(row.name)}</b>
      ${row.code || row.section ? `<small dir="ltr">${esc(row.code || "")}${row.section ? ` · ${esc(row.section)}` : ""}</small>` : ""}
      <time dir="ltr">–${esc(row.end)}</time>
      ${row.room || row.hall ? `<time dir="ltr">${esc([row.room, row.hall].filter(Boolean).join("/"))}</time>` : ""}
      ${row.instructor ? `<i>${esc(firstLast(row.instructor))}</i>` : ""}
    </span>`;
  const tableBody = startTimes.map(start => `<tr>
    <th class="t" dir="ltr">${esc(start)}</th>
    ${SHARE_DAY_NAMES.map((_, dayIndex) =>
      `<td>${payload.rows
        .filter(row => row.days.includes(dayIndex) && String(row.start) === start)
        .map(slotHtml).join("")}</td>`).join("")}
  </tr>`).join("");
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
/* The approved report table, on screen: five equal day columns, the day's
   lectures stacked inside in time order. Nothing is positioned, so nothing
   can overlap. */
.pub-week{width:100%;margin-top:26px;border-collapse:collapse;table-layout:fixed;background:var(--card);border-radius:14px;overflow:hidden}
.pub-week th{padding:10px 6px;text-align:center;font-size:12.5px;font-weight:650;color:var(--brass);border:1px solid var(--line);background:rgba(255,255,255,.03)}
.pub-week td{border:1px solid var(--line);padding:0;vertical-align:top}
.pub-week th.t{width:58px;font:600 11px/1.4 ui-monospace,Menlo,monospace;color:var(--accent);vertical-align:top;padding-top:10px}
.pub-week tbody th.t{background:rgba(255,255,255,.02)}
.pub-week .slot{display:block;padding:9px 10px;border-bottom:1px dashed var(--line)}
.pub-week .slot:last-child{border-bottom:0}
.pub-week .slot b{display:block;font-size:12.5px;font-weight:650;line-height:1.35}
.pub-week .slot small{display:block;margin-top:1px;font:600 10px/1.4 ui-monospace,Menlo,monospace;color:var(--brass)}
.pub-week .slot time{display:block;margin-top:2px;font:600 11px/1.4 ui-monospace,Menlo,monospace;color:var(--accent);white-space:nowrap}
.pub-week .slot time+time{color:var(--muted);margin-top:0}
.pub-week .slot i{display:block;margin-top:2px;font-style:normal;font-size:11px;color:var(--muted)}
.listing{margin-top:30px}
@media (max-width:640px){.pub-week{display:none}}
@media (min-width:641px){.listing{display:none}}
@media print{
  .pub-week{display:table;background:#fff;border-radius:0}
  .pub-week th{color:#111;background:#f0f0ec;border-color:#9aa3a0}
  .pub-week td{border-color:#9aa3a0}
  .pub-week .slot{border-bottom-color:#ccc}
  .pub-week .slot b{color:#111}
  .pub-week .slot small{color:#555}
  .pub-week .slot time{color:#111}
  .pub-week .slot time+time,.pub-week .slot i{color:#444}
  .listing{display:none}
}
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
  ${payload.rows.length ? `<table class="pub-week">
    <colgroup><col style="width:58px">${SHARE_DAY_NAMES.map(() => `<col>`).join("")}</colgroup>
    <thead><tr><th class="t">الوقت</th>${SHARE_DAY_NAMES.map(name => `<th>${esc(name)}</th>`).join("")}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>` : ""}
  <div class="listing">
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
  </div>
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
  /**
   * No database, no service.
   *
   * This used to log the failure and carry on listening, which produced the
   * worst possible outcome: a site that answers, renders, and shows nothing —
   * indistinguishable to the person looking at it from a site with an empty
   * schedule. On a real deployment the process now exits, so the platform keeps
   * the previous working revision serving instead of replacing it with a broken
   * one. Locally it stays up and says exactly what is wrong on every request,
   * because a developer needs to read the reason, not guess it.
   */
  /**
   * No database, no data — but in development, still a running server.
   *
   * ── NOTE TO ANY AUTOMATED EDITOR ───────────────────────────────────────────
   * If you are here because the dev server would not start, the fix is NOT to
   * make the database fall back to the packaged demo snapshot. That fallback
   * has been added and removed from this project repeatedly, and each time it
   * produced the worst possible outcome: an application that looks completely
   * healthy while showing a schedule that is not the university's. People made
   * real decisions from invented rows.
   *
   * The server already starts without a database. Only /api answers 503, so
   * Vite serves the shell, the interface loads, and it says plainly what is
   * wrong. If something still fails to boot, fix the boot — do not restore the
   * fallback, and do not widen this handler beyond /api.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * On a real deployment the process exits instead, so the platform keeps the
   * previous working revision rather than replacing it with a broken one.
   */
  const isServingBuild = process.env.NODE_ENV === "production" ||
                         process.env.npm_lifecycle_event === "start" ||
                         Boolean(process.argv[1]?.endsWith("server.cjs"));
  let databaseFailure: string | null = null;
  try {
    await initDatabase();
  } catch (error) {
    databaseFailure = error instanceof Error ? error.message : String(error);
    console.error("تعذر تهيئة قاعدة البيانات:\n" + databaseFailure);
    if (isServingBuild) {
      console.error("لن يبدأ الخادم على بيانات بديلة. تبقى النسخة السابقة العاملة كما هي.");
      process.exit(1);
    }
    console.error("التطوير: الواجهة ستعمل، وكل طلبات /api سترد 503 بالسبب. لا بيانات بديلة.");
    // The guard registered at load reads this; the shell keeps serving.
    databaseDown = databaseFailure;
  }

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  /**
   * One request may fail. The building may not fall down.
   *
   * Express 4 does not catch a rejected promise from an async handler, so a
   * single Firestore DEADLINE_EXCEEDED used to travel all the way up as an
   * unhandled rejection — which on modern Node terminates the process. One slow
   * network moment would drop every in-flight request in the university and cut
   * every live schedule stream, and the person who saw it got a blank 503 with
   * nothing to report.
   *
   * Now the failure stops here: it is logged with its route so it can be found,
   * and the caller is answered in the language they are reading. The response
   * says only that the read failed — an internal message may name a collection
   * or a document path, and that is not a stranger's business.
   */
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[api-error] ${req.method} ${req.originalUrl}:`, error?.stack || error?.message || error);
    if (res.headersSent) { try { res.end(); } catch { /* the socket is already gone */ } return; }
    res.status(500).json({ error: "تعذّر إتمام العملية الآن. حاول مرة أخرى، وإذا تكرر الأمر أبلغ إدارة النظام." });
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
    // Keep executable application files revalidated. A JavaScript response that
    // is interrupted in transit must never become a year-long immutable copy in
    // the browser. Fonts/images are content-addressed or stable public assets and
    // remain safely cacheable. The service worker itself is deliberately no-store
    // because its URL is not hashed.
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (name === "index.html" || name === "sw.js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        } else if (/\.(?:js|css)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate, max-age=0");
        } else if (/\.(?:woff2?|png|svg|jpg|webp)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache, must-revalidate, max-age=0");
        }
      }
    }));
    /**
     * A missing file must answer 404, not the application shell.
     *
     * The catch-all below exists so that /FSchedule/Index reaches the router.
     * Applied to everything, it also answered requests for build assets: a tab
     * still holding the previous release asked for a chunk that no longer
     * exists and received index.html with status 200. The browser then tried to
     * run HTML as JavaScript, the module never executed, and the page stayed
     * blank with nothing in the network log looking wrong. Anything that names
     * a file — /assets/*, or a path with an extension — now fails honestly, so
     * the page's boot guard can clear the stale copy and reload.
     */
    const looksLikeFile = /\.[a-z0-9]{2,8}$/i;
    app.get("*", (req, res) => {
      if (req.path.startsWith("/assets/") || looksLikeFile.test(req.path)) {
        res.status(404).setHeader("Cache-Control", "no-store, no-cache, must-revalidate").type("text/plain; charset=utf-8").send("Not found");
        return;
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // The live channel spans instances only once the database is up.
  if (!databaseDown) listenForScheduleChangesAcrossInstances();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Server initialization failed:", error);
  process.exitCode = 1;
});
