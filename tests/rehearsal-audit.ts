/**
 * بروفة الفصل الكامل في البيئة التجريبية الحيّة (2026-09-25).
 *
 * كلُّ بندٍ هنا عيبٌ ظهر حين أُدّيت الدورة كما يؤدّيها أصحابها: اللجنة ورئيس
 * القسم والأستاذ والطالب والتسجيل والعمداء. والفحصُ سلوكيٌّ حيث يمكن (الدوالّ
 * نفسها التي تقرؤها الشاشات والخادم)، وبنيويٌّ حيث يلزم أن تبقى القاعدةُ في
 * مكانٍ واحد.
 */
import fs from "fs";
import path from "path";
import {
  additionsAwaitingHead, canSubmit, emptyApproval, needsHeadAcknowledgement, readDeadline, withRemainingSignatures,
} from "../src/utils/approvalWorkflow";
import { buildNotifications, type CenterScope } from "../src/utils/notificationCenter";
import type { ScheduleApproval } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
/** جسمُ دالّةٍ أو مسارٍ في الخادم، من بدايته إلى بداية ما يليه. */
const block = (source: string, start: string, end = "\napp.") => {
  const at = source.indexOf(start);
  if (at < 0) return "";
  const stop = source.indexOf(end, at + start.length);
  return source.slice(at, stop < 0 ? undefined : stop);
};

/* ══ R1: الإضافاتُ تنتظر رئيسَ القسم ما دام توقيعُه قائماً ══════════════════
 * البروفة: اللجنة أضافت شعبةً بعد اعتماد رئيس القسم، ثم سحبت توقيعها (فسقط
 * توقيعُه معه) ووقّعت من جديد. فقال الجرسُ لرئيس القسم «شعبة واحدة أُضيفت بعد
 * اعتمادك — وافق عليها» ولا اعتمادَ له، وعُدّت الشعبةُ في عدّاد اللجنة. */
{
  const sig = (stage: "committee" | "head") => ({ stage, SystemUserId: 1, userName: "س", roleLabel: "ص", at: "2026-09-25T00:00:00Z", rowCount: 8, verifyCode: "ABC123" });
  const addition = { scheduleId: 1058, courseId: 17, courseName: "أمن الأنظمة", sectionCode: "02", addedAt: "2026-09-25T00:00:00Z", addedBy: "اللجنة" };
  const base = (signatures: any[], status: any = "returned"): ScheduleApproval => ({
    ...emptyApproval(1, 1, 1), status, currentRound: 1, signatures,
    rounds: [{ number: 1, submittedAt: "2026-09-16T00:00:00Z", returnedAt: "2026-09-22T00:00:00Z" }],
    pendingAdditions: [addition],
  } as ScheduleApproval);

  const signed = base([sig("committee"), sig("head")]);
  check(additionsAwaitingHead(signed) === 1 && needsHeadAcknowledgement(signed), "R1: إضافةٌ بعد اعتمادٍ قائم تنتظر رئيس القسم");
  const committeeOnly = base([sig("committee")]);
  check(additionsAwaitingHead(committeeOnly) === 0 && !needsHeadAcknowledgement(committeeOnly), "R1: بلا توقيع رئيس القسم لا شيء «أُضيف بعد اعتماده»");

  const dropped = withRemainingSignatures(signed, []);
  check(dropped.pendingAdditions.length === 0 && Number(dropped.pendingAdditionsOverflow || 0) === 0 && dropped.signatures.length === 0,
    "R1: سقوطُ توقيع رئيس القسم يطوي قائمة ما كان ينتظره");
  const kept = withRemainingSignatures({ ...signed, pendingAdditionsOverflow: 3 }, [sig("committee"), sig("head")]);
  check(kept.pendingAdditions.length === 1 && kept.pendingAdditionsOverflow === 3, "R1: وما دام توقيعُه باقياً تبقى القائمة كما هي");

  /* الجرس، لرئيس القسم وللجنة، على الحال التي عاشتها البروفة. */
  const scope = (approval: ScheduleApproval): CenterScope => ({
    approval, collegeName: "كلية العلوم التطبيقية", sectionName: "علوم الحاسب", rowCount: 8, openRegistrarNotes: 0, openRequests: 0,
  } as CenterScope);
  const head = buildNotifications({ role: "departmentHead", scopes: [scope(committeeOnly)] });
  check(!head.some(item => item.title.includes("بعد اعتمادك")), "R1: لا يُقال لرئيس القسم «أُضيفت بعد اعتمادك» ولا اعتمادَ له");
  const headBack = head.find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(headBack) && headBack!.tone === "action" && headBack!.detail.includes("اعتمادُك"),
    "R1: بل يُقال له إن اللجنة وقّعت وإن اعتمادَه يعيد الإرسال");
  const committee = buildNotifications({ role: "committeeChair", scopes: [scope(committeeOnly)] });
  const committeeBack = committee.find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(committeeBack) && committeeBack!.tone === "waiting" && committeeBack!.detail.includes("اعتماد رئيس القسم")
    && !committeeBack!.detail.includes("إقرارَ"), "R1: واللجنةُ تنتظر اعتمادَ رئيس القسم، لا «إقرارَه على شعبة»");
  const unsigned = buildNotifications({ role: "committeeChair", scopes: [scope(base([]))] }).find(item => item.title.includes("أرجع التسجيل"));
  check(Boolean(unsigned) && unsigned!.tone === "action" && unsigned!.detail.includes("وقّع"), "R1: وإن سحبت توقيعها قيل لها أن توقّع");
  const headWithAdditions = buildNotifications({ role: "departmentHead", scopes: [scope(signed)] });
  check(headWithAdditions.some(item => item.title.includes("بعد اعتمادك")), "R1: وما أُضيف بعد اعتمادٍ قائم يُقال له كما كان");

  /* الإرسال: الإضافةُ المعلّقة على توقيعٍ ساقط لا تُحسب مانعاً ثانياً. */
  const verdict = canSubmit({ ...signed, signatures: [sig("committee"), sig("head")] }, { openNoteCount: 0, deadlineState: readDeadline({}, "2026-09-25") });
  check(verdict.ok === false && verdict.code === "pending-additions", "R1: الإرسالُ ما زال يُمنع بإضافةٍ تنتظر اعتماداً قائماً");

  /* بنيوياً: مسارا السحب وإرجاع رئيس القسم يُسقطان التوقيعَ من المكان الواحد،
     والجرسُ والشريط والعدّاد والوارد يقرؤون القاعدة الواحدة. */
  check(block(server, 'app.post("/api/approvals/withdraw"').includes("withRemainingSignatures(approval, dropped)"),
    "R1: سحبُ التوقيع يمرّ بـwithRemainingSignatures");
  check(block(server, 'app.post("/api/approvals/head-return"').includes("withRemainingSignatures(approval,"),
    "R1: إرجاعُ رئيس القسم يمرّ بـwithRemainingSignatures");
  check(block(server, "async function approvalBadgeForTerm(", "\napp.get").includes('if (stage === "head") open += additionsAwaitingHead(approval);'),
    "R1: العدّادُ يعدّ الإضافات لرئيس القسم وحده وبالقاعدة الواحدة");
  check(block(server, 'app.get("/api/approvals/inbox"').includes("pendingAdditions: additionsAwaitingHead(approval)"),
    "R1: الوارد يقرأ القاعدة الواحدة");
  const center = read("src/utils/notificationCenter.ts");
  check(!/approval\.pendingAdditions\.length/.test(center) && center.includes("additionsAwaitingHead(approval)"),
    "R1: الجرسُ لا يعدّ القائمة الخام");
  const bar = read("src/components/ApprovalBar.tsx");
  check(bar.includes("const pendingAdditions = additionsAwaitingHead(approval);") && !bar.includes("pendingAdditionTotal"),
    "R1: الشريطُ يقرأ القاعدة الواحدة");
}

/* ══ R2: إرجاعُ رئيس القسم يصل اللجنةَ بسببه ═════════════════════════════════
 * البروفة: أرجع رئيس القسم الجدول بسببٍ مكتوب، فقال جرسُ اللجنة «وقّع جدول
 * علوم الحاسب — بعد توقيعك يصل لرئيس القسم» كأنها تبدأ، بلا ذكرٍ للإرجاع. */
{
  const approval = {
    ...emptyApproval(1, 1, 1), status: "drafting", currentRound: 1, signatures: [],
    rounds: [{ number: 1, submittedAt: "2026-09-16T00:00:00Z", returnedAt: "2026-09-22T00:00:00Z" }],
    headReturn: { by: "د. رئيس القسم", at: "2026-09-25T17:47:18.277Z", reason: "راجعوا توقيت الشعبة الثانية" },
  } as ScheduleApproval;
  const scope = { approval, collegeName: "ك", sectionName: "علوم الحاسب", rowCount: 8, openRegistrarNotes: 0, openRequests: 0 } as CenterScope;
  const committee = buildNotifications({ role: "committeeChair", scopes: [scope] });
  const item = committee.find(entry => entry.title.includes("أرجع رئيس القسم"));
  check(Boolean(item) && item!.tone === "action" && item!.detail.includes("راجعوا توقيت الشعبة الثانية"),
    "R2: اللجنةُ تقرأ في جرسها أن رئيس القسم أرجع الجدول، وبسببه");
  check(!committee.some(entry => entry.title.startsWith("وقّع جدول")), "R2: ولا يُقال لها «وقّع» كأنها تبدأ");
  const head = buildNotifications({ role: "departmentHead", scopes: [scope] });
  check(head.some(entry => entry.tone === "waiting" && entry.title.includes("أرجعتَ")), "R2: ورئيسُ القسم يرى أنه ينتظر اللجنة");
}

/* ══ R3: ملخّصُ العميد بالعدّ العربي ═════════════════════════════════════════
 * البروفة: جرسُ العميد والعميد المساعد قال «المعتمد 1 من جدولين» و«بقي 1 لم
 * يعتمده التسجيل بعد» — رقمٌ لاتينيٌّ بلا معدود، خلافَ قاعدة countOf. */
{
  const accepted = [{ number: 1, submittedAt: "2026-09-01T00:00:00Z", acceptedAt: "2026-09-02T00:00:00Z" }];
  const scopeOf = (status: any, rounds: any[] = []) => ({
    approval: { ...emptyApproval(1, 1, 1), status, rounds, currentRound: rounds.length },
    collegeName: "ك", sectionName: `ق${Math.random()}`, rowCount: 7, openRegistrarNotes: 0, openRequests: 0,
  } as unknown as CenterScope);
  const summary = (scopes: CenterScope[]) => buildNotifications({ role: "dean", scopes }).find(item => item.id.startsWith("final-summary"))!;
  const one = summary([scopeOf("accepted", accepted), scopeOf("submitted")]);
  check(one.title === "اعتُمد جدول واحد من جدولين" && one.detail === "جدول واحد لم يعتمده التسجيل بعد.",
    "R3: «اعتُمد جدول واحد من جدولين» و«جدول واحد لم يعتمده التسجيل بعد»");
  const none = summary([scopeOf("submitted"), scopeOf("drafting"), scopeOf("returned")]);
  check(none.title === "لم يُعتمد بعدُ أيٌّ من 3 جداول" && none.detail === "3 جداول لم يعتمدها التسجيل بعد.",
    "R3: ولا «المعتمد 0»: «لم يُعتمد بعدُ أيٌّ من 3 جداول»");
  const two = summary([scopeOf("accepted", accepted), scopeOf("submitted"), scopeOf("drafting")]);
  check(two.detail === "جدولان لم يعتمدهما التسجيل بعد.", "R3: والمثنّى بضميره «لم يعتمدهما»");
  const center = read("src/utils/notificationCenter.ts");
  check(!/`المعتمد \$\{done\}|بقي \$\{total - done\}/.test(center), "R3: لا رقمَ خامٌ في ملخّص العميد");
}

console.log(`\nRehearsal audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
