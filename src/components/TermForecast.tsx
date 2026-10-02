import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, DoorClosed, Gauge, Users } from "lucide-react";
import MiniRing from "./MiniRing";
import { createScopeGuard, approvalScopeKey } from "../utils/approvalScope";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";
import type { ForecastRisk, ForecastRiskKind, TermForecast as Forecast } from "../utils/termForecast";

/**
 * «الإنذار المبكر»: بطاقةٌ هادئة في لوحة البداية. حلقةُ تغطية الطلب وحتى ثلاثة
 * مخاطر بأيقونةٍ وسطرٍ واحد. تتبع النطاق المشترك (كلية + قسم + فصل) ولا تعرض إلا
 * لقسمٍ بعينه؛ والقراءةُ الواصلة بعد تبدّل النطاق تُرمى (createScopeGuard).
 * القواعد وحدها في src/utils/termForecast.ts — هذا رسمٌ فقط.
 */
const ICON: Record<ForecastRiskKind, React.ComponentType<any>> = { shortage: AlertTriangle, overload: Users, unroomed: DoorClosed, capacity: Gauge };

const Line: React.FC<{ risk: ForecastRisk }> = ({ risk }) => {
  const Icon = ICON[risk.kind];
  return <li className={`forecast-risk tone-${risk.tone}`}><i aria-hidden="true"><Icon /></i><span>{risk.text}</span></li>;
};

export default function TermForecast({ scopes, isAdmin, onImport }: { scopes: any[]; isAdmin: boolean; onImport?: () => void }) {
  const resolve = () => resolveSharedScope(readSharedScope(), { scopes, isAdmin });
  const [scope, setScope] = useState(resolve);
  useSharedScope(incoming => setScope(resolveSharedScope(incoming, { scopes, isAdmin })));
  const [forecast, setForecast] = useState<(Forecast & { scopeKey: string }) | null>(null);
  const [open, setOpen] = useState(false);
  const guard = useRef(createScopeGuard()).current;
  const key = approvalScopeKey(scope);
  const single = scope.collegeId > 0 && scope.sectionId > 0;
  useEffect(() => {
    setForecast(null); setOpen(false);
    guard.setScope(key);
    if (!single) return;
    const token = guard.begin(key);
    fetch(`/api/forecast/term?collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (body && guard.accepts(token)) setForecast(body); })
      .catch(() => {});
  }, [key, single]);

  if (!single || !forecast) return null;
  const percent = forecast.coverage.percent;
  const tone = percent == null ? "idle" : percent >= 90 ? "good" : percent >= 70 ? "warn" : "bad";
  return <section className="term-forecast" aria-label="الإنذار المبكر للفصل">
    <header><Gauge aria-hidden="true" /><span>الإنذار المبكر</span></header>
    <div className="term-forecast-body">
      {forecast.status === "ready" && percent != null ? <div className={`forecast-gauge tone-${tone}`}>
        <MiniRing value={percent} size={64} decorative>{""}</MiniRing>
        <b>{percent.toLocaleString("ar-KW-u-nu-latn")}٪</b>
        <small>تغطية الطلب</small>
      </div> : null}
      <div className="forecast-list">
        {forecast.status === "no-remaining" ? <p className="forecast-note">
          لم يُستورد كشف المتبقي لهذا الفصل — <button type="button" className="editorial-text-action" data-guide-ignore="رابطٌ نصيٌّ يفتح شاشة الجدول حيث يُستورد الكشف؛ لا إجراء جديد" onClick={() => onImport?.()}>استورده من شاشة الجدول</button>
        </p> : null}
        {forecast.highlights.length ? <ul>{forecast.highlights.map(risk => <Line key={risk.text} risk={risk} />)}</ul>
          : forecast.status === "ready" ? <p className="forecast-calm">لا مخاطر ظاهرة في بيانات هذا الفصل.</p> : null}
        {forecast.more.length ? <>
          <button type="button" className="forecast-more" aria-expanded={open} data-guide-ignore="طيّ وبسط تفاصيل البطاقة فقط" onClick={() => setOpen(value => !value)}>
            كل التفاصيل<ChevronDown aria-hidden="true" />
          </button>
          {open ? <ul>{forecast.more.map(risk => <Line key={risk.text} risk={risk} />)}</ul> : null}
        </> : null}
      </div>
    </div>
  </section>;
}
