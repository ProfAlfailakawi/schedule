import React, { useState } from "react";
import { CalendarPlus, TrendingUp } from "lucide-react";
import { SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import ApplyProposal, { postScheduleProposal, postWhatIf } from "./ApplyProposal";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

/** مقرّرٌ يُقترح له فتحُ شعبة: ما يكفي لقراءة الاقتراح من محرّك الفتح (لا يعرف الرادارَ ولا التنبّؤ). */
export interface RadarScheduleCourse { courseId: number; name: string; shortfall?: number; collegeId?: number; sectionId?: number }

export const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};


/**
 * اقتراحُ الجدول لمقرّرٍ يحتاج قراراً: يُقرأ من محرّك فتح الشعب نفسِه (الطلبُ ÷ السعة − المفتوح، موضوعاً في
 * أسبوعٍ حقيقيّ بلا تعارض)، ويُعتمد في الجدول الأصلي بضغطةٍ واحدة بعد التأكيد. لا يُقرأ شيءٌ حتى يُطلب.
 */
export default function RadarSchedule({ course, termId, onChanged }: { course: RadarScheduleCourse; termId: number; onChanged: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [proposal, setProposal] = useState<any>(null);
  const [message, setMessage] = useState("");
  const read = async () => {
    setState("loading"); setMessage("");
    try {
      const data = await request(`/api/schedules/demand?collegeId=${course.collegeId}&sectionId=${course.sectionId}&termId=${termId}`);
      setProposal((data?.openings?.proposals || []).find((item: any) => Number(item.courseId) === course.courseId) || null);
      setState("ready");
    } catch (e: any) { setMessage(e.message || "تعذّرت قراءة الاقتراح."); setState("idle"); }
  };
  return (
    <div className="sm-act">
      {state === "idle" ? <SecondaryButton type="button" onClick={read} data-guide-ignore="يقرأ اقتراح فتح شعبة لهذا المقرر؛ لا يكتب شيئاً"><CalendarPlus aria-hidden="true" /> ماذا لو فتحنا شعبة؟</SecondaryButton> : null}
      {state === "loading" ? <small>يبحث عن وقتٍ خالٍ من التعارض…</small> : null}
      {message ? <small className="sm-act-note">{message}</small> : null}
      {state === "ready" && !proposal ? <small className="sm-act-note">لا يقترح المحرّك شعبةً لهذا المقرر الآن: إمّا أن الطلب لا يُنتج مقاعد ناقصة، أو لا وقتَ خالياً من التعارض. راجع الجدول في ورشة القسم.</small> : null}
      {state === "ready" && proposal ? (
        <div className="sm-act-list">
          {proposal.simulationImpact ? (() => {
            type Cap = { canReach15: number; canReach12To14: number; below12: number; graduatingBelow12: number; unknown: number };
            const impact = proposal.simulationImpact as { before?: Cap; after?: Cap; delta12: number; delta15: number; conflictsBefore: number; conflictsAfter: number };
            const total = impact.after ? Object.values(impact.after).reduce((sum, n) => sum + Number(n || 0), 0) : 0;
            const reach = (cap?: Cap) => (cap ? cap.canReach15 + cap.canReach12To14 : 0);
            const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
            if (!total || impact.delta12 <= 0 && impact.delta15 <= 0 && impact.conflictsAfter >= impact.conflictsBefore) return null;
            return (
              <div className="sm-impact" aria-label="أثر فتح الشعبة">
                <b><TrendingUp aria-hidden="true" /> أثر فتحها</b>
                {([["قبل", reach(impact.before), "was"], ["بعد", reach(impact.after), "now"]] as const).map(([label, value, tone]) => (
                  <div key={label} className="sm-ba"><span>{label}</span><div className="sm-ba-bar"><i className={tone} style={{ inlineSize: `${Math.min(100, (value / total) * 100)}%` }} /></div><em>{nf(value)}</em></div>
                ))}
                <small>طلبةٌ يبلغون 12 وحدة فأكثر من {nf(total)}{impact.conflictsAfter < impact.conflictsBefore ? ` · التعارضات ${nf(impact.conflictsBefore)} ← ${nf(impact.conflictsAfter)}` : ""}</small>
              </div>
            );
          })() : null}
          {(proposal.placements || []).map((slot: any) => slot.instructorId ? (
            <ApplyProposal
              key={slot.index}
              compact
              lines={[`شعبة ${slot.sectionCode} لـ«${course.name}» · ${slot.dayLabel} ${formatScheduleTimeRange(slot.start, slot.end)} · ${slot.roomCode}${slot.roomHall ? `/${slot.roomHall}` : ""} · ${slot.instructorName}`]}
              why={`تخدم ${countOf(proposal.shortfall, AR.student)} بلا مقعدٍ في هذا المقرر.`}
              preview={() => postWhatIf({ kind: "opening", collegeId: course.collegeId, sectionId: course.sectionId, termId, courseId: course.courseId, placement: slot })}
              run={async () => {
                const result = await postScheduleProposal({
                  kind: "opening", collegeId: course.collegeId, sectionId: course.sectionId, termId, courseId: course.courseId, placement: slot,
                  origin: { kind: "radar", refId: `course:${course.courseId}`, note: `فتح شعبة لـ«${course.name}» من رادار التسجيل` },
                });
                return { summary: `فُتحت شعبة ${result.applied[0].row.SCode} لـ«${course.name}» في الجدول`, amendment: Boolean(result.amendment) };
              }}
              onApplied={() => onChanged()}
            />
          ) : <small key={slot.index} className="sm-act-note">{slot.dayLabel} {formatScheduleTimeRange(slot.start, slot.end)}: لا أستاذَ خالياً — اختره من ورشة الجدول.</small>)}
        </div>
      ) : null}
    </div>
  );
}

