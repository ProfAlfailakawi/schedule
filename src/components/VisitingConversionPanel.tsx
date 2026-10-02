import React, { useEffect, useState } from "react";
import { describeConversionChange, ConversionChange } from "../utils/visitingConversion";
import { visualConfirm } from "./ui";

type Scope = { collegeId: number; sectionId: number; label: string };
type VisitingState = {
  currentTermId: number;
  delegate: Scope[];
  rosters: Array<Scope & { termId: number; past: boolean }>;
  scopes: Scope[];
  terms: Array<{ termId: number; name: string }>;
};
const key = (s: { collegeId: number; sectionId: number }) => `${s.collegeId}:${s.sectionId}`;

/**
 * «نوع التعاقد» — منتدب أو معيّن — مستقلٌّ عن «الحالة» (نشط/متفرّغ/متقاعد).
 * الانتداب انتسابٌ لقسمٍ وفصل، فيُختار القسم صراحةً، وتُعرض التعديلات قبل
 * التنفيذ. لا يُحذف جدولٌ ولا روستر فصلٍ مضى.
 */
export default function VisitingConversionPanel({ instructorId, onChanged }: { instructorId: number; onChanged?: () => void }) {
  const [state, setState] = useState<VisitingState | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [alsoRoster, setAlsoRoster] = useState(true);
  const [target, setTarget] = useState("");
  const [termId, setTermId] = useState(0);
  const [preview, setPreview] = useState<ConversionChange[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setState(null); setPreview(null);
    fetch(`/api/instructors/${instructorId}/visiting-state`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!live || !d) return;
      setState(d);
      setPicked(new Set((d.delegate || []).map(key)));
      setTermId(Number(d.currentTermId || 0));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [instructorId, reload]);

  if (!state) return null;
  const isVisiting = state.delegate.length > 0;
  const labelOf = (c: number, s: number) => state.scopes.find(x => x.collegeId === c && x.sectionId === s)?.label
    || state.delegate.find(x => x.collegeId === c && x.sectionId === s)?.label || `${c}:${s}`;
  const termName = (t: number) => state.terms.find(x => x.termId === t)?.name || String(t);

  const body = () => isVisiting
    ? { direction: "toAppointed", scopes: state.delegate.filter(d => picked.has(key(d))).map(({ collegeId, sectionId }) => ({ collegeId, sectionId })), removeFromTermIds: alsoRoster && state.currentTermId ? [state.currentTermId] : [] }
    : { direction: "toVisiting", scopes: target ? [{ collegeId: Number(target.split(":")[0]), sectionId: Number(target.split(":")[1]) }] : [], termId };

  const call = async (dryRun: boolean) => {
    const payload = body();
    if (!payload.scopes.length) { setMessage({ tone: "error", text: isVisiting ? "اختر قسماً واحداً على الأقل يُرفع منه الانتداب." : "اختر الكلية والقسم الذي ينتدب إليه قبل التحويل." }); return null; }
    if (!isVisiting && !termId) { setMessage({ tone: "error", text: "اختر الفصل الذي ينتدب فيه قبل التحويل." }); return null; }
    const r = await fetch(`/api/instructors/${instructorId}/visiting-conversion`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, dryRun }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ tone: "error", text: d.error || "تعذّر التحويل." }); return null; }
    return d as { changes: ConversionChange[] };
  };

  const run = async () => {
    setBusy(true); setMessage(null);
    try {
      const plan = await call(true);
      if (!plan) return;
      setPreview(plan.changes);
      const lines = plan.changes.map(c => describeConversionChange(c, labelOf, termName));
      const ok = await visualConfirm({
        title: isVisiting ? "تحويل إلى معيّن" : "تحويل إلى منتدب",
        message: `عدد السجلات التي ستتغير: ${plan.changes.length}\n• ${lines.join("\n• ")}\n\nلا تُحذف الجداول ولا رواستر الفصول الماضية.`,
        confirmLabel: "تنفيذ التحويل",
      });
      if (!ok) return;
      const done = await call(false);
      if (!done) return;
      setMessage({ tone: "ok", text: `تمّ: ${done.changes.map(c => describeConversionChange(c, labelOf, termName)).join("؛ ")}.` });
      setReload(n => n + 1);
      onChanged?.();
    } finally { setBusy(false); }
  };

  return (
    <fieldset className="visiting-conversion" style={{ border: "1px dashed var(--border, #c9c9c9)", borderRadius: 10, padding: 12, marginTop: 12 }}>
      <legend style={{ fontWeight: 700, padding: "0 6px" }}>نوع التعاقد: {isVisiting ? "منتدب" : "معيّن"}</legend>
      <p className="smart-term-hint" style={{ marginTop: 0 }}>منفصلٌ عن «الحالة» أعلاه. الانتداب يُسجَّل لكل قسمٍ وفصل؛ تحويله لا يحذف جدولاً ولا تاريخاً سابقاً.</p>
      {isVisiting ? (
        <>
          <div role="group" aria-label="أقسام الانتداب">
            {state.delegate.map(d => (
              <label key={key(d)} style={{ display: "block" }}>
                <input type="checkbox" checked={picked.has(key(d))} onChange={e => {
                  const next = new Set(picked); e.target.checked ? next.add(key(d)) : next.delete(key(d)); setPicked(next); setPreview(null);
                }} /> {d.label}
              </label>
            ))}
          </div>
          {state.currentTermId ? (
            <label style={{ display: "block", marginTop: 6 }}>
              <input type="checkbox" checked={alsoRoster} onChange={e => setAlsoRoster(e.target.checked)} /> ارفعه أيضاً من روستر الفصل الحالي ({termName(state.currentTermId)})
            </label>
          ) : null}
        </>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <select aria-label="القسم المنتدب إليه" value={target} onChange={e => { setTarget(e.target.value); setPreview(null); }}>
            <option value="">— اختر الكلية والقسم —</option>
            {state.scopes.map(s => <option key={key(s)} value={key(s)}>{s.label}</option>)}
          </select>
          <select aria-label="فصل الانتداب" value={termId || ""} onChange={e => setTermId(Number(e.target.value))}>
            <option value="">— اختر الفصل —</option>
            {state.terms.map(t => <option key={t.termId} value={t.termId}>{t.name}</option>)}
          </select>
        </div>
      )}
      {preview && preview.length ? (
        <ul style={{ margin: "8px 0" }}>{preview.map((c, i) => <li key={i}>{describeConversionChange(c, labelOf, termName)}</li>)}</ul>
      ) : null}
      {message ? <p role={message.tone === "error" ? "alert" : "status"} style={{ color: message.tone === "error" ? "var(--danger, #b42318)" : undefined }}>{message.text}</p> : null}
      <button type="button" className="secondary-button" data-guide-ignore="يعرض أولاً معاينة السجلات التي ستتغير ويطلب التأكيد؛ لا يغيّر شيئاً قبل الموافقة الصريحة" disabled={busy} onClick={run}>
        {isVisiting ? "تحويل إلى معيّن…" : "تحويل إلى منتدب…"}
      </button>
    </fieldset>
  );
}
