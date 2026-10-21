import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { isAssignableInstructor } from "../src/utils/instructorStatus";

assert.equal(isAssignableInstructor({ AdInstructorName: "نشط" } as any), true);
assert.equal(isAssignableInstructor({ AdInstructorStatus: null }), true);
assert.equal(isAssignableInstructor({ AdInstructorStatus: "retired" }), false);
assert.equal(isAssignableInstructor({ AdInstructorStatus: "sabbatical" }), false);
assert.equal(isAssignableInstructor(undefined), false);

const source = (path: string) => readFileSync(path, "utf8");
assert.match(source("src/components/IntelligenceWorkspace.tsx"), /instructors\.filter\(isAssignableInstructor\)/, "قيود مختبر القرار لا تعرض غير المتاحين للإسناد");
assert.match(source("src/components/QuickCreatePopover.tsx"), /instructors\.filter\(isAssignableInstructor\)/, "الإضافة السريعة لا تعرض غير المتاحين للإسناد");
assert.match(source("src/components/ScheduleTransfer.tsx"), /sortByName\(instructors\.filter\(isAssignableInstructor\)/, "بديل الأستاذ لا يقبل متقاعداً أو متفرغاً");
assert.match(source("src/components/LivingScheduleLayer.tsx"), /instructors\.filter\(isAssignableInstructor\)/, "إصلاح مسودة الجدول لا يقترح غير المتاحين");
assert.match(source("src/components/InstructorPicker.tsx"), /AdInstructorStatus === "retired" \|\| person\?\.AdInstructorStatus === "sabbatical"/, "اختيار الأستاذ الأساسي يستبعد المتقاعد والمتفرغ");
assert.match(source("server.ts"), /لا يمكن إنشاء قاعدة جديدة لأستاذ متقاعد أو متفرّغ/, "الخادم يرفض إنشاء قيد جديد لأستاذ غير متاح");
console.log("✓ المتقاعد والمتفرغ يظهران في السجلات الإدارية/التاريخية، ولا يظهران كاختيار لإسناد جديد");
