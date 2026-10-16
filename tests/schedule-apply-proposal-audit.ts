/**
 * ── «اعتماد الاقتراح» يكتب في الجدول الأصلي، وبالمسار نفسه ────────────────────
 *
 * خادمٌ حقيقيّ في وضع التجربة. الاقتراحُ (فتح شعبة، نقل، تبديل) يمرّ من
 * `POST /api/schedules/apply-proposal` فيصل الجدولَ الفعليّ بتحقّق الحفظ اليدويّ نفسِه، ويُردّ ما
 * كان قديماً أو متعارضاً، ويُردّ التبديلُ الناقصُ إلى ما كان، ويُسجَّل مصدرُه.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-apply-proposal-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) {
    console.log("   (تخطّي: المنفذ مشغول بخادمٍ آخر)");
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
    const week = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];

    const rows = await week();
    const base = rows[0];
    const origin = { kind: "radar", refId: "course:1", note: "اختبار" };
    const scope = { collegeId: base.AdCollegeId, sectionId: base.AdSectionId, termId: base.AdTermId };

    /* ── نقل ── */
    const target = { day: "fthursday", start: "18:00", end: "19:15" };
    const from = { day: "fsunday", start: base.fstarttime, end: base.fendtime };
    const moved = await call("POST", "/api/schedules/apply-proposal", { kind: "move", ...scope, moves: [{ rowId: base.id, from, to: target }], origin });
    check(moved.status === 200 && moved.body?.ok && moved.body.applied?.[0]?.row?.fthursday === true && moved.body.applied[0].row.fsunday === false, "M1 النقل يكتب في الجدول الأصلي (يوم الخميس بدل الأحد)", moved);
    const after = (await week()).find(row => row.id === base.id);
    check(after?.fstarttime === "18:00" && after?.fthursday === true && after?.origin?.kind === "radar" && after.origin.refId === "course:1" && Boolean(after.origin.by), "M2 الصفُّ المخزَّن تغيّر وعليه مصدرُه (الرادار) ومن اعتمده");
    check(Number(after?.rev) === Number(base.rev || 0) + 1, "M3 الإصدار رُفع مرةً واحدة (مسار الحفظ نفسُه)");
    const radar = await call("GET", "/api/simulation/summary");
    check(radar.body?.run?.stale === true, "M4 الرادار عُلِّم قديماً فور التغيير (يُعاد حسابُه)", radar.body?.run && { stale: radar.body.run.stale });

    /* ── اقتراحٌ قديم: الموعد لم يعد حيث بُني عليه ── */
    const stale = await call("POST", "/api/schedules/apply-proposal", { kind: "move", ...scope, moves: [{ rowId: base.id, from, to: { day: "fmonday", start: "16:00", end: "17:15" } }], origin });
    check(stale.status === 409 && stale.body?.code === "stale", "S1 اقتراحٌ بُني على موعدٍ قديم يُردّ بسببه ولا يُكتب", stale);
    check((await week()).find(row => row.id === base.id)?.fthursday === true, "S2 ولم يتغيّر شيء");

    /* ── تعارضٌ حقيقي: أستاذٌ واحد في موعدين ── */
    const sameTeacher = rows.find(row => row.id !== base.id && Number(row.AdInstructorId) === Number(base.AdInstructorId));
    if (sameTeacher) {
      const clash = await call("POST", "/api/schedules/apply-proposal", { kind: "move", ...scope, moves: [{
        rowId: sameTeacher.id, from: { day: ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].find(day => sameTeacher[day]), start: sameTeacher.fstarttime, end: sameTeacher.fendtime },
        to: target,
      }], origin });
      check(clash.status === 409 && !clash.body?.ok, "C1 النقل إلى موعدٍ يتعارض مع أستاذه يُردّ بنفس تحقّق الورشة", clash);
      check(JSON.stringify((await week()).find(row => row.id === sameTeacher.id)?.fstarttime) === JSON.stringify(sameTeacher.fstarttime), "C2 والموعد كما كان");
    } else check(true, "C1/C2 (لا أستاذَ بموعدين في بيانات التجربة)");

    /* ── تبديلٌ تتعذّر خطوته الثانية: يُردّ كلُّه ── */
    const dayOf = (row: any) => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].find(day => row[day]) as string;
    /* أستاذٌ له موعدان: الخطوة الأولى تنقل أحدَهما إلى خانةٍ فارغة، والثانية تنقل الآخر إلى الخانة نفسها فيتعارض الأستاذ مع نفسه */
    const pair = rows.filter(row => row.id !== base.id).reduce((found: any[] | null, row, _i, all) => found || (all.filter(other => other.id !== row.id && Number(other.AdInstructorId) === Number(row.AdInstructorId))[0] ? [row, all.find(other => other.id !== row.id && Number(other.AdInstructorId) === Number(row.AdInstructorId))] : null), null) as any[];
    const [a, second] = pair;
    const swap = await call("POST", "/api/schedules/apply-proposal", { kind: "swap", ...scope, moves: [
      { rowId: a.id, from: { day: dayOf(a), start: a.fstarttime, end: a.fendtime }, to: { day: "fwednesday", start: "17:00", end: "18:15" } },
      { rowId: second.id, from: { day: dayOf(second), start: second.fstarttime, end: second.fendtime }, to: { day: "fwednesday", start: "17:00", end: "18:15" } },
    ], origin });
    const afterSwap = await week();
    const aNow = afterSwap.find(row => row.id === a.id), secondNow = afterSwap.find(row => row.id === second.id);
    check(swap.status === 409, "W0 الخطوة الثانية تتعارض (أستاذٌ واحد في خانةٍ واحدة) فيُردّ التبديل", swap);
    if (swap.status >= 400) {
      check(swap.body?.reverted === true && aNow.fstarttime === a.fstarttime && dayOf(aNow) === dayOf(a) && secondNow.fstarttime === second.fstarttime, "W1 تبديلٌ تعذّرت خطوتُه الثانية يردّ الأولى كما كانت (لا نصفَ تبديل)", swap);
    } else {
      check(swap.body?.applied?.length === 2, "W1 تبديلٌ صالح يُطبَّق بخطوتين", swap.body);
    }

    /* ── فتحُ شعبة ── */
    const opening = await call("POST", "/api/schedules/apply-proposal", { kind: "opening", ...scope, courseId: base.AdCourseId, placement: {
      day: "fmonday", start: "18:30", end: "19:45", sectionCode: base.SCode, instructorId: base.AdInstructorId,
      roomCode: base.AdRoomCode, roomHall: base.AdRoomHall, buildingId: base.buildingId, roomId: base.roomId,
    }, origin: { kind: "student-case", refId: "need:test", note: "طلب طالب" } });
    check(opening.status === 201 && opening.body?.applied?.[0]?.action === "add", "O1 فتحُ الشعبة يُنشئ صفّاً جديداً في الجدول الأصلي", opening);
    const opened = opening.body?.applied?.[0]?.row;
    check(opened && opened.SCode !== base.SCode && /^\d+$/.test(String(opened.SCode)) && opened.AdCourseId === base.AdCourseId && opened.origin?.kind === "student-case", "O2 برقمٍ جديدٍ لم يُستعمل (اقترح المحرّكُ رقماً مستعملاً فرُفع) ومصدرُه حالة الطالب", opened);
    check((await week()).some(row => row.id === opened?.id), "O3 ويظهر في جدول القسم");
    const noTeacher = await call("POST", "/api/schedules/apply-proposal", { kind: "opening", ...scope, courseId: base.AdCourseId, placement: { day: "ftuesday", start: "18:30", end: "19:45", sectionCode: "99", instructorId: 0, buildingId: base.buildingId, roomId: base.roomId, roomCode: base.AdRoomCode, roomHall: base.AdRoomHall }, origin });
    check(noTeacher.status === 422 && noTeacher.body?.code === "needs-instructor", "O4 بلا أستاذٍ خالٍ لا تُفتح الشعبة (يُطلب اختياره)", noTeacher);
    const occupied = await call("POST", "/api/schedules/apply-proposal", { kind: "opening", ...scope, courseId: base.AdCourseId, placement: { day: "fmonday", start: "18:30", end: "19:45", sectionCode: "88", instructorId: base.AdInstructorId, buildingId: base.buildingId, roomId: base.roomId, roomCode: base.AdRoomCode, roomHall: base.AdRoomHall }, origin });
    check(occupied.status === 409, "O5 قاعةٌ وأستاذٌ مشغولان في الوقت نفسه (الشعبة التي فُتحت للتوّ) يُردّان", occupied);

    /* ── كشف التسجيل: «موافق» تفتح الشعبة في الجدول وتُسجَّل الموافقة معاً ── */
    const registration = async () => (await call("GET", "/api/student-registration?collegeId=1&sectionId=1&termId=1")).body?.rows as any[];
    const pending = (await registration()).flatMap(row => (row.courses || []).filter((c: any) => !c.settled && !c.readOnly).map((c: any) => ({ row, course: c })));
    const target1 = pending[0], target2 = pending[1];
    const teacherRow = (await week()).find(row => Number(row.AdCourseId) === Number(target1.course.id)) || base;
    const slotFor = (extra: any = {}) => ({ day: "fwednesday", start: "13:00", end: "14:15", sectionCode: "01", instructorId: teacherRow.AdInstructorId,
      roomCode: teacherRow.AdRoomCode, roomHall: teacherRow.AdRoomHall, buildingId: teacherRow.buildingId, roomId: teacherRow.roomId, ...extra });
    const before = (await week()).length;
    const approve = await call("POST", `/api/student-registration/${target1.row.id}/course-state`, { courseId: target1.course.id, state: "awaiting-registration", openSection: slotFor() });
    check(approve.status === 200 && approve.body?.ok && approve.body.opened?.id > 0, "R1 موافقةُ اللجنة مع فتح شعبة: تنجح وتُرجع صفَّ الجدول الجديد", approve);
    const afterApprove = await week();
    const created = afterApprove.find(row => row.id === approve.body?.opened?.id);
    check(afterApprove.length === before + 1 && created?.AdCourseId === target1.course.id && created?.origin?.kind === "student-case" && /^need:/.test(created.origin.refId), "R2 الشعبة موجودة في الجدول الأصلي ومصدرُها حالة هذا الطالب");
    const reread = (await registration()).find(row => row.id === target1.row.id)?.courses.find((c: any) => c.id === target1.course.id);
    check(reread?.settled === true && reread.scheduleId === created?.id && reread.sectionCode === created?.SCode && /فُتحت شعبة/.test(reread.note || ""), "R3 والكشفُ يقرأ الربط: رقمُ الشعبة وصفُّها", reread);
    if (target2) {
      const rejected = await call("POST", `/api/student-registration/${target2.row.id}/course-state`, { courseId: target2.course.id, state: "awaiting-registration", openSection: slotFor({ sectionCode: "77" }) });
      const stillOpen = (await registration()).find(row => row.id === target2.row.id)?.courses.find((c: any) => c.id === target2.course.id);
      check(rejected.status === 409 && rejected.body?.stateSaved === false && stillOpen?.settled === false && (await week()).length === before + 1, "R4 شعبةٌ تتعارض مع ما فُتح للتوّ: تُردّ، ولا تُسجَّل الموافقة، ولا يُكتب شيء", rejected);
      const reject = await call("POST", `/api/student-registration/${target2.row.id}/course-state`, { courseId: target2.course.id, state: "committee-rejected", reasonCode: "prerequisite", openSection: slotFor({ day: "fthursday", start: "09:00", end: "10:15", sectionCode: "66" }) });
      check(reject.status === 200 && (await week()).length === before + 1, "R5 عدمُ الموافقة لا يفتح شعبةً ولو أُرسل معه اقتراح");
    }

    /* ── الحدود ── */
    check((await call("POST", "/api/schedules/apply-proposal", { kind: "move", ...scope, moves: [], origin })).status === 400, "G1 اقتراحٌ بلا مواعيد يُردّ");
    check((await call("POST", "/api/schedules/apply-proposal", { kind: "opening", ...scope, courseId: base.AdCourseId, placement: {}, origin: { kind: "hack" } })).body?.code === "bad-origin", "G2 مصدرٌ غير معروف يُردّ");
    await call("POST", "/api/demo/role", { role: "dean" });
    const readOnly = await call("POST", "/api/schedules/apply-proposal", { kind: "move", ...scope, moves: [{ rowId: base.id, from: { day: "fthursday", start: "18:00", end: "19:15" }, to: { day: "fsunday", start: base.fstarttime, end: base.fendtime } }], origin });
    check(readOnly.status === 403, "G3 صفةُ اطّلاعٍ (العميد) لا تكتب في الجدول عبر هذا الباب أيضاً", readOnly);
    await call("POST", "/api/demo/role", { role: "admin" });
    const logs = await call("GET", "/api/audit-logs");
    const list: any[] = Array.isArray(logs.body) ? logs.body : logs.body?.items || logs.body?.logs || logs.body?.rows || [];
    const lines: string[] = list.map((row: any) => String(row.changes || row.details || row.summary || JSON.stringify(row)));
    check(lines.some(line => /اعتماد اقتراح من رادار التسجيل/.test(line)) && lines.some(line => /فُتحت شعبة/.test(line)), "A1 سجلُّ التدقيق يقول من أين جاء كلُّ تغيير");
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
