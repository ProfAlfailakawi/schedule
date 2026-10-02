/**
 * ── رأسُ مساحة المقترح: هويةُ الأستاذ، ثم الحاليُّ ← المتوقَّع ───────────────
 *
 * كلُّ رقمٍ يأتي من حساب النظام للجدول الناتج (يشمل الاستبدالات والإزالات)،
 * وما لا يُعرف يُقال «غير متوفر» ولا يُرسم صفراً. وأثناء الفحص تبقى الخانةُ
 * فارغةً بنصٍّ صريح بدل أن تعرض رقماً قديماً.
 */
import React from "react";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CalendarCheck2, CalendarDays, Check, Clock, GraduationCap, Hourglass, Layers, Scale, ShieldAlert, X,
} from "lucide-react";
import type { StudyProposalMetrics } from "../../types";
import { AR, countOf } from "../../utils/arabicCount";
import { STATUS_LABEL } from "../../utils/studyProposal";
import type { StudyProposal } from "../../types";
import type { ProposalContext } from "./proposalApi";
import type { EvalState } from "./useProposalWorkspace";
import { hoursShort, minutesCompact, num, OP_NOUN } from "./proposalFormat";

type Tone = "neutral" | "good" | "warn" | "bad";

interface TileProps {
  label: string;
  Icon: React.ComponentType<any>;
  before: string | null;
  after: string | null;
  unit?: string;
  /** وحدةُ الفرق إن اختلفت عن وحدة القيمة. */
  deltaUnit?: string;
  delta?: number | null;
  /** هل الزيادة أفضل (+1) أم أسوأ (-1) أم لا حكم عليها (0)؟ */
  direction?: 1 | -1 | 0;
  checking?: boolean;
  note?: string;
  tone?: Tone;
  unknownText?: string;
}

function Tile({ label, Icon, before, after, unit, deltaUnit, delta, direction = 0, checking, note, tone, unknownText }: TileProps) {
  const changed = delta !== null && delta !== undefined && delta !== 0;
  const kind: Tone = tone ?? (!changed ? "neutral" : direction === 0 ? "neutral" : (delta! * direction > 0 ? "good" : "warn"));
  return (
    <div className="sp-tile" data-tone={kind} data-checking={checking || undefined}>
      <span className="sp-tile-label"><Icon aria-hidden="true" />{label}</span>
      <span className="sp-tile-values" aria-live="polite">
        {before === null ? <em>{unknownText || "غير متوفر"}</em> : <b className="sp-num" data-long={before.length > 6 || undefined}>{before}</b>}
        <ArrowLeft className="sp-arrow" aria-label="إلى" />
        {checking ? <em className="sp-skel">جاري الفحص</em> : after === null ? <em>{unknownText || "غير متوفر"}</em> : <b className="sp-num" data-long={after.length > 6 || undefined} data-changed={changed || undefined}>{after}</b>}
        {unit && before !== null && after !== null && !checking ? <small>{unit}</small> : null}
      </span>
      <span className="sp-tile-note">
        {checking ? "" : changed ? <span data-dir={delta! > 0 ? "up" : "down"}>{delta! > 0 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />} <bdi dir="ltr">{delta! > 0 ? "+" : "−"}{num(Math.abs(delta!))}</bdi>{(deltaUnit ?? unit) ? ` ${deltaUnit ?? unit}` : ""}</span> : note || ""}
      </span>
    </div>
  );
}

export default function ProposalHeader(props: {
  ctx: ProposalContext;
  proposal: StudyProposal | null;
  status: StudyProposal["status"] | "new";
  before: StudyProposalMetrics;
  after: StudyProposalMetrics | null;
  loadCap: number | null;
  blockers: number | null;
  reviews: number | null;
  evalState: EvalState;
  evalCurrent: boolean;
  evalError: string;
  hasOps: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { ctx, proposal, status, before, after, loadCap, blockers, reviews, evalState, evalCurrent, hasOps } = props;
  const checking = hasOps && !evalCurrent && evalState !== "failed";
  const failed = hasOps && evalState === "failed";
  /* بلا مواد: الوضع المتوقع هو الحالي نفسه (لا شيء يتغيّر)، لا «غير متوفر». */
  const A = !hasOps ? before : (evalCurrent && after ? after : null);
  const diff = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : b - a);
  const statusText = status === "new" ? "مسودة جديدة" : STATUS_LABEL[status as keyof typeof STATUS_LABEL];
  const loadBefore = before.loadUnits, loadAfter = A ? A.loadUnits : null;
  const overCap = Boolean(loadCap && loadAfter !== null && loadAfter > loadCap);

  return (
    <header className="sp-head">
      <div className="sp-id">
        <span className="sp-avatar" aria-hidden="true"><GraduationCap /></span>
        <div className="sp-id-text">
          <p className="sp-eyebrow">إعداد مقترح دراسي</p>
          <h1 id="sp-title">{ctx.instructor.name}</h1>
          <p className="sp-meta">
            <span>{ctx.term.name}</span>
            <span aria-hidden="true">·</span>
            <span>{[ctx.scope.collegeName, ctx.scope.sectionName].filter(Boolean).join(" — ")}</span>
          </p>
        </div>
        <div className="sp-status-group">
          <span className="sp-status" data-status={status}>
            <i aria-hidden="true" />{statusText}
          </span>
          {proposal && proposal.version > 1 ? <span className="sp-chip">النسخة {num(proposal.version)}</span> : null}
          {ctx.term.closed ? <span className="sp-chip" data-tone="bad">الفصل منتهٍ</span> : null}
        </div>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-close" onClick={props.onClose} aria-label="إغلاق مساحة المقترح"><X aria-hidden="true" /></button>
      </div>

      <div className="sp-tiles" role="group" aria-label="مقارنة الوضع الحالي بالمتوقع بعد المقترح">
        <Tile label="النصاب" Icon={Scale} unit="ساعة" checking={checking}
          before={loadBefore === null ? null : num(loadBefore)} after={loadAfter === null ? null : num(loadAfter)}
          delta={diff(loadBefore, loadAfter)} direction={0} tone={overCap ? "bad" : undefined}
          note={loadCap ? `المسجّل ${countOf(loadCap, AR.hour)}${overCap ? " — يتجاوزه" : ""}` : "لا سقف مسجّل"} unknownText="غير متوفر" />
        <Tile label="عدد الشعب" Icon={Layers} checking={checking} before={num(before.sections)} after={A ? num(A.sections) : null} delta={diff(before.sections, A?.sections)} />
        <Tile label="أيام الحضور" Icon={CalendarDays} checking={checking} before={num(before.attendanceDays)} after={A ? num(A.attendanceDays) : null}
          delta={diff(before.attendanceDays, A?.attendanceDays)} direction={-1} unit="يوم" />
        <Tile label="ساعات الحضور" Icon={Clock} checking={checking} before={hoursShort(before.presenceMinutes)} after={A ? hoursShort(A.presenceMinutes) : null}
          delta={A ? Math.round((A.presenceMinutes - before.presenceMinutes) / 6) / 10 : null} direction={-1} unit="ساعة" note={`تدريس ${hoursShort(before.teachingMinutes)} س`} />
        <Tile label="الفراغات بين المحاضرات" Icon={Hourglass} checking={checking} before={minutesCompact(before.gapMinutes)} after={A ? minutesCompact(A.gapMinutes) : null}
          delta={A ? A.gapMinutes - before.gapMinutes : null} direction={-1} deltaUnit="دقيقة" />
        <div className="sp-tile sp-tile-check" data-tone={failed ? "bad" : checking ? "neutral" : blockers ? "bad" : hasOps ? "good" : "neutral"} data-checking={checking || undefined}>
          <span className="sp-tile-label"><ShieldAlert aria-hidden="true" />التعارضات المانعة</span>
          <span className="sp-tile-values" aria-live="polite">
            {!hasOps ? <em>لا مواد بعد</em> : failed ? <em>تعذّر الفحص</em> : checking ? <em className="sp-skel">جاري الفحص</em>
              : <b className="sp-num">{blockers ? num(blockers) : "لا يوجد"}</b>}
          </span>
          <span className="sp-tile-note">{failed ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={props.onRetry}>أعد الفحص</button>
            : !hasOps || checking ? "" : blockers ? <span data-dir="up"><AlertTriangle aria-hidden="true" /> تمنع الإرسال</span> : <span data-dir="down"><Check aria-hidden="true" /> الفحص مكتمل</span>}</span>
        </div>
        <div className="sp-tile sp-tile-check" data-tone={!hasOps || checking || failed ? "neutral" : reviews ? "warn" : "good"} data-checking={checking || undefined}>
          <span className="sp-tile-label"><CalendarCheck2 aria-hidden="true" />ملاحظات للمراجعة</span>
          <span className="sp-tile-values" aria-live="polite">
            {!hasOps ? <em>—</em> : failed ? <em>—</em> : checking ? <em className="sp-skel">جاري الفحص</em> : <b className="sp-num">{reviews ? num(reviews) : "لا يوجد"}</b>}
          </span>
          <span className="sp-tile-note">{hasOps && !checking && !failed && reviews ? "لا تمنع الإرسال" : ""}</span>
        </div>
      </div>
    </header>
  );
}

export const summaryLine = (opCount: number, blockers: number | null, reviews: number | null, checked: boolean) => {
  if (!opCount) return "لم تُضف مادةٌ إلى المقترح بعد";
  const parts = [countOf(opCount, OP_NOUN) + " في المقترح"];
  if (!checked) parts.push("جاري الفحص");
  else {
    parts.push(blockers ? countOf(blockers, AR.blocker) : "لا توجد موانع");
    if (reviews) parts.push(countOf(reviews, AR.note) + " للمراجعة");
  }
  return parts.join(" · ");
};
