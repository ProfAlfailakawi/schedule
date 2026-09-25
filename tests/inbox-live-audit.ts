/** وارد الأساتذة: فحصٌ حيّ بسياسة الجدول الدراسي، وبطاقةٌ سريعة، ومرشّحات. */
import fs from "fs";
import path from "path";
import { proposedRow } from "../src/components/InstructorInbox";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const inbox = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");

const row: any = { AdInstructorId: 7, AdCollegeId: 2, AdSectionId: 3, AdTermId: 1 };
const add = proposedRow(row, { action: "add", after: { courseId: 112, collegeId: 4, sectionId: 9 }, slots: [{ day: "fmonday", start: "09:30", end: "10:50" }, { day: "fwednesday", start: "09:30", end: "10:50" }] } as any);
check(add?.AdInstructorId === 7 && add.fmonday && add.fwednesday && !add.fsunday && add.AdCollegeId === 4 && add.excludeId === 0,
  "الإضافة تُفحص بأستاذها وأيامها وكلية البند نفسه");
const change = proposedRow(row, { action: "change", rowId: 55, slots: [{ day: "fsunday", start: "10:00", end: "10:50" }] } as any, { id: 55, roomId: "r1", AdInstructorId: 7 } as any);
check(change?.roomId === "r1" && change.excludeId === 55 && change.fsunday, "التعديل يُفحص بقاعته، ويستثني صفَّه نفسه");
check(proposedRow(row, { action: "delete", rowId: 1 } as any) === null, "الحذف لا يُفحص");
check(inbox.includes('fetch("/api/schedules/check-conflicts"'), "الفحصُ الحيّ هو فحصُ «الجدول الدراسي» نفسه");
check(inbox.includes('disabled={busy || blocked || readiness === "checking"}'), "لا يُثبَّت ما منعه الفحص الحيّ أو المحفوظ");
check(inbox.includes("<QuickCreatePopover") && inbox.includes("saveQuick"), "الإضافة تُفتح بطاقةً سريعة في مكانها");
check(inbox.includes('onNavigate?.("schedules")') && inbox.includes("onExpand"), "و«تفاصيل أكثر» ما زالت تفتح النموذج الكامل");
check(inbox.includes('className="request-filters"') && inbox.includes('useState<"pending" | "fixed" | "rejected" | "all">("pending")'),
  "مرشّحات، والافتراضيُّ ما ينتظر القرار");
check(inbox.includes("setRowErrors(prev => ({ ...prev, [key]: inboxMessage(e.message) }))"), "رفضُ الخادم يُقال على صفّه، لا في أعلى الصفحة");
check(server.includes('function broadcastNotify(demoSessionId = "")') && /broadcastNotify\(Repository\.currentDemoSessionId\(\)\);\n\s*res\.json\(\{ request: stripForInstructor\(saved\), changed \}\);/.test(server),
  "طلبُ الأستاذ يُنبّه الشاشات المفتوحة في لحظته (وفي صندوق العرض شاشاتِ صندوقه وحدها)");

check(inbox.includes("siblings.set(Number(other.rowId)") && inbox.includes("extra.after"),
  "الحذفُ ثم الإضافة في الطلب نفسه ترتيبٌ لا تعارض: يُثبَّت الشقيقُ أولاً");
console.log(`\nInbox live audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
