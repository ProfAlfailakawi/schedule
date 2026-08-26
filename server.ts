import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import path from "path";
import { configureRuntimeEnvironment } from "./src/server/runtimeEnv";
import { BUILD_STAMP } from "./src/generated/buildStamp";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { gunzipSync } from "zlib";
import { activeDataMode, initDatabase, Repository, ScheduleRevisionConflict } from "./src/db/repository";
import { clearScheduleCacheQuietly, onSchedulesInvalidated } from "./src/db/referenceCache";
import { isCloudRunRuntime } from "./src/db/snapshot";
import { validateCivilId } from "./src/utils/civilId";
import { byRoom } from "./src/utils/sorting";
import { activeDays, analyzeSchedule, autoScheduleProposal, compareTerms, conflictSolutions, findConflicts, minutesToTime, SCHEDULE_DAYS, timeToMinutes } from "./src/utils/scheduleIntelligence";
import { buildScheduleGenome, buildWarRoom, evaluateScheduleConstraints, forecastScheduleMove, runScheduleAutopilot } from "./src/utils/scheduleInnovation";
import { describeRollover, readTermRollover } from "./src/utils/termRollover";
import { buildConflictTopology, buildDecisionMemoryInsight, buildFairnessEngine, buildFragilityMap, buildOneMinuteBrief, buildRoomResilience, buildScheduleHealth2, buildSchedulePulse, createEmergencyPlans, explainScheduleDecision } from "./src/utils/livingSchedule";
import type { FSchedule, ScheduleShareLink, HallBarterRequest, MasterBuilding, MasterRoom, LocationReviewCase } from "./src/types";
import { DAY_FLAGS, DAY_LABELS, parseNaturalQuery } from "./src/utils/naturalQuery";
import { coerceScopeValues } from "./src/utils/scopeContext";
import { AR, countOf } from "./src/utils/arabicCount";
import { readSettledDrift, settledTerm } from "./src/utils/settledDrift";
import { learnRhythm, offRhythm, describeRhythm, type RhythmReading } from "./src/utils/departmentRhythm";
import { readDepartmentMemory, type DepartmentMemory } from "./src/utils/departmentMemory";
import { readStudentDemand, cohortPairs, sharedBetween } from "./src/utils/studentDemand";
import { readDemandRepairs } from "./src/utils/demandRepair";
import { readCourseSuccession, cohortTurnover, predictDemand } from "./src/utils/courseSuccession";
import { readSectionOpenings } from "./src/utils/sectionOpening";
import { reasonForMove } from "./src/utils/appointmentStory";
import { buildCalendar, type CalendarLecture, type CalendarSingle } from "./src/utils/icalendar";
import { learnAll } from "./src/utils/courseNature";
import { firstLast } from "./src/utils/weekVisual";
import { Campus, DEFAULT_TRAVEL_MINUTES, SAME_BUILDING_MINUTES, campusOf, interCampusMinutes } from "./src/utils/campusTravel";
import {
  buildCourseLife,
  buildDecisionCost,
  buildHistoricalTimeModel,
  buildOfferingLife,
  discoverUnwrittenRules,
  explainWhyHere,
  investigateCrowding,
  logicalAnomalies,
  scheduleAccuracyFromVersions,
  simulatePolicy,
} from "./src/utils/advancedIntelligence";
import {
  formatScheduleTimeRange,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_END_TIME,
  SCHEDULE_DAY_START,
  SCHEDULE_DAY_START_TIME,
  SCHEDULE_SLOT_MINUTES,
  withinScheduleDay,
} from "./src/utils/scheduleTime";
import { canAccessGuideFeature, featureById, featureIdForGuideIntentGoal, parseStructuredGuideIntent } from "./src/guide/smartGuide";
import { ocrDocument, ocrGraduationSheetDocument, parseScheduleTable, graduationSheetFacts, cleanBuildingCode, readAuthorityPdfHeader } from "./src/utils/documentOcr";
import { academicDigits, assignAuthoritySections, authorityDepartmentCode, authorityDepartmentMatches } from "./src/utils/authorityAcademicCodes";
import { PENDING_ROOM, buildingIdentityKey, compareLocationCodes, isInvalidLocationToken, roomIdentityKey, resolveAuthorityLocation, resolveBuilding, resolveRoom } from "./src/utils/locationRegistry";
import { officialBuildingCode, officialCollegeSitePrefix, officialSiteLabel, parseOfficialBuildingCode } from "./src/utils/locationCollegePrefixes";
import { buildMigrationPlan, locationPreflight, mergeRegistryWithSeed, newMigrationRun, registryHealth, rollbackPatch, seedRegistry, LOCATION_MIGRATION_VERSION } from "./src/server/locationRegistryEngine";

// Resolve environment/private paths before database initialization.
configureRuntimeEnvironment();

const app = express();
const PORT = process.env.APPLET_ID ? 3000 : Number(process.env.PORT || 3000);


// User-facing reference lists follow one ordering contract everywhere: Arabic
// alphabetic order for names, and newest-to-oldest for academic terms. Keeping
// it at the API boundary prevents one picker from silently drifting away from
// another screen that consumes the same data.
const arabicUiCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base", ignorePunctuation: true });
const normalizeArabicSortName = (value: unknown) => String(value ?? "").trim()
  .replace(/^\s*(?:(?:[أا]\s*\.\s*د)|(?:د)|(?:م))\s*\.\s*/i, "")
  .replace(/[ً-ْـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/\s+/g, " ").trim();
const foldHeaderIdentity = (value: unknown) => String(value ?? "").normalize("NFKC")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[ً-ْـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/(?:^|\s)(?:قسم|القسم|كليه|كلية)(?=\s|$)/g," ")
  .replace(/[^ء-ي0-9a-zA-Z ]/g," ").replace(/\s+/g," ").trim().toLowerCase();
const isSpecialEducationIdentity = (value: unknown) => {
  const folded=foldHeaderIdentity(value);
  return /(?:^|\s)التربيه\s+الخاصه(?:\s|$)/.test(folded)||/(?:^|\s)تربيه\s+خاصه(?:\s|$)/.test(folded);
};
/**
 * One academic-section identity rule for import headers and student proofs.
 * Special Education is the deliberate umbrella exception: programme labels
 * such as «اسلامية تربية خاصة» or «لغة عربية تربية خاصة» belong to the one
 * canonical system department «قسم التربية الخاصة». A Special-Education
 * programme must never match Islamic Education / Arabic merely because it also
 * contains that subject word.
 */
const academicSectionNameMatches = (observed: unknown, canonical: unknown) => {
  const source=foldHeaderIdentity(observed),target=foldHeaderIdentity(canonical);
  if(!source||!target)return false;
  const sourceSpecial=isSpecialEducationIdentity(source),targetSpecial=isSpecialEducationIdentity(target);
  if(sourceSpecial||targetSpecial)return sourceSpecial&&targetSpecial;
  if(source.includes(target)||target.includes(source))return true;
  const loose=(token:string)=>token.replace(/^ال(?=\S{3,})/,"");
  const generic=new Set(["تربيه","تعليم","عامه","علمي"]);
  const sourceTokens=source.split(" ").map(loose).filter(Boolean);
  const tokens=target.split(" ").map(loose).filter(token=>token.length>=4&&!generic.has(token));
  return tokens.length>0&&tokens.every(token=>sourceTokens.includes(token));
};
const sortArabicNamed = <T>(rows: readonly T[], pick: (row: T) => unknown): T[] =>
  [...rows].sort((a, b) => arabicUiCollator.compare(normalizeArabicSortName(pick(a)), normalizeArabicSortName(pick(b))));
const verifiedRoomKey = (row: Partial<FSchedule>): string =>
  row.roomId && row.locationStatus !== "PENDING_ROOM" && row.locationStatus !== "LOCATION_REVIEW_REQUIRED" && row.locationStatus !== "INVALID_HISTORICAL"
    ? `id:${row.roomId}`
    : "";
const verifiedBuildingKey = (row: Partial<FSchedule>): string =>
  row.buildingId && row.locationStatus !== "LOCATION_REVIEW_REQUIRED" && row.locationStatus !== "INVALID_HISTORICAL"
    ? `id:${row.buildingId}`
    : "";
const termChronologyServer = (term: any) => {
  const name = String(term?.AdTermName || "");
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  const season = name.includes("الصيفي") ? 3 : name.includes("الثاني") ? 2 : name.includes("الأول") ? 1 : 0;
  return years ? Number(years[1]) * 10 + season : Number(term?.AdTermId || 0);
};
const sortTermsNewestServer = <T extends { AdTermId?: unknown; AdTermName?: unknown }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => termChronologyServer(b) - termChronologyServer(a) || Number(b.AdTermId || 0) - Number(a.AdTermId || 0));

let locationRegistryCache:{at:number;buildings:MasterBuilding[];rooms:MasterRoom[]}|null=null;
async function readLocationRegistry(force=false){
  if(!force&&locationRegistryCache&&Date.now()-locationRegistryCache.at<60_000)return locationRegistryCache;
  const [buildings,rooms]=await Promise.all([Repository.getLocationBuildings(),Repository.getLocationRooms()]);
  const merged=mergeRegistryWithSeed({buildings,rooms});
  merged.buildings.sort((a,b)=>compareLocationCodes(a.officialCode,b.officialCode));
  merged.rooms.sort((a,b)=>compareLocationCodes(a.buildingCode,b.buildingCode)||compareLocationCodes(a.canonicalCode,b.canonicalCode));
  locationRegistryCache={at:Date.now(),...merged};return locationRegistryCache;
}
function invalidateLocationRegistry(){locationRegistryCache=null;}
async function canonicalizeLocationForWrite(row:any,collegeId:number,sectionId:number){
  const registry=await readLocationRegistry();
  let check=locationPreflight(row,registry,{collegeId,sectionId});
  const blocking=check.issues.filter(issue=>issue.severity==="high");
  if(blocking.length&&blocking.every(issue=>issue.type==="room_scope")&&check.canonical&&await hallBarterAllowsRoomUse({...row,...check.canonical},collegeId,sectionId)){
    check=locationPreflight(row,registry,{collegeId,sectionId,allowOutOfScopeRoom:true});
  }
  return {registry,check};
}

/** Runtime-only bridge for the deployment window before the historical migration is executed.
 * It never writes legacy rows and never guesses REVIEW/PROBABLE values. The current term is
 * resolved against the confirmed registry in memory so aliases cannot hide a room conflict. */
function canonicalizeHistoricalLocationForRuntime(row:FSchedule,registry:{buildings:MasterBuilding[];rooms:MasterRoom[]}):FSchedule{
  if(row.locationStatus==="PENDING_ROOM"||row.roomId===PENDING_ROOM)return row;
  if(row.buildingId&&row.roomId)return row;
  const building=resolveBuilding(registry,String(row.AdRoomCode||""),{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
  if(building.status!=="CONFIRMED"||!building.value)return row;
  const room=resolveRoom(registry,String(row.AdRoomHall||""),building.value.id,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
  if(room.status!=="CONFIRMED"||!room.value)return {...row,buildingId:building.value.id,AdRoomCode:building.value.officialCode};
  return {...row,buildingId:building.value.id,roomId:room.value.id,AdRoomCode:building.value.officialCode,AdRoomHall:room.value.canonicalCode,locationStatus:"VERIFIED"};
}


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
    // Streams must not be buffered: SSE, and the NDJSON progress the PDF reader
    // emits line by line. Compressing either holds every line until the end,
    // which is exactly the frozen wait the progress bar exists to remove.
    if (type.includes("text/event-stream") || type.includes("x-ndjson")) return false;
    return compression.filter(req, res);
  },
}));
// Full-system backups are intentionally compressed and can be much larger than
// ordinary API payloads. Give only the backup upload endpoints a larger raw
// body allowance; every other JSON route keeps the tight 1 MB limit.
app.use(["/api/system-backup/preview", "/api/system-backup/import", "/api/system-backup/import-jobs"], express.raw({
  type: ["application/gzip", "application/octet-stream", "application/json"],
  limit: "30mb",
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
const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;

// Middleware to load session user
interface AuthenticatedRequest extends Request {
  userId?: number;
  user?: any;
  scopes?: { AdCollegeId: number; AdSectionId: number }[];
  /** FormName ids this session holds, resolved once with the identity. */
  permissions?: number[];
  demoSessionId?: string;
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
/**
 * The reason stays here; the browser gets a receipt.
 *
 * The failure text is a database driver's own words — hostnames, project ids,
 * credential paths, stack frames. It was being handed to whoever happened to be
 * looking at the login screen. What that reader actually needs is something they
 * can quote down a telephone; what the operator needs is the full sentence, and
 * the log is where the operator already looks. Same incident, one short id, two
 * audiences.
 */
let databaseDownRef: string | null = null;
/**
 * Is the schedule actually reachable?
 *
 * The browser's own `navigator.onLine` answers a much smaller question — is
 * there a network interface — and answers it optimistically: a laptop on a
 * café's wifi with no route out still reports itself online, and the screen was
 * telling that reader their work was «آمن للحفظ». This says the thing the
 * sentence claims: the process is up, and the database answered.
 *
 * Deliberately unauthenticated and deliberately tiny: it is polled, it must not
 * cost a session lookup, and it must keep answering while everything else 503s
 * so the interface can tell «الخادم واقف» from «قاعدة البيانات واقفة».
 */
app.get("/api/demo/config", (_req, res) => {
  res.json({
    enabled: process.env.SCHEDULE_DEMO_ENABLED !== "false",
    sessionMinutes: 60,
    isolated: true,
    adminReadOnly: true,
  });
});

/** Which build is running. The client compares this against its own compiled
 *  stamp and reloads itself when the server has moved on — the net that
 *  catches restored tabs and bfcache pages no service-worker event reaches. */
app.get("/api/version", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ build: BUILD_STAMP });
});

app.get("/api/health", (_req, res) => {
  res.type("application/json; charset=utf-8").send(JSON.stringify({
    ok: !databaseDown,
    database: databaseDown ? "down" : "up",
    ref: databaseDown ? databaseDownRef : undefined,
  }));
});

app.use("/api", (_req, res, next) => {
  if (!databaseDown) { next(); return; }
  res.status(503).type("application/json; charset=utf-8").send(JSON.stringify({
    error: "الخدمة متوقفة: تعذر الاتصال بقاعدة البيانات الحقيقية.",
    ref: databaseDownRef,
  }));
});

// A dedicated demo service binds every API request to the caller's own in-memory sandbox.
// No demo request can fall through to another visitor's state. Production mode bypasses this entirely.
app.use("/api", (req: Request, _res: Response, next: NextFunction) => {
  const sessionId = getCookies(req)["session_id"];
  // /journey is intentionally a marketing read of the real institutional
  // aggregate. It must never inherit a visitor's synthetic Demo sandbox.
  if (!sessionId?.startsWith("demo_") || req.path === "/auth/demo" || req.path === "/journey") { next(); return; }
  (req as AuthenticatedRequest).demoSessionId = sessionId;
  if (!Repository.runDemoSandbox(sessionId, next)) next();
});

// Only the API needs to know who is calling. Stylesheets, fonts and the shell
// were paying for an identity lookup they never read.
app.use("/api", authMiddleware as express.RequestHandler);

// System administration is a showroom in demo: readable, never mutable. This is
// server-side enforcement, so removing `disabled` in DevTools still cannot change it.
const DEMO_READ_ONLY_PREFIXES = ["/users", "/permissions", "/user-scopes", "/system-backup"];
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!Repository.isDemoRequest() || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") { next(); return; }
  if (req.path === "/auth/logout" || req.path === "/auth/heartbeat" || req.path === "/auth/presence" || req.path === "/demo/reset") { next(); return; }
  if (DEMO_READ_ONLY_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    res.status(403).json({ error: "هذه شاشة عرض في البيئة التجريبية. الإدارة الحقيقية محمية ولا يمكن تعديلها من Demo." });
    return;
  }
  next();
});

type ApiPerformanceSample = { at:number; path:string; method:string; durationMs:number; status:number; userId:number; collegeId:number; sectionId:number; termId:number };
const apiPerformanceSamples: ApiPerformanceSample[] = [];
const API_PERFORMANCE_LIMIT = 5000;
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/telemetry/client") { next(); return; }
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const q:any = req.query || {}, b:any = req.body || {};
    apiPerformanceSamples.push({
      at: Date.now(), path: req.path, method: req.method, durationMs: Math.round(durationMs), status: res.statusCode,
      userId: Number(req.user?.SystemUserId || 0),
      collegeId: Number(q.collegeId || q.AdCollegeId || b.collegeId || b.AdCollegeId || 0),
      sectionId: Number(q.sectionId || q.AdSectionId || b.sectionId || b.AdSectionId || 0),
      termId: Number(q.termId || q.AdTermId || b.termId || b.AdTermId || 0),
    });
    if (apiPerformanceSamples.length > API_PERFORMANCE_LIMIT) apiPerformanceSamples.splice(0, apiPerformanceSamples.length - API_PERFORMANCE_LIMIT);
  });
  next();
});

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
  const skip = (routePath.startsWith("/auth/") && !authEvent) || routePath.endsWith("/check-conflicts") || routePath === "/telemetry/client";
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
/* The schedule workspace and مركز الذكاء are the same permission — every
   intelligence route is guarded by it, and every list route accepts it. */
const DECISION_CENTRE_FORM_ID = 7;
function isPowerUser(req: AuthenticatedRequest): boolean {
  return Boolean(req.user && (req.user.IsAdminUser || Number(req.user.SystemUserId) === ROOT_ADMIN_USER_ID));
}
function requirePowerAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
  if (!isPowerUser(req)) { res.status(403).json({ error: "هذه الأداة مخصصة لإدارة النظام الرئيسية" }); return; }
  next();
}

const ROOT_ADMIN_USER_ID = Math.max(1, Number(process.env.ROOT_ADMIN_USER_ID || 1) || 1);
function requireRootAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }); return; }
  if (Number(req.user.SystemUserId) !== ROOT_ADMIN_USER_ID) {
    res.status(403).json({ error: "هذه الخزنة مخصصة لحساب الإدارة الرئيسي فقط" });
    return;
  }
  next();
}

function readSystemBackupBody(req: Request): unknown {
  if (!Buffer.isBuffer(req.body)) return req.body;
  let raw = req.body as Buffer;
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);
  if (raw.length > 80 * 1024 * 1024) throw new Error("النسخة بعد فك الضغط أكبر من الحد الآمن");
  return JSON.parse(raw.toString("utf8"));
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

function safeImportEvidence(input:any){
  if(!input||typeof input!=="object")return undefined;
  const field=(value:any)=>value&&typeof value==="object"?{
    raw:String(value.raw||"").slice(0,220),normalized:String(value.normalized||"").slice(0,220),
    canonical:value.canonical===undefined||value.canonical===null?undefined:String(value.canonical).slice(0,180),
    confidence:["CONFIRMED","REVIEW_REQUIRED","UNRESOLVED"].includes(String(value.confidence))?String(value.confidence):"UNRESOLVED",
    score:Number.isFinite(Number(value.score))?Math.max(0,Math.min(100,Math.round(Number(value.score)))):undefined,
    source:String(value.source||"").slice(0,60)||undefined,
    method:String(value.method||"").slice(0,80)||undefined,
    derived:Boolean(value.derived),
    reason:String(value.reason||"").slice(0,300),
    evidence:Array.isArray(value.evidence)?value.evidence.map((item:any)=>String(item||"").slice(0,180)).filter(Boolean).slice(0,8):[],
  }:undefined;
  const safe:any={};
  for(const key of ["course","section","days","time","instructor","building","room"]){const item=field(input[key]);if(item)safe[key]=item;}
  return Object.keys(safe).length?safe:undefined;
}

type PdfImportReceipt={v:1;collegeId:number;sectionId:number;termId:number;sourceTerm:string;sourceBranch:string;sourceDepartment:string;issuedAt:string};
async function signPdfImportReceipt(payload:PdfImportReceipt){
  const body=Buffer.from(JSON.stringify(payload),"utf8").toString("base64url");
  const secret=await Repository.getStudentCaseSecret();
  const signature=createHmac("sha256",secret).update(`pdf-import|${body}`).digest("base64url");
  return`${body}.${signature}`;
}
async function verifyPdfImportReceipt(token:unknown,context:{collegeId:number;sectionId:number;termId:number}){
  try{
    const[body,signature]=String(token||"").split(".");if(!body||!signature)return null;
    const secret=await Repository.getStudentCaseSecret();
    const expected=createHmac("sha256",secret).update(`pdf-import|${body}`).digest("base64url");
    const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;
    const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8")) as PdfImportReceipt;
    if(payload.v!==1||payload.collegeId!==context.collegeId||payload.sectionId!==context.sectionId||payload.termId!==context.termId)return null;
    return payload;
  }catch{return null;}
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
    buildingId: String(raw?.buildingId || "") || undefined, roomId: String(raw?.roomId || "") || undefined,
    locationStatus: raw?.locationStatus, sourceBuildingText: String(raw?.sourceBuildingText || raw?.AdRoomCode || "").slice(0,80) || undefined,
    sourceRoomText: String(raw?.sourceRoomText || raw?.AdRoomHall || "").slice(0,80) || undefined,
    sourceSitePrefix: String(raw?.sourceSitePrefix || "").slice(0,12) || undefined,
    sourceSiteLabel: String(raw?.sourceSiteLabel || "").slice(0,140) || undefined,
    courseSiteLabel: String(raw?.courseSiteLabel || "").slice(0,140) || undefined,
    courseSiteMessage: String(raw?.courseSiteMessage || "").slice(0,420) || undefined,
    scopeMismatchType: raw?.scopeMismatchType === "CROSS_BRANCH" ? "CROSS_BRANCH" : undefined,
    scopeMismatchLabel: String(raw?.scopeMismatchLabel || "").slice(0,140) || undefined,
    scopeMismatchMessage: String(raw?.scopeMismatchMessage || "").slice(0,420) || undefined,
    locationMigrationId: raw?.locationMigrationId, locationMigrationVersion: raw?.locationMigrationVersion, locationResolvedAt: raw?.locationResolvedAt,
    fdetail: legacyFDetail(raw || {}),
    referenceNumber: String(raw?.referenceNumber || "").slice(0,30),
    sourceInstructorText: String(raw?.sourceInstructorText || "").slice(0,180) || undefined,
    sourceCourseCode:String(raw?.sourceCourseCode||"").slice(0,40)||undefined,
    sourceCourseText:String(raw?.sourceCourseText||"").slice(0,220)||undefined,
    sourceSectionText:String(raw?.sourceSectionText||"").slice(0,40)||undefined,
    importEvidence:safeImportEvidence(raw?.importEvidence),
    // Imported PDF rows carry their original stable order. New rows deliberately
    // live in a separate range so they can never impersonate a deleted source row.
    sourceOrder: raw?.sourceOrder !== undefined && raw?.sourceOrder !== null && Number.isFinite(Number(raw.sourceOrder))
      ? Number(raw.sourceOrder)
      : 1_000_000 + index,
  }));
}

const AUTHORITY_PDF_COMPARE_FIELDS = [
  "AdCourseId","SCode","AdInstructorId",
  "fsunday","fmonday","ftuesday","fwednesday","fthursday",
  "fstarttime","fendtime","AdRoomCode","AdRoomHall"
] as const;

/** Compare the immutable source PDF with the LIVE timetable, not the saved
 * draft. sourceOrder is the stable trace carried from the PDF through publish;
 * ordinary rows created later live outside the imported source range. */
function buildAuthorityPdfDiff(baselineInput:any[],currentInput:any[]){
  const baseline=[...(baselineInput||[])].sort((a:any,b:any)=>Number(a.sourceOrder)-Number(b.sourceOrder));
  const current=[...(currentInput||[])];
  const consumed=new Set<number>();
  const refKey=(value:any)=>String(value||"").replace(/[\s\u200e\u200f\u202a-\u202e]/g,"").trim();
  const sectionKey=(row:any)=>`${Number(row?.AdCourseId||0)}|${String(row?.SCode||"").trim()}`;
  /* A row created after the Authority PDF is a new academic action forever:
     editing it keeps it green, and deleting it removes it from the report.
     sourceOrder >= 1,000,000 is the explicit post-PDF range. Older imported
     rows that pre-date sourceOrder can still prove their PDF origin through
     CRN/reference or the immutable import-evidence fields. */
  const hasPdfEvidence=(row:any)=>Boolean(refKey(row?.referenceNumber)||row?.sourceCourseCode||row?.sourceCourseText||row?.sourceSectionText||row?.importEvidence);
  const isImportedPdfRow=(row:any)=>{
    const rawOrder=row?.sourceOrder;
    /* sourceOrder alone is not provenance. A manual form can inherit stale UI
       state, but it cannot manufacture immutable PDF evidence. Requiring both
       keeps every post-PDF row green even after later edits. */
    if(rawOrder!==undefined&&rawOrder!==null&&Number.isFinite(Number(rawOrder)))return Number(rawOrder)<1_000_000&&hasPdfEvidence(row);
    return hasPdfEvidence(row);
  };
  const uniqueIndex=(predicate:(row:any)=>boolean)=>{
    const matches:number[]=[];
    current.forEach((row:any,index:number)=>{if(!consumed.has(index)&&predicate(row))matches.push(index);});
    return matches.length===1?matches[0]:-1;
  };
  const matchIndex=(source:any)=>{
    const order=Number(source?.sourceOrder);
    if(Number.isFinite(order)){
      const index=uniqueIndex((row:any)=>isImportedPdfRow(row)&&Number(row?.sourceOrder)===order);
      if(index>=0)return index;
    }
    /* Older published rows may pre-date sourceOrder persistence. The reference
       number printed by the authority PDF is the safest stable fallback and
       keeps an ordinary edit classified as “changed”, not delete + add. */
    const reference=refKey(source?.referenceNumber);
    if(reference){
      const index=uniqueIndex((row:any)=>isImportedPdfRow(row)&&refKey(row?.referenceNumber)===reference);
      if(index>=0)return index;
    }
    /* Last conservative fallback for LEGACY IMPORTED rows only. A manual row
       created after the PDF must never impersonate a deleted source row merely
       because it happens to reuse the same course + section number. */
    const signature=sectionKey(source);
    if(!signature.startsWith("0|")){
      const index=uniqueIndex((row:any)=>isImportedPdfRow(row)&&sectionKey(row)===signature);
      if(index>=0)return index;
    }
    return -1;
  };
  const reportRows:any[]=[];
  baseline.forEach((source:any)=>{
    const index=matchIndex(source);
    if(index<0){
      reportRows.push({status:"deleted",changedFields:[],referenceNumber:String(source.referenceNumber||""),source,current:null});
      return;
    }
    consumed.add(index);
    const next=current[index];
    /* Compare the academic meaning of each printed cell, not incidental storage
       representation. Imported booleans, numeric ids, clocks and location codes
       can pass through JSON/Firestore with harmless type/spacing differences;
       those must never turn untouched cells yellow. */
    const comparable=(field:string,value:any)=>{
      if(["AdCourseId","AdInstructorId"].includes(field))return Number(value||0);
      if(["fsunday","fmonday","ftuesday","fwednesday","fthursday"].includes(field)){
        /* Firestore/JSON history can preserve imported weekday flags as 0/1
           strings. Boolean("0") is true in JavaScript and used to paint every
           untouched day cell yellow. Compare the academic flag, not JS truthiness. */
        const token=String(value??"").trim().toLowerCase();
        return value===true||value===1||token==="1"||token==="true"||token==="y"||token==="yes";
      }
      if(["AdRoomCode","AdRoomHall"].includes(field))return String(value||"").replace(/\s+/g,"").toUpperCase();
      if(["fstarttime","fendtime"].includes(field)){
        /* 09:00, 9:00 and the Authority import's 0900 all mean the same
           clock. Keep that storage-format noise out of the change report. */
        const digits=String(value||"").replace(/\D/g,"");
        if(/^\d{3,4}$/.test(digits)){const hh=digits.slice(0,-2).padStart(2,"0"),mm=digits.slice(-2);return `${hh}:${mm}`;}
        return String(value||"").trim();
      }
      return String(value??"").trim();
    };
    const changedFields=AUTHORITY_PDF_COMPARE_FIELDS.filter(field=>comparable(field,source[field])!==comparable(field,next[field]));
    reportRows.push({status:changedFields.length?"changed":"unchanged",changedFields,referenceNumber:String(source.referenceNumber||next.referenceNumber||""),source,current:next});
  });
  current.forEach((row:any,index:number)=>{
    if(consumed.has(index))return;
    reportRows.push({status:"added",changedFields:[...AUTHORITY_PDF_COMPARE_FIELDS],referenceNumber:String(row.referenceNumber||""),source:null,current:row});
  });
  const counts=reportRows.reduce((acc:any,row:any)=>(acc[row.status]=(acc[row.status]||0)+1,acc),{added:0,deleted:0,changed:0,unchanged:0});
  return{rows:reportRows,counts};
}

function inferAuthorityBranchCode(draft:any,rows:any[]){
  const explicit=String(draft?.sourceBranchCode||"").trim();
  if(explicit)return explicit;
  const votes=new Map<string,number>();
  for(const row of rows||[]){
    const match=String(row?.AdRoomCode||"").trim().match(/^(\d{3})/);
    if(match)votes.set(match[1],(votes.get(match[1])||0)+1);
  }
  return[...votes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
}

async function validateSmartRows(rows: any[], collegeId: number, sectionId: number, options: { checkConflicts?: boolean; resolveHistorical?: boolean; requireDepartmentInstructor?:boolean } = {}) {
  const termId = Number(rows[0]?.AdTermId || 0);
  const checkConflicts = options.checkConflicts !== false;
  const [courses, instructors, currentSchedules, registry,sectionHistory,departmentDelegates,visitingRoster] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(), Repository.getSchedulesByScope({ termId }), readLocationRegistry(),
    options.requireDepartmentInstructor?Repository.getSchedulesByScope({collegeId,sectionId}):Promise.resolve([]),
    options.requireDepartmentInstructor?Repository.getDepartmentDelegates(collegeId,sectionId):Promise.resolve([]),
    options.requireDepartmentInstructor?Repository.getVisitingRoster(collegeId,sectionId,termId):Promise.resolve([]),
  ]);
  const courseById = new Map(courses.map(course => [course.AdCourseId, course]));
  const instructorIds = new Set(instructors.map(instructor => instructor.AdInstructorId));
  const departmentInstructorIds=new Set<number>([
    ...sectionHistory.map((row:any)=>Number(row.AdInstructorId||0)),...departmentDelegates.map(Number),...visitingRoster.map(Number),
  ].filter((id:number)=>id>0));
  const errors: string[] = [];
  for (let index=0; index<rows.length; index+=1) {
    const row=rows[index];
    if(options.resolveHistorical && !row.buildingId){
      const b=resolveBuilding(registry,row.AdRoomCode,{collegeId,sectionId});
      if(b.status==="CONFIRMED"&&b.value){
        row.buildingId=b.value.id; row.AdRoomCode=b.value.officialCode;
        if(row.locationStatus!=="PENDING_ROOM"&&!row.roomId){
          const r=resolveRoom(registry,row.AdRoomHall,b.value.id,{collegeId,sectionId});
          if(r.status==="CONFIRMED"&&r.value){row.roomId=r.value.id;row.AdRoomHall=r.value.canonicalCode;row.locationStatus="VERIFIED";}
        }
      }
    }
    const course = courseById.get(Number(row.AdCourseId));
    if (!course || course.AdCollegeId !== collegeId || course.AdSectionId !== sectionId) errors.push(`السطر ${index + 1}: المقرر غير صالح للقسم المحدد`);
    if (!instructorIds.has(Number(row.AdInstructorId))) errors.push(`السطر ${index + 1}: أستاذ المقرر غير صالح`);
    else if(options.requireDepartmentInstructor&&!departmentInstructorIds.has(Number(row.AdInstructorId)))errors.push(`السطر ${index + 1}: الأستاذ المطابق غير مثبت ضمن القسم الحالي؛ يلزم Review بدلاً من المطابقة على مستوى الجامعة`);
    if(options.requireDepartmentInstructor){
      const authoritySection=Number(String(row.SCode||""));
      if(!/^\d{3}$/.test(String(row.SCode||""))||authoritySection<501||authoritySection>999)errors.push(`السطر ${index + 1}: شعبة جدول PDF يجب أن تبدأ من 501 وتستمر 502، 503… لكل مقرر`);
    }else if (!/^\d{3,4}$/.test(String(row.SCode || ""))) errors.push(`السطر ${index + 1}: رقم الشعبة يجب أن يكون 3 أو 4 أرقام إنجليزية`);
    let location=locationPreflight(row,registry,{collegeId,sectionId});
    const locationBlocking=location.issues.filter(issue=>issue.severity==="high");
    if(locationBlocking.length&&locationBlocking.every(issue=>issue.type==="room_scope")&&location.canonical&&await hallBarterAllowsRoomUse({...row,...location.canonical},collegeId,sectionId)){
      location=locationPreflight(row,registry,{collegeId,sectionId,allowOutOfScopeRoom:true});
    }
    if(!location.ok) location.issues.filter(issue=>issue.severity==="high").forEach(issue=>errors.push(`السطر ${index + 1}: ${issue.message}`));
    else if(location.canonical) Object.assign(row,location.canonical);
    if (timeToMinutes(row.fendtime) <= timeToMinutes(row.fstarttime)) errors.push(`السطر ${index + 1}: وقت النهاية يجب أن يكون بعد البداية`);
    else if (!withinScheduleDay(timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime))) errors.push(`السطر ${index + 1}: وقت المحاضرة يجب أن يكون بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`);
    if (activeDays(row).length === 0) errors.push(`السطر ${index + 1}: لم يتم تحديد يوم للمحاضرة`);
    if (course) row.AdCourseName = course.CourseName;
  }
  if (checkConflicts && !errors.length && rows.length) {
    const external = currentSchedules.filter(item => !(item.AdCollegeId === collegeId && item.AdSectionId === sectionId));
    const universe = [...external, ...rows];
    const conflicts = findConflicts(rows as any, universe as any).filter((item:any) => item.severity === "high" || item.type === "duplicate");
    conflicts.slice(0, 20).forEach((item:any) => errors.push(item.message || item.detail || "يوجد تعارض يمنع الاعتماد"));
  }
  return [...new Set(errors)].slice(0, 30);
}


function mapSmartIssuesToRows(rows: any[], issues: string[], conflicts: any[] = []) {
  const byId: Record<string, string[]> = {};
  const add = (id: number, reason: string) => {
    if (!rows.some(row => Number(row.id) === Number(id))) return;
    const key = String(Number(id));
    const clean = String(reason || "يحتاج مراجعة").trim();
    byId[key] = [...new Set([...(byId[key] || []), clean])].slice(0, 4);
  };
  issues.forEach(issue => {
    const match = String(issue).match(/السطر\s+(\d+)/);
    if (!match) return;
    const row = rows[Number(match[1]) - 1];
    if (row) add(Number(row.id), String(issue).replace(/^السطر\s+\d+\s*:\s*/, ""));
  });
  conflicts.forEach((item: any) => {
    const reason = [item?.message, item?.detail].filter(Boolean).join(" — ") || "يوجد تعارض يمنع النشر";
    add(Number(item?.rowId), reason);
    add(Number(item?.otherId), reason);
  });
  return byId;
}

function smartContextFrom(req: AuthenticatedRequest) {
  /* Binary imports carry a Buffer in `req.body`, so their scope necessarily
     travels in the query string. Merge both channels instead of making every
     non-GET request ignore its query parameters. JSON body values still win. */
  const body = req.body && !Buffer.isBuffer(req.body) && typeof req.body === "object" ? req.body : {};
  const source: any = { ...(req.query || {}), ...(body || {}) };
  return { collegeId: Number(source.collegeId || source.AdCollegeId || 0), sectionId: Number(source.sectionId || source.AdSectionId || 0), termId: Number(source.termId || source.AdTermId || 0) };
}


async function resolveSmartContext(req: AuthenticatedRequest) {
  const requested = smartContextFrom(req);
  const [terms, sections] = await Promise.all([Repository.getTerms(), Repository.getSections()]);
  const termId = requested.termId || Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
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

/**
 * ── نَفَس بين تحليل وتحليل ──────────────────────────────────────────────────
 *
 * The readings below are pure CPU over the whole term of the university, and
 * Node runs them on the one thread it has. Measured on production: while a
 * single `/api/intelligence/living` computed, `/api/health` — which reads
 * nothing at all — took 6387ms to answer, against 194ms on the same server a
 * moment earlier. The server was not slow. It was unable to speak.
 *
 * That is not one reader waiting for their own analysis; it is every other
 * person using the system frozen for as long as it runs.
 *
 * Yielding between the readings hands the loop back so queued requests are
 * served in the gaps. It makes nothing faster — the same work is done in the
 * same order and the answers are identical — but the freeze becomes the length
 * of the longest single reading instead of the sum of all of them, and a health
 * check, a presence ping or somebody else's schedule can land in between.
 */
const breathe = () => new Promise<void>(resolve => setImmediate(resolve));

async function scopedScheduleUniverse(collegeId: number, sectionId: number, termId: number) {
  const [rows, universe] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId })
  ]);
  return { rows, universe };
}


// Client-facing scope labels: authorization still uses the numeric assignments,
 // while the shell can show the real department/college name instead of a generic role.
async function clientScopeDetails(scopes: any[]) {
  if (!Array.isArray(scopes) || !scopes.length) return [];
  const [sections, colleges] = await Promise.all([
    Repository.getSections().catch(() => []),
    Repository.getColleges().catch(() => []),
  ]);
  const sectionById = new Map<number, string>(
    sections.map((row: any) => [Number(row.AdSectionId), String(row.AdSectionName || "")] as [number, string]),
  );
  const collegeById = new Map<number, string>(
    colleges.map((row: any) => [Number(row.AdCollegeId), String(row.AdCollegeName || "")] as [number, string]),
  );
  return scopes.map((scope: any) => ({
    ...scope,
    AdSectionName: sectionById.get(Number(scope.AdSectionId)) || "",
    AdCollegeName: collegeById.get(Number(scope.AdCollegeId)) || "",
  }));
}

// --- AUTH API ---

app.post("/api/auth/demo", rateLimitLogin, async (_req: Request, res: Response) => {
  if (process.env.SCHEDULE_DEMO_ENABLED === "false") {
    res.status(404).json({ error: "الدخول التجريبي غير مفعّل." });
    return;
  }
  const sessionId = `demo_${randomBytes(32).toString("hex")}`;
  Repository.createDemoSandbox(sessionId, DEMO_SESSION_TTL_MS);
  try {
    const payload = await Repository.withDemoSandbox(sessionId, async () => {
      await Repository.createSession(sessionId, ROOT_ADMIN_USER_ID, DEMO_SESSION_TTL_MS);
      const user = await Repository.getUserById(ROOT_ADMIN_USER_ID);
      if (!user) throw new Error("تعذر إنشاء هوية Demo");
      const permissions = (await Repository.getSecurityByUser(user.SystemUserId)).map(row => row.FormNameId);
      const scopes = await clientScopeDetails(await Repository.getUserAssigns(user.SystemUserId));
      return { user: { ...safeSystemUser(user), IsRootAdmin: true, IsDemo: true }, permissions, scopes, data: "demo", demo: { expiresInMs: DEMO_SESSION_TTL_MS, adminReadOnly: true } };
    });
    res.setHeader("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    res.json(payload);
  } catch (error) {
    await Repository.withDemoSandbox(sessionId, () => Repository.deleteSession(sessionId)).catch(() => undefined);
    res.status(500).json({ error: error instanceof Error ? error.message : "تعذر بدء البيئة التجريبية" });
  }
});

app.post("/api/auth/login", rateLimitLogin, async (req: Request, res: Response) => {
  if (Repository.isDemoMode()) {
    res.status(403).json({ error: "هذه خدمة Demo معزولة. استخدم زر «دخول فوري للتجربة»." });
    return;
  }
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
  const scopes = await clientScopeDetails(await Repository.getUserAssigns(user.SystemUserId));

  res.json({ user: { ...safeUser, IsRootAdmin: Number(user.SystemUserId) === ROOT_ADMIN_USER_ID, IsDemo: false }, permissions, scopes, data: activeDataMode() });
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
  const scopes = await clientScopeDetails(req.scopes || []);
  // The interface says out loud when it is not on the university's database.
  res.json({ user: { ...safeUser, IsRootAdmin: Number(req.user.SystemUserId) === ROOT_ADMIN_USER_ID, IsDemo: Repository.isDemoRequest() }, permissions, scopes, data: Repository.isDemoRequest() ? "demo" : activeDataMode(), demo: Repository.isDemoRequest() ? { expiresInMs: DEMO_SESSION_TTL_MS, adminReadOnly: true } : undefined });
});

// Activity heartbeat: the server session still expires after 15 minutes of real
// inactivity, while active users can keep the session alive without a fixed
// browser-cookie deadline logging them out mid-work.
app.post("/api/auth/heartbeat", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const ttlMs = Repository.isDemoRequest() ? DEMO_SESSION_TTL_MS : SERVER_IDLE_SESSION_MS;
  const sessionId = getCookies(req)["session_id"];
  if (sessionId && Repository.isDemoRequest()) await Repository.refreshSession(sessionId, ttlMs);
  res.json({ ok: true, idleTimeoutMs: ttlMs, demo: Repository.isDemoRequest() });
});

app.post("/api/demo/reset", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!Repository.isDemoRequest()) { res.status(404).json({ error: "هذه العملية متاحة للبيئة التجريبية فقط" }); return; }
  const sessionId = getCookies(req)["session_id"];
  if (!sessionId || !Repository.resetDemoSandbox(sessionId, DEMO_SESSION_TTL_MS)) { res.status(401).json({ error: "انتهت الجلسة التجريبية" }); return; }
  forgetAuthSession(sessionId);
  await Repository.refreshSession(sessionId, DEMO_SESSION_TTL_MS);
  res.json({ success: true });
});

/**
 * ── أين أنا الآن ────────────────────────────────────────────────────────────
 *
 * The upward half of the live channel. The stream carries news down; this one
 * small POST carries a person's own position up, and the two together make a
 * board where colleagues can see each other.
 *
 * It lives under /api/auth/ deliberately, twice over: the service worker leaves
 * that prefix alone, so a presence beat can never be answered by a fabricated
 * offline response; and the audit middleware skips it, so watching a colleague
 * move a pointer does not write an audit row per second.
 *
 * It returns 204 and writes nothing anywhere. A beat that arrives after its own
 * stream has closed is not an error — it is a browser tab that shut a moment
 * before its last message landed.
 */
const PRESENCE_DAYS = new Set(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"]);
const cleanMarkPart = (value: unknown) => {
  const row = Number((value as { rowId?: unknown })?.rowId || 0);
  if (!Number.isInteger(row) || row <= 0) return null;
  return { rowId: row, rev: Number((value as { rev?: unknown })?.rev || 0) };
};

app.post("/api/auth/presence", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const conn = String(body.conn || "").slice(0, 64);
  const userId = Number(req.user?.SystemUserId || 0);
  let record: ScheduleEventClient | undefined;
  for (const client of scheduleEventClients.values())
    // A session may address only its own stream. Without the userId check, one
    // account could plant a colleague's name on a cell it never touched.
    if (client.connId === conn && client.userId === userId) { record = client; break; }
  if (!record) { res.status(204).end(); return; }

  record.seenAt = Date.now();
  const previousScope = record.scopeKey;

  const scope = (body.scope || {}) as Record<string, unknown>;
  const collegeId = Number(scope.collegeId || 0);
  const sectionId = Number(scope.sectionId || 0);
  const termId = Number(scope.termId || 0);
  if (collegeId && isScopeAllowed(req, collegeId, sectionId)) {
    record.collegeId = collegeId; record.sectionId = sectionId;
    record.scopeKey = `${collegeId}:${sectionId}:${termId}`;
  }

  if (body.gone) {
    Object.assign(record, emptyMark());
    record.markAt = 0;
  } else {
    const cell = (body.cell || null) as { day?: unknown; start?: unknown; room?: unknown } | null;
    const day = String(cell?.day || "");
    const start = String(cell?.start || "");
    record.cell = cell && PRESENCE_DAYS.has(day) && /^\d{1,2}:\d{2}$/.test(start)
      ? { day, start, ...(cell.room ? { room: String(cell.room).slice(0, 32) } : {}) }
      : null;
    record.holding = cleanMarkPart(body.holding);
    record.editing = cleanMarkPart(body.editing);
    record.markAt = record.seenAt;
  }

  if (previousScope && previousScope !== record.scopeKey) markPresenceDirty(previousScope);
  markPresenceDirty(record.scopeKey);
  res.status(204).end();
});

app.get("/api/dashboard", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  // Legacy Home/Index parity is intentionally preserved here, including the historical
  // Sunday/weekend day-name quirk and the difference between the displayed total and table rows.
  const terms = await Repository.getTerms();
  const latestTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
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
  let dayName = weekday === 0 ? "الأحد" : weekday === 5 ? "الجمعة" : weekday === 6 ? "السبت" : "";
  if (weekday === 1) { dayKey = "fmonday"; dayName = "الاثنين"; }
  if (weekday === 2) { dayKey = "ftuesday"; dayName = "الثلاثاء"; }
  if (weekday === 3) { dayKey = "fwednesday"; dayName = "الأربعاء"; }
  if (weekday === 4) { dayKey = "fthursday"; dayName = "الخميس"; }

  // Friday and Saturday are institutional holidays. Do not quietly substitute
  // Sunday's lectures into the dashboard; the holiday state must be literal.
  const daySchedules = weekend
    ? []
    : latestTermSchedules
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
  const roomKey = (row: FSchedule) => verifiedRoomKey(row);
  const roomLabel = (row: FSchedule) => [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join(" / ");
  const uniqueRooms = Array.from(new Set(workspaceRows.map(roomKey).filter(Boolean)));
  const minute = (value: string) => { const [h,m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const slotRooms = new Map<string, Set<string>>();
  const hourLoad = new Map<string, number>();
  const roomLoad = new Map<string, number>();
  for (const row of workspaceRows) {
    const start = minute(row.fstarttime), end = minute(row.fendtime);
    const hour = String(row.fstarttime || "").slice(0,2) || "--";
    hourLoad.set(hour, (hourLoad.get(hour) || 0) + 1);
    const rKey = roomKey(row);
    if (rKey) roomLoad.set(rKey, (roomLoad.get(rKey) || 0) + 1);
    for (const [key] of dayDefs) if (row[key]) {
      for (let slot = Math.floor(start / 30); slot < Math.ceil(end / 30); slot++) {
        const bucket = `${key}:${slot}`;
        if (!rKey) continue;
        if (!slotRooms.has(bucket)) slotRooms.set(bucket, new Set());
        slotRooms.get(bucket)!.add(rKey);
      }
    }
  }
  const peakOccupiedRooms = Math.max(0, ...Array.from(slotRooms.values()).map(set => set.size));
  const roomOccupancyPeak = uniqueRooms.length ? Math.round((peakOccupiedRooms / uniqueRooms.length) * 100) : 0;
  const weekdayLoad = dayDefs.map(([key,label]) => ({ key, label, count: workspaceRows.filter(row => Boolean(row[key])).length }));
  const busiestHours = Array.from(hourLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([hour,count])=>({ hour: `${hour}:00`, count }));
  const roomLabelById = new Map(workspaceRows.map(row => [roomKey(row), roomLabel(row)] as const).filter(([key]) => Boolean(key)));
  const busiestRooms = Array.from(roomLoad.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([roomId,count])=>({ room: roomLabelById.get(roomId) || roomId, roomId, count }));
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
      rooms: new Set(scoped.map(roomKey).filter(Boolean)).size,
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

/**
 * ── What SCHEDULE has become ──────────────────────────────────────────────
 *
 * Every number here is counted from the database at the moment it is asked for.
 * None of them is written down anywhere: add a term and the term count is one
 * higher on the next request, without a line of code changing. That property is
 * the whole point of the screen it feeds — a system claiming a decade of memory
 * cannot have its memory typed in by hand.
 *
 * The counts reuse exactly what /api/dashboard already reads, so the two can
 * never disagree about how many terms exist or which one is current. The
 * lifetime row count comes from `countSchedules()`, which is a server-side
 * count — the aggregate never pulls fifteen thousand rows into memory to
 * measure them.
 *
 * The reading is honest about scope: an administrator is shown the institution,
 * and a department coordinator is shown the same shape narrowed to what they
 * are allowed to see, with `scoped: true` saying which of the two it is.
 */
app.get("/api/journey", async (req: AuthenticatedRequest, res: Response) => {
  const terms = await Repository.getTerms();
  const currentTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  const currentTerm = terms.find(term => Number(term.AdTermId) === currentTermId) || null;
  const [courses, instructors, sections, colleges, lifetimeRows, termRows] = await Promise.all([
    Repository.getCourses(),
    Repository.getInstructors(),
    Repository.getSections(),
    Repository.getColleges(),
    Repository.countSchedules(),
    Repository.getSchedulesByScope({ termId: currentTermId }),
  ]);
  /* Journey is the one intentionally public-facing institutional reading in
     SCHEDULE. It contains aggregate counts only — never names, civil IDs or
     personal records — so the same truthful marketing numbers are shown before
     login, to a normal user, to an administrator and inside Demo. */
  const visibleTermRows = termRows;

  /* Unique, not summed: the same course taught in ten terms is one course that
     the system has carried, and the label above the number says exactly that. */
  const unique = (values: Array<number | string>) => new Set(values.filter(Boolean)).size;

  res.json({
    scoped: false,
    lifetime: {
      terms: terms.length,
      schedules: lifetimeRows,
      courses: courses.length,
      instructors: instructors.length,
      sections: sections.length,
      colleges: colleges.length,
    },
    current: {
      termId: currentTermId || null,
      termName: currentTerm?.AdTermName || null,
      schedules: visibleTermRows.length,
      courses: unique(visibleTermRows.map(row => row.AdCourseId)),
      instructors: unique(visibleTermRows.map(row => row.AdInstructorId)),
      rooms: unique(visibleTermRows.map(row => verifiedRoomKey(row))),
      sections: unique(visibleTermRows.map(row => row.AdSectionId)),
    },
  });
});

// One search entry point for the entire academic workspace. It respects the current user's
// academic scope and only returns entities related to schedules visible to that user.
app.get("/api/search", requireAnyPermission([7, 8, 9, 10, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || "").trim().toLocaleLowerCase("ar");
  if (q.length < 2) { res.json({ schedules: [], instructors: [], courses: [], rooms: [] }); return; }
  const terms = await Repository.getTerms();
  const latestTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
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
    subtitle: `${canInstructor || canSchedule || canAdvanced ? instructorById.get(row.AdInstructorId)?.AdInstructorName || "" : ""}${canRoom || canSchedule || canAdvanced ? ` — ${row.AdRoomCode}/${row.AdRoomHall}` : ""} — ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`,
    meta: `${courseById.get(row.AdCourseId)?.CourseCode || ""} / شعبة ${row.SCode}`
  })) : [];
  const instructorResults = (canInstructor || canSchedule || canAdvanced) ? sortArabicNamed(instructors.filter(item => visibleInstructorIds.has(item.AdInstructorId) && (matches(item.AdInstructorName) || matches(item.AdInstructorCivil))), item => item.AdInstructorName).slice(0, 8).map(item => ({ id: item.AdInstructorId, kind: "instructor", title: item.AdInstructorName, subtitle: item.AdInstructorCivil, meta: "أستاذ مقرر" })) : [];
  const courseResults = (canSchedule || canAdvanced) ? sortCoursesByName(courses.filter(item => visibleCourseIds.has(item.AdCourseId) && (matches(item.CourseName) || matches(item.CourseCode)))).slice(0, 8).map(item => ({ id: item.AdCourseId, kind: "course", title: item.CourseName, subtitle: item.CourseCode, meta: sectionById.get(item.AdSectionId)?.AdSectionName || "" })) : [];
  const roomMap = new Map<string, {building:string;hall:string;count:number;roomId:string;buildingId?:string}>();
  schedules.forEach(row => { const key=verifiedRoomKey(row); if(!key)return; const prev=roomMap.get(key); roomMap.set(key,{building:String(row.AdRoomCode||""),hall:String(row.AdRoomHall||""),roomId:String(row.roomId||""),buildingId:row.buildingId,count:(prev?.count||0)+1}); });
  const roomResults = (canRoom || canSchedule || canAdvanced) ? Array.from(roomMap.values()).filter(item => matches(item.building) || matches(item.hall)).slice(0, 8).map((item,index) => ({ id: item.roomId, kind: "room", title: `مبنى ${item.building} — قاعة ${item.hall}`, subtitle: `${item.count} موعد في الجداول`, meta: "قاعة رسمية", building:item.building, hall:item.hall, buildingId:item.buildingId, roomId:item.roomId })) : [];
  res.json({ schedules: scheduleResults, instructors: instructorResults, courses: courseResults, rooms: roomResults });
});

// --- COLLEGE API ---

app.get("/api/colleges", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const colleges = await Repository.getColleges();
  if (req.user.IsAdminUser) {
    res.json(sortArabicNamed(colleges, row => row.AdCollegeName));
    return;
  }
  // Filter colleges based on user sections scope
  const allowedCollegeIds = new Set(req.scopes?.map(s => s.AdCollegeId) || []);
  const filtered = colleges.filter(c => allowedCollegeIds.has(c.AdCollegeId));
  res.json(sortArabicNamed(filtered, row => row.AdCollegeName));
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
  /* This list is walked to fill in a travel-time matrix, so it is ordered the
     way a person looks a building up — by its number — not by how busy it is. */
  const buildings=[...usage.entries()].sort((a,b)=>byRoom(a[0],"",b[0],"")).map(([code,count])=>({code,count}));
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
  res.json(sortArabicNamed(sections, row => row.AdSectionName));
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
  res.json(sortTermsNewestServer(terms));
});

app.post("/api/terms", requirePermission(5), async (req: Request, res: Response) => {
  const { AdTermName } = req.body;
  if (!AdTermName) {
    res.status(400).json({ error: "اسم الفصل الدراسي مطلوب" });
    return;
  }
  const newTerm = await Repository.createTerm(AdTermName,
    { start: req.body.AdTermStart, weeks: Number(req.body.AdTermWeeks) || 0,
      closed: typeof req.body.AdTermClosed === "boolean" ? req.body.AdTermClosed : undefined });
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
    const updated = await Repository.updateTerm(id, AdTermName,
      { start: req.body.AdTermStart, weeks: Number(req.body.AdTermWeeks) || 0,
        closed: typeof req.body.AdTermClosed === "boolean" ? req.body.AdTermClosed : undefined });
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
  const query = String(req.query.q || "").trim();
  const limit = Math.max(1, Math.min(60, Number(req.query.limit || 40)));

  // If query is provided, search across the university instructors catalog
  if (query) {
    const fold = (value: string) => String(value || "")
      .replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/[^ء-ي0-9a-zA-Z ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const needle = fold(query);
    const allInstructors = await Repository.getInstructors();
    const filtered = allInstructors.filter(person => {
      const name = fold(person.AdInstructorName);
      return name.includes(needle) || String(person.AdInstructorCivil || "").includes(needle);
    });
    res.json(sortArabicNamed(filtered, row => row.AdInstructorName).slice(0, limit));
    return;
  }

  if (sectionId) {
    const canReadSection = Boolean(req.user?.IsAdminUser || req.scopes?.some(scope => scope.AdSectionId === sectionId));
    if (!canReadSection) { res.status(403).json({ error: "القسم خارج نطاق صلاحيتك" }); return; }
    const termScoped = termId ? await Repository.getInstructorsByScope(sectionId, termId) : [];
    const allDeptHistorical = await Repository.getInstructorsByScope(sectionId, 0);
    // «يدرّس هذا الفصل» must make a delegate selectable before their first row
    // exists. Merge the term roster into the ordinary scoped staff list.
    const rosterIds = collegeId && termId ? await Repository.getVisitingRoster(collegeId, sectionId, termId) : [];
    const rosterPeople = rosterIds.length
      ? (await Repository.getInstructors()).filter(person => rosterIds.includes(Number(person.AdInstructorId)))
      : [];
    const merged = [...new Map([...allDeptHistorical, ...termScoped, ...rosterPeople].map(person => [Number(person.AdInstructorId), person])).values()];
    res.json(sortArabicNamed(merged, row => row.AdInstructorName));
    return;
  }

  // A wider lookup
  if (collegeId && !req.user?.IsAdminUser && !req.scopes?.some(scope => scope.AdCollegeId === collegeId)) {
    res.status(403).json({ error: "الكلية خارج نطاق صلاحيتك" });
    return;
  }
  const instructors = collegeId
    ? await Repository.getInstructorsByScheduleScope({ collegeId, termId })
    : await Repository.getInstructors();
  res.json(sortArabicNamed(instructors, row => row.AdInstructorName));
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

const courseNameCollator = new Intl.Collator("ar", { numeric: true, sensitivity: "base", ignorePunctuation: true });
const sortCoursesByName = <T extends { CourseName?: unknown }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => courseNameCollator.compare(String(a.CourseName || "").trim(), String(b.CourseName || "").trim()));

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
  res.json(sortCoursesByName(courses));
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
  const registry=await readLocationRegistry();
  const building=resolveBuilding(registry,roomCode,{collegeId,sectionId});
  if(building.status!=="CONFIRMED"||!building.value)return null;
  const room=resolveRoom(registry,roomHall,building.value.id,{collegeId});
  if(room.status!=="CONFIRMED"||!room.value)return null;
  if(room.value.shared||room.value.sectionIds.length===0||room.value.sectionIds.includes(sectionId))return null;
  const ownerSectionId=Number(room.value.primarySectionIds?.[0]||room.value.sectionIds[0]||0);
  if(!ownerSectionId)return null;
  const [section,college]=await Promise.all([Repository.getSectionById(ownerSectionId),Repository.getCollegeById(Number(room.value.collegeIds?.[0]||collegeId))]);
  return{
    room:building.value.officialCode,hall:room.value.canonicalCode,roomId:room.value.id,
    section:section?.AdSectionName||"",college:college?.AdCollegeName||"",
    owner:[section?.AdSectionName,college?.AdCollegeName].filter(Boolean).join(" — ")||"قسم آخر",
    samples:Number(room.value.historicalUsageCount||0),ownerSamples:Number(room.value.historicalUsageCount||0),share:100
  };
}

async function roomScopeNotice(row:any){
  const owner=await roomOwnership(row?.AdRoomCode,row?.AdRoomHall,Number(row?.AdCollegeId||0),Number(row?.AdSectionId||0));
  if(!owner)return null;
  return{type:"roomScope",severity:"warning",rowId:0,message:`تنبيه نطاق القاعة: ${owner.room}/${owner.hall} مرتبطة تاريخياً بـ ${owner.owner}`,detail:`القاعة مصنفة في السجل الرسمي لقسم آخر. استخدامها يتطلب نافذة استعارة معتمدة؛ وسيمنع الخادم الحفظ خارج اليوم والوقت المعتمدين.`};
}

/**
 * ── استعارة القاعات الساكنة بين الأقسام ──────────────────────────────────────
 *
 * No room is declared "owned" in the legacy schema. Ownership is therefore a
 * reading of ten years of behaviour: the section that used a room most often,
 * with a clear majority, is treated as its historical steward. A free window
 * is offered only when it has repeatedly stayed free across terms AND is free
 * right now. Approval creates a digital reservation, never a fake lecture.
 */
const HALL_BARTER_MIN_HISTORY_TERMS = 3;
const HALL_BARTER_MIN_FREE_SHARE = 0.72;
const HALL_BARTER_MAX_OPPORTUNITIES = 30;
const HALL_BARTER_DAY_LABEL = new Map(SCHEDULE_DAY_KEYS.map((key,index)=>[key,DAY_LABELS[index]]));
type HallCampusGender = "male" | "female" | null;
function hallCampusGender(name: unknown): HallCampusGender {
  const value=String(name||"").trim().toLocaleLowerCase("ar");
  if(!value)return null;
  if(/بنات|إناث|اناث|طالبات|girls?|women|female/.test(value))return "female";
  if(/بنين|ذكور|طلاب|boys?|men|male/.test(value))return "male";
  return null;
}
function sameHallCampusGender(a: unknown,b: unknown){
  const left=hallCampusGender(a),right=hallCampusGender(b);
  // The university operates fully segregated male/female campuses. If a legacy
  // college name does not identify its campus, the barter market fails closed:
  // no cross-college borrowing is safer than guessing the wrong campus.
  return Boolean(left&&right&&left===right);
}
let hallBarterSerial = 0;
const hallBarterBoardCache = new Map<string,{ scheduleSerial:number; barterSerial:number; expiresAt:number; body:any }>();

function academicStartYear(name: unknown): number | null {
  const match=String(name||"").match(/(?:19|20)\d{2}/);
  return match?Number(match[0]):null;
}
function recentTenYearTermIds(terms:any[]): Set<number> {
  const withYear=terms.map(term=>({id:Number(term.AdTermId||0),year:academicStartYear(term.AdTermName)})).filter(item=>item.id);
  const years=withYear.map(item=>item.year).filter((year):year is number=>Number.isFinite(year));
  if(years.length){
    const newest=Math.max(...years),cutoff=newest-9;
    return new Set(withYear.filter(item=>item.year!=null&&item.year>=cutoff).map(item=>item.id));
  }
  return new Set([...withYear].sort((a,b)=>b.id-a.id).slice(0,30).map(item=>item.id));
}
function dominantHistoricalHallOwner(history:FSchedule[]){
  const counts=new Map<string,{collegeId:number;sectionId:number;count:number}>();
  for(const row of history){
    const collegeId=Number(row.AdCollegeId||0),sectionId=Number(row.AdSectionId||0);
    if(!collegeId||!sectionId)continue;
    const key=`${collegeId}:${sectionId}`,current=counts.get(key)||{collegeId,sectionId,count:0};
    current.count++;counts.set(key,current);
  }
  const ranked=[...counts.values()].sort((a,b)=>b.count-a.count);
  const top=ranked[0],total=history.length;
  if(!top||top.count<3||!total||top.count/total<0.55)return null;
  return{...top,share:Math.round(top.count/total*100),total};
}
function rowOccupiesWindow(row:any,day:string,start:string,end:string){
  return Boolean(row?.[day])&&scheduleOverlap(String(row.fstarttime||""),String(row.fendtime||""),start,end);
}
function barterRequestRoomKey(request:Partial<HallBarterRequest>){return request.roomId?`id:${request.roomId}`:`legacy:${String(request.roomCode||"").trim().toLocaleLowerCase()}|${String(request.roomHall||"").trim().toLocaleLowerCase()}`;}
function barterRequestMatchesRow(request:Partial<HallBarterRequest>,row:Partial<FSchedule>){const rowKey=roomIdentityKey(row);return Boolean(rowKey)&&barterRequestRoomKey(request)===rowKey;}
function barterRequestOverlaps(request:HallBarterRequest,roomCode:string,roomHall:string,day:string,start:string,end:string,roomId?:string){
  const target=roomId?`id:${roomId}`:`legacy:${roomCode.trim().toLocaleLowerCase()}|${roomHall.trim().toLocaleLowerCase()}`;
  return request.status==="approved"&&barterRequestRoomKey(request)===target&&request.day===day&&scheduleOverlap(request.startTime,request.endTime,start,end);
}
async function hallBarterAllowsRoomUse(row:Partial<FSchedule>,collegeId:number,sectionId:number){
  const termId=Number(row.AdTermId||0),roomId=String(row.roomId||"");
  const start=String(row.fstarttime||""),end=String(row.fendtime||"");
  const days=SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day]));
  if(!termId||!roomId||!start||!end||!days.length)return false;
  const requests=await Repository.getHallBarterRequests(termId);
  const mine=requests.filter(request=>request.status==="approved"&&String(request.roomId||"")===roomId&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId);
  return days.every(day=>mine.some(request=>request.day===day&&timeToMinutes(start)>=timeToMinutes(request.startTime)&&timeToMinutes(end)<=timeToMinutes(request.endTime)));
}
function hallBarterRequestShape(request:HallBarterRequest,sections:any[],colleges:any[]){
  const requesterSection=sections.find(section=>Number(section.AdSectionId)===Number(request.requesterSectionId));
  const ownerSection=sections.find(section=>Number(section.AdSectionId)===Number(request.ownerSectionId));
  const requesterCollege=colleges.find(college=>Number(college.AdCollegeId)===Number(request.requesterCollegeId));
  const ownerCollege=colleges.find(college=>Number(college.AdCollegeId)===Number(request.ownerCollegeId));
  return{
    ...request,
    dayLabel:HALL_BARTER_DAY_LABEL.get(request.day)||request.day,
    requesterSectionName:requesterSection?.AdSectionName||"قسم طالب",
    requesterCollegeName:requesterCollege?.AdCollegeName||"كلية طالبة",
    ownerSectionName:ownerSection?.AdSectionName||"القسم المضيف",
    ownerCollegeName:ownerCollege?.AdCollegeName||"الكلية المضيفة",
  };
}

async function buildHallBarterBoard(req:AuthenticatedRequest,collegeId:number,sectionId:number,termId:number){
  const cacheKey=`${collegeId}:${sectionId}:${termId}`;
  const cached=hallBarterBoardCache.get(cacheKey);
  if(cached&&cached.scheduleSerial===driftSerial&&cached.barterSerial===hallBarterSerial&&cached.expiresAt>Date.now())return cached.body;
  const [allSchedulesRaw,termRowsRaw,terms,sections,colleges,requests,registry]=await Promise.all([
    Repository.getSchedules(),
    Repository.getSchedulesByScope({termId}),
    Repository.getTerms(),Repository.getSections(),Repository.getColleges(),Repository.getHallBarterRequests(termId),readLocationRegistry(),
  ]);
  const canonicalForBarter=(row:FSchedule):FSchedule=>{
    if(row.buildingId&&row.roomId)return row;
    const b=resolveBuilding(registry,row.AdRoomCode,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
    if(b.status!=="CONFIRMED"||!b.value)return row;
    const r=resolveRoom(registry,row.AdRoomHall,b.value.id,{collegeId:Number(row.AdCollegeId||0),sectionId:Number(row.AdSectionId||0)});
    if(r.status!=="CONFIRMED"||!r.value)return {...row,buildingId:b.value.id,AdRoomCode:b.value.officialCode};
    return {...row,buildingId:b.value.id,roomId:r.value.id,AdRoomCode:b.value.officialCode,AdRoomHall:r.value.canonicalCode,locationStatus:"VERIFIED"};
  };
  const allSchedules=allSchedulesRaw.map(canonicalForBarter),termRows=termRowsRaw.map(canonicalForBarter);
  const requesterCollege=colleges.find(college=>Number(college.AdCollegeId)===collegeId);
  const requesterGender=hallCampusGender(requesterCollege?.AdCollegeName);
  const recentIds=recentTenYearTermIds(terms);
  // The target term is checked separately as “free now”; counting it as history
  // would make an unfinished current timetable look artificially stable.
  const history=allSchedules.filter(row=>recentIds.has(Number(row.AdTermId||0))&&Number(row.AdTermId)!==termId);
  const mineCurrent=termRows.filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId);
  const mineHistory=history.filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId);
  const preferredBuildings=new Set((mineCurrent.length?mineCurrent:mineHistory)
    .map(row=>String(row.buildingId||"").trim()).filter(Boolean));
  const roomGroups=new Map<string,FSchedule[]>();
  for(const row of history){
    const building=String(row.buildingId||"").trim(),hall=String(row.roomId||"").trim();
    if(!building||!hall||!preferredBuildings.has(building))continue;
    const key=roomIdentityKey(row);if(!key)continue;
    const group=roomGroups.get(key);if(group)group.push(row);else roomGroups.set(key,[row]);
  }
  const activeReservations=requests.filter(request=>request.status==="approved");
  const opportunities:any[]=[];
  for(const roomHistory of roomGroups.values()){
    const owner=dominantHistoricalHallOwner(roomHistory);if(!owner||(owner.collegeId===collegeId&&owner.sectionId===sectionId))continue;
    const ownerSection=sections.find(section=>Number(section.AdSectionId)===owner.sectionId);
    const ownerCollege=colleges.find(college=>Number(college.AdCollegeId)===owner.collegeId);
    if(!ownerSection||!ownerCollege)continue;
    if(!requesterGender||hallCampusGender(ownerCollege.AdCollegeName)!==requesterGender)continue;
    const roomCode=String(roomHistory[0].AdRoomCode||"").trim(),roomHall=String(roomHistory[0].AdRoomHall||"").trim(),roomId=roomHistory[0].roomId,buildingId=roomHistory[0].buildingId;
    const roomTerms=[...new Set(roomHistory.map(row=>Number(row.AdTermId||0)).filter(Boolean))];
    if(roomTerms.length<HALL_BARTER_MIN_HISTORY_TERMS)continue;
    for(const day of SCHEDULE_DAY_KEYS){
      let runStart:number|null=null,runEnd=0,runConfidence=100;
      const flush=()=>{
        if(runStart==null)return;
        const duration=runEnd-runStart;
        if(duration>=SCHEDULE_SLOT_MINUTES){
          const start=minutesToTime(runStart),end=minutesToTime(runEnd);
          const pendingSame=requests.some(request=>request.status==="pending"&&request.requesterCollegeId===collegeId&&request.requesterSectionId===sectionId&&
            barterRequestRoomKey(request)===(roomId?`id:${roomId}`:`legacy:${roomCode.toLocaleLowerCase()}|${roomHall.toLocaleLowerCase()}`)&&
            request.day===day&&scheduleOverlap(request.startTime,request.endTime,start,end));
          if(!pendingSame){
            const rawId=`${roomCode}|${roomHall}|${day}|${start}|${end}|${owner.sectionId}`;
            opportunities.push({
              id:Buffer.from(rawId,"utf8").toString("base64url"),buildingId,roomId,roomCode,roomHall,building:roomCode,
              day,dayLabel:HALL_BARTER_DAY_LABEL.get(day)||day,startTime:start,endTime:end,durationMinutes:duration,
              confidence:runConfidence,historyTerms:roomTerms.length,ownerShare:owner.share,
              ownerCollegeId:owner.collegeId,ownerSectionId:owner.sectionId,
              ownerCollegeName:ownerCollege.AdCollegeName,ownerSectionName:ownerSection.AdSectionName,
            });
          }
        }
        runStart=null;runEnd=0;runConfidence=100;
      };
      for(let minute=SCHEDULE_DAY_START;minute<SCHEDULE_DAY_END;minute+=SCHEDULE_SLOT_MINUTES){
        const start=minutesToTime(minute),end=minutesToTime(Math.min(SCHEDULE_DAY_END,minute+SCHEDULE_SLOT_MINUTES));
        const freeTerms=roomTerms.filter(historyTerm=>!roomHistory.some(row=>Number(row.AdTermId)===historyTerm&&rowOccupiesWindow(row,day,start,end))).length;
        const freeShare=freeTerms/roomTerms.length;
        const freeNow=!termRows.some(row=>barterRequestMatchesRow({roomId,roomCode,roomHall},row)&&rowOccupiesWindow(row,day,start,end))&&!activeReservations.some(request=>barterRequestOverlaps(request,roomCode,roomHall,day,start,end,roomId));
        if(freeShare>=HALL_BARTER_MIN_FREE_SHARE&&freeNow){
          if(runStart==null)runStart=minute;
          runEnd=Math.min(SCHEDULE_DAY_END,minute+SCHEDULE_SLOT_MINUTES);
          runConfidence=Math.min(runConfidence,Math.round(freeShare*100));
        }else flush();
      }
      flush();
    }
  }
  opportunities.sort((a,b)=>b.confidence-a.confidence||b.durationMinutes-a.durationMinutes||byRoom(a.roomCode,a.roomHall,b.roomCode,b.roomHall));
  const shaped=requests.map(request=>hallBarterRequestShape(request,sections,colleges));
  const sameCampusRequests=shaped.filter(request=>sameHallCampusGender(request.requesterCollegeName,request.ownerCollegeName));
  const body={
    opportunities:opportunities.slice(0,HALL_BARTER_MAX_OPPORTUNITIES),
    incoming:sameCampusRequests.filter(request=>request.ownerCollegeId===collegeId&&request.ownerSectionId===sectionId),
    outgoing:sameCampusRequests.filter(request=>request.requesterCollegeId===collegeId&&request.requesterSectionId===sectionId),
    memory:{terms:new Set(history.map(row=>Number(row.AdTermId||0)).filter(Boolean)).size,years:10,buildings:[...preferredBuildings].map(id=>registry.buildings.find(b=>b.id===id)?.officialCode||id)},
  };
  hallBarterBoardCache.set(cacheKey,{scheduleSerial:driftSerial,barterSerial:hallBarterSerial,expiresAt:Date.now()+2*60*1000,body});
  if(hallBarterBoardCache.size>120)hallBarterBoardCache.clear();
  return body;
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
function roomIsFreeForRow(room:{code:string;hall:string;buildingId?:string;roomId?:string},target:any,termRows:any[],ignoreIds:Set<number>){
  return termRows.every((other:any)=>{
    if(ignoreIds.has(Number(other.id)))return true;
    const sameRoom=room.roomId&&other.roomId?String(room.roomId)===String(other.roomId):normalizedBuilding(other.AdRoomCode).toLocaleLowerCase()===normalizedBuilding(room.code).toLocaleLowerCase()&&String(other.AdRoomHall||"").trim().toLocaleLowerCase()===String(room.hall||"").trim().toLocaleLowerCase();
    if(!sameRoom)return true;
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
  const roomMap=new Map<string,{code:string;hall:string;buildingId:string;roomId:string;count:number}>();
  termRows.forEach((r:any)=>{const code=normalizedBuilding(r.AdRoomCode),hall=String(r.AdRoomHall||"").trim(),buildingId=String(r.buildingId||""),roomId=String(r.roomId||"");if(!code||!hall||!buildingId||!roomId||r.locationStatus==="PENDING_ROOM")return;const key=`id:${roomId}`,v=roomMap.get(key)||{code,hall,buildingId,roomId,count:0};v.count++;roomMap.set(key,v);});
  const rooms=[...roomMap.values()].sort((a,b)=>b.count-a.count);
  const proposals:any[]=[];
  for(const risk of radar.risks.filter((r:any)=>r.level==="high").slice(0,12)){
    const target=termRows.find((r:any)=>Number(r.id)===Number(risk.toRowId));if(!target)continue;
    const desired=risk.fromBuilding;
    const candidates=rooms.filter(room=>room.code.toLocaleLowerCase()===desired.toLocaleLowerCase()&&roomIsFreeForRow(room,target,termRows,new Set([Number(target.id)])));
    const best=candidates[0];
    if(best){
      const changes=[{id:target.id,buildingId:best.buildingId,roomId:best.roomId,AdRoomCode:best.code,AdRoomHall:best.hall,locationStatus:"VERIFIED"}],verified=verifyChanges(changes);
      if(verified.safe)proposals.push({kind:"free-room",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:`تقريب القاعة إلى مبنى ${best.code}`,reason:`يحوّل الانتقال من ${risk.fromBuilding} → ${risk.toBuilding} إلى نفس المبنى قبل المحاضرة التالية، بعد فحص أثره على حركة جميع الأساتذة في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:best.code,roomHall:best.hall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,best.code)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});
      if(verified.safe)continue;
    }
    const swap=termRows.find((other:any)=>Number(other.id)!==Number(target.id)&&target.roomId&&target.buildingId&&other.roomId&&other.buildingId&&normalizedBuilding(other.AdRoomCode).toLocaleLowerCase()===desired.toLocaleLowerCase()&&["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>rowsOverlapOnDay(target,other,day))&&roomIsFreeForRow({code:other.AdRoomCode,hall:other.AdRoomHall,buildingId:other.buildingId,roomId:other.roomId},target,termRows,new Set([Number(target.id),Number(other.id)]))&&roomIsFreeForRow({code:target.AdRoomCode,hall:target.AdRoomHall,buildingId:target.buildingId,roomId:target.roomId},other,termRows,new Set([Number(target.id),Number(other.id)])));
    if(swap){const changes=[{id:target.id,buildingId:swap.buildingId,roomId:swap.roomId,AdRoomCode:swap.AdRoomCode,AdRoomHall:swap.AdRoomHall,locationStatus:"VERIFIED"},{id:swap.id,buildingId:target.buildingId,roomId:target.roomId,AdRoomCode:target.AdRoomCode,AdRoomHall:target.AdRoomHall,locationStatus:"VERIFIED"}],verified=verifyChanges(changes);if(verified.safe)proposals.push({kind:"swap",instructorId:risk.instructorId,instructorName:risk.instructorName,rowId:target.id,title:"تبديل القاعات · تبديل آمن للقاعتين",reason:`تبديل القاعتين يقلل عبور ${risk.instructorName} بين المباني من دون تغيير الوقت أو الأستاذ أو أيام المحاضرة، ولا يُعرض إلا إذا لم يزد خطر الحركة على أي أستاذ آخر في الفصل.`,before:{roomCode:target.AdRoomCode,roomHall:target.AdRoomHall,gapMinutes:risk.gapMinutes,requiredMinutes:risk.requiredMinutes},after:{roomCode:swap.AdRoomCode,roomHall:swap.AdRoomHall,requiredMinutes:travelMinutesFor(profile,risk.fromBuilding,swap.AdRoomCode)},changes,safe:true,globalScoreDelta:verified.globalAfter.score-globalBefore.score});}
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
    parts.push(`الوقت ${formatScheduleTimeRange(before?.fstarttime, before?.fendtime)} ← ${formatScheduleTimeRange(after?.fstarttime, after?.fendtime)}`);
  const beforeRoom = `${before?.AdRoomCode || ""}/${before?.AdRoomHall || ""}`;
  const afterRoom = `${after?.AdRoomCode || ""}/${after?.AdRoomHall || ""}`;
  if (beforeRoom !== afterRoom) parts.push(`القاعة ${beforeRoom} ← ${afterRoom}`);
  if (Number(before?.AdInstructorId || 0) !== Number(after?.AdInstructorId || 0))
    parts.push(`الأستاذ ${instructorName?.(Number(before?.AdInstructorId || 0)) || before?.AdInstructorId} ← ${instructorName?.(Number(after?.AdInstructorId || 0)) || after?.AdInstructorId}`);
  if (String(before?.SCode || "") !== String(after?.SCode || "")) parts.push(`الشعبة ${before?.SCode} ← ${after?.SCode}`);
  return parts.join(" · ");
}

/**
 * ── ما تعلّمه النظام من عشر سنوات ───────────────────────────────────────────
 *
 * The department's own style, read out of its entire history — every term it
 * has ever scheduled, not just the one on screen. Nobody declares it and
 * nobody is asked for it; a habit repeated a few thousand times is a stronger
 * statement than any settings field.
 *
 * Cached per department against the same change beacon the live feed already
 * runs on, so reading it costs one pass over the rows and then nothing at all
 * until some schedule somewhere is written.
 *
 * A declared rule still wins. If a department has explicitly stated a doorway,
 * that number is used and the learned one is not — a person who says something
 * out loud outranks a pattern the software inferred.
 */
interface DepartmentStyle {
  reading:RhythmReading|null;
  doorway:number;
  memory:DepartmentMemory|null;
  /** Course pairs that share students, from whoever answered the survey. */
  cohort:Set<string>;
  cohortSize:(a:number,b:number)=>number;
}
const NO_COHORT:Pick<DepartmentStyle,"cohort"|"cohortSize">={cohort:new Set(),cohortSize:()=>0};
const rhythmCache=new Map<string,{serial:number}&DepartmentStyle>();

async function departmentStyle(row:any):Promise<DepartmentStyle>{
  const collegeId=Number(row?.AdCollegeId||0),sectionId=Number(row?.AdSectionId||0),termId=Number(row?.AdTermId||0);
  if(!collegeId)return{reading:null,doorway:0,memory:null,...NO_COHORT};
  const key=`${collegeId}:${sectionId}`;
  const cached=rhythmCache.get(key);
  if(cached&&cached.serial===driftSerial)
    return{reading:cached.reading,doorway:cached.doorway,memory:cached.memory,
           cohort:cached.cohort,cohortSize:cached.cohortSize};
  try{
    // Every term this department has ever run. History is the whole point:
    // a habit is what survives across years, and one term of it is chance.
    const history=(await Repository.getSchedules()).filter(item=>
      Number(item.AdCollegeId)===collegeId&&(!sectionId||Number(item.AdSectionId)===sectionId));
    const reading=learnRhythm(history);
    /* The same pass answers the memory's questions too — one read of history
       serves both, and neither is computed again until something is written. */
    const [memCourses,memPeople]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);
    const memory=readDepartmentMemory(history,memCourses,memPeople);
    const rules=termId?await Repository.getScheduleConstraints(collegeId,sectionId,termId).catch(()=>[]):[];
    const declared=Number(rules.find(item=>item.type==="room_doorway"&&item.enabled!==false)?.maxMinutes||0);
    /* The learned break is per pattern; the sweep takes one number, so it takes
       the SMALLEST habit across patterns. Flagging at the tighter of the two
       cannot invent a finding on the looser one. */
    const learned=Math.min(...reading.patterns.map(p=>p.breakMinutes||Infinity));
    const doorway=Math.max(0,Math.min(60,declared||(Number.isFinite(learned)?learned:0)));
    /* What the students said, read on the same pass and cached against the
       same beacon. A department that has never run a survey pays nothing and
       sees exactly what it saw before. */
    let cohort=new Set<string>(), cohortSize:(a:number,b:number)=>number=()=>0;
    if(termId&&sectionId){
      try{
        const needs=await Repository.getStudentNeeds(collegeId,sectionId,termId);
        if(needs.length){
          const demand=readStudentDemand(needs,memCourses.filter(c=>Number(c.AdSectionId)===sectionId));
          cohort=cohortPairs(demand);
          cohortSize=(a,b)=>sharedBetween(demand,a,b);
        }
      }catch{ /* no survey is the ordinary case */ }
    }
    rhythmCache.set(key,{serial:driftSerial,reading,doorway,memory,cohort,cohortSize});
    if(rhythmCache.size>200)rhythmCache.clear();
    return{reading,doorway,memory,cohort,cohortSize};
  }catch{return{reading:null,doorway:0,memory:null,...NO_COHORT};}
}

async function scheduleConflicts(req:AuthenticatedRequest,row:any,excludeId=0){
  const termId=Number(row?.AdTermId||0);
  if(!termId||!row?.fstarttime||!row?.fendtime||!SCHEDULE_DAY_KEYS.some(k=>Boolean(row?.[k])))return[];
  const candidate:any={...row,id:excludeId||Number(row?.id||-900000),AdTermId:termId};
  const [termRowsRaw, instructor, roomNotice, hallBarterRequests, registry]=await Promise.all([
    // One current-term read (cached by the repository) is intentional here: it closes the
    // pre-migration alias gap without ever scanning ten years during interactive use.
    Repository.getSchedulesByScope({termId}),
    Number(candidate.AdInstructorId||0) ? Repository.getInstructorById(Number(candidate.AdInstructorId)) : Promise.resolve(null),
    roomScopeNotice(candidate),
    Repository.getHallBarterRequests(termId),
    readLocationRegistry(),
  ]);
  const candidateCanonical=canonicalizeHistoricalLocationForRuntime(candidate as FSchedule,registry);
  const all=termRowsRaw.map(item=>canonicalizeHistoricalLocationForRuntime(item,registry)).filter(item=>item.id!==excludeId);
  const style=await departmentStyle(candidate);
  const raw=findConflicts([candidateCanonical],all,{doorwayMinutes:style.doorway,
    cohortPairs:style.cohort,cohortSize:style.cohortSize});
  const conflicts=raw.map((conflict:any)=>{
    /* The turnaround rule is advice, not a refusal. `soft` is what keeps it out
       of the blocked list in move-batch and out of the 409 on save — a
       department that deliberately runs back-to-back lectures must never be
       stopped from saying so. */
    if(conflict.type==="cohort"){
      const other=all.find(item=>item.id===conflict.otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
      /* Soft on purpose: it speaks for whoever answered the survey, not for the
         registrar, and a partial answer must never be the thing that blocks a
         department from saving its own schedule. */
      return{...conflict,soft:true,severity:"medium",rowId:visible&&other?other.id:0,
        message:"تعارض على الطلاب",
        detail:visible?conflict.detail:"الموعد الآخر خارج نطاق العرض الحالي."};
    }
    if(conflict.type==="doorway"){
      const other=all.find(item=>item.id===conflict.otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
      return{...conflict,soft:true,severity:"low",rowId:visible&&other?other.id:0,
        message:"مهلة الباب غير كافية",
        detail:visible?conflict.detail:"القاعة تُخلى وتُملأ مباشرة، والموعد الآخر خارج نطاق العرض الحالي."};
    }
    const other=all.find(item=>item.id===conflict.otherId);
    const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,other.AdCollegeId,other.AdSectionId)):true;
    if(conflict.type==="instructor"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`الأستاذ ${instructor?.AdInstructorName||""} لديه محاضرة متداخلة`,detail:visible?`${other.AdCourseName||"مقرر"} — ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`:`يوجد له موعد متداخل خارج نطاق القسم — ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`};
    if(conflict.type==="room"&&other)return{...conflict,severity:"high",rowId:visible?other.id:0,message:`القاعة ${other.AdRoomCode}/${other.AdRoomHall} مشغولة في نفس الوقت`,detail:visible?`${other.AdCourseName||"مقرر"} — ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`:`يوجد حجز متداخل خارج نطاق العرض الحالي`};
    // A repeated course and section is only a duplicate when it is the very same
    // placement; a lecture on Sunday and its laboratory on Tuesday share a
    // section number by design and must not be refused.
    return{...conflict,severity:"high",rowId:visible&&other?other.id:0,message:"يوجد موعد مطابق تماماً لنفس المقرر والشعبة",detail:visible&&other?`نفس الأيام ونفس الوقت ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`:"يوجد سجل مطابق خارج نطاق العرض الحالي"};
  });
  const sameBarterRoom=(request:any)=>barterRequestMatchesRow(request,candidate);
  const barterReservation = hallBarterRequests.find((request:any) => {
    if(request.status!=="approved"||!sameBarterRoom(request))return false;
    if(Number(request.requesterCollegeId)===Number(candidate.AdCollegeId)&&Number(request.requesterSectionId)===Number(candidate.AdSectionId))return false;
    return SCHEDULE_DAY_KEYS.some(day=>Boolean(candidate[day])&&request.day===day&&
      scheduleOverlap(String(candidate.fstarttime||""),String(candidate.fendtime||""),String(request.startTime||""),String(request.endTime||"")));
  });
  const myApprovedWindows=hallBarterRequests.filter((request:any)=>request.status==="approved"&&sameBarterRoom(request)&&
    Number(request.requesterCollegeId)===Number(candidate.AdCollegeId)&&Number(request.requesterSectionId)===Number(candidate.AdSectionId));
  const selectedBarterDays=SCHEDULE_DAY_KEYS.filter(day=>Boolean(candidate[day]));
  const borrowerWindowViolation=myApprovedWindows.length>0&&selectedBarterDays.some(day=>!myApprovedWindows.some((request:any)=>
    request.day===day&&timeToMinutes(String(candidate.fstarttime||""))>=timeToMinutes(String(request.startTime||""))&&
    timeToMinutes(String(candidate.fendtime||""))<=timeToMinutes(String(request.endTime||""))));
  const barterNotes:any[] = [];
  if(barterReservation)barterNotes.push({
    type:"hallBarter",severity:"high",soft:false,rowId:0,otherId:0,
    message:`القاعة ${candidate.AdRoomCode}/${candidate.AdRoomHall} محجوزة رقمياً عبر استعارة القاعات`,
    detail:`نافذة الاستعارة المعتمدة ${HALL_BARTER_DAY_LABEL.get(barterReservation.day)||""} ${formatScheduleTimeRange(barterReservation.startTime, barterReservation.endTime)}.`
  });
  if(borrowerWindowViolation)barterNotes.push({
    type:"hallBarterWindow",severity:"high",soft:false,rowId:0,otherId:0,
    message:"الموعد يتجاوز نافذة الاستعارة المعتمدة",
    detail:"استخدم القاعة داخل اليوم والوقت المعتمدين فقط، أو اطلب نافذة إضافية من استعارة القاعات قبل الحفظ."
  });
  const softTravel = await interCampusWarnings(candidate, all);
  /* The department's own habit, broken. Not an error — a lecture beginning at
     08:55 where every other lecture on that day has begun at 08:50 for ten
     years is almost always a slip of the finger, and occasionally a decision.
     So it is said once, softly, and never refuses a save. */
  const habit = style.reading ? offRhythm(candidate, style.reading) : "";
  const rhythmNote = habit
    ? [{ type: "rhythm", severity: "low", soft: true, rowId: 0, otherId: 0,
         message: "خارج إيقاع القسم المعتاد", detail: habit }]
    : [];

  /* ── ذاكرة عشر سنوات، عند لحظة القرار وحدها ─────────────────────────────
   *
   * Not a dashboard and not a strip: the question «what does history say about
   * HERE» is only worth answering while somebody's card is actually over here.
   * At every other moment it is noise, so at every other moment it is not
   * computed and not sent.
   *
   * At most one sentence about the place and one about the hall. A person
   * mid-drag can read one line; five lines are a wall they will learn to skip.
   */
  const memoryNotes: any[] = [];
  if (style.memory) {
    const day = SCHEDULE_DAY_KEYS.find(key => Boolean(candidate[key]));
    const slot = day ? style.memory.atSlot(day as any, String(candidate.fstarttime || "")) : null;
    if (slot) memoryNotes.push({ type: "memory", severity: "low", soft: true, rowId: 0, otherId: 0,
      message: slot.surprising ? "شيء لم ينتبه له أحد" : "من ذاكرة القسم", detail: slot.text });
    const hall = style.memory.aboutRoom(String(candidate.AdRoomCode || ""), String(candidate.AdRoomHall || ""), candidate.roomId);
    // Only the surprising half about a hall: «هذه قاعتك المعتادة» is true and
    // tells a coordinator nothing they have not known for years.
    if (hall?.surprising) memoryNotes.push({ type: "memory", severity: "low", soft: true, rowId: 0, otherId: 0,
      message: "شيء لم ينتبه له أحد", detail: hall.text });
  }

  return [...conflicts, ...barterNotes, ...(roomNotice ? [roomNotice] : []), ...softTravel, ...rhythmNote, ...memoryNotes];
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
/**
 * ── من غيري هنا ────────────────────────────────────────────────────────────
 *
 * A live connection used to be an anonymous socket: the registry held Response
 * objects and nothing else, which was enough to say "something changed" and not
 * enough to say anything about anyone. Presence needs the second thing, so the
 * Set becomes a Map from the same Response to what is known about the person
 * holding it — and stays keyed by the Response, so `.size` against the 400-cap
 * and delete-on-write-failure both keep working exactly as they did.
 *
 * Nothing here is ever written to a database. A hover is true for a few seconds
 * and then it is not; storing it would cost a document write per mouse move and
 * would outlive the fact it describes.
 */
interface PresenceMark {
  /** The cell under the pointer, when there is one. Touch has no hover. */
  cell: { day: string; start: string; room?: string } | null;
  /** A card in the air — by pointer or by keyboard, the two are the same news. */
  holding: { rowId: number; rev: number } | null;
  /** A row open in the editor. */
  editing: { rowId: number; rev: number } | null;
}

interface ScheduleEventClient extends PresenceMark {
  res: Response;
  /** Names this exact stream, so a POST can address the connection it belongs to. */
  connId: string;
  userId: number;
  name: string;
  /** college:section:term — presence is scoped to a board, never to a person. */
  scopeKey: string;
  collegeId: number;
  sectionId: number;
  /** Demo streams are private to one sandbox even when their academic scope matches. */
  demoSessionId: string;
  /** When the mark was last refreshed, and when the connection last spoke. */
  markAt: number;
  seenAt: number;
}

const scheduleEventClients = new Map<Response, ScheduleEventClient>();
let scheduleEventTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleEventSerial = 0;
/** Writes the event to every screen attached to THIS instance. */
function broadcastScheduleChange(demoSessionId = "") {
  scheduleEventSerial += 1;
  const payload = `id: ${scheduleEventSerial}\nevent: schedules\ndata: {"changedAt":${Date.now()}}\n\n`;
  for (const [response, client] of scheduleEventClients) {
    if (demoSessionId && client.demoSessionId !== demoSessionId) continue;
    try { response.write(payload); } catch { scheduleEventClients.delete(response); }
  }
}

/* A mark older than this is treated as stale — the person is still connected,
   but wherever their pointer was, it is not news any more. A connection that
   has not spoken at all for the longer window stops being listed: a stream is
   authorised once at connect and never re-checked, so silence is the cheap
   stand-in for asking again. */
const PRESENCE_STALE_MS = 45_000;
const PRESENCE_GONE_MS = 90_000;
const presenceDirty = new Set<string>();
let presenceFlushTimer: ReturnType<typeof setTimeout> | null = null;

const emptyMark = (): PresenceMark => ({ cell: null, holding: null, editing: null });
const boardScopeKey = (req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number) => `${req.demoSessionId ? `demo:${req.demoSessionId}:` : ""}${collegeId}:${sectionId}:${termId}`;
const hasMark = (mark: PresenceMark) => Boolean(mark.cell || mark.holding || mark.editing);

/**
 * Everyone on one board, as that board's own members would see them.
 *
 * Scope-symmetric on purpose: an administrator's wider reach lets them read any
 * department's DATA, but presence is other people's names and movements, and
 * there is no version of this feature where someone learns who is working in a
 * college they are not in.
 */
function presenceRoster(scopeKey: string, now: number) {
  const peers: Array<{ connId: string; userId: number; name: string } & PresenceMark> = [];
  for (const client of scheduleEventClients.values()) {
    if (client.scopeKey !== scopeKey) continue;
    if (now - client.seenAt > PRESENCE_GONE_MS) continue;
    const fresh = now - client.markAt <= PRESENCE_STALE_MS;
    peers.push({
      // Named field by field. `req.user` is the raw stored row and still carries
      // the password hash and the login name; spreading it here would post both
      // to every colleague on the board.
      connId: client.connId, userId: client.userId, name: client.name,
      cell: fresh ? client.cell : null,
      holding: fresh ? client.holding : null,
      editing: fresh ? client.editing : null,
    });
  }
  return peers;
}

/** Writes the roster for one board to every connection watching that board. */
function broadcastPresence(scopeKey: string) {
  const now = Date.now();
  const peers = presenceRoster(scopeKey, now);
  // No `id:` line. The server never reads Last-Event-ID back, so a presence
  // frame must not look resumable — every frame is a whole roster, and a
  // reconnect is answered with a fresh one rather than a gap.
  const payload = `event: presence\ndata: ${JSON.stringify({ scope: scopeKey, at: now, peers })}\n\n`;
  for (const [res, client] of scheduleEventClients) {
    if (client.scopeKey !== scopeKey) continue;
    try { res.write(payload); } catch { scheduleEventClients.delete(res); }
  }
}

function markPresenceDirty(scopeKey: string) {
  if (!scopeKey) return;
  presenceDirty.add(scopeKey);
  if (presenceFlushTimer) return;
  // A timer of its own. Sharing scheduleEventTimer would drop presence whenever
  // a schedule write was already pending, and would drag a Firestore write into
  // the path of a mouse move.
  presenceFlushTimer = setTimeout(() => {
    presenceFlushTimer = null;
    const scopes = [...presenceDirty];
    presenceDirty.clear();
    for (const scope of scopes) broadcastPresence(scope);
  }, 250);
}

/* A frozen tab, a closed laptop, or a session that quietly expired all look the
   same from here: the marks stop arriving. This is what turns that silence back
   into an empty chair. */
setInterval(() => {
  const now = Date.now();
  for (const client of scheduleEventClients.values()) {
    const stale = now - client.markAt > PRESENCE_STALE_MS;
    const gone = now - client.seenAt > PRESENCE_GONE_MS;
    if ((stale || gone) && hasMark(client)) {
      Object.assign(client, emptyMark());
      markPresenceDirty(client.scopeKey);
    } else if (gone) {
      markPresenceDirty(client.scopeKey);
    }
  }
}, 10_000).unref?.();
onSchedulesInvalidated(() => {
  if (scheduleEventTimer) return;
  const demoSessionId = Repository.currentDemoSessionId();
  scheduleEventTimer = setTimeout(() => {
    scheduleEventTimer = null;
    broadcastScheduleChange(demoSessionId);
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
    hallBarterSerial += 1;
    hallBarterBoardCache.clear();
    livingResponseCache.clear();
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

  const connId = String(req.query.conn || "").slice(0, 64);
  const collegeId = Number(req.query.college || 0);
  const sectionId = Number(req.query.section || 0);
  const termId = Number(req.query.term || 0);
  /* A stream may only claim a board its holder is allowed to be on — the same
     wall every data route stands behind. A stream with no `conn` (the reports
     screen opens one too) registers with an empty scope and therefore appears
     in nobody's roster and receives nobody else's. */
  const allowed = connId && collegeId && isScopeAllowed(req, collegeId, sectionId);
  const now = Date.now();
  scheduleEventClients.set(res, {
    res, connId,
    userId: Number(req.user?.SystemUserId || 0),
    name: String(req.user?.Name || "").trim() || "زميل",
    scopeKey: allowed ? boardScopeKey(req, collegeId, sectionId, termId) : "",
    collegeId, sectionId, demoSessionId: req.demoSessionId || "",
    markAt: 0, seenAt: now,
    ...emptyMark(),
  });
  // A reconnect must not have to wait for someone else to move: this stream is
  // answered with the whole roster the moment it opens.
  if (allowed) {
    try {
      res.write(`event: presence\ndata: ${JSON.stringify({
        scope: boardScopeKey(req, collegeId, sectionId, termId), at: now,
        peers: presenceRoster(boardScopeKey(req, collegeId, sectionId, termId), now),
      })}\n\n`);
    } catch { /* the close handler below does the cleanup */ }
    markPresenceDirty(`${collegeId}:${sectionId}:${termId}`);
  }

  // Proxies drop silent connections; a comment line every while keeps this one open.
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* close event does the cleanup */ }
  }, 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    // The only cleanup path in the whole transport. Anything registered at
    // connect and not removed here becomes a colleague who never leaves.
    const gone = scheduleEventClients.get(res);
    scheduleEventClients.delete(res);
    if (gone?.scopeKey) markPresenceDirty(gone.scopeKey);
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
    : Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);

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

  const [rows, scopedInstructors, historicalDepartmentInstructors, courses, visitingInstructorIds] = await Promise.all([
    readSchedulesForRequest(req, collegeId, sectionId, termId),
    sectionId
      ? Repository.getInstructorsByScope(sectionId, termId)
      : (collegeId ? Repository.getInstructorsByScheduleScope({ collegeId, termId }) : Promise.resolve([])),
    sectionId ? Repository.getInstructorsByScope(sectionId, 0) : Promise.resolve([]),
    sectionId ? Repository.getCoursesBySection(sectionId) : Promise.resolve([]),
    sectionId && collegeId ? Repository.getVisitingRoster(collegeId, sectionId, termId) : Promise.resolve([] as number[]),
  ]);
  const visitingPeople = visitingInstructorIds.length
    ? (await Repository.getInstructors()).filter(person => visitingInstructorIds.includes(Number(person.AdInstructorId)))
    : [];
  const instructors = [...new Map([...historicalDepartmentInstructors, ...scopedInstructors, ...visitingPeople].map(person => [Number(person.AdInstructorId), person])).values()]
    .sort((a,b)=>String(a.AdInstructorName||"").localeCompare(String(b.AdInstructorName||""),"ar"));

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
  if(!termId){const terms=await Repository.getTerms();termId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);}
  let list = await readSchedulesForRequest(req, collegeId, sectionId, termId);

  if (req.query.instructorId) {
    list = list.filter(s => s.AdInstructorId === parseInt(req.query.instructorId as string));
  }
  if (req.query.building || req.query.hall) {
    const registry=await readLocationRegistry();
    const buildingToken=String(req.query.building||"");
    const buildingMatch=buildingToken
      ? registry.buildings.find(item=>item.id===buildingToken) || resolveBuilding(registry,buildingToken,{collegeId,sectionId}).value
      : undefined;
    const hallToken=String(req.query.hall||"");
    const roomMatch=hallToken
      ? registry.rooms.find(item=>item.id===hallToken) || (buildingMatch ? resolveRoom(registry,hallToken,buildingMatch.id,{collegeId,sectionId}).value : undefined)
      : undefined;
    if(buildingToken&&!buildingMatch){list=[];}
    else if(buildingMatch){list=list.filter(row=>canonicalizeHistoricalLocationForRuntime(row,registry).buildingId===buildingMatch.id);}
    if(hallToken&&!roomMatch){list=[];}
    else if(roomMatch){list=list.filter(row=>canonicalizeHistoricalLocationForRuntime(row,registry).roomId===roomMatch.id);}
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

// ============================================================================
// INTER-COLLEGE PASSIVE HALL BARTER
// ============================================================================

app.get("/api/hall-barter", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل أولاً"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  res.json(await buildHallBarterBoard(req,collegeId,sectionId,termId));
});

app.post("/api/hall-barter/requests", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const opportunityId=String(req.body?.opportunityId||"").trim();
  if(!collegeId||!sectionId||!termId||!opportunityId){res.status(400).json({error:"طلب الاستعارة ناقص البيانات"});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const board=await buildHallBarterBoard(req,collegeId,sectionId,termId);
  const opportunity=board.opportunities.find((item:any)=>item.id===opportunityId);
  if(!opportunity){res.status(409).json({error:"هذه النافذة لم تعد متاحة كما كانت. حدّث القائمة واختر نافذة أخرى."});return;}
  if(Number(opportunity.ownerCollegeId)===collegeId&&Number(opportunity.ownerSectionId)===sectionId){res.status(409).json({error:"لا يمكن للقسم استعارة قاعة من نفسه."});return;}
  const request=await Repository.createHallBarterRequest({
    AdTermId:termId,buildingId:opportunity.buildingId,roomId:opportunity.roomId,roomCode:opportunity.roomCode,roomHall:opportunity.roomHall,day:opportunity.day,
    startTime:opportunity.startTime,endTime:opportunity.endTime,
    requesterCollegeId:collegeId,requesterSectionId:sectionId,requesterUserId:Number(req.user.SystemUserId||0),requesterName:String(req.user.Name||""),
    ownerCollegeId:Number(opportunity.ownerCollegeId),ownerSectionId:Number(opportunity.ownerSectionId),
    confidence:Number(opportunity.confidence||0),historyTerms:Number(opportunity.historyTerms||0),
  });
  hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.status(201).json({request,message:"أُرسل طلب الاستعارة رقمياً إلى القسم المضيف. لم يتغير أي موعد دراسي بعد."});
});

app.post("/api/hall-barter/requests/:id/respond", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const request=await Repository.getHallBarterRequestById(String(req.params.id||""));
  if(!request){res.status(404).json({error:"طلب الاستعارة غير موجود"});return;}
  if(request.status!=="pending"){res.status(409).json({error:"تمت معالجة هذا الطلب مسبقاً"});return;}
  if(!isScopeAllowed(req,request.ownerCollegeId,request.ownerSectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"الموافقة تخص القسم المضيف فقط"});return;}
  const decision=String(req.body?.decision||"");
  if(decision!=="approve"&&decision!=="reject"){res.status(400).json({error:"حدد الموافقة أو الرفض"});return;}
  if(decision==="approve"){
    if(Number(request.requesterCollegeId)===Number(request.ownerCollegeId)&&Number(request.requesterSectionId)===Number(request.ownerSectionId)){
      res.status(409).json({error:"لا يمكن اعتماد استعارة لأن القسم الطالب هو نفسه القسم المضيف."});return;
    }
    const [requesterCollege,ownerCollege]=await Promise.all([
      Repository.getCollegeById(Number(request.requesterCollegeId)),
      Repository.getCollegeById(Number(request.ownerCollegeId)),
    ]);
    if(!sameHallCampusGender(requesterCollege?.AdCollegeName,ownerCollege?.AdCollegeName)){
      res.status(409).json({error:"لا يمكن اعتماد استعارة بين حرم البنين وحرم البنات. القاعات منفصلة بالكامل بين الجهتين."});return;
    }
    const [termRows,allRequests]=await Promise.all([Repository.getSchedulesByScope({termId:request.AdTermId}),Repository.getHallBarterRequests(request.AdTermId)]);
    const roomBusy=termRows.some(row=>barterRequestMatchesRow(request,row)&&rowOccupiesWindow(row,request.day,request.startTime,request.endTime));
    if(roomBusy){res.status(409).json({error:"القاعة أصبحت مشغولة في هذه النافذة؛ لم تتم الموافقة حتى لا ينشأ تضارب."});return;}
    const reserved=allRequests.some(other=>other.id!==request.id&&barterRequestOverlaps(other,request.roomCode,request.roomHall,request.day,request.startTime,request.endTime,request.roomId));
    if(reserved){res.status(409).json({error:"تم اعتماد استعارة أخرى متداخلة لهذه القاعة. اختر نافذة مختلفة."});return;}
  }
  const now=new Date().toISOString();
  const updated=await Repository.updateHallBarterRequest(request.id,{
    status:decision==="approve"?"approved":"rejected",respondedAt:now,
    responderUserId:Number(req.user.SystemUserId||0),responderName:String(req.user.Name||""),
  });
  hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.json({request:updated,message:decision==="approve"?"تم اعتماد الاستعارة. أصبحت النافذة محجوزة رقمياً للقسم الطالب وتظهر للطرفين.":"تم رفض الطلب دون أي تغيير على الجدول."});
});

app.post("/api/hall-barter/requests/:id/cancel", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const request=await Repository.getHallBarterRequestById(String(req.params.id||""));
  if(!request){res.status(404).json({error:"طلب الاستعارة غير موجود"});return;}
  if(!isScopeAllowed(req,request.requesterCollegeId,request.requesterSectionId)&&!req.user.IsAdminUser){res.status(403).json({error:"إلغاء الطلب متاح للقسم الطالب فقط"});return;}
  if(!["pending","approved"].includes(request.status)){res.status(409).json({error:"لا يمكن إلغاء هذا الطلب في حالته الحالية"});return;}
  if(request.status==="approved"){
    const rows=await Repository.getSchedulesByScope({collegeId:request.requesterCollegeId,sectionId:request.requesterSectionId,termId:request.AdTermId});
    const inUse=rows.some(row=>barterRequestMatchesRow(request,row)&&rowOccupiesWindow(row,request.day,request.startTime,request.endTime));
    if(inUse){res.status(409).json({error:"لا يمكن إلغاء الاستعارة لأن جدول قسمك يستخدم القاعة فعلياً في هذه النافذة. انقل الموعد أولاً."});return;}
  }
  const updated=await Repository.updateHallBarterRequest(request.id,{status:"cancelled"});
  hallBarterSerial++;hallBarterBoardCache.clear();
  broadcastScheduleChange();void Repository.markSchedulesChanged();
  res.json({request:updated,message:"تم إلغاء طلب الاستعارة وتحرير النافذة."});
});

app.post("/api/schedules/check-conflicts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => { const row=req.body||{}; res.json({conflicts:await scheduleConflicts(req,row,Number(row.excludeId||0))}); });


/**
 * One approval-time reading of the whole department scope.
 *
 * The editor checks one candidate at a time. Approval cannot do that: it must
 * see collisions against the whole term, including appointments outside the
 * reader's department that share an instructor or room. This endpoint performs
 * that term-wide read on the server, then redacts the other appointment when it
 * sits outside the caller's permissions. It returns only hard blockers — the
 * regulation remains an advisory/review layer in the client.
 */
app.get("/api/schedules/review-readiness", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"حدد الكلية والقسم والفصل."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scopeRows,termRows,hallBarterRequests,instructors,courses]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId}),
    Repository.getSchedulesByScope({termId}),
    Repository.getHallBarterRequests(termId),
    Repository.getInstructors(),
    Repository.getCourses(),
  ]);
  const ownIds=new Set(scopeRows.map(row=>Number(row.id)));
  const byId=new Map(termRows.map(row=>[Number(row.id),row] as const));
  const instructorById=new Map(instructors.map(row=>[Number(row.AdInstructorId),String(row.AdInstructorName||"")]));
  const courseById=new Map(courses.map(row=>[Number(row.AdCourseId),row] as const));
  const blockers:any[]=[];
  const seen=new Set<string>();
  const add=(item:any)=>{const key=String(item.id||`${item.type}:${(item.rowIds||[]).join(":")}`);if(seen.has(key))return;seen.add(key);blockers.push(item);};

  findConflicts(scopeRows as any,termRows as any)
    .filter((item:any)=>item.severity==="high"||item.type==="duplicate")
    .forEach((item:any)=>{
      const ownId=ownIds.has(Number(item.rowId))?Number(item.rowId):Number(item.otherId);
      if(!ownIds.has(ownId))return;
      const otherId=Number(item.rowId)===ownId?Number(item.otherId):Number(item.rowId);
      const other=byId.get(otherId);
      const visible=other?Boolean(req.user?.IsAdminUser||isScopeAllowed(req,Number(other.AdCollegeId),Number(other.AdSectionId))):false;
      const own=byId.get(ownId);
      const title=item.type==="instructor"?"حجز مزدوج لأستاذ المقرر":item.type==="room"?"حجز مزدوج للقاعة":"موعد مطابق تماماً لنفس المقرر والشعبة";
      const ownDays=own?SCHEDULE_DAY_KEYS.map((key,index)=>own[key]?DAY_LABELS[index]:null).filter(Boolean).join("، "):"";
      const ownCourse=own?(courseById.get(Number(own.AdCourseId))?.CourseCode||String(own.AdCourseName||"المقرر")):"المقرر";
      const ownTime=own?formatScheduleTimeRange(String(own.fstarttime||""),String(own.fendtime||"")):"";
      const subjectKey=item.type==="instructor"
        ? `instructor:${Number(own?.AdInstructorId||0)}`
        : item.type==="room"
          ? `room:${String(own?.AdRoomCode||"").trim()}/${String(own?.AdRoomHall||"").trim()}`
          : `course:${Number(own?.AdCourseId||0)}:${String(own?.SCode||"")}`;
      const subjectLabel=item.type==="instructor"
        ? (instructorById.get(Number(own?.AdInstructorId||0))||"أستاذ المقرر")
        : item.type==="room"
          ? `القاعة ${String(own?.AdRoomCode||"").trim()}/${String(own?.AdRoomHall||"").trim()}`
          : `${ownCourse} · شعبة ${String(own?.SCode||"")}`;
      const external=visible&&other
        ? `${courseById.get(Number(other.AdCourseId))?.CourseCode||String(other.AdCourseName||"موعد آخر")} · ${formatScheduleTimeRange(String(other.fstarttime||""),String(other.fendtime||""))}`
        : "موعد خارج نطاق العرض الحالي";
      const detail=`${ownCourse}${own?.SCode?` · شعبة ${own.SCode}`:""}${ownDays?` · ${ownDays}`:""}${ownTime?` · ${ownTime}`:""} ↔ ${external}`;
      add({id:`conflict:${[ownId,otherId].sort((a,b)=>a-b).join(":")}`,type:item.type,title,detail,rowIds:[ownId],subjectKey,subjectLabel});
    });

  const roomKey=(row:any)=>roomIdentityKey(row);
  const approved=hallBarterRequests.filter((request:any)=>request.status==="approved");
  for(const row of scopeRows){
    const key=roomKey(row);if(!key)continue;
    const sameRoom=approved.filter((request:any)=>barterRequestRoomKey(request)===key);
    if(!sameRoom.length)continue;
    const active=SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day]));
    const mine=sameRoom.filter((request:any)=>Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId);
    const foreign=sameRoom.find((request:any)=>
      !(Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId)&&
      active.some(day=>request.day===day&&scheduleOverlap(String(row.fstarttime||""),String(row.fendtime||""),String(request.startTime||""),String(request.endTime||"")))
    );
    if(foreign){
      add({id:`barter:${row.id}:${foreign.id}`,type:"hallBarter",title:`القاعة ${row.AdRoomCode}/${row.AdRoomHall} محجوزة عبر استعارة القاعات`,detail:`نافذة معتمدة ${HALL_BARTER_DAY_LABEL.get(foreign.day)||""} ${formatScheduleTimeRange(String(foreign.startTime||""),String(foreign.endTime||""))}.`,rowIds:[Number(row.id)]});
    }
    if(mine.length&&active.some(day=>!mine.some((request:any)=>request.day===day&&timeToMinutes(String(row.fstarttime||""))>=timeToMinutes(String(request.startTime||""))&&timeToMinutes(String(row.fendtime||""))<=timeToMinutes(String(request.endTime||""))))){
      add({id:`barter-window:${row.id}`,type:"hallBarterWindow",title:"الموعد يتجاوز نافذة الاستعارة المعتمدة",detail:"استخدم القاعة داخل اليوم والوقت المعتمدين، أو اطلب نافذة إضافية قبل الاعتماد.",rowIds:[Number(row.id)]});
    }
  }
  res.json({blockers,checkedRows:scopeRows.length,termRows:termRows.length});
});

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
  const ALLOWED = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fstarttime", "fendtime", "AdRoomCode", "AdRoomHall", "buildingId", "roomId", "locationStatus"] as const;
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
    const locationResult=await canonicalizeLocationForWrite(candidate.row,Number(candidate.row.AdCollegeId),Number(candidate.row.AdSectionId));
    if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
    if(locationResult.check.canonical){
      Object.assign(candidate.row,locationResult.check.canonical);
      Object.assign(candidate.fields,{buildingId:candidate.row.buildingId,roomId:candidate.row.roomId,AdRoomCode:candidate.row.AdRoomCode,AdRoomHall:candidate.row.AdRoomHall,locationStatus:candidate.row.locationStatus});
    }
    const conflicts = await scheduleConflicts(req, candidate.row, candidate.row.id);
    blocked.push(...conflicts.filter((c: any) =>
      !c.soft && !movedIds.has(Number(c.rowId)) && (strict || c.severity === "high" || c.type === "duplicate")));
  }
  if (blocked.length) {
    const first = blocked[0];
    res.status(409).json({
      error: `لم يُنقل: ${first?.message || "تعارض يمنع الحفظ"}${blocked.length > 1 ? ` (+${countOf(blocked.length - 1, AR.blocker)} أخرى)` : ""}`,
      conflicts: blocked,
    });
    return;
  }
  let updated: FSchedule[];
  try {
    updated = await Repository.moveSchedulesBatch(candidates.map((c, index) => ({
      id: c.row.id,
      fields: c.fields,
      expectedRev: rawMoves[index]?.rev === undefined || rawMoves[index]?.rev === null
        ? undefined
        : Number(rawMoves[index].rev),
    })));
  } catch (error: any) {
    if (error instanceof ScheduleRevisionConflict) {
      res.status(409).json({
        error: "تغيّر أحد هذه المواعيد أثناء عملك؛ لم يُنقل شيء.",
        conflict: "revision",
        current: error.current,
      });
      return;
    }
    throw error;
  }
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
app.get("/api/schedules/export", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId) { res.status(400).json({ error: "حدد الكلية والفصل قبل التصدير." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId || 0)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
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
    .filter(row => row.locationStatus==="VERIFIED"&&row.buildingId&&row.roomId)
    .map(row => [String(row.roomId), { building: row.AdRoomCode, hall: row.AdRoomHall }]))
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
      building: row.AdRoomCode, hall: row.AdRoomHall, locationStatus: row.locationStatus,
      start: row.fstarttime, end: row.fendtime,
      days: DAY_FLAGS.map((flag, index) => ((row as any)[flag] ? DAY_LABELS[index] : null)).filter(Boolean)
    }))
  };
  const name = `schedule-${payload.scope.section || "term"}-${termId || "all"}.json`.replace(/[^\w.\-]+/g, "-");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.type("application/json; charset=utf-8").send(JSON.stringify(payload, null, 2));
});

app.post("/api/schedules/import", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const commit = body.commit === true;
  const collegeId = Number(body.collegeId || 0);
  const sectionId = Number(body.sectionId || 0);
  const termId = Number(body.termId || 0);
  const incoming: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل قبل الاستيراد." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!incoming.length) { res.status(400).json({ error: "الملف لا يحتوي مواعيد." }); return; }

  const [courses, instructors, existing, registry] = await Promise.all([
    Repository.getCourses(), Repository.getInstructors(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }), readLocationRegistry()
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
    const building=resolveBuilding(registry,candidate.AdRoomCode,{collegeId,sectionId});
    if(building.status!=="CONFIRMED"||!building.value){rejected.push({line:index+1,reason:"المبنى في الملف غير محسوم في السجل الرسمي؛ اختر مبنى رسميًا في المعاينة",label});return;}
    if(String(entry?.locationStatus||"")==="PENDING_ROOM"){
      Object.assign(candidate,{buildingId:building.value.id,roomId:undefined,AdRoomCode:building.value.officialCode,AdRoomHall:"",locationStatus:"PENDING_ROOM",sourceBuildingText:String(entry?.building||""),sourceRoomText:String(entry?.hall||"")});
    }else{
      const room=resolveRoom(registry,candidate.AdRoomHall,building.value.id,{collegeId,sectionId});
      if(room.status!=="CONFIRMED"||!room.value){rejected.push({line:index+1,reason:"القاعة في الملف غير محسومة داخل المبنى الرسمي؛ اختر قاعة رسمية أو Pending بشكل مقصود",label});return;}
      Object.assign(candidate,{buildingId:building.value.id,roomId:room.value.id,AdRoomCode:building.value.officialCode,AdRoomHall:room.value.canonicalCode,locationStatus:"VERIFIED",sourceBuildingText:String(entry?.building||""),sourceRoomText:String(entry?.hall||"")});
    }
    const payloadIssues = schedulePayloadIssues(candidate);
    if (payloadIssues.length) { rejected.push({ line: index + 1, reason: payloadIssues[0], label }); return; }
    seen.add(key);
    ready.push(candidate);
  });

  const importPreflightIssues:string[]=[];
  for(let index=0;index<ready.length;index+=1){
    const row=ready[index];
    const locationResult=await canonicalizeLocationForWrite(row,collegeId,sectionId);
    if(!locationResult.check.ok){locationResult.check.issues.filter(issue=>issue.severity==="high").forEach(issue=>importPreflightIssues.push(`السطر ${index+1}: ${issue.message}`));}
    else if(locationResult.check.canonical)Object.assign(row,locationResult.check.canonical);
  }
  if(!importPreflightIssues.length){
    const conflicts=findConflicts(ready as any,[...existing,...ready] as any).filter((item:any)=>item.severity==="high"||item.type==="duplicate");
    conflicts.slice(0,20).forEach((item:any)=>importPreflightIssues.push(item.message||item.detail||"يوجد تعارض يمنع الاستيراد"));
  }
  if(importPreflightIssues.length){
    if(commit){res.status(409).json({error:"لم يتم استيراد أي موعد لأن فحص ما قبل النشر وجد مشكلة.",issues:[...new Set(importPreflightIssues)]});return;}
    importPreflightIssues.forEach((reason,index)=>rejected.push({line:0,reason,label:`فحص ما قبل النشر ${index+1}`}));
  }

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
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const instructorIds=await Repository.getVisitingRoster(collegeId, sectionId, termId);
  const wanted=new Set(instructorIds.map(Number));
  const instructors=(await Repository.getInstructors()).filter(person=>wanted.has(Number(person.AdInstructorId)));
  res.json({ instructorIds, instructors });
});

// A delegate badge is global to the person, but department directories are not.
app.get("/api/delegates", requireAnyPermission([3, 7]), async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ instructorIds: await Repository.getAllDelegateInstructorIds() });
});

app.put("/api/visiting-roster", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const ids: number[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds.map(Number).filter(Boolean) : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  // Term membership is deliberately independent of the permanent department
  // directory. Removing somebody from this term never deletes them from the
  // department's own delegate list.
  res.json({ instructorIds: await Repository.saveVisitingRoster(collegeId, sectionId, termId, ids) });
});

/** Persistent delegate directory owned by one department. */
app.get("/api/department-delegates", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [ids,people]=await Promise.all([Repository.getDepartmentDelegates(collegeId,sectionId),Repository.getInstructors()]);
  const wanted=new Set(ids.map(Number));
  res.json({instructorIds:ids,instructors:people.filter(person=>wanted.has(Number(person.AdInstructorId)))});
});

/** Add a person to this department's permanent visiting directory. The civil
 * number is the shared identity, so the same person may be added to another
 * department without creating a second instructor record. */
app.post("/api/department-delegates/instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const civil=asciiDigits(req.body?.AdInstructorCivil).replace(/\D/g,"");
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const check=validateCivilId(civil);
  if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  let person=await Repository.getInstructorByCivil(civil);
  if(!person) person=await Repository.createInstructor(civil,name,"");
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(directory.includes(Number(person.AdInstructorId))){res.status(409).json({error:"هذا المنتدب موجود بالفعل في قائمة هذا القسم.",person});return;}
  const instructorIds=await Repository.saveDepartmentDelegates(collegeId,sectionId,[...directory,Number(person.AdInstructorId)]);
  let roster:number[]|undefined;
  if(termId){const current=await Repository.getVisitingRoster(collegeId,sectionId,termId);roster=await Repository.saveVisitingRoster(collegeId,sectionId,termId,[...current,Number(person.AdInstructorId)]);}
  res.status(201).json({person,instructorIds,roster});
});

app.put("/api/department-delegates/:instructorId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),instructorId=Number(req.params.instructorId||0);
  if(!collegeId||!sectionId||!instructorId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(!directory.includes(instructorId)){res.status(404).json({error:"المنتدب غير موجود في قائمة هذا القسم"});return;}
  const civil=asciiDigits(req.body?.AdInstructorCivil).replace(/\D/g,"");
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  const check=validateCivilId(civil);
  if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  const collision=await Repository.getInstructorByCivil(civil);
  if(collision&&Number(collision.AdInstructorId)!==instructorId){res.status(409).json({error:"هذا الرقم المدني مرتبط بمنتدب آخر."});return;}
  const existing=await Repository.getInstructorById(instructorId);
  if(!existing){res.status(404).json({error:"المنتدب غير موجود"});return;}
  const person=await Repository.updateInstructor(instructorId,civil,name,String(existing.AdInstructorMobile||""),(existing as any).AdInstructorStatus||null);
  res.json(person);
});

app.delete("/api/department-delegates/:instructorId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),instructorId=Number(req.params.instructorId||0);
  if(!collegeId||!sectionId||!instructorId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const current=await Repository.getDepartmentDelegates(collegeId,sectionId);
  res.json({instructorIds:await Repository.saveDepartmentDelegates(collegeId,sectionId,current.filter(id=>Number(id)!==instructorId))});
});

/** Backwards-compatible creation path now writes the department directory too. */
app.post("/api/visiting-roster/instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const civil=asciiDigits(req.body?.AdInstructorCivil).replace(/\D/g,"");
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const check=validateCivilId(civil);if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  let person=await Repository.getInstructorByCivil(civil);if(!person)person=await Repository.createInstructor(civil,name,"");
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(!directory.includes(Number(person.AdInstructorId)))await Repository.saveDepartmentDelegates(collegeId,sectionId,[...directory,Number(person.AdInstructorId)]);
  const current=await Repository.getVisitingRoster(collegeId,sectionId,termId);
  await Repository.saveVisitingRoster(collegeId,sectionId,termId,[...current,Number(person.AdInstructorId)]);
  res.status(201).json(person);
});

/** Start this term's roster from selected people in another term. */
app.post("/api/visiting-roster/copy", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),fromTermId=Number(req.body?.fromTermId||0),toTermId=Number(req.body?.toTermId||0);
  if(!collegeId||!sectionId||!fromTermId||!toTermId){res.status(400).json({error:"حدد الفصلين."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const source:number[]=await Repository.getVisitingRoster(collegeId,sectionId,fromTermId);
  const rawRequested:unknown[]=Array.isArray(req.body?.instructorIds)?req.body.instructorIds:[];
  const requested:number[]=rawRequested.length
    ? rawRequested.map((value:unknown)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>0)
    : source;
  const sourceSet=new Set<number>(source.map(Number));
  const selected:number[]=[...new Set<number>(requested.filter((id:number)=>sourceSet.has(id)))];
  const target:number[]=await Repository.getVisitingRoster(collegeId,sectionId,toTermId);
  const merged:number[]=[...new Set<number>([...target,...selected].map(Number))];
  const directory:number[]=await Repository.getDepartmentDelegates(collegeId,sectionId);
  await Repository.saveDepartmentDelegates(collegeId,sectionId,[...new Set<number>([...directory,...selected].map(Number))]);
  res.json({instructorIds:await Repository.saveVisitingRoster(collegeId,sectionId,toTermId,merged),copied:selected.length});
});

/** Compatibility read for old consumers. Rooms now come only from the confirmed Master Registry; ordinary users cannot pin or create rooms. */
app.get("/api/department-rooms", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const registry=await readLocationRegistry();
  const buildingById=new Map(registry.buildings.filter(b=>b.active&&b.confidence==="CONFIRMED").map(b=>[b.id,b]));
  const rooms=registry.rooms.filter(room=>room.active&&room.confidence==="CONFIRMED"&&buildingById.has(room.buildingId)&&(!room.collegeIds.length||room.collegeIds.includes(collegeId))&&room.sectionIds.includes(sectionId)).map(room=>({building:buildingById.get(room.buildingId)!.officialCode,hall:room.canonicalCode,buildingId:room.buildingId,roomId:room.id,shared:room.shared})).sort((a,b)=>a.building.localeCompare(b.building,"en",{numeric:true})||a.hall.localeCompare(b.hall,"en",{numeric:true}));
  res.json({rooms});
});
app.post("/api/department-rooms", requirePermission(7), async (_req: AuthenticatedRequest, res: Response) => {
  res.status(403).json({error:"إضافة القاعات محصورة بمدير النظام من سجل المباني والقاعات الرسمي."});
});

// Master Location Registry — authoritative reference data. Ordinary schedulers can read only.
app.get("/api/location-registry", requireAuth, async (req:AuthenticatedRequest,res:Response)=>{
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(collegeId&&sectionId&&!isScopeAllowed(req,collegeId,sectionId)&&!isPowerUser(req)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const registry=await readLocationRegistry();
  const confirmedRooms=registry.rooms.filter(r=>r.active&&r.confidence==="CONFIRMED");
  let borrowedRoomIds:string[]=[];
  if(termId&&collegeId&&sectionId){
    const requests=await Repository.getHallBarterRequests(termId);
    borrowedRoomIds=[...new Set(requests.filter(request=>request.status==="approved"&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId&&request.roomId).map(request=>String(request.roomId)))];
  }
  const borrowedSet=new Set(borrowedRoomIds);
  // A building is operationally selectable only when at least one confirmed,
  // active room under it is actually usable by the open department. A stale
  // building.sectionIds relationship is historical evidence, not permission to
  // show an empty building in the picker.
  const eligibleRooms=confirmedRooms.filter(room=>
    !sectionId||room.sectionIds.includes(sectionId)||borrowedSet.has(room.id)
  );
  const eligibleBuildingIds=new Set(eligibleRooms.map(room=>room.buildingId));
  const borrowedBuildingIds=new Set(eligibleRooms.filter(room=>borrowedSet.has(room.id)).map(room=>room.buildingId));
  const buildings=registry.buildings.filter(building=>
    building.active&&building.confidence==="CONFIRMED"&&
    (!sectionId||eligibleBuildingIds.has(building.id))&&
    (borrowedBuildingIds.has(building.id)||!collegeId||!building.collegeIds.length||building.collegeIds.includes(collegeId))
  );
  const ids=new Set(buildings.map(building=>building.id));
  const rooms=eligibleRooms.filter(room=>ids.has(room.buildingId)).map(room=>({
    ...room,
    shared:room.sectionIds.length>1,
    sharedConfidence:room.sectionIds.length>1?"CONFIRMED":room.sharedConfidence,
  }));
  res.json({version:LOCATION_MIGRATION_VERSION,buildings,rooms,borrowedRoomIds,pendingRoomCode:PENDING_ROOM});
});
app.get("/api/location-registry/pending", requirePermission(7), async (req:AuthenticatedRequest,res:Response)=>{
  const termId=Number(req.query.termId||0);if(!termId){res.status(400).json({error:"حدد الفصل الدراسي"});return;}
  let rows=await Repository.getSchedulesByScope({termId});
  rows=rows.filter(r=>r.locationStatus==="PENDING_ROOM");
  if(!isPowerUser(req)){const instructorId=Number(req.user.AdInstructorId||0);rows=rows.filter(r=>instructorId&&Number(r.AdInstructorId)===instructorId&&isScopeAllowed(req,r.AdCollegeId,r.AdSectionId));}
  res.json({count:rows.length,rows});
});

const locationIdList=(value:unknown):number[]=>Array.isArray(value)?[...new Set(value.map(Number).filter(Number.isFinite).filter(x=>x>0))]:[];
const locationAliases=(value:unknown):any[]=>Array.isArray(value)?value.map((item:any)=>({value:String(item?.value||"").trim(),usageCount:Number(item?.usageCount||0)||undefined,confidence:"CONFIRMED" as const,evidence:Array.isArray(item?.evidence)?item.evidence.map(String).slice(0,12):["اعتماد يدوي من مدير النظام."]})).filter((item:any)=>item.value&&!isInvalidLocationToken(item.value)).slice(0,250):[];

app.get("/api/admin/location-registry", requirePermission(7), requirePowerAdmin, async (_req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();
  const [reviewCases,runs,rows,colleges,sections,terms,instructors]=await Promise.all([Repository.getLocationReviewCases(),Repository.getLocationMigrationRuns(),Repository.getSchedules(),Repository.getColleges(),Repository.getSections(),Repository.getTerms(),Repository.getInstructors()]);
  const instructorNames=new Map(instructors.map(x=>[Number(x.AdInstructorId),String((x as any).AdInstructorName||(x as any).Name||"")]));
  const collegeNames=new Map(colleges.map(x=>[Number(x.AdCollegeId),String(x.AdCollegeName||"")]));
  const sectionNames=new Map(sections.map(x=>[Number(x.AdSectionId),String(x.AdSectionName||"")]));
  const termNames=new Map(terms.map(x=>[Number(x.AdTermId),String((x as any).AdTermName||(x as any).TermName||"")]));
  const pending=rows.filter(row=>row.locationStatus==="PENDING_ROOM").map(row=>({id:row.id,AdCollegeId:row.AdCollegeId,collegeName:collegeNames.get(Number(row.AdCollegeId))||"",AdSectionId:row.AdSectionId,sectionName:sectionNames.get(Number(row.AdSectionId))||"",AdTermId:row.AdTermId,termName:termNames.get(Number(row.AdTermId))||"",AdInstructorId:row.AdInstructorId,instructorName:instructorNames.get(Number(row.AdInstructorId))||"",AdCourseId:row.AdCourseId,AdCourseName:row.AdCourseName,SCode:row.SCode,buildingId:row.buildingId,AdRoomCode:row.AdRoomCode,days:SCHEDULE_DAY_KEYS.filter(day=>Boolean((row as any)[day])),fstarttime:row.fstarttime,fendtime:row.fendtime}));
  const normalizedRegistry={...registry,rooms:registry.rooms.map(room=>({...room,shared:room.sectionIds.length>1,sharedConfidence:room.sectionIds.length>1?"CONFIRMED":room.sharedConfidence}))};
  res.json({...normalizedRegistry,reviewCases,runs,health:registryHealth(normalizedRegistry,rows,reviewCases),pending,colleges,sections,terms});
});
app.post("/api/admin/location-registry/buildings", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const collegeIds=locationIdList(req.body?.collegeIds);
  if(collegeIds.length!==1){res.status(400).json({error:"اختر كلية/موقعًا واحدًا للمبنى الجديد حتى لا تصبح هويته ملتبسة."});return;}
  const colleges=await Repository.getColleges();
  const college=colleges.find(item=>Number(item.AdCollegeId)===collegeIds[0]);
  if(!college){res.status(400).json({error:"الكلية المختارة غير موجودة."});return;}
  const sitePrefix=officialCollegeSitePrefix(college.AdCollegeName);
  if(!sitePrefix){res.status(409).json({error:"لا يوجد كود كلية/موقع رسمي مثبت لهذه الكلية. أضف الكود المرجعي أولًا بدل التخمين."});return;}
  const number=String(req.body?.buildingNumber||"").trim();
  const code=officialBuildingCode(sitePrefix,number);
  if(!code){res.status(400).json({error:"رقم المبنى غير صالح."});return;}
  const parsed=parseOfficialBuildingCode(code,sitePrefix);
  if(!parsed){res.status(400).json({error:"تعذر تكوين كود المبنى من Prefix الكلية ورقم المبنى."});return;}
  const registry=await readLocationRegistry();if(registry.buildings.some(x=>x.officialCode===code)){res.status(409).json({error:"المبنى موجود بالفعل"});return;}
  const now=new Date().toISOString();
  const row:MasterBuilding={id:`building_${code}`,officialCode:code,sitePrefix:parsed.sitePrefix,prefix:/^[0-9]{3}[A-Z]$/.test(parsed.sitePrefix)?parsed.sitePrefix.slice(0,3):parsed.sitePrefix,siteLetter:/[A-Z]$/.test(parsed.sitePrefix)?parsed.sitePrefix.slice(-1):"",buildingNumber:parsed.buildingNumber,siteName:String(req.body?.siteName||college.AdCollegeName||"").trim(),branchName:String(req.body?.branchName||college.AdCollegeName||"").trim(),description:String(req.body?.description||"").trim(),active:true,aliases:[],collegeIds,sectionIds:locationIdList(req.body?.sectionIds),historicalUsageCount:0,roomCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[`اعتماد يدوي من مدير النظام. Prefix الكلية الرسمي ${sitePrefix} + المبنى ${parsed.buildingNumber}.`],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.status(201).json(row);
});
app.put("/api/admin/location-registry/buildings/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.buildings.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"المبنى غير موجود"});return;}
  const requestedCollegeIds=req.body?.collegeIds===undefined?current.collegeIds:locationIdList(req.body.collegeIds);
  if(requestedCollegeIds.length){
    const colleges=await Repository.getColleges();
    for(const cid of requestedCollegeIds){
      const college=colleges.find(item=>Number(item.AdCollegeId)===Number(cid));const prefix=officialCollegeSitePrefix(college?.AdCollegeName);
      if(prefix&&!current.officialCode.startsWith(prefix)){res.status(409).json({error:`لا يمكن ربط ${current.officialCode} بكلية Prefix الرسمي لها ${prefix}.`});return;}
    }
  }
  const now=new Date().toISOString();
  const next={active:typeof req.body?.active==="boolean"?req.body.active:current.active,siteName:req.body?.siteName===undefined?current.siteName:String(req.body.siteName||"").trim(),branchName:req.body?.branchName===undefined?current.branchName:String(req.body.branchName||"").trim(),description:req.body?.description===undefined?current.description:String(req.body.description||"").trim(),collegeIds:requestedCollegeIds,sectionIds:req.body?.sectionIds===undefined?current.sectionIds:locationIdList(req.body.sectionIds),aliases:req.body?.aliases===undefined?current.aliases:locationAliases(req.body.aliases)};
  const row:MasterBuilding={...current,...next,id:current.id,officialCode:current.officialCode,confidence:"CONFIRMED",adminVerified:true,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:"UPDATE",before:{active:current.active,siteName:current.siteName,branchName:current.branchName,collegeIds:current.collegeIds,sectionIds:current.sectionIds},after:next}]};
  await Repository.upsertLocationBuildings([row]);invalidateLocationRegistry();res.json(row);
});
app.post("/api/admin/location-registry/rooms", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const building=registry.buildings.find(x=>x.id===String(req.body?.buildingId||"")&&x.active&&x.confidence==="CONFIRMED");if(!building){res.status(400).json({error:"اختر مبنى رسميًا وفعالًا"});return;}
  const code=String(req.body?.canonicalCode||"").trim().toUpperCase().replace(/\s+/g,"");if(!code||code===PENDING_ROOM||isInvalidLocationToken(code)||!/^[A-Z0-9]{1,12}$/.test(code)||!/\d/.test(code)){res.status(400).json({error:"رمز القاعة غير صالح ولا يمكن أن يكون Placeholder"});return;}
  const id=`room_${building.officialCode}_${code.replace(/[^A-Z0-9]/g,"_")}`;if(registry.rooms.some(x=>x.id===id||(x.buildingId===building.id&&x.canonicalCode===code))){res.status(409).json({error:"القاعة موجودة في هذا المبنى"});return;}
  const requestedRoomCollegeIds=req.body?.collegeIds===undefined?[...building.collegeIds]:locationIdList(req.body?.collegeIds);
  if(requestedRoomCollegeIds.some(id=>building.collegeIds.length&&!building.collegeIds.includes(id))){res.status(409).json({error:"لا يمكن ربط القاعة بكلية لا يتبع لها المبنى الرسمي."});return;}
  const roomCollegeIds=building.collegeIds.length?[...building.collegeIds]:requestedRoomCollegeIds;
  const now=new Date().toISOString();const sectionIds=locationIdList(req.body?.sectionIds),primarySectionIds=locationIdList(req.body?.primarySectionIds).filter(id=>sectionIds.includes(id));
  const shared=sectionIds.length>1;
  const row:MasterRoom={id,buildingId:building.id,buildingCode:building.officialCode,canonicalCode:code,active:true,aliases:[],collegeIds:roomCollegeIds,sectionIds,primarySectionIds,shared,sharedConfidence:"CONFIRMED",historicalUsageCount:0,confidence:"CONFIRMED",source:"ADMIN",adminVerified:true,evidence:[shared?"اعتماد إداري؛ مصنفة مشتركة تلقائيًا لارتباطها بأكثر من قسم.":"اعتماد يدوي من مدير النظام."],auditHistory:[{at:now,byUserId:req.user.SystemUserId,action:"CREATE"}],createdAt:now,updatedAt:now,lastVerifiedAt:now};
  await Repository.upsertLocationRooms([row]);invalidateLocationRegistry();res.status(201).json(row);
});
app.put("/api/admin/location-registry/rooms/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const current=registry.rooms.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"القاعة غير موجودة"});return;}
  const targetBuildingId=String(req.body?.newBuildingId||current.buildingId),targetBuilding=registry.buildings.find(x=>x.id===targetBuildingId&&x.active&&x.confidence==="CONFIRMED");if(!targetBuilding){res.status(400).json({error:"المبنى الهدف غير موجود أو غير فعال"});return;}
  if(targetBuildingId!==current.buildingId&&registry.rooms.some(x=>x.id!==current.id&&x.buildingId===targetBuildingId&&x.canonicalCode===current.canonicalCode)){res.status(409).json({error:"توجد قاعة بالرمز نفسه داخل المبنى الهدف"});return;}
  const sectionIds=req.body?.sectionIds===undefined?current.sectionIds:locationIdList(req.body.sectionIds);const primarySectionIds=(req.body?.primarySectionIds===undefined?(current.primarySectionIds||[]):locationIdList(req.body.primarySectionIds)).filter(id=>sectionIds.includes(id));
  const requestedRoomCollegeIds=req.body?.collegeIds===undefined?(targetBuildingId===current.buildingId?current.collegeIds:[...targetBuilding.collegeIds]):locationIdList(req.body.collegeIds);
  if(requestedRoomCollegeIds.some(id=>targetBuilding.collegeIds.length&&!targetBuilding.collegeIds.includes(id))){res.status(409).json({error:"لا يمكن نقل/ربط القاعة بكلية لا يتبع لها المبنى الهدف."});return;}
  const roomCollegeIds=targetBuilding.collegeIds.length?[...targetBuilding.collegeIds]:requestedRoomCollegeIds;
  const now=new Date().toISOString();const shared=sectionIds.length>1;const next={active:typeof req.body?.active==="boolean"?req.body.active:current.active,shared,collegeIds:roomCollegeIds,sectionIds,primarySectionIds,aliases:req.body?.aliases===undefined?current.aliases:locationAliases(req.body.aliases),buildingId:targetBuilding.id,buildingCode:targetBuilding.officialCode};
  const row:MasterRoom={...current,...next,id:current.id,canonicalCode:current.canonicalCode,confidence:"CONFIRMED",sharedConfidence:"CONFIRMED",adminVerified:true,updatedAt:now,lastVerifiedAt:now,auditHistory:[...(current.auditHistory||[]),{at:now,byUserId:req.user.SystemUserId,action:targetBuildingId===current.buildingId?"UPDATE":"MOVE_BUILDING",before:{buildingId:current.buildingId,buildingCode:current.buildingCode,active:current.active,shared:current.shared,collegeIds:current.collegeIds,sectionIds:current.sectionIds,primarySectionIds:current.primarySectionIds},after:next}]};
  let restorePointId:string|undefined;
  if(targetBuildingId!==current.buildingId){
    const restore=await Repository.createSystemRestorePoint(`قبل نقل القاعة ${current.canonicalCode} إلى ${targetBuilding.officialCode}`,req.user.SystemUserId,ROOT_ADMIN_USER_ID);restorePointId=restore.id;
    const affected=(await Repository.getSchedules()).filter(schedule=>schedule.roomId===current.id);
    try{await Repository.upsertLocationRooms([row]);await Repository.applyLocationSchedulePatches(affected.map(schedule=>({id:schedule.id,fields:{buildingId:targetBuilding.id,AdRoomCode:targetBuilding.officialCode,locationStatus:"VERIFIED",locationResolvedAt:now}})));}
    catch(error){await Repository.upsertLocationRooms([current]);await Repository.applyLocationSchedulePatches(affected.map(schedule=>({id:schedule.id,fields:{buildingId:current.buildingId,AdRoomCode:current.buildingCode,locationStatus:schedule.locationStatus,locationResolvedAt:schedule.locationResolvedAt}})));throw error;}
  }else await Repository.upsertLocationRooms([row]);
  invalidateLocationRegistry();res.json({...row,restorePointId});
});
app.put("/api/admin/location-registry/review/:id", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  const cases=await Repository.getLocationReviewCases();const current=cases.find(x=>x.id===req.params.id);if(!current){res.status(404).json({error:"حالة المراجعة غير موجودة"});return;}
  const requested=String(req.body?.status||"");if(!["open","resolved","ignored"].includes(requested)){res.status(400).json({error:"حالة المراجعة غير صالحة"});return;}const resolution=String(req.body?.resolution||"").trim();if(requested==="resolved"&&!resolution){res.status(400).json({error:"اكتب قرار الإدارة قبل إغلاق الحالة"});return;}
  const row:LocationReviewCase={...current,status:requested as any,resolution:resolution||current.resolution,resolvedAt:requested==="open"?undefined:new Date().toISOString(),resolvedBy:requested==="open"?undefined:req.user.SystemUserId};await Repository.upsertLocationReviewCases([row]);res.json(row);
});
app.get("/api/admin/location-registry/migration/preview", requirePermission(7), requirePowerAdmin, async (_req:AuthenticatedRequest,res:Response)=>{
  const registry=await readLocationRegistry();const rows=await Repository.getSchedules();const plan=buildMigrationPlan(rows,registry,"preview");res.json({version:plan.version,stats:plan.stats,details:plan.details,reviewSeed:seedRegistry().reviewCases.length});
});
app.post("/api/admin/location-registry/migration/apply", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  if(req.get("x-schedule-confirm")!=="initialize-location-registry"){res.status(409).json({error:"يتطلب التهيئة تأكيداً صريحاً"});return;}
  const runs=await Repository.getLocationMigrationRuns();const done=runs.find(x=>x.version===LOCATION_MIGRATION_VERSION&&x.status==="completed");if(done){res.json({success:true,alreadyInitialized:true,run:done});return;}
  const restore=await Repository.createSystemRestorePoint("قبل تهيئة سجل المباني والقاعات",req.user.SystemUserId,ROOT_ADMIN_USER_ID);const seed=seedRegistry();await Promise.all([Repository.upsertLocationBuildings(seed.buildings),Repository.upsertLocationRooms(seed.rooms),Repository.upsertLocationReviewCases(seed.reviewCases)]);invalidateLocationRegistry();
  const registry=await readLocationRegistry(true);const rows=await Repository.getSchedules();const run=newMigrationRun(req.user.SystemUserId,{},restore.id);const plan=buildMigrationPlan(rows,registry,run.id);run.stats=plan.stats;await Repository.saveLocationMigrationRun(run);
  try{await Repository.applyLocationSchedulePatches(plan.patches);await Repository.appendLocationMigrationLogs(plan.logs);run.status="completed";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);res.json({success:true,run});}
  catch(error:any){
    try{await Repository.applyLocationSchedulePatches(plan.logs.map(log=>({id:log.scheduleId,fields:rollbackPatch(log)})));}catch(rollbackError){console.error("Location migration emergency rollback failed",rollbackError);}
    run.status="failed";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);throw error;
  }
});
app.post("/api/admin/location-registry/migration/:id/rollback", requirePermission(7), requirePowerAdmin, async (req:AuthenticatedRequest,res:Response)=>{
  if(req.get("x-schedule-confirm")!=="rollback-location-registry"){res.status(409).json({error:"يتطلب التراجع تأكيداً صريحاً"});return;}
  const runs=await Repository.getLocationMigrationRuns();const run=runs.find(x=>x.id===req.params.id);if(!run){res.status(404).json({error:"تشغيل المهاجرة غير موجود"});return;}if(run.status==="rolled_back"){res.json({success:true,alreadyRolledBack:true,run});return;}
  const logs=await Repository.getLocationMigrationLogs(run.id);await Repository.applyLocationSchedulePatches(logs.map(log=>({id:log.scheduleId,fields:rollbackPatch(log)})));run.status="rolled_back";run.completedAt=new Date().toISOString();await Repository.saveLocationMigrationRun(run);res.json({success:true,count:logs.length,run});
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
app.post("/api/schedules/replace-instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const fromId = Number(req.body?.fromInstructorId || 0);
  const toId = Number(req.body?.toInstructorId || 0);
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const commit = req.body?.commit === true;
  if (!fromId || !termId || !collegeId || !sectionId) { res.status(400).json({ error: "حدد الأستاذ والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (fromId === toId) { res.status(400).json({ error: "اختر أستاذاً بديلاً مختلفاً." }); return; }

  const [scopeRows, termRows, instructors] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId }),
    Repository.getInstructors(),
  ]);
  const rows = filterByScope(req, scopeRows).filter(row => Number(row.AdInstructorId) === fromId);
  const movedIds = new Set(rows.map(row => Number(row.id)));
  const candidates = rows.map(row => ({ ...row, AdInstructorId: toId || 0 }));
  const remaining = termRows.filter(row => !movedIds.has(Number(row.id)));
  const conflicts = toId
    ? findConflicts(candidates as any, [...remaining, ...candidates] as any)
        .filter((item:any) => item.severity === "high" || item.type === "duplicate")
        .filter((item:any) => movedIds.has(Number(item.rowId)) || movedIds.has(Number(item.otherId)))
        .slice(0, 20)
    : [];
  const reasons = [...new Set(conflicts.map((item:any) => String(item.message || item.detail || "يوجد تعارض زمني")))];
  const compatible = conflicts.length === 0;
  if (!commit) {
    res.json({ preview: true, affected: rows.length, compatible, conflicts, reasons, cleared: !toId });
    return;
  }
  if (!compatible) {
    res.status(409).json({ error: "لا يمكن الاستبدال بسبب تعارض في مواعيد الأستاذ البديل.", compatible: false, conflicts, issues: reasons });
    return;
  }
  const fromName = instructors.find(i => Number(i.AdInstructorId) === fromId)?.AdInstructorName || `أستاذ ${fromId}`;
  const toName = toId ? (instructors.find(i => Number(i.AdInstructorId) === toId)?.AdInstructorName || `أستاذ ${toId}`) : "بلا أستاذ";
  const undoVersion = await captureScopeVersion(req, collegeId, sectionId, termId, `قبل استبدال الأستاذ: ${fromName} ← ${toName}`, "manual");
  for (const row of rows) await Repository.updateSchedule(row.id, { AdInstructorId: toId || 0 } as any);
  res.json({ preview: false, moved: rows.length, cleared: !toId, compatible: true, undoVersionId: undoVersion?.id });
});

app.get("/api/schedules/replace-instructor/history", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const versions = await Repository.getScheduleVersions(collegeId, sectionId, termId, 80);
  res.json(versions
    .filter(v => String(v.label || "").startsWith("قبل استبدال الأستاذ:"))
    .slice(0, 20)
    .map(v => ({ id: v.id, label: v.label, createdAt: v.createdAt, userName: v.userName, rowCount: Number(v.rowCount ?? v.rows.length) })));
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

  const [universe, mobility, registry, barterRequests] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getCampusMobilityProfile(collegeId),
    readLocationRegistry(),
    Repository.getHallBarterRequests(termId),
  ]);
  const live = universe.filter(row => Number(row.id) !== excludeId);
  const sectionRows = live.filter(row => row.AdCollegeId === collegeId && row.AdSectionId === sectionId);

  // Suggestions use exactly the same permission surface as the picker: rooms
  // assigned to this department plus rooms explicitly borrowed for this term.
  const borrowedRoomIds=new Set(barterRequests.filter(request=>request.status==="approved"&&Number(request.requesterCollegeId)===collegeId&&Number(request.requesterSectionId)===sectionId&&request.roomId).map(request=>String(request.roomId)));
  const eligibleRooms=registry.rooms.filter(room=>room.active&&room.confidence==="CONFIRMED"&&(room.sectionIds.includes(sectionId)||borrowedRoomIds.has(room.id)));
  const eligibleBuildingIds=new Set(eligibleRooms.map(room=>room.buildingId));
  const buildingById=new Map(registry.buildings.filter(building=>building.active&&building.confidence==="CONFIRMED"&&eligibleBuildingIds.has(building.id)).map(building=>[building.id,building]));
  const halls=eligibleRooms
    .filter(room=>buildingById.has(room.buildingId))
    .map(room=>({room:buildingById.get(room.buildingId)!.officialCode,hall:room.canonicalCode,buildingId:room.buildingId,roomId:room.id,shared:room.sectionIds.length>1}));
  if (!halls.length) { res.json({ slots: [], note: "لا توجد قاعات رسمية متاحة لهذا القسم في سجل المباني والقاعات" }); return; }

  const DAY_START = SCHEDULE_DAY_START, DAY_END = SCHEDULE_DAY_END, STEP = SCHEDULE_SLOT_MINUTES;
  const busy = (rows: any[], dayKey: string, from: number, to: number) =>
    rows.some(row => Boolean(row[dayKey]) && timeToMinutes(row.fstarttime) < to && timeToMinutes(row.fendtime) > from);

  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const instructorRows = instructorId ? live.filter(row => Number(row.AdInstructorId) === instructorId) : [];

  const candidates: any[] = [];
  for (let start = DAY_START; start + duration <= DAY_END; start += STEP) {
    const end = start + duration;
    for (const hall of halls) {
      const hallRows = live.filter(row => row.roomId && String(row.roomId)===hall.roomId);
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
      else reasons.push(`فراغ ${countOf(Math.round(idle / perDay), AR.minute)}`);
      if (walk === 0) reasons.push("بلا انتقال بين المباني");
      else reasons.push(`انتقال ${Math.round(walk / perDay)} دقيقة`);
      if (spread === 0) reasons.push("داخل يوم القسم الحالي");

      candidates.push({
        start: clock(start), end: clock(end),
        room: hall.room, hall: hall.hall, buildingId: hall.buildingId, roomId: hall.roomId,
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

/* ── استثناءات الأسبوع ────────────────────────────────────────────────────────
   Dated facts OVER an appointment: cancelled THIS date, covered THIS date.
   They never touch the FSchedule row, its rev, its conflicts or its history —
   which is what makes them safe to record and safe to delete. The calendar
   subscriptions read them, so a phone follows reality without anyone sending
   anything. */

const WEEK_EXCEPTION_DATE = /^\d{4}-\d{2}-\d{2}$/;

function weekExceptionDayKey(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getUTCDay();
  return day >= 0 && day <= 4 ? SCHEDULE_DAY_KEYS[day] : null;
}

async function readScheduleForException(req: AuthenticatedRequest, res: Response): Promise<FSchedule | null> {
  const id = Number(req.params.id || 0);
  const row = await Repository.getScheduleById(id);
  if (!row) { res.status(404).json({ error: "الموعد غير موجود" }); return null; }
  if (!isScopeAllowed(req, row.AdCollegeId, row.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return null; }
  return row;
}

app.get("/api/schedules/:id/exceptions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const list = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  res.json({ exceptions: list });
});

app.post("/api/schedules/:id/exceptions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const body = req.body || {};
  const date = String(body.date || "").trim();
  const kind = body.kind === "cover" ? "cover" : body.kind === "cancel" ? "cancel" : null;
  if (!WEEK_EXCEPTION_DATE.test(date)) { res.status(400).json({ error: "حدد التاريخ بصيغة YYYY-MM-DD" }); return; }
  if (!kind) { res.status(400).json({ error: "نوع الاستثناء إما إلغاء أو تغطية" }); return; }
  const dayKey = weekExceptionDayKey(date);
  if (!dayKey || !(row as any)[dayKey]) {
    res.status(400).json({ error: "هذا الموعد لا يُعقد في اليوم المحدد أصلاً" });
    return;
  }
  const existing = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  if (existing.some(item => item.date === date)) {
    res.status(409).json({ error: "يوجد استثناء مسجل لهذا اليوم بالفعل — احذفه أولاً إن أردت تغييره" });
    return;
  }
  let coverInstructorId: number | undefined;
  let coverInstructorName: string | undefined;
  if (kind === "cover") {
    coverInstructorId = Number(body.coverInstructorId || 0) || undefined;
    if (!coverInstructorId) { res.status(400).json({ error: "حدد الأستاذ الذي يغطي المحاضرة" }); return; }
    if (coverInstructorId === Number(row.AdInstructorId)) { res.status(400).json({ error: "التغطية تكون بأستاذ آخر غير أستاذ الشعبة" }); return; }
    const person = (await Repository.getInstructors()).find(item => item.AdInstructorId === coverInstructorId);
    if (!person) { res.status(404).json({ error: "الأستاذ البديل غير موجود" }); return; }
    coverInstructorName = person.AdInstructorName;
  }
  const created = await Repository.createScheduleWeekException({
    scheduleId: Number(row.id),
    AdCollegeId: Number(row.AdCollegeId),
    AdSectionId: Number(row.AdSectionId),
    AdTermId: Number(row.AdTermId),
    date, kind,
    coverInstructorId, coverInstructorName,
    note: String(body.note || "").slice(0, 240) || undefined,
    SystemUserId: Number(req.user!.SystemUserId),
    userName: String(req.user!.Name || ""),
  });
  res.status(201).json(created);
});

app.delete("/api/schedules/:id/exceptions/:exceptionId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const entry = await Repository.getScheduleWeekExceptionById(String(req.params.exceptionId || ""));
  if (!entry || Number(entry.scheduleId) !== Number(row.id)) { res.status(404).json({ error: "الاستثناء غير موجود" }); return; }
  await Repository.deleteScheduleWeekException(entry.id);
  res.json({ ok: true });
});

/* ── بديل اليوم ───────────────────────────────────────────────────────────────
   An instructor apologises for TODAY. Term-level emergency plans exist for a
   lost teacher; this answers the smaller, daily question: who can cover this
   one lecture on this one date? Free at that hour, has taught this very course
   before, already on campus that day. The answer is a ranked list and a
   pre-written WhatsApp opener — the system itself sends nothing. */

app.get("/api/schedules/:id/substitutes", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const row = await readScheduleForException(req, res);
  if (!row) return;
  const date = String(req.query.date || "").trim();
  if (!WEEK_EXCEPTION_DATE.test(date)) { res.status(400).json({ error: "حدد التاريخ بصيغة YYYY-MM-DD" }); return; }
  const dayKey = weekExceptionDayKey(date);
  if (!dayKey || !(row as any)[dayKey]) { res.status(400).json({ error: "هذا الموعد لا يُعقد في اليوم المحدد" }); return; }

  const [instructors, termRows, collegeHistory] = await Promise.all([
    Repository.getInstructors(),
    Repository.getSchedulesByScope({ termId: Number(row.AdTermId) }),
    Repository.getSchedulesByScope({ collegeId: Number(row.AdCollegeId) }),
  ]);
  const start = timeToMinutes(row.fstarttime), end = timeToMinutes(row.fendtime);
  const overlapsSlot = (item: FSchedule) =>
    Boolean((item as any)[dayKey]) && timeToMinutes(item.fstarttime) < end && timeToMinutes(item.fendtime) > start;

  const rowsByInstructor = new Map<number, FSchedule[]>();
  for (const item of termRows) {
    const key = Number(item.AdInstructorId);
    if (!rowsByInstructor.has(key)) rowsByInstructor.set(key, []);
    rowsByInstructor.get(key)!.push(item);
  }
  const taughtTermsByInstructor = new Map<number, Set<number>>();
  for (const item of collegeHistory) {
    if (Number(item.AdCourseId) !== Number(row.AdCourseId)) continue;
    const key = Number(item.AdInstructorId);
    if (!taughtTermsByInstructor.has(key)) taughtTermsByInstructor.set(key, new Set());
    taughtTermsByInstructor.get(key)!.add(Number(item.AdTermId));
  }

  const candidates = instructors
    .filter(person => person.AdInstructorId !== Number(row.AdInstructorId))
    .filter(person => !person.AdInstructorStatus)
    .map(person => {
      const mine = rowsByInstructor.get(person.AdInstructorId) || [];
      if (mine.some(overlapsSlot)) return null;
      const taughtTerms = taughtTermsByInstructor.get(person.AdInstructorId)?.size || 0;
      const inSection = mine.some(item =>
        Number(item.AdCollegeId) === Number(row.AdCollegeId) && Number(item.AdSectionId) === Number(row.AdSectionId));
      // Only people teaching somewhere this term — or with real history on this
      // course — are candidates: the full university register is not a rolodex.
      if (!mine.length && !taughtTerms) return null;
      const sameDayRows = mine.filter(item => Boolean((item as any)[dayKey]));
      const sameBuildingKey=buildingIdentityKey(row);
      const sameBuilding = Boolean(sameBuildingKey)&&sameDayRows.some(item => buildingIdentityKey(item)===sameBuildingKey);
      const loadMinutes = mine.reduce((sum, item) => {
        const perMeeting = Math.max(0, timeToMinutes(item.fendtime) - timeToMinutes(item.fstarttime));
        return sum + perMeeting * SCHEDULE_DAY_KEYS.filter(key => Boolean((item as any)[key])).length;
      }, 0);
      const reasons: string[] = [];
      if (taughtTerms) reasons.push(`درّس هذا المقرر في ${countOf(taughtTerms, AR.term)}`);
      if (inSection) reasons.push("من أساتذة القسم هذا الفصل");
      if (sameBuilding) reasons.push("موجود في نفس المبنى ذلك اليوم");
      else if (sameDayRows.length) reasons.push("لديه محاضرات في نفس اليوم");
      if (!reasons.length) reasons.push("متفرغ في هذا الوقت");
      const score =
        (taughtTerms ? 50 + Math.min(12, taughtTerms * 2) : 0) +
        (inSection ? 20 : 0) +
        (sameBuilding ? 10 : sameDayRows.length ? 6 : 0) +
        Math.max(0, 10 - Math.round(loadMinutes / 60));
      return {
        id: person.AdInstructorId,
        name: person.AdInstructorName,
        mobile: person.AdInstructorMobile || "",
        score, taughtTerms, inSection, sameDay: sameDayRows.length > 0, sameBuilding,
        reasons: reasons.slice(0, 3),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score || String(a.name).localeCompare(String(b.name), "ar"))
    .slice(0, 12);

  const exceptions = await Repository.getScheduleWeekExceptions(Number(row.AdTermId), Number(row.id));
  res.json({
    date, dayKey,
    lecture: {
      id: row.id, course: row.AdCourseName, section: row.SCode,
      start: row.fstarttime, end: row.fendtime,
      room: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join(" / "),
      instructorId: row.AdInstructorId,
    },
    candidates,
    exceptions,
  });
});

/* ── متى نلتقي؟ ──────────────────────────────────────────────────────────────
   The committee question every department asks weekly. Choose the people; the
   term's own schedule already knows when each of them teaches. Free windows
   are computed on the same 30-minute grid as the board, merged into ranges,
   and ranked. Nothing is revealed beyond busy/free for people the caller
   chose by name. */

app.post("/api/schedules/meeting-slots", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const termId = Number(body.termId || 0);
  const duration = Math.max(30, Math.min(180, Number(body.durationMinutes || 60)));
  const ids = Array.from(new Set((Array.isArray(body.instructorIds) ? body.instructorIds : []).map((value: unknown) => Number(value)).filter((value: number) => value > 0))) as number[];
  if (!termId) { res.status(400).json({ error: "حدد الفصل الدراسي" }); return; }
  if (ids.length < 2) { res.status(400).json({ error: "اختر أستاذين على الأقل" }); return; }

  const [termRows, instructors] = await Promise.all([
    Repository.getSchedulesByScope({ termId }),
    Repository.getInstructors(),
  ]);
  const nameById = new Map(instructors.map(person => [person.AdInstructorId, person.AdInstructorName]));
  const rowsByInstructor = new Map<number, FSchedule[]>(ids.map(id => [id, []]));
  for (const item of termRows) {
    const key = Number(item.AdInstructorId);
    if (rowsByInstructor.has(key)) rowsByInstructor.get(key)!.push(item);
  }

  const STEP = SCHEDULE_SLOT_MINUTES;
  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const days = SCHEDULE_DAY_KEYS.map((dayKey, index) => {
    const busyAt = (from: number, to: number) => ids.filter(id =>
      (rowsByInstructor.get(id) || []).some(item =>
        Boolean((item as any)[dayKey]) && timeToMinutes(item.fstarttime) < to && timeToMinutes(item.fendtime) > from));

    const free: { start: string; end: string; minutes: number; startMinutes: number }[] = [];
    const nearMiss: { start: string; end: string; busy: string[] }[] = [];
    let runStart = -1;
    for (let start = SCHEDULE_DAY_START; start + duration <= SCHEDULE_DAY_END; start += STEP) {
      const busy = busyAt(start, start + duration);
      if (!busy.length) {
        if (runStart < 0) runStart = start;
      } else {
        if (runStart >= 0) {
          free.push({ start: clock(runStart), end: clock(runStart === start - STEP ? runStart + duration : start - STEP + duration), minutes: (start - STEP - runStart) + duration, startMinutes: runStart });
          runStart = -1;
        }
        if (busy.length === 1) {
          const last = nearMiss[nearMiss.length - 1];
          const name = nameById.get(busy[0]) || "زميل";
          if (last && last.end === clock(start - STEP + duration) && last.busy[0] === name) last.end = clock(start + duration);
          else nearMiss.push({ start: clock(start), end: clock(start + duration), busy: [name] });
        }
      }
    }
    if (runStart >= 0) {
      const lastStart = SCHEDULE_DAY_END - duration;
      free.push({ start: clock(runStart), end: clock(lastStart + duration), minutes: (lastStart - runStart) + duration, startMinutes: runStart });
    }
    return { dayKey, label: DAY_LABELS[index], free, nearMiss: nearMiss.slice(0, 3) };
  });

  /* Best pick: everyone free, longest run first, then closest to mid-morning —
     a committee meets where the day has room, not at 19:00. */
  const best = days
    .flatMap(day => day.free.map(range => ({ day: day.dayKey, label: day.label, ...range })))
    .sort((a, b) => b.minutes - a.minutes || Math.abs(a.startMinutes - 600) - Math.abs(b.startMinutes - 600))[0] || null;

  res.json({
    duration,
    participants: ids.map(id => nameById.get(id) || `#${id}`),
    days: days.map(({ dayKey, label, free, nearMiss }) => ({ dayKey, label, free: free.map(({ start, end, minutes }) => ({ start, end, minutes })), nearMiss })),
    best: best ? { day: best.day, label: best.label, start: best.start, end: best.end } : null,
  });
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

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !req.body?.buildingId || (!req.body?.roomId && req.body?.locationStatus !== PENDING_ROOM)) {
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
  const locationResult=await canonicalizeLocationForWrite({...req.body,AdCollegeId:collegeId,AdSectionId:sectionId},collegeId,sectionId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  const canonicalBody={...req.body,...locationResult.check.canonical,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId};
  const conflicts=await scheduleConflicts(req,canonicalBody);
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
    AdRoomCode: String(canonicalBody.AdRoomCode || ""),
    AdRoomHall: String(canonicalBody.AdRoomHall || ""),
    buildingId: canonicalBody.buildingId,
    roomId: canonicalBody.roomId,
    locationStatus: canonicalBody.locationStatus,
    sourceBuildingText: req.body?.sourceBuildingText,
    sourceRoomText: req.body?.sourceRoomText,
    /* Explicit post-PDF provenance: manual rows live permanently in the green
       range. Later edits preserve this value, so they can never become yellow
       merely because course/section happens to match an old PDF row. */
    sourceOrder: Math.max(1_000_000, Date.now()),
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

  if (!AdCollegeId || !AdSectionId || !AdTermId || !AdCourseId || !SCode || !AdInstructorId || !fstarttime || !fendtime || !req.body?.buildingId || (!req.body?.roomId && req.body?.locationStatus !== PENDING_ROOM)) {
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
  if (existing.sourceOrder !== undefined && Number(existing.sourceOrder) < 1_000_000 && Number(existing.AdCourseId) !== courseId) {
    res.status(409).json({
      error: "أنت تحاول تبديل اسم مقرر وارد في الجدول المعتمد، وهذا مخالف للائحة نظام الجدول. يمكنك حذف المقرر كاملاً ثم إضافة مقرر جديد، لكن لا يمكن تغيير اسمه.",
      code: "COURSE_NAME_LOCKED",
    });
    return;
  }
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
  const locationResult=await canonicalizeLocationForWrite({...req.body,AdCollegeId:collegeId,AdSectionId:sectionId},collegeId,sectionId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues[0]?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  const canonicalBody={...req.body,...locationResult.check.canonical,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:courseId,AdInstructorId:instructorId};
  const conflicts=await scheduleConflicts(req,canonicalBody,id);
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
      AdRoomCode: String(canonicalBody.AdRoomCode || ""),
      AdRoomHall: String(canonicalBody.AdRoomHall || ""),
      buildingId: canonicalBody.buildingId,
      roomId: canonicalBody.roomId,
      locationStatus: canonicalBody.locationStatus,
      sourceBuildingText: req.body?.sourceBuildingText,
      sourceRoomText: req.body?.sourceRoomText,
      fdetail: legacyFDetail({ fsunday, fmonday, ftuesday, fwednesday, fthursday })
    },
    // The revision the editor was looking at, when they sent one. An older
    // client that sends nothing keeps the previous behaviour exactly.
    req.body?.rev === undefined || req.body?.rev === null ? undefined : Number(req.body.rev));
    // Hand the audit trail the sentence describing what actually moved.
    res.locals.auditChanges = describeScheduleChange(existing, updated) || undefined;
    res.json(updated);
  } catch (e: any) {
    if (e instanceof ScheduleRevisionConflict) {
      /* Not a failure to write — a refusal to overwrite. Both versions go back
         so the interface can show the reader what changed and let them decide,
         instead of silently discarding one person's work. */
      res.status(409).json({
        error: "تغيّر هذا الموعد أثناء عملك.",
        conflict: "revision",
        current: e.current,
        yours: {
          AdCourseId: courseId, SCode, AdInstructorId: instructorId,
          fsunday: !!fsunday, fmonday: !!fmonday, ftuesday: !!ftuesday,
          fwednesday: !!fwednesday, fthursday: !!fthursday,
          fstarttime, fendtime, AdRoomCode: AdRoomCode || "", AdRoomHall: AdRoomHall || "",
        },
      });
      return;
    }
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
    res.locals.auditChanges = `حُذف: ${sched.AdCourseName || "موعد"} · شعبة ${sched.SCode} · ${formatScheduleTimeRange(sched.fstarttime, sched.fendtime)} · ${sched.AdRoomCode}/${sched.AdRoomHall}`;
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
  res.json({sourceCount:source.length,targetCount:target.length,sourceIssues,canCopy:source.length>0&&target.length===0&&!sourceIssues.length,preview:source.slice(0,12).map(row=>({id:row.id,courseCode:courseById.get(row.AdCourseId)?.CourseCode||"",courseName:courseById.get(row.AdCourseId)?.CourseName||row.AdCourseName||"",sectionCode:row.SCode,instructorName:instructorById.get(row.AdInstructorId)?.AdInstructorName||"",time:formatScheduleTimeRange(row.fstarttime, row.fendtime),room:`${row.AdRoomCode}/${row.AdRoomHall}`}))});
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
  const copyIssues = await validateSmartRows(copiedRows, collegeId, sectionId, { resolveHistorical: true });
  if (copyIssues.length) {
    res.status(400).json({ error: "لا يمكن نسخ الجدول قبل معالجة بياناته", issues: copyIssues });
    return;
  }

  const targetRows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId: targetTermId });
  if(targetRows.length){res.status(409).json({error:"يوجد جدول بالفعل في الفصل المستهدف"});return;}
  const undoVersion = await captureScopeVersion(req, collegeId, sectionId, targetTermId, "قبل نسخ الفصل الدراسي", "copy");
  const written = await Repository.replaceScheduleScope(collegeId, sectionId, targetTermId, copiedRows as FSchedule[]);
  res.json({ success: true, count: written.length, message: "تم نسخ الفصل الدراسي بالقيم الرسمية للمباني والقاعات", undoVersion: undoVersion ? { id: undoVersion.id, label: undoVersion.label } : null });
});

// --- SMART SCHEDULE WORKSPACE (additive; legacy schedule endpoints remain unchanged) ---

app.post("/api/telemetry/client", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const incoming = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 20) : [];
  if (!incoming.length) { res.json({ accepted: 0 }); return; }
  const safe = incoming.map((item:any) => {
    const collegeId = Number(item?.collegeId || item?.AdCollegeId || 0);
    const sectionId = Number(item?.sectionId || item?.AdSectionId || 0);
    const termId = Number(item?.termId || item?.AdTermId || 0);
    if (collegeId && sectionId && !isScopeAllowed(req, collegeId, sectionId)) return null;
    const kind = ["api","error","offline","sync","guide"].includes(String(item?.kind)) ? String(item.kind) : "error";
    return {
      SystemUserId: kind === "guide" ? 0 : Number(req.user.SystemUserId),
      userName: kind === "guide" ? "" : String(req.user.Name || req.user.SystemUserLogin || ""),
      AdCollegeId: collegeId || undefined,
      AdSectionId: sectionId || undefined,
      AdTermId: termId || undefined,
      kind: kind as any,
      name: String(item?.name || "unknown").slice(0, 140),
      durationMs: Number.isFinite(Number(item?.durationMs)) ? Math.max(0, Math.min(120000, Math.round(Number(item.durationMs)))) : undefined,
      status: Number.isFinite(Number(item?.status)) ? Number(item.status) : undefined,
      ok: typeof item?.ok === "boolean" ? item.ok : undefined,
      message: String(item?.message || "").slice(0, 320) || undefined,
      timestamp: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.timestamp || "")) ? String(item.timestamp) : new Date().toISOString(),
      breadcrumbs: Array.isArray(item?.breadcrumbs) ? item.breadcrumbs.slice(-12).map((b:any)=>({ at:String(b?.at||"").slice(0,40), action:String(b?.action||"").slice(0,90) })) : undefined,
    };
  }).filter(Boolean) as any[];
  const accepted = await Repository.createClientTelemetry(safe);
  res.json({ accepted });
});

type GuideIntentPayload = {
  goal: string;
  entities: { selectedId?: number; course?: string; day?: string; time?: string; room?: string; instructor?: string; instructorId?: number };
  constraints: { keepInstructor?: boolean; keepRoom?: boolean; findAlternativeRoom?: boolean };
  requestedAction: "explain" | "navigate" | "prepare" | "simulate" | "execute" | "unknown";
  confidence: number;
  compound: boolean;
  source: "rules" | "ai";
  clarification?: string;
};

function deterministicGuideIntent(question: string): GuideIntentPayload {
  const parsed = parseStructuredGuideIntent(question);
  return {
    goal: parsed.goal,
    entities: { ...parsed.entities },
    constraints: { ...parsed.constraints },
    requestedAction: parsed.requestedAction,
    confidence: parsed.confidence,
    compound: parsed.compound,
    source: "rules",
    clarification: parsed.clarification,
  };
}

/**
 * One permission predicate for every guide path, including the optional server
 * intent fallback. The server resolves the same registry feature used by the
 * drawer/search/routines, so adminOnly/rootOnly cannot drift between clients
 * and the fallback endpoint after a permission change.
 */
function serverCanExposeGuideFeature(req: AuthenticatedRequest, id: string) {
  const feature = featureById(String(id || ""));
  if (!feature) return false;
  return canAccessGuideFeature(feature, {
    permissions: (req.permissions || []).map(Number),
    root: Number(req.user?.SystemUserId || 0) === ROOT_ADMIN_USER_ID,
    admin: isPowerUser(req),
  });
}


async function requestGuideAIIntent(payload:{question:string;context:any;allowedFeatureIds:string[];fallback:any}) {
  const customEndpoint = String(process.env.GUIDE_AI_ENDPOINT || "").trim();
  const openAIKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!customEndpoint && !openAIKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    if (customEndpoint) {
      const response = await fetch(customEndpoint, {
        method:"POST",
        headers:{"Content-Type":"application/json",...(process.env.GUIDE_AI_BEARER_TOKEN?{Authorization:`Bearer ${process.env.GUIDE_AI_BEARER_TOKEN}`}:{})},
        signal:controller.signal,
        body:JSON.stringify({
          model:String(process.env.GUIDE_AI_MODEL || "").trim() || undefined,
          task:"استخرج نية استخدام SCHEDULE فقط. أعد JSON منظمًا دون تنفيذ أي إجراء. للميزات العامة استخدم goal بصيغة feature:<allowedFeatureId> فقط من القائمة المسموحة. اجعل أي clarification باللغة العربية الفصحى.",
          question:payload.question, context:payload.context, allowedFeatureIds:payload.allowedFeatureIds,
          schema:{goal:"string",entities:"object",constraints:"object",requestedAction:"explain|navigate|prepare|simulate|execute|unknown",confidence:"0..1",clarification:"Arabic Fusha optional"},
        }),
      });
      if (!response.ok) return null;
      const data:any = await response.json().catch(()=>null);
      return data?.intent || data || null;
    }

    const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    const model = String(process.env.OPENAI_GUIDE_MODEL || process.env.GUIDE_AI_MODEL || "gpt-5-mini").trim();
    const system = [
      "أنت محلل نية لمرشد استخدام نظام جامعي اسمه SCHEDULE.",
      "افهم العربية الفصحى واللهجة الكويتية، لكن لا تكتب أي رد عامي.",
      "لا تنفذ شيئًا ولا تخترع صلاحيات أو ميزات غير موجودة.",
      "أعد كائن JSON فقط بالمفاتيح: goal, entities, constraints, requestedAction, confidence, compound, clarification.",
      "requestedAction واحد من explain,navigate,prepare,simulate,execute,unknown.",
      "للأهداف غير الأربعة المتخصصة استخدم goal بصيغة feature:<id>، ويجب أن يكون id موجودًا حرفيًا في allowedFeatureIds.",
      "confidence رقم بين 0 و1. إذا لم تكن متأكدًا استخدم clarification فصيحة ومختصرة.",
    ].join("\n");
    const userPayload = JSON.stringify({ question:payload.question, context:payload.context, allowedFeatureIds:payload.allowedFeatureIds, deterministicHint:payload.fallback });
    const response = await fetch(`${base}/responses`, {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${openAIKey}`},
      signal:controller.signal,
      body:JSON.stringify({ model, input:[{role:"system",content:[{type:"input_text",text:system}]},{role:"user",content:[{type:"input_text",text:userPayload}]}], max_output_tokens:450 }),
    });
    if (!response.ok) return null;
    const data:any = await response.json().catch(()=>null);
    const outputText = String(data?.output_text || (Array.isArray(data?.output) ? data.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((part:any)=>part?.text||part?.output_text||"").join("") : "") || "").trim();
    if (!outputText) return null;
    const clean = outputText.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/guide/intent", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const question = String(req.body?.question || "").trim().slice(0, 420);
  if (!question) { res.status(400).json({ error: "اكتب ما تريد إنجازه أولًا." }); return; }
  const clientAllowed = Array.isArray(req.body?.allowedFeatureIds) ? req.body.allowedFeatureIds.map((id:any) => String(id)).slice(0, 100) : [];
  const allowedFeatureIds = clientAllowed.filter(id => serverCanExposeGuideFeature(req, id));
  const context = req.body?.context && typeof req.body.context === "object" ? {
    view: String(req.body.context.view || "").slice(0, 60),
    currentFeatureId: String(req.body.context.currentFeatureId || "").slice(0, 100),
    selected: req.body.context.selected ? { id: Number(req.body.context.selected.id || 0), course: String(req.body.context.selected.course || "").slice(0, 100) } : null,
    currentTask: req.body.context.currentTask ? { title: String(req.body.context.currentTask.title || "").slice(0, 120), featureId: String(req.body.context.currentTask.featureId || "").slice(0, 100) } : null,
    currentError: String(req.body.context.currentError || "").slice(0, 220),
  } : {};
  let intent = deterministicGuideIntent(question);
  if (intent.confidence < .72 || intent.compound) {
    const candidate:any = await requestGuideAIIntent({ question, context, allowedFeatureIds, fallback:intent });
    const allowedActions = new Set(["explain","navigate","prepare","simulate","execute","unknown"]);
    if (candidate && typeof candidate === "object" && Number(candidate.confidence) >= Number(intent.confidence)) {
      const requestedAction = allowedActions.has(String(candidate.requestedAction || "")) ? String(candidate.requestedAction) : intent.requestedAction;
      intent = {
        ...intent,
        ...candidate,
        requestedAction: requestedAction as any,
        entities: { ...intent.entities, ...(candidate.entities || {}) },
        constraints: { ...intent.constraints, ...(candidate.constraints || {}) },
        confidence: Math.max(0, Math.min(1, Number(candidate.confidence || 0))),
        compound: Boolean(candidate.compound ?? intent.compound),
        source: "ai",
        clarification: String(candidate.clarification || intent.clarification || "").slice(0, 220) || undefined,
      };
    }
  }
  const proposedFeature = featureIdForGuideIntentGoal(intent.goal);
  if (intent.goal !== "unknown" && !proposedFeature) {
    intent = { ...intent, goal:"unknown", requestedAction:"explain", confidence:.35, clarification:"لم أتمكن من ربط الطلب بميزة معروفة في SCHEDULE. حدّد ما تريد الوصول إليه وسأقترح الأقرب.", source:intent.source };
  } else if (proposedFeature && !allowedFeatureIds.includes(proposedFeature)) {
    intent = { ...intent, goal:"unknown", requestedAction:"explain", confidence:.35, clarification:"هذه العملية غير متاحة ضمن صلاحياتك الحالية.", source:intent.source };
  }
  res.json({ intent, minimalContext:true, rawHistorySent:false });
});

app.get("/api/intelligence/guide-friction", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if (Number(req.user?.SystemUserId || 0) !== ROOT_ADMIN_USER_ID) { res.status(403).json({ error: "هذه القراءة مخصصة لإدارة النظام الرئيسية" }); return; }
  const collegeId=Number(req.query.collegeId||0), sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج نطاقك المسموح"});return;}
  const rows=await Repository.getClientTelemetry(collegeId,sectionId,1800).catch(()=>[]);
  const now=Date.now(), day=24*60*60*1000, cutoff=now-30*day, previousCutoff=now-60*day;
  const counts=new Map<string,number>();
  type FrictionAggregate={feature:string;version:number;step:string;attempt:number;completed:number;failed:number;abandoned:number;helped:number;resolvedAfterHelp:number;previousFailed:number;previousTotal:number};
  const structured=new Map<string,FrictionAggregate>();
  rows.filter(item=>item.kind==="guide"&&Date.parse(item.timestamp)>=previousCutoff).forEach(item=>{
    const name=String(item.name||"نقطة تعثر").slice(0,140);
    const stamp=Date.parse(item.timestamp);
    if(stamp>=cutoff)counts.set(name,(counts.get(name)||0)+1);
    if(!name.startsWith("journey|"))return;
    const [,feature="unknown",versionText="0",step="journey",outcome="attempt"]=name.split("|");
    const key=`${feature}|${versionText}|${step}`;
    const value=structured.get(key)||{feature,version:Number(versionText)||0,step,attempt:0,completed:0,failed:0,abandoned:0,helped:0,resolvedAfterHelp:0,previousFailed:0,previousTotal:0};
    if(stamp>=cutoff){
      if(outcome==="attempt"||outcome==="started")value.attempt++;
      if(outcome==="completed"||outcome==="resolvedAfterHelp")value.completed++;
      if(outcome==="resolvedAfterHelp")value.resolvedAfterHelp++;
      if(outcome==="failed")value.failed++;
      if(outcome==="abandoned")value.abandoned++;
      if(outcome==="helped")value.helped++;
    } else {
      value.previousTotal++;
      if(outcome==="failed"||outcome==="abandoned")value.previousFailed++;
    }
    structured.set(key,value);
  });
  const insights=[...structured.values()].map(value=>{
    const total=Math.max(1,value.attempt+value.completed+value.failed+value.abandoned);
    const failureRate=(value.failed+value.abandoned)/total;
    const previousRate=value.previousTotal?value.previousFailed/value.previousTotal:0;
    return{featureId:value.feature,version:value.version,step:value.step,attempt:value.attempt,completed:value.completed,failed:value.failed,abandoned:value.abandoned,helped:value.helped,resolvedAfterHelp:value.resolvedAfterHelp,failureRate:Number(failureRate.toFixed(3)),abandonRate:Number((value.abandoned/total).toFixed(3)),helpRate:Number((value.helped/total).toFixed(3)),helpToSuccessRate:Number((value.resolvedAfterHelp/Math.max(1,value.helped)).toFixed(3)),changeVsPrevious:Number((failureRate-previousRate).toFixed(3))};
  }).sort((a,b)=>(b.failureRate+b.helpRate*.35)-(a.failureRate+a.helpRate*.35)).slice(0,12);
  const items=[...counts.entries()].map(([name,count])=>({name,count})).filter(item=>!item.name.startsWith("journey|")).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"ar")).slice(0,8);
  res.json({items,insights,windowDays:30,anonymous:true,interpretation:"ارتفاع التعثر الجماعي بعد إصدار جديد قد يعني أن الواجهة نفسها تحتاج إعادة تصميم، لا أن المستخدم يحتاج شرحًا أكثر."});
});

app.get("/api/intelligence/experience-health", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const telemetry=await Repository.getClientTelemetry(collegeId,sectionId,1000).catch(()=>[]);
  const cutoff=Date.now()-14*24*60*60*1000;
  const recent=telemetry.filter(item=>item.kind!=="guide"&&Date.parse(item.timestamp)>=cutoff);
  const perf=apiPerformanceSamples.filter(item=>item.at>=Date.now()-2*60*60*1000 && (item.sectionId===sectionId||(!item.sectionId&&item.userId===Number(req.user?.SystemUserId||0))) && (!item.collegeId||item.collegeId===collegeId));
  const durations=[...perf.map(item=>item.durationMs),...recent.filter(item=>item.kind==="api"&&item.durationMs).map(item=>Number(item.durationMs))].filter(Number.isFinite).sort((a,b)=>a-b);
  const p=(share:number)=>durations.length?durations[Math.min(durations.length-1,Math.floor((durations.length-1)*share))]:0;
  const failures=recent.filter(item=>item.kind==="error"||(item.kind==="api"&&(item.ok===false||(item.status||0)>=400))||(item.kind==="sync"&&item.ok===false));
  const offline=recent.filter(item=>item.kind==="offline").length;
  const slow=durations.filter(ms=>ms>=1800).length;
  const total=Math.max(1,durations.length);
  const score=Math.max(0,Math.min(100,Math.round(100-(failures.length/Math.max(1,recent.length))*55-(slow/total)*35-Math.min(10,offline))));
  const byPath=new Map<string,{count:number,total:number,errors:number}>();
  perf.forEach(item=>{const x=byPath.get(item.path)||{count:0,total:0,errors:0};x.count++;x.total+=item.durationMs;if(item.status>=400)x.errors++;byPath.set(item.path,x);});
  const slowest=[...byPath.entries()].map(([path,x])=>({path,count:x.count,avg:Math.round(x.total/Math.max(1,x.count)),errors:x.errors})).sort((a,b)=>b.avg-a.avg).slice(0,5);
  const replays=failures.filter(item=>item.breadcrumbs?.length).slice(0,6).map(item=>({timestamp:item.timestamp,name:item.name,message:item.message||"",breadcrumbs:item.breadcrumbs||[]}));
  res.json({score,label:score>=90?"ممتازة":score>=75?"جيدة":score>=55?"تحتاج متابعة":"تحتاج تدخلاً",samples:durations.length,p50:Math.round(p(.5)),p95:Math.round(p(.95)),slow,failures:failures.length,offline,slowest,replays,termId});
});

app.get("/api/intelligence/open-decisions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [manual,scheduleData,courses,instructors,history]=await Promise.all([
    Repository.getOpenDecisions(collegeId,sectionId,termId,120),
    scopedScheduleUniverse(collegeId,sectionId,termId),
    Repository.getCoursesBySection(sectionId),Repository.getInstructorsByScope(sectionId,0),Repository.getSchedulesByScope({collegeId,sectionId}),
  ]);
  const analysis=analyzeSchedule(scheduleData.rows,scheduleData.universe,courses,instructors);
  const anomalies=logicalAnomalies(scheduleData.rows,history);
  const inferred=[
    ...(analysis.alerts||[]).slice(0,5).map((item:any,index:number)=>({id:`inferred:alert:${index}`,title:item.title||"قرار يحتاج مراجعة",detail:item.detail||"",priority:index===0?"high":"medium",source:"inferred"})),
    ...anomalies.filter(item=>item.severity!=="low").slice(0,4).map((item,index)=>({id:`inferred:anomaly:${index}`,title:item.title,detail:item.detail,priority:item.severity,source:"inferred",scheduleId:item.rowId})),
  ];
  res.json({manual,inferred,totalOpen:manual.filter(item=>item.status==="open").length+inferred.length});
});

app.post("/api/intelligence/open-decisions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const title=String(req.body?.title||"").trim().slice(0,140); if(title.length<3){res.status(400).json({error:"اكتب عنوان القرار المفتوح"});return;}
  const priority=["low","medium","high"].includes(String(req.body?.priority))?String(req.body.priority):"medium";
  const created=await Repository.createOpenDecision({
    SystemUserId:Number(req.user.SystemUserId),userName:String(req.user.Name||""),AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,
    title,detail:String(req.body?.detail||"").trim().slice(0,500)||undefined,owner:String(req.body?.owner||"").trim().slice(0,100)||undefined,dueAt:String(req.body?.dueAt||"").slice(0,30)||undefined,
    priority:priority as any,scheduleId:Number(req.body?.scheduleId||0)||undefined,source:req.body?.source==="assistant"?"assistant":"manual"
  });
  res.status(201).json(created);
});

app.patch("/api/intelligence/open-decisions/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const existing=(await Repository.getOpenDecisions(collegeId,sectionId,termId,250)).find(item=>item.id===String(req.params.id));
  if(!existing){res.status(404).json({error:"القرار غير موجود في هذا النطاق"});return;}
  const fields:any={};
  if(["open","done"].includes(String(req.body?.status)))fields.status=String(req.body.status);
  if(["low","medium","high"].includes(String(req.body?.priority)))fields.priority=String(req.body.priority);
  if(typeof req.body?.owner==="string")fields.owner=String(req.body.owner).trim().slice(0,100);
  if(typeof req.body?.dueAt==="string")fields.dueAt=String(req.body.dueAt).slice(0,30);
  res.json(await Repository.updateOpenDecision(existing.id,fields));
});

app.get("/api/intelligence/operations-review", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [current,history,versions,terms,courses]=await Promise.all([
    Repository.getSchedulesByScope({collegeId,sectionId,termId}),Repository.getSchedulesByScope({collegeId,sectionId}),Repository.getScheduleVersionsWithRows(collegeId,sectionId,termId,24),Repository.getTerms(),Repository.getCoursesBySection(sectionId),
  ]);
  const accuracy=scheduleAccuracyFromVersions(versions,current);
  const anomalies=logicalAnomalies(current,history);
  const rules=discoverUnwrittenRules(history,terms,courses.filter(course=>Number(course.AdSectionId)===sectionId));
  res.json({accuracy,anomalies,unwrittenRules:rules,history:{rows:history.length,terms:new Set(history.map(row=>row.AdTermId)).size}});
});

app.post("/api/intelligence/policy-simulate", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!termId){res.status(400).json({error:"حدد الفصل الدراسي"});return;}
  const university=Boolean(req.user?.IsAdminUser&&req.body?.scope==="university");
  if(!university&&(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId))){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const type=String(req.body?.type||"");
  if(!["day_off","close_building","no_classes_after","growth"].includes(type)){res.status(400).json({error:"اختر سياسة قابلة للمحاكاة"});return;}
  const [terms,current,historyAll]=await Promise.all([
    Repository.getTerms(),
    university?Repository.getSchedulesByScope({termId}):Repository.getSchedulesByScope({collegeId,sectionId,termId}),
    university?Repository.getSchedules():Repository.getSchedulesByScope({collegeId,sectionId}),
  ]);
  const recent=recentTenYearTermIds(terms); const history=historyAll.filter(row=>recent.has(Number(row.AdTermId||0)));
  const input={type,day:String(req.body?.day||"") as any,time:String(req.body?.time||"17:00").slice(0,5),building:String(req.body?.building||"").trim().slice(0,40),growth:Number(req.body?.growth||10)};
  const result=simulatePolicy(current,history,input);
  const isAffected=(row:any)=>type==="day_off"?Boolean(row[input.day]):type==="close_building"?String(row.AdRoomCode||"").trim().toLowerCase()===input.building.toLowerCase():type==="no_classes_after"?timeToMinutes(row.fendtime)>timeToMinutes(input.time):false;
  const affected=type==="growth"?[]:current.filter(isAffected);
  res.json({...result,scope:university?"university":"department",impact:{sections:new Set(affected.map(row=>row.AdSectionId)).size,instructors:new Set(affected.map(row=>row.AdInstructorId)).size,rooms:new Set(affected.map(row=>roomIdentityKey(row)).filter(Boolean)).size},guardrail:"محاكاة فقط؛ لا تغيّر أي موعد ولا قاعدة."});
});

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

app.get("/api/intelligence/lookups", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(req.user?.IsAdminUser){
    const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);
    res.json({courses,instructors});return;
  }
  const sectionIds=[...new Set((req.scopes||[]).map(scope=>Number(scope.AdSectionId)).filter(Boolean))];
  const [courseGroups,instructorGroups]=await Promise.all([
    Promise.all(sectionIds.map(id=>Repository.getCoursesBySection(id))),
    Promise.all(sectionIds.map(id=>Repository.getInstructorsByScope(id,0))),
  ]);
  const courseMap=new Map<number,any>(),instructorMap=new Map<number,any>();
  courseGroups.flat().forEach(item=>courseMap.set(Number(item.AdCourseId),item));
  instructorGroups.flat().forEach(item=>instructorMap.set(Number(item.AdInstructorId),item));
  res.json({courses:[...courseMap.values()],instructors:[...instructorMap.values()]});
});

app.get("/api/intelligence/genome", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [sectionRows,terms,courses,instructors]=await Promise.all([Repository.getSchedulesByScope({collegeId,sectionId}),Repository.getTerms(),Repository.getCoursesBySection(sectionId),Repository.getInstructorsByScope(sectionId,0)]);
  res.json(buildScheduleGenome(sectionRows,terms,termId,courses,instructors));
});

app.get("/api/intelligence/constraints", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  res.json(await Repository.getScheduleConstraints(collegeId,sectionId,termId));
});
app.post("/api/intelligence/constraints", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const type=String(req.body?.type||"");const allowed=new Set(["instructor_latest_end","instructor_day_off","department_day_off","course_room","max_instructor_gap","room_doorway"]);if(!allowed.has(type)){res.status(400).json({error:"نوع القاعدة غير صالح"});return;}
  const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]);const instructorId=Number(req.body?.AdInstructorId||0),courseId=Number(req.body?.AdCourseId||0),day=String(req.body?.day||""),time=String(req.body?.time||"").slice(0,5),buildingId=String(req.body?.buildingId||"").trim(),roomId=String(req.body?.roomId||"").trim();let roomCode="",roomHall="";const maxMinutes=type==="room_doorway"
    // A doorway is a handful of minutes; the instructor-gap clamp starts at
    // thirty and would silently turn a ten-minute break into half an hour.
    ?Math.max(1,Math.min(60,Number(req.body?.maxMinutes||0)))
    :Math.max(30,Math.min(480,Number(req.body?.maxMinutes||120)));
  const instructor=instructors.find(i=>i.AdInstructorId===instructorId),course=courses.find(c=>c.AdCourseId===courseId&&c.AdCollegeId===collegeId&&c.AdSectionId===sectionId);
  if((type==="instructor_latest_end"||type==="instructor_day_off"||(type==="max_instructor_gap"&&instructorId))&&!instructor){res.status(400).json({error:"اختر أستاذ مقرر صالح"});return;}
  if(type==="instructor_latest_end"&&(!/^\d{2}:\d{2}$/.test(time)||timeToMinutes(time)<SCHEDULE_DAY_START||timeToMinutes(time)>SCHEDULE_DAY_END)){res.status(400).json({error:`حدد آخر وقت مسموح بين ${SCHEDULE_DAY_START_TIME} و${SCHEDULE_DAY_END_TIME}`});return;}
  if((type==="instructor_day_off"||type==="department_day_off")&&!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"حدد يوماً صالحاً"});return;}
  if(type==="course_room"){
    if(!course||!buildingId||!roomId){res.status(400).json({error:"اختر المقرر والمبنى والقاعة من السجل الرسمي"});return;}
    const registry=await readLocationRegistry();
    const check=locationPreflight({buildingId,roomId,AdCollegeId:collegeId,AdSectionId:sectionId},registry,{collegeId,sectionId});
    if(!check.ok||!check.canonical?.roomId){res.status(400).json({error:check.issues.find(i=>i.severity==="high")?.message||"القاعة غير معتمدة في السجل الرسمي",issues:check.issues});return;}
    roomCode=String(check.canonical.AdRoomCode||"");roomHall=String(check.canonical.AdRoomHall||"");
  }
  const dayLabel=SCHEDULE_DAYS.find(d=>d.key===day)?.label||"";const label=type==="instructor_latest_end"?`${instructor?.AdInstructorName}: لا محاضرات بعد ${time}`:type==="instructor_day_off"?`${instructor?.AdInstructorName}: ${dayLabel} يوم محجوز`:type==="department_day_off"?`${dayLabel}: يوم محجوز للقسم`:type==="course_room"?`${course?.CourseCode||course?.CourseName}: القاعة ${roomCode}/${roomHall}`:instructor?`${instructor.AdInstructorName}: الفراغ لا يتجاوز ${maxMinutes} دقيقة`:`أي أستاذ: الفراغ لا يتجاوز ${maxMinutes} دقيقة`;
  const created=await Repository.createScheduleConstraint({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,type:type as any,label,enabled:true,AdInstructorId:(type==="instructor_latest_end"||type==="instructor_day_off"||type==="max_instructor_gap")?(instructorId||undefined):undefined,AdCourseId:type==="course_room"?(courseId||undefined):undefined,day:(type==="instructor_day_off"||type==="department_day_off")&&SCHEDULE_DAYS.some(d=>d.key===day)?day as any:undefined,time:type==="instructor_latest_end"?(time||undefined):undefined,buildingId:type==="course_room"?buildingId:undefined,roomId:type==="course_room"?roomId:undefined,roomCode:type==="course_room"?(roomCode||undefined):undefined,roomHall:type==="course_room"?(roomHall||undefined):undefined,maxMinutes:type==="max_instructor_gap"?maxMinutes:undefined});res.status(201).json(created);
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

app.post("/api/intelligence/war-room", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.status(400).json({error:"لا يوجد جدول لبناء غرفة قرار"});return;}
  res.json(buildWarRoom(base,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined));
});

app.post("/api/intelligence/autopilot", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req),goal=String(req.body?.goal||"حافظ على خلو الجدول من الموانع وقلل الفراغات بأقل تغيير ممكن").trim().slice(0,240);if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);const {rows:base,universe}=scheduleData;if(!base.length){res.status(400).json({error:"لا توجد مواعيد لتشغيل الجدولة المساعدة"});return;}
  res.json(runScheduleAutopilot(base,universe,courses,instructors,constraints,goal,240));
});

app.post("/api/intelligence/evaluate", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const rows=safeDraftRows(req.body?.rows,collegeId,sectionId,termId); const errors=await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:false});
  if(errors.length){res.status(400).json({error:"المسودة تحتوي بيانات تحتاج مراجعة",issues:errors});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]);
  const {rows:baseline,universe}=scheduleData;
  const external=universe.filter(row=>!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));
  res.json({baseline:analyzeSchedule(baseline,universe,courses,instructors),scenario:analyzeSchedule(rows,[...external,...rows],courses,instructors),constraints:{baseline:evaluateScheduleConstraints(baseline,constraints),scenario:evaluateScheduleConstraints(rows,constraints)}});
});

app.post("/api/intelligence/auto-schedule", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [scheduleData,courses,instructors]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors()]);
  const target=scheduleData.rows.filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId&&Number(row.AdTermId)===termId);
  const universe=scheduleData.universe;
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
  const target=scheduleData.rows.filter(row=>Number(row.AdCollegeId)===collegeId&&Number(row.AdSectionId)===sectionId&&Number(row.AdTermId)===termId);
  const universe=scheduleData.universe;
  const analysis=analyzeSchedule(target,universe,courses,instructors); const bullets:string[]=[]; let title="قراءة ذكية للجدول";
  /**
   * ── الإجابة المرسومة ──────────────────────────────────────────────────────
   *
   * Every branch below already computes real figures — a score, a count of
   * blockers, minutes of idle time, a utilisation per hall — and then dissolves
   * all of them into one Arabic sentence. The sentence is worth keeping; the
   * figures were being thrown away, and a paragraph is the slowest possible way
   * to deliver a number.
   *
   * So each branch now also hands back what it measured, in a shape the screen
   * can draw: figures for the headline, bars for anything with a proportion,
   * and a before/after pair when the answer is about a change. The prose stays
   * underneath for whoever wants the reasoning.
   */
  type Figure = { label: string; value: string; tone?: "good"|"warn"|"bad"|"plain"; hint?: string };
  type Bar = { label: string; value: number; max: number; caption?: string };
  const figures: Figure[] = [];
  const bars: Bar[] = [];
  let shift: { label: string; before: number|string; after: number|string; better?: boolean } | null = null;
  let shape: "reading"|"alert"|"gaps"|"crowd"|"investigation"|"move"|"plan"|"rooms" = "reading"; let summary=`جودة الجدول الحالية ${analysis.score}/100، مع ${analysis.metrics.criticalConflicts} موضعاً يحتاج تحقق و${analysis.metrics.avgInstructorGap} دقيقة كمتوسط فراغ للأساتذة.`;
  const normalized=prompt.replace(/[؟?]/g,"").toLowerCase();
  const dayMatch=SCHEDULE_DAYS.find(day=>normalized.includes(day.label));
  const hourMatch=normalized.match(/(?:إلى|الى|الساعة|وقت)\s*(\d{1,2})(?::(\d{2}))?/);
  const requestedHour=hourMatch?Math.min(23,Number(hourMatch[1]))*60+Number(hourMatch[2]||0):null;
  const profHint=normalized.match(/(?:د\.?|دكتور|الدكتور)\s*([^\s]+)/)?.[1];
  /* «منو / مين / كم / الجميع» is a question ABOUT the department, not about one
     named person, so it must never be read as naming an instructor. */
  const isAggregateAsk=/\b(منو|مين|من عنده|كم|الجميع|كل الأساتذة|كل الاساتذة|أي أستاذ|اي استاذ)\b/.test(normalized)||/^من\s/.test(normalized);
  /* A name is "mentioned" only if a real, non-trivial name appears in the text.
     Matching by includes() alone let an instructor whose stored name is empty
     satisfy normalized.includes("") for EVERY query — which is how "who has a
     long gap?" was answered with "no data for this instructor". */
  const namedInstructor=isAggregateAsk?undefined:instructors.find(i=>{
    const name=String(i.AdInstructorName||"").trim().toLowerCase();
    if(name.length<4)return false;
    return normalized.includes(name)||Boolean(profHint&&profHint.length>=3&&name.includes(profHint));
  });
  const mentionedInstructor=namedInstructor;
  const scopedInstructorIds=new Set(target.map(row=>Number(row.AdInstructorId||0)).filter(Boolean));
  const requestedInstructor=mentionedInstructor&&scopedInstructorIds.has(Number(mentionedInstructor.AdInstructorId))?mentionedInstructor:undefined;
  const sectionName=sections.find(s=>Number(s.AdSectionId)===sectionId)?.AdSectionName||"القسم المحدد";
  if(mentionedInstructor&&!requestedInstructor){
    title=`لا بيانات لهذا الأستاذ في ${sectionName}`;
    summary=`وجدت الاسم في دليل الجامعة، لكنه لا يملك موعداً داخل ${sectionName} والفصل المحدد. لم أخلط جدول قسم آخر بهذه الإجابة.`;
    shape="gaps";
    figures.push({label:"مواعيد داخل النطاق",value:"0",tone:"plain"},{label:"النطاق المقروء",value:sectionName,tone:"plain"});
  } else if(normalized.includes("المشكلة الأكبر")||normalized.includes("اكبر مشكلة")||normalized.includes("أكبر مشكلة")||normalized.includes("وين المشكلة")){
    const topAlert=analysis.alerts?.[0],topFactor=[...(analysis.factors||[])].sort((a:any,b:any)=>b.penalty-a.penalty)[0];title="أكبر نقطة تحتاج تدخلك الآن";summary=topAlert?`${topAlert.title}: ${topAlert.detail}`:topFactor&&topFactor.penalty>0?`أكبر خصم من جودة الجدول حالياً هو ${topFactor.label} (-${topFactor.penalty}).`:`لا تظهر مشكلة حرجة حالياً؛ جودة الجدول ${analysis.score}/100.`;analysis.alerts.slice(1,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
    shape="alert";
    figures.push({label:"جودة الجدول",value:`${analysis.score}`,tone:analysis.score>=75?"good":analysis.score>=55?"warn":"bad",hint:"من 100"},
      {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts}`,tone:analysis.metrics.criticalConflicts?"bad":"good"},
      {label:"مواضع تحتاج نظرة",value:`${analysis.alerts?.length||0}`,tone:(analysis.alerts?.length||0)>3?"warn":"plain"});
    (analysis.factors||[]).filter((f:any)=>f.penalty>0).sort((a:any,b:any)=>b.penalty-a.penalty).slice(0,5)
      .forEach((f:any)=>bars.push({label:f.label,value:f.penalty,
        max:Math.max(...(analysis.factors||[]).map((x:any)=>x.penalty||0),1),caption:`−${f.penalty}`}));
  } else if(/فراغ|فراغات/.test(normalized)){
    title=requestedInstructor?`فراغات ${requestedInstructor.AdInstructorName}`:"تحليل فراغات الأساتذة";
    if(requestedInstructor){
      const profRows=target.filter(r=>r.AdInstructorId===requestedInstructor.AdInstructorId);
      if(dayMatch){
        const items=profRows.filter(r=>Boolean((r as any)[dayMatch.key])).sort((a,b)=>timeToMinutes(a.fstarttime)-timeToMinutes(b.fstarttime));
        const gaps:any[]=[];
        for(let i=1;i<items.length;i++){
          const gap=timeToMinutes(items[i].fstarttime)-timeToMinutes(items[i-1].fendtime);
          if(gap>0)gaps.push({from:items[i-1].fendtime,to:items[i].fstarttime,mins:gap});
        }
        summary=items.length?gaps.length?`في ${dayMatch.label} يظهر لهذا الأستاذ ${gaps.length} فراغات بإجمالي ${gaps.reduce((n,g)=>n+g.mins,0)} دقيقة.`:`في ${dayMatch.label} لا يوجد فراغ بين محاضرات ${requestedInstructor.AdInstructorName} الظاهرة ضمن هذا القسم.`:`لا توجد محاضرات ظاهرة لـ ${requestedInstructor.AdInstructorName} يوم ${dayMatch.label} ضمن هذا القسم.`;
        shape="gaps";
        figures.push(
          {label:"فترات الفراغ",value:`${gaps.length}`,tone:gaps.length?"warn":"good"},
          {label:"إجمالي الفراغ",value:`${gaps.reduce((n,g)=>n+g.mins,0)}`,hint:"دقيقة"},
          {label:"محاضرات اليوم",value:`${items.length}`,tone:"plain"}
        );
        const worst=Math.max(1,...gaps.map((g:any)=>g.mins||0),1);
        gaps.slice(0,6).forEach((g:any)=>bars.push({label:formatScheduleTimeRange(g.from,g.to),value:g.mins,max:worst,caption:`${Math.floor(g.mins/60)}س ${g.mins%60}د`}));
      }else{
        const load=analysis.professorLoads.find((x:any)=>x.id===requestedInstructor.AdInstructorId);
        summary=load?`أكبر فراغ لهذا الأستاذ ${Math.floor(load.maxGap/60)}س ${load.maxGap%60}د، وحمله الأسبوعي ${load.weeklyHours} ساعة.`:`لا توجد بيانات حمل ظاهرة لهذا الأستاذ في النطاق الحالي.`;
        shape="gaps";
        figures.push(
          {label:"أكبر فراغ",value:`${Math.floor((load?.maxGap||0)/60)}س ${(load?.maxGap||0)%60}د`,tone:(load?.maxGap||0)>=180?"warn":"plain"},
          {label:"الحمل الأسبوعي",value:`${load?.weeklyHours||0}`,hint:"ساعة"},
          {label:"عدد المواعيد",value:`${profRows.length}`,tone:"plain"}
        );
      }
    } else {
      const threshold=(Number(normalized.match(/(\d+)\s*ساع/)?.[1]||3))*60;
      const long=analysis.professorLoads.filter((x:any)=>x.maxGap>=threshold);
      const longest=Math.max(0,...analysis.professorLoads.map((x:any)=>x.maxGap||0));
      summary=long.length?`يوجد ${long.length} أستاذاً بفراغ يومي يساوي أو يتجاوز ${Math.round(threshold/60)} ساعات.`:"لا يوجد أستاذ يتجاوز حد الفراغ المطلوب في هذا الجدول.";
      shape="gaps";
      figures.push(
        {label:"أساتذة بفراغ طويل",value:`${long.length}`,tone:long.length?"warn":"good"},
        {label:"متوسط الفراغ",value:`${analysis.metrics.avgInstructorGap}`,hint:"دقيقة"},
        {label:"أكبر فراغ",value:`${Math.floor(longest/60)}س ${longest%60}د`,tone:long.length?"warn":"plain"}
      );
      const worst=Math.max(1,...analysis.professorLoads.map((x:any)=>x.maxGap||0));
      [...analysis.professorLoads].sort((a:any,b:any)=>b.maxGap-a.maxGap).slice(0,6)
        .forEach((x:any)=>bars.push({label:x.name,value:x.maxGap,max:worst,caption:`${Math.floor(x.maxGap/60)}س ${x.maxGap%60}د`}));
    }
  } else if(dayMatch && (/مزدحم|ازدحام|زحمة/.test(normalized) || /ليش|لماذا|سبب|تحقيق/.test(normalized))){
    title=`تحقيق ${dayMatch.label}`; const day=analysis.dayLoad.find((x:any)=>x.key===dayMatch.key); const peaks=analysis.heatmap.filter((x:any)=>x.day===dayMatch.key).sort((a:any,b:any)=>b.count-a.count).slice(0,3);
    const history=(await Repository.getSchedulesByScope({collegeId,sectionId})).filter(row=>Number(row.AdTermId)!==termId);
    const investigation=investigateCrowding(target,dayMatch.key as any,history);
    summary=`في ${dayMatch.label} يوجد ${countOf(day?.count||0, AR.appointment)}؛ ${investigation.verdict}`;
    peaks.slice(0,2).forEach((x:any)=>bullets.push(`${x.time}: ${x.count} محاضرات متزامنة.`));
    bullets.push(`الحركة موزعة على ${investigation.professors} أستاذ و${investigation.rooms} قاعة.`);
    shape="investigation";
    figures.push({label:dayMatch.label,value:`${day?.count||0}`,hint:"موعداً",tone:"plain"},
      {label:"مقابل التاريخ",value:`${investigation.delta>0?"+":""}${investigation.delta}`,tone:investigation.delta>=8?"warn":"good",hint:"نقطة"},
      {label:"أعلى تزامن",value:`${peaks[0]?.count||0}`,tone:(peaks[0]?.count||0)>6?"warn":"plain",hint:"في نصف ساعة"});
    investigation.causes.forEach((x:any)=>bars.push(x));
  } else if(normalized.includes("إذا نقلت")||normalized.includes("اذا نقلت")){
    title="محاكاة نقل موعد"; const code=courses.find(c=>normalized.includes(String(c.CourseCode).toLowerCase())); const row=code?target.find(r=>r.AdCourseId===code.AdCourseId):target[0];
    if(row&&requestedHour!=null){const dur=Math.max(30,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));const candidate={...row,fstarttime:minutesToTime(requestedHour),fendtime:minutesToTime(requestedHour+dur)};const before=findConflicts([row],universe).length,after=findConflicts([candidate],universe.filter(x=>x.id!==row.id).concat(candidate)).length;summary=`نقل ${code?.CourseCode||row.AdCourseName} إلى ${candidate.fstarttime} يغيّر موانع الحفظ المحتملة من ${before} إلى ${after}.`;bullets.push(`الوقت المقترح: ${formatScheduleTimeRange(candidate.fstarttime, candidate.fendtime)}.`,after===0?"الموضع صالح ولا يظهر حجز مزدوج للأستاذ أو القاعة.":"الموضع غير مسموح؛ استخدم اقتراح البديل الآمن.");
      shape="move";
      shift={label:"موانع الحفظ",before,after,better:after<=before};
      figures.push({label:"الوقت المقترح",value:formatScheduleTimeRange(candidate.fstarttime,candidate.fendtime),hint:"",tone:after===0?"good":"bad"});}
    else summary="حدد رمز المقرر والساعة في السؤال، مثال: إذا نقلت 101 إلى الساعة 11، فما الذي سيتأثر؟";
  } else if(normalized.includes("أفضل توزيع")||normalized.includes("افضل توزيع")||normalized.includes("قلل الفراغ")||normalized.includes("تقليل الفراغ")){
    title="اقتراح تحسين التوزيع"; const proposal=autoScheduleProposal(target,universe); const external=universe.filter(r=>!(r.AdCollegeId===collegeId&&r.AdSectionId===sectionId)); const after=analyzeSchedule(proposal.rows,[...external,...proposal.rows],courses,instructors); const safer=after.metrics.criticalConflicts<analysis.metrics.criticalConflicts||(after.metrics.criticalConflicts===analysis.metrics.criticalConflicts&&after.score>=analysis.score);
    summary=safer&&proposal.changed?`يمكن إنشاء سيناريو يغيّر وقت ${proposal.changed} موعداً: موانع الحفظ ${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts} والجودة ${analysis.score}/100 ← ${after.score}/100، دون تغيير المقرر أو الأستاذ أو أيام اللقاء أو القاعة.`:"حللت التوزيع الحالي ولم أجد نقلاً تلقائياً آمناً أفضل ضمن القيود نفسها؛ الأفضل تجربة «ماذا لو؟» يدوياً أو تحديد قيد إضافي للمساعد.";
    if(dayMatch)bullets.push(`ذكرت ${dayMatch.label}. سأتعامل معه كأولوية تحليل، لكن لن أغيّر نمط أيام المقرر تلقائياً لأن ذلك قد يكون قيداً أكاديمياً.`);
    bullets.push("افتح «المحاكاة» لمراجعة كل تغيير قبل اعتماده.");
    shape="plan";
    if(safer&&proposal.changed){
      shift={label:"جودة الجدول",before:analysis.score,after:after.score,better:after.score>=analysis.score};
      figures.push({label:"مواعيد ستتحرك",value:`${proposal.changed}`,tone:"plain"},
        {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts} ← ${after.metrics.criticalConflicts}`,
         tone:after.metrics.criticalConflicts<analysis.metrics.criticalConflicts?"good":"plain"});
    } else figures.push({label:"لا تحسين آمن",value:"—",tone:"plain",hint:"ضمن القيود نفسها"});
  /* «قاعة» alone missed «القاعات», which is how anyone actually asks — and how
     the suggested command on screen is worded. Arabic inflects; a matcher that
     only knows the singular answers the wrong question. */
  } else if(/قاع(ة|ات)/.test(normalized)){
    title="ذكاء القاعات";
    const low=[...analysis.rooms].sort((a:any,b:any)=>a.utilization-b.utilization).slice(0,5);
    const avgUtil=analysis.rooms.length?Math.round(analysis.rooms.reduce((n:any,r:any)=>n+(r.utilization||0),0)/analysis.rooms.length):0;
    summary=`أقل القاعات استخداماً داخل نطاق القسم موضحة في الرسم، مع فحص التوفر الفعلي أيضاً مقابل حجوزات الأقسام الأخرى.`;
    shape="rooms";
    figures.push(
      {label:"قاعات في النطاق",value:`${analysis.rooms.length}`,tone:"plain"},
      {label:"أقلّها استخداماً",value:`${low[0]?.utilization??0}`,hint:"٪",tone:(low[0]?.utilization??0)<25?"warn":"plain"},
      {label:"متوسط الاستخدام",value:`${avgUtil}`,hint:"٪",tone:avgUtil<55?"good":"plain"}
    );
    low.forEach((r:any)=>bars.push({label:`${r.code}/${r.hall}`,value:r.utilization,max:100,caption:`${r.utilization}٪`}));
  } else {
    analysis.alerts.slice(0,5).forEach((a:any)=>bullets.push(`${a.title}: ${a.detail}`));
    summary=`قرأت جدول ${sectionName} فقط ضمن صلاحياتك. ${summary}`;
    figures.push({label:"جودة الجدول",value:`${analysis.score}`,tone:analysis.score>=75?"good":analysis.score>=55?"warn":"bad",hint:"من 100"},
      {label:"موانع الحفظ",value:`${analysis.metrics.criticalConflicts}`,tone:analysis.metrics.criticalConflicts?"bad":"good"},
      {label:"متوسط الفراغ",value:`${analysis.metrics.avgInstructorGap}`,hint:"دقيقة"});
    const busiestDay=Math.max(1,...analysis.dayLoad.map((x:any)=>x.count||0));
    analysis.dayLoad.forEach((x:any)=>bars.push({label:x.label||x.key,value:x.count,max:busiestDay,caption:`${x.count}`}));
  }
  res.json({title,summary,bullets,shape,figures,bars,shift,scope:{collegeId,sectionId,termId,sectionName,rowCount:target.length},
    guardrail:"المساعد يحلل ويقترح فقط. لا يكتب أي تغيير على الجدول الحقيقي."});
});

app.get("/api/intelligence/context/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0); const selected=await Repository.getScheduleById(id); if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}
  if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [termRows,courses,instructors,comments,terms,courseHistory,versions]=await Promise.all([
    Repository.getSchedulesByScope({termId:selected.AdTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleComments(id),Repository.getTerms(),Repository.getScheduleHistoryForCourses([selected.AdCourseId]),Repository.getScheduleVersionsWithRows(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId,24)
  ]);
  const visible=req.user.IsAdminUser?termRows:filterByScope(req,termRows); const termVisible=visible;
  const related={
    professor:termVisible.filter(r=>r.AdInstructorId===selected.AdInstructorId).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime)),
    course:termVisible.filter(r=>r.AdCourseId===selected.AdCourseId),
    room:termVisible.filter(r=>Boolean(roomIdentityKey(selected))&&roomIdentityKey(r)===roomIdentityKey(selected)).sort((a,b)=>a.fstarttime.localeCompare(b.fstarttime))
  };
  const externalConflicts=findConflicts([selected],termRows).map(c=>({...c,otherId:visible.some(v=>v.id===c.otherId)?c.otherId:0}));
  /* ── ما تقوله عشر سنوات عن هذا الموعد بالذات ─────────────────────────────
   *
   * Three questions, each about a thing already named on this panel — the
   * course, the person, the hall — so nothing new appears on screen unless
   * history actually had something to say about one of them. Silence is the
   * ordinary case and costs nothing. */
  const style=await departmentStyle(selected);
  const day=SCHEDULE_DAY_KEYS.find(key=>Boolean((selected as any)[key]));
  const memory=style.memory?[
    style.memory.aboutCourse(selected.AdCourseId),
    selected.AdInstructorId?style.memory.aboutInstructor(selected.AdInstructorId):null,
    style.memory.aboutRoom(String(selected.AdRoomCode||""),String(selected.AdRoomHall||""),selected.roomId),
    day?style.memory.atSlot(day as any,String(selected.fstarttime||"")):null,
  ].filter(Boolean):[];
  const courseLife=buildCourseLife(selected.AdCourseId,courseHistory,terms,instructors);
  const offeringLife=buildOfferingLife(selected,courseHistory,terms,instructors,versions);
  const decisionCost=buildDecisionCost(selected,termVisible,courseHistory);
  const whyHere=explainWhyHere(selected,courseLife,externalConflicts);
  res.json({selected,course:courses.find(c=>c.AdCourseId===selected.AdCourseId)||null,instructor:instructors.find(i=>i.AdInstructorId===selected.AdInstructorId)||null,related,conflicts:externalConflicts,comments,
    memory,memoryTerms:style.memory?.terms||0,courseLife,offeringLife,decisionCost,whyHere});
});

app.get("/api/intelligence/replay/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const id=Number(req.params.id||0),selected=await Repository.getScheduleById(id);if(!selected){res.status(404).json({error:"الموعد غير موجود"});return;}if(!isScopeAllowed(req,selected.AdCollegeId,selected.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [versions,drafts,comments,publication,audits]=await Promise.all([Repository.getScheduleVersionsWithRows(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId,16),Repository.getScheduleDrafts(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getScheduleComments(id),Repository.getSchedulePublication(selected.AdCollegeId,selected.AdSectionId,selected.AdTermId),Repository.getAuditLogs(2000)]);
  const same=(r:any)=>r&&Number(r.AdCourseId)===selected.AdCourseId&&String(r.SCode)===String(selected.SCode);const state=(r:any)=>({time:formatScheduleTimeRange(r.fstarttime, r.fendtime),start:r.fstarttime,end:r.fendtime,room:`${r.AdRoomCode}/${r.AdRoomHall}`,instructorId:r.AdInstructorId,days:activeDays(r)});const stateKey=(r:any)=>r?`${r.AdInstructorId}|${activeDays(r).join(",")}|${r.fstarttime}|${r.fendtime}|${r.AdRoomCode}|${r.AdRoomHall}`:"missing";
  const ordered=[...versions].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const snapshots:any[]=[];for(const v of ordered){const r=v.rows.find(same);if(!r)continue;const conflicts=findConflicts([r],v.rows).length;const last=snapshots[snapshots.length-1];if(!last||last.key!==stateKey(r))snapshots.push({key:stateKey(r),timestamp:v.createdAt,userName:v.userName,label:v.label,source:v.source,row:r,state:state(r),conflicts})}
  const currentKey=stateKey(selected);if(!snapshots.length||snapshots[snapshots.length-1].key!==currentKey)snapshots.push({key:currentKey,timestamp:new Date().toISOString(),userName:"الوضع الحالي",label:"الوضع الحالي",source:"current",row:selected,state:state(selected),conflicts:findConflicts([selected],await Repository.getSchedulesByScope({termId:selected.AdTermId})).length});
  const events:any[]=[];if(snapshots.length)events.push({timestamp:snapshots[0].timestamp,type:"origin",title:"أقدم أثر متاح للموعد",detail:`${snapshots[0].state.time} · ${snapshots[0].state.room}`,actor:snapshots[0].userName,tone:"neutral"});
  const style=await departmentStyle({AdCollegeId:selected.AdCollegeId,AdSectionId:selected.AdSectionId,AdTermId:selected.AdTermId}).catch(()=>null);
  const people=await Repository.getInstructors().catch(()=>[]);
  const nameOf=(id:number)=>people.find(p=>Number(p.AdInstructorId)===Number(id))?.AdInstructorName||"";
  for(let i=1;i<snapshots.length;i++){const a=snapshots[i-1],b=snapshots[i],changes:string[]=[];if(a.state.time!==b.state.time)changes.push(`الوقت ${a.state.time} ← ${b.state.time}`);if(a.state.room!==b.state.room)changes.push(`القاعة ${a.state.room} ← ${b.state.room}`);if(a.state.instructorId!==b.state.instructorId)changes.push("تغيّر أستاذ المقرر");if(a.state.days.join(",")!==b.state.days.join(","))changes.push("تغيّرت أيام اللقاء");
    /* ── ليش انتقل؟ ───────────────────────────────────────────────────────
       The old placement, put back into the week of the version that moved it
       and swept for clashes. What it hits is what had taken the slot, and the
       row it hits has a name. Nothing is returned when the old placement was
       clean — a move can be a preference nobody wrote down, and this must not
       invent a cause for it. */
    const [oldCode,oldHall]=String(a.state.room||"").split("/");
    const why=changes.length?reasonForMove(
      selected,
      {day:(a.state.days[0]||null) as any,start:a.state.start,end:a.state.end,
       roomCode:oldCode||"",roomHall:oldHall||"",instructorId:Number(a.state.instructorId)||0},
      (ordered.find(v=>v.createdAt===b.timestamp)?.rows)||[],
      nameOf,
      Number(style?.doorway||0),
    ):null;
    if(changes.length)events.push({timestamp:b.timestamp,type:"move",title:"تغيّر قرار الموعد",detail:changes.join(" · "),actor:b.userName,tone:b.conflicts<a.conflicts?"good":b.conflicts>a.conflicts?"warn":"neutral",why:why?.text,whyAgainst:why?.against,whySource:why?"مُستنتَج من نسخة ذلك اليوم":undefined});if(a.conflicts===0&&b.conflicts>0)events.push({timestamp:b.timestamp,type:"conflict",title:"ظهر تعارض في هذه المرحلة",detail:`النسخة تحمل ${b.conflicts} علاقة تعارض لهذا الموعد.`,actor:b.userName,tone:"warn"});if(a.conflicts>0&&b.conflicts===0)events.push({timestamp:b.timestamp,type:"resolved",title:"اختفى التعارض الظاهر",detail:"النسخة التالية لم تعد تحمل التعارض السابق لهذا الموعد.",actor:b.userName,tone:"good"})}
  drafts.filter(d=>d.rows.some(same)).slice(0,20).forEach(d=>{const r=d.rows.find(same)!;events.push({timestamp:d.updatedAt,type:"draft",title:d.status==="published"?"مرّ عبر مسودة منشورة":"جُرّب بديل داخل المحاكاة",detail:`${d.name} · ${formatScheduleTimeRange(r.fstarttime, r.fendtime)} · ${r.AdRoomCode}/${r.AdRoomHall}`,actor:d.userName,tone:d.status==="published"?"good":"info"})});
  comments.forEach(c=>events.push({timestamp:c.createdAt,type:"comment",title:c.resolved?"ملاحظة أُغلقت":"ملاحظة قرار",detail:c.text,actor:c.userName,tone:c.resolved?"good":"info"}));if(publication)events.push({timestamp:publication.publishedAt,type:"publish",title:"تم اعتماد جدول هذا النطاق",detail:publication.draftId?`الاعتماد مرتبط بالمسودة ${publication.draftId}`:"اعتماد مباشر",actor:publication.userName,tone:"good"});
  audits.filter(a=>a.path===`/schedules/${id}`||a.path===`/api/schedules/${id}`||a.path.endsWith(`/schedules/${id}`)).slice(0,30).forEach(a=>events.push({timestamp:a.timestamp,type:"audit",title:`${a.action} مباشر على الموعد`,detail:`${a.method} ${a.path}`,actor:a.userName,tone:"neutral"}));events.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  res.json({schedule:{id:selected.id,courseName:selected.AdCourseName,sectionCode:selected.SCode,current:state(selected)},events,coverage:{versions:versions.length,drafts:drafts.filter(d=>d.rows.some(same)).length,comments:comments.length,note:"سجل القرار يعيد بناء القصة من النسخ الزمنية والمسودات والملاحظات والسجل التشغيلي المتاح منذ تفعيل هذه الطبقات؛ لا يخترع أحداثاً أقدم غير مسجلة."}});
});

app.get("/api/intelligence/room", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const code=String(req.query.code||"").trim(),hall=String(req.query.hall||"").trim(),termId=Number(req.query.termId||0),requestedRoomId=String(req.query.roomId||"").trim();
  if(!termId||(!requestedRoomId&&(!code||!hall))){res.status(400).json({error:"حدد القاعة الرسمية والفصل الدراسي"});return;}
  const [registry,termRows,sections]=await Promise.all([readLocationRegistry(),Repository.getSchedulesByScope({termId}),Repository.getSections()]);
  let targetRoom=registry.rooms.find(room=>room.id===requestedRoomId&&room.active&&room.confidence==="CONFIRMED");
  if(!targetRoom&&code&&hall){
    const building=resolveBuilding(registry,code);
    if(building.status==="CONFIRMED"&&building.value?.id)targetRoom=(() => { const resolved=resolveRoom(registry,hall,building.value!.id); return resolved.status==="CONFIRMED"&&resolved.value?resolved.value:undefined; })();
  }
  if(!targetRoom){res.status(400).json({error:"القاعة غير موجودة أو غير معتمدة في سجل المباني والقاعات"});return;}
  const rows=termRows.filter(row=>{
    if(row.roomId)return row.roomId===targetRoom!.id;
    const building=resolveBuilding(registry,row.AdRoomCode,{collegeId:row.AdCollegeId,sectionId:row.AdSectionId});
    if(building.status!=="CONFIRMED"||!building.value?.id)return false;
    const room=resolveRoom(registry,row.AdRoomHall,building.value!.id,{collegeId:row.AdCollegeId,sectionId:row.AdSectionId});
    return room.status==="CONFIRMED"&&room.value?.id===targetRoom!.id;
  });
  const visible=req.user.IsAdminUser?rows:filterByScope(req,rows); const visibleIds=new Set(visible.map(r=>r.id));
  const occupancy:any[]=[]; const freeWindows:any[]=[];
  for(const day of SCHEDULE_DAYS){const intervals=rows.filter(r=>Boolean((r as any)[day.key])).map(r=>({start:timeToMinutes(r.fstarttime),end:timeToMinutes(r.fendtime)})).sort((a,b)=>a.start-b.start);const merged:any[]=[];for(const item of intervals){const last=merged[merged.length-1];if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);else merged.push({...item})}let cursor=SCHEDULE_DAY_START;for(const item of merged){if(item.start>cursor)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:minutesToTime(Math.min(item.start,SCHEDULE_DAY_END))});cursor=Math.max(cursor,item.end)}if(cursor<SCHEDULE_DAY_END)freeWindows.push({day:day.label,start:minutesToTime(cursor),end:SCHEDULE_DAY_END_TIME}); for(const row of rows.filter(r=>Boolean((r as any)[day.key])))occupancy.push({day:day.label,start:row.fstarttime,end:row.fendtime,visible:visibleIds.has(row.id),sectionName:visibleIds.has(row.id)||req.user.IsAdminUser?sections.find(s=>s.AdSectionId===row.AdSectionId)?.AdSectionName||"":"حجز من قسم آخر"})}
  const usage=new Map<string,{name:string,count:number}>(); rows.forEach(r=>{const canSee=req.user.IsAdminUser||isScopeAllowed(req,r.AdCollegeId,r.AdSectionId);const name=canSee?(sections.find(s=>s.AdSectionId===r.AdSectionId)?.AdSectionName||"قسم"):`أقسام أخرى`;const key=canSee?String(r.AdSectionId):"external";const cur=usage.get(key)||{name,count:0};cur.count+=activeDays(r).length;usage.set(key,cur)});
  res.json({roomId:targetRoom.id,code:targetRoom.buildingCode,hall:targetRoom.canonicalCode,totalAppointments:rows.length,visibleAppointments:visible.length,occupancy,freeWindows:freeWindows.filter(x=>timeToMinutes(x.end)-timeToMinutes(x.start)>=30),departments:[...usage.values()].sort((a,b)=>b.count-a.count)});
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

app.get("/api/intelligence/drafts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} res.json(await Repository.getScheduleDrafts(collegeId,sectionId,termId));
});

app.post("/api/intelligence/pdf-import", requirePermission(7), express.raw({ type: "application/octet-stream", limit: "24mb" }), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const occupied=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
  if(occupied.length){res.status(409).json({error:"نسخ جدول PDF متاح للفصل الفارغ فقط. أنشئ فصلاً فارغاً أو اختر واحداً بلا مواعيد."});return;}
  const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
  if(!bytes.length){res.status(400).json({error:"لم يصل ملف PDF"});return;}

  /* DOCUMENT PRE-FLIGHT MUST RUN BEFORE TABLE READING — for text PDFs AND
     image-only CamScanner PDFs. readAuthorityPdfHeader reads page 1 only. */
  const [terms,colleges,sections]=await Promise.all([
    Repository.getTerms(),Repository.getColleges(),Repository.getSections(),
  ]);
  const targetTerm=terms.find((row:any)=>Number(row.AdTermId)===termId);
  const targetCollege=colleges.find((row:any)=>Number(row.AdCollegeId)===collegeId);
  const targetSection=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===collegeId);
  const targetCollegeName=String(targetCollege?.AdCollegeName||"");
  const targetSitePrefix=officialCollegeSitePrefix(targetCollegeName);
  let headerPreflight=await readAuthorityPdfHeader(bytes);

  /* Restore the proven orientation safety guard. Keep the protection, but only
     return the short instruction the user asked for — the old explanatory
     paragraph is intentionally gone. */
  if(headerPreflight.requiresLandscapeUpload){
    res.status(422).json({
      error:"دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع.",
      code:"PDF_SCAN_REQUIRES_LANDSCAPE",
      pages:Array.isArray(headerPreflight.requiresLandscapePages)?headerPreflight.requiresLandscapePages:undefined,
    });
    return;
  }

  /* Scope validation is shared by the cheap page-1 preflight and the full OCR
     rescue. A partial preflight is NOT a rejection: image-only CamScanner PDFs
     can make one tiny header field disappear at probe resolution even when the
     same field is perfectly readable on the high-resolution page. */
  const headerScopeProblem=(header:any):{status:number;body:any}|null=>{
    if(header?.term&&targetTerm){
      const targetName=asciiDigits(String(targetTerm.AdTermName||"")).normalize("NFKC");
      const seasonWord=header.term.season==="first"?/الاول|الأول/:header.term.season==="second"?/الثاني|الثانى/:/صيفي|صيفى/;
      const seasonOk=seasonWord.test(targetName);
      const targetYears=(targetName.match(/(?:19|20)\d{2}/g)||[]).map(Number);
      const yearsOk=header.term.years.every((year:number)=>targetYears.includes(year));
      if(!seasonOk||!yearsOk)return{status:409,body:{
        error:`هذا الملف للفصل «${header.term.label}»، بينما أنت تعمل على «${String(targetTerm.AdTermName||"")}». لم يتم استيراد أي صف.`,
        code:"PDF_TERM_MISMATCH",sourceTerm:header.term.label,targetTerm:String(targetTerm.AdTermName||""),
      }};
    }

    /* Header branch is a DOCUMENT property. A different document branch is a
       hard stop; a different building prefix in ONE body row is handled later
       as CROSS_BRANCH and is not confused with this check. */
    if(header?.branch&&targetSitePrefix){
      const sourceSite=officialCollegeSitePrefix(header.branch.name);
      const branchCode=String(header.branch.code||"").replace(/\D/g,"");
      const targetBranchCode=targetSitePrefix.slice(0,3).replace(/\D/g,"");
      const definiteMismatch=sourceSite
        ?sourceSite!==targetSitePrefix
        :Boolean(branchCode&&targetBranchCode&&branchCode!==targetBranchCode);
      if(definiteMismatch){
        const sourceLabel=sourceSite?officialSiteLabel(sourceSite,header.branch.name):header.branch.label;
        return{status:409,body:{
          error:`هذا الملف تابع إلى «${sourceLabel}»، بينما أنت تعمل على «${officialSiteLabel(targetSitePrefix,targetCollegeName)}». لم يتم استيراد أي صف.`,
          code:"PDF_BRANCH_MISMATCH",sourceBranch:header.branch.label,targetBranch:officialSiteLabel(targetSitePrefix,targetCollegeName),
        }};
      }
    }

    if(header?.department&&targetSection){
      const sourceDepartment=academicDigits(header.department.code);
      const targetDepartment=authorityDepartmentCode(targetCollege?.AdCollegeCode,targetSection.AdSectionCode);
      /* SWRSCHA prints the scientific department as COLLEGE + LOCAL DEPARTMENT:
         college 01 + department 01 => 0101. The system catalogue stores those
         two authorities separately, so comparing 0101 directly with local 01
         is a false mismatch. Build the document key from the real catalogue. */
      const sameDepartment=authorityDepartmentMatches(sourceDepartment,targetCollege?.AdCollegeCode,targetSection.AdSectionCode);
      const sourceName=foldHeaderIdentity(header.department.name);
      const namedMatches=sourceName.length>=5?sections.filter((item:any)=>Number(item.AdCollegeId)===collegeId).filter((item:any)=>{
        const candidate=foldHeaderIdentity(item.AdSectionName);
        return candidate.length>=5&&academicSectionNameMatches(sourceName,candidate);
      }):[];
      const namedSection=namedMatches.length===1?namedMatches[0]:undefined;
      /* A proven numeric department key outranks OCR name noise. Only when the
         document code is missing do we fall back to a unique Arabic-name match. */
      const definiteMismatch=Boolean(
        sourceDepartment&&targetDepartment
          ?!sameDepartment
          :namedSection&&Number(namedSection.AdSectionId)!==Number(targetSection.AdSectionId)
      );
      if(definiteMismatch)return{status:409,body:{
        error:`هذا الملف للقسم «${header.department.label}»، بينما القسم المحدد هو «${String(targetSection.AdSectionName||targetSection.AdSectionCode||"")}». لم يتم استيراد أي صف.`,
        code:"PDF_DEPARTMENT_MISMATCH",sourceDepartment:header.department.label,targetDepartment:String(targetSection.AdSectionName||targetSection.AdSectionCode||""),
      }};
    }
    return null;
  };

  /* Reject a clearly wrong document immediately when all three independent
     header authorities were proven cheaply. If even one field is missing, the
     high-resolution OCR path gets the chance to rescue it instead of producing
     the old false «لم أتمكن من إثبات الكلية/الفرع» regression. */
  if(headerPreflight.term&&headerPreflight.branch&&headerPreflight.department){
    const earlyProblem=headerScopeProblem(headerPreflight);
    if(earlyProblem){res.status(earlyProblem.status).json(earlyProblem.body);return;}
  }

  const [allCourses,allInstructors,sectionHistory,departmentRooms,registry,departmentDelegates,visitingRoster]=await Promise.all([
    Repository.getCourses(),Repository.getInstructors(),
    Repository.getSchedulesByScope({collegeId,sectionId}),
    Repository.getDepartmentRooms(collegeId,sectionId),readLocationRegistry(),
    Repository.getDepartmentDelegates(collegeId,sectionId),Repository.getVisitingRoster(collegeId,sectionId,termId),
  ]);
  const courses=allCourses.filter((course:any)=>Number(course.AdCollegeId)===collegeId&&Number(course.AdSectionId)===sectionId);

  /* Department history/delegates/visitors remain useful review evidence, but
     automatic instructor identity is stricter than roster membership: the PDF
     name must equal one unique system name after title removal only. No fuzzy or
     abbreviated university-wide match may create an instructor ID. */
  const preferredInstructorIds=new Set<number>([
    ...sectionHistory.map((row:any)=>Number(row.AdInstructorId||0)),
    ...departmentDelegates.map(Number),
    ...visitingRoster.map(Number),
  ].filter((id:number)=>Number.isFinite(id)&&id>0));
  const instructors=allInstructors;
  /* A course-specific roster is only a tie-breaker for NAME evidence. It never
     creates identity by itself: the observed PDF still has to prove two/three
     ordered name tokens and the remaining system candidate must be unique. */
  const courseInstructorIds=new Map<number,Set<number>>();
  for(const historyRow of sectionHistory as any[]){
    const courseId=Number(historyRow.AdCourseId||0),instructorId=Number(historyRow.AdInstructorId||0);
    if(!courseId||!instructorId)continue;
    const set=courseInstructorIds.get(courseId)||new Set<number>();set.add(instructorId);courseInstructorIds.set(courseId,set);
  }

  /* Reading a scan takes over a minute, so the client is kept informed rather
     than left staring at a frozen button. Progress is streamed as NDJSON — one
     JSON object per line — and the final line carries the result. The uploaded
     bytes live only in memory for the duration of this handler; nothing about
     the document is written to disk or the database. */
  const streaming=/ndjson|text\/event-stream/i.test(String(req.get("accept")||""));
  if(streaming){
    res.status(200);
    res.setHeader("Content-Type","application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Accel-Buffering","no");
  }
  const emit=(event:any)=>{ if(streaming){res.write(JSON.stringify(event)+"\n");} };

  const encodedFileName=String(req.get("x-file-name")||"الجدول المعتمد.pdf").slice(0,600);
  let fileName=encodedFileName;try{fileName=decodeURIComponent(encodedFileName);}catch{/* A literal header is already the right name. */}

  let recognized;
  try{
    recognized=await ocrDocument(bytes,"application/pdf",stage=>emit({type:"progress",...stage}));
  }catch(error:any){
    const message=String(error?.message||"تعذّرت قراءة ملف PDF");
    if(streaming){emit({type:"error",error:message});res.end();return;}
    res.status(422).json({error:message});return;
  }

  /* The full reader may recover header glyphs that were too small for the cheap
     probe. Merge only missing fields; never overwrite a field already proven by
     the embedded/page-1 preflight. No row parsing or import is allowed until the
     merged header proves term + branch + department and matches the chosen scope. */
  headerPreflight={
    term:headerPreflight.term||recognized.headerTerm,
    branch:headerPreflight.branch||recognized.headerBranch,
    department:headerPreflight.department||recognized.headerDepartment,
    source:headerPreflight.source||((recognized.headerTerm||recognized.headerBranch||recognized.headerDepartment)?"scan":undefined),
  };

  /* Defence in depth for mixed scans: if a later page needed a physical ±90°
     turn, reject before row parsing. All pages must share one stable horizontal
     table geometry so plausible OCR can never drift into neighbouring columns. */
  const rotatedPages=recognized.pageDiagnostics.filter((page:any)=>Number(page.orientation)!==0);
  if(rotatedPages.length){
    const body={
      error:"دوّر صفحات الجدول للوضع الأفقي ثم أعد الرفع.",
      code:"PDF_SCAN_REQUIRES_LANDSCAPE",
      pages:rotatedPages.map((page:any)=>Number(page.page)).filter(Boolean),
    };
    if(streaming){emit({type:"error",...body});res.end();return;}
    res.status(422).json(body);return;
  }

  if(!headerPreflight.term||!headerPreflight.branch||!headerPreflight.department){
    const missing=[!headerPreflight.term?"الفصل والسنة":"",!headerPreflight.branch?"الكلية/الفرع":"",!headerPreflight.department?"القسم":""].filter(Boolean);
    const body={
      error:`لم أتمكن من إثبات ${missing.join(" و")} من ترويسة الصفحة الأولى بعد القراءة عالية الدقة. لم يتم استيراد أي صف. ارفع نسخة أوضح أو راجع الملف.`,
      code:"PDF_HEADER_UNRESOLVED",missingHeaderFields:missing,
    };
    if(streaming){emit({type:"error",...body});res.end();return;}
    res.status(422).json(body);return;
  }
  const finalHeaderProblem=headerScopeProblem(headerPreflight);
  if(finalHeaderProblem){
    if(streaming){emit({type:"error",...finalHeaderProblem.body});res.end();return;}
    res.status(finalHeaderProblem.status).json(finalHeaderProblem.body);return;
  }

  /* Once the numeric scientific-department identity is proven, expose the
     canonical system label in the receipt/preview. OCR text such as `0101 01`
     is source evidence, not the department's canonical display identity. */
  if(headerPreflight.department&&targetSection&&authorityDepartmentMatches(
    headerPreflight.department.code,targetCollege?.AdCollegeCode,targetSection.AdSectionCode
  )){
    const canonicalCode=authorityDepartmentCode(targetCollege?.AdCollegeCode,targetSection.AdSectionCode);
    const canonicalName=String(targetSection.AdSectionName||"").trim();
    headerPreflight.department={
      code:canonicalCode||academicDigits(headerPreflight.department.code),
      name:canonicalName,
      label:[canonicalCode||academicDigits(headerPreflight.department.code),canonicalName].filter(Boolean).join(" "),
    };
  }

  /* An unreadable scan is refused outright rather than returned as a table of
     blanks: the reader could not otherwise tell which empty cells are the
     document and which are the camera. */
  if(!recognized.legibility.readable){
    const message=recognized.legibility.reason;
    if(streaming){emit({type:"error",error:message});res.end();return;}
    res.status(422).json({error:message});return;
  }
  if(recognized.suspiciousExtraction){
    const affected=recognized.pageDiagnostics.filter((page:any)=>page.suspicious);
    const detail=affected.map((page:any)=>`الصفحة ${page.page}: ${page.reason||"لم تثبت هندسة الجدول"}`).join(" · ");
    const message=`أوقفت الاستيراد لأن استخراج الجدول غير آمن. ${detail} لم يتم استيراد أي صف.`;
    if(streaming){emit({type:"error",error:message,code:"SUSPICIOUS_EXTRACTION",pageDiagnostics:recognized.pageDiagnostics});res.end();return;}
    res.status(422).json({error:message,code:"SUSPICIOUS_EXTRACTION",pageDiagnostics:recognized.pageDiagnostics});return;
  }
  emit({type:"progress",phase:"match",page:recognized.pageCount,pages:recognized.pageCount,message:"مطابقة الصفوف بالمقررات والأساتذة"});
  const documentDepartmentCode=authorityDepartmentCode(targetCollege?.AdCollegeCode,targetSection?.AdSectionCode);
  const parsed=parseScheduleTable(recognized.pages,courses,instructors,preferredInstructorIds,{authorityDepartmentCode:documentDepartmentCode,sequentialSections:true,courseInstructorIds});
  /* Defence in depth: the preview title is canonical system data, never OCR.
     Even if a future parser regression welds SECTION+CRN into a plausible
     seven-digit token (e.g. 5011894), an unresolved row cannot expose that raw
     evidence as the course title. Raw source text remains in sourceCourseText
     for the editor/audit trail; only a proven AdCourseId may populate the
     user-facing name. */
  const importCourseById=new Map(courses.map((course:any)=>[Number(course.AdCourseId),course]));
  for(const row of parsed.rows as any[]){
    const canonicalCourse=importCourseById.get(Number(row.AdCourseId||0));
    row.AdCourseName=canonicalCourse?String(canonicalCourse.CourseName||""):"";
  }
  const geometryRows=recognized.pageDiagnostics.reduce((sum:any,page:any)=>sum+Number(page.extractedRows||0),0);
  if(geometryRows>=3&&parsed.rows.length<Math.ceil(geometryRows*.7)){
    const message=`أوقفت الاستيراد: حدود الجدول أثبتت ${geometryRows} صفاً تقريباً، لكن المطابقة أعادت ${parsed.rows.length} فقط. هذا فرق غير آمن وقد يعني انزياح أعمدة أو دمج صفوف. لم يتم استيراد أي صف.`;
    if(streaming){emit({type:"error",error:message,code:"COUNT_RECONCILIATION_FAILED",pageDiagnostics:recognized.pageDiagnostics});res.end();return;}
    res.status(422).json({error:message,code:"COUNT_RECONCILIATION_FAILED",pageDiagnostics:recognized.pageDiagnostics});return;
  }

  /* OCR values are evidence, not registry writes. Full building codes are first
     resolved globally because the code itself is unambiguous; only short/legacy
     values need department context. This also lets us identify a real Fahaheel
     or Jahra exception instead of misclassifying it as an unknown main-campus
     building. */
  const confirmedOfficialBuildingCodes=registry.buildings.filter((item:any)=>item.confidence==="CONFIRMED").map((item:any)=>String(item.officialCode||""));
  const sourceBranchRoot=academicDigits(headerPreflight.branch?.code).slice(0,3);
  for(const row of parsed.rows as any[]){
    const rawBuilding=String(row.sourceBuildingText||row.AdRoomCode||"");const rawHall=String(row.sourceRoomText||row.AdRoomHall||"");
    row.sourceBuildingText=rawBuilding;row.sourceRoomText=rawHall;
    const token=rawBuilding.normalize("NFKC").replace(/\s+/g,"").toUpperCase();
    const normalizedInstructor=foldHeaderIdentity(row.sourceInstructorText);
    const sectionToken=String(row.SCode||"").replace(/\D/g,"");
    const authoritySectionConfirmed=/^\d{3}$/.test(sectionToken)&&Number(sectionToken)>=501;
    const activeDayKeys=["fsunday","fmonday","ftuesday","fwednesday","fthursday"].filter(key=>Boolean(row[key]));
    const timeConfirmed=/^\d{2}:\d{2}$/.test(String(row.fstarttime||""))&&/^\d{2}:\d{2}$/.test(String(row.fendtime||""))&&String(row.fendtime)>String(row.fstarttime);
    const readMode=String(row.sourceReadMode||"ocr-grid");
    const readSource=readMode==="pdf-text"?"PDF_TEXT_LAYER":readMode==="ocr-fallback"?"OCR_FALLBACK":"OCR_GRID_CELL";
    const instructorMethod=String(row.instructorMatchMethod||"");
    const instructorScore=Number(row.instructorMatchScore||0);
    row.importEvidence={
      course:{raw:[row.sourceCourseCode,row.sourceCourseText].filter(Boolean).join(" · "),normalized:String(row.sourceCourseCode||"").replace(/\D/g,""),canonical:Number(row.AdCourseId)||undefined,confidence:Number(row.AdCourseId)?"CONFIRMED":"UNRESOLVED",score:Number(row.AdCourseId)?100:0,source:readSource,method:"COURSE_NUMBER_TO_SYSTEM_CATALOGUE",derived:false,reason:Number(row.AdCourseId)?"رقم المقرر مطابق صراحةً لكتالوج القسم؛ الاسم مأخوذ من النظام فقط":"لم يثبت رقم المقرر من مفتاح صريح",evidence:["رقم المقرر في المستند","كتالوج القسم الحالي","اسم المقرر من النظام لا من OCR"]},
      section:{raw:String(row.sourceSectionText||""),normalized:sectionToken,canonical:authoritySectionConfirmed?sectionToken:undefined,confidence:authoritySectionConfirmed?"CONFIRMED":"UNRESOLVED",score:authoritySectionConfirmed?99:0,source:"SYSTEM_SEQUENCE",method:"COURSE_LOCAL_501_SEQUENCE",derived:true,reason:authoritySectionConfirmed?"رقم الشعبة مولد حسب ترتيب شعب المقرر: 501 ثم 502 ثم 503…":"تعذر توليد رقم شعبة canonical",evidence:["المقرر canonical","ترتيب ظهور شعب المقرر في المستند","بداية ثابتة 501"]},
      days:{raw:String(row.sourceDaysText||""),normalized:activeDayKeys.join(","),canonical:activeDayKeys.join(",")||undefined,confidence:activeDayKeys.length?"CONFIRMED":"UNRESOLVED",score:activeDayKeys.length?100:0,source:readSource,method:"SAME_CELL_DAYS",derived:false,reason:activeDayKeys.length?"أيام المحاضرة قُرئت من خلية الأيام نفسها":"لم تثبت أيام المحاضرة",evidence:["لا استعارة لأرقام الأيام من أعمدة الساعات أو المقاعد"]},
      time:{raw:String(row.sourceTimeText||""),normalized:[row.fstarttime,row.fendtime].filter(Boolean).join("-"),canonical:timeConfirmed?[row.fstarttime,row.fendtime].join("-"):undefined,confidence:timeConfirmed?"CONFIRMED":"UNRESOLVED",score:timeConfirmed?100:0,source:readSource,method:"SAME_CELL_TIME_PAIR",derived:false,reason:timeConfirmed?"زوج الوقت مثبت من خلية الوقت نفسها":"الوقت غير مكتمل أو غير صالح",evidence:["نطاق وقت جامعي صالح","لا استعارة من عمود المبنى"]},
      instructor:{raw:String(row.sourceInstructorText||""),normalized:normalizedInstructor,canonical:Number(row.AdInstructorId)||undefined,confidence:Number(row.AdInstructorId)?"CONFIRMED":"UNRESOLVED",score:Number(row.AdInstructorId)?Math.max(90,instructorScore||96):0,source:readSource,method:instructorMethod||"UNRESOLVED",derived:Boolean(Number(row.AdInstructorId)&&!['EXACT_FULL','FACULTY_IDENTITY'].includes(instructorMethod)),reason:Number(row.AdInstructorId)?"هوية واحدة مؤكدة من سجل النظام بعد تطبيع الألقاب والأسماء":"لم ينتج النص مرشحاً واحداً يقينياً؛ تُترك خانة الأستاذ بلا ربط",evidence:Number(row.AdInstructorId)?["تطبيع NFKC","إزالة د./ا./ا.د. من بداية الاسم فقط",`طريقة المطابقة ${instructorMethod||"SYSTEM_UNIQUE"}`,"مطابقة اسم النظام فقط","رفض أي نتيجة متعارضة"]:["لا إنشاء لاسم من PDF","لا اختيار عند تعدد المرشحين"]},
      building:{raw:rawBuilding,normalized:token,confidence:"UNRESOLVED",score:0,source:readSource,method:"REGISTRY_PENDING",derived:false,reason:"بانتظار المطابقة مع سجل المباني الرسمي",evidence:["خلية المبنى الأصلية"]},
      room:{raw:rawHall,normalized:rawHall.normalize("NFKC").replace(/\s+/g,"").toUpperCase(),confidence:"UNRESOLVED",score:0,source:readSource,method:"BUILDING_BOUND_ROOM_PENDING",derived:false,reason:rawHall?"بانتظار إثبات علاقة القاعة بالمبنى":"القاعة فارغة في المصدر",evidence:["خلية القاعة الأصلية"]},
    };
    /* One resolver owns the complete Authority location grammar. This prevents
       parser branches from disagreeing about whether a token is a building and
       guarantees Building -> Room registry validation for every row. */
    const location=resolveAuthorityLocation(registry,{
      rawBuilding,rawRoom:rawHall,collegeId,sectionId,branchRoot:sourceBranchRoot,
      sitePrefix:targetSitePrefix,knownOfficialCodes:confirmedOfficialBuildingCodes,
    });
    const building=location.building;
    if(building.status!=="CONFIRMED"||!building.value){
      row.buildingId=undefined;row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      /* Never display unverified OCR as a canonical location. Keep the raw cell
         only in sourceBuildingText/sourceRoomText for review. This is the final
         guard against capacity welds such as 345045/520020 appearing in the
         Building column even if an upstream parser ever regresses. */
      row.AdRoomCode="";row.AdRoomHall="";
      Object.assign(row.importEvidence.building,{confidence:"UNRESOLVED",reason:"القيمة لا تطابق مبنى Canonical صريحاً",evidence:["سجل المباني الرسمي","لا قصّ لرقم مجاور ولا تخمين"]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: المبنى المقروء «${rawBuilding||"فارغ"}» غير محسوم؛ اختر مبنى رسميًا.`);continue;
    }

    const sourceSitePrefix=String(building.value.sitePrefix||building.value.officialCode.slice(0,4)).toUpperCase();
    const sourceSiteLabel=officialSiteLabel(sourceSitePrefix);
    row.AdRoomCode=building.value.officialCode;
    row.sourceSitePrefix=sourceSitePrefix;
    row.sourceSiteLabel=sourceSiteLabel;
    /* Keep the old professional cue beside the course name for legitimate
       alternate sites of the SAME Authority branch (e.g. 012J/012F inside the
       012 girls report). It is informational, not a blocking mismatch. */
    if(targetSitePrefix&&sourceSitePrefix!==targetSitePrefix&&sourceBranchRoot&&sourceSitePrefix.slice(0,3).replace(/\D/g,"")===sourceBranchRoot){
      row.courseSiteLabel=sourceSiteLabel;
      row.courseSiteMessage=`هذه الشعبة تُدرّس في «${sourceSiteLabel}» بحسب المبنى ${building.value.officialCode}.`;
    }else{
      row.courseSiteLabel=undefined;row.courseSiteMessage=undefined;
    }
    /* 012B / 012F / 012J are different SITES of the same Authority branch 012.
       The department PDF legitimately contains Fahaheel/Jahra rows alongside
       the main girls campus. Treat a site as cross-branch only when its branch
       root differs (e.g. 011 boys vs 012 girls), not merely because B/F/J differs. */
    const sourceBranchCode=sourceSitePrefix.slice(0,3).replace(/\D/g,"");
    const sameAuthorityBranch=Boolean(sourceBranchRoot&&sourceBranchCode&&sourceBranchRoot===sourceBranchCode);
    if(targetSitePrefix&&sourceSitePrefix&&sourceSitePrefix!==targetSitePrefix&&!sameAuthorityBranch){
      const sourceLabel=officialSiteLabel(sourceSitePrefix);
      const targetLabel=officialSiteLabel(targetSitePrefix,targetCollegeName);
      row.buildingId=undefined;row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      row.sourceSitePrefix=sourceSitePrefix;
      row.scopeMismatchType="CROSS_BRANCH";
      row.scopeMismatchLabel=`فرع آخر · ${sourceLabel}`;
      row.scopeMismatchMessage=`هذه الشعبة تابعة إلى «${sourceLabel}» بحسب المبنى ${building.value.officialCode}، بينما الاستيراد الحالي لـ «${targetLabel}». لن يُضاف هذا السطر إلى الكلية المحددة قبل مراجعته.`;
      Object.assign(row.importEvidence.building,{canonical:building.value.id,confidence:"REVIEW_REQUIRED",reason:"المبنى Canonical مؤكد لكنه يعود إلى فرع آخر",evidence:[`الرمز الرسمي ${building.value.officialCode}`,`بادئة الموقع ${sourceSitePrefix}`]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: ${row.scopeMismatchMessage}`);
      continue;
    }

    row.buildingId=building.value.id;
    const buildingDerived=location.buildingMethod!=="EXACT_REGISTRY";
    Object.assign(row.importEvidence.building,{canonical:building.value.id,confidence:"CONFIRMED",score:location.buildingScore,method:location.buildingMethod,derived:buildingDerived,reason:buildingDerived?"استعادة مقيدة بالكامل بالسجل الرسمي؛ لم يتم اختراع كود مبنى":"تطابق صريح مع رمز مبنى رسمي",evidence:[...building.evidence,`طريقة الحسم ${location.buildingMethod}`,`الرمز الرسمي ${building.value.officialCode}`]});
    /* Once the building identity is confirmed, the user's rule is simple:
       a room is valid iff it exists under THAT building. Do not wrongly reject
       a legitimate Jahra/Fahaheel room because the current upload was opened
       from the main-campus college context. Building -> Room is the authority. */
    const room=location.room||resolveRoom(registry,rawHall,building.value.id,{});
    if(room.status!=="CONFIRMED"||!room.value){
      row.roomId=undefined;row.locationStatus="LOCATION_REVIEW_REQUIRED";
      /* Building is confirmed and may remain visible; the unconfirmed room may
         not. Raw room evidence stays separately for the editor/reviewer. */
      row.AdRoomHall="";
      Object.assign(row.importEvidence.room,{confidence:"UNRESOLVED",reason:rawHall?`لم تثبت القاعة داخل المبنى ${building.value.officialCode}`:"القاعة فارغة في المصدر؛ يلزم اختيار قاعة أو PENDING_ROOM صراحةً",evidence:["سجل القاعات الرسمي","علاقة Building ↔ Room"]});
      parsed.issues.push(`صف «${row.AdCourseName||row.AdCourseId}» شعبة ${row.SCode||"—"}: القاعة المقروءة «${rawHall||"فارغة"}» غير معروفة داخل ${building.value.officialCode}؛ اختر قاعة رسمية أو «بانتظار تثبيت القاعة».`);continue;
    }
    row.roomId=room.value.id;row.AdRoomHall=room.value.canonicalCode;row.locationStatus="VERIFIED";
    Object.assign(row.importEvidence.room,{canonical:room.value.id,confidence:"CONFIRMED",score:location.roomScore||100,method:location.roomScore&&location.roomScore<100?"REGISTRY_CONSTRAINED_REPAIR":"EXACT_ROOM_IN_BUILDING",derived:Boolean(location.roomScore&&location.roomScore<100),reason:"قاعة Canonical مؤكدة داخل المبنى المحدد",evidence:[...room.evidence,`المبنى ${building.value.officialCode}`,`القاعة ${room.value.canonicalCode}`]});
  }

  /* The sheet names its own term in the header. Uploading last year's export
     into this year's term is the one mistake no row-level check can catch —
     every row is valid, just a year old — so the two are compared here and a
     mismatch becomes a loud issue that blocks the one-step publish. */
  if(!headerPreflight.term&&recognized.headerTerm&&targetTerm){
    const targetName=asciiDigits(String(targetTerm.AdTermName||"")).normalize("NFKC");
    const seasonWord=recognized.headerTerm.season==="first"?/الاول|الأول/:recognized.headerTerm.season==="second"?/الثاني|الثانى/:/صيفي|صيفى/;
    const seasonOk=seasonWord.test(targetName);
    const targetYears=(targetName.match(/(?:19|20)\d{2}/g)||[]).map(Number);
    const yearsOk=recognized.headerTerm.years.every(year=>targetYears.includes(year));
    if(!seasonOk||!yearsOk){
      parsed.issues.unshift(`تحذير: الملف يذكر «${recognized.headerTerm.label}» بينما الفصل المختار هو «${String(targetTerm.AdTermName||"")}». تأكد أنك ترفع الجدول إلى الفصل الصحيح.`);
    }
  }
  const rows=assignAuthoritySections(safeDraftRows(parsed.rows,collegeId,sectionId,termId));
  const structural=rows.length?await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:true,requireDepartmentInstructor:true}):[];
  /* Conflict errors and structural errors block publishing until resolved */
  const parserNotes=[...new Set(parsed.issues)];
  const blocking=[...new Set([
    ...structural,
    ...parserNotes.filter((issue:string)=>/^تحذير:/.test(String(issue))),
  ])];
  const issues=[...new Set([...blocking,...parserNotes])];
  const importReceipt=await signPdfImportReceipt({
    v:1,collegeId,sectionId,termId,issuedAt:new Date().toISOString(),
    sourceTerm:headerPreflight.term.label,sourceBranch:headerPreflight.branch.label,sourceDepartment:headerPreflight.department.label,
  });
  const evidenceFields=["course","section","days","time","instructor","building","room"];
  let confirmedCells=0,derivedCells=0,reviewCells=0,readyRows=0;
  for(const row of rows as any[]){
    let rowReady=true;
    for(const key of evidenceFields){
      const proof=row.importEvidence?.[key];
      if(proof?.confidence==="CONFIRMED"){confirmedCells++;if(proof.derived)derivedCells++;}
      else{reviewCells++;rowReady=false;}
    }
    if(rowReady)readyRows++;
  }
  const verificationSummary={confirmedCells,derivedCells,reviewCells,readyRows,reviewRows:Math.max(0,rows.length-readyRows)};
  const result={
    rows,issues,blockingIssues:blocking,ready:rows.length>0&&blocking.length===0,verificationSummary,
    fileName:fileName.slice(0,180),
    pages:recognized.pageCount,confidence:recognized.confidence,
    legibility:recognized.legibility,
    pageDiagnostics:recognized.pageDiagnostics,
    suspiciousExtraction:recognized.suspiciousExtraction,
    importReceipt,
    headerBranch:headerPreflight.branch||recognized.headerBranch||undefined,
    headerDepartment:headerPreflight.department||recognized.headerDepartment||undefined,
    headerTerm:headerPreflight.term||recognized.headerTerm||undefined,
    message:rows.length?`تمت قراءة ${rows.length} شعبة من ${recognized.pageCount} صفحة`:`لم أتمكن من استخراج شعب من الملف`,
  };
  if(streaming){emit({type:"done",result});res.end();return;}
  res.json(result);
});

app.post("/api/intelligence/drafts", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const importLayout=req.body?.importLayout==="authority-pdf"?"authority-pdf":req.body?.importLayout==="worksheet"?"worksheet":undefined;
  const importReceipt=importLayout==="authority-pdf"?String(req.body?.importReceipt||""):"";
  if(importLayout==="authority-pdf"&&!await verifyPdfImportReceipt(importReceipt,{collegeId,sectionId,termId})){
    res.status(409).json({error:"انتهت أو غابت شهادة فحص ترويسة PDF. أعد رفع الملف؛ لا يمكن تجاوز فحص الفصل والكلية والقسم من الواجهة.",code:"PDF_IMPORT_RECEIPT_REQUIRED"});return;
  }
  const rows=importLayout==="authority-pdf"
    ?assignAuthoritySections(safeDraftRows(req.body?.rows,collegeId,sectionId,termId))
    :safeDraftRows(req.body?.rows,collegeId,sectionId,termId);
  const previewIssues=Array.isArray(req.body?.previewIssues)?[...new Set(req.body.previewIssues.map((item:any)=>String(item||"").trim()).filter(Boolean))].slice(0,80):[];
  if(previewIssues.length){res.status(400).json({error:"لا يمكن حفظ المسودة أو نشرها قبل معالجة جميع ملاحظات المعاينة.",issues:previewIssues});return;}
  const issues=await validateSmartRows(rows,collegeId,sectionId,{checkConflicts:false,requireDepartmentInstructor:importLayout==="authority-pdf"});
  if(issues.length){res.status(400).json({error:"أكمل الحقول المطلوبة والملاحظات في جدول المعاينة أولاً.",issues});return;}
  if(importLayout==="authority-pdf"){
    const occupied=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
    if(occupied.length){res.status(409).json({error:"نسخ PDF مسموح إلى فصل فارغ فقط. اختر فصلاً بلا بيانات."});return;}
  }
  /* Preserve the ORIGINAL Authority-PDF read as the immutable comparison
     baseline, even when the reviewer deletes or corrects rows in the preview
     before the first publish. The client keeps that first scan in baselineRows;
     falling back to the approved rows protects older clients. This is what lets
     the report later show every preview deletion in red and highlight only the
     cells that were manually changed before publication. */
  const suppliedBaseline=importLayout==="authority-pdf"
    ?safeDraftRows(req.body?.baselineRows,collegeId,sectionId,termId)
    :[];
  const baselineRows=importLayout==="authority-pdf"
    ?(suppliedBaseline.length?suppliedBaseline:rows.map((row:any)=>({...row})))
    :undefined;
  const draft=await Repository.createScheduleDraft({
    SystemUserId:req.user.SystemUserId,userName:req.user.Name,
    AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,
    name:String(req.body?.name||"سيناريو جديد").slice(0,100),
    source:["what-if","auto","import","manual"].includes(req.body?.source)?req.body.source:"what-if",
    rows,baselineRows,
    sourceFileName:String(req.body?.sourceFileName||"").slice(0,180)||undefined,
    importLayout,
    sourceBranchCode:String(req.body?.sourceBranchCode||"").trim().slice(0,20)||undefined,
    sourceBranchName:String(req.body?.sourceBranchName||"").trim().slice(0,180)||undefined,
    importReceipt:importReceipt||undefined,
  });
  res.status(201).json(draft);
});

app.get("/api/intelligence/drafts/:id/import-report", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft=await Repository.getScheduleDraftById(String(req.params.id));
  if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;}
  if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(draft.importLayout!=="authority-pdf"||!draft.baselineRows?.length){res.status(400).json({error:"هذه المسودة ليست نسخة من جدول PDF معتمد"});return;}
  const live=await Repository.getSchedulesByScope({collegeId:draft.AdCollegeId,sectionId:draft.AdSectionId,termId:draft.AdTermId});
  const comparison=buildAuthorityPdfDiff(draft.baselineRows,live);
  res.json({
    draftId:draft.id,name:draft.name,sourceFileName:draft.sourceFileName||"الجدول المعتمد.pdf",
    sourceBranchCode:inferAuthorityBranchCode(draft,[...draft.baselineRows,...live]),
    sourceBranchName:draft.sourceBranchName||"",
    ...comparison,
  });
});

/* The Authority-PDF report belongs to the normal inquiry/report centre. It is
   scoped by the header selections and always compares the latest imported
   baseline with the timetable as it exists right now. */
app.get("/api/reports/authority-pdf-diff", requireAnyPermission([7,8,9,10,14,16,17]), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!sectionId||!termId){res.status(400).json({error:"اختر الفصل والكلية والقسم أولاً."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const drafts=await Repository.getScheduleDrafts(collegeId,sectionId,termId);
  const candidates=drafts.filter((item:any)=>item.importLayout==="authority-pdf"&&Array.isArray(item.baselineRows)&&item.baselineRows.length);
  const draft=candidates.find((item:any)=>item.status==="published")||candidates[0];
  if(!draft){res.status(404).json({error:"لا توجد نسخة PDF معتمدة محفوظة لهذا الفصل والقسم بعد."});return;}
  const live=await Repository.getSchedulesByScope({collegeId,sectionId,termId});
  /* An empty live table is still a meaningful comparison: it means every row
     that existed in the imported Authority PDF was deleted. Returning 404 here
     hid the most important possible deletion report. Keep the immutable
     baseline and let buildAuthorityPdfDiff classify every original row as
     `deleted` instead of suppressing the report. */
  const comparison=buildAuthorityPdfDiff(draft.baselineRows||[],live);
  res.json({
    draftId:draft.id,name:draft.name,sourceFileName:draft.sourceFileName||"الجدول المعتمد.pdf",
    sourceBranchCode:inferAuthorityBranchCode(draft,[...(draft.baselineRows||[]),...live]),
    sourceBranchName:draft.sourceBranchName||"",
    importedAt:draft.createdAt,publishedAt:draft.publishedAt||null,
    ...comparison,
  });
});

app.put("/api/intelligence/drafts/:id", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const draft=await Repository.getScheduleDraftById(String(req.params.id)); if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;} if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const fields:any={}; if(typeof req.body?.name==="string")fields.name=req.body.name.slice(0,100); if(Array.isArray(req.body?.rows)){const rows=draft.importLayout==="authority-pdf"?assignAuthoritySections(safeDraftRows(req.body.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId)):safeDraftRows(req.body.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId);if(draft.importLayout==="authority-pdf"&&draft.baselineRows?.length){const baselineByOrder=new Map(draft.baselineRows.map((row:any)=>[Number(row.sourceOrder),row]));const renamed=rows.find((row:any)=>{const base=baselineByOrder.get(Number(row.sourceOrder));return base&&(Number(base.AdCourseId)!==Number(row.AdCourseId)||String(base.AdCourseName)!==String(row.AdCourseName));});if(renamed){res.status(409).json({error:"اسم المقرر من ملف PDF ثابت وفق لائحة الجدول. يمكنك حذف المقرر كاملاً، لكن لا يمكن تبديل اسمه.",code:"COURSE_NAME_LOCKED",rowId:renamed.id});return;}}const issues=await validateSmartRows(rows,draft.AdCollegeId,draft.AdSectionId,{checkConflicts:false,requireDepartmentInstructor:draft.importLayout==="authority-pdf"});if(issues.length){res.status(400).json({error:"المسودة تحتوي بيانات ناقصة أو غير صالحة",issues});return;}fields.rows=rows;} res.json(await Repository.updateScheduleDraft(draft.id,fields));
});
app.patch("/api/intelligence/drafts/:id/rows/:rowId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rowId = Number(req.params.rowId);
  const index = draft.rows.findIndex((row:any) => Number(row.id) === rowId);
  if (index < 0) { res.status(404).json({ error: "الموعد غير موجود داخل المسودة" }); return; }
  const allowed = ["AdInstructorId","fstarttime","fendtime","AdRoomCode","AdRoomHall","buildingId","roomId","locationStatus","sourceBuildingText","sourceRoomText","fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const;
  const nextRaw:any = { ...draft.rows[index] };
  allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) nextRaw[key] = req.body[key]; });
  const candidate = safeDraftRows([nextRaw], draft.AdCollegeId, draft.AdSectionId, draft.AdTermId)[0];
  const locationResult=await canonicalizeLocationForWrite(candidate,draft.AdCollegeId,draft.AdSectionId);
  if(!locationResult.check.ok){res.status(400).json({error:locationResult.check.issues.find(issue=>issue.severity==="high")?.message||"المكان غير صالح",issues:locationResult.check.issues});return;}
  Object.assign(candidate,locationResult.check.canonical||{});
  const structural = await validateSmartRows([candidate], draft.AdCollegeId, draft.AdSectionId, { checkConflicts: false,requireDepartmentInstructor:draft.importLayout==="authority-pdf" });
  if (structural.length) { res.status(400).json({ error: structural[0], issues: structural }); return; }
  const rows = draft.importLayout==="authority-pdf"
    ? assignAuthoritySections(safeDraftRows(draft.rows.map((row:any, i:number) => i === index ? candidate : row), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId))
    : safeDraftRows(draft.rows.map((row:any, i:number) => i === index ? candidate : row), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId);
  const issues = await validateSmartRows(rows, draft.AdCollegeId, draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  const termRows = await Repository.getSchedulesByScope({ termId: draft.AdTermId });
  const external = termRows.filter(row => !(Number(row.AdCollegeId) === draft.AdCollegeId && Number(row.AdSectionId) === draft.AdSectionId));
  const conflictRows = findConflicts(rows as any, [...external, ...rows] as any).filter((item:any) => item.severity === "high" || item.type === "duplicate");
  const rowIssues = mapSmartIssuesToRows(rows, issues, conflictRows);
  const issueRowIds = Object.keys(rowIssues).map(Number);
  const updated = await Repository.updateScheduleDraft(draft.id, { rows });
  res.json({ success: true, row: rows[index], rows: updated.rows, issues, issueRowIds, rowIssues, ready: issues.length === 0 });
});

app.delete("/api/intelligence/drafts/:id/rows/:rowId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const rowId = Number(req.params.rowId || 0);
  if (!draft.rows.some((row:any) => Number(row.id) === rowId)) { res.status(404).json({ error: "الموعد غير موجود داخل المسودة" }); return; }
  const rows = draft.importLayout==="authority-pdf"
    ? assignAuthoritySections(safeDraftRows(draft.rows.filter((row:any) => Number(row.id) !== rowId), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId))
    : safeDraftRows(draft.rows.filter((row:any) => Number(row.id) !== rowId), draft.AdCollegeId, draft.AdSectionId, draft.AdTermId);
  const issues = rows.length ? await validateSmartRows(rows, draft.AdCollegeId, draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"}) : [];
  const termRows = await Repository.getSchedulesByScope({ termId: draft.AdTermId });
  const external = termRows.filter(row => !(Number(row.AdCollegeId) === draft.AdCollegeId && Number(row.AdSectionId) === draft.AdSectionId));
  const conflictRows = rows.length ? findConflicts(rows as any, [...external, ...rows] as any).filter((item:any) => item.severity === "high" || item.type === "duplicate") : [];
  const rowIssues = rows.length ? mapSmartIssuesToRows(rows, issues, conflictRows) : {};
  const issueRowIds = Object.keys(rowIssues).map(Number);
  const updated = await Repository.updateScheduleDraft(draft.id, { rows });
  res.json({ success: true, rows: updated.rows, issues, issueRowIds, rowIssues, ready: rows.length > 0 && issues.length === 0 });
});

app.delete("/api/intelligence/drafts/:id/rows", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "delete-all-draft-rows") { res.status(409).json({ error: "يتطلب حذف الجميع تأكيداً صريحاً" }); return; }
  const draft = await Repository.getScheduleDraftById(String(req.params.id));
  if (!draft) { res.status(404).json({ error: "المسودة غير موجودة" }); return; }
  if (!isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const updated = await Repository.updateScheduleDraft(draft.id, { rows: [] });
  res.json({ success: true, rows: updated.rows, issues: [], issueRowIds: [], rowIssues: {}, ready: false });
});

app.post("/api/intelligence/drafts/:id/publish", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="publish"){res.status(409).json({error:"يتطلب النشر تأكيداً صريحاً من واجهة الاعتماد"});return;}
  const draft=await Repository.getScheduleDraftById(String(req.params.id));
  if(!draft){res.status(404).json({error:"المسودة غير موجودة"});return;}
  if(!isScopeAllowed(req,draft.AdCollegeId,draft.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  if(draft.importLayout==="authority-pdf"&&!await verifyPdfImportReceipt(draft.importReceipt||"",{collegeId:draft.AdCollegeId,sectionId:draft.AdSectionId,termId:draft.AdTermId})){
    res.status(409).json({error:"شهادة مطابقة ترويسة PDF غائبة أو غير صالحة لهذه المسودة؛ أوقف النشر وأعد الاستيراد. لا يمكن تجاوز فحص الفصل والكلية والقسم.",code:"PDF_IMPORT_RECEIPT_INVALID"});return;
  }

  let publishRows=draft.importLayout==="authority-pdf"
    ?assignAuthoritySections(safeDraftRows(draft.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId))
    :safeDraftRows(draft.rows,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId);
  let issues=await validateSmartRows(publishRows,draft.AdCollegeId,draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  let adjusted=0;
  /* Beginning-of-term drafts may only be blocked because the copied placement
     collides with the new term. Repair that case before rejecting: the existing
     optimiser is safety-first and moves time only — never course, teacher, day
     or room. This also repairs genesis drafts created before this release. */
  if(issues.length&&/^بداية الفصل/.test(String(draft.name||""))){
    const termRows=await Repository.getSchedulesByScope({termId:draft.AdTermId});
    const external=termRows.filter(row=>!(Number(row.AdCollegeId)===Number(draft.AdCollegeId)&&Number(row.AdSectionId)===Number(draft.AdSectionId)));
    const original=new Map(publishRows.map(row=>[Number(row.id),`${row.fstarttime}|${row.fendtime}`]));
    for(let pass=0;pass<4;pass++){
      const proposal=autoScheduleProposal(publishRows,[...external,...publishRows]);
      publishRows=proposal.rows;
      if(!proposal.changed)break;
    }
    adjusted=publishRows.filter(row=>original.get(Number(row.id))!==`${row.fstarttime}|${row.fendtime}`).length;
    issues=await validateSmartRows(publishRows,draft.AdCollegeId,draft.AdSectionId,{requireDepartmentInstructor:draft.importLayout==="authority-pdf"});
  }
  if(issues.length){
    const termRows=await Repository.getSchedulesByScope({termId:draft.AdTermId});
    const externalRows=termRows.filter(row=>!(Number(row.AdCollegeId)===draft.AdCollegeId&&Number(row.AdSectionId)===draft.AdSectionId));
    const conflictRows=findConflicts(publishRows as any,[...externalRows,...publishRows] as any).filter((item:any)=>item.severity==="high"||item.type==="duplicate");
    const rowIssues=mapSmartIssuesToRows(publishRows,issues,conflictRows);
    const issueRowIds=Object.keys(rowIssues).map(Number);
    res.status(400).json({error:"لا يمكن نشر المسودة قبل معالجة البيانات",issues,issueRowIds,rowIssues});return;
  }

  await captureScopeVersion(req,draft.AdCollegeId,draft.AdSectionId,draft.AdTermId,`قبل نشر: ${draft.name}`,"publish");
  const rows=await Repository.replaceScheduleScope(draft.AdCollegeId,draft.AdSectionId,draft.AdTermId,publishRows);
  await Repository.updateScheduleDraft(draft.id,{status:"published",rows,publishedAt:new Date().toISOString()});
  const publication=await Repository.upsertSchedulePublication({AdCollegeId:draft.AdCollegeId,AdSectionId:draft.AdSectionId,AdTermId:draft.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:draft.id});
  res.json({success:true,count:rows.length,publication,adjusted});
});

app.get("/api/intelligence/versions", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,80); res.json(versions.map(({rows,...meta})=>({...meta,rowCount:Number(meta.rowCount ?? rows.length)})));
});
app.get("/api/intelligence/versions/compare", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const a=await Repository.getScheduleVersionById(String(req.query.fromId||"")),b=await Repository.getScheduleVersionById(String(req.query.toId||"")); if(!a||!b){res.status(404).json({error:"إحدى النسختين غير موجودة"});return;} if(a.scopeKey!==b.scopeKey||!isScopeAllowed(req,a.AdCollegeId,a.AdSectionId)){res.status(403).json({error:"لا يمكن مقارنة نسخ خارج نطاق القسم"});return;} const key=(r:any)=>`${r.AdCourseId}:${r.SCode}:${r.AdInstructorId}:${activeDays(r).join(",")}:${r.fstarttime}:${r.fendtime}:${r.AdRoomCode}:${r.AdRoomHall}`; const ak=new Set(a.rows.map(key)),bk=new Set(b.rows.map(key)); res.json({from:{id:a.id,label:a.label,createdAt:a.createdAt,count:a.rows.length,rows:a.rows},to:{id:b.id,label:b.label,createdAt:b.createdAt,count:b.rows.length,rows:b.rows},added:[...bk].filter(x=>!ak.has(x)).length,removed:[...ak].filter(x=>!bk.has(x)).length,unchanged:[...bk].filter(x=>ak.has(x)).length});
});
app.post("/api/intelligence/versions/:id/restore", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="restore"){res.status(409).json({error:"يتطلب الاسترجاع تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"النسخة غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId,{resolveHistorical:true}); if(issues.length){res.status(400).json({error:"لا يمكن استرجاع نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل استرجاع: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`restore:${version.id}`}); res.json({success:true,count:rows.length});
});

app.get("/api/intelligence/compare-terms", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),fromTermId=Number(req.query.fromTermId||0),toTermId=Number(req.query.toTermId||0); if(!collegeId||!sectionId||!fromTermId||!toTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [fromData,toData,courses,instructors,terms]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,fromTermId),scopedScheduleUniverse(collegeId,sectionId,toTermId),Repository.getCoursesBySection(sectionId),Repository.getInstructorsByScope(sectionId,0),Repository.getTerms()]); const from=fromData.rows,to=toData.rows; const diff=compareTerms(from,to);
  const courseById=new Map(courses.map(row=>[row.AdCourseId,row]));
  const instructorName=(id:number)=>instructors.find(row=>row.AdInstructorId===id)?.AdInstructorName||"";
  // Rows are shaped for reading, not for editing: code, section, and the
  // properties that differ. Nothing here is writable from this screen.
  const shapeRow=(row:any)=>({
    id:row.id,
    code:courseById.get(row.AdCourseId)?.CourseCode||"",
    name:row.AdCourseName||courseById.get(row.AdCourseId)?.CourseName||"",
    section:row.SCode||"",
    time:formatScheduleTimeRange(row.fstarttime, row.fendtime),
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

app.post("/api/intelligence/import-preview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const raw=Array.isArray(req.body?.rows)?req.body.rows:[]; if(!raw.length){res.status(400).json({error:"الملف لا يحتوي صفوفاً قابلة للقراءة"});return;} if(raw.length>450){res.status(400).json({error:"الملف أكبر من الحد الآمن للاستيراد"});return;} const [courses,instructors]=await Promise.all([Repository.getCourses(),Repository.getInstructors()]); const sectionCourses=courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId); const byCode=new Map(sectionCourses.map(c=>[String(c.CourseCode).trim().toLowerCase(),c])); const byCivil=new Map(instructors.map(i=>[String(i.AdInstructorCivil).trim(),i])); const byName=new Map(instructors.map(i=>[String(i.AdInstructorName).trim().toLowerCase(),i])); const issues:string[]=[]; const rows:any[]=[];
  raw.forEach((item:any,index:number)=>{const code=String(item["رمز المقرر"]??item.CourseCode??item.courseCode??"").trim();const course=byCode.get(code.toLowerCase());const civil=String(item["الرقم المدني"]??item.AdInstructorCivil??item.civil??"").trim();const iname=String(item["أستاذ المقرر"]??item.AdInstructorName??item.instructor??"").trim();const instructor=byCivil.get(civil)||byName.get(iname.toLowerCase());const sectionCode=String(item["الشعبة"]??item.SCode??item.section??"").trim();const time=String(item["الوقت"]??item.time??"").trim();const parts=time.split(/\s*[-–—]\s*/);const start=String(item.fstarttime??item.startTime??parts[1]??parts[0]??"").trim().slice(0,5),end=String(item.fendtime??item.endTime??parts[0]??parts[1]??"").trim().slice(0,5);const dayText=String(item["الأيام"]??item.days??"");const row:any={id:-(index+1),AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:termId,AdCourseId:course?.AdCourseId||0,AdCourseName:course?.CourseName||String(item["المقرر الدراسي"]??""),SCode:sectionCode,AdInstructorId:instructor?.AdInstructorId||0,fsunday:dayText.includes("الأحد")||Boolean(item.fsunday),fmonday:dayText.includes("الاثنين")||Boolean(item.fmonday),ftuesday:dayText.includes("الثلاثاء")||Boolean(item.ftuesday),fwednesday:dayText.includes("الأربعاء")||Boolean(item.fwednesday),fthursday:dayText.includes("الخميس")||Boolean(item.fthursday),fstarttime:start,fendtime:end,AdRoomCode:String(item["المبنى"]??item.AdRoomCode??"").trim(),AdRoomHall:String(item["القاعة"]??item.AdRoomHall??"").trim(),fdetail:""}; row.fdetail=legacyFDetail(row); if(!course)issues.push(`السطر ${index+1}: لم أجد رمز المقرر ${code||"(فارغ)"} في هذا القسم`);if(!instructor)issues.push(`السطر ${index+1}: لم أتعرف على أستاذ المقرر`);rows.push(row);}); const validation=await validateSmartRows(rows,collegeId,sectionId,{resolveHistorical:true}); issues.push(...validation); const duplicateKeys=new Set<string>(),duplicates:string[]=[]; rows.forEach((r:any,i:number)=>{const key=`${r.AdCourseId}:${r.SCode}`;if(duplicateKeys.has(key))duplicates.push(`السطر ${i+1}: مقرر/شعبة مكرر`);duplicateKeys.add(key)});issues.push(...duplicates); res.json({rows,issues:[...new Set(issues)].slice(0,40),valid:issues.length===0,count:rows.length,preview:rows.slice(0,20)});
});

function rowSignatureServer(row:any){return `${row.AdCourseId||0}:${row.SCode||""}:${row.AdInstructorId||0}:${activeDays(row).join(",")}:${row.fstarttime||""}:${row.fendtime||""}:${row.AdRoomCode||""}|${row.AdRoomHall||""}`}


// --- LIVING SCHEDULE LAYER --------------------------------------------------
// All routes below are additive. They read the verified schedule tables and either
// return analysis or create a draft/memory record; none bypasses the existing
// schedule CRUD validation or publication gate.
/**
 * ── ردّ التحليل يُحسب مرة، لا مرة لكل سائل ──────────────────────────────────
 *
 * The living reading hydrates the university's whole term and runs six
 * analyses over it. Measured on production, a cold run cost the single-threaded
 * server up to 27 seconds — and every viewer of the same term paid it again
 * after the row-cache turned over, even though the answer had not changed.
 *
 * The finished JSON is therefore kept per scope and served as-is. Nothing new
 * decides when it dies: it is cleared by exactly the two signals that already
 * clear every schedule cache in this file — a write on this instance
 * (onSchedulesInvalidated) and the cross-instance beacon below — plus a short
 * TTL as the same parachute the row cache wears. Demo sessions bypass it
 * entirely: their world is per-visitor and must never leak between sandboxes.
 */
const livingResponseCache = new Map<string, { at: number; body: string }>();
const LIVING_RESPONSE_TTL_MS = 120_000;
onSchedulesInvalidated(() => livingResponseCache.clear());

app.get("/api/intelligence/living", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, section } = await resolveSmartContext(req);
  if (!collegeId || !sectionId || !termId || !section) { res.status(400).json({ error: "لا يوجد قسم أو فصل دراسي متاح للتحليل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const livingKey = `${collegeId}:${sectionId}:${termId}`;
  const isDemoLiving = Boolean(Repository.currentDemoSessionId());
  if (!isDemoLiving) {
    const held = livingResponseCache.get(livingKey);
    if (held && Date.now() - held.at < LIVING_RESPONSE_TTL_MS) {
      res.type("application/json").send(held.body);
      return;
    }
  }
  const [scheduleData, courses, instructors, terms, constraints] = await Promise.all([
    scopedScheduleUniverse(collegeId,sectionId,termId), Repository.getCourses(), Repository.getInstructors(), Repository.getTerms(), Repository.getScheduleConstraints(collegeId, sectionId, termId)
  ]);
  const {rows,universe}=scheduleData;
  const pulse = buildSchedulePulse(rows, universe, courses, instructors); await breathe();
  const health = buildScheduleHealth2(rows, universe, courses, instructors); await breathe();
  const fairness = buildFairnessEngine(rows, instructors); await breathe();
  const fragility = buildFragilityMap(rows, universe, courses, instructors); await breathe();
  const roomIntelligence = buildRoomResilience(rows, universe); await breathe();
  const topology = buildConflictTopology(rows, universe, courses, instructors); await breathe();
  /* Cheap by comparison: every reading it needs is memoised above and answers
     from cache, so it is left to run without a further pause. */
  const brief = buildOneMinuteBrief(rows, universe, courses, instructors);
  const memories = await Repository.getScheduleDecisionMemories(collegeId, sectionId, 120);
  const livingPayload = {
    context:{collegeId,sectionId,termId,sectionName:section.AdSectionName,termName:terms.find(t=>t.AdTermId===termId)?.AdTermName||""},
    pulse,health,fairness,fragility,roomIntelligence,
    topology,brief,
    memory:buildDecisionMemoryInsight(memories),
    constraints:{count:constraints.filter(c=>c.enabled).length},
    capabilities:{powerAdmin:true,emergency:true,genesis:true,decisionMemory:true,meetingIntelligence:true}
  };
  if (!isDemoLiving) livingResponseCache.set(livingKey, { at: Date.now(), body: JSON.stringify(livingPayload) });
  res.json(livingPayload);
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
  res.json({...explanation,question:String(req.body?.question||"لماذا ليس هذا الحل؟").slice(0,240),answer,memory:isPowerUser(req)?buildDecisionMemoryInsight(memories,selected.AdCourseId):undefined,guardrail:"«لماذا لا؟» يفسر أثر الخيار ولا يطبقه."});
});

app.get("/api/intelligence/decision-memory", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId}=smartContextFrom(req); if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const courseId=Number(req.query.courseId||0); const memories=await Repository.getScheduleDecisionMemories(collegeId,sectionId,250);
  res.json(buildDecisionMemoryInsight(memories,courseId||undefined));
});

app.post("/api/intelligence/decision-memory", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
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
    const row=rows.find(r=>r.id===Number(req.body?.rowId||req.body?.contextId||0)); if(!row){res.status(404).json({error:"الموعد غير موجود في هذا القسم"});return;} const solutions=conflictSolutions(row,universe,5); const options=solutions.slice(0,3).map(sol=>{const candidate={...row,fstarttime:sol.start,fendtime:sol.end,buildingId:sol.buildingId,roomId:sol.roomId,AdRoomCode:sol.roomCode,AdRoomHall:sol.roomHall,locationStatus:"VERIFIED" as const};const why=explainScheduleDecision(rows,universe,candidate,courses,instructors,constraints);return{rank:sol.rank,title:sol.conflicts?`بديل غير قابل للحفظ (${sol.conflicts} مانع)`:"بديل صالح",candidate,verdict:why.verdict,delta:why.delta,positives:why.positives.slice(0,3),tradeoffs:why.tradeoffs.slice(0,2)}}); const best=options[0]; res.json({title:`مساعد القرار · ${row.AdCourseName} / شعبة ${row.SCode}`,summary:best?`أقوى تحسين حالي: ${best.verdict}. الجودة ${best.delta.score>=0?"+":""}${best.delta.score}، وموانع الحفظ ${best.delta.conflicts>=0?"+":""}${best.delta.conflicts}.`:"لا يظهر بديل آمن أفضل من الموعد الحالي.",context:{type:"schedule",rowId:row.id},options,guardrail:"الاقتراحات لا تحفظ شيئاً؛ افتح البديل في نموذج التعديل إذا قررت استخدامه."}); return;
  }
  if(contextType==="room"){
    const key=String(req.body?.value||req.body?.contextId||""); const intel=buildRoomResilience(rows,universe); const room=intel.rooms.find(r=>r.key===key)||intel.rooms[0]; if(!room){res.status(404).json({error:"لا توجد بيانات قاعات"});return;} res.json({title:`مساعد القرار · القاعة ${room.code}/${room.hall}`,summary:room.singlePoint?`هذه القاعة نقطة اعتماد حساسة: ${room.sessions} مواعيد و${room.recoverabilityPct}% فقط قابلة للنقل إلى قاعات بديلة بنفس الوقت.`:`اعتماد القسم على هذه القاعة تحت السيطرة؛ نسبة الاسترداد التقديرية ${room.recoverabilityPct}%.`,context:{type:"room",key:room.key},options:intel.rooms.filter(r=>r.key!==room.key&&r.risk<room.risk).slice(0,3).map(r=>({title:`${r.code}/${r.hall}`,detail:`مخاطرة ${r.risk}/100 · استخدام ${r.sessions} مواعيد`})),guardrail:"هذه قراءة تشغيلية؛ التوفر النهائي يُفحص عند نقل كل موعد."});return;
  }
  if(contextType==="instructor"){
    const id=Number(req.body?.value||req.body?.contextId||0); const fairness=buildFairnessEngine(rows,instructors); const prof=fairness.profiles.find(p=>p.id===id)||fairness.profiles[0]; if(!prof){res.status(404).json({error:"لا توجد بيانات أستاذ"});return;} const own=rows.filter(r=>r.AdInstructorId===prof.id); const suggestions=own.map(row=>{const best=conflictSolutions(row,universe,2)[0];return best?{rowId:row.id,course:row.AdCourseName,current:formatScheduleTimeRange(row.fstarttime, row.fendtime),candidate:formatScheduleTimeRange(best.start, best.end),room:`${best.roomCode}/${best.roomHall}`,conflicts:best.conflicts}:null}).filter(Boolean).slice(0,4); res.json({title:`مساعد القرار · ${prof.name}`,summary:`حمله ${prof.weeklyHours} ساعة على ${prof.days} أيام، وإجمالي الفراغ ${prof.gapMinutes} دقيقة. ${prof.deltaFromAverage>0?`أعلى من متوسط القسم بـ${Math.round(prof.deltaFromAverage)} نقطة.`:"ضمن متوسط القسم تقريباً."}`,context:{type:"instructor",id:prof.id},options:suggestions,guardrail:"ضغط أيام الأستاذ يحتاج مراجعة أكاديمية؛ الاقتراحات لا تطبق تلقائياً."});return;
  }
  if(contextType==="day"){
    const day=String(req.body?.value||req.body?.contextId||""); if(!SCHEDULE_DAYS.some(d=>d.key===day)){res.status(400).json({error:"اليوم غير صالح"});return;} const plans=createEmergencyPlans("day",day,rows,universe,courses,instructors,constraints).plans; const best=[...plans].sort((a,b)=>b.score-a.score||a.changed-b.changed)[0]; const count=rows.filter(r=>Boolean((r as any)[day])).length; res.json({title:`مساعد القرار · ${SCHEDULE_DAYS.find(d=>d.key===day)?.label}`,summary:`اليوم يحمل ${count} موعداً. أفضل سيناريو تخفيف يغيّر ${best?.changed||0} مواعيد مع جودة ${best?.score||0}/100.`,context:{type:"day",day},options:best?best.rows.filter(r=>{const base=rows.find(x=>x.id===r.id);return base&&rowSignatureServer(base)!==rowSignatureServer(r)}).slice(0,5).map(r=>({rowId:r.id,course:r.AdCourseName,time:formatScheduleTimeRange(r.fstarttime, r.fendtime),days:activeDays(r).map(k=>SCHEDULE_DAYS.find(d=>d.key===k)?.label).join("، ")})):[],guardrail:"تخفيف اليوم معروض كسيناريو فقط ولا يغيّر الجدول الحقيقي."});return;
  }
  res.status(400).json({error:"سياق مساعد القرار غير معروف"});
});

app.post("/api/intelligence/emergency", requirePermission(7), requirePowerAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); const kind=String(req.body?.kind||"") as "room"|"day"|"instructor"; if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(!["room","day","instructor"].includes(kind)){res.status(400).json({error:"نوع الحالة الطارئة غير صالح"});return;}
  const value=kind==="instructor"?Number(req.body?.value||0):String(req.body?.value||""); if((kind==="instructor"&&!value)||(kind!=="instructor"&&!value)){res.status(400).json({error:"حدد العنصر المتأثر بالطوارئ"});return;}
  const [scheduleData,courses,instructors,constraints]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول في هذا النطاق"});return;}
  const result=createEmergencyPlans(kind,value,rows,universe,courses,instructors,constraints); if(!result.affected){res.status(400).json({error:"لم أجد مواعيد تتأثر بهذه الحالة"});return;} res.json({...result,guardrail:"الخطط الثلاث سيناريوهات فقط. لا شيء يُنشر قبل حفظه كمسودة ثم اعتماده صراحة."});
});

/**
 * The reading that belongs BEFORE the copy.
 *
 * `/genesis` already builds next term from last term into a draft, and touches
 * nothing real. What it never said is the one thing a coordinator needs first:
 * of three hundred lectures, which carry a decision inside them? A course that
 * has left the catalogue, a teacher on sabbatical, a hall nobody uses any more,
 * a course whose name was rewritten — each of those is a row somebody has to
 * think about, and the other two hundred and eighty are not.
 *
 * This reads; it does not write. The draft is still made by the endpoint below,
 * and only after a person has seen this.
 */
/**
 * ── ما الذي تغيّر تحت الجدول المعتمد ────────────────────────────────────────
 *
 * The one check nobody triggers. It is deliberately lazy: the answer is kept
 * per scope and thrown away the moment ANY schedule anywhere is written, using
 * the change beacon the live feed already runs on. A department that reads this
 * ten times an hour on an unchanged university pays for one scan.
 *
 * There is no cron, no background job, and nothing that wakes a server up.
 */
const driftCache = new Map<string, { serial: number; body: unknown }>();
const historicalTimeCache = new Map<string, { serial:number; expiresAt:number; body:ReturnType<typeof buildHistoricalTimeModel> }>();
let driftSerial = 0;
onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.clear(); });

app.get("/api/intelligence/department-start-rhythm", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0);
  if(!collegeId||!isScopeAllowed(req,collegeId,sectionId)){
    res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"}); return;
  }
  const cacheKey=`${collegeId}:${sectionId}:${termId||"latest"}`;
  const cached=historicalTimeCache.get(cacheKey);
  if(cached&&cached.serial===driftSerial&&cached.expiresAt>Date.now()){res.json(cached.body);return;}
  const [terms,history]=await Promise.all([
    Repository.getTerms(),
    Repository.getSchedulesByScope({collegeId,sectionId}),
  ]);
  // One model answers every card in this department. It knows the department,
  // the active day-pattern and each course separately, with recent terms given
  // more weight than old history. The client picks the narrowest reliable layer.
  const body=buildHistoricalTimeModel(history,terms,10,termId);
  historicalTimeCache.set(cacheKey,{serial:driftSerial,expiresAt:Date.now()+5*60*1000,body});
  if(historicalTimeCache.size>180)historicalTimeCache.clear();
  res.json(body);
});

app.get("/api/intelligence/settled-drift", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  if (!collegeId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const key = `${collegeId}:${sectionId}`;
  const cached = driftCache.get(key);
  if (cached && cached.serial === driftSerial) { res.json(cached.body); return; }

  const terms = await Repository.getTerms();
  const { term } = settledTerm(terms);
  const newest = sortTermsNewestServer(terms)[0];

  /* What the system has worked out about this department, so the board can
     show it rather than ask for it. It is a statement, not an offer — there is
     nothing here to accept. */
  const readHabit = async () => {
    const style = await departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId,
      AdTermId: newest?.AdTermId || 0 });
    if (!style.reading) return null;
    const sentence = describeRhythm(style.reading);
    return sentence ? {
      sentence,
      patterns: style.reading.patterns
        .filter(pattern => pattern.breakMinutes || pattern.durationMinutes)
        .map(pattern => ({
          days: pattern.days, breakMinutes: pattern.breakMinutes,
          durationMinutes: pattern.durationMinutes, durationRange: pattern.durationRange,
          ladder: pattern.ladder, lectures: pattern.lectures,
        })),
      learnedFrom: style.reading.learnedFrom,
    } : null;
  };

  if (!term) {
    // Nothing has been closed yet, and saying "no problems" would be a claim
    // about a check that has not run.
    const body = {
      watching: false,
      reason: "لا يوجد فصل معتمد بعد — الاعتماد يتحقق بإنشاء الفصل التالي.",
      habit: await readHabit(),
    };
    driftCache.set(key, { serial: driftSerial, body });
    res.json(body);
    return;
  }

  /* One indexed read for the whole university's term, which the row cache
     already memoises, and one scoped read for the department's own rows. */
  const [universe, mine, rules] = await Promise.all([
    Repository.getSchedulesByScope({ termId: term.AdTermId }),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId: term.AdTermId }),
    Repository.getScheduleConstraints(collegeId, sectionId, term.AdTermId).catch(() => []),
  ]);
  const doorway = Number(rules.find(item => item.type === "room_doorway" && item.enabled !== false)?.maxMinutes || 0);
  const reading = readSettledDrift(terms, mine, universe,
    other => Boolean(req.user?.IsAdminUser || isScopeAllowed(req, other.AdCollegeId, other.AdSectionId)),
    { doorwayMinutes: Math.max(0, Math.min(60, doorway)) });

  const courses = reading.findings.length ? await Repository.getCourses() : [];
  const nameOf = (row: any) => row?.AdCourseName
    || courses.find(course => course.AdCourseId === row?.AdCourseId)?.CourseName || "موعد";
  const habit = await readHabit();
  const body = {
    watching: true,
    term: { id: term.AdTermId, name: term.AdTermName },
    // The habit the department keeps but has never written down.
    habit,
    scanned: reading.scanned,
    total: reading.findings.length,
    foreign: reading.foreign,
    headline: reading.headline,
    // The honest limit, carried with the answer so the interface cannot forget
    // to say it: silence here means nothing was FOUND, not that nothing is wrong.
    limit: "يقرأ ما هو مسجَّل في هذا النظام فقط؛ إغلاق قاعة أو جدول خارج النظام لا يظهر هنا.",
    findings: reading.findings.slice(0, 40).map(item => ({
      rowId: item.row.id, otherId: item.other ? item.otherId : 0,
      name: nameOf(item.row),
      otherName: item.other ? nameOf(item.other) : "",
      day: SCHEDULE_DAY_KEYS.find(key => Boolean((item.row as any)[key])) || "",
      time: formatScheduleTimeRange(item.row.fstarttime, item.row.fendtime),
      room: [item.row.AdRoomCode, item.row.AdRoomHall].filter(Boolean).join("/"),
      type: item.type, message: item.message, detail: item.detail, foreign: item.foreign,
    })),
  };
  driftCache.set(key, { serial: driftSerial, body });
  if (driftCache.size > 200) driftCache.clear();
  res.json(body);
});

app.get("/api/intelligence/rollover", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const sourceTermId = Number(req.query.sourceTermId || 0);
  if (!collegeId || !sectionId || !sourceTermId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [source, courses, instructors, everyRow] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId: sourceTermId }),
    Repository.getCourses(),
    Repository.getInstructors(),
    Repository.getSchedules(),
  ]);
  const catalogue = courses.filter(course => course.AdCollegeId === collegeId && course.AdSectionId === sectionId);
  // "Still in use" means: this hall appears somewhere in the system today. A
  // room is not retired because this department stopped using it.
  const liveRooms = [...new Set(everyRow.map(row => roomIdentityKey(row)).filter(Boolean))];
  /* The department's own history, every term of it. `everyRow` is already in
     hand for the retired-hall sweep, so the style reading costs one filter and
     no extra read. */
  const history = everyRow.filter(row =>
    Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId);
  const reading = readTermRollover(source, catalogue, instructors, liveRooms, history);
  res.json({
    ...reading,
    // Same reason as the concerns below: the screen names a few, not all.
    style: reading.style ? {
      inStyle: reading.style.inStyle,
      offStyle: reading.style.offStyle,
      share: reading.style.share,
      learnedFrom: reading.style.learnedFrom,
      notes: reading.style.notes.slice(0, 6).map(note => ({
        id: note.row.id,
        course: note.row.AdCourseName || "",
        section: note.row.SCode,
        text: note.text,
      })),
    } : null,
    // The rows themselves are heavy and the screen only lists a few.
    concerns: reading.concerns.slice(0, 40).map(concern => ({
      id: concern.row.id,
      course: concern.row.AdCourseName || "",
      section: concern.row.SCode,
      flags: concern.flags,
      why: concern.why,
    })),
    concernCount: reading.concerns.length,
    sentence: describeRollover(reading),
    guardrail: "قراءة فقط. لم يُنشأ شيء ولم يتغيّر شيء.",
  });
});

app.post("/api/intelligence/genesis", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),targetTermId=Number(req.body?.targetTermId||req.body?.termId||0),sourceTermId=Number(req.body?.sourceTermId||0); if(!collegeId||!sectionId||!targetTermId||!sourceTermId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} if(sourceTermId===targetTermId){res.status(400).json({error:"اختر فصلاً سابقاً مختلفاً عن الفصل الجديد"});return;}
  const [source,targetUniverse,courses,instructors,terms,constraints]=await Promise.all([Repository.getSchedulesByScope({collegeId,sectionId,termId:sourceTermId}),Repository.getSchedulesByScope({termId:targetTermId}),Repository.getCourses(),Repository.getInstructors(),Repository.getTerms(),Repository.getScheduleConstraints(collegeId,sectionId,targetTermId)]); if(!source.length){res.status(400).json({error:"الفصل السابق لا يحتوي جدولاً لهذا القسم"});return;}
  const validCourseIds=new Set(courses.filter(c=>c.AdCollegeId===collegeId&&c.AdSectionId===sectionId).map(c=>c.AdCourseId));
  const validInstructorIds=new Set(instructors.map(i=>Number(i.AdInstructorId)));
  const sourceByCourse=new Map<number,FSchedule[]>();
  source.forEach(row=>{const list=sourceByCourse.get(Number(row.AdCourseId))||[];list.push(row);sourceByCourse.set(Number(row.AdCourseId),list);});
  const candidateRows=source
    .filter(r=>validCourseIds.has(r.AdCourseId))
    .map((r,index)=>{
      const siblings=sourceByCourse.get(Number(r.AdCourseId))||[];
      const instructorId=validInstructorIds.has(Number(r.AdInstructorId))
        ? Number(r.AdInstructorId)
        : Number(siblings.find(x=>validInstructorIds.has(Number(x.AdInstructorId)))?.AdInstructorId||0);
      const roomSibling=siblings.find(x=>String(x.AdRoomCode||"").trim()&&String(x.AdRoomHall||"").trim());
      const sectionCode=asciiDigits(r.SCode).replace(/\D/g,"")||String(index+1);
      return{...r,id:-(index+1),AdTermId:targetTermId,SCode:sectionCode,AdInstructorId:instructorId,
        AdRoomCode:String(r.AdRoomCode||"").trim()||String(roomSibling?.AdRoomCode||"").trim(),
        AdRoomHall:String(r.AdRoomHall||"").trim()||String(roomSibling?.AdRoomHall||"").trim()};
    });
  if(!candidateRows.length){res.status(400).json({error:"لم أجد مواعيد قابلة للنسخ لهذا القسم في الفصل السابق"});return;}
  /* A beginning-of-term draft should be reviewable and, when the only problem
     is a target-term collision, publishable without a dead end. Normalise old
     identifiers and then run the safety-first optimiser against the target
     term. It preserves course, instructor, days and room; only safe time shifts
     are allowed. */
  const initialRows=safeDraftRows(candidateRows,collegeId,sectionId,targetTermId);
  const external=targetUniverse.filter(r=>!(Number(r.AdCollegeId)===collegeId&&Number(r.AdSectionId)===sectionId));
  let rows=initialRows;
  for(let pass=0;pass<4;pass++){
    const proposal=autoScheduleProposal(rows,[...external,...rows]);
    rows=proposal.rows;
    if(!proposal.changed)break;
  }
  const adjustedRows=rows.filter((row,index)=>row.fstarttime!==initialRows[index]?.fstarttime||row.fendtime!==initialRows[index]?.fendtime).length;
  const issues=await validateSmartRows(rows,collegeId,sectionId);
  const genesisConflicts=findConflicts(rows as any,[...external,...rows] as any).filter((item:any)=>item.severity==="high"||item.type==="duplicate");
  const rowIssues=mapSmartIssuesToRows(rows,issues,genesisConflicts);
  const issueRowIds=Object.keys(rowIssues).map(Number);
  const universe=external.concat(rows); const analysis=analyzeSchedule(rows,universe,courses,instructors); const rules=evaluateScheduleConstraints(rows,constraints); const draft=await Repository.createScheduleDraft({SystemUserId:req.user.SystemUserId,userName:req.user.Name,AdCollegeId:collegeId,AdSectionId:sectionId,AdTermId:targetTermId,name:`بداية الفصل · ${terms.find(t=>t.AdTermId===sourceTermId)?.AdTermName||sourceTermId} → ${terms.find(t=>t.AdTermId===targetTermId)?.AdTermName||targetTermId}`,source:"auto",rows});
  const courseById=new Map(courses.map(course=>[Number(course.AdCourseId),course]));
  const instructorById=new Map(instructors.map(instructor=>[Number(instructor.AdInstructorId),instructor]));
  const previewRows=draft.rows.map((row,index)=>({
    index:index+1,id:row.id,courseCode:courseById.get(Number(row.AdCourseId))?.CourseCode||"",courseName:row.AdCourseName||courseById.get(Number(row.AdCourseId))?.CourseName||"مقرر",
    section:row.SCode||"",instructor:instructorById.get(Number(row.AdInstructorId))?.AdInstructorName||"بدون أستاذ",
    days:SCHEDULE_DAY_KEYS.map((key,i)=>row[key]?DAY_LABELS[i]:null).filter(Boolean).join(" · "),start:row.fstarttime,end:row.fendtime,
    fsunday:Boolean(row.fsunday),fmonday:Boolean(row.fmonday),ftuesday:Boolean(row.ftuesday),fwednesday:Boolean(row.fwednesday),fthursday:Boolean(row.fthursday),
    building:row.AdRoomCode||"",hall:row.AdRoomHall||"",
  }));
  res.status(201).json({draft:{id:draft.id,name:draft.name,status:draft.status,rowCount:draft.rows.length},analysis:{score:analysis.score,conflicts:analysis.metrics.criticalConflicts,avgGap:analysis.metrics.avgInstructorGap,constraintViolations:rules.total},coverage:{sourceRows:source.length,copiedRows:rows.length,skippedRows:source.length-rows.length,adjustedRows},reviewRequired:issues.length,issues:issues.slice(0,24),issueRowIds,rowIssues,previewRows,guardrail:issues.length?`أُنشئت المسودة بنجاح وبها ${issues.length} ملاحظة للمراجعة قبل النشر؛ الجدول الحقيقي لم يتغير.`:"بداية الفصل أنشأت مسودة كاملة قابلة للمراجعة؛ الجدول الرسمي لم يتغير بعد."});
});

app.get("/api/intelligence/brief", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,versions]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleVersions(collegeId,sectionId,termId,2)]); const {rows,universe}=scheduleData; let changedSince: number|undefined=undefined; if(versions[0]){const before=new Map(versions[0].rows.map(r=>[r.id,rowSignatureServer(r)]));changedSince=rows.filter(r=>before.get(r.id)!==rowSignatureServer(r)).length+versions[0].rows.filter(r=>!rows.some(x=>x.id===r.id)).length;} res.json(buildOneMinuteBrief(rows,universe,courses,instructors,changedSince));
});

app.post("/api/intelligence/meeting-minutes", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const [scheduleData,courses,instructors,constraints,memories]=await Promise.all([scopedScheduleUniverse(collegeId,sectionId,termId),Repository.getCourses(),Repository.getInstructors(),Repository.getScheduleConstraints(collegeId,sectionId,termId),Repository.getScheduleDecisionMemories(collegeId,sectionId,120)]); const {rows,universe}=scheduleData; if(!rows.length){res.status(400).json({error:"لا يوجد جدول لبناء محضر قرار"});return;} const war=buildWarRoom(rows,universe,courses,instructors,constraints,Number(req.body?.rowId||0)||undefined); const chosen=war.options?.find((x:any)=>x.id===String(req.body?.optionId||""))||war.options?.[0]; const issueRowId=war.issue?.rowId; const comments=issueRowId?await Repository.getScheduleComments(issueRowId):[]; const recentMemory=memories.filter(m=>!war.issue?.rowId||m.scheduleId===war.issue.rowId||m.AdCourseId===rows.find(r=>r.id===war.issue.rowId)?.AdCourseId).slice(0,5); const minutes={title:"محضر قرار الجدول",problem:war.issue?`${war.issue.courseName} · شعبة ${war.issue.sectionCode} — ${war.issue.conflictCount} موضع يحتاج تحقق قبل الاعتماد.`:"مراجعة عامة للجدول",alternatives:(war.options||[]).map((o:any)=>({id:o.id,title:o.title,reason:o.reason,score:o.score,conflicts:o.conflicts,changed:o.changed})),selected:chosen?{id:chosen.id,title:chosen.title,reason:chosen.reason,score:chosen.score,conflicts:chosen.conflicts,changed:chosen.changed}:null,expectedImpact:chosen?`الجودة ${war.baseline.score} ← ${chosen.score}، وموانع الحفظ ${war.baseline.conflicts} ← ${chosen.conflicts}، وعدد المواعيد المتغيرة ${chosen.changed}.`:"لم يُحدد بديل.",discussion:comments.slice(0,8).map(c=>({text:c.text,user:c.userName,createdAt:c.createdAt,resolved:c.resolved})),memory:recentMemory.map(m=>({reason:m.reason,kind:m.kind,createdAt:m.createdAt,user:m.userName})),approvedBy:String(req.body?.approvedBy||req.user.Name).slice(0,120),generatedAt:new Date().toISOString()}; res.json(minutes);
});

app.get("/api/intelligence/safety-net", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const {collegeId,sectionId,termId}=smartContextFrom(req); if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const versions=await Repository.getScheduleVersions(collegeId,sectionId,termId,18); res.json(versions.map(v=>({id:v.id,createdAt:v.createdAt,label:v.label,source:v.source,userName:v.userName,rowCount:Number(v.rowCount ?? v.rows.length),decisionLabel:`استرجع الجدول إلى ${v.label}`})));
});

app.post("/api/intelligence/safety-net/:id/undo", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  if(req.get("x-schedule-confirm")!=="decision-undo"){res.status(409).json({error:"يتطلب التراجع عن القرار تأكيداً صريحاً"});return;} const version=await Repository.getScheduleVersionById(String(req.params.id)); if(!version){res.status(404).json({error:"نقطة الأمان غير موجودة"});return;} if(!isScopeAllowed(req,version.AdCollegeId,version.AdSectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;} const restored=safeDraftRows(version.rows,version.AdCollegeId,version.AdSectionId,version.AdTermId); const issues=await validateSmartRows(restored,version.AdCollegeId,version.AdSectionId,{resolveHistorical:true}); if(issues.length){res.status(400).json({error:"لا يمكن التراجع إلى نسخة تحتوي أوقاتاً أو تعارضات غير صالحة",issues});return;} await captureScopeVersion(req,version.AdCollegeId,version.AdSectionId,version.AdTermId,`قبل التراجع عن القرار: ${version.label}`,"undo"); const rows=await Repository.replaceScheduleScope(version.AdCollegeId,version.AdSectionId,version.AdTermId,restored); await Repository.upsertSchedulePublication({AdCollegeId:version.AdCollegeId,AdSectionId:version.AdSectionId,AdTermId:version.AdTermId,SystemUserId:req.user.SystemUserId,userName:req.user.Name,draftId:`decision-undo:${version.id}`}); res.json({success:true,count:rows.length,message:`تمت العودة إلى ${version.label}`});
});



/**
 * Root-only full-system vault.
 *
 * The portable backup contains every durable document (including historical
 * archives, audit, versions, drafts, surveys, publications and metadata). Live
 * session tokens and the server's own rollback copies are not exported because
 * they are bearer credentials / safety infrastructure, not university data.
 */
app.get("/api/system-backup/status", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const [restorePoints, latestExport, latestImport] = await Promise.all([
    Repository.getSystemRestorePoints(),
    Repository.getLatestSystemExportJob(ROOT_ADMIN_USER_ID),
    Repository.getLatestSystemImportJob(ROOT_ADMIN_USER_ID),
  ]);
  res.json({
    rootOnly: true,
    data: activeDataMode(),
    restorePoints,
    latest: restorePoints.find(point => !point.consumedAt) || null,
    latestExport,
    latestImport,
  });
});

/*
 * Durable, resumable export pipeline.
 *
 * Every step is deliberately short enough to fit comfortably inside Cloud Run
 * request limits. Progress and staging chunks live in Firestore, so closing the
 * browser loses no completed work; reopening the root vault can resume the same
 * job. The final download is only a read of already-built gzip chunks and no
 * longer performs a database walk while the browser waits for a file.
 */
app.post("/api/system-backup/export-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const forceNew = req.query.force === "true" || req.body?.force === true;
  const job = await Repository.startSystemExportJob(req.user!.SystemUserId, ROOT_ADMIN_USER_ID, forceNew);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.delete("/api/system-backup/export-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  await Repository.clearSystemExportJobs(ROOT_ADMIN_USER_ID);
  res.status(200).json({ success: true });
});

app.get("/api/system-backup/export-jobs/:id", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await Repository.getSystemExportJob(String(req.params.id), ROOT_ADMIN_USER_ID));
});

app.post("/api/system-backup/export-jobs/:id/step", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const job = await Repository.advanceSystemExportJob(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.get("/api/system-backup/export-jobs/:id/download", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const file = await Repository.readSystemExportFile(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${String(file.summary.filename || "schedule-full-backup.json.gz").replace(/[\"\r\n]/g, "")}"`);
  res.setHeader("Content-Length", String(file.summary.sizeBytes || file.chunks.reduce((sum, chunk) => sum + chunk.length, 0)));
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (file.summary.sha256) res.setHeader("X-Backup-SHA256", file.summary.sha256);
  res.setHeader("X-Backup-Documents", String(file.summary.documentCount));
  for (const chunk of file.chunks) res.write(chunk);
  res.end();
});

// The old one-request export was the source of the 5/12-minute dead wait. Keep
// a clear response for stale clients instead of silently starting that path.
app.get("/api/system-backup/export", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(409).json({ error: "تم استبدال التصدير المباشر بتصدير متدرج وآمن. افتح خزنة النظام وابدأ التصدير من هناك." });
});

app.post("/api/system-backup/preview", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const input = readSystemBackupBody(req);
  const backup = await Repository.validateSystemBackup(input, ROOT_ADMIN_USER_ID);
  res.json({
    valid: true,
    backupId: backup.backupId,
    createdAt: backup.createdAt,
    storage: backup.storage,
    documentCount: backup.summary.documentCount,
    collectionCounts: backup.summary.collectionCounts,
    sha256: backup.integrity.sha256,
  });
});

/*
 * Resumable import pipeline.
 *
 * The previous endpoint performed validation, safety export, and the complete
 * Firestore replacement inside one HTTP request. On a real 36k-document backup
 * that request could sit at 1% until a gateway timeout even while the server was
 * working. The source is now staged once, then every following request advances
 * exactly one durable checkpoint. Closing the browser does not lose progress.
 */
app.post("/api/system-backup/import-jobs", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-IMPORT") {
    res.status(409).json({ error: "الاستيراد الكامل يحتاج تأكيداً صريحاً" });
    return;
  }
  const input = readSystemBackupBody(req);
  const job = await Repository.startSystemImportJob(input, req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.get("/api/system-backup/import-jobs/:id", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await Repository.getSystemImportJob(String(req.params.id), ROOT_ADMIN_USER_ID));
});

app.post("/api/system-backup/import-jobs/:id/step", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const job = await Repository.advanceSystemImportJob(String(req.params.id), ROOT_ADMIN_USER_ID);
  res.status(job.status === "ready" ? 200 : 202).json(job);
});

app.post("/api/system-backup/import", requireAuth, requireRootAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(409).json({ error: "تم استبدال الاستيراد المباشر باستيراد متدرج قابل للاستكمال. افتح خزنة النظام واضغط «استيراد» من جديد." });
});

app.post("/api/system-backup/reset", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-RESET" || String(req.body?.phrase || "") !== "تصفير النظام") {
    res.status(409).json({ error: "اكتب «تصفير النظام» للتأكيد" });
    return;
  }
  const restorePoint = await Repository.resetSystem(req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.json({
    success: true,
    message: "تم تصفير بيانات العمل. بقي حساب الإدارة الرئيسي فقط مع نقطة تراجع جاهزة.",
    restorePoint,
  });
});

app.post("/api/system-backup/undo", requireAuth, requireRootAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (req.get("x-schedule-confirm") !== "FULL-SYSTEM-UNDO") {
    res.status(409).json({ error: "التراجع الكامل يحتاج تأكيداً صريحاً" });
    return;
  }
  const result = await Repository.undoLastSystemOperation(req.user!.SystemUserId, ROOT_ADMIN_USER_ID);
  res.json({
    success: true,
    message: `تمت العودة إلى نقطة الأمان: ${result.restored.action}`,
    restored: result.restored,
    redoPoint: result.redoPoint,
  });
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
  /* A new department used to start with nothing at all: an account that logs in
     to an empty rail and waits for somebody to remember to tick a box. Form 7
     is the whole operational baseline — the schedule workspace and مركز الذكاء
     — and every route a scheduler needs accepts it. So it is granted on
     creation, and the account works the first time it signs in. Anything beyond
     it is still a deliberate decision on the permissions screen. */
  await Repository.createSecurity(newUser.SystemUserId, DECISION_CENTRE_FORM_ID);
  res.status(201).json({ ...safeSystemUser(newUser), HasPassword: true });
});

/**
 * ── مركز الذكاء لكل الأقسام ─────────────────────────────────────────────────
 *
 * The screen has existed for a while; the permission behind it did not travel
 * with it. Departments created before it — and any account an administrator set
 * up field by field — can be missing form 7 entirely, so the rail simply never
 * shows مركز الذكاء and nobody can tell whether the feature is absent or the
 * permission is.
 *
 * This grants it to every account that should have it, once. It is idempotent
 * by construction: an account that already holds the permission is counted and
 * skipped, never duplicated. It touches nothing else — no other form id, no
 * account that is deleted or deactivated — and it reports exactly what it did.
 */
app.post("/api/users/grant-decision-centre", requirePermission(11), requirePowerAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const users = (await Repository.getUsers()).filter(user => !user.IsDeleted && user.IsActive !== false);
  let granted = 0, alreadyHad = 0;
  const names: string[] = [];
  for (const user of users) {
    const held = (await Repository.getSecurityByUser(user.SystemUserId)).map(row => Number(row.FormNameId));
    if (held.includes(DECISION_CENTRE_FORM_ID)) { alreadyHad += 1; continue; }
    await Repository.createSecurity(user.SystemUserId, DECISION_CENTRE_FORM_ID);
    granted += 1;
    if (names.length < 40) names.push(user.Name || user.SystemUserLogin || `#${user.SystemUserId}`);
  }
  res.locals.auditChanges = `منح مركز الذكاء: ${granted} حساب جديد، ${alreadyHad} كان لديه الصلاحية`;
  res.json({ granted, alreadyHad, total: users.length, names });
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
  if(!resolvedTermId){const terms=await Repository.getTerms();resolvedTermId=Number(sortTermsNewestServer(terms)[0]?.AdTermId||0);}
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

  schedules.sort((a, b) =>
    courseNameCollator.compare(
      String(courseById.get(a.AdCourseId)?.CourseName || a.AdCourseName || ""),
      String(courseById.get(b.AdCourseId)?.CourseName || b.AdCourseName || ""),
    ) || String(a.SCode || "").localeCompare(String(b.SCode || ""), "ar", { numeric: true }) || String(a.fstarttime || "").localeCompare(String(b.fstarttime || ""))
  );

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
      "الوقت": formatScheduleTimeRange(s.fstarttime, s.fendtime),
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
    const known = new Map<string, { room: string; hall: string; roomId: string; buildingId?: string }>();
    universe.forEach(row => {
      const key=verifiedRoomKey(row); if (!key) return;
      known.set(key, { room: String(row.AdRoomCode||""), hall: String(row.AdRoomHall||""), roomId: String(row.roomId||""), buildingId: row.buildingId });
    });
    const busy = new Set(
      universe.filter(row => onDay(row, parsed.day) && atTime(row, parsed.time))
        .map(row => verifiedRoomKey(row)).filter(Boolean)
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
  if (!termId) termId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
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
    const rooms = new Set(rows.map(row => verifiedRoomKey(row)).filter(Boolean));
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
  // القاعات الظاهرة للمستخدم العادي تظل داخل قسمه. نحتاج جدول الفصل
  // الكامل فقط لمعرفة أن قاعته محجوزة من جهة أخرى، لا لعرض قاعات الآخرين.
  if (!req.user.IsAdminUser && (!collegeId || !sectionId || !isScopeAllowed(req, collegeId, sectionId))) {
    res.status(403).json({ error: "خارج نطاق القسم المسموح لك" });
    return;
  }
  if (!termId) { const terms = await Repository.getTerms(); termId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0); }

  const { rows, universe } = await scopedScheduleUniverse(collegeId, sectionId, termId);
  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  // Room utilization is intentionally official-only. Pending and historical
  // unresolved locations are separate data-quality signals and must never
  // inflate the number or occupancy of real rooms.
  const roomKey = (row: FSchedule) => verifiedRoomKey(row);
  const mineKeys = new Set(rows.map(roomKey).filter(Boolean));

  const rooms = new Map<string, { room: string; hall: string; roomId: string; buildingId?: string; mine: boolean; busy: Array<{ day: number; from: number; to: number; mine: boolean }> }>();
  const mineIds = new Set(rows.map(row => row.id));
  universe.forEach(row => {
    const key = roomKey(row);
    if (!key || !mineKeys.has(key)) return;
    const entry = rooms.get(key) || { room: String(row.AdRoomCode||"").trim(), hall: String(row.AdRoomHall||"").trim(), roomId: String(row.roomId||""), buildingId: row.buildingId, mine: mineKeys.has(key), busy: [] };
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
    /* Building first, hall second, each by its NUMBER: «7/31» before «8/22»,
       and «9» before «10» — a plain locale compare read them as words and put
       ten before nine. */
    rooms: [...rooms.values()].sort((a, b) => byRoom(a.room, a.hall, b.room, b.hall))
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
        // Carried for the calendar feed: a subscriber's copy of an appointment
        // is only replaced when the version it holds is older than this one.
        rev: Number(row.rev || 0),
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
    availableTerms: sortTermsNewestServer(terms).map(t => ({ id: t.AdTermId, name: t.AdTermName })),
    /* Only the newest term is LIVE. An older one is a record: reporting an
       apology against a semester that has ended asks the department to act on
       something already past, and subscribing a phone to it fills a calendar
       with lectures that will never happen again. Both are offered on the
       current term alone. */
    liveTermId: sortTermsNewestServer(terms)[0]?.AdTermId || 0,
    expiresAt: link.expiresAt,
    // The subscription key. Handed out only here — after the card has already
    // established who is holding it — so the civil ID never reaches a URL.
    calendarKey: calendarKey(link.id, person.AdInstructorId),
    weeklyMinutes,
    lectureCount: shaped.length,
    dayCount: byDay.filter(day => day.rows.length).length,
    rooms: Array.from(new Set(shaped.map(row => `${row.room}/${row.hall}`).filter(value => value !== "/"))),
    longestGap: Math.max(0, ...byDay.flatMap(day => day.gaps.map(gap => gap.minutes))),
    byDay,
    rows: shaped
  };
}

app.get("/api/share", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  res.json(await Repository.getShareLinks(collegeId, sectionId, termId));
});

app.post("/api/share", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0), termId = Number(req.body?.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل" }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const days = Math.min(SHARE_MAX_DAYS, Math.max(1, Number(req.body?.days || 30)));
  /* The survey door could be opened by the public routes but never issued by
     anything, so no student link could exist. The section carries the cohort,
     so the boys' link and the girls' link are simply two links on two
     sections — no gender is ever inferred from a name. */
  const kind = req.body?.kind === "staff" ? "staff"
    : req.body?.kind === "survey" ? "survey"
    : "department";
  const [sections, terms] = await Promise.all([Repository.getSections(), Repository.getTerms()]);
  const sectionName = sections.find(row => row.AdSectionId === sectionId)?.AdSectionName || "قسم";
  const termName = terms.find(row => row.AdTermId === termId)?.AdTermName || "";
  const label = kind === "staff"
    ? `بطاقات الأساتذة · ${termName}`.trim()
    : kind === "survey"
      ? `استبيان المقررات · ${sectionName} · ${termName}`.trim()
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

app.delete("/api/share/:id", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
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

/**
 * A term's length is not recorded anywhere in this system — terms carry a name
 * and nothing else — so the series has to be given a length, and the honest
 * thing is to name the number in one place rather than bury it in a string.
 */
/* Used only when a term has no recorded length. Sixteen weeks is a common
   Kuwaiti semester and it is still a guess — which is why the feed labels
   itself when it is guessing. */
const TERM_WEEKS = 16;

/**
 * Sends a calendar, with the headers that make a browser show a subscription.
 *
 * A subscribed feed is re-read by every phone that holds it, several times a
 * day, forever. Almost every one of those reads finds a file identical to the
 * last, so the response carries an ETag: an unchanged week costs a 304 and no
 * body at all. That is the difference between a feed a department can hand to
 * four hundred people and one it cannot.
 */
async function sendCalendar(req: Request, res: Response, name: string, termId: number, lectures: CalendarLecture[], singles: CalendarSingle[] = []) {
  const term = (await Repository.getTerms()).find(row => row.AdTermId === termId);
  const startDate = term?.AdTermStart;
  const weeks = Number(term?.AdTermWeeks) || TERM_WEEKS;
  // Opt-in only, and named in the URL so the subscriber's own choice travels
  // with their subscription instead of being decided for everyone.
  const alarmMinutes = Math.max(0, Math.min(120, Number(req.query.alarm || 0)));

  const body = buildCalendar({
    // A calendar that had to guess its own term says so in the name it puts on
    // the subscriber's phone, rather than presenting an invented semester as if
    // it were the registrar's.
    name: startDate ? name : `${name} (تواريخ الفصل غير مسجّلة)`,
    description: startDate
      ? `${term?.AdTermName || ""} · يبدأ ${startDate} ويستمر ${weeks} أسبوعاً · للقراءة فقط، ويُحدَّث من نفسه.`
      : `${term?.AdTermName || ""} · تواريخ الفصل غير مسجّلة، والمدة تقديرية (${weeks} أسبوعاً) · للقراءة فقط.`,
    weeks, startDate, alarmMinutes, lectures, singles,
  });

  /* Weak, because the only thing that must match is the meaning of the file:
     DTSTAMP moves on every build and would defeat a strong comparison for no
     reason. Hashing the body without its stamps is what makes the tag stable. */
  const tag = `W/"${createHmac("sha256", "ics").update(body.replace(/^DTSTAMP:.*$/gm, "")).digest("hex").slice(0, 24)}"`;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="schedule.ics"`);
  res.setHeader("ETag", tag);
  // Re-validate every time, but let the tag decide whether a body is needed.
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  if (req.headers["if-none-match"] === tag) { res.status(304).end(); return; }
  res.send(body);
}

app.get("/api/public/ics/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }
  if (resolved.link.kind === "staff") { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }
  const payload = await buildSharePayload(resolved.link);
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  /* A lecture cancelled on one specific date disappears from that one date in
     every subscribed phone — this is the feed "speaking by itself". A covered
     date stays: the class still happens for its students. */
  const exceptions = await Repository.getScheduleWeekExceptions(Number(resolved.link.AdTermId));
  const cancelledBySchedule = new Map<number, string[]>();
  for (const entry of exceptions) {
    if (entry.kind !== "cancel") continue;
    if (!cancelledBySchedule.has(entry.scheduleId)) cancelledBySchedule.set(entry.scheduleId, []);
    cancelledBySchedule.get(entry.scheduleId)!.push(entry.date);
  }
  await sendCalendar(req, res, payload.label || "الجدول الدراسي", resolved.link.AdTermId, payload.rows.map(row => ({
    id: row.id,
    title: [row.code, row.name].filter(Boolean).join(" · "),
    code: row.code, section: row.section, instructor: row.instructor,
    room: [row.room, row.hall].filter(Boolean).join(" / "),
    start: row.start, end: row.end, days: row.days, revision: row.rev,
    cancelledDates: cancelledBySchedule.get(Number(row.id)),
  })));
});

/**
 * ── تقويم الأستاذ ───────────────────────────────────────────────────────────
 *
 * A calendar subscription is one URL fetched by a phone forever, with no way to
 * send anything alongside it — no form, no header a person could fill in. So the
 * civil ID cannot be the key: it would sit in the URL, in the phone's account
 * settings, and in every server log that ever touches it.
 *
 * Instead the card — which has already proved who is holding it — hands out a
 * derived key: an HMAC over the link and the instructor's row id. It reveals no
 * civil ID, cannot be reversed into one, cannot be guessed without the server's
 * secret, and dies the moment the link that produced it is revoked or expires.
 */
const CALENDAR_SECRET = process.env.CALENDAR_SECRET || randomBytes(32).toString("hex");

const calendarKey = (token: string, instructorId: number) =>
  createHmac("sha256", CALENDAR_SECRET).update(`${token}|${instructorId}`).digest("hex").slice(0, 32);

app.get("/api/public/ics/:token/:key", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).type("text/plain; charset=utf-8").send(resolved.error); return; }

  const [instructors, courses] = await Promise.all([Repository.getInstructors(), Repository.getCourses()]);
  // The key names the instructor: whoever it verifies against is the owner.
  const person = instructors.find(row => calendarKey(token, row.AdInstructorId) === String(req.params.key || ""));
  if (!person) { res.status(404).type("text/plain; charset=utf-8").send("Not found"); return; }

  const collegeRows = await Repository.getSchedulesByScope({
    collegeId: resolved.link.AdCollegeId, termId: resolved.link.AdTermId,
  });
  const rows = collegeRows.filter(row => row.AdInstructorId === person.AdInstructorId);
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);

  /* The personal feed follows the person, not the paper: a date they are absent
     from (cancelled, or handed to a colleague) leaves THEIR calendar, and a
     date they cover for someone else enters it as a single day. */
  const exceptions = await Repository.getScheduleWeekExceptions(Number(resolved.link.AdTermId));
  const goneDates = new Map<number, string[]>();
  for (const entry of exceptions) {
    if (!goneDates.has(entry.scheduleId)) goneDates.set(entry.scheduleId, []);
    goneDates.get(entry.scheduleId)!.push(entry.date);
  }
  const rowById = new Map(collegeRows.map(row => [Number(row.id), row]));
  const coverSingles = exceptions
    .filter(entry => entry.kind === "cover" && Number(entry.coverInstructorId) === person.AdInstructorId)
    .map(entry => {
      const covered = rowById.get(Number(entry.scheduleId));
      if (!covered) return null;
      const course = courseById.get(covered.AdCourseId);
      return {
        id: entry.id,
        date: entry.date,
        start: covered.fstarttime, end: covered.fendtime,
        title: `تغطية: ${covered.AdCourseName || course?.CourseName || "محاضرة"}${covered.SCode ? ` · شعبة ${covered.SCode}` : ""}`,
        room: [covered.AdRoomCode, covered.AdRoomHall].filter(Boolean).join(" / "),
        description: "تغطية ليوم واحد بطلب من القسم.",
      };
    })
    .filter(Boolean) as CalendarSingle[];

  await sendCalendar(req, res, `جدول ${person.AdInstructorName || "الأستاذ"}`, resolved.link.AdTermId, rows.map(row => {
    const course = courseById.get(row.AdCourseId);
    return {
      id: row.id,
      title: [course?.CourseCode, row.AdCourseName || course?.CourseName].filter(Boolean).join(" · "),
      code: course?.CourseCode || "", section: row.SCode || "",
      room: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join(" / "),
      start: row.fstarttime, end: row.fendtime,
      days: shareDayIndexes(row), revision: Number(row.rev || 0),
      cancelledDates: goneDates.get(Number(row.id)),
    };
  }), coverSingles);
});

/**
 * ── بطاقة الأستاذ تتكلّم ────────────────────────────────────────────────────
 *
 * This is the only place in the system where a person with no account proves
 * who they are, and until now that proof was spent entirely on a read.
 *
 * Every disruption in a department begins with exactly that person — the
 * lecture they cannot give next Tuesday, the hall that is too small, the clash
 * with the exam they were told about yesterday — and it currently reaches the
 * coordinator by telephone, where it is written on nothing and lost.
 *
 * The system has no way to SEND — it does not even store an email address — but
 * it needs none in order to RECEIVE. It needs only identity, and the card has
 * already established that: the same link, the same civil ID, the same rate
 * limit, the same single indistinguishable answer for a wrong number and for
 * someone who teaches nothing.
 *
 * Three walls, because an unauthenticated write deserves them:
 *   1. The card is rebuilt from scratch, so a note can only be attached to a
 *      lecture this instructor actually teaches.
 *   2. It writes a NOTE beside an appointment. It is structurally incapable of
 *      touching the appointment — there is no path from here to a schedule row.
 *   3. A daily cap per instructor on top of the per-link rate limit.
 */
const STAFF_NOTES_PER_DAY = 8;

app.post("/api/public/staff/:token/note", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "staff") { res.status(404).json({ error: "هذا الرابط ليس بطاقة أستاذ" }); return; }
  if (!staffLookupAllowed(token, req.ip || "unknown")) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const card = await buildStaffCard(resolved.link, String(body.civil || ""));
  if (!card) { res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return; }

  const scheduleId = Number(body.scheduleId || 0);
  const lecture = card.rows.find(row => row.id === scheduleId);
  // The wall that matters: a note may only be left beside a lecture that is
  // actually on this instructor's own card.
  if (!lecture) { res.status(404).json({ error: "هذا الموعد ليس ضمن جدولك" }); return; }

  const instructors = await Repository.getInstructors();
  const digits = String(body.civil || "").replace(/\D/g, "");
  const person = instructors.find(row => String(row.AdInstructorCivil || "").replace(/\D/g, "") === digits);
  if (!person) { res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return; }

  if (await Repository.countStaffNotesToday(person.AdInstructorId) >= STAFF_NOTES_PER_DAY) {
    res.status(429).json({ error: "بلغتَ حدّ الملاحظات اليومي. تواصل مع منسّق القسم مباشرة." });
    return;
  }

  const kind = body.kind === "apology" ? "apology" : "change";
  const text = String(body.text || "").trim().slice(0, 400);
  const day = (value: unknown) => {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined;
  };
  const fromDate = day(body.fromDate), toDate = day(body.toDate);
  if (!text && kind === "change") { res.status(400).json({ error: "اكتب سطراً واحداً يوضّح المطلوب" }); return; }

  const headline = kind === "apology" ? "اعتذار عن محاضرة" : "طلب تعديل";
  const when = fromDate ? (toDate && toDate !== fromDate ? ` (${fromDate} — ${toDate})` : ` (${fromDate})`) : "";
  /* The note is filed where the LECTURE lives, not where the link points. A
     staff link is issued for a whole college with no section of its own, so
     taking the scope from the link filed every note under section zero — and
     the department's tray, which asks by section, never saw one. */
  const actual = await Repository.getScheduleById(lecture.id);
  const row = await Repository.createScheduleComment({
    SystemUserId: 0,
    userName: person.AdInstructorName || "أستاذ",
    scheduleId: lecture.id,
    AdCollegeId: Number(actual?.AdCollegeId || resolved.link.AdCollegeId),
    AdSectionId: Number(actual?.AdSectionId || 0),
    AdTermId: Number(actual?.AdTermId || card.termId),
    text: `${headline}${when}${text ? ` — ${text}` : ""}`,
    source: "staff-card",
    fromInstructorId: person.AdInstructorId,
    kind, fromDate, toDate,
  } as any);

  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  // The instructor is told it landed, so they do not phone to ask whether it did.
  res.status(201).json({ id: row.id, createdAt: row.createdAt, text: row.text });
});

/**
 * ── الاستبيان ───────────────────────────────────────────────────────────────
 *
 * A door for students, and the only one in the system. It is scoped to ONE
 * section by the link itself, and that is load-bearing: sections here are
 * already separated by gender, so the link decides which cohort is answering
 * and nobody has to guess anything from a person's name. A boys' survey and a
 * girls' survey are two links, issued the same way as any other.
 *
 * The civil ID is checked against the Kuwaiti checksum — an invented number
 * never reaches the store — then hashed and discarded. The name and civil ID are stored with field-level encryption because the
 * authorised department explicitly needs them to act on a case. The key is
 * shared across server instances; the fingerprint remains the duplicate key.
 */
let studentCaseSecretPromise: Promise<string> | null = null;
const studentCaseSecret = () => studentCaseSecretPromise ||= Repository.getStudentCaseSecret();
const surveyFingerprint = async (civil: string) =>
  createHmac("sha256", await studentCaseSecret()).update(`need|${civil}`).digest("hex").slice(0, 32);

const studentIdentityKey = async () => createHmac("sha256", await studentCaseSecret()).update("student-case-identity-v1").digest();
const sealStudentIdentity=async(value:string)=>{
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",await studentIdentityKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,encrypted]).toString("base64url");
};
const openStudentIdentity=async(value?:string)=>{
  const raw=String(value||""); if(!raw) return "";
  const decryptWith=async(key:Buffer)=>{const payload=Buffer.from(raw,"base64url"),iv=payload.subarray(0,12),tag=payload.subarray(12,28),encrypted=payload.subarray(28),cipher=createDecipheriv("aes-256-gcm",key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(encrypted),cipher.final()]).toString("utf8")};
  try{return await decryptWith(await studentIdentityKey());}
  catch{
    // One-release bridge for records written before the shared key existed. If
    // CALENDAR_SECRET was configured stably, old cases remain readable and can
    // coexist with new shared-key cases. Per-instance random legacy records are
    // cryptographically unrecoverable once the writing instance disappears.
    try{return await decryptWith(createHmac("sha256",CALENDAR_SECRET).update("student-case-identity-v1").digest());}catch{return"";}
  }
};

type DegreeRule={degreeUnits:number;fieldTrainingRequired:number;graduateRegularPassed:number;graduateSummerPassed:number};
/** Internal regulation table. It is never sent with the public survey; only
 * the eligibility verdict and the applied threshold are returned after proof. */
const degreeRuleFromName=(sectionName:string):DegreeRule=>{
  const name=String(sectionName||"");
  const degreeUnits=/فرنسي/.test(name)?132:/انجليزي|إنجليزي|تربية خاصة|تفوق|إعاقة|صعوبات/.test(name)?134:130;
  return degreeUnits===130
    ?{degreeUnits,fieldTrainingRequired:102,graduateRegularPassed:107,graduateSummerPassed:109}
    :degreeUnits===132
      ?{degreeUnits,fieldTrainingRequired:107,graduateRegularPassed:109,graduateSummerPassed:111}
      :{degreeUnits,fieldTrainingRequired:107,graduateRegularPassed:111,graduateSummerPassed:113};
};

/**
 * The rule a department is actually judged by.
 *
 * This is what the graduate case in the student survey measures a transcript
 * against, so it decides whether a real student is told they are eligible. It
 * was inferred from the department NAME by regular expression: a department
 * earned 134 units by containing the word «انجليزي», and every department that
 * matched nothing fell to 130 — a number nobody chose, that no screen showed,
 * and that a rename could change without anyone noticing. A stored rule now
 * wins; the name heuristic remains only as the seed for departments nobody has
 * reviewed yet.
 */
const degreeRuleForSection=async(sectionId:number,sectionName:string):Promise<DegreeRule&{reviewed:boolean}>=>{
  const stored=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===Number(sectionId));
  if(!stored)return{...degreeRuleFromName(sectionName),reviewed:true};
  return{
    degreeUnits:Number(stored.degreeUnits),
    fieldTrainingRequired:Number(stored.fieldTrainingRequired),
    graduateRegularPassed:Number(stored.graduateRegularPassed),
    graduateSummerPassed:Number(stored.graduateSummerPassed),
    reviewed:true,
  };
};

/** Graduate proof is a hard data gate, so it never falls back to the historical
 * name heuristic. The department's saved academic rule must exist. */
const storedDegreeRuleForSection=async(sectionId:number):Promise<DegreeRule|null>=>{
  const stored=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===Number(sectionId));
  if(!stored)return null;
  const rule={
    degreeUnits:Number(stored.degreeUnits),
    fieldTrainingRequired:Number(stored.fieldTrainingRequired),
    graduateRegularPassed:Number(stored.graduateRegularPassed),
    graduateSummerPassed:Number(stored.graduateSummerPassed),
  };
  return Object.values(rule).every(value=>Number.isFinite(value)&&value>0)?rule:null;
};

/**
 * Which number a graduate case is measured against.
 *
 * A summer term and a regular term do not ask for the same total, and the
 * survey link already knows which term it belongs to — so the threshold follows
 * the term rather than being one figure for the whole year.
 */
const isSummerTerm=(termName:string)=>/صيفي|صيفى|summer/i.test(String(termName||""));
const graduateThreshold=(rule:DegreeRule,termName:string)=>
  isSummerTerm(termName)?Number(rule.graduateSummerPassed):Number(rule.graduateRegularPassed);
const issueStudentProof=async(payload:{fingerprint:string;sectionId:number;passedUnits:number;requiredUnits:number;degreeUnits:number;nameMatched:boolean;specializationMatched:boolean;documentKind:"graduation-sheet"})=>{
  const body=Buffer.from(JSON.stringify({...payload,exp:Date.now()+20*60_000})).toString("base64url");
  const signature=createHmac("sha256",await studentIdentityKey()).update(body).digest("base64url");return`${body}.${signature}`;
};
const verifyStudentProof=async(token:string)=>{
  try{const[body,signature]=String(token||"").split("."),expected=createHmac("sha256",await studentIdentityKey()).update(body).digest("base64url");if(!body||signature!==expected)return null;const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));return Number(payload.exp)>Date.now()?payload:null;}catch{return null;}
};

const asciiDigits = (value: unknown) => String(value ?? "")
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const surveyCohort = (sectionName: string) => {
  const text = String(sectionName || "");
  if (/بنات|طالبات|إناث|اناث/.test(text)) return { cohort: "girls", cohortLabel: "طالبات" };
  if (/بنين|طلاب|ذكور/.test(text)) return { cohort: "boys", cohortLabel: "طلاب" };
  return { cohort: "mixed", cohortLabel: "طلبة القسم" };
};

function surveyCourseIdsForSection(courses: any[], history: any[], sectionId: number) {
  const taught = new Map<number, number>();
  for (const row of history) {
    if (Number(row.AdSectionId) !== Number(sectionId)) continue;
    taught.set(Number(row.AdCourseId), Math.max(taught.get(Number(row.AdCourseId)) || 0, Number(row.AdTermId) || 0));
  }
  const allowed = new Set<number>();
  for (const course of courses) if (taught.has(Number(course.AdCourseId))) allowed.add(Number(course.AdCourseId));
  return { taught, allowed };
}

app.get("/api/degree-rules", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const [sections,stored]=await Promise.all([Repository.getSections(),Repository.getDegreeRules()]);
  const byId=new Map(stored.map(row=>[Number(row.AdSectionId),row]));
  res.json(sections.map((section:any)=>{
    const saved=byId.get(Number(section.AdSectionId));
    // Defaults are stable system values. A department may edit them explicitly,
    // but no confirmation banner or approval gate is required merely to use them.
    const fixed=degreeRuleFromName(String(section.AdSectionName||""));
    const rule=saved||{...fixed,AdSectionId:section.AdSectionId,updatedAt:"",updatedBy:""};
    return{...rule,AdSectionId:section.AdSectionId,AdCollegeId:section.AdCollegeId,AdSectionName:section.AdSectionName,reviewed:true,suggested:false};
  }));
});

app.put("/api/degree-rules/:sectionId", requirePermission(4), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId=Number(req.params.sectionId||0);
  const sections=await Repository.getSections();
  if(!sections.some((row:any)=>Number(row.AdSectionId)===sectionId)){res.status(404).json({error:"القسم غير موجود"});return;}
  const read=(key:string)=>Math.round(Number(asciiDigits((req.body||{})[key])));
  const degreeUnits=read("degreeUnits");
  const existingRule=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===sectionId);
  const sectionName=String(sections.find((row:any)=>Number(row.AdSectionId)===sectionId)?.AdSectionName||"");
  const fieldTrainingRaw=(req.body||{}).fieldTrainingRequired;
  const fieldTrainingRequired=fieldTrainingRaw==null||String(fieldTrainingRaw).trim()===""
    ? Number(existingRule?.fieldTrainingRequired||degreeRuleFromName(sectionName).fieldTrainingRequired)
    : read("fieldTrainingRequired");
  const graduateRegularPassed=read("graduateRegularPassed"),graduateSummerPassed=read("graduateSummerPassed");
  const values=[degreeUnits,fieldTrainingRequired,graduateRegularPassed,graduateSummerPassed];
  if(values.some(value=>!Number.isFinite(value)||value<30||value>300)){res.status(400).json({error:"كل قيمة يجب أن تكون عدد وحدات بين 30 و 300"});return;}
  // A student cannot be asked to pass more than the degree holds.
  if(fieldTrainingRequired>degreeUnits||graduateRegularPassed>degreeUnits||graduateSummerPassed>degreeUnits){
    res.status(400).json({error:"لا يمكن أن يتجاوز أي شرط مجموع وحدات الدرجة"});return;
  }
  const saved=await Repository.saveDegreeRule({
    AdSectionId:sectionId,degreeUnits,fieldTrainingRequired,graduateRegularPassed,graduateSummerPassed,
    updatedAt:new Date().toISOString(),updatedBy:String(req.user?.Name||""),
  });
  res.json(saved);
});

app.get("/api/public/survey/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "survey") { res.status(404).json({ error: "هذا الرابط ليس استبياناً" }); return; }

  const [courses, history, sections, terms, colleges] = await Promise.all([
    Repository.getCourses(), Repository.getSchedules(), Repository.getSections(), Repository.getTerms(), Repository.getColleges(),
  ]);
  /* The courses offered are the ones this section has ACTUALLY taught — read
     from its own history, newest first. A catalogue entry nobody has taught in
     a decade is not something to ask a student about. */
  const scientificSections=sections.filter((row:any)=>Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  const sectionOptions=scientificSections.map((section:any)=>{
    const {taught}=surveyCourseIdsForSection(courses,history,Number(section.AdSectionId));
    const offered=courses.filter((course:any)=>Number(course.AdSectionId)===Number(section.AdSectionId))
      .map((course:any)=>({id:course.AdCourseId,code:course.CourseCode,name:course.CourseName,lastTaught:taught.get(Number(course.AdCourseId))||0}))
      .sort((a:any,b:any)=>b.lastTaught-a.lastTaught||String(a.code).localeCompare(String(b.code),"ar"));
    return{id:section.AdSectionId,name:section.AdSectionName,courses:offered};
  }).sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"ar"));
  const offered=sectionOptions.find((section:any)=>Number(section.id)===Number(resolved.link.AdSectionId))?.courses||[];

  const sectionName = sections.find(row => row.AdSectionId === resolved.link.AdSectionId)?.AdSectionName || "";
  const cohort = surveyCohort(sectionName);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    section: sectionName,
    college: colleges.find(row => row.AdCollegeId === resolved.link.AdCollegeId)?.AdCollegeName || "",
    term: terms.find(row => row.AdTermId === resolved.link.AdTermId)?.AdTermName || "",
    label: resolved.link.label, expiresAt: resolved.link.expiresAt,
    ...cohort,
    sectionId:resolved.link.AdSectionId,sections:sectionOptions,courses:offered,
  });
});

app.post("/api/public/survey/:token/proof", express.raw({type:"application/octet-stream",limit:"14mb"}), async (req:Request,res:Response)=>{
  const token=String(req.params.token||""),resolved=await resolveShareToken(token);
  if("error"in resolved){res.status(resolved.status).json({error:resolved.error});return;}
  if(resolved.link.kind!=="survey"){res.status(404).json({error:"هذا الرابط ليس استبياناً"});return;}
  if(!staffLookupAllowed(`${token}:proof`,req.ip||"unknown")){res.status(429).json({error:"محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة."});return;}
  const civil=asciiDigits(decodeURIComponent(String(req.get("x-student-civil")||""))).replace(/\D/g,""),name=decodeURIComponent(String(req.get("x-student-name")||"")).trim(),sectionId=Number(req.get("x-student-section")||0);
  if(!validateCivilId(civil).isValid||name.length<3){res.status(400).json({error:"أكمل الاسم والرقم المدني الصحيح أولاً"});return;}
  const sections=await Repository.getSections(),section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  if(!section){res.status(400).json({error:"القسم العلمي غير صالح"});return;}
  const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);if(!bytes.length){res.status(400).json({error:"ارفع صحيفة التخرج PDF أو صورة واضحة"});return;}
  const mime=String(req.get("x-file-type")||"application/pdf").slice(0,80);
  let ocr;
  try{ocr=await ocrGraduationSheetDocument(bytes,mime);}
  catch(error:any){res.status(422).json({error:String(error?.message||"تعذّرت قراءة الإثبات. ارفع صورة أوضح أو ملف PDF.")});return;}
  const facts=graduationSheetFacts(ocr.text);
  const civilCandidates=(Array.isArray(facts.civilCandidates)?facts.civilCandidates:[])
    .map((value:any)=>asciiDigits(value).replace(/\D/g,""))
    .filter((value:string,index:number,array:string[])=>value.length===12&&validateCivilId(value).isValid&&array.indexOf(value)===index);
  /* Exact identity remains the hard gate. Ignore timestamp-like 12-digit OCR
     noise by checksum, then accept the entered civil when it appears either as
     one token or as digit groups on ONE visual line. No digit is repaired or
     guessed. This restores the official Authority screenshot where Tesseract
     may emit «3041 0230 1536» instead of «304102301536». */
  const proofAscii=asciiDigits(String(ocr.text||""));
  const escapedCivil=civil.split("").map(d=>d.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("[ \t\u00a0\u200e\u200f.-]{0,3}");
  const civilVisible=civilCandidates.includes(civil)||new RegExp(`(?:^|[^0-9])${escapedCivil}(?:[^0-9]|$)`).test(proofAscii);
  const hasPassedEvidence=Number(facts.passedUnits)>0||(Array.isArray(facts.passedUnitCandidates)&&facts.passedUnitCandidates.length>0);
  const proofFactsReadable=Boolean(facts.isGraduationSheet&&civilVisible&&Number(facts.passedUnits)>0)
    ||Boolean(facts.isGraduationSheet&&civilVisible&&hasPassedEvidence);
  if(!ocr.legibility.readable&&!proofFactsReadable){res.status(422).json({error:ocr.legibility.reason});return;}
  if(!facts.isGraduationSheet){
    res.status(422).json({error:"الملف المرفوع ليس صحيفة التخرج/الخطة الدراسية المعتمدة. ارفع الصفحة الرسمية التي يظهر فيها البرنامج والوحدات المجتازة."});return;
  }
  if(!civilCandidates.length&&!civilVisible){res.status(422).json({error:"لم أتعرف على الرقم المدني في صحيفة التخرج. ارفع نسخة أوضح يظهر فيها الرقم كاملاً."});return;}
  if(!civilVisible){res.status(422).json({error:"الرقم المدني في الإثبات لا يطابق الرقم المدخل."});return;}
  /* The typed name is for the department's human-facing case card, not a hard
     proof key. Students may enter first + last name while the Authority sheet
     prints the full civil name. Civil ID remains the 100% identity gate. */
  const foldName=(value:string)=>String(value||"").replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z ]/g," ").replace(/\s+/g," ").trim().toLowerCase();
  const documentName=foldName(ocr.text),nameWords=foldName(name).split(" ").filter(word=>word.length>=3),nameMatched=nameWords.length>0&&nameWords.some(word=>documentName.includes(word));
  const specializationMatched=academicSectionNameMatches(facts.normalizedText,String(section.AdSectionName||""));
  if(!specializationMatched){
    res.status(422).json({error:`التخصص الظاهر في صحيفة التخرج لا يطابق القسم المحدد «${String(section.AdSectionName||"")}». اختر قسمك الصحيح وارفع صحيفتك أنت.`});return;
  }
  const rule=await storedDegreeRuleForSection(sectionId);
  if(!rule){res.status(422).json({error:"لا توجد قواعد تخرج أكاديمية معتمدة لهذا القسم في النظام. لا يمكن التحقق من صحيفة التخرج قبل اعتمادها من إدارة القسم."});return;}
  /* Required graduation units come from the selected department's reviewed
     academic rule. OCR only has to prove the student's PASSED units. The
     Authority screenshot lays its values in a visual row, so sparse OCR can
     read the label and the number with programme text between them. When the
     immediate label-value pair is missing, resolve only the bounded candidates
     next to «الوحدات المجتازة», anchored by the department's degree total. */
  const degreeUnits=Number(rule.degreeUnits);
  const resolvePassedUnits=()=>{
    const direct=Number(facts.passedUnits||0);if(direct>0)return direct;
    const near=(Array.isArray(facts.passedUnitCandidates)?facts.passedUnitCandidates:[])
      .map((value:any)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>=60&&value<=degreeUnits);
    const candidates=near.length?near:(Array.isArray(facts.unitCandidates)?facts.unitCandidates:[])
      .map((value:any)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>=60&&value<=degreeUnits);
    if(!candidates.length)return 0;
    if(candidates.length===1)return candidates[0]===degreeUnits?0:candidates[0];
    const remaining=[...candidates];
    const degreeIndex=remaining.indexOf(degreeUnits);
    if(degreeIndex>=0)remaining.splice(degreeIndex,1);
    return remaining.filter(value=>value<=degreeUnits).sort((a,b)=>b-a)[0]||0;
  };
  const passedUnits=resolvePassedUnits();
  if(!passedUnits){res.status(422).json({error:"لم أتعرف على مجموع الوحدات المجتازة في صحيفة التخرج. ارفع الصفحة الرسمية كاملة وبوضوح."});return;}
  const terms=await Repository.getTerms();
  const termName=String(terms.find((row:any)=>Number(row.AdTermId)===Number(resolved.link.AdTermId))?.AdTermName||"");
  const required=graduateThreshold(rule,termName),summer=isSummerTerm(termName);
  const eligible=passedUnits>=required;
  if(!eligible){res.status(422).json({error:`لم تُستوفَ وحدات الخريج/المتوقع تخرجه: الصحيفة تظهر ${passedUnits} وحدة مجتازة، والمطلوب ${required} في ${summer?"الفصل الصيفي":"الفصل العادي"}.`});return;}
  const proofToken=await issueStudentProof({fingerprint:await surveyFingerprint(civil),sectionId,passedUnits,requiredUnits:required,degreeUnits:Number(rule.degreeUnits),nameMatched,specializationMatched,documentKind:"graduation-sheet"});
  res.json({eligible:true,passedUnits,requiredUnits:required,degreeUnits:Number(rule.degreeUnits),termName,summer,
    message:`تم التحقق من صحيفة التخرج: الرقم المدني والقسم والوحدات المجتازة مطابقة. اجتزت ${passedUnits} وحدة، والمطلوب ${required} حسب بيانات قسمك. يمكنك متابعة الطلب.`,
    proofToken,confidence:ocr.confidence});
});

app.post("/api/public/survey/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "survey") { res.status(404).json({ error: "هذا الرابط ليس استبياناً" }); return; }
  if (!staffLookupAllowed(token, req.ip || "unknown")) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const civil = asciiDigits(body.civil).replace(/\D/g, "");
  // The checksum is the whole gate: one person, one answer, and no account.
  if (!validateCivilId(civil).isValid) { res.status(400).json({ error: "الرقم المدني غير صحيح" }); return; }
  const name = String(body.name || "").trim().slice(0, 60);
  if (name.length < 3) { res.status(400).json({ error: "اكتب اسمك كاملاً" }); return; }

  const sectionId=Number(body.sectionId||resolved.link.AdSectionId),sections=await Repository.getSections();
  const section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  if(!section){res.status(400).json({error:"اختر قسماً علمياً صحيحاً"});return;}
  const requestType=["new-course","course-conflict","graduate"].includes(String(body.requestType))?String(body.requestType) as "new-course"|"course-conflict"|"graduate":"new-course";
  const [courses, history] = await Promise.all([
    Repository.getCourses(),
    Repository.getSchedulesByScope({ sectionId }),
  ]);
  /* GET and POST use the exact same eligibility rule. Previously the page
     showed courses from teaching history while POST checked catalogue ownership;
     a real selection could therefore be rejected as if nothing had been picked. */
  /* The link decides the catalogue, not the section the student is enrolled
     in: someone who opened the Islamic Education form is asking about Islamic
     Education courses. A conflict is the one case that reaches wider, because
     the course being clashed with can belong to any department in the college. */
  const linkSectionId=Number(resolved.link.AdSectionId);
  const { allowed } = surveyCourseIdsForSection(courses, history, linkSectionId);
  courses.filter((course:any)=>Number(course.AdSectionId)===linkSectionId).forEach((course:any)=>allowed.add(Number(course.AdCourseId)));
  if(requestType==="course-conflict"){
    const collegeSections=new Set(sections.filter((row:any)=>Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId)).map((row:any)=>Number(row.AdSectionId)));
    courses.filter((course:any)=>collegeSections.has(Number(course.AdSectionId))).forEach((course:any)=>allowed.add(Number(course.AdCourseId)));
  }
  const courseIds = [...new Set((Array.isArray(body.courseIds) ? body.courseIds : [])
    .map(value => Number(asciiDigits(value))).filter(id => allowed.has(id)))].slice(0, 12);
  if(requestType==="new-course"&&!courseIds.length){res.status(400).json({error:"اختر المقرر الذي تحتاج فتحه"});return;}
  if(requestType==="course-conflict"&&courseIds.length!==2){res.status(400).json({error:"اختر مقررين متعارضين بالضبط"});return;}
  const graduateReasons=["field-conflict","field-prerequisite-conflict"],graduateReason=graduateReasons.includes(String(body.graduateReason))?String(body.graduateReason) as any:undefined;
  /* Graduate requests stay sortable by the approved reason, while the student
     gets one bounded requirement box AFTER choosing that reason. The selected
     reason remains the machine field; details is human context tied to it. */
  const details=requestType==="graduate"
    ?String(body.details||"").normalize("NFKC").replace(/\r\n?/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim().slice(0,600)
    :"";
  let passedUnits:number|undefined,requiredUnits:number|undefined,degreeUnits:number|undefined,graduateNameMatched:boolean|undefined,eligibility:"eligible"|"ineligible"|"not-checked"="not-checked";
  if(requestType==="graduate"){
    const proof=await verifyStudentProof(String(body.proofToken||""));
    const currentRule=await storedDegreeRuleForSection(sectionId);
    if(!currentRule){res.status(400).json({error:"قواعد التخرج الأكاديمية لهذا القسم غير معتمدة في النظام"});return;}
    if(!proof||proof.fingerprint!==await surveyFingerprint(civil)||Number(proof.sectionId)!==sectionId||proof.documentKind!=="graduation-sheet"||proof.specializationMatched!==true||Number(proof.degreeUnits)!==Number(currentRule.degreeUnits)){
      res.status(400).json({error:"ارفع صحيفة التخرج الرسمية وتحقق منها قبل إرسال حالة الخريج"});return;
    }
    passedUnits=Number(proof.passedUnits||0);requiredUnits=Number(proof.requiredUnits||0);degreeUnits=Number(currentRule.degreeUnits);graduateNameMatched=Boolean(proof.nameMatched);eligibility=passedUnits>=requiredUnits?"eligible":"ineligible";
    if(eligibility!=="eligible"){res.status(400).json({error:`غير مجتاز للوحدات المطلوبة (${requiredUnits})`});return;}
    if(!graduateReason){res.status(400).json({error:"اختر نوع طلب الميداني"});return;}
    if(details.length<3){res.status(400).json({error:"اكتب متطلباتك بعد اختيار نوع الطلب"});return;}
  }

  const savedNeed = await Repository.saveStudentNeed({
    fingerprint: await surveyFingerprint(civil),
    AdCollegeId: resolved.link.AdCollegeId,
    // Keep the student's own section for degree-rule context, but separately
    // pin the request to the department whose survey link they actually opened.
    // Previously AdSectionId did both jobs, so answers from students in another
    // section were saved successfully and then disappeared from the target
    // department's dashboard.
    AdSectionId: sectionId,
    studentSectionId: sectionId,
    surveySectionId: linkSectionId,
    surveyLinkId: resolved.link.id,
    AdTermId: resolved.link.AdTermId,
    courseIds,
    requestType,nameCipher:await sealStudentIdentity(name),civilCipher:await sealStudentIdentity(civil),details,
    graduateReason,passedUnits,requiredUnits,degreeUnits,eligibility,proofNameMatched:requestType==="graduate"?graduateNameMatched:undefined,
  });
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ name, count: courseIds.length, requestType, caseRef: String(savedNeed.id).slice(0, 8).toUpperCase() });
});

/** What the students said, for the department. Never names, only numbers. */
app.get("/api/schedules/demand", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  /* Two scoped reads, not one unscoped one.
   *
   * This used to call getSchedules() — the entire collection, every department,
   * every one of ten years — and then filter it in memory to find one section's
   * week. Harmless on a test database with ninety rows; on the real one it is
   * tens of thousands of documents fetched on every open of a single reading,
   * and it grows every term forever. The term's week is what the placement
   * search needs; the section's own history is what the room and teacher
   * preferences are read from. Nothing here ever needed another department's
   * back-catalogue. */
  const [allTermNeeds, courses, termWeek, sectionHistory, links, allHistory, allTerms, sections] = await Promise.all([
    // Read the term at college scope, then attribute each request to its survey
    // owner. This also lets us recover older records written before
    // surveySectionId existed, using their requested course ownership.
    Repository.getStudentNeeds(collegeId, 0, termId),
    Repository.getCourses(),
    Repository.getSchedulesByScope({ termId }),
    Repository.getSchedulesByScope({ collegeId, sectionId }),
    Repository.getShareLinks(collegeId, sectionId, termId).catch(() => []),
    Repository.getStudentNeedHistory(collegeId, 0).catch(() => []),
    Repository.getTerms().catch(() => []),
    Repository.getSections().catch(() => []),
  ]);
  const mine = courses.filter(course => Number(course.AdSectionId) === sectionId);
  const targetCourseIds = new Set(mine.map(course => Number(course.AdCourseId)));
  const belongsToSurvey = (need:any) => {
    const explicit = Number(need?.surveySectionId || 0);
    if (explicit) return explicit === sectionId;
    if (Number(need?.AdSectionId || 0) === sectionId) return true;
    // Legacy new-course/conflict records did not carry survey provenance. The
    // requested course is still authoritative enough to return them to the
    // department that owns that course.
    return Array.isArray(need?.courseIds) && need.courseIds.some((id:any) => targetCourseIds.has(Number(id)));
  };
  const needs = (allTermNeeds as any[]).filter(belongsToSurvey);
  const history = (allHistory as any[]).filter(belongsToSurvey);
  const analyticalNeeds=needs.filter((need:any)=>Array.isArray(need.courseIds)&&need.courseIds.length>0);
  const reading = readStudentDemand(analyticalNeeds, mine);

  /* ── الطلبة يتغيّرون كل فصل ────────────────────────────────────────────────
     Two things follow from that, and both are computed here. How much of this
     term's answer set is new; and — when the term has no answers at all, which
     is precisely when the timetable is being written — what the term before it
     predicts, walked forward along the paths students actually took. */
  const succession = readCourseSuccession(history, mine);
  const turnover = cohortTurnover(history, termId);
  const previousTermId = Math.max(0, ...allTerms
    .map(term => Number(term.AdTermId))
    .filter(id => id < Number(termId)));
  const previousNeeds = previousTermId
    ? history.filter(need => Number(need.AdTermId) === previousTermId)
    : [];
  const previousTermName = allTerms.find(term => Number(term.AdTermId) === previousTermId)?.AdTermName || "الفصل السابق";
  // A prediction is only ever offered where there is nothing better. Real
  // answers for this term always win, and the prediction is not even computed.
  const prediction = !reading.respondents && previousNeeds.length
    ? predictDemand(succession, previousNeeds, mine, previousTermName)
    : { courses: [], pairs: [], from: 0, fromTermName: previousTermName, headline: "" };

  /* The repair search, on the real week. It is skipped entirely when nobody has
     answered — a department that has never run a survey pays nothing for a
     feature it is not using. */
  const week = termWeek.filter(row =>
    Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
  const style = reading.respondents || prediction.courses.length
    ? await departmentStyle({ AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId })
    : null;
  const repairs = reading.respondents
    ? readDemandRepairs(week, reading, style?.reading || null, style?.doorway || 0)
    : { repairs: [], unsolved: [], examined: 0, headline: "" };

  /* ── كم شعبة نفتح، وأين ────────────────────────────────────────────────────
     The question the survey is actually sent to answer. The department mails it
     before the term and registers in the first week, by which time the board is
     written — so what the answers change is not where a lecture sits, it is how
     many sections exist. Priced against each course's own MaxStudent, and every
     new section placed against the real week before it is offered. */
  const people = reading.respondents || prediction.courses.length
    ? await Repository.getInstructors().catch(() => [])
    : [];
  const openings = reading.respondents || prediction.courses.length
    ? readSectionOpenings(
        week,
        termWeek,
        mine, people, sectionHistory, reading, prediction,
        style?.reading || null, style?.doorway || 0,
      )
    : { proposals: [], noCeiling: [], headline: "" };

  /* The door itself, so the screen that shows the answers can also show the way
     to collect more of them. Revoked and expired links are not doors. */
  const now = Date.now();
  const survey = (links as any[])
    .filter(link => link.kind === "survey" && !link.revoked && Date.parse(link.expiresAt) > now)
    .map(link => ({ id: link.id, label: link.label, expiresAt: link.expiresAt, views: link.views || 0 }));

  const sectionName = String((sections as any[]).find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || "");
  const cohort = surveyCohort(sectionName);
  const courseNameById=new Map(courses.map((course:any)=>[Number(course.AdCourseId),{name:course.CourseName,code:course.CourseCode,sectionId:Number(course.AdSectionId||0)}]));
  const sectionNameById=new Map((sections as any[]).map((row:any)=>[Number(row.AdSectionId),String(row.AdSectionName||"")]));
  const cases=(await Promise.all(needs.map(async(need:any)=>({
    id:need.id,createdAt:need.createdAt,name:await openStudentIdentity(need.nameCipher),civil:await openStudentIdentity(need.civilCipher),
    studentSectionId:Number(need.studentSectionId||need.AdSectionId||0),studentSectionName:sectionNameById.get(Number(need.studentSectionId||need.AdSectionId||0))||"",
    surveySectionId:Number(need.surveySectionId||sectionId),surveyLinkId:String(need.surveyLinkId||""),
    requestType:need.requestType||"new-course",details:need.details||"",graduateReason:need.graduateReason,
    passedUnits:need.passedUnits,requiredUnits:need.requiredUnits,degreeUnits:need.degreeUnits,eligibility:need.eligibility||"not-checked",
    courses:(need.courseIds||[]).map((id:number)=>{const course:any=courseNameById.get(Number(id))||{name:`مقرر ${id}`,code:"",sectionId:0};return{id,...course,sectionName:sectionNameById.get(Number(course.sectionId||0))||""};}),
  })))).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...reading,
    ...repairs,
    ...cohort,
    sectionName,
    survey,
    openings,
    succession: { links: succession.links.slice(0, 10), pathsSeen: succession.pathsSeen,
                  termsSpanned: succession.termsSpanned, headline: succession.headline },
    turnover,
    prediction,
    cases,
    totalRespondents: needs.length,
    totalCases: cases.length,
    // The limit travels with the answer: this speaks for whoever answered, and
    // is never the registrar's roll.
    limit: "مبنيّ على من أجاب الاستبيان فقط — ليس بيانات التسجيل.",
  });
});

/** The department's tray. Empty is the normal state and costs one scoped read. */
app.get("/api/schedules/staff-inbox", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !termId || !isScopeAllowed(req, collegeId, sectionId)) {
    res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" });
    return;
  }
  const [notes, courses, schedules] = await Promise.all([
    Repository.getStaffInbox(collegeId, sectionId, termId),
    Repository.getCourses(),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
  ]);
  const rowById = new Map(schedules.map(row => [row.id, row]));
  res.setHeader("Cache-Control", "no-store");
  res.json(notes.map(note => {
    const row: any = rowById.get(note.scheduleId);
    return {
      id: note.id, createdAt: note.createdAt, from: note.userName,
      kind: note.kind || "change", text: note.text,
      scheduleId: note.scheduleId,
      course: row?.AdCourseName || courses.find(c => c.AdCourseId === row?.AdCourseId)?.CourseName || "",
      time: row ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "",
      day: row ? (SCHEDULE_DAY_KEYS.find(key => Boolean(row[key])) || "") : "",
      room: row ? [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") : "",
    };
  }));
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

/* The old `staff-ics?civil=…` route is gone. A subscription URL is stored by
   the phone and repeated in every server log for as long as it lives, and a
   civil ID has no business being either. `/api/public/ics/:token/:key` above
   carries a derived key instead and says the same thing. */

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
/* ما تغيّر منذ آخر زيارة — سطر واحد بدل قراءة الأسبوع كله بالعين. */
.since{margin:18px 0 6px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.since>strong{display:block;font-size:14px;font-weight:600;color:var(--brass);margin-bottom:8px}
.since ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.since li{display:flex;gap:8px;align-items:baseline;font-size:13px;line-height:1.7;color:var(--ink)}
.since li b{flex:none;min-width:52px;color:var(--dim);font-size:12px;font-weight:600}
.since li.t-gone span{color:#e0a3a0}
.since li.t-add span{color:var(--jade)}
.since li.t-more{color:var(--dim);font-size:12px}
.since button{
  margin-top:12px;padding:8px 16px;border:1px solid var(--line);border-radius:999px;
  background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;
}
.since button:hover{border-color:var(--jade);color:var(--jade)}
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
/* The card always shows exactly four figures. auto-fit chose three columns at
   phone width and left the fourth stranded alone on its own row; two by two
   is even at every width the card is read on. */
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:22px}
@media (min-width:560px){.stats{grid-template-columns:repeat(4,1fr)}}
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
/* The subscription panel. It stays closed until asked for, because most people
   open this card to read their week, not to wire up a calendar. */
/* Measured, not guessed: a negative top margin tucked the panel two pixels
   under the button that opens it. It sits clear of it now. */
.sub{margin:10px 0 8px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card);
  display:grid;gap:9px;animation:sub-in .22s cubic-bezier(.2,.8,.3,1) both}
@keyframes sub-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.sub p{margin:0;font-size:13px;line-height:1.8;color:#8d9a94}
.sub a,.sub button{min-height:44px;display:grid;place-items:center;border-radius:12px;font:600 14px/1.4 inherit;
  text-decoration:none;cursor:pointer;padding:0 14px;text-align:center}
/* This page's palette is jade/brass — it has no --accent, and a var() naming
   nothing resolves to nothing, which painted a near-black label on a near-black
   card. Measured invisible, then named correctly. */
.sub a{background:var(--jade);border:1px solid var(--jade);color:#04100d}
.sub button{background:transparent;border:1px solid var(--line);color:var(--ink)}
/* When the clipboard is unavailable the address is shown instead; making it
   select as one unit means a long-press picks up the whole URL, not a word. */
.subalarm{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);cursor:pointer;padding-inline:2px}
.subalarm input{accent-color:var(--jade);inline-size:16px;block-size:16px;flex:none}
.sub small{font-size:11.5px;color:#4d5a55;text-align:center;line-height:1.8;-webkit-user-select:all;user-select:all;word-break:break-all}
@media (prefers-reduced-motion:reduce){.sub{animation:none}}
/* ── الإبلاغ ────────────────────────────────────────────────────────────
 * The trigger is the quietest thing in the slot on purpose: a card is opened
 * to read a week, and the ninety per cent who only want that must not have to
 * look past a form to do it. */
/* The slot is a two-column grid whose first column hugs the course name — the
   button landed in it and was squeezed to 24px, measured. Both additions span
   the whole row, which is also where they read best: an action about a lecture
   belongs under the lecture, not beside its title. */
.slot{position:relative}
button.say,.sayform{grid-column:1/-1}
button.say{
  justify-self:start;
  margin-block-start:8px;min-height:36px;padding:0 13px;border-radius:9px;cursor:pointer;
  border:1px solid var(--line);background:transparent;color:var(--dim);
  font:600 11.5px/1 inherit;white-space:nowrap;transition:color .16s,border-color .16s;
}
button.say:hover:not(:disabled){color:var(--jade);border-color:var(--jade)}
button.say:disabled{opacity:.55;cursor:default;border-style:dashed}
.sayform{display:grid;gap:8px;margin-block-start:9px;padding-block-start:9px;border-block-start:1px solid var(--line);
  animation:sub-in .18s cubic-bezier(.2,.8,.3,1) both}
.saykinds{display:grid;gap:4px}
/* A radio dot is 15px and nobody's thumb is. The label is the target, so it
   carries the height instead. */
.saykinds label{
  display:flex;align-items:center;gap:9px;min-height:42px;padding-inline:10px;
  border:1px solid var(--line);border-radius:10px;background:var(--bg);
  font-size:13px;color:var(--ink);cursor:pointer;
}
.saykinds label:has(input:checked){border-color:var(--jade);color:var(--jade)}
.saykinds input{accent-color:var(--jade);inline-size:15px;block-size:15px}
.sayform input[type=date],.sayform textarea{
  inline-size:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;
  border:1px solid var(--line);background:var(--bg);color:var(--ink);
  font:400 13px/1.7 inherit;resize:vertical;
}
.saysend{
  min-height:40px;border-radius:10px;cursor:pointer;
  background:var(--jade);border:1px solid var(--jade);color:#04100d;font:600 13.5px/1 inherit;
}
.saysend:disabled{opacity:.6;cursor:default}
.saynote,.saydone{margin:0;font-size:11px;line-height:1.8;color:var(--dim)}
.saydone{color:var(--jade);font-weight:600}
.saydone span{color:var(--dim);font-weight:400}
@media (prefers-reduced-motion:reduce){.sayform{animation:none}}
@media print{button.say,.sayform{display:none !important}}
.pastnote{
  margin-block-end:14px;padding:11px 13px;border-radius:12px;
  border:1px solid var(--line);background:color-mix(in srgb,var(--brass) 9%,transparent);
  color:var(--dim);font-size:12.5px;line-height:1.8;
}
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
    <div id="changes"></div>
    <div id="days"></div>
    <div class="tools">
      <a id="ics" href="#" role="button" aria-expanded="false" aria-controls="sub">إضافة إلى التقويم</a>
      <a href="#" id="print">طباعة</a>
    </div>
    <div class="sub" id="sub" hidden>
      <p>اشتراك دائم — التقويم يتابع الجدول من نفسه، ولا يحتاج إعادة إضافة بعد كل تعديل.</p>
      <label class="subalarm"><input type="checkbox" id="subAlarm"> ذكّرني قبل كل محاضرة بربع ساعة</label>
      <a id="subNow" href="#">اشتراك الآن · آيفون · ماك · أوتلوك</a>
      <button type="button" id="subCopy">نسخ الرابط لتقويم جوجل</button>
      <small id="subNote">في تقويم جوجل: «تقويمات أخرى ← من رابط».</small>
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
  var ascii=function(value){return String(value||"")
    .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
    .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))});};
  civil.addEventListener("input",function(){var v=ascii(civil.value);if(v!==civil.value)civil.value=v;});

  document.getElementById("print").addEventListener("click",function(e){e.preventDefault();window.print()});

  document.getElementById("form").addEventListener("submit",function(event){
    event.preventDefault();
    var value=ascii(civil.value).replace(/[^0-9]/g,"");
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
  /**
   * ما الذي تغيّر منذ آخر زيارة.
   *
   * The card already shows a whole week; what an instructor actually wants to
   * know when they open it again is the one line that changed. Comparing needs
   * no server and no account: the browser remembers the shape of the week it
   * last showed THIS person, and the difference is computed here. It is their
   * own device remembering their own card — nothing is stored about them
   * anywhere else, and clearing the browser simply means the next visit is a
   * first visit.
   */
  function memoryKey(d,value){return "schedule-card-seen-"+value+"-"+(d.termId||0)}
  function shapeOf(d){
    var map={};
    (d.byDay||[]).forEach(function(day,index){
      (day.rows||[]).forEach(function(row){
        map[row.id+"|"+index]={n:row.name,s:row.start,e:row.end,r:(row.room||"")+"/"+(row.hall||""),d:day.name};
      });
    });
    return map;
  }
  function diffSince(previous,current){
    var out=[];
    Object.keys(current).forEach(function(key){
      var now=current[key],was=previous[key];
      if(!was){out.push({tone:"add",day:now.d,text:now.n+" أُضيفت "+now.e+" - "+now.s+" · "+now.r});return}
      if(was.s!==now.s||was.e!==now.e) out.push({tone:"move",day:now.d,text:now.n+" انتقلت "+was.s+" ← "+now.s});
      if(was.r!==now.r) out.push({tone:"room",day:now.d,text:now.n+" تغيّرت القاعة "+was.r+" ← "+now.r});
    });
    Object.keys(previous).forEach(function(key){
      if(!current[key]) out.push({tone:"gone",day:previous[key].d,text:previous[key].n+" لم تعد في جدولك"});
    });
    return out;
  }
  function renderChanges(d,value){
    var host=document.getElementById("changes");
    if(!host) return;
    var key=memoryKey(d,value),current=shapeOf(d),previous=null;
    try{previous=JSON.parse(localStorage.getItem(key)||"null")}catch(e){previous=null}
    var remember=function(){try{localStorage.setItem(key,JSON.stringify(current))}catch(e){}};
    if(!previous){host.innerHTML="";remember();return}
    var changes=diffSince(previous,current);
    if(!changes.length){host.innerHTML="";remember();return}
    host.innerHTML='<div class="since"><strong>تغيّر جدولك منذ آخر زيارة</strong><ul>'+
      changes.slice(0,8).map(function(c){
        return '<li class="t-'+c.tone+'"><b>'+esc(c.day)+'</b><span>'+esc(c.text)+'</span></li>';
      }).join("")+
      (changes.length>8?'<li class="t-more">و'+ar(changes.length-8)+' تغييراً آخر.</li>':'')+
      '</ul><button type="button" id="seen">فهمت التغييرات</button></div>';
    var seen=document.getElementById("seen");
    if(seen) seen.onclick=function(){remember();host.innerHTML=""};
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
              '<time>'+esc(row.end)+' - '+esc(row.start)+'</time>'+
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
            lead='<div class="gap"><i></i>فراغ <time>'+esc(before[0].to)+' - '+esc(before[0].from)+'</time> · '+ar(before[0].minutes)+' دقيقة</div>';
          }
        }
        /* The slot gains one quiet affordance and nothing else. It is a
           button that opens a form, not a form — a card opened to read a week
           must not become a wall of inputs. */
        return lead+'<div class="slot" data-lecture="'+row.id+'"><strong>'+esc(row.name||row.code)+'</strong>'+
               '<time>'+esc(row.end)+' - '+esc(row.start)+'</time>'+
               '<small>'+[row.code,row.section&&("شعبة "+row.section),(row.room||row.hall)&&(esc(row.room)+"/"+esc(row.hall))].filter(Boolean).join(" · ")+'</small>'+
               (live ? '<button type="button" class="say" data-say="'+row.id+'" aria-expanded="false">أبلغ القسم</button>' : '')+
               '<div class="sayform" hidden></div></div>';
      }).join("");
      return '<section class="day"><h2>'+esc(day.name)+'<em>'+esc(day.span?day.span.to+" - "+day.span.from:"")+'</em></h2>'+body+'</section>';
    }).join("");
    if(!d.lectureCount) document.getElementById("days").innerHTML='<div class="pub-empty">لا محاضرات لك في هذا الفصل — جرّب فصلاً آخر من الأعلى.</div>';
    /* Absence needs a reason. A missing button reads as a fault; one sentence
       says the term is closed and points at the one that is not. */
    else if(!live) document.getElementById("days").insertAdjacentHTML("afterbegin",
      '<div class="pastnote">فصل سابق — للاطلاع فقط. الإبلاغ وإضافة التقويم متاحان في الفصل الحالي.</div>');
    renderChanges(d,value);
    wireNotes(value);

    /* The subscription address. It carries a derived key, never the civil ID,
       so it is safe to sit in a phone's calendar settings forever. */
    /* A past term is read, not acted on: no reporting, no subscription. */
    var live = !d.liveTermId || Number(d.termId) === Number(d.liveTermId);
    document.getElementById("ics").style.display = live ? "" : "none";
    if(!live) document.getElementById("sub").setAttribute("hidden","");

    var base = "/api/public/ics/"+encodeURIComponent(TOKEN)+"/"+encodeURIComponent(d.calendarKey||"");
    /* The reminder is the subscriber's own choice and travels inside their own
       subscription — a department cannot decide to make four hundred phones
       ring, and a person who wants it does not have to ask anyone. */
    var alarmBox = document.getElementById("subAlarm");
    var feed = base, https = location.origin + base;
    function retune(){
      feed = base + (alarmBox.checked ? "?alarm=15" : "");
      https = location.origin + feed;
      document.getElementById("subNow").setAttribute("href", "webcal://" + location.host + feed);
    }
    alarmBox.onchange = retune;
    var ics = document.getElementById("ics"), panel = document.getElementById("sub");
    /* webcal: is what tells a phone to SUBSCRIBE rather than to download one
       frozen copy — the whole difference between a calendar that follows the
       schedule and a snapshot that quietly goes stale. */
    retune();
    ics.onclick = function(e){
      e.preventDefault();
      var open = panel.hasAttribute("hidden");
      if(open) panel.removeAttribute("hidden"); else panel.setAttribute("hidden","");
      ics.setAttribute("aria-expanded", open ? "true" : "false");
      if(open) panel.scrollIntoView({block:"nearest",behavior:"smooth"});
    };
    /**
     * ── الإبلاغ من البطاقة ────────────────────────────────────────────────
     *
     * The whole of the inbound channel, in one delegated listener. Every
     * lecture already carries its own id, so the form is built where it is
     * needed and thrown away afterwards — nothing is rendered for the ninety
     * per cent of visits that only want to read the week.
     */
    function wireNotes(civil){
      var open = null;
      document.getElementById("days").onclick = function(e){
        var trigger = e.target.closest("button.say");
        if(!trigger) return;
        var slot = trigger.closest(".slot"), form = slot.querySelector(".sayform");
        if(open && open !== form){ open.setAttribute("hidden",""); open.innerHTML="";
          open.closest(".slot").querySelector("button.say").setAttribute("aria-expanded","false"); }
        if(!form.hasAttribute("hidden")){
          form.setAttribute("hidden",""); form.innerHTML=""; open=null;
          trigger.setAttribute("aria-expanded","false"); return;
        }
        form.innerHTML =
          '<div class="saykinds">'+
            '<label><input type="radio" name="k'+slot.dataset.lecture+'" value="apology" checked> أعتذر عن هذه المحاضرة</label>'+
            '<label><input type="radio" name="k'+slot.dataset.lecture+'" value="change"> أحتاج تعديلاً</label>'+
          '</div>'+
          /* The date belongs to an apology — «أعتذر عن محاضرة يوم كذا» — and
             to nothing else. On «أحتاج تعديلاً» it asked for a day the request
             does not have, so it appears only with the answer that needs it. */
          '<input type="date" class="sayfrom" aria-label="تاريخ المحاضرة" hidden>'+
          '<textarea class="saytext" rows="2" maxlength="400" placeholder="سطر واحد يوضّح المطلوب (اختياري للاعتذار)"></textarea>'+
          '<button type="button" class="saysend">إرسال إلى القسم</button>'+
          '<p class="saynote">يصل إلى منسّق القسم مرفقاً بهذه المحاضرة. لا يغيّر الجدول بنفسه.</p>';
        form.removeAttribute("hidden");
        trigger.setAttribute("aria-expanded","true");
        open = form;
        /* The date follows the choice: shown for an apology, gone otherwise. */
        var when = form.querySelector(".sayfrom");
        form.querySelectorAll("input[type=radio]").forEach(function(radio){
          radio.onchange = function(){
            if(form.querySelector("input[type=radio]:checked").value === "apology") when.removeAttribute("hidden");
            else { when.setAttribute("hidden",""); when.value = ""; }
          };
        });
        if(form.querySelector("input[type=radio]:checked").value === "apology") when.removeAttribute("hidden");

        form.querySelector(".saysend").onclick = function(){
          var send = form.querySelector(".saysend"), note = form.querySelector(".saynote");
          send.disabled = true; note.textContent = "جارٍ الإرسال…";
          fetch("/api/public/staff/"+encodeURIComponent(TOKEN)+"/note", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              civil: civil, scheduleId: Number(slot.dataset.lecture),
              kind: form.querySelector("input[type=radio]:checked").value,
              fromDate: form.querySelector(".sayfrom").value || undefined,
              text: form.querySelector(".saytext").value.trim(),
            })
          }).then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
            .then(function(x){
              if(!x.ok){ note.textContent = x.d.error || "تعذّر الإرسال."; send.disabled = false; return; }
              /* The instructor is shown that it landed, so nobody has to phone
                 the department to ask whether it did. */
              form.innerHTML = '<p class="saydone">وصل إلى القسم ✓ — <span>'+esc(x.d.text)+'</span></p>';
              open = null;
              trigger.setAttribute("aria-expanded","false");
              trigger.textContent = "أُبلغ القسم";
              trigger.disabled = true;
            })
            .catch(function(){ note.textContent = "تعذّر الإرسال — تحقّق من الاتصال."; send.disabled = false; });
        };
      };
    }

    document.getElementById("subCopy").onclick = function(){
      var note = document.getElementById("subNote"), said = "تم نسخ الرابط.";
      var done = function(){ note.textContent = said; setTimeout(function(){
        note.textContent = "في تقويم جوجل: «تقويمات أخرى ← من رابط»."; }, 4000); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(https).then(done, function(){ note.textContent = https; });
      } else { note.textContent = https; }
    };
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

/**
 * ── صفحة الطالب ─────────────────────────────────────────────────────────────
 *
 * Twenty seconds, one screen, no account. A student opens a link, taps the
 * courses they need, types a name and a civil ID, and is finished.
 *
 * Three things it deliberately never does:
 *   · It shows no counts. The moment a student can see how many others chose a
 *     course, this stops being a survey and becomes a campaign.
 *   · It asks nothing it can answer from the link. The section — and with it
 *     the cohort — is in the link, so nobody is asked which one they belong to.
 *   · It promises nothing. «يُساعد القسم» is true; «سيُفتح» is not, and one
 *     broken promise ends the usefulness of every survey after it.
 */
function surveyPage(token: string, label: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${label} · SCHEDULE</title>
<style>
:root{--bg:#0a100f;--card:#111917;--line:#1e2a27;--ink:#eef2ee;--dim:#8d9a94;--jade:#69c0a8;--brass:#c79b5f;--cohort-rgb:105,192,168}
*{box-sizing:border-box}
body[data-cohort="boys"]{--jade:#71a9d6;--cohort-rgb:113,169,214}
body[data-cohort="girls"]{--jade:#c18bab;--cohort-rgb:193,139,171}
body{margin:0;min-height:100dvh;background:
  radial-gradient(circle at 88% 0%,rgba(var(--cohort-rgb),.10),transparent 34%),
  var(--bg);color:var(--ink);
  font-family:-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;
  -webkit-text-size-adjust:100%;padding:22px 16px 40px}
.wrap{max-inline-size:640px;margin-inline:auto}
.kicker{font:600 11px/1 system-ui;letter-spacing:.22em;color:var(--brass);text-transform:uppercase}
h1{margin:10px 0 4px;font-size:23px;font-weight:700;line-height:1.35}
.sub{margin:0 0 12px;font-size:13.5px;color:var(--dim);line-height:1.85}
.sub b{color:var(--ink);font-weight:650}
/* «هذا ليس تسجيلاً» — أهم سطر في الصفحة أثناء أسبوع التسجيل، فيجب أن يُقرأ
   بوضوح ولا يصرخ: إطار هادئ بلون النحاس، لا لافتة حمراء. */
.warn-line{
  margin:0 0 22px;padding:10px 13px;
  border:1px solid rgba(199,155,95,.32);border-radius:11px;
  background:rgba(199,155,95,.07);
  color:var(--dim);font-size:13px;line-height:1.8;text-align:start;
}
.warn-line b{color:var(--brass);font-weight:700}
.step{margin-block:26px 10px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--dim)}
.step b{inline-size:21px;block-size:21px;flex:none;display:grid;place-items:center;border-radius:50%;
  background:var(--card);border:1px solid var(--line);font:700 11px/1 system-ui;color:var(--jade)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:8px}
.pick{
  position:relative;display:flex;flex-direction:column;gap:4px;
  padding:13px 13px 12px;border:1px solid var(--line);border-radius:14px;
  background:var(--card);color:var(--ink);text-align:start;cursor:pointer;
  font:inherit;transition:border-color .16s,background .16s,transform .12s;
}
.pick:active{transform:scale(.985)}
.pick strong{font-size:13.5px;font-weight:600;line-height:1.4}
.pick small{font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.pick[aria-pressed="true"]{border-color:var(--jade);background:color-mix(in srgb,var(--jade) 12%,var(--card))}
.pick i{position:absolute;inset-block-start:11px;inset-inline-end:11px;inline-size:19px;block-size:19px;
  border-radius:6px;border:1.5px solid color-mix(in srgb,var(--line) 85%,#fff);display:grid;place-items:center;
  background:rgba(255,255,255,.015);transition:border-color .16s,background .16s,transform .16s}
.pick i::after{content:"";inline-size:6px;block-size:10px;border:0;border-right:2px solid #07100d;border-bottom:2px solid #07100d;
  transform:translateY(-1px) rotate(45deg) scale(.4);opacity:0;transition:.16s}
.pick[aria-pressed="true"] i{border-color:var(--jade);background:var(--jade);transform:scale(1.04)}
.pick[aria-pressed="true"] i::after{opacity:1;transform:translateY(-1px) rotate(45deg) scale(1)}
.field{display:grid;gap:6px;margin-block-end:12px}
.field label{font-size:12.5px;color:var(--dim)}
.field input{
  inline-size:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--line);
  background:var(--card);color:var(--ink);font:400 15px/1.5 inherit;
}
.field input:focus{outline:none;border-color:var(--jade)}
.field input[inputmode=numeric]{direction:ltr;text-align:start;font-variant-numeric:tabular-nums}
.send{
  inline-size:100%;min-block-size:52px;margin-block-start:8px;border-radius:14px;cursor:pointer;
  background:var(--jade);border:1px solid var(--jade);color:#04100d;font:700 15.5px/1 inherit;
}
.send:disabled{opacity:.45;cursor:default}
.note{margin:14px 0 0;font-size:11.5px;line-height:1.9;color:#4d5a55;text-align:center}
.err{margin:12px 0 0;padding:11px 13px;border-radius:11px;font-size:13px;line-height:1.7;
  background:color-mix(in srgb,#a2402f 16%,transparent);border:1px solid color-mix(in srgb,#a2402f 40%,transparent)}
.done{text-align:center;padding-block:52px}
.done .tick{inline-size:62px;block-size:62px;margin-inline:auto;border-radius:50%;display:grid;place-items:center;
  background:color-mix(in srgb,var(--jade) 18%,transparent);border:1.5px solid var(--jade);
  font-size:29px;color:var(--jade);animation:pop .34s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes pop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
.done h2{margin:20px 0 6px;font-size:20px;font-weight:700}
.done p{margin:0;color:var(--dim);font-size:13.5px;line-height:1.9}
/* The button is sticky, which is right — a student choosing twelve courses
   should never hunt for it. But sticky means content scrolls UNDER it, and with
   no backdrop the last two courses showed through the button and neither could
   be read. So it carries a band of the page's own background, fading upward,
   and the page reserves room beneath it so the final row is never trapped. */
/* البحث السريع */
.seek{position:relative;margin-block-end:10px}
.seek input{
  inline-size:100%;padding:12px 14px;font:inherit;font-size:15px;
  color:var(--ink);background:var(--card);
  border:1px solid var(--line);border-radius:12px;outline:none;
}
.seek input:focus{border-color:var(--jade)}
.seek span{
  position:absolute;inset-block-start:50%;inset-inline-end:14px;transform:translateY(-50%);
  color:var(--dim);font-size:12px;pointer-events:none;
}

/* The hidden attribute is only display:none in the browser's own stylesheet,
   so the display:flex below would beat it and paint an empty box under the
   search. Same trap as the workspace, same one-line answer. */
[hidden]{display:none !important}

/* المختار — مثبّت فوق، فلا يضيع خلف مجموعة مطويّة */
.chosen{
  display:flex;flex-wrap:wrap;align-items:center;gap:6px;
  margin-block-end:12px;padding:10px 12px;
  border:1px solid rgba(105,192,168,.3);border-radius:12px;background:rgba(105,192,168,.07);
}
.chosen-label{color:var(--dim);font-size:12px;margin-inline-end:2px}
.chip{
  padding:5px 10px;border:1px solid rgba(105,192,168,.4);border-radius:999px;
  background:transparent;color:var(--jade);font:inherit;font-size:12.5px;cursor:pointer;
  direction:ltr;unicode-bidi:isolate;
}
.chip em{font-style:normal;opacity:.7}
.chip:hover{background:rgba(105,192,168,.12)}

/* الأكورديون — المقررات كثيرة، فالافتراضي مطويّ */
.fold{margin-block-end:8px;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:var(--card)}
.fold-head{
  inline-size:100%;display:flex;align-items:center;gap:9px;
  padding:13px 14px;border:0;background:transparent;color:var(--ink);
  font:inherit;font-size:14.5px;font-weight:650;cursor:pointer;text-align:start;
}
.fold-name{flex:1;min-inline-size:0;direction:ltr;unicode-bidi:isolate;text-align:start}
.fold-count{
  padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.06);
  color:var(--dim);font-size:12px;font-weight:600;
}
.fold-caret{color:var(--dim);font-size:15px;transition:transform .18s ease}
.fold.open .fold-caret{transform:rotate(180deg)}
.fold .grid{display:none;padding:0 10px 12px}
.fold.open .grid{display:grid}
.fold[hidden]{display:none}
.cohort-badge{display:inline-flex;align-items:center;gap:8px;margin:0 0 16px;padding:8px 12px;border:1px solid rgba(var(--cohort-rgb),.32);border-radius:999px;background:rgba(var(--cohort-rgb),.08);color:var(--dim);font-size:13px}
.cohort-badge b{color:var(--jade);font-weight:700}.cohort-badge i{width:8px;height:8px;border-radius:50%;background:var(--jade);box-shadow:0 0 0 4px rgba(var(--cohort-rgb),.10)}
.gender-note{margin:-4px 0 16px;color:var(--dim);font-size:12px;line-height:1.7}

.count{
  position:sticky;inset-block-end:0;z-index:3;
  margin-block-start:18px;padding-block:12px 14px;
  background:linear-gradient(to top,var(--bg) 72%,rgba(10,16,15,0));
}
body{padding-block-end:8px}
@media (prefers-reduced-motion:reduce){.pick,.done .tick{transition:none;animation:none}}
</style></head>
<body><div class="wrap" id="root">
  <div class="kicker">استبيان المقررات</div>
  <h1 id="head">…</h1>
  <p class="sub" id="sub">اختر المقررات التي <b>تنوي تسجيلها</b> هذا الفصل. القسم يستخدم العدد ليقرّر كم شعبة يفتح.</p>
  <p class="warn-line"><b>هذا ليس تسجيلاً.</b> إجابتك لا تحجز لك مقعداً ولا تُغني عن التسجيل، ولا تضمن فتح شعبة — التسجيل يبقى في مكانه المعتاد.</p>
  <div id="body"></div>
</div>
<script>
/* العدد والمعدود — نفس قاعدة البرنامج، مكتوبة هنا لأن هذه الصفحة لا تحمل حزمته. */
function asciiDigits(value){
  return String(value==null?"":value)
    .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));})
    .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d));});
}
function arCourses(n){
  n = Math.max(0, Number(n) || 0);
  if (n === 1) return "مقرراً واحداً";
  if (n === 2) return "مقررين";
  var rest = n % 100;
  if (rest >= 3 && rest <= 10) return n + " مقررات";
  return n + " مقرراً";
}

(function(){
  var TOKEN=${JSON.stringify(token)};
  var picked=new Set();
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
  var body=document.getElementById("body");

  fetch("/api/public/survey/"+encodeURIComponent(TOKEN))
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
    .then(function(x){
      if(!x.ok){ body.innerHTML='<div class="err">'+esc(x.d.error||"تعذر فتح الاستبيان")+'</div>'; return; }
      document.body.dataset.cohort=x.d.cohort||"mixed";
      document.getElementById("head").textContent=x.d.section||x.d.label||"مقررات القسم";
      render(x.d);
    })
    .catch(function(){ body.innerHTML='<div class="err">تعذر الاتصال. تحقق من الإنترنت وأعد المحاولة.</div>'; });

  /* ── قائمة طويلة، وهاتف ────────────────────────────────────────────────
     A department can offer a hundred courses, and a student on a phone should
     not scroll a hundred cards to find four. So: a search that filters as you
     type, the list folded into groups by course code, and everything already
     chosen pinned above the fold so it is never lost behind a closed group. */
  function groupsOf(courses){
    var order=[], map={};
    courses.forEach(function(c){
      var key=String(c.code||"").trim().split(/[\s-]/)[0].replace(/[0-9]+$/,"") || "أخرى";
      if(!map[key]){ map[key]=[]; order.push(key); }
      map[key].push(c);
    });
    return order.map(function(k){ return {key:k, items:map[k]}; });
  }

  function render(d){
    var groups=groupsOf(d.courses);
    /* Every course group starts folded, even when all courses happen to fall
       under one label such as «أخرى». The student asked for an accordion, not
       a wall of cards; search still opens only the group that contains a hit. */
    var openAll = false;
    var cohort=d.cohortLabel||"طلبة القسم";
    body.innerHTML=
      '<div class="cohort-badge"><i></i><span>الفئة: <b>'+esc(cohort)+'</b></span></div>'+
      '<p class="gender-note">الفئة محددة من رابط القسم نفسه حتى لا تختلط إجابات البنات والبنين.</p>'+
      '<div class="step"><b>1</b> أي المقررات تحتاجها؟</div>'+
      '<div class="seek"><input id="seek" type="search" inputmode="search" '+
        'placeholder="ابحث باسم المقرر أو رمزه…" autocomplete="off" enterkeyhint="search">'+
        '<span id="seekcount"></span></div>'+
      '<div id="chosen" class="chosen" hidden></div>'+
      '<div id="groups">'+groups.map(function(g,i){
        return '<section class="fold'+(openAll?" open":"")+'" data-key="'+esc(g.key)+'">'+
          '<button type="button" class="fold-head">'+
            '<span class="fold-name">'+esc(g.key)+'</span>'+
            '<span class="fold-count">'+g.items.length+'</span>'+
            '<span class="fold-caret" aria-hidden="true">⌄</span>'+
          '</button>'+
          '<div class="grid">'+g.items.map(function(c){
            return '<button type="button" class="pick" data-id="'+c.id+'" '+
                   'data-find="'+esc((c.name+" "+c.code).toLowerCase())+'" aria-pressed="false">'+
                   '<i aria-hidden="true"></i><strong>'+esc(c.name)+'</strong><small>'+esc(c.code)+'</small></button>';
          }).join("")+'</div></section>';
      }).join("")+'</div>'+
      '<p class="note" id="nohit" hidden>لا مقرر بهذا الاسم أو الرمز.</p>'+
      '<div class="step"><b>2</b> من أنت؟</div>'+
      '<div class="field"><label for="nm">الاسم</label><input id="nm" autocomplete="name" enterkeyhint="next"></div>'+
      '<div class="field"><label for="cv">الرقم المدني</label>'+
        '<input id="cv" inputmode="numeric" maxlength="12" autocomplete="off" enterkeyhint="done"></div>'+
      '<div class="count"><button type="button" class="send" id="send" disabled>اختر مقرراً واحداً على الأقل</button></div>'+
      '<p class="note">اسمك ورقمك لا يُحفظان مع إجابتك — يُستخدمان مرة واحدة لمنع التكرار فقط. '+
        'وإن غيّرت رأيك، افتح الرابط وأجب مرة أخرى فتحلّ إجابتك الجديدة محل القديمة.</p>'+
      '<div id="err"></div>';

    var send=document.getElementById("send");
    var groupsEl=document.getElementById("groups");
    var chosenEl=document.getElementById("chosen");
    var seek=document.getElementById("seek");
    var seekCount=document.getElementById("seekcount");
    var nohit=document.getElementById("nohit");
    var byId={}; d.courses.forEach(function(c){ byId[c.id]=c; });

    function paintChosen(){
      var ids=[...picked];
      chosenEl.hidden = ids.length===0;
      chosenEl.innerHTML = ids.length
        ? '<span class="chosen-label">اخترت</span>'+ids.map(function(id){
            var c=byId[id]||{};
            return '<button type="button" class="chip" data-id="'+id+'">'+
                   esc(c.code||"")+' <em>×</em></button>';
          }).join("")
        : "";
    }

    groupsEl.addEventListener("click",function(e){
      var head=e.target.closest(".fold-head");
      if(head){ head.parentNode.classList.toggle("open"); return; }
      var b=e.target.closest(".pick"); if(!b) return;
      var id=Number(b.dataset.id);
      if(picked.has(id)){ picked.delete(id); b.setAttribute("aria-pressed","false"); }
      else { picked.add(id); b.setAttribute("aria-pressed","true"); }
      paintChosen(); refresh();
    });

    // Removing from the pinned row must also un-press the card it came from.
    chosenEl.addEventListener("click",function(e){
      var chip=e.target.closest(".chip"); if(!chip) return;
      var id=Number(chip.dataset.id);
      picked.delete(id);
      var card=groupsEl.querySelector('.pick[data-id="'+id+'"]');
      if(card) card.setAttribute("aria-pressed","false");
      paintChosen(); refresh();
    });

    seek.addEventListener("input",function(){
      var q=seek.value.trim().toLowerCase();
      var hits=0;
      [...groupsEl.querySelectorAll(".fold")].forEach(function(section){
        var shown=0;
        [...section.querySelectorAll(".pick")].forEach(function(card){
          var on = !q || card.dataset.find.indexOf(q)>=0;
          card.hidden = !on;
          if(on) shown++;
        });
        section.hidden = shown===0;
        // Searching opens what it finds; clearing the box folds it back.
        if(q) section.classList.add("open");
        else section.classList.toggle("open", openAll);
        hits += shown;
      });
      nohit.hidden = hits>0;
      seekCount.textContent = q ? arCourses(hits) : "";
    });
    document.addEventListener("input",function(e){
      var input=e.target;
      if(!input||typeof input.value!=="string") return;
      var normalized=asciiDigits(input.value);
      if(normalized!==input.value) input.value=normalized;
    },true);
    ["nm","cv"].forEach(function(k){ document.getElementById(k).addEventListener("input",refresh); });

    function refresh(){
      var nm=document.getElementById("nm").value.trim();
      var cv=asciiDigits(document.getElementById("cv").value).replace(/\D/g,"");
      var ready=picked.size>0 && nm.length>=3 && cv.length===12;
      send.disabled=!ready;
      /* The button says what is missing rather than sitting grey and silent. */
      send.textContent = picked.size===0 ? "اختر مقرراً واحداً على الأقل"
        : nm.length<3 ? "اكتب اسمك"
        : cv.length!==12 ? "أدخل الرقم المدني (12 رقماً)"
        : "إرسال · "+picked.size+" مقرر";
    }

    send.onclick=function(){
      send.disabled=true; send.textContent="جارٍ الإرسال…";
      fetch("/api/public/survey/"+encodeURIComponent(TOKEN),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:document.getElementById("nm").value.trim(),
          civil:asciiDigits(document.getElementById("cv").value),courseIds:Array.from(picked)})
      }).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
        .then(function(x){
          if(!x.ok){ document.getElementById("err").innerHTML='<div class="err">'+esc(x.d.error)+'</div>';
            send.disabled=false; refresh(); return; }
          document.getElementById("root").innerHTML=
            '<div class="done"><div class="tick">✓</div>'+
            '<h2>وصلت إجابتك</h2>'+
            '<p>شكراً '+esc(x.d.name)+' — سجّلنا اختيارك: '+arCourses(x.d.count)+'.<br>'+
            'هذا ليس تسجيلاً؛ أكمل تسجيلك كالمعتاد. ويمكنك فتح الرابط مرة أخرى لتعديل اختيارك.</p></div>';
          window.scrollTo(0,0);
        })
        .catch(function(){ document.getElementById("err").innerHTML='<div class="err">تعذر الإرسال — تحقق من الاتصال.</div>';
          send.disabled=false; refresh(); });
    };
  }
})();
</script></body></html>`;
}

function studentCaseSurveyPage(token:string,label:string):string{
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${label} · SCHEDULE</title><style>
*{box-sizing:border-box}:root{--bg:#07110f;--card:#101b18;--card2:#15231f;--line:#263630;--ink:#f1f6f2;--muted:#91a098;--jade:#68c8aa;--gold:#d2a45f;--bad:#e37b70}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 90% 0,#17362e 0,transparent 32%),var(--bg);color:var(--ink);font-family:-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;padding:22px 15px 42px}.wrap{max-width:720px;margin:auto}.brand{font:700 11px/1 system-ui;letter-spacing:.22em;color:var(--gold)}h1{font-size:25px;margin:10px 0 5px}.lead{color:var(--muted);line-height:1.8;margin:0 0 20px;font-size:13px}.card{background:color-mix(in srgb,var(--card) 92%,transparent);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 20px 50px #0004}.progress{display:flex;gap:6px;margin-bottom:18px}.progress i{height:4px;border-radius:9px;background:var(--line);flex:1}.progress i.on{background:var(--jade)}.step-head{display:flex;align-items:center;gap:10px;margin-bottom:15px}.step-head b{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#17362e;color:var(--jade)}.step-head div{display:grid;gap:2px}.step-head strong{font-size:16px}.step-head span{font-size:11px;color:var(--muted)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:11px;color:var(--muted)}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:13px;background:var(--card2);color:var(--ink);padding:13px;font:inherit;outline:none}input:focus,select:focus,textarea:focus{border-color:var(--jade)}input[dir=ltr]{text-align:left}.action{width:100%;border:0;border-radius:14px;padding:14px;margin-top:15px;background:var(--jade);color:#04120e;font:800 14px/1 inherit;cursor:pointer}.action:disabled{opacity:.42;cursor:default}.back{border:0;background:none;color:var(--muted);padding:8px;font:inherit;cursor:pointer}.types{display:grid;gap:9px}.type{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:11px;border:1px solid var(--line);background:var(--card2);color:var(--ink);border-radius:15px;padding:12px;text-align:right;cursor:pointer}.type>i{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#1c302a;color:var(--jade);font-style:normal;font-size:18px}.type strong{display:block;font-size:14px}.type small{display:block;color:var(--muted);margin-top:3px}.type em{font-style:normal;color:var(--muted)}.type.on{border-color:var(--jade);background:#142b24}.course-tools{display:grid;gap:8px;margin:13px 0}.courses{display:grid;grid-template-columns:1fr 1fr;gap:7px;max-height:320px;overflow:auto}.course{position:relative;border:1px solid var(--line);background:var(--card2);color:var(--ink);border-radius:12px;padding:11px;text-align:right;cursor:pointer}.course strong{display:block;font-size:12px;line-height:1.5}.course small{color:var(--muted)}.course.on{border-color:var(--jade);background:#153128}.hint{font-size:10.5px;color:var(--muted)}.hint.ok{color:var(--jade)}.hint.bad{color:var(--bad)}.acc{border:1px solid var(--line);border-radius:15px;background:var(--card2);overflow:hidden}.acc>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px;cursor:pointer;font-weight:800;font-size:13px;list-style:none}.acc>summary::-webkit-details-marker{display:none}.acc>summary em{font-style:normal;font-size:11px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:2px 9px}.acc[open]>summary{border-bottom:1px solid var(--line)}.acc-body{display:grid;gap:9px;padding:12px}.acc-body .courses{max-height:250px}.course.on:after{content:"✓";position:absolute;top:8px;left:9px;color:var(--jade)}.proof{display:grid;gap:10px;padding:14px;border:1px dashed #3b554d;border-radius:15px;margin-top:12px}.proof input{padding:9px}.upload-meter{display:grid;grid-template-columns:1fr auto;align-items:center;gap:7px 10px}.upload-meter[hidden]{display:none!important}.upload-track{height:7px;border-radius:999px;background:#263630;overflow:hidden}.upload-track i{display:block;height:100%;width:0;border-radius:inherit;background:var(--jade);transition:width .12s linear}.upload-meter b{font:700 11px/1 system-ui;color:var(--jade);direction:ltr}.upload-meter small{grid-column:1/-1;color:var(--muted);font-size:10.5px}.proof-status{padding:12px;border-radius:13px;background:#152923;color:var(--muted);line-height:1.7;font-size:12px}.proof-status.ok{border:1px solid #2f7b63;color:#a7e4cf}.proof-status.bad{border:1px solid #804640;color:#f0aaa3}.reasons{display:grid;gap:8px;margin-top:12px}.reason{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--line);background:var(--card2);padding:11px;border-radius:12px}.reason input{width:auto;margin-top:3px}.reason span{font-size:13px}.graduate-detail{margin-top:11px;padding:12px;border:1px solid #315047;background:#0e1c18;border-radius:14px}.graduate-detail label{display:block;font-size:12px;font-weight:800;color:#dcebe5;margin-bottom:7px}.graduate-detail textarea{min-height:112px;resize:vertical;line-height:1.75}.graduate-detail small{display:flex;justify-content:space-between;gap:8px;margin-top:6px;color:var(--muted);font-size:10.5px}.graduate-detail b{color:var(--jade);font-weight:700}.err{margin-top:12px;padding:11px;border-radius:11px;border:1px solid #713e39;background:#321b19;color:#f0aaa3;font-size:12px;line-height:1.7}.done{text-align:center;padding:35px 10px}.tick{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:#17362e;color:var(--jade);font-size:29px;margin:auto}.done h2{font-size:22px}.done p{color:var(--muted);line-height:1.9}.privacy{color:#53635b;font-size:10.5px;line-height:1.8;text-align:center;margin:13px 6px 0}[hidden]{display:none!important}@media(max-width:580px){.fields,.courses{grid-template-columns:1fr}.field.full{grid-column:auto}.card{padding:15px;border-radius:18px}h1{font-size:22px}}
</style></head><body><main class="wrap"><div class="brand">SCHEDULE · مركز طلبات الطلبة</div><h1>${label}</h1><p class="lead">طلب واضح يصل إلى القسم باسـمك وتفاصيله. هذا النموذج لا يُعد تسجيلاً ولا يضمن فتح مقرر.</p><section class="card"><div class="progress"><i class="on"></i><i></i><i></i></div><div id="host"><p>جارٍ فتح النموذج…</p></div></section></main><script>
(function(){var TOKEN=${JSON.stringify(token)},data=null,step=1,student={name:"",civil:"",sectionId:0},kind="",picked=[],otherCourse=0,proofToken="",proofEligible=false;var host=document.getElementById("host");
/* The same checksum the rest of the system enforces. The page used to accept
   any twelve digits, so a wrong number travelled through both remaining steps
   and was only refused by the server at the very end — the student learning at
   submit time that the first field was wrong. */
function civilValid(v){v=String(v||"");if(!/^\\d{12}$/.test(v))return false;var w=[2,1,6,3,7,9,10,5,8,4,2],sum=0;for(var i=0;i<11;i++)sum+=Number(v[i])*w[i];return 11-(sum%11)===Number(v[11])}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}function digits(v){return String(v||"").replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))}).replace(/\\D/g,"")}function section(){return(data.sections||[]).find(function(s){return Number(s.id)===Number(student.sectionId)})||{courses:[]}}function paintProgress(){var bars=document.querySelectorAll(".progress i");bars.forEach(function(bar,index){bar.classList.toggle("on",index<step)})}function fail(msg){var box=document.getElementById("err");if(box)box.innerHTML='<div class="err">'+esc(msg)+'</div>'}
function identity(){step=1;paintProgress();host.innerHTML='<div class="step-head"><b>1</b><div><strong>بيانات الطالب</strong><span>الاسم · الرقم المدني · القسم العلمي</span></div></div><div class="fields"><div class="field"><label>الاسم الكامل</label><input id="name" autocomplete="name" value="'+esc(student.name)+'"></div><div class="field"><label>الرقم المدني</label><input id="civil" dir="ltr" inputmode="numeric" maxlength="12" value="'+esc(student.civil)+'"><small id="civilHint" class="hint"></small></div><div class="field full"><label>القسم العلمي</label><select id="section"><option value="">اختر القسم</option>'+(data.sections||[]).map(function(s){return'<option value="'+s.id+'"'+(Number(s.id)===Number(student.sectionId)?' selected':'')+'>'+esc(s.name)+'</option>'}).join("")+'</select></div></div><button class="action" id="next">التالي · نوع الطلب</button><p class="privacy">تظهر هويتك للمسؤول المخوّل فقط، وتُحفظ مشفّرة داخل النظام لخدمة الطلب ومراجعته.</p><div id="err"></div>';var civilBox=document.getElementById("civil"),hint=document.getElementById("civilHint");function paintCivil(){var value=digits(civilBox.value);if(!value.length){hint.textContent="";hint.className="hint";return}if(value.length<12){hint.textContent="باقي "+(12-value.length)+" رقم";hint.className="hint";return}if(civilValid(value)){hint.textContent="رقم مدني صحيح";hint.className="hint ok"}else{hint.textContent="هذا الرقم المدني غير صحيح — راجع أرقام بطاقتك";hint.className="hint bad"}}civilBox.oninput=function(){this.value=digits(this.value);paintCivil()};paintCivil();document.getElementById("next").onclick=function(){student.name=document.getElementById("name").value.trim();student.civil=digits(civilBox.value);student.sectionId=Number(document.getElementById("section").value)||0;if(student.name.length<3)return fail("اكتب اسمك كاملاً");if(student.civil.length!==12)return fail("أدخل الرقم المدني من 12 رقماً");if(!civilValid(student.civil))return fail("هذا الرقم المدني غير صحيح. راجع الأرقام كما هي في بطاقتك المدنية.");if(!student.sectionId)return fail("اختر قسمك العلمي");kind="";picked=[];otherCourse=0;proofToken="";proofEligible=false;chooseType()}}

function chooseType(){step=2;paintProgress();host.innerHTML='<button class="back" id="back">← تعديل البيانات</button><div class="step-head"><b>2</b><div><strong>ما نوع طلبك؟</strong><span>اختر حالة واحدة</span></div></div><div class="types"><button class="type" data-kind="new-course"><i>＋</i><span><strong>فتح مقرر جديد</strong><small>مقرر تحتاج طرحه في الفصل</small></span><em>‹</em></button><button class="type" data-kind="course-conflict"><i>⇄</i><span><strong>مقرر يتعارض مع مقرر آخر</strong><small>اختر المقررين المتقاطعين</small></span><em>‹</em></button><button class="type" data-kind="graduate"><i>✓</i><span><strong>خريج أو متوقع تخرجه</strong><small>يتطلب كشف درجات للتحقق من الوحدات</small></span><em>‹</em></button></div>';document.getElementById("back").onclick=identity;host.querySelectorAll(".type").forEach(function(button){button.onclick=function(){kind=button.dataset.kind;picked=[];proofToken="";proofEligible=false;details()}})}
function linkCourses(){return data.courses||[]}
function sectionById(id){return(data.sections||[]).find(function(s){return Number(s.id)===Number(id)})||{courses:[]}}
function courseButton(c){return'<button type="button" class="course" data-id="'+c.id+'" data-find="'+esc((c.name+' '+c.code).toLowerCase())+'"><strong>'+esc(c.name)+'</strong><small>'+esc(c.code)+'</small></button>'}
/* The link decides which catalogue is on offer. A student who opened the
   Islamic Education form wants an Islamic Education course; showing them the
   department they happen to be enrolled in was answering a question nobody
   asked. */
function ownCourseCards(){return'<details class="acc" open><summary><span>مقررات '+esc(data.section||"القسم")+'</span><em>'+linkCourses().length+'</em></summary><div class="acc-body"><input id="courseSearch" type="search" placeholder="ابحث باسم المقرر أو رمزه"><div class="courses" id="courses">'+linkCourses().map(courseButton).join("")+'</div></div></details>'}
/* The second course can come from anywhere in the college, and listing every
   catalogue at once is a wall of names. Nothing is revealed until the student
   types, so the list is always an answer to something they asked for. */
function otherCourseCards(){return'<div class="field" style="margin-top:12px"><label>القسم الآخر</label><select id="otherSection"><option value="">اختر القسم</option>'+(data.sections||[]).map(function(s){return'<option value="'+s.id+'">'+esc(s.name)+'</option>'}).join("")+'</select></div><div class="course-tools"><input id="otherSearch" type="search" placeholder="اكتب جزءاً من اسم المقرر — مثلاً: تاريخ" disabled></div><div class="courses" id="otherCourses"></div><p class="privacy" id="otherHint">اختر القسم أولاً، ثم اكتب اسم المقرر لتظهر النتائج.</p>'}

function wireOwnCourses(){var box=document.getElementById("courses"),search=document.getElementById("courseSearch");box.onclick=function(e){var button=e.target.closest(".course");if(!button)return;var id=Number(button.dataset.id);if(kind==="course-conflict"){picked=picked[0]===id?[]:[id];box.querySelectorAll(".course").forEach(function(other){other.classList.toggle("on",Number(other.dataset.id)===picked[0])});return}var at=picked.indexOf(id);if(at>=0)picked.splice(at,1);else picked.push(id);button.classList.toggle("on",picked.indexOf(id)>=0)};search.oninput=function(){var q=this.value.trim().toLowerCase();box.querySelectorAll(".course").forEach(function(button){button.hidden=q&&button.dataset.find.indexOf(q)<0})}}
function wireOtherCourse(){var pickSection=document.getElementById("otherSection"),search=document.getElementById("otherSearch"),box=document.getElementById("otherCourses"),hint=document.getElementById("otherHint");pickSection.onchange=function(){otherCourse=0;search.disabled=!this.value;search.value="";box.innerHTML="";hint.textContent=this.value?"اكتب جزءاً من اسم المقرر لتظهر النتائج.":"اختر القسم أولاً، ثم اكتب اسم المقرر لتظهر النتائج."};search.oninput=function(){var q=this.value.trim().toLowerCase();if(q.length<2){box.innerHTML="";hint.textContent="اكتب حرفين على الأقل.";return}var list=(sectionById(pickSection.value).courses||[]).filter(function(c){return(c.name+" "+c.code).toLowerCase().indexOf(q)>=0}).slice(0,40);box.innerHTML=list.map(courseButton).join("");hint.textContent=list.length?"":"لا مقرر بهذا الاسم في القسم المختار."};box.onclick=function(e){var button=e.target.closest(".course");if(!button)return;var id=Number(button.dataset.id);otherCourse=otherCourse===id?0:id;box.querySelectorAll(".course").forEach(function(other){other.classList.toggle("on",Number(other.dataset.id)===otherCourse)})}}

function details(){step=3;paintProgress();var title=kind==="new-course"?"فتح مقرر جديد":kind==="course-conflict"?"تعارض مقررين":"حالة خريج أو متوقع تخرجه";
/* The free-text box is kept only where somebody reads it. On the two course
   requests the selected courses already say everything the department acts on,
   and an optional box invited an explanation nobody was going to open. */
var content=kind==="graduate"?'<div class="proof"><strong>ارفع صحيفة التخرج</strong><small class="lead">PDF أو صورة واضحة للصفحة الرسمية «الخطة الدراسية / صحيفة التخرج». يجب أن يظهر الرقم المدني والبرنامج والوحدات المجتازة بوضوح. الاسم يساعد في العرض ولا يشترط تطابقه حرفياً. أي مستند آخر لن يُقبل.</small><input id="proof" type="file" accept="application/pdf,image/*,.heic,.heif"><button class="action" id="verify" type="button">قراءة صحيفة التخرج والتحقق</button><div class="upload-meter" id="uploadMeter" hidden><div class="upload-track"><i id="uploadBar"></i></div><b id="uploadPct">0%</b><small id="uploadBytes">يجهّز الملف…</small></div><div id="proofStatus" class="proof-status">لم يتم التحقق بعد.</div></div><div id="graduateOptions" hidden><div class="reasons"><label class="reason"><input type="radio" name="reason" value="field-conflict"><span>مقرر يتعارض مع وقت الميداني</span></label><label class="reason"><input type="radio" name="reason" value="field-prerequisite-conflict"><span>مقرر مسبق ميداني يتعارض مع مقرر آخر مسبق ميداني</span></label></div><div class="graduate-detail" id="graduateDetail" hidden><label for="graduateDetails">اكتب متطلباتك</label><textarea id="graduateDetails" maxlength="600" placeholder="اكتب المقرر أو الوقت أو الترتيب الذي تحتاجه، وأي معلومة تساعد القسم على فهم طلبك بدقة."></textarea><small><span>ستظهر هذه المتطلبات في لوحة القسم تحت نوع الطلب الذي اخترته.</span><b id="graduateDetailsCount">0 / 600</b></small></div></div>':kind==="course-conflict"?ownCourseCards()+otherCourseCards():ownCourseCards();
host.innerHTML='<button class="back" id="back">← نوع الطلب</button><div class="step-head"><b>3</b><div><strong>'+title+'</strong><span>'+esc(data.section||"")+'</span></div></div>'+content+'<button class="action" id="send" type="button">إرسال الطلب إلى القسم</button><div id="err"></div>';document.getElementById("back").onclick=chooseType;if(kind==="graduate")wireProof();else{wireOwnCourses();if(kind==="course-conflict")wireOtherCourse()}document.getElementById("send").onclick=submit}

function wireGraduateDetails(){var options=document.getElementById("graduateOptions"),detail=document.getElementById("graduateDetail"),box=document.getElementById("graduateDetails"),count=document.getElementById("graduateDetailsCount");if(!options||!detail||!box)return;options.querySelectorAll('input[name=reason]').forEach(function(input){input.onchange=function(){detail.hidden=false;window.setTimeout(function(){box.focus({preventScroll:true})},30)}});box.oninput=function(){if(count)count.textContent=String(box.value.length)+" / 600"}}

function compactProof(file){return new Promise(function(resolve){var type=String(file.type||"").toLowerCase(),name=String(file.name||"").toLowerCase();if(type.indexOf("image/")!==0||/heic|heif/.test(type)||/\.(heic|heif)$/.test(name)){resolve(file);return}var url=URL.createObjectURL(file),img=new Image();img.onload=function(){try{var max=2200,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));if(scale>=.98&&file.size<1800000){URL.revokeObjectURL(url);resolve(file);return}var canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));var ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw 0;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(function(blob){URL.revokeObjectURL(url);resolve(blob&&blob.size<file.size?blob:file)},"image/jpeg",.86)}catch(e){URL.revokeObjectURL(url);resolve(file)}};img.onerror=function(){URL.revokeObjectURL(url);resolve(file)};img.src=url})}
function formatBytes(n){if(!n)return"0 KB";if(n<1048576)return Math.max(1,Math.round(n/1024))+" KB";return(n/1048576).toFixed(1)+" MB"}
function wireProof(){document.getElementById("verify").onclick=function(){var file=document.getElementById("proof").files[0],button=this,status=document.getElementById("proofStatus"),meter=document.getElementById("uploadMeter"),bar=document.getElementById("uploadBar"),pct=document.getElementById("uploadPct"),bytes=document.getElementById("uploadBytes");if(!file)return fail("اختر صحيفة التخرج أولاً");button.disabled=true;button.textContent="يجهّز الملف…";meter.hidden=false;bar.style.width="0%";pct.textContent="0%";bytes.textContent="يجهّز الملف للرفع السريع…";status.className="proof-status";status.textContent="سيظهر تقدم الرفع هنا، ثم تبدأ قراءة الصحيفة والتحقق منها.";compactProof(file).then(function(payload){var original=file.size,sent=payload.size||file.size;if(sent<original)bytes.textContent="تم ضغط الصورة من "+formatBytes(original)+" إلى "+formatBytes(sent);else bytes.textContent="حجم الملف "+formatBytes(sent);button.textContent="يرفع الإثبات…";var xhr=new XMLHttpRequest();xhr.open("POST",'/api/public/survey/'+encodeURIComponent(TOKEN)+'/proof');xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('x-file-type',payload===file?(file.type||'application/pdf'):(payload.type||'image/jpeg'));xhr.setRequestHeader('x-student-name',encodeURIComponent(student.name));xhr.setRequestHeader('x-student-civil',student.civil);xhr.setRequestHeader('x-student-section',String(student.sectionId));xhr.upload.onprogress=function(e){if(!e.lengthComputable)return;var n=Math.min(99,Math.round(e.loaded/e.total*100));bar.style.width=n+"%";pct.textContent=n+"%";bytes.textContent="رُفع "+formatBytes(e.loaded)+" من "+formatBytes(e.total)};xhr.upload.onload=function(){bar.style.width="100%";pct.textContent="100%";bytes.textContent="اكتمل الرفع · جاري قراءة صحيفة التخرج والتحقق…";button.textContent="يتحقق من الصحيفة…"};xhr.onload=function(){bar.style.width="100%";pct.textContent="100%";var d={};try{d=JSON.parse(xhr.responseText||"{}") }catch(e){};button.disabled=false;button.textContent="إعادة التحقق";if(xhr.status<200||xhr.status>=300){proofEligible=false;proofToken="";status.className="proof-status bad";status.textContent=d.error||"تعذر التحقق";return}proofEligible=!!d.eligible;proofToken=d.proofToken||"";status.className='proof-status '+(proofEligible?'ok':'bad');status.textContent=d.message;if(proofEligible){document.getElementById("graduateOptions").hidden=false;wireGraduateDetails()}};xhr.onerror=function(){button.disabled=false;button.textContent="إعادة التحقق";status.className="proof-status bad";status.textContent="تعذر رفع الإثبات — تحقق من الاتصال."};xhr.send(payload)}).catch(function(){button.disabled=false;button.textContent="إعادة التحقق";status.className="proof-status bad";status.textContent="تعذر تجهيز الإثبات للرفع."})}}
function submit(){var send=document.getElementById("send"),reasonEl=host.querySelector('input[name=reason]:checked'),reason=reasonEl?reasonEl.value:"";if(kind==="new-course"&&!picked.length)return fail("اختر مقرراً واحداً على الأقل");if(kind==="course-conflict"&&(!picked.length||!otherCourse))return fail("اختر مقرراً من قسمك ومقرراً آخر يتعارض معه");if(kind==="course-conflict"&&picked[0]===otherCourse)return fail("اختر مقررين مختلفين");if(kind==="graduate"&&!proofEligible)return fail("تحقق من صحيفة التخرج أولاً");if(kind==="graduate"&&!reason)return fail("اختر نوع طلب الميداني");var graduateDetails=kind==="graduate"?String((document.getElementById("graduateDetails")||{}).value||"").trim():"";if(kind==="graduate"&&graduateDetails.length<3)return fail("اكتب متطلباتك بعد اختيار نوع الطلب");send.disabled=true;send.textContent="جارٍ الإرسال…";fetch('/api/public/survey/'+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:student.name,civil:student.civil,sectionId:student.sectionId,requestType:kind,courseIds:kind==="course-conflict"?[picked[0],otherCourse]:picked,proofToken:proofToken,graduateReason:reason,details:graduateDetails})}).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(!x.ok){send.disabled=false;send.textContent="إرسال الطلب إلى القسم";return fail(x.d.error||"تعذر الإرسال")}host.innerHTML='<div class="done"><div class="tick">✓</div><h2>وصل طلبك إلى القسم</h2><p>شكراً '+esc(x.d.name)+' — تم حفظ الحالة للمراجعة.<br><strong style="color:var(--ink)">رقم الحالة: '+esc(x.d.caseRef||"—")+'</strong><br>احفظ رقم الحالة أو التقط صورة للشاشة. وإذا غيّرت اختيارك، افتح الرابط نفسه وأرسل الطلب من جديد فيُحدّث طلبك الحالي.</p></div>';step=3;paintProgress();window.scrollTo(0,0)}).catch(function(){send.disabled=false;send.textContent="إرسال الطلب إلى القسم";fail("تعذر الإرسال — تحقق من الاتصال.")})}
fetch('/api/public/survey/'+encodeURIComponent(TOKEN)).then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})}).then(function(x){if(!x.ok){host.innerHTML='<div class="err">'+esc(x.d.error||"تعذر فتح النموذج")+'</div>';return}data=x.d;student.sectionId=Number(data.sectionId)||0;identity()}).catch(function(){host.innerHTML='<div class="err">تعذر الاتصال. تحقق من الإنترنت.</div>'})})();
</script></body></html>`;
}

app.get("/q/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  if ("error" in resolved) {
    res.status(resolved.status).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCHEDULE</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a100f;color:#eef2ee;font-family:-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif}p{font-size:15px;color:#93a09a}</style></head><body><div style="text-align:center"><div style="font:600 13px/1 system-ui;letter-spacing:.24em;color:#c79b5f">SCHEDULE</div><p>${esc(resolved.error)}</p></div></body></html>`);
    return;
  }
  if (resolved.link.kind !== "survey") { res.status(404).send("<!doctype html><p dir=rtl>هذا الرابط ليس استبياناً.</p>"); return; }
  res.send(studentCaseSurveyPage(resolved.link.id, esc(resolved.link.label || "استبيان المقررات")));
});

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
      <time dir="ltr">${esc(row.end)} - ${esc(row.start)}</time>
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
    <!-- Rewritten to webcal: on load, so a phone subscribes to the department's
         week instead of keeping one copy that stops being true after the first
         change. The https address stays as the fallback for anything that does
         not know the scheme. -->
    <a class="primary" id="icsLink" href="${icsUrl}">إضافة إلى التقويم</a>
    <script>(function(){var a=document.getElementById("icsLink");
      if(a) a.href="webcal://"+location.host+"${icsUrl}";})();</script>
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
    databaseDownRef = randomBytes(4).toString("hex");
    console.error(`تعذر تهيئة قاعدة البيانات [${databaseDownRef}]:\n` + databaseFailure);
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
    /**
     * A build asset's filename contains a hash of its own bytes, so the content
     * at that URL is immutable by construction — a changed file is a changed
     * URL. Revalidating those on every launch cost a network round trip per
     * asset before the application could paint, on exactly the connections that
     * can least afford one. Anything that does NOT carry a hash keeps the strict
     * revalidation rule, so an interrupted transfer of an unhashed file still
     * cannot be adopted as a long-lived copy.
     */
    const hashedAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (name === "index.html" || name === "sw.js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        } else if (hashedAsset.test(name)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
