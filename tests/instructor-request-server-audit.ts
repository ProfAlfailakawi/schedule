/**
 * ── تدقيق دورة طلب الأستاذ في الخادم ────────────────────────────────────────
 *
 * ما يلي حدودٌ اتُّفق عليها صراحةً، وكلُّ واحدٍ منها من النوع الذي لا يُكتشف
 * خرقُه بالنظر إلى الشاشة: قاعةٌ تسرّبت إلى صفحة الأستاذ تبدو سطراً عادياً،
 * وقرارٌ مسجّلٌ بلا أثرٍ في الجدول يبدو قراراً ناجحاً، ورابطٌ يفتح جدولَ غيره
 * يبدو رابطاً يعمل. فتُثبَّت هنا نصّاً، لأن الاختبار الحيّ لا يمرّ على كل
 * مسارٍ في كل تعديل.
 *
 * وهو تدقيقُ مصدرٍ لا تدقيقُ سلوك: يقول «القاعدة مكتوبة»، ولا يقول «جُرّبت».
 * والسلوكُ نفسُه جُرّب حيّاً على خادمٍ يعمل ببيانات تجريبية، وما لم يُجرَّب
 * منه مذكورٌ في وصف طلب الدمج بلا تجميل.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const types = fs.readFileSync(path.join(process.cwd(), "src/types.ts"), "utf8");
const repo = fs.readFileSync(path.join(process.cwd(), "src/db/repository.ts"), "utf8");
const inbox = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
const verdictSource = fs.readFileSync(path.join(process.cwd(), "src/utils/instructorRequestVerdict.ts"), "utf8");

/* ── المسارات ───────────────────────────────────────────────────────────── */

check(server.includes('app.post("/api/instructor-requests/issue"'), "إصدارُ الروابط له مسار");
check(server.includes('app.get("/api/instructor-requests"'), "وارِدُ القسم له مسار");
check(server.includes('app.post("/api/instructor-requests/:id/decide"'), "قرارُ القسم له مسار");
check(server.includes('app.get("/api/public/request/:token"'), "بابُ الأستاذ يُقرأ");
check(server.includes('app.post("/api/public/request/:token"'), "ويُرسَل منه");
check(server.includes('app.post("/api/public/request/:token/check"'), "والموضعُ يُفحص قبل الإرسال");
check(server.includes('app.get("/r/:token"'), "وللأستاذ صفحةٌ يفتحها من هاتفه");

/* ── الرابطُ هو الهويّة ─────────────────────────────────────────────────── */

check(server.includes('if (link.kind !== "request")'), "رابطٌ من نوعٍ آخر لا يفتح طلباً");
check(server.includes("link.revoked"), "ورابطٌ موقوفٌ لا يُفتح");
check(server.includes("انتهت صلاحية هذا الرابط"), "ورابطٌ انتهت مدّتُه لا يُفتح");
check(server.includes("getInstructorRequestByLink"), "والطلبُ يُقرأ بالرابط، لا برقمٍ يُرسله صاحبُه");
/* أخطرُ ما في بابٍ بلا حساب: أن يُرسَل معرّفُ موعدٍ لا يخصّ صاحبَ الرابط. */
check(server.includes("أحد المواعيد ليس ضمن جدولك."), "وموعدٌ ليس ضمن الطلب يُردّ ولو أُرسل معرّفُه");
check(server.includes("هذا الموعد ليس ضمن جدولك."), "وكذلك في الفحص، لا في الإرسال وحده");
check(server.includes("المقرّر المضاف ليس من كتالوج قسمك في الكلية المختارة."), "والمقرّر المضاف يجب أن يكون من كتالوج القسم في الكلية المختارة");
check(!server.includes('app.get("/api/public/request/:token", requireAuth'), "ولا حسابَ يُطلب: الرابطُ هو المفتاح");

/* ── القاعةُ لا تغادر ──────────────────────────────────────────────────── */

check(server.includes("function stripForInstructor"), "تجريدُ ما لا يخصّ الأستاذ في دالّةٍ واحدة");
check(server.includes("const { roomCandidates, ...rest } = item;"), "والمرشّحاتُ تُنزع نزعاً، لا تُستثنى بالنسيان");
check(/after: rest\.after \? \{ \.\.\.rest\.after, room: undefined \}/.test(server),
  "و«طلب» لا تحمل قاعةً أبداً");
check(server.includes("stripForInstructor(await judgeRequestItems(request))"), "والقراءةُ تمرّ بالتجريد");
check(server.includes("stripForInstructor(saved)"), "والإرسالُ كذلك — لا مخرجَ بلا تجريد");
/* مسارُ الفحص يخاطب صفحةَ الأستاذ أيضاً، فلا يُرسل مرشّحاته. */
check(!/\/check[\s\S]{0,3000}roomCandidates: verdict\.roomCandidates/.test(server),
  "ومسارُ الفحص لا يرسل مرشّحاتِ القاعات");

/* ── الحكمُ يُعاد حسابُه في الخادم ─────────────────────────────────────── */

check(server.includes("async function judgeRequestItems"), "الحكمُ يُبنى في الخادم");
check(server.includes("const judged = await judgeRequestItems({ ...resolved.request, items });"),
  "ويُعاد بناؤه على ما وصل، لا يُقبل ما يصحبه");
check(server.includes('item.verdict === "conflict"') && server.includes("itemIndex: blocked"),
  "وما مُنع لا يُقبل، ويُقال أيُّ بندٍ هو");
check(server.includes("اكتب سبب الاستثناء"), "والاستثناءُ بلا حجّةٍ ليس استثناءً");
check(server.includes("windowOpen: open") || server.includes("windowOpen: requestWindowOpen"),
  "والنافذةُ تُقاس بالخادم لا بساعة المتصفّح");
check(server.includes("انتهت مدّة استقبال الطلبات لهذا الفصل."), "وخارجَها لا يُقبل إرسال");

/* ── «ثُبّت» لا تُقال إلا إذا وقعت ─────────────────────────────────────── */

check(server.includes("الجدول لا يطابق ما طُلب بعد."), "قرارُ التثبيت يُصدَّق بالجدول نفسه");
check(server.includes("لم يُحذف الموعد من الجدول بعد."), "والحذفُ يُصدَّق بغياب الصفّ");
check(server.includes("await Repository.getScheduleById(Number(item.rowId))"),
  "والتصديقُ قراءةٌ حيّة، لا لقطةٌ قد تكون شاخت");
/* الشاشةُ ترتّب الخطوتين، لكنها ليست الحارس: نداءٌ مباشرٌ كان يكتب «ثُبّت»
   والجدولُ لم يتحرّك، فيقرأ الأستاذ أن طلبه نُفِّذ وهو لم يُنفَّذ. */
check(server.includes('if (state === "fixed" && item.action !== "add")'),
  "والحارسُ في الخادم، لا في الشاشة وحدها");
/* والإضافةُ لا صفَّ سابقاً لها يُطابَق، فتُصدَّق بوجود الصفّ الذي أنتجه
   الحفظُ نفسُه — ولولا ذلك لقال السجلُّ «ثُبّت» بلا أن يُخلق شيء. */
check(server.includes('if (state === "fixed" && item.action === "add")'),
  "والإضافةُ لها حارسُها: يُسأل عن الصفّ الذي أنتجه الحفظ");
check(server.includes("لم يُحفظ الموعد الجديد بعد."), "فبلا صفٍّ لا يُسجَّل تثبيت");
check(server.includes("الموعد المحفوظ ليس هو المطلوب في هذا البند أو موقعه."),
  "وصفٌّ لأستاذٍ آخرَ أو فصلٍ آخرَ لا يُغلق به بند");
check(server.includes("اختر سبب الرفض."), "والرفضُ بلا سببٍ مرفوض");
check(server.includes('allowedReasons'), "والأسبابُ قائمةٌ مغلقةٌ تُعدّ عبر الفصول");

/* ── لا يُكتب في الجدول من هنا ─────────────────────────────────────────── */

const decideRoute = server.slice(
  server.indexOf('app.post("/api/instructor-requests/:id/decide"'),
  server.indexOf('app.get("/api/public/request/:token"')
);
check(decideRoute.length > 200, "مسارُ القرار مقروءٌ للتدقيق");
check(!/Repository\.(createSchedule|updateSchedule|deleteSchedule)\b/.test(decideRoute),
  "ومسارُ القرار لا يكتب في الجدول: التثبيتُ يمرّ بمسار الحفظ نفسه");
check(inbox.includes('`/api/schedules/${item.rowId}`') && inbox.includes('method: "PUT"'),
  "والشاشةُ تستدعي مسارَ الحفظ الحقيقي، فترث تحقّقَه وتقريرَ تغييراته");
/* والإضافةُ لا تُثبَّت من الوارد: قاعةٌ وشعبةٌ ليستا من اختيار الأستاذ. وكانت
   تقف عند رسالةٍ تقول «افتحها في الورشة»، فصارت تحمله إليها ومعه ما قاله —
   والضمانُ نفسُه مُبرهنٌ سلوكياً في `request-handoff-audit`. */
check(inbox.includes("putHandoff({") && inbox.includes('onNavigate?.("schedules")'),
  "والإضافةُ تُحمل إلى الورشة ومعها ما قاله الأستاذ");
check(inbox.includes('item.action === "add" ? "أضِفه الآن" : "ثبّت"'),
  "والزرُّ يقول ما سيفعل، فلا يَعِد بتثبيتٍ لا يقع");

/* ── النطاق ────────────────────────────────────────────────────────────── */

check((server.match(/isScopeAllowed\(req, collegeId, sectionId\)/g) || []).length >= 2,
  "ولا يُصدر ولا يُقرأ وارِدُ قسمٍ خارج نطاق الحساب");
/* النطاقُ نطاقُ البند نفسه: محاضرةٌ في كليةٍ أخرى يقرّر فيها منسّقُ تلك الكلية. */
check(server.includes("const itemScope = requestItemScope(stored, item);")
  && server.includes("if (!isScopeAllowed(req, itemScope.collegeId, itemScope.sectionId)) {"),
  "ولا يُقرَّر في بندٍ خارج النطاق");
check(server.includes("تاريخ الإغلاق في الماضي."),
  "ونافذةٌ انتهت قبل أن تبدأ تُردّ: رابطٌ مغلقٌ بلا سببٍ يُعيد الأستاذ إلى الهاتف");

/* ── السجلّ ────────────────────────────────────────────────────────────── */

check(types.includes("export interface InstructorRequest"), "للطلب كيانٌ معرَّف");
check(types.includes("ليس مخزناً موازياً للجدول"), "ومكتوبٌ فيه أنه ليس مخزناً موازياً");
check(types.includes("InstructorRequestEvent"), "وله خطٌّ زمنيٌّ يقرؤه صاحبُه");
check(repo.includes('collection("instructorRequests")'), "وله مجموعةٌ في المخزن");
check(repo.includes("getInstructorRequestByLink"), "تُقرأ بالرابط");

/* ── صفحةُ الأستاذ ─────────────────────────────────────────────────────── */

const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.get("/r/:token"'));
check(page.includes("مسودة · غير معتمدة · لا تُعتبر تكليفاً"),
  "الصفحةُ تحمل حالتَها: الصورةُ تُرسل وتُقرأ اعتماداً إن لم تحملها");
check(page.includes("@media print"), "وتبقى الحالةُ في الطباعة");
/* الكلمةُ العامة مسموحة بطلب صاحب النظام («قاعة وليس مكان»): «لا تتوفّر قاعة»
   و«تغيّرت القاعة» لا تكشفان قاعةً بعينها. أمّا اسمُ القاعة ورمزُها فممنوعان. */
check(!/قاعة|AdRoomCode|AdRoomHall|roomCandidates/.test(page
    .replace(/مدّةُ المحاضرة/g, "")
    .replace(/لا تتوفّر قاعة في هذا الوقت/g, "")
    .replace(/تغيّرت القاعة/g, "")),
  "ولا اسمَ قاعةٍ في الصفحة كلها");
check(page.includes("ينتهي ") && page.includes("مدّةُ المحاضرة من اللائحة"),
  "والنهايةُ تُعرض محسوبةً ولا تُسأل");
check(page.includes('fetch("/api/public/request/"+encodeURIComponent(TOKEN)+"/check"'),
  "والحكمُ يُسأل عنه الخادمُ عند كل تغيير");
check(page.includes('id="openChooser"') && page.includes('id="courseSearch"')
  && page.includes("data.courses.map(function(c)"),
  "والإضافةُ تبدأ بزرٍ واضح ثم قائمة مقرّرات القسم القابلة للبحث");
check(page.includes("+ اختر كلية ومقررًا وأضف موعدًا") && page.includes('class="course-option"'),
  "وإضافةُ الموعد لا تبدأ بقائمة هاتفٍ مبهمة، بل بخياراتٍ كبيرة واضحة");
check(page.includes('data-tab="schedule"') && page.includes('data-tab="activity"')
  && page.includes("function activityHtml(r)"),
  "وللأستاذ تبويبان واضحان: العمل على الجدول وسجل الحركة التفصيلي");
check(page.includes('actionName(it.action)') && page.includes('requestedText(it)')
  && page.includes('decision.state==="fixed"') && page.includes('decision.state==="rejected"'),
  "وسجل الحركة يشرح الإضافة والتعديل والحذف وقرار القسم على كل بند");
check(page.includes('var blocked=state.filter(function(it){return it.tone==="bad"||it.tone==="checking"}).length')
  && page.includes("عالج الموانع قبل الإرسال"),
  "ومؤشر الجاهزية يمنع الإرسال المرئي ما دام الفحص جارياً أو وجد مانعاً");
check(page.includes('days:(it.action==="change"||it.action==="add")?(it.slots||[]).map(function(s){return s.day}):[]')
  && page.includes('decision:it.decision||null'),
  "والطلب المحفوظ يعود بأيامه ووقته وقراراته، فلا يختفي تفصيل الحركة عند إعادة فتح الرابط");
check(page.includes('it.action!=="change"&&it.action!=="add"')
  && page.includes('courseId:it.action==="add"?it.courseId:undefined'),
  "والإضافةُ تُفحص كتعديل الوقت نفسه وتُرسل بهوية المقرر");
check(server.includes('const action = req.body?.action === "add" ? "add" : "change"')
  && server.includes("const candidate = rowFromRequest(requested, base as any)"),
  "وفحصُ الإضافة في الخادم يبني الصفَّ المطلوب ويفحصه، لا يغيّر اسم العملية فقط");
check(server.includes("allowed = (await instructorRequestCourseOptions(resolved.request)).some")
  && server.includes("option.collegeId === selectedCollegeId")
  && server.includes("option.sectionId === selectedSectionId"),
  "وفحص الإضافة الحي يطابق المقرر والكلية والقسم قبل الحكم");
check(server.includes("async function instructorRequestSectionCourses")
  && server.includes("Repository.getCoursesBySection(sectionId)")
  && server.includes("Repository.getOperationalCourseIds(sectionId)")
  && server.includes("instructorRequestSectionCourses(scope.sectionId)"),
  "وبطاقة الأستاذ تقرأ كتالوج القسم الكامل مباشرة، ثم تستبعد المؤرشف أكاديمياً فقط");
check(server.includes("async function refreshUnsubmittedInstructorRequest"),
  "والطلب غير المرسل يتجدد من الجدول الحي");
const requestCourseOptionsSource = server.slice(
  server.indexOf("async function instructorRequestCourseOptions"),
  server.indexOf("async function buildRequestContext", server.indexOf("async function instructorRequestCourseOptions")),
);
check(requestCourseOptionsSource.includes("instructorRequestSectionCourses(scope.sectionId)")
  && !requestCourseOptionsSource.includes("authorityDraftForScope")
  && !requestCourseOptionsSource.includes("authorityBaselineForScope"),
  "وقائمة الإضافة تأتي كاملةً من الكتالوج التشغيلي لكل كلية بلا إعادة بناء التاريخ عند فتح الرابط");
check(server.includes("const [courses, allowedCourseOptions] = await Promise.all([")
  && server.includes("const allowedCourseMap = new Map")
  && server.includes("selectedCollegeId")
  && server.includes("selectedSectionId"),
  "والإرسال يتحقق من المقرر والكلية والقسم باستخدام الخيارات نفسها التي تعتمد عليها الصفحة");
check(page.includes('placeholder="12 رقمًا"') && page.includes("— 12 رقمًا —"),
  "والرقم المدني يُشرح بالأرقام الإنجليزية المتفق عليها");

/* بطاقةُ الأستاذ للقراءة؛ بابُ التعديل الكامل يظهر كتَبويبٍ واحدٍ حين يكون
   للقسم رابطُ طلبٍ فعّال، بدلاً من زر «أبلغ القسم» تحت كل محاضرة. */
const staffPage = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
check(!staffPage.includes("أبلغ القسم") && !staffPage.includes("فهمت التغييرات"),
  "بطاقةُ الأستاذ خاليةٌ من زر الإبلاغ ومن إقرار «فهمت» المتكرر");
check(staffPage.includes("حركة الجدول") && staffPage.includes("function renderRequests(d)"),
  "وفيها تبويبُ حركة الجدول وبابُ طلب التعديل الكامل");
check(staffPage.includes('ar-KW-u-nu-latn') && staffPage.includes("friendlyDate(m.at,true)"),
  "وتواريخ الحركة تُعرض مفهومة وبأرقام إنجليزية، لا كسلسلة ISO خام");
check(server.includes("requestLinks,") && server.includes("Repository.getInstructorRequests"),
  "وبطاقةُ الأستاذ تصل إلى دورة الطلب الموجودة أصلاً، لا نموذجٍ موازٍ جديد");


/* ── الحزمةُ تُقاس على نفسها ────────────────────────────────────────────── */

/* الحكمُ يُقاس على ما سيكون لا على ما هو كائن: حزمةٌ تنقل محاضرتين إلى الساعة
   نفسها لا تصطدم إحداهما بالأخرى في الجدول القديم، لأن أيّاً منهما لم تكن
   هناك بعد. فتُبنى صفوفُ الأستاذ بعد الطلب مرّةً واحدةً ثم يُقاس كلُّ بندٍ
   عليها. */
check(server.includes("const rowsAfter: any[] = instructorRows.filter") && server.includes("instructorRowsAfter: rowsAfter"),
  "جدولُ الأستاذ بعد الحزمة يُبنى ويُقاس عليه، لا على الجدول القديم");
check(server.includes("const instructorRows = context.allRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));")
  && verdictSource.includes("rows: context.instructorRowsAfter"),
  "وقاعدة المحاضرات المتتالية تُقاس على جدول صاحب الرابط وحده، لا على زملائه");
check(server.includes('if (item.action === "delete") continue;'),
  "والمحذوفُ يغيب عن الأسبوع الجديد");
/* إضافتان بلا معرّفٍ كانتا صفّاً واحداً في نظر محرّك التعارض، فيتخطّى
   المقارنةَ بينهما ويُجيز الاثنتين على الساعة نفسها. */
check(server.includes("const tempIdFor = (index: number) => -(index + 1);"),
  "وكلُّ إضافةٍ تأخذ هويّةً مؤقّتةً فريدةً في حزمتها");
check(server.includes("id: item.rowId ?? tempIdFor(index)") && server.includes("tempId: tempIdFor(index)"),
  "والهويّةُ نفسُها تُستعمل في الصفّ وفي الحكم، فلا يفترقان");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
