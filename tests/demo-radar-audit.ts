/**
 * ── رادارُ التسجيل في التجربة: يجد الزائرُ المزايا حيّةً ───────────────────────────
 * خادمٌ حقيقيّ في وضع التجربة، ودخولٌ فوريّ، ثم قراءةُ ما بُذر (demoRadarSeed):
 *   صحيفةٌ قيد المراجعة، ورادارٌ مشغَّل، وأجوبةٌ، وجرسٌ يعرفها. بيانات الجامعة لا تُمسّ.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const BASE = "http://localhost:3000";
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-demo-radar-"));
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
    const get = async (url: string) => (await fetch(BASE + url, { headers: { cookie } })).json() as Promise<any>;

    const summary = await get("/api/simulation/summary");
    check(summary.canRun === true && summary.run?.population === 320 && summary.run.students + summary.run.defaulted === 320 && summary.run.rounds === 3 && summary.courses.length >= 20, "T1 يفصل المشاركين عن الملفات غير المشاركة في ٣٢٠ ملفاً", summary.run);
    check(summary.run.windows.reduce((a: number, b: number) => a + b, 0) === summary.run.students && summary.run.projected?.students === summary.run.defaulted && summary.phase?.namesVisible === true, "T1 نوافذ الرغبات الفعلية لا تضم غير المشاركين، وتوقعهم منفصل", summary.run);
    check(summary.run.withoutRules > 0 && summary.run.withoutRules < summary.run.students, "T1 بعضُ الصحائف بقواعد معتمدة وبعضُها لا (كما في الواقع)", summary.run.withoutRules);
    const outcome = await get("/api/simulation/outcome");
    check(outcome.answered > 0 && outcome.answered <= summary.run.students && outcome.courses.some((c: any) => c.stuck > 0 && c.registered > 0), "T2 أجوبةُ «هل سجلت؟» من المشاركين فقط وبها سجّلتُ وتعثّرتُ", [outcome.answered, outcome.courses.length]);
    const plans = await get("/api/plan-review/status");
    check(plans.pending.length === 1 && plans.sections.length >= 5 && plans.sections.find((s: any) => s.plans[0].pending)?.plans[0].status === "active", "T3 صحيفةٌ واحدة قيد المراجعة، وتتصدّر قسمَها (الجديدة لا السابقة)", plans.pending);
    const bell = await get("/api/notifications");
    const titles: string[] = bell.items.map((i: any) => i.title);
    const needsDecision = summary.courses.filter((course: any) => course.unmet?.full > 0 || course.unmet?.["not-offered"] > 0).length > 0;
    check(titles.some(t => /تنتظر مراجعتك واعتمادك/.test(t)) && titles.some(t => /رادار التسجيل/.test(t)) === needsDecision && titles.some(t => /تعثّر الطلبة/.test(t)), "T4 الجرسُ يطابق تنبيه الرادار وجودَ احتياجٍ يحتاج قراراً", titles);
    check(titles.some(t => /كشف التسجيل/.test(t)), "T4 والحالاتُ المسمّاة تصل كشفَ التسجيل");
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
