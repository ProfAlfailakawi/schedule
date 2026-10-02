/**
 * ── تحويل أستاذ بين «منتدب» و«معيّن» ─────────────────────────────────────────
 *
 * الانتداب ليس صفةً للشخص: هو اسمٌ في دليل منتدبي قسمٍ (دائم، والقسم عائلةٌ
 * عبر كلياته) واسمٌ في روستر فصلٍ لذلك القسم. فالتحويل خطةُ تعديلاتٍ على هذه
 * السجلات وحدها — لا يمسّ جدولاً، ولا روستر فصلٍ مضى (التاريخ لا يُمحى).
 *
 * دالةٌ نقية يستعملها الخادم (للتنفيذ) والواجهة (للمعاينة والتأكيد).
 */

export type ConversionScope = { collegeId: number; sectionId: number };

export type ConversionRequest =
  | { direction: "toAppointed"; instructorId: number; scopes: ConversionScope[] }
  | { direction: "toVisiting"; instructorId: number; scopes: ConversionScope[]; termId?: number };

export type ConversionState = {
  /** أين هو في أدلة المنتدبين الآن (صفوف الأعضاء كما هي، قبل الاتحاد). */
  directory: ConversionScope[];
  /** رواستر الفصول التي فيها اسمه. */
  rosters: Array<ConversionScope & { termId: number }>;
  /** الفصول التي سبقت الجاري: رواسترها لا تُكتب أبداً. الجاري والقادمة قابلةٌ للكتابة. */
  pastTermIds: number[];
  /** الفصول الموجودة (لرفض فصلٍ مجهول). */
  knownTermIds: number[];
  /** مفتاح العائلة؛ الافتراضي القسم نفسه. */
  familyOf?: (collegeId: number, sectionId: number) => string;
};

export type ConversionChange =
  | { kind: "directory-remove" | "directory-add"; collegeId: number; sectionId: number }
  | { kind: "roster-remove" | "roster-add"; collegeId: number; sectionId: number; termId: number };

export type ConversionPlan = { changes: ConversionChange[]; errors: string[] };

const valid = (n: unknown) => Number.isInteger(Number(n)) && Number(n) > 0;

export function planVisitingConversion(request: ConversionRequest, state: ConversionState): ConversionPlan {
  const errors: string[] = [];
  const changes: ConversionChange[] = [];
  const family = state.familyOf || ((c: number, s: number) => `${c}:${s}`);
  if (!valid(request?.instructorId)) return { changes, errors: ["معرّف الأستاذ غير صالح."] };
  const scopes = Array.isArray(request.scopes) ? request.scopes : [];
  if (scopes.some(s => !valid(s?.collegeId) || !valid(s?.sectionId))) return { changes, errors: ["قسمٌ أو كليةٌ غير صالحة في الطلب."] };
  if (!scopes.length) {
    return { changes, errors: [request.direction === "toVisiting"
      ? "اختر الكلية والقسم الذي ينتدب إليه قبل التحويل."
      : "اختر قسماً واحداً على الأقل يُرفع منه الانتداب."] };
  }
  const past = new Set(state.pastTermIds.map(Number));
  const known = new Set(state.knownTermIds.map(Number));
  const dirFamilies = new Set(state.directory.map(d => family(d.collegeId, d.sectionId)));

  if (request.direction === "toVisiting") {
    if (scopes.length !== 1) errors.push("الانتداب يكون إلى قسمٍ واحد في كل مرة.");
    const termId = Number(request.termId || 0);
    if (!termId) errors.push("اختر الفصل الذي ينتدب فيه قبل التحويل.");
    else if (!known.has(termId)) errors.push("الفصل المختار غير موجود.");
    else if (past.has(termId)) errors.push("لا يُكتب روستر فصلٍ مضى؛ اختر الفصل الحالي أو فصلاً قادماً.");
    if (errors.length) return { changes: [], errors };
    const { collegeId, sectionId } = scopes[0];
    const key = family(collegeId, sectionId);
    if (!dirFamilies.has(key)) changes.push({ kind: "directory-add", collegeId, sectionId });
    if (!state.rosters.some(r => r.termId === termId && family(r.collegeId, r.sectionId) === key))
      changes.push({ kind: "roster-add", collegeId, sectionId, termId });
    if (!changes.length) errors.push("هو منتدبٌ لهذا القسم في هذا الفصل بالفعل.");
    return { changes, errors };
  }

  if (request.direction !== "toAppointed") return { changes, errors: ["اتجاه التحويل غير معروف."] };
  const writable = state.knownTermIds.map(Number).filter(t => !past.has(t)).sort((x, y) => x - y);
  const seen = new Set<string>();
  for (const { collegeId, sectionId } of scopes) {
    const key = family(collegeId, sectionId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!dirFamilies.has(key)) { errors.push("الأستاذ ليس في دليل منتدبي أحد الأقسام المختارة."); continue; }
    changes.push({ kind: "directory-remove", collegeId, sectionId });
    for (const termId of writable) {
      if (state.rosters.some(r => r.termId === termId && family(r.collegeId, r.sectionId) === key))
        changes.push({ kind: "roster-remove", collegeId, sectionId, termId });
    }
  }
  return errors.length ? { changes: [], errors } : { changes, errors };
}

/** نصٌّ عربي لكل تعديل، للمعاينة وللملخص. */
export function describeConversionChange(change: ConversionChange, label: (c: number, s: number) => string, termName: (t: number) => string = t => String(t)): string {
  const where = label(change.collegeId, change.sectionId);
  switch (change.kind) {
    case "directory-remove": return `يُرفع من دليل منتدبي ${where}`;
    case "directory-add": return `يُضاف إلى دليل منتدبي ${where}`;
    case "roster-remove": return `يُرفع من روستر ${where} للفصل ${termName(change.termId)}`;
    case "roster-add": return `يُضاف إلى روستر ${where} للفصل ${termName(change.termId)}`;
  }
}
