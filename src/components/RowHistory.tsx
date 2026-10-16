import React, { useState } from "react";
import { Brain, ClipboardList, Layers, Radar, UserRound, History, Pencil, Plus, Trash2 } from "lucide-react";
import type { ScheduleOrigin } from "../types";

/**
 * ── ذاكرةُ الموعد: لماذا هو هنا؟ ──────────────────────────────────────────────────
 * شارةُ المصدر (إن وُجد باب اعتمادٍ كتبه) وزرٌّ يفتح سجلّ ما جرى عليه، من الصف نفسه ومن سجلّ التدقيق.
 * لا يخزّن شيئاً جديداً؛ يقرأ ما كُتب أصلاً. لا يُقرأ شيءٌ حتى يُضغط.
 */
const ORIGIN: Record<string, { label: string; icon: React.ReactNode }> = {
  radar: { label: "رادار التسجيل", icon: <Radar aria-hidden="true" /> },
  "student-case": { label: "حالة طالب", icon: <UserRound aria-hidden="true" /> },
  "instructor-request": { label: "رغبة أستاذ", icon: <ClipboardList aria-hidden="true" /> },
  intelligence: { label: "مركز الذكاء", icon: <Brain aria-hidden="true" /> },
  planning: { label: "تخطيط الشعب", icon: <Layers aria-hidden="true" /> },
};
interface EventRow { at: string; who: string; action: string; what: string }
const stamp = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };
const iconOf = (action: string) => /إضافة/.test(action) ? <Plus aria-hidden="true" /> : /حذف/.test(action) ? <Trash2 aria-hidden="true" /> : <Pencil aria-hidden="true" />;

export default function RowHistory({ rowId, origin }: { key?: React.Key; rowId: number; origin?: ScheduleOrigin | null }) {
  const [state, setState] = useState<"idle" | "loading" | "open" | "failed">("idle");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [more, setMore] = useState(false);
  const src = origin ? ORIGIN[origin.kind] : null;
  const toggle = async () => {
    if (state === "open") { setState("idle"); return; }
    setState("loading");
    try {
      const response = await fetch(`/api/schedules/${rowId}/history`, { cache: "no-store" });
      if (!response.ok) throw new Error("history");
      const body = await response.json();
      setEvents(body.events || []); setMore(Boolean(body.truncated)); setState("open");
    } catch { setState("failed"); }
  };
  return (
    <div className="rh-wrap">
      <div className="rh-row">
        {src && origin ? <span className="rh-origin" title={origin.note || undefined}>{src.icon}<b>{src.label}</b><small>{origin.by} · {stamp(origin.at)}</small></span> : null}
        <button type="button" className="rh-btn" aria-expanded={state === "open"} onClick={toggle} data-guide-ignore="يعرض سجلّ هذا الموعد: من أوجده ومن عدّله ولماذا؛ قراءةٌ فقط">
          <History aria-hidden="true" /> {state === "loading" ? "…" : "لماذا؟"}
        </button>
      </div>
      {origin?.note ? <small className="rh-note">{origin.note}</small> : null}
      {state === "failed" ? <small className="rh-fail">تعذّرت قراءة السجلّ.</small> : null}
      {state === "open" ? (
        events.length ? (
          <ol className="rh-list">
            {events.map((event, i) => <li key={i}><span className="rh-dot">{iconOf(event.action)}</span><div><b>{event.what || event.action}</b><small>{event.who} · {stamp(event.at)}</small></div></li>)}
            {more ? <li className="rh-more">وأقدم من ذلك…</li> : null}
          </ol>
        ) : <small className="rh-note">لا سجلَّ مكتوباً لهذا الموعد (قبل بدء تسجيل التغييرات، أو أُدخل بالاستيراد).</small>
      ) : null}
    </div>
  );
}
