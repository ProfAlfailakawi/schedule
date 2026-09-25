/**
 * ── نطاق القراءة: قرارٌ واحد، معزولاً عن الخادم ─────────────────────────────
 *
 * «أيرى هذا الحسابُ هذا القسم؟» سؤالٌ يُجيب عنه `isScopeAllowed` في الخادم،
 * وهو وحده الحَكَم. لكنّ مساراتٍ كثيرة كانت تبني جوابها الخاص بجانبه: تجمع
 * أرقام الأقسام من صفوف النطاق مباشرةً، فيسقط صفُّ «الكلية كلها» (قسم صفر)
 * ويرى العميدُ شاشةً فارغة؛ أو تأخذ القسمَ والكلية من الطلب كما جاءا، فيقرأ
 * رئيسُ لجنةٍ مسوّداتِ قسمٍ ليس له.
 *
 * هذا الملفّ لا يكتب قاعدةَ نطاقٍ ثانية. يأخذ الحَكَم نفسه دالّةً (`allowed`)
 * ويشتقّ منه ما تحتاجه المسارات: قائمةُ الأقسام المقروءة، وهل تُغطّى كليةٌ
 * كاملة، وأيُّ سياقٍ يُقرأ حين لا يحدّده الطلب. فلا يفترق ما يُختبر عمّا
 * يُنفَّذ، ولا تفترق قاعدةٌ عن أختها.
 */

export type ScopePredicate = (collegeId: number, sectionId: number) => boolean;

export interface ScopeSection {
  AdSectionId: number;
  AdCollegeId: number;
}

/**
 * كل قسمٍ يقرؤه الحساب — بما فيه أقسامُ كليةٍ يملكها كاملةً بصفِّ قسمٍ صفر.
 * القائمة مشتقّة من الحَكَم وحده: قسمٌ يُضاف غداً يدخلها بلا صفٍّ جديد.
 */
export function expandScopeSections(sections: readonly ScopeSection[], allowed: ScopePredicate): Set<number> {
  const out = new Set<number>();
  for (const section of sections) {
    const sectionId = Number(section.AdSectionId || 0);
    const collegeId = Number(section.AdCollegeId || 0);
    if (sectionId > 0 && allowed(collegeId, sectionId)) out.add(sectionId);
  }
  return out;
}

/**
 * هل يقرأ الحسابُ الكليةَ كلَّها؟ نعم حين يجيز الحَكَمُ كلَّ قسمٍ فيها.
 * (سؤال «أله شيءٌ في هذه الكلية؟» سؤالٌ آخر؛ رئيسُ لجنةٍ في قسمٍ واحد له شيءٌ
 * في الكلية، لكنه لا يقرأ مسوّدات جيرانه.)
 */
export function coversWholeCollege(sections: readonly ScopeSection[], allowed: ScopePredicate, collegeId: number): boolean {
  if (!collegeId) return false;
  const inCollege = sections.filter(section => Number(section.AdCollegeId) === collegeId && Number(section.AdSectionId) > 0);
  return inCollege.length > 0 && inCollege.every(section => allowed(collegeId, Number(section.AdSectionId)));
}

export interface SmartScopeInput {
  requested: { collegeId: number; sectionId: number };
  sections: readonly ScopeSection[];
  allowed: ScopePredicate;
  /** عددُ المواعيد لكل قسم في الفصل: يُختار الأكثفُ حين لا يُحدَّد قسم. */
  busiest?: ReadonlyMap<number, number>;
  /** مساراتٌ تقبل القراءة على مستوى الكلية (قسم صفر) — البحث بالجملة مثلاً. */
  allowCollegeWide?: boolean;
}

export interface SmartScope {
  collegeId: number;
  sectionId: number;
  /** false: الطلبُ سمّى نطاقاً لا يملكه الحساب — يُرفض، لا يُقرأ. */
  allowed: boolean;
}

/**
 * أيُّ قسمٍ وأيُّ كليةٍ يُقرآن لهذا الطلب — ومعه الحكم: أيُجاز؟
 *
 * القاعدة: لا يُصدَّق الطلبُ على نطاقه. قسمٌ مُسمّى يُسأل عنه الحَكَم، وكليةٌ
 * مُسمّاةٌ مع قسمٍ من كليةٍ أخرى تُرفض، وقراءةُ كليةٍ كاملة لا تُجاز إلا لمن
 * يغطّيها كلَّها. وحين لا يُسمّى شيء يُختار من داخل النطاق وحده، فلا تنتهي
 * «لا شيء مُحدَّد» إلى قراءة الجامعة كلها.
 */
export function resolveSmartScope(input: SmartScopeInput): SmartScope {
  const { requested, sections, allowed } = input;
  const sectionById = new Map(sections.map(section => [Number(section.AdSectionId), section]));
  const reqSection = Number(requested.sectionId || 0);
  const reqCollege = Number(requested.collegeId || 0);

  if (reqSection) {
    const section = sectionById.get(reqSection);
    if (!section) return { collegeId: reqCollege, sectionId: reqSection, allowed: false };
    const collegeId = Number(section.AdCollegeId);
    if (reqCollege && reqCollege !== collegeId) return { collegeId: reqCollege, sectionId: reqSection, allowed: false };
    return { collegeId, sectionId: reqSection, allowed: allowed(collegeId, reqSection) };
  }

  if (reqCollege) {
    if (input.allowCollegeWide) {
      return { collegeId: reqCollege, sectionId: 0, allowed: coversWholeCollege(sections, allowed, reqCollege) };
    }
    const own = [...expandScopeSections(sections, allowed)]
      .filter(id => Number(sectionById.get(id)?.AdCollegeId) === reqCollege);
    const pick = pickBusiest(own, input.busiest);
    return pick ? { collegeId: reqCollege, sectionId: pick, allowed: true } : { collegeId: reqCollege, sectionId: 0, allowed: false };
  }

  const own = [...expandScopeSections(sections, allowed)];
  if (input.allowCollegeWide) {
    const colleges = [...new Set(own.map(id => Number(sectionById.get(id)?.AdCollegeId || 0)).filter(Boolean))];
    const whole = colleges.filter(collegeId => coversWholeCollege(sections, allowed, collegeId));
    /* من يغطّي كليةً واحدةً كاملة (العميد) يُقرأ له مستواها. ومن يغطّي أكثر
       (عميد التسجيل) يختار كليةً بنفسه — لا تُقرأ له الجامعةُ كلها بلا طلب. */
    if (whole.length === 1 && colleges.length === 1) return { collegeId: whole[0], sectionId: 0, allowed: true };
  }
  const pick = pickBusiest(own, input.busiest);
  if (!pick) return { collegeId: 0, sectionId: 0, allowed: false };
  return { collegeId: Number(sectionById.get(pick)?.AdCollegeId || 0), sectionId: pick, allowed: true };
}

function pickBusiest(ids: number[], busiest?: ReadonlyMap<number, number>): number {
  return [...ids].sort((a, b) => (busiest?.get(b) || 0) - (busiest?.get(a) || 0) || a - b)[0] || 0;
}
