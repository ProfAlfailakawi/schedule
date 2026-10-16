/**
 * ── مساري: الملفّ، الرمز، الجلسة، العمر، والصفحة (المرحلة ٣) ─────────────
 *
 *   D1  قواعد الملف النقية: الرمز، القفل، المنجَز والمتبقّي، التخرّج المتوقَّع، عمر الملف.
 *   D2  الجلسة الموقَّعة: لا تُزوَّر، وتنتهي، وتغييرُ الرمز يُنهيها.
 *   D3  المستودع: كتابةٌ ذرّية، حذفٌ، تطهيرٌ بالتاريخ.
 *   D4  أيُّ فصلٍ يفتحه الباب.
 *   D5  الصفحة: سكربتٌ سليم، أيقوناتٌ معرَّفة، لا مصادرَ خارجية، CSP بنونس.
 *   D6  المسار الكامل عبر خادمٍ حقيقي ببياناتٍ مزروعة: من أول دخولٍ إلى الحذف.
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { spawn, type ChildProcess } from "child_process";
import {
  AFTER_GRADUATION_DAYS, CODE_LOCK_MS, CODE_MAX_FAILURES, INACTIVE_DAYS, NEW_PROFILE_YEARS, RESET_COOLDOWN_DAYS,
  afterCodeFailure, codeProblem, expectedGraduation, lockState, planProgress, profileLifetime, resetLifetime,
  sanitizePassed, shouldTouch, unitsOf,
} from "../src/utils/studentProfile";
import { pickDoorTerm } from "../src/utils/termStudentPhases";
import { clearDoorCookie, codeVersion, doorCookie, hashCode, readCookie, readDoorSession, signDoorSession, verifyCode } from "../src/server/studentDoor";
import { STUDENT_HOME_SCRIPT, studentHomePage } from "../src/server/studentHomePage";
import { studentNeedsCommitteeHelp } from "../src/utils/studentNeedRequest";
import { verifiedUnresolvableStudentConflicts } from "../src/utils/studentCaseConflict";
import type { SimOffering } from "../src/utils/registrationSim";
import type { AdTerm, StudentProfile } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const DAY = 86_400_000;

/* الرغبات الصريحة تشمل المقرر غير المطروح، حتى يصل الطلب إلى الرادار الجماعي. */
const studentHomeSource = read("src/server/studentHomePage.ts");
check(studentHomeSource.includes("var remaining=(S.offered&&S.offered.courses)||[];")
  && studentHomeSource.includes("غير مطروح هذا الفصل")
  && studentHomeSource.includes("غير مطروح") ,
"D5 يستطيع الطالب إبداء حاجته إلى مقرر غير مطروح، وتظهر حالته بوضوح");
check(studentHomeSource.includes("/api/public/me/request-context") && studentHomeSource.includes("/api/public/me/request")
  && studentHomeSource.includes("أوافق على إرسال اسمي ورقمي المدني") && studentHomeSource.includes("تعذّر تكوين جدول؟")
  && studentHomeSource.includes("conflictPairs") && studentHomeSource.includes("لم نجد توليفة منشورة خالية منه"),
"D5 يستطيع الطالب إرسال طلب الفتح/التعارض من مساري بموافقة صريحة");

{
  const profile: any = { updatedAt: "2026-10-01T00:00:00.000Z", wishes: { termId: 7 } };
  const run: any = { runId: "r1", ranAt: "2026-10-02T00:00:00.000Z" };
  const ticket: any = { runId: "r1", remainingUnits: 24, plans: [{ units: 9 }, { units: 9 }, { units: 6 }], unmet: [{ courseId: 12 }] };
  check(studentNeedsCommitteeHelp(profile, run, ticket, 7), "D5 طلب المساعدة متاح عند تعثر موثق في محاكاة حالية");
  check(!studentNeedsCommitteeHelp(profile, run, { ...ticket, plans: [{ units: 12 }] }, 7), "D5 لا يُنشأ طلب فردي إذا استطاع الطالب بلوغ 12 وحدة");
  check(!studentNeedsCommitteeHelp(profile, run, { ...ticket, remainingUnits: 9 }, 7), "D5 لا يُعدّ المتوقع تخرجه والمتبقي له أقل من 12 متعثراً");
  check(!studentNeedsCommitteeHelp({ ...profile, updatedAt: "2026-10-03T00:00:00.000Z" }, run, ticket, 7), "D5 إعادة المحاكاة مطلوبة بعد تغيير ملف الطالب");
  check(!studentNeedsCommitteeHelp(profile, run, { ...ticket, runId: "old" }, 7), "D5 لا يُقبل تشغيل قديم أو تذكرة من تشغيل آخر");
}

/* ── D1: القواعد ─────────────────────────────────────────────────────────── */
{
  check(codeProblem("135790") === null && codeProblem("482615") === null, "D1 رمزٌ جيّد يُقبل");
  check(Boolean(codeProblem("123456")) && Boolean(codeProblem("654321")) && Boolean(codeProblem("000000")) && Boolean(codeProblem("777777")), "D1 المتتالي والمكرَّر يُرفضان");
  check(Boolean(codeProblem("12345")) && Boolean(codeProblem("1234567")) && Boolean(codeProblem("12a456")) && Boolean(codeProblem("")), "D1 الطولُ والحروف");
  let failures: ReturnType<typeof afterCodeFailure> | undefined;
  const now = 1_000_000;
  for (let i = 1; i < CODE_MAX_FAILURES; i += 1) { failures = afterCodeFailure({ codeFailures: failures }, now); check(failures.count === i && !failures.lockedUntil, `D1 الخطأ ${i}: يُعدّ ولا يُقفل`); }
  failures = afterCodeFailure({ codeFailures: failures }, now);
  check(Boolean(failures.lockedUntil) && failures.lockedUntil === now + CODE_LOCK_MS, "D1 الخطأ الأخير يقفل خمس عشرة دقيقة");
  check(lockState({ codeFailures: failures }, now + 60_000).locked && !lockState({ codeFailures: failures }, now + CODE_LOCK_MS + 1).locked, "D1 القفل يزول بعد مدّته");
  const after = afterCodeFailure({ codeFailures: failures }, now + CODE_LOCK_MS + 5);
  check(after.count === 1 && !after.lockedUntil, "D1 بعد زوال القفل يبدأ العدّ من جديد");

  const credit = new Map([[1, 3], [2, 3], [3, 4], [4, 2]]);
  check(unitsOf([1, 3], credit) === 7, "D1 مجموع الوحدات");
  check(JSON.stringify(sanitizePassed([3, "1", 1, 99, "x", 2.5, -1], new Set([1, 2, 3]))) === "[1,3]", "D1 المنجَز: ما في القسم فقط، بلا تكرار، مرتّب");
  const progress = planProgress([1, 2, 3, 4], [1, 3, 99], credit);
  check(progress.passedCourses === 2 && progress.passedUnits === 7 && progress.totalUnits === 12 && progress.remainingUnits === 5 && progress.percent === 58 && progress.remainingIds.join() === "2,4", "D1 التقدّم بالوحدات لا بعدد المقررات، ومقرّرٌ خارج الصحيفة لا يُعدّ", progress);
  check(planProgress([], [], credit).percent === 0, "D1 صحيفةٌ فارغة: صفر لا قسمةٌ على صفر");

  const base = new Date("2026-10-15T00:00:00Z");
  check(expectedGraduation(0, base) === base.toISOString(), "D1 لا متبقّي: الآن");
  check(expectedGraduation(27, base).slice(0, 10) === "2027-10-15", "D1 ٢٧ وحدة ≈ فصلان ← سنة");
  check(Date.parse(expectedGraduation(120, base)) > Date.parse(expectedGraduation(30, base)), "D1 كلما زاد المتبقّي تأخّر");

  const created = "2026-01-01T00:00:00.000Z";
  const fresh = profileLifetime({ createdAt: created, lastSeenAt: created }, new Date(created));
  check(fresh.deleteReason === "inactive" && Date.parse(fresh.deleteAt) - Date.parse(created) === INACTIVE_DAYS * DAY, "D1 ملفٌّ جديد بلا تخرّج مقدَّر: الانقطاع أقرب من ست سنوات");
  const soon = profileLifetime({ createdAt: created, lastSeenAt: "2026-10-01T00:00:00.000Z", expectedGraduationAt: "2026-12-01T00:00:00.000Z" }, new Date("2026-10-01"));
  check(soon.deleteReason === "graduation" && soon.deleteAt.slice(0, 10) === new Date(Date.parse("2026-12-01") + AFTER_GRADUATION_DAYS * DAY).toISOString().slice(0, 10), "D1 التخرّج القريب: بعده بسنة");
  const far = profileLifetime({ createdAt: created, lastSeenAt: "2026-10-01T00:00:00.000Z", expectedGraduationAt: "2034-10-01T00:00:00.000Z" }, new Date("2026-10-01"));
  check(far.deleteReason === "inactive", "D1 تخرّجٌ بعيد: الانقطاعُ أقرب فيُحذف");
  check(NEW_PROFILE_YEARS === 6, "D1 ست سنوات لملفٍّ جديد");
  const reset = resetLifetime({ deleteAt: "2030-01-01T00:00:00.000Z" }, base);
  check(reset.deleteReason === "reset" && Date.parse(reset.deleteAt) - base.getTime() === RESET_COOLDOWN_DAYS * DAY, "D1 طلبُ الحذف: بعد ٣٠ يوماً");
  const resetSooner = resetLifetime({ deleteAt: "2026-10-20T00:00:00.000Z" }, base);
  check(resetSooner.deleteAt === "2026-10-20T00:00:00.000Z", "D1 وإن كان عمرُ الملف أقصر فلا يُمدَّد");
  check(shouldTouch("2026-10-14T00:00:00.000Z", Date.parse("2026-10-14T23:00:00Z")) === false && shouldTouch("2026-10-14T00:00:00.000Z", Date.parse("2026-10-15T00:00:01Z")), "D1 آخرُ دخول يُكتب مرةً في اليوم");
}

/* ── D2: الجلسة الموقَّعة ────────────────────────────────────────────────── */
{
  const { hash, salt } = await hashCode("135790");
  check(await verifyCode("135790", hash, salt) && !(await verifyCode("135791", hash, salt)) && !(await verifyCode("135790", undefined, salt)), "D2 الرمز مُلحَّم: يطابق صحيحَه وحده");
  check((await hashCode("135790")).hash !== hash, "D2 ملحٌ عشوائيّ: الرمزُ نفسه تجزئتان");
  const key = Buffer.from("k".repeat(32));
  const now = Date.now();
  const token = signDoorSession(key, { fingerprint: "fp1", exp: now + 60_000, cv: codeVersion(hash) });
  check(readDoorSession(key, token, now)?.fingerprint === "fp1", "D2 جلسةٌ صحيحة تُقرأ");
  check(readDoorSession(key, token, now + 61_000) === null, "D2 وتنتهي");
  check(readDoorSession(Buffer.from("x".repeat(32)), token, now) === null, "D2 بمفتاحٍ آخر لا تُقرأ");
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ fingerprint: "victim", exp: now + 60_000, cv: "" })).toString("base64url");
  check(readDoorSession(key, `${forged}.${sig}`, now) === null && readDoorSession(key, `${body}.x${sig}`, now) === null && readDoorSession(key, "", now) === null, "D2 التزوير والعبث بالتوقيع");
  check(!token.includes("3000") && !/civil/i.test(Buffer.from(body, "base64url").toString()), "D2 الجلسة لا تحمل رقماً مدنياً");
  check(codeVersion((await hashCode("999888")).hash) !== codeVersion(hash), "D2 تغييرُ الرمز يغيّر نسخةَ الجلسة (فتسقط القديمة)");
  const c1 = doorCookie(token, { remember: false, maxAgeSeconds: 100, secure: true }), c2 = doorCookie(token, { remember: true, maxAgeSeconds: 100, secure: false });
  check(c1.includes("HttpOnly") && c1.includes("SameSite=Lax") && c1.includes("Secure") && !c1.includes("Max-Age"), "D2 كوكي الجلسة: HttpOnly + Lax + Secure، ويزول بإغلاق المتصفح");
  check(c2.includes("Max-Age=100") && !c2.includes("Secure"), "D2 «جهازي»: له عمر");
  check(clearDoorCookie(false).includes("Max-Age=0"), "D2 الخروج يمحو الكوكي");
  check(readCookie("a=1; sh_session=" + encodeURIComponent(token) + "; b=2", "sh_session") === token && readCookie("a=1", "sh_session") === undefined, "D2 قراءة الكوكي");
}

/* ── D3: المستودع ─────────────────────────────────────────────────────────── */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-door-repo-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ schedules: [], colleges: [], sections: [], terms: [], courses: [], instructors: [], users: [], studentProfiles: [] }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  await initDatabase();
  console.warn = quiet;
  const mk = (fp: string, deleteAt: string): StudentProfile => ({
    id: fp, fingerprint: fp, AdCollegeId: 1, AdSectionId: 11, passedCourseIds: [101], passedUnits: 3,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z", deleteAt, deleteReason: "initial",
  });
  check((await Repository.getStudentProfile("nobody")) === undefined && (await Repository.getStudentProfile("")) === undefined, "D3 ملفٌّ غير موجود: لا شيء");
  const created = await Repository.updateStudentProfile("fp-a", current => (current ? undefined : mk("fp-a", "2099-01-01T00:00:00.000Z")));
  check(created?.id === "fp-a", "D3 الإنشاء عبر المعاملة");
  const again = await Repository.updateStudentProfile("fp-a", current => (current ? undefined : mk("fp-a", "2099-01-01T00:00:00.000Z")));
  check(again?.passedUnits === 3, "D3 undefined = تركُ الحال (لا استبدال)");
  const bumped = await Repository.updateStudentProfile("fp-a", current => (current ? { ...current, passedUnits: 9 } : undefined));
  check(bumped?.passedUnits === 9 && (await Repository.getStudentProfile("fp-a"))?.passedUnits === 9, "D3 التعديل يُحفظ");
  const forcedId = await Repository.updateStudentProfile("fp-a", current => ({ ...(current as StudentProfile), id: "evil", fingerprint: "evil" }));
  check(forcedId?.id === "fp-a" && forcedId?.fingerprint === "fp-a", "D3 المفتاحُ هو ما طُلب لا ما في الجسم");
  await Repository.updateStudentProfile("fp-old", () => mk("fp-old", "2020-01-01T00:00:00.000Z"));
  await Repository.updateStudentProfile("fp-old2", () => mk("fp-old2", "2021-01-01T00:00:00.000Z"));
  await Repository.updateStudentProfile("fp-new", () => mk("fp-new", "2099-01-01T00:00:00.000Z"));
  check(await Repository.purgeExpiredStudentProfiles("2026-10-15T00:00:00.000Z", 1) === 1, "D3 التطهير دفعةٌ محدودة");
  check(await Repository.purgeExpiredStudentProfiles("2026-10-15T00:00:00.000Z") === 1, "D3 والدورةُ التالية تكمل");
  check(!(await Repository.getStudentProfile("fp-old")) && !(await Repository.getStudentProfile("fp-old2")) && Boolean(await Repository.getStudentProfile("fp-a")) && Boolean(await Repository.getStudentProfile("fp-new")), "D3 ما انتهى عمرُه يُحذف وغيرُه يبقى");
  check(await Repository.purgeExpiredStudentProfiles("2026-10-15T00:00:00.000Z") === 0, "D3 لا شيء ينتهي: صفر");
  await Repository.updateStudentProfile("fp-a", () => null);
  check(!(await Repository.getStudentProfile("fp-a")), "D3 null = حذف");
  const noFp = await Repository.updateStudentProfile("fp-x", () => undefined).catch(() => "threw");
  check(noFp === undefined, "D3 ملفٌّ غائب وmutate لا يُنشئ: undefined");
  let threw = false; try { await Repository.updateStudentProfile("", () => undefined); } catch { threw = true; }
  check(threw, "D3 بصمةٌ فارغة: خطأ");
}

/* ── D4: أيُّ فصلٍ يفتحه الباب ─────────────────────────────────────────────── */
{
  const now = Date.parse("2026-10-15T08:00:00Z");
  const t = (id: number, name: string, extra: Partial<AdTerm> = {}): AdTerm => ({ AdTermId: id, AdTermName: name, AdTermStart: id === 1 ? "2026-09-13" : "2027-01-31", AdTermWeeks: 14, ...extra } as AdTerm);
  const phases = { wishesOpen: "2026-10-10", wishesClose: "2026-10-25", requestsClose: "2026-12-10" };
  check(pickDoorTerm([t(1, "الفصل الأول 2026/2027", { AdTermClosed: false, AdTermStudentPhases: phases })], now)?.AdTermId === 1, "D4 فصلٌ له تواريخ طلبة مفتوحة");
  const closedPhases = { wishesOpen: "2026-09-01", wishesClose: "2026-09-10", requestsClose: "2026-09-30" };
  const afterClose = pickDoorTerm([t(1, "الفصل الأول 2026/2027", { AdTermClosed: false, AdTermStudentPhases: closedPhases }), t(2, "الفصل الثاني 2026/2027", { AdTermClosed: false })], now);
  check(afterClose?.AdTermId === 2, "D4 فصلٌ أُغلقت طلباتُه لا يُفتح له الباب: ينتقل إلى فصل التخطيط", afterClose?.AdTermId);
  const dated = pickDoorTerm([t(1, "الفصل الأول 2026/2027", { AdTermClosed: false }), t(2, "الفصل الثاني 2026/2027", { AdTermClosed: false, AdTermStudentPhases: { wishesOpen: "2026-12-01", wishesClose: "2026-12-14", requestsClose: "2027-02-01" } })], now);
  check(dated?.AdTermId === 2, "D4 الفصلُ الذي له تواريخُ طلبةٍ يُقدَّم على الجاري بلا تواريخ", dated?.AdTermId);
  check(pickDoorTerm([], now) === null, "D4 لا فصول: لا شيء");
  check(pickDoorTerm([t(1, "الفصل الأول 2026/2027", { AdTermClosed: true, AdTermStudentPhases: phases })], now) === null, "D4 فصلٌ مغلق صراحةً لا يُفتح له الباب");
  const undated = pickDoorTerm([t(1, "الفصل الأول 2026/2027", { AdTermClosed: false })], now);
  check(undated?.AdTermId === 1, "D4 فصلٌ بلا تواريخ: يبقى الجاري، والباب يقول «لم تُحدَّد»");
}

/* ── D5: الصفحة ───────────────────────────────────────────────────────────── */
{
  const html = studentHomePage("TESTNONCE");
  let syntax = "";
  try { new vm.Script(STUDENT_HOME_SCRIPT); } catch (error: any) { syntax = String(error?.message); }
  check(!syntax, "D5 سكربت الصفحة سليم الصياغة", syntax);
  check(html.includes('<script nonce="TESTNONCE">') && !/<script(?![^>]*nonce)[^>]*>/.test(html.replace(/<noscript>[\s\S]*?<\/noscript>/, "")), "D5 كلُّ سكربتٍ بنونس (CSP)");
  check(!/https?:\/\//.test(STUDENT_HOME_SCRIPT) && !/<link[^>]+https?:/.test(html) && !/src="https?:/.test(html), "D5 لا مصدرَ خارجياً: كل شيء من الخادم نفسه");
  const sprite = new Set([...html.matchAll(/<symbol id="i-([a-z]+)"/g)].map(m => m[1]));
  const used = [...STUDENT_HOME_SCRIPT.matchAll(/ic\("([a-z]+)"/g)].map(m => m[1]);
  const missing = [...new Set(used)].filter(name => !sprite.has(name));
  check(sprite.size >= 20 && missing.length === 0, "D5 كلُّ أيقونةٍ مستعملة معرَّفة في الصفحة", missing);
  check(!/localStorage|sessionStorage|indexedDB/.test(STUDENT_HOME_SCRIPT), "D5 لا يُكتب شيءٌ في تخزين المتصفح: الملفُّ على الخادم");
  check(!/\$\{/.test(STUDENT_HOME_SCRIPT.replace(/var countOf=[\s\S]*?;var AR=\{[^\n]*\};/, "")), "D5 لا ‎${‎ شاردة في سكربت الصفحة");
  check(html.includes('lang="ar" dir="rtl"') && html.includes("viewport-fit=cover") && html.includes('name="robots" content="noindex,nofollow"'), "D5 عربيةٌ يمينية للهاتف ولا تُفهرَس");
  check(html.includes("prefers-reduced-motion") && html.includes("env(safe-area-inset-bottom)"), "D5 احترامُ تقليل الحركة وحوافّ الهاتف");
  const server = read("server.ts");
  check(server.includes("registerStudentDoorRoutes(app,") && server.includes('app.get(["/me", "/me/"]') && server.includes("scheduleStudentProfilePurge("), "D5 الخادم يسجّل المسارات والصفحة والتطهير");
  check(server.includes('req.query.track === "boys" ? "boys" : req.query.track === "girls" ? "girls" : ""') && server.includes("studentHomePage(publicPageNonce(res), track)"), "D5 مسار الصفحة ثابتٌ من قائمة مسموحة وبنونسٍ جديد في كل طلب");
  const routes = read("src/server/studentDoorRoutes.ts");
  check(!/civil\s*:/.test(routes.slice(routes.indexOf("async function summaryOf"), routes.indexOf("export function registerStudentDoorRoutes"))), "D5 ملخّصُ الملف لا يحمل رقماً مدنياً");
  check(routes.includes("offeringIndex(") && routes.includes("ttlMs: 5 * 60_000"), "D5 المطروح من فهرسٍ في الذاكرة لا من قاعدة البيانات في كل زيارة");
  check(routes.includes("reading.canEditWishes") && routes.includes('"wishes-closed"'), "D5 الرغبات لا تُكتب خارج مرحلتها");
  check(server.includes('req.originalUrl.startsWith("/api/public/me/")'), "D5 مساري خارج عدّاد العنوان العام (شبكةُ الجامعة عنوانٌ واحد لآلاف الطلبة)");
  check(routes.includes("codeLimiter.reserve(") && routes.includes("attempt.release()"), "D5 أخطاءُ الرمز وحدها تُعدّ على العنوان");
  check(/afterCodeFailure\(current, now\)/.test(routes) && /lockState\(profile, now\)/.test(routes), "D5 القفل على الملف نفسه لا على العنوان وحده");
}

/* ── D6: المسار الكامل ببياناتٍ مزروعة ───────────────────────────────────── */
{
  const BASE = process.env.DOOR_TEST_BASE || "http://localhost:3000";
  const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const civil = (seed: number) => {
    for (let n = seed; ; n += 1) {
      const body = "3050612" + String(n).padStart(4, "0");
      const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
      const c = 11 - (sum % 11);
      if (c <= 9) return body.slice(0, 11) + c;
    }
  };
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-door-live-"));
  /* علامةٌ فريدة لهذه التجربة: خادمٌ قديمٌ على المنفذ نفسه بحالةٍ سابقة لا يُخلط بها. */
  const MARK = `الفصل الأول 2026/2027 · ${Math.random().toString(16).slice(2, 8)}`;
  const courses: any[] = [], planCourses: any[] = [], schedules: any[] = [];
  let id = 100, row = 1;
  const defs: Array<[string, number, number, string[]]> = [["ISL", 11, 1, ["أصول التربية", "فقه العبادات", "علوم القرآن", "السيرة النبوية", "العقيدة", "التفسير"]], ["ARB", 12, 1, ["النحو", "الصرف", "البلاغة"]]];
  for (const [code, sid, cid, list] of defs) list.forEach((name, i) => {
    id += 1; courses.push({ AdCourseId: id, AdCollegeId: cid, AdSectionId: sid, CourseCode: `${code}${100 + i}`, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
    planCourses.push({ id: `a${id}`, planId: `p-${sid}-new`, AdCollegeId: cid, AdSectionId: sid, AdCourseId: id, createdAt: "2026-01-01" });
    if (sid === 11 && i < 4) planCourses.push({ id: `b${id}`, planId: `p-${sid}-old`, AdCollegeId: cid, AdSectionId: sid, AdCourseId: id, createdAt: "2026-01-01" });
    if (i % 2 === 0) for (const s of ["501", "502"]) schedules.push({ id: row++, AdCollegeId: cid, AdSectionId: sid, AdTermId: 1, AdCourseId: id, AdCourseName: name, SCode: s, AdInstructorId: 1, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "A", AdRoomHall: "1" });
  });
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
    terms: [{ AdTermId: 1, AdTermName: MARK, AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false, AdTermSubmissionDeadline: add(today, -8),
      AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }], requestsClose: add(today, 60) } }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية الأساسية — بنين" }, { AdCollegeId: 2, AdCollegeCode: "EDUG", AdCollegeName: "كلية التربية الأساسية — بنات" }, { AdCollegeId: 3, AdCollegeCode: "EDUJ", AdCollegeName: "كلية التربية الأساسية — بنات — الجهراء" }],
    sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "ARB", AdSectionName: "قسم اللغة العربية" }, { AdSectionId: 21, AdCollegeId: 2, AdSectionCode: "PSY", AdSectionName: "قسم علم النفس" }, { AdSectionId: 22, AdCollegeId: 3, AdSectionCode: "PSY", AdSectionName: "قسم علم النفس" }],
    instructors: [{ AdInstructorId: 1, AdInstructorName: "د. تجريبي", AdInstructorCivil: "", AdInstructorMobile: "" }],
    courses, curriculumPlans: [
      { id: "p-11-new", AdCollegeId: 1, AdSectionId: 11, name: "الجديدة", status: "active", createdAt: "2026-02-01" },
      { id: "p-11-old", AdCollegeId: 1, AdSectionId: 11, name: "السابقة", status: "transition", createdAt: "2026-01-01" },
      { id: "p-12-new", AdCollegeId: 1, AdSectionId: 12, name: "الجديدة", status: "active", createdAt: "2026-02-01" }],
    curriculumPlanCourses: planCourses, courseTransitions: [], schedules, rooms: [], studentNeeds: [], studentProfiles: [],
  }), { mode: 0o600 });

  type Res = { status: number; json: any; cookies: string[]; headers: Headers };
  let jar = "";
  async function http(method: string, url: string, body?: unknown, cookie?: string): Promise<Res> {
    const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...((cookie ?? jar) ? { cookie: cookie ?? jar } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
    const cookies = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() as string[] : [];
    return { status: res.status, json, cookies, headers: res.headers };
  }
  const cookieOf = (r: Res) => (r.cookies[0] || "").split(";")[0];
  const up = async () => { try { const r = await fetch(BASE + "/api/public/me/state"); return r.ok ? await r.json() : null; } catch { return null; } };
  let child: ChildProcess | null = null;
  let live = true;
  try {
    const existing = await up();
    if (existing) live = false;
    if (!existing) {
      child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i += 1) { ready = Boolean(await up()); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
      if (!ready) throw new Error("الخادم لم يبدأ");
    }
    if (!live) console.log("   (تخطّي المسار الحيّ: المنفذ مشغول بخادمٍ ببياناتٍ أخرى)");
    else {
      const ID = civil(7), CODE = "135790";
      const state = (await http("GET", "/api/public/me/state")).json;
      check(state.term?.name === MARK && state.phase?.mode === "wishes" && state.phase?.canEditWishes === true && state.signedIn === false && state.profile === null, "D6 الحالة: الرغبات مفتوحة والزائر خارج", state.phase);
      check(Array.isArray(state.timeline) && state.timeline.length === 5 && state.timeline.filter((s: any) => s.state === "now").length === 1, "D6 الشريط الزمني خمس محطات، واحدةٌ «الآن»");

      check((await http("POST", "/api/public/me/identity", { civil: "123" })).status === 400, "D6 رقمٌ مدنيٌّ قصير: ٤٠٠");
      check((await http("POST", "/api/public/me/identity", { civil: "300000000001" })).status === 400, "D6 مجموعٌ اختباريٌّ خاطئ: ٤٠٠");
      const unknown = await http("POST", "/api/public/me/identity", { civil: ID });
      check(unknown.status === 200 && unknown.json.exists === false, "D6 رقمٌ جديد: لا ملف");
      check((await http("POST", "/api/public/me/enter", { civil: ID, code: CODE })).status === 404, "D6 الدخول بلا ملفٍّ: ٤٠٤");
      check((await http("POST", "/api/public/me/enter", { civil: ID, code: CODE, create: true })).json.code === "no-consent", "D6 الإنشاء بلا موافقة");
      check((await http("POST", "/api/public/me/enter", { civil: ID, code: "111111", create: true, agree: true, name: "طالب تجريبي ثلاثي" })).json.code === "weak-code", "D6 رمزٌ ضعيف مرفوض");
      const made = await http("POST", "/api/public/me/enter", { civil: ID, code: CODE, create: true, agree: true, name: "طالب تجريبي ثلاثي" });
      check(made.status === 201 && made.json.profile?.setupDone === false, "D6 إنشاء الملف", made.json);
      const sessionCookie = cookieOf(made);
      check(/HttpOnly/.test(made.cookies[0] || "") && /SameSite=Lax/.test(made.cookies[0] || "") && !/Max-Age/.test(made.cookies[0] || ""), "D6 كوكي الجلسة: HttpOnly + Lax وبلا عمر (ينتهي بإغلاق المتصفح)", made.cookies);
      check(!JSON.stringify(made.json).includes(ID) && !JSON.stringify(made.json).includes("codeHash"), "D6 الردّ لا يحمل الرقم المدني ولا التجزئة");
      check((await http("POST", "/api/public/me/enter", { civil: ID, code: CODE, create: true, agree: true, name: "طالب تجريبي ثلاثي" })).status === 409, "D6 إنشاءٌ ثانٍ: ٤٠٩");
      check((await http("GET", "/api/public/me/profile", undefined, "")).status === 401, "D6 بلا جلسة: ٤٠١");
      check((await http("GET", "/api/public/me/profile", undefined, "sh_session=garbage")).status === 401, "D6 جلسةٌ مزوَّرة: ٤٠١");
      jar = sessionCookie;

      const cat = (await http("GET", "/api/public/me/catalog")).json;
      const boys = (await http("GET", "/api/public/me/catalog?track=boys")).json;
      const girls = (await http("GET", "/api/public/me/catalog?track=girls")).json;
      check(cat.specializations.length === 0 && cat.tracks.join() === "boys,girls", "D6 لا تظهر كل الكليات قبل اختيار المسار");
      check(boys.specializations.length === 2 && boys.specializations.some((item: any) => item.name === "قسم التربية الإسلامية"), "D6 مسار البنين يعرض التخصصات فقط");
      check(girls.specializations.length === 1 && girls.specializations[0].name === "قسم علم النفس" && girls.specializations[0].id === 21, "D6 تخصص واحد بلا تكرار بين المواقع، ومعرّف القسم الداخلي محفوظ");
      check(!JSON.stringify(girls).includes("الجهراء") && !JSON.stringify(girls).includes("المقر الرئيسي"), "D6 الطالب لا يرى اسم المقر أو الموقع في قائمة التخصصات");
      const plan = (await http("GET", "/api/public/me/plan?sectionId=11")).json;
      check(plan.source === "plan" && plan.plans.length === 2 && plan.plans[0].courses.length > 0, "D6 صحيفتان لقسمٍ انتقاليّ", plan.plans?.map((p: any) => p.courses.length));
      check((await http("PUT", "/api/public/me/profile", { sectionId: 999, passedCourseIds: [] })).json.code === "bad-section", "D6 قسمٌ غير موجود");
      check((await http("PUT", "/api/public/me/profile", { sectionId: 11, passedCourseIds: [] })).json.code === "bad-plan", "D6 قسمٌ بصحيفتين بلا اختيار: يُطلب");
      const newPlan = plan.plans.find((p: any) => p.id === "p-11-new"), oldPlan = plan.plans.find((p: any) => p.id === "p-11-old");
      const onlyNew = newPlan.courses.find((c: any) => !oldPlan.courses.some((o: any) => o.id === c.id));
      const shared = oldPlan.courses.slice(0, 2).map((c: any) => c.id);
      const saved = await http("PUT", "/api/public/me/profile", { sectionId: 11, curriculumPlanId: "p-11-old", passedCourseIds: [...shared, onlyNew.id, 999999, "x"] });
      check(saved.status === 200 && saved.json.setupDone && saved.json.passedCourseIds.length === 2 && !saved.json.passedCourseIds.includes(onlyNew.id), "D6 مقررٌ ليس في الصحيفة المختارة يُسقَط، وغريبٌ يُسقَط", saved.json);
      check(saved.json.progress.totalCourses === oldPlan.courses.length && saved.json.progress.percent > 0 && saved.json.planName === "السابقة", "D6 التقدّم محسوبٌ على الصحيفة المختارة");
      check(new Date(saved.json.keepsUntil).getTime() > Date.now() && ["graduation", "inactive"].includes(saved.json.keepsReason), "D6 للملف عمرٌ مكتوب", saved.json.keepsUntil);

      check((await http("PUT", "/api/public/me/wishes", { targetUnits: 9, courseIds: [] })).json.code === "bad-units", "D6 وحداتٌ دون ١٢ مرفوضة");
      check((await http("PUT", "/api/public/me/wishes", { targetUnits: 19, courseIds: [] })).json.code === "bad-units", "D6 وفوق ١٨ مرفوضة");
      const offered = (await http("GET", "/api/public/me/offered")).json;
      check(offered.ready === true && offered.remainingCount > 0 && offered.offeredCount >= 1, "D6 المطروح لي: أعدادٌ من الجدول", offered);
      const wantId = offered.courses.find((c: any) => c.sections > 0).id;
      const wished = await http("PUT", "/api/public/me/wishes", { targetUnits: 15, courseIds: [wantId, shared[0], 424242], constraints: { noMorning: true, freeDay: "yes" } });
      check(wished.status === 200 && wished.json.wishes.courseIds.join() === String(wantId) && wished.json.wishes.constraints.noMorning === true && wished.json.wishes.constraints.freeDay === false, "D6 الرغبات: المنجَزُ والغريب يُسقطان، والقيد بقيمةٍ صارمة", wished.json);
      const requestContext = await http("GET", "/api/public/me/request-context");
      const requestCourse = oldPlan.courses.find((c: any) => !saved.json.passedCourseIds.includes(c.id));
      const otherCollegeCourse = requestContext.json.conflictCourses.find((c: any) => !c.own);
      check(requestContext.status === 200 && !requestContext.json.canRequest && requestContext.json.courses.length === 0, "D6 لا يعرض طلباً فردياً قبل أن تثبت المحاكاة تعثر الطالب", requestContext.json);
      const noConsent = await http("POST", "/api/public/me/request", { requestType: "new-course", courseIds: [requestCourse.id], details: "احتاجه للتخرج" });
      check(noConsent.status === 400 && noConsent.json.code === "consent-needed", "D6 لا تُرسل هوية الطالب للقسم دون موافقته الصريحة");
      const opened = await http("POST", "/api/public/me/request", { requestType: "new-course", courseIds: [requestCourse.id], details: "أحتاج المقرر لاستكمال خطتي", consent: true });
      check(opened.status === 409 && opened.json.code === "no-proven-blocker", "D6 رفض طلب فردي بلا تعثر مثبت في المحاكاة");
      const casesAfterRequest = await http("GET", "/api/public/me/cases");
      check(casesAfterRequest.json.cases.length === 0, "D6 الطلب المرفوض لا ينشئ حالة في كشف القسم");
      if (otherCollegeCourse) {
        const cross = await http("POST", "/api/public/me/request", { requestType: "course-conflict", courseIds: [requestCourse.id, otherCollegeCourse.id], details: "يتعارض موعد المقررين", consent: true });
        check(cross.status === 409 && cross.json.code === "no-proven-blocker", "D6 لا تُرسل مراجعة تعارض قبل إثبات تعثر المحاكاة");
        const outside = requestContext.json.conflictCourses.find((c: any) => c.id === 999999);
        check(!outside, "D6 قائمة تعارض المقررات محصورة ببيانات الكلية");
      }
      const rawOffered = JSON.stringify(offered);
      check(!/fstarttime|fendtime|AdRoom|AdInstructor|fsunday|SCode/.test(rawOffered), "D6 ما يراه الطالب أعدادٌ لا مواعيدَ ولا قاعاتٍ ولا أساتذة");

      const remembered = await http("POST", "/api/public/me/enter", { civil: ID, code: CODE, remember: true }, "");
      check(remembered.status === 200 && /Max-Age=\d+/.test(remembered.cookies[0] || ""), "D6 «هذا جهازي»: جلسةٌ طويلة");
      check((await http("GET", "/api/public/me/profile", undefined, cookieOf(remembered))).json.wishes?.targetUnits === 15, "D6 الدخول من جهازٍ آخر يجد الملفَّ نفسَه");

      /* القفل: خمسُ أخطاءٍ تقفل ولو جاء الرمزُ الصحيح بعدها */
      let last: Res | null = null;
      for (let i = 0; i < CODE_MAX_FAILURES; i += 1) last = await http("POST", "/api/public/me/enter", { civil: ID, code: "246802" }, "");
      check(last?.json.code === "locked", "D6 الخطأ الخامس يقفل", last?.json);
      const locked = await http("POST", "/api/public/me/enter", { civil: ID, code: CODE }, "");
      check(locked.status === 423 && locked.json.retryInSeconds > 0, "D6 والرمزُ الصحيح بعد القفل لا يمرّ: ٤٢٣", locked.json);

      const other = civil(21);
      await http("POST", "/api/public/me/enter", { civil: other, code: "908172", create: true, agree: true, name: "طالب تجريبي ثلاثي" }, "");
      const otherLogin = await http("POST", "/api/public/me/enter", { civil: other, code: "908172" }, "");
      check(otherLogin.status === 200, "D6 القفل على الملف لا على العنوان: غيرُه يدخل من العنوان نفسه");
      const otherJar = cookieOf(otherLogin);

      /* تغيير الرمز يُنهي الجلسات القديمة */
      check((await http("POST", "/api/public/me/code", { oldCode: "000000", newCode: "864209" }, otherJar)).json.code === "bad-code", "D6 تغيير الرمز بخاطئٍ قديم: مرفوض");
      check((await http("POST", "/api/public/me/code", { oldCode: "908172", newCode: "333333" }, otherJar)).json.code === "weak-code", "D6 رمزٌ جديد ضعيف مرفوض");
      const changed = await http("POST", "/api/public/me/code", { oldCode: "908172", newCode: "864209" }, otherJar);
      check(changed.status === 200 && Boolean(cookieOf(changed)), "D6 تغيير الرمز يُصدر جلسةً جديدة");
      check((await http("GET", "/api/public/me/profile", undefined, otherJar)).status === 401, "D6 الجلسةُ القديمة سقطت بتغيير الرمز");
      check((await http("GET", "/api/public/me/profile", undefined, cookieOf(changed))).status === 200, "D6 والجديدةُ تعمل");

      /* نسيتُ رمزي: مهلةٌ، ودخولُ صاحبه يُلغيها */
      const rst = await http("POST", "/api/public/me/reset", { civil: other }, "");
      check(rst.status === 200 && rst.json.days === RESET_COOLDOWN_DAYS, "D6 طلبُ الحذف يمنح مهلة", rst.json);
      const pending = (await http("POST", "/api/public/me/identity", { civil: other }, "")).json;
      check(pending.resetPending === true && Boolean(pending.resetAt), "D6 الباب يقول إن حذفاً معلَّق");
      check((await http("POST", "/api/public/me/enter", { civil: other, code: "864209" }, "")).status === 200, "D6 دخولٌ صحيح في المهلة");
      check((await http("POST", "/api/public/me/identity", { civil: other }, "")).json.resetPending === false, "D6 والدخول ألغى طلبَ الحذف");
      check((await http("POST", "/api/public/me/reset", { civil: civil(33) }, "")).status === 404, "D6 طلبُ حذفٍ لرقمٍ بلا ملف: ٤٠٤");

      /* النسيان الكامل */
      const gone = await http("POST", "/api/public/me/enter", { civil: other, code: "864209" }, "");
      const goneJar = cookieOf(gone);
      check((await http("POST", "/api/public/me/forget", { code: "000000" }, goneJar)).json.code === "bad-code", "D6 الحذف يطلب الرمز");
      check((await http("POST", "/api/public/me/forget", { code: "864209" }, goneJar)).status === 200, "D6 الحذف النهائي");
      check((await http("POST", "/api/public/me/identity", { civil: other }, "")).json.exists === false, "D6 بعد الحذف: لا ملف");

      const page = await fetch(BASE + "/me");
      const csp = page.headers.get("content-security-policy") || "";
      const body = await page.text();
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1] || "";
      check(page.status === 200 && Boolean(nonce) && body.includes(`nonce="${nonce}"`), "D6 /me: صفحةٌ بنونسٍ مطابق للسياسة");
      check(page.headers.get("cache-control")?.includes("no-store") === true && /default-src 'none'/.test(csp), "D6 /me: بلا تخزين، وCSP صارمة");
      const nonce2 = /script-src 'nonce-([^']+)'/.exec((await fetch(BASE + "/me")).headers.get("content-security-policy") || "")?.[1];
      check(nonce2 !== nonce, "D6 نونسٌ جديد في كل طلب");
    }
  } catch (error) {
    check(false, `D6 المسار الحيّ: ${error instanceof Error ? error.message : error}`);
  } finally {
    /* مجموعةُ العمليات كلها: tsx يُطلق ابناً لا يموت بقتل الأب. */
    if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
  }
}

/* ── مراجعاتٌ بعد الدمج: القفلُ لا يُمحى بطلباتٍ متوازية، والرغباتُ لا تتجاوز فصلها ── */
{
  const routes = fs.readFileSync(path.join(process.cwd(), "src/server/studentDoorRoutes.ts"), "utf8");
  const page = fs.readFileSync(path.join(process.cwd(), "src/server/studentHomePage.ts"), "utf8");
  const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
  check(routes.includes('app.get("/api/public/me/cases", requireDoor') && routes.includes("getStudentNeedHistoryByFingerprint(fingerprint)"),
    "متابعة الحالات داخل مساري محمية بجلسة الملف وتقرأ تاريخ صاحبها فقط");
  const caseRoute = routes.slice(routes.indexOf('app.get("/api/public/me/cases", requireDoor'), routes.indexOf('/* ── المطروح لي:', routes.indexOf('app.get("/api/public/me/cases", requireDoor')));
  check(!caseRoute.includes("decision?.note") && !caseRoute.includes("state?.note") && !caseRoute.includes("need.details"),
    "ملخص الطالب لا يكشف ملاحظات اللجنة الداخلية أو التفاصيل المخزنة للحالة");
  check(repo.includes("getStudentNeedHistoryByFingerprint: async") && /where\("fingerprint", "==", fingerprint\)/.test(repo),
    "تاريخ الحالة يُقرأ بفهرس البصمة لا بتحميل سجل الطلبات كله");
  check(page.includes("loadCases();") && page.includes("حالاتي") && page.includes("/api/public/me/cases"),
    "ملف مساري يعرض المتابعة دون فتح رابط استبيان جديد");
  check(routes.includes("lockState(current, now).locked) { locked = true; left = 0; return current; }"), "قفلٌ نشأ أثناء التحقّق يبقى ولا يُستبدل بعدّاد");
  check(routes.includes("lockedMeanwhile") && routes.includes("fail(res, 423"), "رمزٌ صحيح بعد قفلٍ متوازٍ لا يُدخل صاحبه");
  check(page.includes("w.termId!==s.term.id)w=null"), "رغباتُ فصلٍ سابق لا تظهر في الفصل الحالي");
  check(routes.includes("allowed.includes(id) && !passed.includes(id)"), "الرغباتُ تُنقّى عند تغيّر الصحيفة أو المنجَز");
  check(/where\("fingerprint", "==", fingerprint\)\.orderBy\(FieldPath\.documentId\(\)\)/.test(repo), "قراءةُ بصمةٍ بالترقيم لا بحدٍّ يُسقط السجلات");
  check(routes.includes("ids.length > 12") && routes.includes("requestGroupId") && routes.includes("for (const [ownerSectionId, ownerCourseIds] of grouped)"),
    "طلب فتح المقررات المتعددة يُحفظ مرةً واحدة لكل مالك ويربط أجزاء التعارض بمعرّف مجموعة");
  check(routes.includes("conflict-not-proven") && routes.includes("auditSimOfferings(table.offerings)"),
    "طلب التعارض يُرفض إن لم تثبت جداول منشورة مكتملة وجود تعارض غير قابل للحل");
  check(routes.includes("alternativesFor(item.courseId, item.offeringId)") && routes.includes("context.signed.has"),
    "بدائل خطة الطالب تقتصر على شعب من خططه المحاكاة وجداول أقسامها الموقعة");
  check(page.includes("ما تخصصك؟") && page.includes("ابحث باسم التخصص") && page.includes("r.d.specializations")
    && !page.includes("section-campus") && page.includes('name="crcourse"') && page.includes("conflictPairs") && page.includes("للأقسام المعنية"),
    "واجهة مساري تختار التخصص فقط بلا مواقع، وتدعم الطلبات والمعاينة الشخصية");
  check(page.includes("ticket-alt-select") && page.includes("S.tkOverrides") && page.includes("هذه الشعبة تتعارض مع مقرر آخر")
    && page.includes("التعديل معاينة شخصية لا تغيّر جدول القسم"),
    "الطالب يجرب شعبة بديلة ويتلقى منع التعارض دون حفظ مسودة القسم");
}

/* التعارض لا يثبت من كلمة الطالب وحدها: يجب أن تتصادم كل توليفات الشعب المؤكدة. */
{
  const offer = (id: string, courseId: number, sectionId: number, start: number, end: number): SimOffering => ({
    id, courseId, code: id, collegeId: 1, sectionId, capacity: 30, slots: [{ day: 0, start, end }],
  });
  const signed = new Set(["1:11", "1:12"]);
  const base = [offer("a", 101, 11, 480, 570), offer("b", 202, 12, 500, 590)];
  check(verifiedUnresolvableStudentConflicts([101], [202], base, signed, { collegeId: 1, sectionId: 11 }).length === 1,
    "التعارض الفعلي بين شعب منشورة مكتملة يثبت");
  check(verifiedUnresolvableStudentConflicts([101], [202], [...base, offer("b2", 202, 12, 600, 690)], signed, { collegeId: 1, sectionId: 11 }).length === 0,
    "وجود توليفة بديلة غير متعارضة يمنع إنشاء حالة استثنائية");
  check(verifiedUnresolvableStudentConflicts([101], [202], [base[0], { ...base[1], slots: [] }], signed, { collegeId: 1, sectionId: 11 }).length === 0,
    "المواعيد الناقصة لا تثبت تعارضاً");
  check(verifiedUnresolvableStudentConflicts([101], [202], base, new Set(["1:11"]), { collegeId: 1, sectionId: 11 }).length === 0,
    "شعبة قسم غير موقّع لا تستخدم لإثبات التعارض للطالب");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
