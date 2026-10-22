/**
 * ── إنهاء الصحيفة السابقة لأقسام ───────────────────────────────────────────────────────────
 * يختار المسؤول الأقسام التي انتهى طلبتها بالقديمة ويضغط «انتهوا»: لا يظهر لها في الجدول إلا مقررات
 * الجديدة، وتبقى القديمة للفصول السابقة. «أعد السابقة» يتراجع. للحساب الرئيسي وحده.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { History, RotateCcw, Check } from "lucide-react";

interface Row { sectionId: number; label: string; state: "running" | "ended" | "none"; hasNew: boolean }

export default function PreviousPlansPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = async () => {
    const response = await fetch("/api/plan-review/previous-plans", { credentials: "include" });
    if (response.ok) setRows(((await response.json()) as { rows: Row[] }).rows || []);
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => rows.filter(row => row.state !== "none" && (!query.trim() || row.label.includes(query.trim()))), [rows, query]);
  const toggle = (id: number) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosen = (state: Row["state"]) => shown.filter(row => picked.has(row.sectionId) && row.state === state && (state === "ended" || row.hasNew));

  const run = async (action: "end" | "restore") => {
    const list = chosen(action === "end" ? "running" : "ended");
    if (!list.length || busy) return;
    setBusy(true); setNote("");
    try {
      const response = await fetch("/api/plan-review/previous-plans", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sectionIds: list.map(row => row.sectionId) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setNote(String(data.error || "تعذّر التنفيذ."));
      else { setPicked(new Set()); setNote(`${action === "end" ? "انتهت السابقة" : "أُعيدت السابقة"}: ${countOf(Number(data.changed || 0), AR.department)}`); await load(); }
    } finally { setBusy(false); }
  };

  if (!rows.some(row => row.state !== "none")) return null;
  return (
    <section className="pr-import pr-previous" aria-label="إنهاء الصحيفة السابقة">
      <div className="pr-import-head">
        <span className="pr-import-ic"><History /></span>
        <div><b>انتهت الصحيفة السابقة</b><small>لا يظهر لهذه الأقسام في الجدول إلا مقررات الجديدة، وتظهر القديمة في الفصول السابقة</small></div>
        <div className="pr-import-actions">
          <input type="search" aria-label="بحث عن قسم" placeholder="بحث" value={query} onChange={e => setQuery(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy || !chosen("running").length} onClick={() => void run("end")} data-guide-ignore="إنهاء الصحيفة السابقة للأقسام المختارة داخل شاشة مراجعة الصحيفة"><Check aria-hidden="true" size={16} /> انتهوا</button>
          <button type="button" className="btn btn-secondary" disabled={busy || !chosen("ended").length} onClick={() => void run("restore")} data-guide-ignore="إعادة الصحيفة السابقة للأقسام المختارة داخل شاشة مراجعة الصحيفة"><RotateCcw aria-hidden="true" size={16} /> أعد السابقة</button>
        </div>
      </div>
      <ul className="pr-previous-list">
        {shown.map(row => (
          <li key={row.sectionId}>
            <label>
              <input type="checkbox" checked={picked.has(row.sectionId)} disabled={row.state === "running" && !row.hasNew} onChange={() => toggle(row.sectionId)} />
              <span>{row.label}</span>
              <small>{row.state === "ended" ? "انتهت" : row.hasNew ? "جارية" : "بلا جديدة بعد"}</small>
            </label>
          </li>
        ))}
      </ul>
      {note ? <small role="status">{note}</small> : null}
    </section>
  );
}
