/**
 * ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسم ──────────────────────────────────
 * PDF من SWRCAPP يُرفع مرةً واحدة: يُقبل لقسمه وكليته المختارين فقط، وتُطبَّق مقررات القسم وحدها
 * مباشرةً (برقم المقرر، وأسماؤها مصحَّحة، والسعة كما هي)، ثم يعتمد القسم الصحيفة من «اعتماد الصحيفة».
 * الرفضُ صندوقٌ أحمر قصير بأيقونات، بلا نصٍّ طويل.
 */
import React, { useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, FileText, GraduationCap, FileUp, FileX2, Link2, MousePointerClick, PencilLine, Plus, SearchX, ShieldAlert, X } from "lucide-react";

interface SectionOption { sectionId: number; sectionName: string }
interface Rejection {
  kind: string; message: string;
  mismatch?: { fields: Array<"college" | "department">; sheet: { college?: string; department?: string; departmentCode?: string }; chosen: { college?: string; department?: string; departmentCode?: string } };
}
interface Outcome {
  renamed: { before: string; after: string } | null;
  planId: string; planName: string; planCreated: boolean; created: number; updated: number; linked: number; unchanged: number; rules: number;
  nameFixes: Array<{ code: string; before: string; after: string }>; notes: string[];
}

const SHORT: Record<string, { icon: typeof FileX2; title: string; hint: string }> = {
  unreadable: { icon: FileX2, title: "الملف غير مقروء", hint: "ارفع PDF «الخطة الدراسية» من SWRCAPP" },
  unverified: { icon: ShieldAlert, title: "القراءة لا تطابق حسابها", hint: "أرسل الملف لفحصه" },
  noCode: { icon: SearchX, title: "رمز القسم غير مسجّل", hint: "اضبطه في «الأقسام» كما في العمادة" },
  empty: { icon: SearchX, title: "لا مقررات لهذا القسم", hint: "في الصحيفة" },
};

export default function PlanSheetUpload({ sections, sectionId, onDone }: { sections: SectionOption[]; sectionId: number; onDone: (sectionId: number, planId: string) => void }) {
  const [chosen, setChosen] = useState(sectionId || sections[0]?.sectionId || 0);
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file || !chosen) return;
    setBusy(true); setRejection(null); setError(""); setOutcome(null);
    try {
      const response = await fetch(`/api/plan-review/sheet/import?sectionId=${chosen}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await file.arrayBuffer() });
      const data = await response.json().catch(() => ({} as any));
      if (response.status === 422 && data.rejection) { setRejection(data.rejection as Rejection); return; }
      if (!response.ok) throw new Error(data.error || "تعذّر رفع الصحيفة");
      setOutcome(data as Outcome);
      onDone(chosen, String(data.planId || ""));
    } catch (e: any) { setError(e.message || "تعذّر رفع الصحيفة"); }
    finally { setBusy(false); }
  };

  const short = rejection ? SHORT[rejection.kind] : undefined;
  return (
    <section className="pr-import pr-sheet">
      <div className="pr-import-head">
        <span className="pr-import-ic"><GraduationCap /></span>
        <div><b>رفع الخطة الدراسية لقسم</b><small>PDF من SWRCAPP · مقررات القسم وحدها · يعتمدها القسم بعد الرفع</small></div>
        <div className="pr-import-actions">
          <select aria-label="قسم الصحيفة" value={chosen} disabled={busy} onChange={e => { setChosen(Number(e.target.value)); setRejection(null); setOutcome(null); }}>
            {sections.map(s => <option key={s.sectionId} value={s.sectionId}>{s.sectionName}</option>)}
          </select>
          <label className={`btn btn-primary${busy ? " is-busy" : ""}`}>
            <FileUp aria-hidden="true" size={16} /> {busy ? "جارٍ القراءة…" : "ارفع الصحيفة"}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={busy || !chosen} aria-label="الخطة الدراسية PDF" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {error ? <p className="section-plan-warning" role="alert"><AlertTriangle aria-hidden="true" /> {error}</p> : null}
      {rejection ? (
        <div className="section-plan-reject" role="alert" aria-label={rejection.message}>
          <div className="section-plan-reject-head">
            <AlertTriangle aria-hidden="true" />
            <strong>رُفضت الصحيفة</strong>
            <span className="section-plan-reject-tag">لم يُكتب شيء</span>
            <button type="button" className="student-qr-close" onClick={() => setRejection(null)} aria-label="إغلاق رسالة الرفض" data-guide-ignore="إغلاق رسالة الرفض داخل شاشة مراجعة الصحيفة"><X aria-hidden="true" /></button>
          </div>
          {rejection.mismatch ? (
            <div className="section-plan-reject-compare" aria-hidden="true">
              <div className="is-sheet">
                <span className="section-plan-reject-side"><FileText /> في الصحيفة</span>
                {rejection.mismatch.fields.includes("college") ? <b><Building2 /> {rejection.mismatch.sheet.college}</b> : null}
                {rejection.mismatch.fields.includes("department") ? <b><GraduationCap /> {rejection.mismatch.sheet.department} ({rejection.mismatch.sheet.departmentCode})</b> : null}
              </div>
              <span className="section-plan-reject-vs">≠</span>
              <div className="is-chosen">
                <span className="section-plan-reject-side"><MousePointerClick /> المختار</span>
                {rejection.mismatch.fields.includes("college") ? <b><Building2 /> {rejection.mismatch.chosen.college}</b> : null}
                {rejection.mismatch.fields.includes("department") ? <b><GraduationCap /> {rejection.mismatch.chosen.department} ({rejection.mismatch.chosen.departmentCode})</b> : null}
              </div>
            </div>
          ) : short ? <p className="section-plan-reject-short" aria-hidden="true"><short.icon /> <b>{short.title}</b> <span>· {short.hint}</span></p>
            : <p className="section-plan-reject-short">{rejection.message}</p>}
        </div>
      ) : null}
      {outcome ? (
        <div className="pr-sheet-result" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span title="مقررات جديدة"><Plus aria-hidden="true" /> {outcome.created}</span>
          <span title="مقررات صُحّحت"><PencilLine aria-hidden="true" /> {outcome.updated}</span>
          <span title="رُبطت بالصحيفة"><Link2 aria-hidden="true" /> {outcome.linked}</span>
          <small>{outcome.planName} · بانتظار اعتماد القسم</small>
          {outcome.renamed ? <small><GraduationCap aria-hidden="true" size={14} /> {outcome.renamed.before} ← {outcome.renamed.after}</small> : null}
          {outcome.nameFixes.length ? (
            <details><summary>أسماء صُحّحت ({outcome.nameFixes.length})</summary>
              <ul>{outcome.nameFixes.map(f => <li key={f.code}><b>{f.code}</b> {f.before} ← {f.after}</li>)}</ul>
            </details>
          ) : null}
          {outcome.notes.length ? <details><summary>ملاحظات ({outcome.notes.length})</summary><ul>{outcome.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details> : null}
        </div>
      ) : null}
    </section>
  );
}
