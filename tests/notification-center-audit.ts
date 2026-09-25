/**
 * مركز الإشعارات ودورة الاعتماد المختصرة:
 * - اللجنة توقّع ← رئيس القسم يعتمد فيصل التسجيلَ مباشرة (المرّة الأولى).
 * - بعد أول قبول: التعديل يصل التسجيل وحده، بلا إقرارٍ من رئيس القسم.
 * - العميدان يريان المعتمد وحده.
 */
import fs from "fs";
import path from "path";
import { buildNotifications, type CenterScope } from "../src/utils/notificationCenter";
import { emptyApproval } from "../src/utils/approvalWorkflow";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const scope = (over: Partial<CenterScope> & { status?: any; rounds?: any[]; pendingAdditions?: any[] } = {}): CenterScope => {
  const approval = { ...emptyApproval(1, 5, 9), status: over.status || "drafting", rounds: over.rounds || [], pendingAdditions: over.pendingAdditions || [], currentRound: (over.rounds || []).length };
  return { approval, collegeName: "كلية العلوم", sectionName: "الرياضيات", rowCount: 10, openRegistrarNotes: 0, openRequests: 0, ...over, } as CenterScope;
};

// اللجنة
let items = buildNotifications({ role: "committeeChair", scopes: [scope()] });
check(items[0]?.tone === "action" && items[0].title.includes("وقّع"), "اللجنة: جدولٌ بمواعيد ولم يُوقَّع → مطلوبٌ منها التوقيع");
items = buildNotifications({ role: "committeeChair", scopes: [scope({ status: "committee" })] });
check(items[0]?.tone === "waiting" && items[0].title.includes("رئيس القسم"), "اللجنة بعد توقيعها: بانتظار رئيس القسم");
// رئيس القسم
items = buildNotifications({ role: "departmentHead", scopes: [scope({ status: "committee" })] });
check(items[0]?.tone === "action" && items[0].detail.includes("للتسجيل مباشرة"), "رئيس القسم: اعتمادُه يرسل للتسجيل مباشرة");
const accepted = [{ number: 1, submittedAt: "2026-09-01T00:00:00Z", acceptedAt: "2026-09-02T00:00:00Z" }];
items = buildNotifications({ role: "departmentHead", scopes: [scope({ status: "submitted", rounds: [...accepted, { number: 2, submittedAt: "2026-09-03T00:00:00Z" }], pendingAdditions: [{ scheduleId: 1 } as any] })] });
check(!items.some(item => item.title.includes("بعد اعتمادك")), "بعد أول قبول: لا يُطلب من رئيس القسم إقرارٌ على إضافة");
// التسجيل
items = buildNotifications({ role: "registrarStaff", scopes: [scope({ status: "submitted", rounds: [{ number: 1, submittedAt: "2026-09-01T00:00:00Z" }] }), scope({ status: "drafting" })], deadline: { effective: "2026-09-01", past: true } });
check(items.some(item => item.tone === "action" && item.title.includes("ينتظر قرارك")), "التسجيل: جدولٌ عنده ينتظر قراره");
check(items.some(item => item.tone === "alert" && item.title.includes("لم يسلّم")), "التسجيل: الأقسام التي لم تسلّم بعد انقضاء الموعد تنبيهٌ");
items = buildNotifications({ role: "registrarDean", scopes: [scope({ status: "submitted", rounds: [{ number: 1 }] })] });
check(items.every(item => item.tone !== "action"), "عميد التسجيل يطّلع ولا يُطلب منه قرار");
// العميد
items = buildNotifications({ role: "dean", scopes: [scope({ status: "accepted", rounds: accepted }), scope()] });
check(items.some(item => item.title === "اعتُمد جدول واحد من جدولين"), "العميد: كم قسماً اعتُمد من الكل، بالعدّ العربي");
check(items.some(item => item.title.includes("اعتُمد جدول")), "العميد: كل قسمٍ اعتُمد يظهر");
check(items.every(item => item.tone !== "action"), "العميد لا يُطلب منه شيء");
// الترتيب
items = buildNotifications({ role: "committeeChair", scopes: [scope({ status: "accepted", rounds: accepted }), scope({ status: "returned", rounds: [{ number: 1, returnedAt: "x" }], openRegistrarNotes: 2 } as any)] });
check(items[0]?.tone === "action" && items[items.length - 1]?.tone === "done", "المطلوب أولاً، والمنجز آخراً");

// الخادم
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
check(server.includes('const sent = stage === "head" ? await submitToRegistrar('), "اعتماد رئيس القسم يرسل للتسجيل في الخطوة نفسها");
check(server.includes("const everAccepted = next.rounds.some(round => Boolean(round.acceptedAt));"), "بعد أول قبول لا تُسجَّل إضافاتٌ تنتظر رئيس القسم");
check(/status: "accepted", rounds, pendingAdditions: \[\]/.test(server), "القبول يُسقط ما بقي من إقرارات");
check(server.includes("acceptedVersionId: accepted.id"), "القبول يحفظ نسخة ما قُبل");
check(/if \(!readsFinalSchedulesOnly\(req\)\) return rows;\s*const final = await finalRowsWithFinality\(rows, termId\);/.test(server), "العميدان يقرآن المعتمد وحده من الخادم، لا من الواجهة");
check(/id === "dean" \|\| id === "viceDean"/.test(server), "المعتمد وحده للعميد والعميد المساعد تحديداً");
check(server.includes('app.get("/api/notifications", requireAuth'), "مسار الإشعارات موجود");
check(/isScopeAllowed\(req, Number\(row\.AdCollegeId\), Number\(row\.AdSectionId\)\)\);\s*const termDeadline/.test(server), "الإشعارات مقصورةٌ على نطاق الحساب");

/* ── كشف التسجيل: اللجنةُ أولاً، ثم التسجيل ─────────────────────────────── */
{
  const now = Date.parse("2026-09-24T12:00:00Z");
  const queued = (q: any) => scope({ status: "accepted", rounds: accepted, studentQueue: q } as any);
  let list = buildNotifications({ role: "committeeChair", scopes: [queued({ pendingCommittee: 3, awaitingRegistration: 0, oldestPendingAt: "2026-09-23T10:00:00Z" })], now });
  const committeeItem = list.find(item => item.view === "studentRegistration");
  check(Boolean(committeeItem) && committeeItem!.tone === "action" && committeeItem!.title.includes("قرار اللجنة"),
    "كشف التسجيل: اللجنةُ يُقال لها كم مقرّراً ينتظر قرارها");
  list = buildNotifications({ role: "committeeChair", scopes: [queued({ pendingCommittee: 1, awaitingRegistration: 0, oldestPendingAt: "2026-09-18T10:00:00Z" })], now });
  check(list.find(item => item.view === "studentRegistration")?.tone === "alert",
    "ويصير تنبيهاً إذا انتظر أقدمُها أكثر من ثلاثة أيام");
  list = buildNotifications({ role: "registrarStaff", scopes: [queued({ pendingCommittee: 4, awaitingRegistration: 0 })], now });
  check(!list.some(item => item.view === "studentRegistration"),
    "والتسجيلُ لا يُقال له عمّا لم توافق عليه اللجنة بعد");
  list = buildNotifications({ role: "registrarStaff", scopes: [queued({ pendingCommittee: 0, awaitingRegistration: 2, latestApprovedAt: "2026-09-24T09:00:00Z" })], now });
  const registrarItem = list.find(item => item.view === "studentRegistration");
  check(Boolean(registrarItem) && registrarItem!.tone === "action" && registrarItem!.title.includes("وافقت لجنة"),
    "والتسجيلُ يُقال له ما وافقت عليه اللجنة وينتظره");
  const again = buildNotifications({ role: "registrarStaff", scopes: [queued({ pendingCommittee: 0, awaitingRegistration: 3, latestApprovedAt: "2026-09-24T11:00:00Z" })], now })
    .find(item => item.view === "studentRegistration");
  check(Boolean(again) && again!.id !== registrarItem!.id, "والدفعةُ الجديدة إشعارٌ جديد");
  list = buildNotifications({ role: "committeeChair", scopes: [queued({ pendingCommittee: 0, awaitingRegistration: 5 })], now });
  check(!list.some(item => item.view === "studentRegistration"), "واللجنةُ لا تُنبَّه بما سلّمته");
}

{
  const noDeadline = buildNotifications({ role: "registrarHead", scopes: [scope({ status: "drafting" })] });
  check(noDeadline.some(item => item.id === "deadline-missing" && item.tone === "action" && item.view === "scheduleChanges"), "رئيس التسجيل يُطلب منه تحديد موعد التسليم ما دام غير محدَّد");
  const withDeadline = buildNotifications({ role: "registrarHead", scopes: [scope({ status: "drafting" })], deadline: { effective: "2099-01-01" } as any });
  check(!withDeadline.some(item => item.id === "deadline-missing"), "…ولا يُطلب متى حُدِّد");
  const staff = buildNotifications({ role: "registrarStaff", scopes: [scope({ status: "drafting" })] });
  check(!staff.some(item => item.id === "deadline-missing"), "…وموظف التسجيل لا يملك الموعد فلا يُطلب منه");
}

console.log(`\nNotification center audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
