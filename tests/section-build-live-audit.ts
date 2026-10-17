/**
 * ── «نزّل الشعب» على خادمٍ حقيقيّ في وضع التجربة ───────────────────────────────
 * المعاينة تقرأ ولا تكتب، والإنزال يرفض البصمة القديمة والمختار المزوَّر، ويكتب بمصدر «تخطيط الشعب»
 * عبر مسار الجدول، ثم التراجع يمحو الدفعة وحدها.
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

const srv = fs.readFileSync("server.ts", "utf8"), ui = fs.readFileSync("src/components/SectionBuild.tsx", "utf8"), plan = fs.readFileSync("src/components/SectionPlanning.tsx", "utf8");
check(srv.includes('applyProposalCore(req, {\n        kind: "opening"') && !/section-build\/apply[\s\S]{0,3000}Repository\.(createSchedule|updateSchedule)\(/.test(srv), "الإنزال يمرّ من باب الاعتماد المشترك لا من الكتابة المباشرة");
check(srv.includes("section-build:${collegeId}:${sectionId}:${termId}") && srv.includes("String(req.body?.fingerprint"), "قفلٌ متسلسل وبصمة أسبوع قبل الكتابة");
check(plan.includes("<SectionBuild") && plan.includes("buildReady") && fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8").includes("xlsxPreview.editable") && ui.includes("/api/section-build/review-rows") && ui.includes("/api/section-build/apply") && ui.includes('role="alertdialog"'), "الواجهة موصولة في تخطيط الشعب وفيها تأكيدٌ قبل الكتابة");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-section-build-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) console.log("   (تخطّي الحيّ: المنفذ مشغول بخادمٍ آخر)");
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
    /* سعة القاعة مخفيّة من البرنامج: القاعة بلا سعة مسجّلة تبقى صالحةً للبناء. أساتذة التجربة بلا نصاب؛ بدونه يقول المحرّك السبب ولا يخترع. */
    for (const person of (await call("GET", "/api/instructors")).body as any[]) await call("PUT", `/api/instructors/${person.AdInstructorId}`, { ...person, AdInstructorLoad: 40 });

    const scope = { collegeId: 1, sectionId: 1, termId: 1 };
    const base = { ...scope, targets: { "1": 4, "2": 3, "3": 6, "17": 3 } };
    const before = (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
    const preview = await call("POST", "/api/section-build/preview", base);
    const row3 = preview.body.rows.find((r: any) => r.courseId === 3);
    check(preview.status === 200 && row3.target === 6 && row3.existing === 4 && row3.remaining === 2, "المطلوب ٦ والموجود ٤ ⇒ باقٍ ٢", row3);
    check(row3.placements.length === 2 && preview.body.totals.placeable === 4, "الباقي يُبنى له موعدٌ وقاعةٌ وأستاذ", preview.body.totals);
    check(((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).length === before.length, "المعاينة لا تكتب شيئاً");
    const unset = await call("POST", "/api/section-build/preview", { ...scope, targets: {} });
    check(unset.body.rows.every((r: any) => r.state === "unset" && r.placements.length === 0), "بلا اختيار لا يُبنى شيء");

    const pick = preview.body.rows.flatMap((r: any) => r.placements.map((p: any) => `${r.courseId}:${p.sectionCode}`));
    check((await call("POST", "/api/section-build/apply", { ...base, fingerprint: "قديمة", pick })).status === 409, "بصمةٌ قديمة تُردّ");
    check((await call("POST", "/api/section-build/apply", { ...base, fingerprint: preview.body.fingerprint, pick: [] })).status === 400, "بلا اختيار يُردّ");
    check((await call("POST", "/api/section-build/apply", { ...base, fingerprint: preview.body.fingerprint, pick: ["3:999"] })).status === 409, "شعبةٌ مزوَّرة لا يبنيها الخادم");
    const applied = await call("POST", "/api/section-build/apply", { ...base, fingerprint: preview.body.fingerprint, pick });
    check(applied.status === 200 && applied.body.applied.length === pick.length, "الإنزال كتب ما اختير كله", applied.body);
    const after = (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
    const mine = after.filter(r => r.origin?.kind === "planning");
    check(mine.length === pick.length && mine.every(r => r.origin.refId.startsWith(applied.body.batchId)), "كل صفٍّ جديد موسوم بمصدره ودفعته");
    const again = await call("POST", "/api/section-build/preview", base);
    check(again.body.totals.remaining === 0, "بعد الإنزال لا باقٍ", again.body.totals);
    check((await call("POST", "/api/section-build/apply", { ...base, fingerprint: preview.body.fingerprint, pick })).status === 409, "إعادة الضغط بالبصمة القديمة لا تكرّر الشعب");
    const undone = await call("POST", "/api/section-build/undo", { ...scope, batchId: applied.body.batchId });
    check(undone.status === 200 && undone.body.removed === pick.length, "التراجع يمحو الدفعة", undone.body);
    check(((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).length === before.length, "الجدول عاد كما كان");

    /* ── فصلٌ فارغ: وقتٌ من الفصل المماثل وقاعةٌ بانتظار التثبيت، ومراجعةٌ في شاشة الاستيراد نفسها ── */
    /* قسمٌ فيه مواعيد: تُفتح المراجعة وتحمل مواعيده الحالية كلها ثم المبنيّة، فلا يمحو النشر هناك شيئاً بلا علم القسم. */
    const occupiedReview = await call("POST", "/api/section-build/review-rows", base);
    check(occupiedReview.status === 200 && occupiedReview.body.existing === before.length && occupiedReview.body.added === preview.body.totals.placeable && occupiedReview.body.count === before.length + preview.body.totals.placeable, "قسمٌ فيه مواعيد: المراجعة تحمل مواعيده الحالية والمبنيّة معاً", { status: occupiedReview.status, existing: occupiedReview.body?.existing, added: occupiedReview.body?.added, before: before.length });
    const occupiedImp = await call("POST", "/api/intelligence/import-preview", { ...scope, rows: occupiedReview.body.rows });
    check(occupiedImp.status === 200 && occupiedImp.body.count === occupiedReview.body.count, "وشاشة الاستيراد تقرأها كلها", { status: occupiedImp.status, error: occupiedImp.body?.error, count: occupiedImp.body?.count, expected: occupiedReview.body?.count });
    const onlyPicked = await call("POST", "/api/section-build/review-rows", { ...base, pick: [pick[0]] });
    check(onlyPicked.status === 200 && onlyPicked.body.added === 1, "المحدَّد في المعاينة وحده يُضاف", onlyPicked.body?.added);
    for (const row of before) await call("DELETE", `/api/schedules/${row.id}`);
    /* «لا قاعة موثّقة»: القاعات موقوفة، فيُبنى الوقت من الفصل المماثل وتنتظر القاعة تثبيتها. */
    for (const room of (await call("GET", "/api/location-registry")).body.rooms) await call("PUT", `/api/admin/location-registry/rooms/${room.id}`, { active: false });
    const empty = await call("POST", "/api/section-build/preview", base);
    const all = empty.body.rows.flatMap((r: any) => r.placements);
    const pendingOnly = all.filter((p: any) => p.pending);
    check(empty.status === 200 && empty.body.started === false && all.length === empty.body.totals.placeable && pendingOnly.length === empty.body.totals.pending && pendingOnly.length > 0 && pendingOnly.every((p: any) => !p.roomId), "فصلٌ فارغ: ما لا قاعة له يُبنى بانتظار التثبيت، والباقي بقاعاته", empty.body.totals);
    check(empty.body.rows.every((r: any) => { const keys = r.placements.filter((p: any) => p.pending).map((p: any) => `${p.dayLabel}@${p.start}`); return new Set(keys).size === keys.length; }), "شعبتان معلّقتان لمقررٍ واحد لا تقعان في الوقت نفسه");
    check(all.some((p: any) => p.note === "كالفصل المماثل"), "الأوقات من الفصل المماثل حين تتوفّر");
    const pendPick = empty.body.rows.flatMap((r: any) => r.placements.map((p: any) => `${r.courseId}:${p.sectionCode}`));
    check((await call("POST", "/api/section-build/apply", { ...base, fingerprint: empty.body.fingerprint, pick: pendPick })).status === 409, "المعلّقة لا تُكتب مباشرةً: تُراجَع أولاً");
    const review = await call("POST", "/api/section-build/review-rows", base);
    check(review.status === 200 && review.body.count === empty.body.totals.placeable && review.body.pending === empty.body.totals.pending && review.body.rows[0]["الوقت"] && review.body.rows[0]["رمز المقرر"], "صفوف المراجعة بشكل نموذج الاستيراد", { status: review.status, count: review.body?.count, pending: review.body?.pending });
    const imp = await call("POST", "/api/intelligence/import-preview", { collegeId: 1, sectionId: 1, termId: 1, rows: review.body.rows });
    check(imp.status === 200 && imp.body.count === review.body.count, "شاشة الاستيراد نفسها تفهم الصفوف (المراجعة والتعديل هناك)", { status: imp.status, error: imp.body?.error, count: imp.body?.count, expected: review.body.count });
    check((imp.body?.rows || []).every((r: any) => r.fstarttime && r.fendtime && r.fstarttime < r.fendtime), "الوقت يصل مرتَّباً (البداية قبل النهاية): لا ينقلب في القارئ", (imp.body?.rows || []).slice(0, 2).map((r: any) => [r.fstarttime, r.fendtime]));
    check(((await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[]).length === 0, "لا شيء كُتب في الجدول قبل النشر من شاشة المراجعة");
  }
} finally {
  if (child?.pid) try { process.kill(-child.pid); } catch { /* gone */ }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
