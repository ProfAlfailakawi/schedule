import React, { useState } from "react";
import { ArrowLeft, BookMarked, GitBranch, Layers, UsersRound } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── أثرُ المقرر: ماذا يسبقه، وماذا يفتح، وأيّ صحيفةٍ تحمله، وكم طالباً ينتظره ─────────────
 * زرٌّ صغير على صفّ المقرر في الرادار؛ لا يقرأ شيئاً حتى يُضغط. أسماءُ مقررات وأعدادٌ لا أسماءُ طلبة.
 */
interface Impact {
  course: { id: number; code: string; name: string; credit: number };
  plans: Array<{ id: string; name: string; status: string }>;
  prereqs: Array<{ id: number; name: string }>;
  dependents: Array<{ id: number; name: string; plans: string[] }>;
  demand: { wanted: number; seated: number; sections: number; capacity: number; taken: number; unmet: Record<string, number> } | null;
}
const fmt = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
const STATUS: Record<string, string> = { active: "الجديدة", transition: "السابقة" };

export default function CourseImpact({ courseId }: { key?: React.Key; courseId: number }) {
  const [state, setState] = useState<"idle" | "loading" | "open" | "failed">("idle");
  const [data, setData] = useState<Impact | null>(null);
  const load = async () => {
    if (data) { setState(state === "open" ? "idle" : "open"); return; }
    setState("loading");
    try {
      const response = await fetch(`/api/impact/course?courseId=${courseId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("impact");
      setData(await response.json()); setState("open");
    } catch { setState("failed"); }
  };
  const gap = data?.demand ? Math.max(0, data.demand.wanted - data.demand.seated) : 0;
  return (
    <div className="ci-wrap">
      <button type="button" className="ci-btn" aria-expanded={state === "open"} onClick={load} data-guide-ignore="يعرض أثر المقرر: ما يسبقه وما يفتحه وصحائفه والطلب عليه؛ قراءةٌ فقط">
        <GitBranch aria-hidden="true" /> {state === "loading" ? "…" : "الأثر"}
      </button>
      {state === "failed" ? <small className="ci-fail">تعذّرت القراءة.</small> : null}
      {state === "open" && data ? (
        <div className="ci-panel" role="region" aria-label={`أثر ${data.course.name}`}>
          <div className="ci-map">
            <div className="ci-col"><small>يسبقه</small>{data.prereqs.length ? data.prereqs.slice(0, 5).map(item => <span key={item.id} className="ci-chip">{item.name}</span>) : <span className="ci-none">لا مسبق</span>}</div>
            <ArrowLeft className="ci-arrow" aria-hidden="true" />
            <div className="ci-node"><BookMarked aria-hidden="true" /><b>{data.course.name}</b><small>{data.course.code} · {countOf(data.course.credit, AR.unit)}</small></div>
            <ArrowLeft className="ci-arrow" aria-hidden="true" />
            <div className="ci-col"><small>يفتح</small>{data.dependents.length ? data.dependents.slice(0, 5).map(item => <span key={item.id} className="ci-chip" title={item.plans.join("، ")}>{item.name}</span>) : <span className="ci-none">لا يفتح شيئاً</span>}</div>
          </div>
          {data.dependents.length > 5 || data.prereqs.length > 5 ? <small className="ci-more">+ {fmt(Math.max(0, data.dependents.length - 5) + Math.max(0, data.prereqs.length - 5))} أخرى</small> : null}
          <div className="ci-facts">
            {data.plans.map(plan => <span key={plan.id} className={`ci-plan s-${plan.status}`}><Layers aria-hidden="true" />{STATUS[plan.status] || plan.name}</span>)}
            {data.demand ? <>
              <span className="ci-stat"><UsersRound aria-hidden="true" /><b>{countOf(data.demand.wanted, AR.student)}</b> ينتظرونه</span>
              {gap ? <span className="ci-stat warn"><b>{countOf(gap, AR.student)}</b> بلا مقعد</span> : <span className="ci-stat ok">كلُّهم وجدوا مقعداً</span>}
              <span className="ci-stat">{countOf(data.demand.sections, AR.section)}</span>
            </> : <span className="ci-none">لا طلب مقيس عليه</span>}
          </div>
          {!data.plans.length ? <small className="ci-more">لا صحيفةَ فعّالة تحمله.</small> : null}
        </div>
      ) : null}
    </div>
  );
}
