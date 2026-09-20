/**
 * ── الأدوار الأكاديمية ──────────────────────────────────────────────────────
 *
 * صلاحيات هذا النظام مبنيّة منذ عشر سنوات على «الشاشة»: صفٌّ في FormSecurity
 * يربط حساباً برقم شاشة، ومن ملك الرقم ملك كل ما في الشاشة — يقرأ ويضيف ويعدّل
 * ويحذف. لا وجود فيها لمفهوم «قراءة فقط»، ولذلك لم يكن بالإمكان إعطاء العميد
 * حساباً إلا بإعطائه قدرة التعديل نفسها.
 *
 * فهذا الملف يضيف بُعداً واحداً فوق ما هو قائم — لا بديلاً عنه: «الدور». الدور
 * يقول من هو صاحب الحساب في الكلية، ومنه يشتقّ النظام ثلاثة أشياء بلا تدخّل
 * يدوي: هل يكتب أم يقرأ، وأي شاشات تُفتح له، وما نطاقه من الكليات والأقسام.
 *
 * والمصدر واحد للطرفين — الخادم والواجهة — عمداً: حارس الخادم هو الحماية
 * الحقيقية، وإخفاء الأزرار في الواجهة مجاملة بصرية لا أكثر، فلا يجوز أن
 * يفترقا في تعريف الدور نفسه.
 */

export type AcademicRole =
  | "dean"            // عميد الكلية
  | "viceDean"        // العميد المساعد للشؤون الأكاديمية
  | "registrarDean"   // عميد التسجيل
  | "registrarHead"   // رئيس التسجيل
  | "registrarStaff"  // موظف التسجيل
  | "departmentHead"  // رئيس القسم العلمي
  | "committeeChair"  // رئيس لجنة الجدول في القسم
  | "standard";       // مستخدم عادي — سلوك النظام قبل هذه الإضافة

/** كيف يُملأ نطاق الحساب عند اختيار دوره، بدل التعيين قسماً قسماً. */
export type RoleScopeMode =
  | "college"       // كلية واحدة كاملة: صفٌّ واحد بقسم صفر
  | "allColleges"   // كل الكليات، بما يُضاف منها لاحقاً
  | "section"       // كلية وقسم، كما هو الحال اليوم
  | "manual";       // بلا قالب — يعيّنه المدير بنفسه

export interface AcademicRoleDefinition {
  id: AcademicRole;
  /** الاسم كما يُقرأ في الشاشة وفي التقرير المطبوع. */
  label: string;
  /** سطر واحد يشرح للمدير ما الذي يفتحه هذا الدور، قبل أن يحفظ. */
  hint: string;
  /**
   * القراءة فقط: يُرفض كل طلب كتابة من هذا الدور على الخادم، مهما كانت
   * الشاشات الممنوحة له، ومهما فُعل بالواجهة. الاستثناءات الوحيدة هي مسارات
   * دورة الاعتماد نفسها (الملاحظة، التوقيع، الإرجاع، القبول) لأنها ليست
   * تعديلاً على بيانات الجدول.
   */
  readOnly: boolean;
  /** أرقام الشاشات التي تُمنح تلقائياً عند اختيار الدور. */
  formIds: number[];
  scopeMode: RoleScopeMode;
  /** الشاشة التي يفتح عليها الحساب مباشرة بعد الدخول. */
  landing: "balance" | "changes" | "schedules" | "dashboard";
  /** ترتيب العرض في قائمة الاختيار: من الأعلى إدارياً إلى الأدنى. */
  order: number;
}

/**
 * الشاشات المُشتقّة من الدور.
 *
 * 2 الكليات · 3 الأساتذة · 4 الأقسام · 5 الفصول · 6 المقررات · 7 الجداول ومركز
 * الذكاء · 8 استعلام الأساتذة · 9 استعلام القاعات · 10 استعلام الأوقات ·
 * 11 المستخدمون · 12 الصلاحيات · 14 تقرير القسم · 15 النطاقات · 16 القاعات
 * والأوقات · 17 البحث المتقدم.
 */
const QUERY_INSTRUCTOR = 8, QUERY_ROOM = 9, QUERY_TIME = 10, REPORT_DEPARTMENT = 14, QUERY_ROOM_TIME = 16, QUERY_ADVANCED = 17;
const SCHEDULE_WORKSPACE = 7;

export const ACADEMIC_ROLES: AcademicRoleDefinition[] = [
  {
    id: "dean",
    label: "عميد الكلية",
    hint: "يرى كليته كاملة بلا تعديل: ميزان الأقسام وعدالة الحمل والمنتدبون.",
    readOnly: true,
    formIds: [REPORT_DEPARTMENT],
    scopeMode: "college",
    landing: "balance",
    order: 1,
  },
  {
    id: "viceDean",
    label: "العميد المساعد للشؤون الأكاديمية",
    hint: "ما يراه العميد، وفوقه الأساتذة والقاعات والقاعات × الأوقات. بلا تعديل.",
    readOnly: true,
    formIds: [REPORT_DEPARTMENT, QUERY_INSTRUCTOR, QUERY_ROOM, QUERY_ROOM_TIME],
    scopeMode: "college",
    landing: "balance",
    order: 2,
  },
  {
    id: "registrarDean",
    label: "عميد التسجيل",
    hint: "كل الكليات، قراءة فقط: ميزان الأقسام وحالة التسليم والوارد.",
    readOnly: true,
    formIds: [REPORT_DEPARTMENT],
    scopeMode: "allColleges",
    landing: "balance",
    order: 3,
  },
  {
    id: "registrarHead",
    label: "رئيس التسجيل",
    hint: "كل الكليات: ملاحظات وقبول وإرجاع، ويضع موعد التسليم ويمدّده.",
    readOnly: true,
    formIds: [REPORT_DEPARTMENT, QUERY_INSTRUCTOR, QUERY_ROOM, QUERY_ROOM_TIME],
    scopeMode: "allColleges",
    landing: "changes",
    order: 4,
  },
  {
    id: "registrarStaff",
    label: "موظف التسجيل",
    hint: "الكليات المعيّنة له: ملاحظات وقبول وإرجاع، بلا موعد ولا تمديد.",
    readOnly: true,
    formIds: [REPORT_DEPARTMENT, QUERY_ROOM],
    scopeMode: "manual",
    landing: "changes",
    order: 5,
  },
  {
    id: "departmentHead",
    label: "رئيس القسم العلمي",
    hint: "جدول قسمه قراءةً: ملاحظات وتوقيع واعتماد الإضافات، بلا تعديل.",
    readOnly: true,
    formIds: [SCHEDULE_WORKSPACE, REPORT_DEPARTMENT],
    scopeMode: "section",
    landing: "schedules",
    order: 6,
  },
  {
    id: "committeeChair",
    label: "رئيس لجنة الجدول",
    hint: "يبني جدول القسم ويعدّله ويرسله للتسجيل — سلوك النظام المعتاد.",
    readOnly: false,
    formIds: [SCHEDULE_WORKSPACE, REPORT_DEPARTMENT, QUERY_INSTRUCTOR, QUERY_ROOM, QUERY_TIME, QUERY_ROOM_TIME, QUERY_ADVANCED],
    scopeMode: "section",
    landing: "schedules",
    order: 7,
  },
  {
    id: "standard",
    label: "مستخدم عادي",
    hint: "يعدّل الجدول، وتُعيَّن شاشاته ونطاقه يدوياً. ليست هذه صفةَ تجريدٍ من الصلاحيات — لسحب القدرة على التعديل اختر صفةً للاطّلاع.",
    readOnly: false,
    formIds: [SCHEDULE_WORKSPACE],
    scopeMode: "manual",
    landing: "dashboard",
    order: 8,
  },
];

const ROLE_BY_ID = new Map<AcademicRole, AcademicRoleDefinition>(ACADEMIC_ROLES.map(role => [role.id, role]));

/**
 * الدور الافتراضي لكل حساب سبق وجوده.
 *
 * كل الحسابات القائمة اليوم تبني الجداول وترسلها، فهي «رئيس لجنة» بالتعريف.
 * وهذا هو الترحيل الذي يضمن أن يوم التحديث لا يغيّر سلوك أحد.
 */
export const DEFAULT_MIGRATION_ROLE: AcademicRole = "committeeChair";

export function isAcademicRole(value: unknown): value is AcademicRole {
  return typeof value === "string" && ROLE_BY_ID.has(value as AcademicRole);
}

/** الدور المعرَّف، أو «رئيس لجنة» لحسابٍ لم يُعطَ دوراً بعد. */
export function roleDefinition(value: unknown): AcademicRoleDefinition {
  if (isAcademicRole(value)) return ROLE_BY_ID.get(value)!;
  return ROLE_BY_ID.get(DEFAULT_MIGRATION_ROLE)!;
}

export function roleLabel(value: unknown): string {
  return roleDefinition(value).label;
}

/**
 * هل يُمنع هذا الدور من الكتابة؟
 *
 * تُقرأ على الخادم قبل كل طلب تغيير، وفي الواجهة لإخفاء الأزرار. المرجع واحد
 * حتى لا تقول الشاشة شيئاً ويقول الخادم غيره.
 */
export function isReadOnlyRole(value: unknown): boolean {
  return roleDefinition(value).readOnly;
}

/** أدوار التسجيل: تكتب الملاحظات وتقبل وتُرجع، ولا تمسّ صفاً واحداً. */
export function isRegistrarRole(value: unknown): boolean {
  const id = roleDefinition(value).id;
  return id === "registrarHead" || id === "registrarStaff" || id === "registrarDean";
}

/** من يملك وضع موعد التسليم وتمديده: رئيس التسجيل وحده. */
export function canManageDeadline(value: unknown): boolean {
  return roleDefinition(value).id === "registrarHead";
}

/** من يملك الملاحظة والقبول والإرجاع على الوارد. */
export function canReviewSubmissions(value: unknown): boolean {
  const id = roleDefinition(value).id;
  return id === "registrarHead" || id === "registrarStaff";
}

/** من يوقّع، وبأي ترتيب: اللجنة أولاً ثم رئيس القسم. */
export function signatureStage(value: unknown): "committee" | "head" | null {
  const id = roleDefinition(value).id;
  if (id === "committeeChair") return "committee";
  if (id === "departmentHead") return "head";
  return null;
}

/** أدوار العرض الصرف: لا تكتب شيئاً البتّة، ولا حتى ملاحظة. */
export function isViewerOnlyRole(value: unknown): boolean {
  const id = roleDefinition(value).id;
  return id === "dean" || id === "viceDean" || id === "registrarDean";
}
