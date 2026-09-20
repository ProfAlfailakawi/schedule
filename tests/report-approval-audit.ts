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

/* العلامة على كل صفحة: أهمّ ما في هذا الباب. */
const pageMarkAt = reports.indexOf("print-unapproved-mark");
const pagesLoopAt = reports.indexOf("pages.map((pageRows, pageIndex)");
check(pageMarkAt > pagesLoopAt && pagesLoopAt !== -1,
  "العلامة داخل حلقة الصفحات: صفحةٌ واحدة تخرج بلا علامةٍ تُبطل الاحتياط كله");

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
check(/dean:\s*\["balance"/.test(roleLensBlock), "العميد يفتح على ميزان الأقسام: أوّل ما في القائمة هو الجواب");
check(/registrarHead:\s*\["balance"/.test(roleLensBlock), "رئيس التسجيل يفتح على الميزان أيضاً");
check(!roleLensBlock.includes("committeeChair"), "لجنة الجدول ترى القائمة كاملةً كما كانت قبل هذه الإضافة");
check(!roleLensBlock.includes("standard:"), "المستخدم العادي كذلك: التقصير لمن عُرف ما يريد، لا عقوبةٌ تُعمَّم");
check(reports.includes("setLens(shownLenses[0].id)"),
  "عدسةٌ محفوظة من صفةٍ سابقة تُردّ إلى المتاح، لا تُعرض شاشةٌ فارغة بلا سبب");
check(reports.includes("roleId?: string;"), "الصفة تصل الشاشة");
check(app.includes("roleId={sessionRole.id}"), "والتطبيق يمرّرها");

/* ── كل صفةٍ تفتح على شاشتها ───────────────────────────────────────────── */

check(app.includes('role.landing === "changes" ? "scheduleChanges"'), "التسجيل يفتح على الوارد");
check(app.includes('role.landing === "balance" ? "reportDepartment"'), "العميد يفتح على ميزان الأقسام");
check(app.includes('role.landing === "schedules" ? "schedules"'), "القسم يفتح على جدوله");
check(app.includes("sessionRole.canReview || sessionRole.signatureStage ? ("),
  "أيقونة تغييرات الجدول لمن يشارك في الدورة: شاشةٌ لا يفعل فيها صاحبها شيئاً ضجيجٌ في القائمة");
check(app.includes("allowed.schedule && !sessionRole.readOnly"),
  "مركز الذكاء يُخفى عن صفات الاطّلاع: أدواتُ بناءٍ لمن لا يبني");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
