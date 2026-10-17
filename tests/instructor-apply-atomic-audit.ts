/**
 * ── تثبيتُ رغبة الأستاذ في الجدول الفعلي: نداءٌ واحد، بقواعد الجدول نفسها ─────────
 *
 * خادمٌ حقيقيّ في وضع التجربة. `POST /api/instructor-requests/:id/apply`:
 *   - يعاين بلا كتابة،
 *   - يرفض الكتابة فوق تعديلِ زميلٍ أحدث (ختم الإصدار)،
 *   - يرفض ما يتعارض في الجدول النهائي ولا يكتب شيئاً ولا يسجّل قراراً،
 *   - يكتب الصفّ بمصدره (رغبة أستاذ) ويسجّل القرار معاً،
 *   - ولا يُعاد على بندٍ ثُبّت.
 * والبندُ بأوقاتٍ مختلفة بين الأيام يصير صفّاً لكل وقت.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { slotTimeGroups } from "../src/utils/slotTimeGroups";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── تقسيمُ الأوقات ── */
{
  const groups = slotTimeGroups([
    { day: "ftuesday", start: "10:00", end: "10:50" }, { day: "fsunday", start: "08:00", end: "09:15" },
    { day: "fthursday", start: "10:00", end: "10:50" }, { day: "fsunday", start: "08:00", end: "09:15" }, { day: "fx", start: "1", end: "2" },
  ]);
  check(groups.length === 2 && groups[0].days.join() === "fsunday" && groups[0].start === "08:00"
    && groups[1].days.join() === "ftuesday,fthursday" && groups[1].start === "10:00", "T1 بندٌ بوقتين = صفّان، كلٌّ بأيامه، بلا تكرارٍ ولا يومٍ مجهول", groups);
  check(slotTimeGroups([{ day: "fmonday", start: "09:30", end: "10:50" }, { day: "fwednesday", start: "09:30", end: "10:50" }]).length === 1, "T2 وقتٌ واحد = صفٌّ واحد");
}

/* ── الربط ── */
{
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const srv = read("server.ts"), inbox = read("src/components/InstructorInbox.tsx");
  const route = srv.slice(srv.indexOf('app.post("/api/instructor-requests/:id/apply"'), srv.indexOf("/* ── حوارُ البند"));
  check(route.length > 500 && !/Repository\.(createSchedule|updateSchedule|deleteSchedule)\b/.test(route), "L1 مسار التثبيت لا يكتب في المستودع مباشرة: يمرّ بمعالجات الحفظ نفسها");
  check(/dryRun: true/.test(route) && /reverted/.test(route), "L2 فحصٌ جافّ لكل خطوة قبل الكتابة، وتراجعٌ إن تعذّرت خطوة");
  check(inbox.includes("/apply`") && !inbox.includes('`/api/schedules/${item.rowId}`, {\n            method: "PUT"'), "L3 الشاشة تثبّت بنداء واحد");
  check(/revs: revsFor\(/.test(inbox), "L4 الشاشة ترسل ختم إصدار كل صف");
  check(/!stored\.items\[i\]\.decision\?\.state\)/.test(route), "L5 البنود المترابطة تُقبل معلّقة فقط (لا يُكتب بندٌ رُفض)");
  check(/liveRowRefusal\(live, revs\)[\s\S]{0,200}kind: "delete"/.test(route), "L6 الحذف يخضع لختم الإصدار ولملكية الأستاذ كالنقل");
  check(/Number\(live\.AdInstructorId\) !== Number\(stored\.AdInstructorId\) \|\| Number\(live\.AdTermId\) !== termId/.test(route), "L7 الصف الحيّ يجب أن يكون للأستاذ نفسه في الفصل نفسه");
  check(/hypotheticalWeek: originalWeek/.test(route), "L8 التراجع يُفحص على الأسبوع الأصلي فلا يتعثر بتبديلٍ داخل السلسلة");
  check(/APPLYING_REQUESTS\.has/.test(route) && /finally \{ APPLYING_REQUESTS\.delete/.test(srv), "L9 تثبيتان متزامنان للطلب نفسه لا يقعان معاً");
}

const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-apply-atomic-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) {
    console.log("   (تخطّي السلوك الحيّ: المنفذ مشغول بخادمٍ آخر)");
  } else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const inbox = async () => (await call("GET", "/api/instructor-requests?collegeId=1&sectionId=1&termId=1")).body;
    const rowNow = async (id: number) => ((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).find(row => row.id === id);
    const days = (row: any) => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].filter(key => row?.[key]).join();

    const first = await inbox();
    const request = (first.rows as any[]).find(row => (row.items || []).some((item: any) => item.action === "change" && !item.decision?.state));
    if (!request) {
      check(true, "B0 (لا بندَ تعديلٍ معلّق في بيانات التجربة)");
    } else {
      const index = request.items.findIndex((item: any) => item.action === "change" && !item.decision?.state);
      const item = request.items[index];
      const before = await rowNow(Number(item.rowId));
      const want = slotTimeGroups(item.slots)[0];
      const url = `/api/instructor-requests/${request.id}/apply`;

      const preview = await call("POST", url, { itemIndex: index, preview: true, revs: { [item.rowId]: before.rev } });
      const untouched = await rowNow(before.id);
      check(preview.status === 200 && preview.body?.preview && preview.body.plan?.[0]?.start === want.start
        && untouched.fstarttime === before.fstarttime && days(untouched) === days(before), "B1 المعاينة تُرجع الخطة ولا تكتب", preview.body);

      const stale = await call("POST", url, { itemIndex: index, revs: { [item.rowId]: Number(before.rev || 0) - 1 } });
      check(stale.status === 409 && stale.body?.code === "revision", "B2 ختمُ إصدارٍ قديم يُرفض (لا يكتب فوق تعديل زميل)", stale.body);

      /* صفٌّ يشغل الأستاذَ نفسَه في الوقت المطلوب: التثبيتُ يُرفض كلُّه ولا يُكتب شيء. */
      const blocker = await call("POST", "/api/schedules", {
        AdCollegeId: before.AdCollegeId, AdSectionId: before.AdSectionId, AdTermId: before.AdTermId, AdCourseId: before.AdCourseId,
        SCode: "97", AdInstructorId: before.AdInstructorId,
        ...Object.fromEntries(["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].map(key => [key, key === want.days[0]])),
        fstarttime: want.start, fendtime: want.end,
        AdRoomCode: before.AdRoomCode, AdRoomHall: before.AdRoomHall, buildingId: before.buildingId, roomId: before.roomId, locationStatus: before.locationStatus,
      });
      if (blocker.status === 201) {
        const refused = await call("POST", url, { itemIndex: index });
        const still = await rowNow(before.id);
        const afterRefuse = (await inbox()).rows.find((row: any) => row.id === request.id);
        check(refused.status === 409 && still.fstarttime === before.fstarttime && days(still) === days(before) && !afterRefuse.items[index].decision?.state,
          "B3 تعارضٌ في الجدول النهائي (الأستاذ مشغول) يُرفض: لا كتابة ولا قرار", refused.body);
        await call("DELETE", `/api/schedules/${blocker.body.id}`);
      } else check(true, "B3 (تعذّر بناء صفٍّ معارِض في بيانات التجربة)");

      const applied = await call("POST", url, { itemIndex: index, revs: { [item.rowId]: (await rowNow(before.id)).rev } });
      const after = await rowNow(before.id);
      check(applied.status === 200 && after.fstarttime === want.start && days(after) === want.days.join(), "B4 التثبيت يكتب الصفّ كما طلب الأستاذ", { status: applied.status, body: applied.body?.error, after });
      check(after.origin?.kind === "instructor-request" && after.origin?.refId === String(request.id), "B5 ومصدرُه في سجلّ الجدول: رغبة الأستاذ برقم طلبه", after.origin);
      const decided = (await inbox()).rows.find((row: any) => row.id === request.id).items[index].decision;
      check(decided?.state === "fixed" && Number(decided?.scheduleId) === before.id, "B6 والقرارُ مسجّلٌ معه بمعرّف الصف", decided);
      const again = await call("POST", url, { itemIndex: index });
      check(again.status === 409 && again.body?.code === "already-fixed", "B7 ولا يُعاد على بندٍ ثُبّت (لا صفّ مكرر)", again.body);
    }
  }
} catch (error: any) {
  check(false, "تشغيل الخادم", error?.message);
} finally {
  if (child?.pid) { try { process.kill(-child.pid); } catch { /* انتهى */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "\x1b[31m" : "\x1b[32m"}${passed} نجح، ${failed} فشل\x1b[0m`);
process.exit(failed ? 1 : 0);
