/**
 * بصيرةُ الرادار على خادمٍ حقيقيّ (تجربة): أسبابُ النقص بحدود النطاق، و«ماذا لو؟» لا يكتب شيئاً ويُعيد
 * أثراً مقيساً، ورفضُ ما لا يصحّ (فصلٌ آخر، موعدٌ قديم، نوعٌ مجهول). وسلكُ الواجهات.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

{
  const hero = read("src/components/SemesterReadiness.tsx"), radar = read("src/components/RegistrationRehearsal.tsx"), apply = read("src/components/ApplyProposal.tsx"), intel = read("src/components/IntelligenceWorkspace.tsx");
  check(radar.includes("<SemesterReadiness") && radar.includes("/api/simulation/insight") && hero.includes("مقارنة سيناريوهات"), "W1 جاهزية الفصل في أعلى الرادار وتقول إنها مقارنة سيناريوهات");
  check(apply.includes("/api/schedules/what-if") && apply.includes("اعتمد رغم الضرر") && apply.includes("preview"), "W2 «ماذا لو؟» داخل بطاقة الاعتماد، والضررُ الأكبر يُسمّى باسمه");
  check(radar.includes("postWhatIf({ kind: \"opening\"") && intel.includes("postWhatIf({ kind: fix.swapWith") && intel.includes("kind: \"opening\", collegeId: source.collegeId"), "W3 الرادار ومركز الذكاء يقيسان الفتح والنقل والتبديل قبل الاعتماد");
  const schedulesUi = read("src/components/Schedules.tsx"), cells = read("src/components/RegistrationRehearsal.tsx");
  check(radar.includes("<CourseImpact courseId={c.courseId} />"), "W5 زرُّ «الأثر» على كل صفّ مقرر في الرادار");
  check(schedulesUi.includes("<RowHistory") && read("src/components/RowHistory.tsx").includes("/history"), "W6 «لماذا؟» في تفاصيل الموعد في الجدول");
  check(cells.includes("schedule-open-context-id") && cells.includes("writeSharedScope({ collegeId: cell.collegeId"), "W7 من الشعبة المستبعدة إلى خانتها في الجدول بنطاقها");
  const sim = read("src/server/simulationRoutes.ts");
  check(sim.includes('app.post("/api/schedules/what-if"') && !/what-if[\s\S]{0,3000}Repository\.(updateSchedule|createSchedule|deleteSchedule)/.test(sim), "W4 مسار «ماذا لو؟» لا يستدعي أيّ كتابة في الجدول");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-insight-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) console.log("   (تخطّي الجزء الحيّ: المنفذ مشغول بخادمٍ آخر)");
  else {
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
    let summary = (await call("GET", "/api/simulation/summary")).body;
    for (let i = 0; i < 40 && !summary?.run; i += 1) { await new Promise(r => setTimeout(r, 1000)); summary = (await call("GET", "/api/simulation/summary")).body; }
    check(Boolean(summary?.run), "L0 رادار التجربة جاهز", summary && { term: summary.term, run: Boolean(summary.run) });
    const termId = Number(summary?.term?.id);

    const insight = await call("GET", "/api/simulation/insight");
    check(insight.status === 200 && insight.body?.ready === true, "L1 بصيرةُ الرادار تُحسب", insight);
    const causes = insight.body?.causes || {};
    const sum = Object.values(causes as Record<string, number>).reduce((a, b) => a + b, 0);
    check(sum === insight.body?.short, `L2 مجموع الأسباب = من لم يبلغ 12 (${sum}/${insight.body?.short})`, causes);
    check(Array.isArray(insight.body?.quality) && insight.body.quality.every((item: any) => typeof item.issue === "string" && "rowId" in item), "L3 قائمة جودة البيانات بصفوفٍ يمكن فتحها");
    const again = await call("GET", "/api/simulation/insight");
    check(again.body?.computedAt === insight.body?.computedAt, "L4 الحسابُ مرةً واحدة ثم من الذاكرة");

    const rows = (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
    const base = rows[0];
    const before = JSON.stringify(rows.map(r => [r.id, r.rev, r.fsunday, r.fthursday, r.fstarttime]));
    const move = await call("POST", "/api/schedules/what-if", { kind: "move", termId, moves: [{ rowId: base.id, to: { day: "fthursday", start: "18:00", end: "19:15" } }] });
    const imp = move.body?.impact;
    check(move.status === 200 && imp && typeof imp.helped === "number" && typeof imp.harmed === "number" && ["apply", "caution", "avoid", "neutral"].includes(imp.verdict), "L5 «ماذا لو؟» للنقل يُعيد أثراً مقيساً", move);
    check(imp && imp.responders >= 0 && imp.before && imp.after && imp.virtualCapacity === true, "L6 قبل وبعد وعددُ من أجابوا، والسعةُ افتراضيةٌ معلنة");
    const opening = await call("POST", "/api/schedules/what-if", { kind: "opening", termId, collegeId: base.AdCollegeId, sectionId: base.AdSectionId, courseId: base.AdCourseId, placement: { day: "fwednesday", start: "16:00", end: "17:15", sectionCode: "99", instructorId: base.AdInstructorId, roomCode: "101", roomHall: "", buildingId: base.buildingId, roomId: base.roomId } });
    check(opening.status === 200 && opening.body?.impact?.verdict, "L7 «ماذا لو؟» لفتح شعبةٍ يعمل", opening);
    const after = JSON.stringify(((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).map(r => [r.id, r.rev, r.fsunday, r.fthursday, r.fstarttime]));
    check(before === after, "L8 لم يُكتب شيءٌ في الجدول");
    check((await call("POST", "/api/schedules/what-if", { kind: "move", termId: termId + 99, moves: [] })).status === 409, "L9 فصلٌ غير فصل الرادار يُردّ");
    check((await call("POST", "/api/schedules/what-if", { kind: "move", termId, moves: [{ rowId: 987654321, to: { day: "fmonday", start: "10:00", end: "11:00" } }] })).status === 409, "L10 موعدٌ لم يعد موجوداً يُردّ");
    check((await call("POST", "/api/schedules/what-if", { kind: "teleport", termId })).status === 400, "L11 نوعٌ مجهول يُردّ");
    const swapBad = await call("POST", "/api/schedules/what-if", { kind: "swap", termId, moves: [{ rowId: base.id, to: { day: "fmonday", start: "10:00", end: "11:00" } }] });
    check(swapBad.status === 400, "L12 التبديلُ بموعدٍ واحد يُردّ");
    const anon = await fetch(BASE + "/api/schedules/what-if", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "move", termId }) });
    check(anon.status === 401 || anon.status === 403, "L13 بلا دخولٍ مرفوض");
    const anonInsight = await fetch(BASE + "/api/simulation/insight");
    check(anonInsight.status === 401 || anonInsight.status === 403, "L14 بصيرةُ الرادار بلا دخولٍ مرفوضة");

    /* أثرُ المقرر وذاكرةُ الموعد */
    const impact = await call("GET", `/api/impact/course?courseId=${base.AdCourseId}`);
    check(impact.status === 200 && impact.body?.course?.id === base.AdCourseId && Array.isArray(impact.body.plans) && Array.isArray(impact.body.prereqs) && Array.isArray(impact.body.dependents), "L15 أثرُ المقرر: ما يسبقه وما يفتحه وصحائفه", impact);
    check((await call("GET", "/api/impact/course?courseId=99999999")).status === 404, "L16 مقررٌ غير موجود يُردّ");
    check((await fetch(BASE + `/api/impact/course?courseId=${base.AdCourseId}`)).status >= 401, "L17 أثرُ المقرر بلا دخولٍ مرفوض");
    const target = { day: "fthursday", start: "18:00", end: "19:15" };
    const applied = await call("POST", "/api/schedules/apply-proposal", { kind: "move", collegeId: base.AdCollegeId, sectionId: base.AdSectionId, termId: base.AdTermId, moves: [{ rowId: base.id, from: { day: "fsunday", start: base.fstarttime, end: base.fendtime }, to: target }], origin: { kind: "radar", refId: `course:${base.AdCourseId}`, note: "اختبار ذاكرة الموعد" } });
    check(applied.status === 200, "L18 اعتمادُ نقلٍ بمصدر", applied);
    await new Promise(r => setTimeout(r, 300));
    const history = await call("GET", `/api/schedules/${base.id}/history`);
    check(history.status === 200 && history.body?.origin?.kind === "radar" && history.body.origin.note === "اختبار ذاكرة الموعد", "L19 ذاكرة الموعد: المصدر والسطر الذي كُتب معه", history.body);
    check(history.body?.events?.some((e: any) => /اعتماد اقتراح/.test(e.what)) && history.body.events[0].who, "L20 وسجلُّ ما جرى بصيغة «اعتماد اقتراح» ومن فعله", history.body?.events);
    check((await call("GET", "/api/schedules/987654321/history")).status === 404, "L21 موعدٌ غير موجود يُردّ");
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* ended */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
