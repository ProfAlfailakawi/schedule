/**
 * ── «جرّب كطالبة»: مساري ببياناتٍ افتراضية في صندوقٍ معزول ─────────────────────
 *
 *   S1 الدخول: /me/demo يحوّل إلى مساري بكوكيَّين، والباب يعرف الطالبة بقسمها وخطتها.
 *   S2 المحتوى: «خريطتي» من الصحيفة المرجعية: مقرراتٌ من أقسامٍ أخرى ومجموعات وقواعد.
 *   S3 العزل: زائران لا يتشاركان شيئاً، والمستودعُ الحقيقي لا يرى طالبةَ التجربة ولا مقرراتها.
 *   S4 الأمان: كوكي الباب وحده خارج الصندوق = 401، وصندوقٌ منتهٍ يمسح كوكيّيه.
 *   S5 الحدّ: عددُ فتحات التجربة لكل اتصال محدود.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { createHmac, createHash } from "crypto";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [], colleges: [], sections: [], instructors: [], courses: [], schedules: [], rooms: [], studentNeeds: [], studentProfiles: [] }), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
const { registerStudentShowcase, SHOWCASE_COOKIE } = await import("../src/server/studentShowcase");
await initDatabase(); console.warn = quiet;

const identityKey = createHmac("sha256", "t").update("identity").digest();
const sealIdentity = async (v: string) => "sealed:" + Buffer.from(v).toString("base64url");
const app = express(); app.use(express.json());
registerStudentShowcase(app, { identityKey: async () => identityKey, sealIdentity, isProduction: () => false });
registerStudentDoorRoutes(app, {
  surveyFingerprint: async c => createHash("sha256").update("fp|" + c).digest("hex").slice(0, 32),
  sealIdentity, openIdentity: async c => Buffer.from(c.replace("sealed:", ""), "base64url").toString(),
  identityKey: async () => identityKey, isProduction: () => false, planSheetTemplate: "",
});
const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const open = async () => {
  const r = await fetch(base + "/me/demo", { redirect: "manual" });
  const jar = r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  return { r, jar };
};
const get = (p: string, jar: string) => fetch(base + p, { headers: { cookie: jar } });

/* S1 */
const a = await open();
check(a.r.status === 302 && a.r.headers.get("location") === "/me?track=girls#plan", "S1 /me/demo يحوّل إلى مساري", a.r.status);
check(a.jar.includes(SHOWCASE_COOKIE + "=demo_stu_") && a.jar.includes("sh_session="), "S1 كوكيّان: الصندوق وجلسةُ الباب");
const st = await (await get("/api/public/me/state", a.jar)).json() as any;
check(st.signedIn === true && st.demo === true && st.profile?.setupDone === true && st.profile.sectionName === "قسم تكنولوجيا التعليم", "S1 الباب يعرف الطالبة: داخلةٌ، تجريبية، بقسمها", st.profile);
check(st.profile?.identity?.name === "سارة محمد العتيبي", "S1 اسمُها يظهر في الترحيب");

/* S2 */
const map = await (await get("/api/public/me/map", a.jar)).json() as any;
const model = map.model;
check(map.ready === true && map.hasRules === true && model?.courses?.length > 40, "S2 خريطتي جاهزة بقواعد ومقررات", { ready: map.ready, n: model?.courses?.length });
check(new Set(model.courses.map((c: any) => c.owner)).size >= 6 && model.courses.some((c: any) => !c.own), "S2 مقرراتٌ من أقسامٍ أخرى وسمُها قسمُها");
check(model.groups.length > 0 && Object.keys(model.rules).length > 0, "S2 مجموعاتُ اختيار وقواعدُ مسبقات");

/* S3 */
const b = await open();
const mark = await fetch(base + "/api/public/me/profile", { method: "PUT", headers: { "content-type": "application/json", cookie: a.jar }, body: JSON.stringify({ sectionId: model.courses.find((c: any) => c.own).sectionId ?? st.profile.sectionId, curriculumPlanId: st.profile.planId, passedCourseIds: [] }) });
const aAfter = await (await get("/api/public/me/state", a.jar)).json() as any;
const bAfter = await (await get("/api/public/me/state", b.jar)).json() as any;
check(mark.status === 200 && aAfter.profile.passedCourseIds.length === 0, "S3 الكتابةُ تعمل داخل الصندوق", mark.status);
check(bAfter.profile.passedCourseIds.length === st.profile.passedCourseIds.length && st.profile.passedCourseIds.length > 10, "S3 زائرٌ آخر لا يتأثّر بكتابة الأول");
const outside = await Repository.getCourses();
check(outside.length === 0 && !Repository.isDemoRequest(), "S3 المستودعُ الحقيقي لا يرى مقررات التجربة", outside.length);
const fpOutside = (await Repository.listStudentProfiles()).length;
check(fpOutside === 0, "S3 ولا ملفاً لطالبة التجربة", fpOutside);

/* S4 */
const doorOnly = a.jar.split("; ").filter(c => c.startsWith("sh_session=")).join("; ");
const lone = await get("/api/public/me/plan", doorOnly);
check(lone.status === 401, "S4 كوكي الباب بلا صندوق = 401 (لا وجودَ للبصمة في الحقيقي)", lone.status);
const ghost = await get("/api/public/me/state", `${SHOWCASE_COOKIE}=demo_stu_gone; ${doorOnly}`);
const cleared = ghost.headers.getSetCookie().join("|");
check(cleared.includes(`${SHOWCASE_COOKIE}=;`) && cleared.includes("sh_session=;"), "S4 صندوقٌ منتهٍ: يُمسح الكوكيّان");
const ex = await fetch(base + "/api/public/me/exit", { method: "POST", headers: { cookie: a.jar } });
check(ex.headers.getSetCookie().join("|").includes(`${SHOWCASE_COOKIE}=;`), "S4 الخروجُ يمسح كوكي الصندوق");

/* S5 */
let limited = 0;
for (let i = 0; i < 40; i++) { const r = await fetch(base + "/me/demo", { redirect: "manual" }); if (r.status === 429) limited++; }
check(limited > 0, "S5 فتحاتُ التجربة محدودة لكل اتصال", limited);

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
