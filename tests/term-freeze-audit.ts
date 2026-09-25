/**
 * ── فصلٌ انتهى لا يُعدَّل ────────────────────────────────────────────────────
 *
 * كانت علامةُ «منتهٍ» تُعرض ولا تمنع شيئاً: تُقرأ في شاشة الفصول وفي عنوان
 * الجدول، ثم يُحفظ فيه ما شاء من شاء. فالمقرّرُ الذي انتهى وسُلّمت درجاتُه
 * يمكن أن يتغيّر وقتُه بعد شهرين، ولا يعرف أحدٌ أن ما يقرؤه اليومَ ليس ما جرى
 * في حينه — وهو أخطرُ ما يقع في سجلٍّ أكاديميّ: لا يشتكي منه أحد.
 *
 * ولجنةُ الجدول تعمل فيه: هي التي تجرّب وتصحّح. ومن سواها يقرأ ويطبع ويستعلم.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "src/components/Schedules.tsx"), "utf8");
const termSequence = fs.readFileSync(path.join(process.cwd(), "src/utils/termSequence.ts"), "utf8");

/* ── الحارسُ واحدٌ، في الموضع الذي يمرّ به كلُّ تعديل ──────────────────── */

const guard = server.slice(
  server.indexOf("async function scheduleLockRefusal("),
  server.indexOf("async function noteScheduleMutation("),
);
check(guard.length > 300, "حارسُ التعديل مقروءٌ للتدقيق");
check(guard.includes("req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number,"),
  "ويعرف من يطلب، لا النطاقَ وحدَه — فالمنعُ يختلف بالصفة");
/* الحكمُ نفسُه صار في `approvalLockReason` (تدقيق الدورة R21): الحارسُ يقرؤه
   منها، والشاشةُ تقرؤه منها — فلا نسختان. */
const lockRule = fs.readFileSync(path.join(process.cwd(), "src/utils/approvalWorkflow.ts"), "utf8");
check(guard.includes("term?.AdTermClosed === true") && guard.includes("approvalLockReason(")
  && lockRule.includes("if (context.termClosed && !context.isCommittee)"),
  "وفصلٌ انتهى لا يُعدَّل إلا من لجنة الجدول");
/* ── واللجنةُ تُعرف بصفتها المكتوبة، لا بالافتراض ──────────────────────────
 * `signatureStage` تسقط إلى `committeeChair` حين لا تُعرف الصفة، فحسابٌ بلا
 * صفةٍ مكتوبة يُقرأ «لجنة». وحسابُ الإدارة الجذر من هؤلاء عن قصد — الترحيلُ
 * يستثنيه — فكان يمرّ من فوق التجميد كلِّه بلا أن يرفع العلامة، ويسقط معه
 * البابُ الظاهرُ المسجَّل الذي وُضع ليكون الطريقَ الوحيد. */
check(guard.includes("const isCommittee = isAcademicRole(role) && signatureStage(role) === \"committee\";"),
  "وتُشترط صفةٌ مكتوبةٌ صراحةً، فلا يمرّ حسابٌ بلا صفةٍ لأن الغيابَ يسقط إلى اللجنة");
check(lockRule.includes("انتهى هذا الفصل."),
  "ويُقال السببُ بلفظه، لا «غير مسموح»");

/* والعلَمُ الصريحُ وحدَه: `isTermClosed` تعدّ كلَّ فصلٍ ليس الأحدثَ منتهياً،
   فالأخذُ بها هنا يُجمّد عشرَ سنواتٍ من الفصول دفعةً واحدة، ولم يُطلب ذلك. */
check(!guard.includes("isTermClosed("),
  "ولا يُجمَّد فصلٌ لم يُعلنه أحد، فالعلَمُ الصريحُ وحدَه يمنع");

/* والترتيبُ شرط: قفلُ الفصل قبل قفل الإرسال، فالمنتهي ممنوعٌ في كل حال. */
check(guard.indexOf("AdTermClosed") < guard.indexOf("getScheduleApproval"),
  "ويُسأل عن الفصل أولاً، فلا يمرّ منتهٍ لأن جدوله غيرُ مُرسَل");

/* ── وكلُّ بابٍ يكتب يمرّ به ──────────────────────────────────────────── */

/* كان ثلاثةُ أبوابٍ تكتب بلا حارسٍ أصلاً: استثناءُ الأسبوع إضافةً وحذفاً.
   وإلغاءُ محاضرةٍ في فصلٍ منتهٍ تغييرٌ لما جرى فعلاً. */
for (const door of [
  'app.post("/api/schedules"',
  'app.put("/api/schedules/:id"',
  'app.delete("/api/schedules/:id"',
  'app.post("/api/schedules/move-batch"',
  'app.post("/api/schedules/import"',
  'app.post("/api/schedules/replace-instructor"',
  'app.post("/api/schedules/copy"',
  'app.post("/api/schedules/:id/exceptions"',
  'app.delete("/api/schedules/:id/exceptions/:exceptionId"',
]) {
  const at = server.indexOf(door);
  /* وجسمُ المسار ينتهي عند المسار الذي يليه: نافذةٌ ثابتةُ الطول تبتلع حارسَ
     جارِه، فيمرّ بابٌ مفتوحٌ على أنه محروس. */
  const next = server.indexOf("\napp.", at + 1);
  const body = server.slice(at, next > at ? next : server.length);
  check(at > 0 && body.includes("scheduleLockRefusal(req,"), `${door} يمرّ بالحارس`);
}

/* ── ويُقال قبل المحاولة، لا بعدها ────────────────────────────────────── */

/* من يكتشف المنعَ عند الحفظ يكون قد أعاد بناءَ موعدٍ كاملاً في نموذجٍ لن
   يُقبل. */
check(workspace.includes("const termFrozen = useMemo(() => {")
  && workspace.includes("return term?.AdTermClosed === true && !committeeEligible;"),
  "والشاشةُ تقرأ القاعدةَ نفسَها التي يقرؤها الخادم");
/* ── ولا تقرؤها من صفةٍ يُسقط إليها الغياب ──────────────────────────────
 * `signatureStage` تسقط إلى «لجنة» حين لا تُعرف الصفة، والخادمُ لا يقبل ذلك.
 * فلو بُني الشريطُ عليها لما رآه صاحبُ حسابٍ بلا صفةٍ مكتوبة — وحسابُ الإدارة
 * الجذر منهم — ثم يُردّ عند الحفظ بلا أن يفهم لماذا: منعٌ بلا تفسير. */
check(server.includes("committeeEligible: isAcademicRole(user?.Role) && signatureStage(user?.Role) === \"committee\","),
  "والخادمُ يرسل الصفةَ المكتوبةَ صريحةً، لا يتركها تُستنتج");
check(workspace.includes("committeeEligible = false,"),
  "والشاشةُ تفترض الأسوأ حين لا تصلها، فتُحذّر ولا تسكت");
check(workspace.includes('data-tone="frozen"') && workspace.includes("انتهى هذا الفصل."),
  "وتقولها قبل أن يُبنى موعدٌ لن يُحفظ");
/* ولا يُخفى شيء: القراءةُ والطباعةُ والاستعلامُ كما هي. */
check(workspace.includes('<b>لجنةُ الجدول</b>'),
  "وتقول من يعمل فيه، فلا يبحث القارئُ عمّن يسأل");

/* ── ويُقال السببُ الحقيقيُّ أولاً ────────────────────────────────────────
 * كان تعديلُ موعدٍ في فصلٍ مجمَّدٍ يُردّ برسالةٍ عن حقلٍ ناقصٍ أو تعارضٍ في
 * قاعة، فيُصلح القارئُ ما ليس بعطل ثم يُردّ ثانيةً بالسبب الحقيقيّ. والرسالةُ
 * الأولى ليست خطأً في ذاتها، لكنها تُرسله في طريقٍ لا يُوصل. */
const editDoor = server.slice(
  server.indexOf('app.put("/api/schedules/:id"'),
  server.indexOf('app.delete("/api/schedules/:id"'),
);
check(editDoor.indexOf("const frozenSource = await scheduleLockRefusal(")
  < editDoor.indexOf("الرجاء إدخال الحقول المطلوبة بالأحمر"),
  "وقفلُ الصفّ القائم يُسأل قبل التحقّق من الحقول");
check(editDoor.indexOf("const frozenSource = await scheduleLockRefusal(")
  < editDoor.indexOf("يوجد تعارض يمنع التعديل"),
  "وقبل التحقّق من التعارضات");
/* وقفلُ النطاق المنقول إليه يبقى بعدُ، فهو لا يُعرف قبل قراءة حقول الوجهة. */
check(editDoor.includes("const editLock = await scheduleLockRefusal(req,collegeId, sectionId, termId);"),
  "ويبقى قفلُ الوجهة في موضعه، فلا يُقرأ قبل أن تُعرف");

/* ── ودورةُ رغبات الأساتذة تتبع التجميدَ كلَّها ────────────────────────────
 *
 * الجدولُ محروس، لكنّ الدورةَ التي تكتب فيه كانت تمرّ بجانبه: تُصدَر عشرون
 * رابطاً، ويفتحها أصحابُها ويكتبون رغباتهم ويرسلونها، ثم لا يستطيع القسمُ
 * تثبيتَ شيءٍ منها. فيقف الجميعُ ينتظرون قراراً لا يمكن أن يقع — وهو أسوأُ من
 * بابٍ لا يُفتح، لأن أحداً لا يعرف أنه مغلق.
 */
const issueDoor = server.slice(
  server.indexOf('app.post("/api/instructor-requests/issue"'),
  server.indexOf('app.get("/api/instructor-requests"'),
);
check(issueDoor.includes("const issueLock = await scheduleLockRefusal(req, collegeId, sectionId, termId, { registrarLock: false });"),
  "فلا تُصدَر روابطُ رغباتٍ على فصلٍ مجمَّد");
/* والحارسُ قبل إنشاء الروابط، لا بعده: رابطٌ أُنشئ ثم رُدّ الطلبُ يبقى في
   المخزن ويصل صاحبَه. */
check(issueDoor.indexOf("const issueLock") < issueDoor.indexOf("createShareLink"),
  "ويُسأل قبل أن يُنشأ رابطٌ واحد");

const decideDoor = server.slice(
  server.indexOf('app.post("/api/instructor-requests/:id/decide"'),
  server.indexOf('app.post("/api/public/request/:token"'),
);
check(decideDoor.includes("const decideLock = await scheduleLockRefusal("),
  "ولا يُثبَّت طلبٌ ولا يُرفض على فصلٍ مجمَّد");

/* والأستاذُ يُقال له بلفظٍ يخصّه: هو لا يعرف «لجنة الجدول» ولا شأنَ له بها،
   وإنما يحتاج أن يعرف أن البابَ أُغلق وأن عليه مراجعة قسمه. */
const publicDoor = server.slice(
  server.indexOf('app.post("/api/public/request/:token"'),
  server.indexOf("function instructorRequestPage"),
);
check(publicDoor.includes("closedTerm?.AdTermClosed === true"),
  "ولا يُقبل إرسالُ أستاذٍ على فصلٍ مجمَّد، ولو كانت نافذتُه مفتوحةً بتاريخها");
check(publicDoor.includes("راجع قسمك إن كان لديك ما يلزم."),
  "ويُقال له بلفظٍ يخصّه، لا بلفظٍ عن لجنةٍ لا شأنَ له بها");

/* ── وبطاقة الأستاذ تتبع الفصل التشغيلي نفسه ───────────────────────────── */
check(termSequence.includes("return term.AdTermClosed === true;")
  && !termSequence.includes("return termHasEnded(term"),
  "والإغلاق الصريح هو الحقيقة الوحيدة للقراءة فقط");
check(server.includes("liveTermId: currentTermId(terms as any)")
  && !server.includes("liveTermId: link.AdTermId"),
  "ورابطٌ قديم لا يجعل فصله جارياً في بطاقة الأستاذ");
check(server.includes("Number(card.termId) !== Number(card.liveTermId)")
  && server.includes("هذا الفصل للاطلاع فقط. اختر الفصل الجاري للإبلاغ."),
  "والخادم يرفض الإبلاغ من فصل سابق ولو جرى استدعاء المسار مباشرة");
check(server.indexOf("var live = Boolean(d.liveTermId)") < server.indexOf("var starts=[];d.byDay"),
  "وتُحسب حالة الفصل قبل بناء أزرار الإبلاغ في البطاقة");
check(server.includes("termId: Number(d.termId || 0)")
  && server.includes("termId: liveTermId"),
  "والإبلاغ يحمل الفصل المعروض بينما اشتراك التقويم يتبع الفصل الجاري");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
