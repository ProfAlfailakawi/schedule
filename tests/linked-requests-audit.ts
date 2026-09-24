/** بنودٌ مترابطة بين قسمين، وتنبيهُ الصفة التي لا تشبه اسمَ صاحبها. */
import { awaitedItemIndexes } from "../src/utils/linkedRequestItems";
import { roleMismatchHint } from "../src/utils/academicRoles";
import { buildNotifications } from "../src/utils/notificationCenter";
import { emptyApproval } from "../src/utils/approvalWorkflow";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

/* حالةُ إقبال المطوع كما في البيانات: حذفٌ في التجارية، وإضافةٌ في الأساسية. */
const rows = new Map<number, any>([[23888, { id: 23888, AdCollegeId: 17, AdSectionId: 87, fmonday: true, fwednesday: true, fthursday: true, fstarttime: "09:00", fendtime: "09:50" }]]);
const items: any[] = [
  { action: "delete", rowId: 23888, before: { collegeId: 17, sectionId: 87 } },
  { action: "add", rowId: null, after: { collegeId: 6, sectionId: 12 }, slots: [{ day: "fmonday", start: "09:30", end: "10:50" }, { day: "fwednesday", start: "09:30", end: "10:50" }] },
];
const scopeOf = (item: any) => { const snap = item.action === "add" ? item.after : item.before; return { collegeId: snap.collegeId, sectionId: snap.sectionId }; };
check(awaitedItemIndexes(items, rows, scopeOf).has(0), "الحذفُ الذي يُفرغ وقتَ إضافةٍ في قسمٍ آخر يُعلَّم «منتظَراً»");
check(!awaitedItemIndexes([items[0], { ...items[1], slots: [{ day: "fsunday", start: "09:30", end: "10:50" }] }], rows, scopeOf).has(0), "ولا يُعلَّم إن لم يتقاطع اليومُ");
check(!awaitedItemIndexes([items[0], { ...items[1], after: { collegeId: 17, sectionId: 87 } }], rows, scopeOf).has(0), "ولا حين يكون البندان في القسم نفسه — هناك يُرتَّبان تلقائياً");
check(!awaitedItemIndexes([{ ...items[0], decision: { state: "fixed" } }, items[1]], rows, scopeOf).size, "وما قُرّر لا ينتظره أحد");

const scope: any = { approval: { ...emptyApproval(17, 87, 42) }, collegeName: "كلية الدراسات التجارية - بنات", sectionName: "قسم التربية الإسلامية", rowCount: 5, openRegistrarNotes: 0, openRequests: 1,
  pendingRequests: [{ requestId: "r1", instructorName: "إقبال المطوع", count: 1, linked: true, at: "2026-09-24T00:00:00Z" }] };
const note = buildNotifications({ role: "committeeChair", scopes: [scope] }).find(item => item.view === "instructorRequests");
check(note?.tone === "alert" && /قسمٌ آخر ينتظر قرارك/.test(note.title), "إشعارُ القسم صاحب الحذف: «قسمٌ آخر ينتظر قرارك»");

check(Boolean(roleMismatchHint("مكتب تسجيل البنات", "committeeChair")), "مكتبُ تسجيلٍ بصفة لجنة يُنبَّه عليه");
check(!roleMismatchHint("مكتب تسجيل البنات", "registrarStaff"), "وبصفة موظف تسجيل لا تنبيه");
check(!roleMismatchHint("قسم الرياضيات", "committeeChair"), "واللجنةُ باسم قسمها لا تنبيه");

console.log(`\nLinked requests audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
