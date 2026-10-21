/**
 * ── شعبٌ يُفضَّل زيادتها على خادمٍ حقيقيّ في وضع التجربة ──────────────────────────────
 * القراءة تطابق جدول الفصل (الشعب الموجودة)، وتحترم النطاق، ولا تكتب شيئاً؛ ثم تُحاكى قسمٌ رفع كشف المتبقي واختار
 * أعداداً ← تظهر الفجوات بمصدر «تخطيطك» مرتّبةً بالأكثر نقصاً، ويتحوّل الحال إلى «رُفع الكشف».
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { planGaps, studentGaps } from "../src/utils/sectionGap";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-section-gap-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) console.log("   (تخطّي الحيّ: المنفذ مشغول بخادمٍ آخر)");
  else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    await waitForDemoSeed(BASE, cookie);
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const Q = "collegeId=1&sectionId=1&termId=1";

    /* الديمو يزرع كشفاً تجريبياً افتراضياً. نفرغه قبل حالة «لا كشف مرفوع» حتى
       يختبر هذا المسار تحديداً، مع إبقاء رغبات الطلبة التجريبية كما هي. */
    await call("PUT", "/api/registration-stats", {
      collegeId: 1, sectionId: 1, termId: 1, remaining: {}, accepted: {}, remainingSource: null,
    });

    const before = await call("GET", `/api/schedules/section-gap?${Q}`);
    check(before.status === 200 && before.body.courses.length > 0 && before.body.respondents > 0 && before.body.planImported === false, "القراءة تعمل: مقرراتُ القسم وطلبةٌ أجابوا ولا كشف مرفوع", { status: before.status, respondents: before.body?.respondents });

    const week = (await call("GET", `/api/schedules?${Q}`)).body as any[];
    const distinct = (courseId: number) => new Set(week.filter(row => Number(row.AdCourseId) === courseId).map(row => String(row.SCode))).size;
    check(before.body.courses.every((course: any) => course.existing === distinct(course.id)), "«الموجود» = الشعب المميّزة (SCode) في جدول الفصل لكل مقرر");
    check((await call("GET", `/api/schedules/section-gap?collegeId=1&sectionId=1`)).status === 403, "نطاقٌ ناقص يُردّ");

    /* بلا كشف: الحساب على الطلب وحده ولا يخترع نقصاً (طلبةُ التجربة قلّة). */
    const students = studentGaps(before.body.courses);
    check(students.every(item => item.basis === "students" && item.extra > 0), "بلا كشف: كل سطرٍ من طلب الطلبة وله نقصٌ حقيقي", students);
    /* الديمو يُعرَض للجمهور: رغباتُ «مساري» المبذورة تُظهر مقرراتٍ يزيد طلبُها على شعبها (0109105 و0109108 قليلتا السعة، ومقرراتٌ مطلوبة بلا شعبة)،
       فتظهر الشارةُ وعلاماتُ المقررات وجرسُ القسم بلا تعديلٍ يدويّ. */
    check(students.length >= 3 && students.some(item => item.code === "0109105" && item.extra > 0) && students.some(item => item.existing === 0), "الديمو: طلبٌ يزيد على الشعب (مقررٌ قليل السعة ومقرراتٌ بلا شعبة)", students.map(item => `${item.code}:${item.existing}←${item.required}`));

    /* قسمٌ كتب «المختار» بيده ولم يرفع كشفاً: يصل المختار مع القراءة الخفيفة نفسها، ويغلب طلبَ الطلبة. */
    const first = before.body.courses.find((course: any) => course.code === "0109105");
    const manual = await call("PUT", "/api/registration-stats", { collegeId: 1, sectionId: 1, termId: 1, accepted: { [first.id]: first.existing + 2 } });
    check(manual.status === 200, "حفظ «المختار» وحده بلا كشف");
    const manualRead = await call("GET", `/api/schedules/section-gap?${Q}`);
    check(manualRead.body.planImported === false && manualRead.body.accepted[first.id] === first.existing + 2 && Object.keys(manualRead.body.remaining).length === 0, "بلا كشف: المختار يصل والمتبقي لا", manualRead.body);
    const manualGaps = planGaps(manualRead.body.courses, { accepted: manualRead.body.accepted, remaining: manualRead.body.remaining, history: {} });
    check(manualGaps.length === 1 && manualGaps[0].code === "0109105" && manualGaps[0].basis === "plan" && manualGaps[0].extra === 2, "المختار اليدوي يظهر بمصدر «تخطيطك» ولو لم يُرفع كشف", manualGaps);

    /* محاكاة قسمٍ رفع الكشف واختار: CS101 يملك 3 شعب ويُختار 6، CS315 يملك 4 ويُختار 6، CS220 يُختار 3 (مثل الموجود). */
    const byCode = (code: string) => before.body.courses.find((course: any) => course.code === code);
    const cs101 = byCode("0109105"), cs315 = byCode("0109323"), cs220 = byCode("0109108");
    const saved = await call("PUT", "/api/registration-stats", {
      collegeId: 1, sectionId: 1, termId: 1,
      remaining: { [cs101.id]: 120, [cs315.id]: 200, [cs220.id]: 60 },
      accepted: { [cs101.id]: cs101.existing + 3, [cs315.id]: cs315.existing + 2, [cs220.id]: cs220.existing },
      remainingSource: { fileName: "المتبقي.pdf", importedAt: new Date().toISOString(), column: "unregistered" },
    });
    check(saved.status === 200, "حفظ تخطيطٍ محاكى يمرّ بالباب المعتاد", saved.body);

    const after = await call("GET", `/api/schedules/section-gap?${Q}`);
    check(after.body.planImported === true && after.body.planSource?.fileName === "المتبقي.pdf", "بعد الرفع: planImported ومصدره");
    const stats = (await call("GET", `/api/registration-stats?${Q}`)).body;
    const gaps = planGaps(after.body.courses, { remaining: stats.remaining, accepted: stats.accepted, history: stats.history || {} });
    const g101 = gaps.find(item => item.code === "0109105"), g315 = gaps.find(item => item.code === "0109323");
    check(!!g101 && g101.basis === "plan" && g101.existing === cs101.existing && g101.required === cs101.existing + 3 && g101.extra === 3, "0109105: الموجود ← المطلوب = +3 بمصدر التخطيط", g101);
    check(!!g315 && g315.extra === 2 && g315.basis === "plan", "0109323: +2", g315);
    check(!gaps.some(item => item.code === "0109108"), "0109108: المختار = الموجود فلا تُقترح زيادة");
    check(gaps[0].code === "0109105" && gaps.indexOf(g315!) > gaps.indexOf(g101!), "الترتيب بالأكثر نقصاً أولاً");
    check(((await call("GET", `/api/schedules?${Q}`)).body as any[]).length === week.length, "القراءة لم تكتب شيئاً في الجدول");
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid); } catch { /* انتهى */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nSection gap live audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
