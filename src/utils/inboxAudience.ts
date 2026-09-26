/**
 * ── لمن يُرسم الوارد، وبأيّ عُدّة ──────────────────────────────────────────
 *
 * شاشةُ «تغييرات الجدول» واحدةٌ لكل الصفات، وكانت تقرّر ما تعرضه شرطاً شرطاً في
 * مواضع متفرّقة — فلوحةُ «مواعيد التسليم» (لوحةُ رئيس التسجيل) لم يكن عليها
 * شرطُ صفةٍ أصلاً، فرآها حسابُ قسمٍ علميٍّ في ثلاث عشرة كليةً: «سلّم 0 من 13
 * قسماً» و«لم يُحدَّد آخر موعد…» — شاشةُ التسجيل في حساب القسم.
 *
 * فالقرارُ هنا وحده، لكل صفة:
 *   - `deadlinesPanel`: «edit» لمن يضع الموعد (رئيس التسجيل والإدارة)، و«read»
 *     لمن يراقب التسجيل أو الكلية (موظّف التسجيل، عميد التسجيل، العميد،
 *     العميد المساعد)، و null للقسم (رئيس القسم، رئيس اللجنة، المستخدم
 *     العادي) — فالقسمُ يرى سطرَ موعده وحده في شريط الاعتماد («موعدكم»).
 *   - `registrarSignals`: إشاراتُ القرار التي تخصّ التسجيل («ردودٌ تنتظر
 *     قرارك»)، ومرشّحاتُها.
 *   - `extendActions`: أزرار «تمديد / استثناء / نظر الطلب» في سطر الوارد.
 *   - `rowLabel`: «college» حين يكون الحسابُ قسماً واحداً في مواقع عدّة، فيُقرأ
 *     كل سطرٍ باسم كليته/فرعه، لا باسم القسم نفسه مكرّراً ثلاث عشرة مرّة.
 *
 * كل موضعٍ في الواجهة يسأل هذه الدالة، ولا يكتب شرطه بنفسه (tests/role-scope-audit.ts).
 */
import { roleDefinition } from "./academicRoles";
import { AR, countOf, oblique } from "./arabicCount";

export interface ScopeRowLike {
  AdCollegeId?: number | string;
  AdSectionId?: number | string;
  AdSectionName?: string;
  AdCollegeName?: string;
  AdCollegeWide?: boolean;
}

/** اسمُ القسم مجرّداً مما يختلف بين كليةٍ وأخرى في كتابته. */
export function departmentNameKey(name: unknown): string {
  return String(name ?? "")
    .replace(/[ً-ْـ]/g, "")      // تشكيلٌ وتطويل
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^\s*قسم\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MultiSiteDepartment {
  /** اسمُ القسم كما كُتب في أول صفّ. */
  name: string;
  /** عددُ الكليات/الفروع التي يُدرَّس فيها. */
  sites: number;
}

/**
 * قسمٌ واحدٌ في مواقع عدّة؟
 *
 * نطاقٌ صفوفُه كلُّها بقسمٍ حقيقي (لا «الكلية كلها»)، في كليتين فأكثر، وكلُّ
 * أقسامه اسمٌ واحد — كحساب «الدراسات الإسلامية» في ثلاث عشرة كليةً وفرعاً.
 * ويُعيد null لكل ما سوى ذلك (قسمٌ في كليةٍ واحدة، أو أقسامٌ مختلفة).
 */
export function multiSiteDepartment(scopes: ScopeRowLike[] = []): MultiSiteDepartment | null {
  const rows = (Array.isArray(scopes) ? scopes : [])
    .filter(row => Number(row?.AdCollegeId || 0));
  if (!rows.length) return null;
  if (rows.some(row => row.AdCollegeWide || !Number(row.AdSectionId || 0))) return null;
  const names = new Set(rows.map(row => departmentNameKey(row.AdSectionName)));
  if (names.size !== 1 || names.has("")) return null;
  const sites = new Set(rows.map(row => Number(row.AdCollegeId))).size;
  if (sites < 2) return null;
  return { name: String(rows[0].AdSectionName || "").trim(), sites };
}

/** «قسمك في 13 موقعاً» — العنوانُ الذي يقوله الوارد لقسمٍ متعدّد المواقع. */
export function multiSiteHeadline(dept: MultiSiteDepartment): string {
  return `قسمك في ${countOf(dept.sites, oblique(AR.site))}`;
}

export interface InboxAudience {
  /** لوحةُ «مواعيد التسليم»: تحرير، أو قراءة، أو لا لوحة. */
  deadlinesPanel: "edit" | "read" | null;
  /** إشاراتُ التسجيل ومرشّحاتُه («ردودٌ تنتظر قرارك»). */
  registrarSignals: boolean;
  /** «تمديد / استثناء / نظر الطلب» في سطر الوارد. */
  extendActions: boolean;
  /** بماذا يُسمّى سطرُ الوارد. */
  rowLabel: "section" | "college";
  /** القسمُ المتعدّد المواقع إن كان — للعنوان. */
  multiSite: MultiSiteDepartment | null;
  /** أيُعامَل القارئُ قسماً (يرى نفسه) لا مراجِعاً (يرى الأقسام). */
  department: boolean;
}

/**
 * القرارُ الواحد: ما يراه كلُّ دورٍ من عُدّة الوارد.
 *
 * @param role        الصفة كما تصل من الخادم.
 * @param powerAdmin  الإدارةُ الرئيسية — يقبل الخادمُ منها الموعدَ واستثناءاته.
 * @param scopes      صفوفُ نطاق القارئ (لمعرفة القسم المتعدّد المواقع).
 */
export function inboxAudience(role: unknown, { powerAdmin = false, scopes = [] as ScopeRowLike[] } = {}): InboxAudience {
  const id = roleDefinition(role).id;
  if (powerAdmin) {
    return { deadlinesPanel: "edit", registrarSignals: true, extendActions: true, rowLabel: "section", multiSite: null, department: false };
  }
  switch (id) {
    case "registrarHead":
      return { deadlinesPanel: "edit", registrarSignals: true, extendActions: true, rowLabel: "section", multiSite: null, department: false };
    case "registrarStaff":
    case "registrarDean":
      return { deadlinesPanel: "read", registrarSignals: true, extendActions: false, rowLabel: "section", multiSite: null, department: false };
    case "dean":
    case "viceDean":
      /* العميدان يريان شريطَ الموعد قراءةً في ميزان الأقسام، ولا يفتحان الوارد. */
      return { deadlinesPanel: "read", registrarSignals: false, extendActions: false, rowLabel: "section", multiSite: null, department: false };
    default: {
      /* رئيسُ القسم ورئيسُ اللجنة والمستخدمُ العادي: قسمٌ يرى نفسه. */
      const multiSite = multiSiteDepartment(scopes);
      return { deadlinesPanel: null, registrarSignals: false, extendActions: false, rowLabel: multiSite ? "college" : "section", multiSite, department: true };
    }
  }
}
