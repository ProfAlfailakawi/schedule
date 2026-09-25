/**
 * ── تدقيق الوثيقة الرسمية وفلترة العدسات ────────────────────────────────────
 *
 * الوثيقة الشاملة هي ما يُحفظ في الملف ويُرجع إليه بعد شهور. وخطأٌ فيها ليس
 * خطأً في شاشة: هو ورقةٌ تدّعي اعتماداً لم يقع، أو نسخةٌ غير معتمدة تنتشر بلا
 * ما يُميّزها فتُبنى عليها قرارات.
 *
 * ولأن هذه كلها جافاسكربت داخل مكوّن طباعةٍ لا يُصيَّر في اختبار، فالتدقيق
 * هنا على المصدر: يثبت أن كل قاعدةٍ اتُّفق عليها مكتوبةٌ حيث ينبغي أن تكون،
 * وأن ما لا ينبغي أن يُكتب لم يُكتب.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
const printCss = fs.readFileSync(path.join(process.cwd(), "src/styles/08-print.css"), "utf8");
const approvalCss = fs.readFileSync(path.join(process.cwd(), "src/styles/11-approval.css"), "utf8");
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");

/* ── التواقيع في الوثيقة ────────────────────────────────────────────────── */

check(reports.includes("function PrintSignatures"), "خانات التوقيع مكوّنٌ واحد، لا نسختان تفترقان");
check(!reports.includes('<div><span>توقيع رئيس لجنة الجدول</span><i /></div>'),
  "الخانات الفارغة الثابتة أُزيلت: لم يبقَ مصدران للتوقيع");
check(reports.includes("verifyCode"), "رمز التحقّق يُطبع على الورقة");
check(reports.includes("رمز التحقّق"), "الرمز يُسمّى بالعربية لمن يقرأ الورقة");
check(reports.includes("وقّع مع علمه بـ"),
  "العلم بالملاحظات اللائحية يُطبع مع التوقيع: اللائحة لا تمنع، ولا تُنسى");

/* خانة العميد: قرارٌ صريح بألّا يملأها النظام. */
const slots = reports.slice(reports.indexOf("SIGNATURE_SLOTS"), reports.indexOf("SIGNATURE_SLOTS") + 500);
check(slots.includes('stage: "dean"'), "خانة العميد باقيةٌ كما جرى العرف الورقي");
check(reports.includes('slot.stage === "dean" ? undefined'),
  "النظام لا يملأ خانة العميد: العميد يطّلع ولا يوقّع، فلا يُدّعى عنه شيء");

/* ── نسخة غير معتمدة ───────────────────────────────────────────────────── */

check(reports.includes("نسخة غير معتمدة"), "الوثيقة غير المعتمدة تقول عن نفسها ذلك");
check(reports.includes('approval && approval.status !== "accepted"'),
  "العلامة تظهر لكل حالٍ غير المعتمد، لا للمسودة وحدها");
check(printCss.includes(".print-unapproved-mark"), "العلامة لها نمطُ طباعة");
check(/\.print-unapproved-mark\{[^}]*position:absolute/.test(printCss.replace(/\s+/g, "")) === false
   || printCss.includes("inset:0 !important"), "العلامة تغطّي الصفحة لا ركناً منها");
check(printCss.includes("rgba(151,60,56,.085)"),
  "العلامة باهتةٌ خلف الجدول: علامةٌ تُفسد القراءة تدفع الناس إلى طباعةٍ من مكانٍ آخر");

/* العلامة على كل صفحة: أهمّ ما في هذا الباب.
   وتُقاس داخل الشامل وحده، لا بأوّل ذكرٍ لها في الملفّ: صار للورقة غلافٌ يحمل
   العلامة لكلِّ أوراق الاستعلام، وهو يسبق الشاملَ في الملفّ ولا يُغني عن
   علامتِه المكرّرة في كل صفحة. */
const pagesLoopAt = reports.indexOf("pages.map((pageRows, pageIndex)");
const pageMarkAt = reports.indexOf("print-unapproved-mark", pagesLoopAt);
check(pagesLoopAt !== -1 && pageMarkAt > pagesLoopAt,
  "العلامة داخل حلقة الصفحات: صفحةٌ واحدة تخرج بلا علامةٍ تُبطل الاحتياط كله");
/* وكلُّ ورقةٍ سواه تحملها من غلافها. */
check(reports.indexOf("print-unapproved-mark") < pagesLoopAt,
  "وأوراقُ الاستعلام تحملها من غلافها قبل ذلك");

/* ── ملحق التغييرات ────────────────────────────────────────────────────── */

check(reports.includes("function PrintChangesAppendix"), "ملحق التغييرات مكوّنٌ قائم");
check(reports.includes("printComprehensiveWithChanges"), "الوثيقتان تُطبعان معاً بأمرٍ واحد");
check(reports.includes("مع ملحق التغييرات"), "الخيار مسمّى في القائمة");
check(printCss.includes("break-before:page"), "الملحق يبدأ صفحةً جديدة، فلا يُقرأ امتداداً للجدول");
check(reports.includes("setChangesAppendix(null)"),
  "الملحق يُرفع بعد الطباعة: الضغطة التالية على الشامل وحده لا تُخرج ورقةً لم تُطلب");

/* أمر الطباعة يجب أن يخرج من ضغطة الإصبع نفسها — وهذا عطبٌ عانى منه النظام. */
const combineAt = reports.indexOf("const printComprehensiveWithChanges");
const combineBody = reports.slice(combineAt, combineAt + 1800);
/* الترتيب داخل الدالّة: القراءة تنتهي، ثم يُطلب الطبع. والقياس على آخر نداءِ
   طباعةٍ لا أوّله — فأوّلُه شرطُ خروجٍ مبكّر حين لا نطاق، لا مسارَ الحالة. */
check(combineBody.indexOf("await fetch") < combineBody.lastIndexOf('printReport("comprehensive")'),
  "الشبكة تنتهي قبل أن يبدأ الطبع: قراءةٌ بين الضغطة والأمر تجعل المتصفّح يتجاهله");
check(combineBody.indexOf("setAppendixBusy(false)") < combineBody.lastIndexOf('printReport("comprehensive")'),
  "ولا يبقى الزرّ معطّلاً بعد خروج الأمر");
check(combineBody.includes("catch") && combineBody.includes("printReport"),
  "فشلُ الملحق لا يمنع الشامل: تقريرٌ ناقص خيرٌ من تقريرٍ لا يخرج");

/* ── حال الاعتماد تُقرأ مسبقاً ─────────────────────────────────────────── */

check(reports.includes("const [printApproval, setPrintApproval]"), "حال الاعتماد محفوظةٌ في الشاشة");
check(reports.includes(".catch(() => setPrintApproval(null))"),
  "فشلُ قراءة الحال يُطبع الوثيقة بخاناتٍ فارغة، لا يمنع الطباعة");

/* ── عمود الاعتماد في ميزان الأقسام ────────────────────────────────────── */

check(reports.includes('{ key: "approval", label: "الاعتماد" }'), "عمود الاعتماد مضافٌ للميزان");
check(reports.includes("approvals ? [{ key:"), "العمود لا يظهر حين لا تُقرأ الحالات: لا عمودٌ فارغ");
check(reports.includes("APPROVAL_ORDER"), "الفرز بالحال لا بالاسم");
check(reports.includes("late: 0"), "«متأخّر» أوّل الفرز: أعجلُ ما في الجدول");
check(reports.includes("/api/approvals/term?"), "الحالات تُقرأ بنداءٍ واحد للفصل كله");
check(reports.includes('if (lens !== "balance" || !filters.termId) { setTermApprovals(null); return; }'),
  "لا تُقرأ الحالات إلا في عدسة الميزان: من ينظر في القاعات لا شأن له بها");
check(approvalCss.includes(".balance-approval"), "الخلية لها نمط");

/* ── الميزان مفتوحٌ للعمداء، محكومٌ بالنطاق ────────────────────────────── */

const balanceAt = server.indexOf('app.get("/api/reports/department-balance"');
const balanceHead = server.slice(balanceAt, balanceAt + 220);
check(!balanceHead.includes("requirePowerAdmin"), "الميزان لم يعد مقصوراً على الإدارة الرئيسية");
check(balanceHead.includes("requirePermission(14)"), "وصلاحية تقرير القسم ما زالت شرطاً");
const balanceBody = server.slice(balanceAt, balanceAt + 2000);
check(balanceBody.includes("if (!isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))) continue;"),
  "النطاق يُطبَّق على التجميع: قسمٌ خارج النطاق لا تتسرّب أعدادُه إلى المجاميع");

/* ── العدسات بحسب الصفة ────────────────────────────────────────────────── */

check(reports.includes("const ROLE_LENSES"), "قائمة العدسات بحسب الصفة معرَّفة");
const roleLensBlock = reports.slice(reports.indexOf("const ROLE_LENSES"), reports.indexOf("const ROLE_LENSES") + 700);
check(/dean:\s*\["list", "week", "balance"/.test(roleLensBlock), "العميد يفتح على الجداول المعتمدة نفسها، ثم ميزان الأقسام");
check(/registrarHead:\s*\["balance"/.test(roleLensBlock), "رئيس التسجيل يفتح على الميزان أيضاً");
check(!roleLensBlock.includes("committeeChair"), "لجنة الجدول ترى القائمة كاملةً كما كانت قبل هذه الإضافة");
check(!roleLensBlock.includes("standard:"), "المستخدم العادي كذلك: التقصير لمن عُرف ما يريد، لا عقوبةٌ تُعمَّم");
check(reports.includes("setLens(shownLenses[0].id)"),
  "عدسةٌ محفوظة من صفةٍ سابقة تُردّ إلى المتاح، لا تُعرض شاشةٌ فارغة بلا سبب");
check(reports.includes("roleId?: string;"), "الصفة تصل الشاشة");
check(app.includes("roleId={sessionRole.id}"), "والتطبيق يمرّرها");

/* ── كل صفةٍ تفتح على شاشتها ───────────────────────────────────────────── */

check(app.includes('if (role.landing === "changes") return "scheduleChanges";'), "التسجيل يفتح على الوارد");
check(app.includes('if (role.landing === "balance") return "reportDepartment";'), "العميد يفتح على ميزان الأقسام");
check(app.includes('if (role.landing === "schedules") return "schedules";'), "القسم يفتح على جدوله");
/* والشاشة الافتتاحية تصمد أمام إعادة التحميل: أكثرُ ما يفعله الناس ليس تسجيلَ
   دخول، هو فتحُ صفحةٍ محفوظة أو ضغطُ زرّ التحديث. */
check(app.includes("if (!viewByPath.has(window.location.pathname.toLowerCase())) {"),
  "وتُطبَّق عند استعادة الجلسة لا عند الدخول وحده");
check(app.includes("const landing = landingViewFor(restoredRole);"),
  "ومن فتح عنواناً بعينه أراده، فلا يُنقل عنه");
/* الشاشة تُفتح لمن يقرّر فيها أو يعلّق أو يطّلع عليها — لا لمن يقرّر وحده.
   فعميدُ التسجيل سؤالُه هو الوارد نفسه، ورئيسُ القسم يعلّق فيه. */
check(app.includes("const opensChangesScreen ="),
  "أيقونة تغييرات الجدول لمن يشارك في الدورة: شاشةٌ لا يفعل فيها صاحبها شيئاً ضجيجٌ في القائمة");
check(app.includes("role.canReview || role.watchesInbox || role.canAnnotate || Boolean(role.signatureStage)"),
  "والمشاركةُ ثلاثةُ أبواب: قرارٌ أو تعليقٌ أو اطّلاع");
/* «للاطّلاع» تعني أنه لا يكتب، لا أنه لا يعمل: رئيسُ القسم صفةٌ للاطّلاع،
   لكنّ توقيعه لا يقع إلا في شاشة الجدول. */
check(app.includes("allowed.schedule && !sessionRole.viewerOnly"),
  "مركز الذكاء يُخفى عن العرض الصرف وحده، لا عن كل صفةٍ للاطّلاع");

const bar = fs.readFileSync(path.join(process.cwd(), "src/components/ApprovalBar.tsx"), "utf8");
/* أخطرُ ما وقع في الواجهة: الجدولُ المُرجَع كان يخرج عند أول حالةٍ برسالةٍ بلا
   زرّ، فتقف الدورة عند جولتها الأولى — لا لخللٍ في قاعدة، بل لأن الزرّ لم
   يُرسم في ذلك الفرع. */
check(bar.includes('status === "returned" ? "إعادة الإرسال إلى التسجيل"'),
  "الجدول المُرجَع يُعاد إرساله من الشريط نفسه بعد معالجة الملاحظات");
check(!bar.includes('if (status === "returned") {'),
  "ولا خروجَ مبكّرٌ يترك حالاً بلا فعل: الخبرُ فوق والفعلُ تحت دائماً");
check(bar.includes("const readyToSubmit ="), "وشرطُ الإرسال محسوبٌ مرّةً لكل الحالات");
check(bar.includes("refreshSignal"), "والشريط يسمع ما يقع في الجدول تحته");

/* ── شروطُ الشريط تُطابق شروطَ الخادم حرفاً بحرف ────────────────────────────
 *
 * كل شرطٍ في الخادم لا يقابله شرطٌ في الشريط يُنتج أحدَ خطأين: زرٌّ يُرفض
 * دائماً، أو فعلٌ يقبله الخادم ولا يجد له الناظرُ زرّاً. والثاني أخطر — لأن
 * الأول يُخبر صاحبَه، والثاني يقف صامتاً.
 */
const signGates = ["!mine", "!locked", "hasRows", 'signatureStage === "committee" || Boolean(committee)'];
for (const gate of signGates) {
  check(bar.includes(gate), `شرطُ التوقيع يقابل شرط الخادم: ${gate}`);
}
check(bar.includes("openNotes === 0") && bar.includes("pendingAdditions === 0") && bar.includes("!pastDeadline"),
  "وشرطُ الإرسال يقابل شروطه الثلاثة: لا ملاحظةً معلّقة، ولا إضافةً تنتظر، ولا موعداً انقضى");
check(bar.includes("const firstSubmission = Number(approval.currentRound || 0) === 0;"),
  "والموعدُ يمنع التسليم الأول وحده، كما في الخادم: الجولات تمرّ");
check(bar.includes("انقضى موعد التسليم — يلزم تمديدٌ من رئيس التسجيل"),
  "ويُقال السببُ في مكان الزرّ لا بعد ضغطه");

/* السحب متاحٌ حتى يُرسَل: من وقّع خطأً لا يُترك بلا مخرجٍ إلا الإرسال. */
/* ولا بعد القبول (R1): السحبُ على جدولٍ معتمد كان يُسقطه صامتاً إلى الإعداد. */
check(bar.includes("{mine && !locked && !accepted ? (") && !bar.includes("mine && !readyToSubmit && !locked"),
  "وسحبُ التوقيع متاحٌ حتى الإرسال، لا حتى يوقّع الطرفُ الآخر");
check(bar.includes("readyToSubmit && (signatureStage || powerAdmin)"),
  "والإدارة الرئيسية تُرسل حيث يسمح الخادم");
check(bar.includes("{committee || head ? ("),
  "والتواقيع تُعرض حين يكون الجدول عند التسجيل: هي اللحظة التي يُسأل فيها «مَن وقّع؟»");
check(bar.includes("headMustAcknowledge ? \"أُضيفت شُعبٌ بعد اعتمادك\""),
  "وما يُطلب من الناظر يتقدّم على ما يُخبَر به");
check(bar.includes("بتاريخ ${arabicDate(round.acceptedAt)} — ` : \"\"}أيُّ تعديلٍ"),
  "ولا شرطةَ شاردةً حين يغيب التاريخ");

const changes = fs.readFileSync(path.join(process.cwd(), "src/components/ScheduleChanges.tsx"), "utf8");
check(changes.includes("setReport(null);\n      setError(e.message);"),
  "وتقريرٌ أخفقت قراءتُه لا يبقى معروضاً تحت رأس قسمٍ آخر");
check(changes.includes("setShowRounds(false);") && changes.includes("}, [scope.collegeId, scope.sectionId, termId]);"),
  "وتبدّلُ القسم يُفرغ ما قبله قبل أن تصل القراءة");
check(changes.includes("}, [term.AdTermId]);"),
  "ورسالةُ «محفوظ» لا يمحوها الحفظُ نفسه");

const reportsSrc = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
check(reportsSrc.includes("setChangesAppendix(null);\n    };"),
  "وملحقُ التغييرات يُرفع عند انتهاء الطباعة حقّاً، لا بمؤقّت");
check(!reportsSrc.includes("window.setTimeout(() => setChangesAppendix(null), 1500)"),
  "فنزعُه أثناء المعاينة يُسقطه من المطبوع");
check(reportsSrc.includes('if (sort.key === "approval" && !approvals) onSort({ key: "rows", desc: true });'),
  "وفرزٌ على عمودٍ زال يعود إلى عمودٍ قائم، فلا يُعرض ترتيبٌ لا يُنسب إلى أحد");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
