/**
 * ── لوحة الجمهور: حجمُ الجمهور بالأرقام ───────────────────────────────────────
 *
 * ما يُعرض على جهةٍ خارجية يجب أن يكون **مجمَّعاً ومجهولاً**: أعدادٌ لا أسماء ولا
 * أرقامَ مدنية، وأقسامٌ بلا أسماء («كلية ١، كلية ٢» بحسب الحجم). هذه الدالة نقيّة؛
 * تأخذ سجلّاتٍ خاماً وتُرجع أرقاماً فقط، ولا تحمل أيَّ حقلٍ يعرّف شخصاً.
 *
 * وهي صادقةٌ بما تعدّ: «الطالب» = بصمةٌ فريدة في الاستبيان، و«الزيارة» = متصفحٌ واحد
 * مرةً في اليوم لكل نوع صفحة (تقدير)، ولا نعدّ فتحَ الصفحة، لأن عدّاد المشاهدات
 * يتضخّم بتكرار الطلبات ولا يصحّ أن يُسمّى «زوّاراً».
 */
import type { AdCampaign, AdCourse, AdStatsDay, AdTerm, AudienceDay, InstructorRequest, StudentNeed, StudentProfile } from "../types";
import { AUDIENCE_BASELINE } from "./audienceBaseline";
import { addDays, ctrOf, endingSoon, isLive, kuwaitDay, slotById, totalsOf } from "./adsEngine";

export interface TermPoint { termId: number; termName: string; answers: number; students: number }
export interface CollegePoint { label: string; count: number }
export interface DayPoint { day: string; count: number }
export interface SlotPerformance { slot: string; label: string; campaigns: number; impressions: number; clicks: number; ctr: number }
export interface ContinuityPair { fromTerm: string; toTerm: string; before: number; stayed: number; rate: number }

export interface AudienceStats {
  generatedAt: string;
  term: { id: number; name: string } | null;
  /** «مساري»: ملفاتٌ شخصية أنشأها الطلبة بأنفسهم. */
  students: { profiles: number; active7: number; active30: number; byCollege: CollegePoint[] };
  /** الاستبيان: عبر كل الفصول، ثم الفصل الجاري على حدة. */
  survey: {
    allTimeAnswers: number;
    allTimeStudents: number;
    terms: TermPoint[];
    current: { answers: number; students: number; byType: { newCourse: number; conflict: number; graduate: number }; byCollege: CollegePoint[]; byDay: DayPoint[] };
  };
  /** الأساتذة: بطاقاتٌ أُرسلت، وفُتحت، وأُرسل منها طلب. */
  instructors: { invited: number; opened: number; /** بطاقاتٌ فُتحت بعد `AUDIENCE_BASELINE.asOf`. */ openedAfterBaseline: number; submitted: number; openRate: number; submitRate: number; byCollege: CollegePoint[] };
  /** الزيارات المقيسة منذ تشغيل القياس. `since` = أول يومٍ فيه بيانات. */
  visits: {
    since: string;
    days: number;
    series: DayPoint[];
    today: number;
    last7: number;
    last30: number;
    total: number;
    /** مجموع الأيام المقيسة بعد تاريخ الرصيد الافتتاحي (`AUDIENCE_BASELINE.asOf`). */
    afterBaseline: number;
    bySource: Array<{ source: string; count: number }>;
    returningRate: number;
    mobileRate: number;
    installs: number;
    /** [أحد..سبت][0..23] */
    heat: number[][];
    peakDay: string;
  };
  ads: { live: number; endingSoon: number; impressions: number; clicks: number; ctr: number };
  /** أداء الإعلانات لكل موقع إعلاني (من حملاته كلها). مواقع بلا ظهور لا تُعرض. */
  adsBySlot: SlotPerformance[];
  /** استمرارية الطلبة: من أجاب في فصلٍ ثم أجاب في الفصل التالي (بصمات الاستبيان). أحدث الأزواج أولاً. */
  continuity: ContinuityPair[];
  /** ما يطلبه الطلبة هذا الفصل (رغباتهم وطلباتهم)، مجمّعاً بالمقرر. مقرراتٌ بأقل من `DEMAND_MIN_STUDENTS` طلاب لا تظهر أبداً. */
  demand: { top: Array<{ name: string; students: number }>; hidden: number; minStudents: number };
  /** الجمهور الكلي المقدَّر: أدنى عددٍ مؤكد من الطلبة (الأكبر من الاستبيان وملفات مساري). */
  reach: { studentsMin: number; instructors: number; /** طلبةٌ ظهروا لأول مرة بعد `AUDIENCE_BASELINE.asOf` (بصمات فريدة). */ newSinceBaseline: number };
}

/** حدُّ الخصوصية: مقرر لا يطلبه عشرةُ طلابٍ مختلفين على الأقل لا يُعرض ولا يُعدّ ظاهراً، فلا يُستدلّ منه على طالبٍ بعينه. */
export const DEMAND_MIN_STUDENTS = 10;
const DEMAND_TOP = 8;
/** أقل عددٍ من طلبة الفصل السابق تُحسب له استمرارية؛ دونه لا تظهر نسبة. */
export const CONTINUITY_MIN_STUDENTS = 30;

export interface AudienceInput {
  now: Date;
  terms: readonly AdTerm[];
  currentTermId: number;
  needsByTerm: ReadonlyMap<number, readonly StudentNeed[]>;
  instructorRequests: readonly InstructorRequest[];
  /** كل بطاقات الفصول التي قد تُفتح فيها بطاقةٌ بعد الرصيد؛ تُستعمل لعدّاد «مرّات الفتح» وحده (الافتراضي: بطاقات الفصل الجاري). */
  openRequests?: readonly InstructorRequest[];
  profiles: readonly StudentProfile[];
  days?: readonly AudienceDay[];
  campaigns?: readonly AdCampaign[];
  adStats?: readonly AdStatsDay[];
  courses?: readonly AdCourse[];
}

const DAY_MS = 86_400_000;
const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const sum = (values: Iterable<number>) => { let t = 0; for (const v of values) t += v; return t; };

/** أقسامٌ بلا أسماء: تُرتَّب بالحجم وتُسمّى «كلية ١…». */
const anonymous = (counts: Map<number, number>): CollegePoint[] =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([, count], index) => ({ label: `كلية ${index + 1}`, count }));

const bump = (map: Map<number, number>, key: number) => map.set(key, (map.get(key) || 0) + 1);
const dayKey = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "");
const dayTotal = (d: AudienceDay) => sum(Object.values(d.visits || {}));

/** مرّات فتح بطاقةٍ بعد الرصيد: من سجلّ الأيام، وللبطاقات القديمة بلا سجلٍّ فتحُها الأول إن جاء بعد التاريخ. */
const opensAfterBaseline = (r: InstructorRequest): number => {
  if (r.linkOpenDays) return sum(Object.entries(r.linkOpenDays).filter(([day]) => day > AUDIENCE_BASELINE.asOf).map(([, n]) => Number(n) || 0));
  return dayKey(r.linkOpenedAt || "") > AUDIENCE_BASELINE.asOf ? 1 : 0;
};

export function buildAudienceStats(input: AudienceInput): AudienceStats {
  const term = input.terms.find(t => Number(t.AdTermId) === input.currentTermId) || null;

  const everyone = new Set<string>();
  const terms: TermPoint[] = [];
  let allTimeAnswers = 0;
  for (const t of [...input.terms].sort((a, b) => Number(a.AdTermId) - Number(b.AdTermId))) {
    const rows = input.needsByTerm.get(Number(t.AdTermId)) || [];
    if (!rows.length) continue;
    const people = new Set(rows.map(r => r.fingerprint).filter(Boolean));
    for (const fp of people) everyone.add(fp);
    allTimeAnswers += rows.length;
    terms.push({ termId: Number(t.AdTermId), termName: t.AdTermName, answers: rows.length, students: people.size });
  }

  const currentRows = input.needsByTerm.get(input.currentTermId) || [];
  const currentPeople = new Set(currentRows.map(r => r.fingerprint).filter(Boolean));
  const type = { newCourse: 0, conflict: 0, graduate: 0 };
  const colleges = new Map<number, number>();
  const days = new Map<string, number>();
  for (const row of currentRows) {
    if (row.requestType === "course-conflict") type.conflict++;
    else if (row.requestType === "graduate") type.graduate++;
    else type.newCourse++;
    bump(colleges, Number(row.AdCollegeId));
    const day = dayKey(row.createdAt);
    if (day) days.set(day, (days.get(day) || 0) + 1);
  }

  const profileColleges = new Map<number, number>();
  const now = input.now.getTime();
  let active7 = 0, active30 = 0;
  for (const profile of input.profiles) {
    if (Number(profile.AdCollegeId) > 0) bump(profileColleges, Number(profile.AdCollegeId));
    const seen = Date.parse(profile.lastSeenAt);
    if (!Number.isFinite(seen)) continue;
    if (now - seen <= 7 * DAY_MS) active7++;
    if (now - seen <= 30 * DAY_MS) active30++;
  }

  /* طلبةٌ جدد بعد الرصيد الافتتاحي: بصمةٌ أول ظهورٍ لها (استبيان أو ملف) بعد التاريخ. */
  const firstSeen = new Map<string, string>();
  const see = (fp: string, iso: string) => {
    const day = dayKey(iso);
    if (!fp || !day) return;
    const cur = firstSeen.get(fp);
    if (!cur || day < cur) firstSeen.set(fp, day);
  };
  for (const rows of input.needsByTerm.values()) for (const r of rows) see(r.fingerprint, r.createdAt);
  for (const profile of input.profiles) see(profile.fingerprint, profile.createdAt);
  const newSinceBaseline = [...firstSeen.values()].filter(day => day > AUDIENCE_BASELINE.asOf).length;

  const requests = input.instructorRequests;
  const opened = requests.filter(r => Boolean(r.linkOpenedAt)).length;
  const submitted = requests.filter(r => r.status !== "sent" || Boolean(r.submittedAt)).length;
  const requestColleges = new Map<number, number>();
  for (const r of requests) bump(requestColleges, Number(r.AdCollegeId));

  /* ── الزيارات المقيسة ── */
  const measured = [...(input.days || [])].sort((a, b) => a.day.localeCompare(b.day));
  const today = kuwaitDay(input.now);
  const byDay = new Map(measured.map(d => [d.day, dayTotal(d)] as const));
  const series: DayPoint[] = [];
  for (let i = 29; i >= 0; i--) { const day = addDays(today, -i); series.push({ day, count: byDay.get(day) || 0 }); }
  const sources = new Map<string, number>();
  let returning = 0, fresh = 0, mobile = 0, desktop = 0, installs = 0;
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const d of measured) {
    for (const [source, count] of Object.entries(d.visits || {})) sources.set(source, (sources.get(source) || 0) + count);
    returning += d.returning || 0; fresh += d.fresh || 0; mobile += d.mobile || 0; desktop += d.desktop || 0; installs += d.installed || 0;
    const dow = new Date(`${d.day}T00:00:00Z`).getUTCDay();
    for (const [hour, count] of Object.entries(d.hours || {})) {
      const h = Number(hour);
      if (h >= 0 && h < 24) heat[dow][h] += count;
    }
  }
  const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const perDow = heat.map(row => sum(row));
  const peak = Math.max(...perDow);
  const total = sum(byDay.values());

  /* ── الإعلانات ── */
  const campaigns = input.campaigns || [];
  const adTotals = totalsOf(input.adStats || []);

  /* ── اتجاهات الطلب: طلبةٌ فريدون (بصمات) لكل مقرر، من رغبات الفصل وطلباته ── */
  const byCourseKey = new Map<string, { name: string; who: Set<string> }>();
  const courseById = new Map((input.courses || []).map(c => [Number(c.AdCourseId), c] as const));
  const add = (courseId: number, fingerprint: string) => {
    const course = courseById.get(Number(courseId));
    if (!course || !fingerprint) return;
    /* المقرر نفسه في أقسامٍ مختلفة يحمل رمزاً واحداً: يُجمَّع بالرمز لا بالرقم الداخلي. */
    const key = String(course.CourseCode || course.CourseName).trim().toLowerCase();
    const cur = byCourseKey.get(key) || { name: course.CourseName, who: new Set<string>() };
    cur.who.add(fingerprint);
    byCourseKey.set(key, cur);
  };
  for (const profile of input.profiles) {
    if (profile.wishes && Number(profile.wishes.termId) === input.currentTermId) for (const id of profile.wishes.courseIds || []) add(id, profile.fingerprint);
  }
  for (const row of currentRows) for (const id of row.courseIds || []) add(id, row.fingerprint);
  const ranked = [...byCourseKey.values()].map(v => ({ name: v.name, students: v.who.size })).sort((a, b) => b.students - a.students || a.name.localeCompare(b.name, "ar"));
  const demandTop = ranked.filter(r => r.students >= DEMAND_MIN_STUDENTS).slice(0, DEMAND_TOP);
  const demandHidden = ranked.filter(r => r.students < DEMAND_MIN_STUDENTS).length;

  /* ── استمرارية الطلبة: فصلان متتاليان في تسلسل الفصول فقط، وبعيّنةٍ كافية ── */
  const sequence = [...input.terms].sort((a, b) => Number(a.AdTermId) - Number(b.AdTermId))
    .map(t => ({ term: t, people: new Set((input.needsByTerm.get(Number(t.AdTermId)) || []).map(r => r.fingerprint).filter(Boolean)) }));
  const continuity: ContinuityPair[] = [];
  for (let i = 1; i < sequence.length; i++) {
    const prev = sequence[i - 1], cur = sequence[i];
    /* فصلٌ بلا إجابات بينهما يقطع التتالي، وعيّنةٌ صغيرة تُنتج نسبةً مضللة (0% من طالبٍ واحد). */
    if (prev.people.size < CONTINUITY_MIN_STUDENTS || cur.people.size === 0) continue;
    let stayed = 0;
    for (const fp of prev.people) if (cur.people.has(fp)) stayed++;
    continuity.push({ fromTerm: prev.term.AdTermName, toTerm: cur.term.AdTermName, before: prev.people.size, stayed, rate: ratio(stayed, prev.people.size) });
  }
  continuity.reverse();

  /* ── أداء الإعلانات لكل موقع ── */
  const slotOf = new Map(campaigns.map(c => [c.id, c.slot] as const));
  const perSlot = new Map<string, { impressions: number; clicks: number; ids: Set<string> }>();
  for (const row of input.adStats || []) {
    const slot = slotOf.get(row.campaignId);
    if (!slot) continue;
    const cur = perSlot.get(slot) || { impressions: 0, clicks: 0, ids: new Set<string>() };
    cur.impressions += row.impressions; cur.clicks += row.clicks; cur.ids.add(row.campaignId);
    perSlot.set(slot, cur);
  }
  const adsBySlot: SlotPerformance[] = [...perSlot.entries()]
    .filter(([, v]) => v.impressions > 0)
    .map(([slot, v]) => ({ slot, label: slotById(slot)?.label || slot, campaigns: v.ids.size, impressions: v.impressions, clicks: v.clicks, ctr: ctrOf(v.clicks, v.impressions) }))
    .sort((a, b) => b.impressions - a.impressions);

  return {
    generatedAt: input.now.toISOString(),
    term: term ? { id: Number(term.AdTermId), name: term.AdTermName } : null,
    students: { profiles: input.profiles.length, active7, active30, byCollege: anonymous(profileColleges) },
    survey: {
      allTimeAnswers,
      allTimeStudents: everyone.size,
      /* الرسم لآخر ١٢ فصلاً؛ والإجماليان أعلاه عبر كل الفصول. */
      terms: terms.slice(-12),
      current: {
        answers: currentRows.length,
        students: currentPeople.size,
        byType: type,
        byCollege: anonymous(colleges),
        byDay: [...days.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
      },
    },
    instructors: {
      invited: requests.length,
      opened,
      openedAfterBaseline: sum((input.openRequests || requests).map(opensAfterBaseline)),
      submitted,
      openRate: ratio(opened, requests.length),
      submitRate: ratio(submitted, requests.length),
      byCollege: anonymous(requestColleges),
    },
    visits: {
      since: measured[0]?.day || "",
      days: measured.length,
      series,
      today: byDay.get(today) || 0,
      last7: sum(series.slice(-7).map(p => p.count)),
      last30: sum(series.map(p => p.count)),
      total,
      afterBaseline: sum(measured.filter(d => d.day > AUDIENCE_BASELINE.asOf).map(dayTotal)),
      bySource: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      returningRate: ratio(returning, returning + fresh),
      mobileRate: ratio(mobile, mobile + desktop),
      installs,
      heat,
      peakDay: peak > 0 ? dayNames[perDow.indexOf(peak)] : "",
    },
    ads: {
      live: campaigns.filter(c => isLive(c, today)).length,
      endingSoon: campaigns.filter(c => endingSoon(c, today)).length,
      impressions: adTotals.impressions,
      clicks: adTotals.clicks,
      ctr: adTotals.ctr,
    },
    reach: { studentsMin: Math.max(everyone.size, input.profiles.length), instructors: opened, newSinceBaseline },
    adsBySlot,
    continuity,
    demand: { top: demandTop, hidden: demandHidden, minStudents: DEMAND_MIN_STUDENTS },
  };
}

/**
 * الأرقام الكبرى منذ 2016 كما تعرضها اللوحة وملف الشراكة معاً: الرصيد الافتتاحي الذي أقرّته الإدارة
 * (`AUDIENCE_BASELINE`) + ما قيس بعد تاريخه. دالةٌ واحدة كي لا يختلف رقمٌ بين الصفحتين.
 */
export function headlineTotals(s: AudienceStats) {
  return {
    students: AUDIENCE_BASELINE.students + (s.reach.newSinceBaseline || 0),
    visits: AUDIENCE_BASELINE.visits + (s.visits.afterBaseline || 0),
    instructorOpens: AUDIENCE_BASELINE.instructorOpens + (s.instructors.openedAfterBaseline || 0),
    /** حدٌّ أدنى: يظهر المقيس إن زاد عليه. */
    instructorOpenRate: Math.max(AUDIENCE_BASELINE.instructorOpenRate, s.instructors.openRate || 0),
  };
}
