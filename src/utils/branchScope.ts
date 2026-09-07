import { officialCollegeSitePrefix, officialSiteLabel } from "./locationCollegePrefixes";

/**
 * ── الفرع مكان، لا كلية أخرى ───────────────────────────────────────────────
 *
 * كلية التربية الأساسية تدرّس القسم الواحد — تكنولوجيا التعليم مثلاً — في ثلاثة
 * مواقع: المقر الرئيسي، والجهراء، والفحيحيل. النظام يسجّل كل موقع ككلية مستقلة،
 * ولكل واحدة قسمها بالرمز نفسه. والجدول المعتمد يصدر من الجامعة ملفاً واحداً
 * يحوي المواقع الثلاثة معاً.
 *
 * فالسؤال الذي يحله هذا الملف: هذا الصف — بحسب المبنى الذي كُتب بجانبه — إلى أي
 * قسم في أي موقع ينتمي؟ الجواب موجود في كود المبنى نفسه: 012B و012F و012J هي
 * مواقع الفرع 012، وأول ثلاثة أرقام هي الفرع. لا حقل جديد في الجدول، ولا هجرة
 * بيانات: الانتماء كان مكتوباً في الكود طوال الوقت، وهذا يقرؤه فقط.
 *
 * القاعدة الحاكمة هنا هي القاعدة نفسها التي يستعملها قارئ الـ PDF: اختلاف
 * الموقع داخل الفرع الواحد أمر مشروع، واختلاف الفرع (011 بنين مقابل 012 بنات)
 * ليس كذلك.
 */

export interface BranchCollege { AdCollegeId: number; AdCollegeName: string }
export interface BranchSection { AdSectionId: number; AdCollegeId: number; AdSectionCode: string; AdSectionName?: string }

/** الفرع: الأرقام الثلاثة الأولى من بادئة الموقع. 012B و012J و012F ⇦ 012. */
export const branchRootOf = (sitePrefix: unknown): string =>
  String(sitePrefix ?? "").toUpperCase().replace(/\D/g, "").slice(0, 3);

/** بادئة الموقع الرسمية لكلية بعينها، أو "" إن لم يكن لها كود مثبت. */
export function collegeSitePrefix(colleges: readonly BranchCollege[], collegeId: number): string {
  const college = colleges.find(item => Number(item.AdCollegeId) === Number(collegeId));
  return String(officialCollegeSitePrefix(college?.AdCollegeName) || "").toUpperCase();
}

/** فرع الكلية المفتوحة، للمقارنة مع فرع المبنى المقروء. */
export const collegeBranchRoot = (colleges: readonly BranchCollege[], collegeId: number): string =>
  branchRootOf(collegeSitePrefix(colleges, collegeId));

export interface BranchScope {
  /** بادئة الموقع كما قرأها المستند: 012B / 012F / 012J. */
  sitePrefix: string;
  /** اسم الموقع كما يُكتب للقارئ. */
  siteLabel: string;
  collegeId: number;
  collegeName: string;
  sectionId: number;
  sectionName: string;
  /** صحيح للموقع الذي فُتح منه الاستيراد. */
  isBase: boolean;
}

/**
 * الموقع ⇦ القسم الشقيق فيه.
 *
 * القسم نفسه يحمل الرمز نفسه في المواقع الثلاثة، فالمطابقة برمز القسم يقين لا
 * تخمين. وإذا لم يوجد للموقع كلية مسجلة، أو لم يوجد فيها قسم بالرمز نفسه، فلا
 * يُخمَّن شيء: تعود undefined ويُبلَّغ المستخدم باسم الموقع صراحةً.
 */
export function resolveBranchScope(
  sitePrefix: string,
  context: {
    colleges: readonly BranchCollege[];
    sections: readonly BranchSection[];
    baseCollegeId: number;
    baseSectionId: number;
  },
): BranchScope | undefined {
  const prefix = String(sitePrefix || "").toUpperCase();
  const baseSection = context.sections.find(item => Number(item.AdSectionId) === Number(context.baseSectionId));
  const basePrefix = collegeSitePrefix(context.colleges, context.baseCollegeId);
  if (!prefix || !baseSection) return undefined;

  if (prefix === basePrefix) {
    const college = context.colleges.find(item => Number(item.AdCollegeId) === Number(context.baseCollegeId));
    return {
      sitePrefix: prefix,
      siteLabel: officialSiteLabel(prefix, college?.AdCollegeName),
      collegeId: Number(context.baseCollegeId),
      collegeName: String(college?.AdCollegeName || ""),
      sectionId: Number(context.baseSectionId),
      sectionName: String(baseSection.AdSectionName || ""),
      isBase: true,
    };
  }

  // موقع آخر يجب أن يكون داخل الفرع نفسه؛ فرع مختلف ليس شأن هذا الاستيراد.
  if (!basePrefix || branchRootOf(prefix) !== branchRootOf(basePrefix)) return undefined;

  const college = context.colleges.find(item => collegeSitePrefix(context.colleges, item.AdCollegeId) === prefix);
  if (!college) return undefined;

  const code = String(baseSection.AdSectionCode || "").trim();
  const siblings = context.sections.filter(item =>
    Number(item.AdCollegeId) === Number(college.AdCollegeId) &&
    String(item.AdSectionCode || "").trim() === code && code !== "");
  if (siblings.length !== 1) return undefined;

  return {
    sitePrefix: prefix,
    siteLabel: officialSiteLabel(prefix, college.AdCollegeName),
    collegeId: Number(college.AdCollegeId),
    collegeName: String(college.AdCollegeName || ""),
    sectionId: Number(siblings[0].AdSectionId),
    sectionName: String(siblings[0].AdSectionName || ""),
    isBase: false,
  };
}

/** كل مواقع الفرع التي يملك هذا القسم نظيراً له فيها — الأساس أولاً. */
export function siblingBranchScopes(context: {
  colleges: readonly BranchCollege[];
  sections: readonly BranchSection[];
  baseCollegeId: number;
  baseSectionId: number;
}): BranchScope[] {
  const basePrefix = collegeSitePrefix(context.colleges, context.baseCollegeId);
  if (!basePrefix) return [];
  const prefixes = [...new Set(context.colleges
    .map(college => collegeSitePrefix(context.colleges, college.AdCollegeId))
    .filter(prefix => prefix && branchRootOf(prefix) === branchRootOf(basePrefix)))];
  const scopes = prefixes.map(prefix => resolveBranchScope(prefix, context)).filter(Boolean) as BranchScope[];
  return scopes.sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.sitePrefix.localeCompare(b.sitePrefix));
}

export interface BranchGroup<Row> { scope: BranchScope; rows: Row[] }
export interface BranchSplit<Row> {
  groups: BranchGroup<Row>[];
  /** صفوف لم يُعرف موقعها أو لا نظير لقسمها فيه — لا تُنشر ولا تُحذف بصمت. */
  unplaced: Array<{ sitePrefix: string; siteLabel: string; rows: Row[] }>;
}

/**
 * توزيع صفوف مستند واحد على مواقعها.
 *
 * الصف بلا بادئة موقع — صف قديم أو أُدخل يدوياً — يبقى في الموقع الذي فُتح منه
 * الاستيراد؛ فالافتراض الوحيد الآمن هو المكان الذي يقف فيه المستخدم.
 */
export function splitRowsByBranch<Row extends { sourceSitePrefix?: string }>(
  rows: readonly Row[],
  context: {
    colleges: readonly BranchCollege[];
    sections: readonly BranchSection[];
    baseCollegeId: number;
    baseSectionId: number;
  },
): BranchSplit<Row> {
  const basePrefix = collegeSitePrefix(context.colleges, context.baseCollegeId);
  const groups = new Map<string, BranchGroup<Row>>();
  const unplaced = new Map<string, { sitePrefix: string; siteLabel: string; rows: Row[] }>();

  for (const row of rows) {
    const prefix = String(row.sourceSitePrefix || "").toUpperCase() || basePrefix;
    const scope = resolveBranchScope(prefix, context);
    if (!scope) {
      const entry = unplaced.get(prefix) || { sitePrefix: prefix, siteLabel: officialSiteLabel(prefix), rows: [] };
      entry.rows.push(row); unplaced.set(prefix, entry);
      continue;
    }
    const key = `${scope.collegeId}:${scope.sectionId}`;
    const group = groups.get(key) || { scope, rows: [] };
    group.rows.push(row); groups.set(key, group);
  }

  return {
    groups: [...groups.values()].sort((a, b) => Number(b.scope.isBase) - Number(a.scope.isBase) || a.scope.sitePrefix.localeCompare(b.scope.sitePrefix)),
    unplaced: [...unplaced.values()],
  };
}
