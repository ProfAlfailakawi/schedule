/**
 * ── رادارُ التسجيل في التجربة: يجد الزائرُ المزايا حيّةً، وكلُّ شاشةٍ ممتلئة ─────────
 * خادمٌ حقيقيّ في وضع التجربة، ودخولٌ فوريّ، ثم قراءةُ ما بُذر (demoRadarSeed + قصص الخادم):
 *   صحائفُ معتمدةٌ لكل قسم (ولعلم البيانات تعديلٌ قيد المراجعة فوق نسخته المعتمدة)، ورادارٌ مشغَّل،
 *   وأجوبةٌ، وجرسٌ يعرفها. بيانات الجامعة لا تُمسّ.
 *
 * ومن يعرض النظام يريد ألّا يجد شاشةً فارغة: فبعد الرادار تُمرَّر كلُّ صفةٍ في مبدّل الصفات على كل
 * نطاقٍ تملكه، في الفصل الجاري والفصل السابق (للعرض فقط)، وتُقرأ كلُّ شاشةٍ من واجهتها — وتفشل
 * المراجعةُ إن عادت شاشةٌ يملكها حسابٌ فارغةً (كشف التسجيل، رغبات الأساتذة، المقترحات، تغييرات الجدول،
 * مركز الذكاء، الرادار، مراجعة الصحيفة).
 *
 * المنفذ: PORT (الافتراضي 3000). يتخطّى الاختبارُ نفسَه إن كان المنفذ مشغولاً بخادمٍ آخر.
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
const PORT = process.env.PORT || "3000";
const BASE = `http://localhost:${PORT}`;
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-demo-radar-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) {
    console.log("   (تخطّي: المنفذ مشغول بخادمٍ آخر)");
  } else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, PORT, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    /* حدودُ التقارير الثقيلة تردّ 429 لمن يقرأ كثيراً: يُنتظر ثم يُعاد بدل أن يُحسب فراغاً. */
    const call = async (url: string, init: RequestInit = {}): Promise<{ status: number; json: any }> => {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(BASE + url, { ...init, headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}) } });
        if (response.status === 429 && attempt < 4) { await new Promise(r => setTimeout(r, 15_000)); continue; }
        let json: any = null; try { json = await response.json(); } catch { /* غير JSON */ }
        return { status: response.status, json };
      }
    };
    const get = async (url: string) => (await call(url)).json as any;

    const summary = await get("/api/simulation/summary");
    check(summary.canRun === true && summary.run?.population === 320 && summary.run.students + summary.run.defaulted === 320 && summary.run.rounds === 3 && summary.courses.length >= 20, "T1 يفصل المشاركين عن الملفات غير المشاركة في ٣٢٠ ملفاً", summary.run);
    check(summary.run.windows.reduce((a: number, b: number) => a + b, 0) === summary.run.students && summary.run.projected?.students === summary.run.defaulted && summary.phase?.namesVisible === true, "T1 نوافذ الرغبات الفعلية لا تضم غير المشاركين، وتوقعهم منفصل", summary.run);
    /* تغيّر قصدُ العرض: كلُّ قسمٍ بقواعدَ معتمدة وخطةٍ كاملة (كان «بعضها بقواعد وبعضها لا»). */
    check(summary.run.withoutRules === 0 && summary.run.capacity.unknown === 0 && summary.run.dataQuality.excluded === 0, "T1 كلُّ الصحائف بقواعد معتمدة: لا «بلا قواعد» ولا «غير معلوم» ولا ملفاتٍ مستبعدة", { w: summary.run.withoutRules, c: summary.run.capacity, q: summary.run.dataQuality });
    check(summary.run.capacity.canReach12To14 + summary.run.capacity.canReach15 > 0 && summary.run.capacity.below12 > 0, "T1 للرادار أطيافٌ: من يبلغ 12 وحدة ومن لا يبلغها", summary.run.capacity);
    const full = summary.courses.filter((c: any) => c.unmet?.full > 0), notOffered = summary.courses.filter((c: any) => c.unmet?.["not-offered"] > 0);
    check(full.length >= 3 && notOffered.length >= 5, `T1 عدّادا «مقرراتٌ تمتلئ» و«مطلوبةٌ ولا تُطرح» غير صفرين (${full.length} و${notOffered.length})`);
    const sectionsWithDemand = new Set(summary.courses.filter((c: any) => c.wanted > 0).map((c: any) => `${c.collegeId}:${c.sectionId}`));
    check(sectionsWithDemand.size >= 9, `T1 كلُّ الأقسام التسعة لها طلبٌ في الرادار (${sectionsWithDemand.size})`);
    const outcome = await get("/api/simulation/outcome");
    check(outcome.answered > 0 && outcome.answered <= summary.run.students && outcome.courses.some((c: any) => c.stuck > 0 && c.registered > 0), "T2 أجوبةُ «هل سجلت؟» من المشاركين فقط وبها سجّلتُ وتعثّرتُ", [outcome.answered, outcome.courses.length]);
    const plans = await get("/api/plan-review/status");
    check(plans.pending.length === 1 && plans.sections.length >= 9 && plans.sections.find((s: any) => s.plans[0].pending)?.plans[0].status === "active", "T3 تعديلٌ واحدٌ قيد المراجعة يتصدّر قسمَه، وللأقسام التسعة صحائف", plans.pending);
    const ds = plans.pending[0];
    const dsPlan = await get(`/api/plan-review/plan?planId=${ds.planId}&sectionId=${ds.sectionId}`);
    check(dsPlan.state.status === "review" && dsPlan.state.live?.version === 1 && dsPlan.rules.length >= 4, "T3 ما قيد المراجعة تعديلٌ فوق نسخةٍ معتمدة (الإصدار ١) — فبياناتُ القسم كاملةٌ ولا تتأثر", dsPlan.state);
    check(plans.approved.length >= 8, `T3 بقية الصحائف معتمدة (${plans.approved.length})`);
    const bell = await get("/api/notifications");
    const titles: string[] = bell.items.map((i: any) => i.title);
    const needsDecision = summary.courses.filter((course: any) => course.unmet?.full > 0 || course.unmet?.["not-offered"] > 0).length > 0;
    check(titles.some(t => /تنتظر مراجعتك واعتمادك/.test(t)) && titles.some(t => /رادار التسجيل/.test(t)) === needsDecision && titles.some(t => /تعثّر الطلبة/.test(t)), "T4 الجرسُ يطابق تنبيه الرادار وجودَ احتياجٍ يحتاج قراراً", titles);
    check(titles.some(t => /كشف التسجيل/.test(t)), "T4 والحالاتُ المسمّاة تصل كشفَ التسجيل");

    /* ══ T5: لا شاشةَ فارغة — كلُّ صفةٍ × كلُّ نطاقٍ × الفصلان ══════════════════════ */
    const terms: any[] = await get("/api/terms");
    const current = terms.find(t => /الأول 2026|الأول \d{4}\/\d{4}/.test(String(t.AdTermName))) || terms[0];
    const previous = terms.find(t => Number(t.AdTermId) !== Number(current.AdTermId));
    check(!!previous, "T5 فصلان في التجربة: الجاري والسابق");
    const ROLES = ["admin", "dean", "viceDean", "registrarDean", "registrarHead", "registrarStaff", "departmentHead", "advisor", "committeeChair", "standard", "committeeChairMultiSite"];
    const REGISTRAR = new Set(["registrarDean", "registrarHead", "registrarStaff"]);
    const allSections: any[] = await get("/api/sections");
    const screensSeen = new Map<string, number>();
    const seen = (screen: string) => screensSeen.set(screen, (screensSeen.get(screen) || 0) + 1);
    for (const role of ROLES) {
      const switched = await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
      if (switched.status !== 200) { check(false, `T5 تبديل الصفة «${role}»`, switched); continue; }
      const perms: number[] = switched.json.permissions || [];
      const scopes: Array<{ AdCollegeId: number; AdSectionId: number }> = role === "admin"
        ? allSections.map(s => ({ AdCollegeId: s.AdCollegeId, AdSectionId: s.AdSectionId })) : switched.json.scopes;
      const hasSchedules = perms.includes(7) || role === "admin";
      for (const [mode, term] of [["الجاري", current], ["السابق", previous]] as const) {
        if (!term) continue;
        const termId = Number(term.AdTermId), isPrev = mode === "السابق";
        for (const { AdCollegeId, AdSectionId } of scopes) {
          const q = `collegeId=${AdCollegeId}&sectionId=${AdSectionId}&termId=${termId}`, where = `${role} · ${mode} · قسم ${AdSectionId}`;
          /* كشف التسجيل */
          if (hasSchedules || perms.includes(14)) {
            const reg = await call(`/api/student-registration?${q}`);
            if (reg.status === 200) {
              seen("registration");
              const t = reg.json.totals;
              check(t.students > 0 && t.courses > 0, `T5 كشف التسجيل غيرُ فارغ — ${where}`, t);
              if (isPrev) check(t.pendingCommittee > 0 && t.registered > 0 && t.rejected > 0 && t.waiting > 0 && t.committeeRejected > 0 || REGISTRAR.has(role), `T5 كشف الفصل السابق بكل حالاته (تنتظر اللجنة، سُلّمت، سُجّلت، رُدّت، لم توافق اللجنة) — ${where}`, t);
            } else {
              check(reg.status === 409 && REGISTRAR.has(role) && !isPrev && reg.json?.code === "not-signed", `T5 كشف التسجيل مرفوضٌ بسببٍ مقصود فقط (جدولٌ لم يُوقَّع لموظفي التسجيل) — ${where}`, { s: reg.status, j: reg.json });
            }
          }
          if (hasSchedules) {
            /* رغبات الأساتذة والمقترحات */
            const requests = await call(`/api/instructor-requests?${q}`);
            if (requests.status === 200) {
              seen("requests");
              const rows: any[] = requests.json.rows || [];
              check(rows.length > 0, `T5 رغباتُ الأساتذة غيرُ فارغة — ${where}`, requests.json.totals);
              if (isPrev) check(rows.some(r => r.status === "settled") && rows.some(r => r.status !== "settled"), `T5 رغباتُ الفصل السابق بحالاتٍ مختلفة (منتهية وما زالت مفتوحة) — ${where}`, rows.map(r => r.status));
            } else check(false, `T5 رغباتُ الأساتذة متاحةٌ لمن يملك الجدول — ${where}`, requests.status);
            const proposals = await call(`/api/study-proposals?${q}`);
            if (proposals.status === 200) {
              seen("proposals");
              const list: any[] = proposals.json.proposals || [];
              check(list.length > 0, `T5 المقترحاتُ الدراسية غيرُ فارغة — ${where}`);
              if (isPrev) check(new Set(list.map(p => p.proposal.status)).size >= 2, `T5 مقترحاتُ الفصل السابق بحالاتٍ مختلفة — ${where}`, list.map(p => p.proposal.status));
            } else check(false, `T5 المقترحاتُ متاحةٌ لمن يملك الجدول — ${where}`, proposals.status);
            /* مركز الذكاء */
            const intel = await call(`/api/intelligence/overview?${q}`);
            if (intel.status === 200) { seen("intelligence"); check(Number(intel.json.metrics?.rows) > 0, `T5 مركز الذكاء يقرأ جدولاً — ${where}`, intel.json.metrics); }
          }
          /* تغييرات الجدول: للفصل السابق دورةُ اعتمادٍ كاملة (جولتان وقبول) */
          const changes = await call(`/api/reports/schedule-changes?${q}`);
          if (changes.status === 200) {
            seen("changes");
            check(Boolean(changes.json.approval) && Number(changes.json.rowCount) > 0, `T5 تغييراتُ الجدول تقرأ جدولاً ودورةَ اعتماد — ${where}`, { a: !!changes.json.approval, n: changes.json.rowCount });
            if (isPrev) check(changes.json.approval?.status === "accepted" && (changes.json.rounds?.length || changes.json.approval?.rounds?.length) >= 2 && String(changes.json.summary || "").length > 0, `T5 تغييراتُ الفصل السابق: دورةٌ معتمدة بجولتين وملخّص — ${where}`, changes.json.summary);
          } else if (isPrev) check(false, `T5 تغييراتُ الفصل السابق متاحةٌ — ${where}`, changes.status);
        }
      }
      /* الرادار والصحائف: بحدود نطاق الصفة */
      if (perms.includes(7) || perms.includes(14) || role === "admin") {
        const radar = await call("/api/simulation/summary");
        if (radar.status === 200 && radar.json.run) {
          seen("radar");
          check(radar.json.run.students > 0 && radar.json.courses.length > 0, `T5 الرادار غيرُ فارغ — ${role}`, { s: radar.json.run.students, c: radar.json.courses?.length });
          const answers = await call("/api/simulation/outcome");
          if (answers.status === 200) check(answers.json.courses.length > 0, `T5 أجوبةُ «هل سجلت؟» غيرُ فارغة — ${role}`, answers.json.courses?.length);
        }
        const planStatus = await call("/api/plan-review/status");
        /* «مراجعة الصحيفة» لمن يبني الجدول وحده (شاشةُ القراءة لا تُفتح لغيرهم). */
        if (planStatus.status === 200 && planStatus.json.sections && (hasSchedules || role === "admin")) { seen("plans"); check(planStatus.json.sections.length > 0 && planStatus.json.sections.every((s: any) => s.plans.length > 0), `T5 مراجعةُ الصحيفة: صحائفُ كل قسم — ${role}`, planStatus.json.sections.length); }
      }
    }
    for (const screen of ["registration", "requests", "proposals", "intelligence", "changes", "radar", "plans"]) {
      check((screensSeen.get(screen) || 0) >= (screen === "plans" ? 3 : 10), `T5 فُحصت شاشة «${screen}» فعلاً (${screensSeen.get(screen) || 0} قراءة) — فلا يمرّ الفحصُ فارغاً`);
    }
  }
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
