import React from "react";
import { ArrowLeft, CalendarX2, CalendarClock, Gauge, GraduationCap, Hourglass, ShieldQuestion, UsersRound, Waves } from "lucide-react";
import { CAUSE_LABEL, CAUSE_ORDER, dominantCause, type ShortfallCause } from "../utils/registrationCauses";
import { semesterReadiness, TIER_LABEL, type ReadinessBands } from "../utils/semesterReadiness";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── جاهزيةُ الفصل: لوحةٌ واحدة في أعلى الرادار ─────────────────────────────────
 *
 * حلقةٌ ورقمٌ، وثلاثةُ أرقامٍ تشرحه، وشريطٌ يقول لماذا لا يبلغ بعضُهم 12 وحدة. التفاصيلُ في الأقسام
 * تحتها؛ هنا ما يُقرأ في ثانية. تقديرٌ من ملفات الطلبة والجداول، لا تسجيلٌ رسمي.
 */

export interface Insight { ready: boolean; short: number; students: number; causes: Record<ShortfallCause, number>; stale?: boolean; quality?: QualityCell[]; qualityTruncated?: boolean }
export interface QualityCell { offeringId: string; code: string; courseId: number; courseName: string; courseCode: string; collegeId: number; sectionId: number; issue: string; rowId: number | null }
const fmt = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
const CAUSE_ICON: Record<ShortfallCause, React.ReactNode> = {
  full: <UsersRound aria-hidden="true" />, conflict: <CalendarClock aria-hidden="true" />, constraints: <Hourglass aria-hidden="true" />,
  prereq: <GraduationCap aria-hidden="true" />, shared: <Waves aria-hidden="true" />, other: <CalendarX2 aria-hidden="true" />,
};

export default function SemesterReadiness({ bands, wanted, seated, fullCourses, notOffered, onStart, insight, failed }: {
  bands: ReadinessBands | null | undefined; wanted: number; seated: number; fullCourses: number; notOffered: number; onStart?: () => void;
  /** من الرادار: يُجلب مرةً ويُشارَك مع قائمة جودة البيانات. */
  insight: Insight | null; failed: boolean;
}) {
  const r = semesterReadiness(bands, wanted, seated);
  if (r.score === null) return null;
  const RADIUS = 46, CIRC = 2 * Math.PI * RADIUS;
  const top = insight && insight.short > 0 ? dominantCause(insight.causes) : null;
  const total = insight?.short || 0;

  return (
    <section className={`rd-hero tier-${r.tier}`} aria-label="جاهزية الفصل">
      <div className="rd-ring" role="img" aria-label={`جاهزية الفصل ${r.score} من 100: ${TIER_LABEL[r.tier!]}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="rd-track" cx="60" cy="60" r={RADIUS} />
          <circle className="rd-arc" cx="60" cy="60" r={RADIUS} strokeDasharray={`${(r.score / 100) * CIRC} ${CIRC}`} />
        </svg>
        <div><b>{fmt(r.score)}</b><small>{TIER_LABEL[r.tier!]}</small></div>
      </div>

      <div className="rd-facts">
        <article><span className="rd-ic"><GraduationCap /></span><b>{fmt(r.reachShare)}٪</b><small>يبلغون 12 وحدة فأكثر</small></article>
        <article><span className="rd-ic"><UsersRound /></span><b>{fmt(r.seatShare)}٪</b><small>من الطلب وجد مقعداً</small></article>
        <article className={fullCourses ? "warn" : ""}><span className="rd-ic"><Gauge /></span><b>{fmt(fullCourses)}</b><small>{fullCourses === 1 ? "مقررٌ يمتلئ" : "مقرراتٌ تمتلئ"}</small></article>
        <article className={notOffered ? "warn" : ""}><span className="rd-ic"><CalendarX2 /></span><b>{fmt(notOffered)}</b><small>{notOffered === 1 ? "مطلوبٌ ولا يُطرح" : "مطلوبةٌ ولا تُطرح"}</small></article>
      </div>

      {total > 0 && insight ? (
        <div className="rd-why">
          <header><b>لماذا لا يبلغ {countOf(total, AR.student)} 12 وحدة؟</b>{top ? <small>الأكبر: {CAUSE_LABEL[top]}</small> : null}</header>
          <div className="rd-stack" role="img" aria-label="توزيع أسباب النقص">
            {CAUSE_ORDER.filter(cause => insight.causes[cause] > 0).map(cause => <i key={cause} className={`c-${cause}`} style={{ inlineSize: `${(insight.causes[cause] / total) * 100}%` }} title={`${CAUSE_LABEL[cause]} · ${insight.causes[cause]}`} />)}
          </div>
          <ul>
            {CAUSE_ORDER.filter(cause => insight.causes[cause] > 0).map(cause => <li key={cause} className={`c-${cause}`}>{CAUSE_ICON[cause]}<span>{CAUSE_LABEL[cause]}</span><b>{fmt(insight.causes[cause])}</b></li>)}
          </ul>
          <small className="rd-note">مقارنة سيناريوهات: يُرفع قيدٌ واحد ثم يُقاس من يبلغ 12. تقديرٌ لا إثباتٌ لسببٍ واحد.</small>
        </div>
      ) : null}
      {!insight && !failed ? <div className="rd-why rd-skeleton" aria-hidden="true"><i /><i /><i /></div> : null}

      {r.weak ? <p className="rd-weak"><ShieldQuestion aria-hidden="true" /> {fmt(r.unknownShare)}٪ من الملفات «غير معلوم»: الرقمُ تقديرٌ ضعيف حتى تكتمل بياناتها.</p> : null}
      {onStart && (fullCourses || notOffered) ? <button type="button" className="rd-go" onClick={onStart} data-guide-ignore="ينقل إلى قائمة المقررات التي تحتاج قراراً داخل الرادار؛ لا يكتب شيئاً">ابدأ بالأهم <ArrowLeft aria-hidden="true" /></button> : null}
    </section>
  );
}
