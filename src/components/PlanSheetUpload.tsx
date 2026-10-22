/**
 * ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسم ──────────────────────────────────
 * PDF من SWRCAPP يُرفع مرةً واحدة: يُقبل لقسمه وكليته المختارين فقط، وتُطبَّق مقررات القسم وحدها
 * مباشرةً (برقم المقرر، وأسماؤها مصحَّحة، والسعة كما هي)، ثم يعتمد القسم الصحيفة من «اعتماد الصحيفة».
 * الرفضُ صندوقٌ أحمر قصير بأيقونات، بلا نصٍّ طويل.
 */
import React, { useRef, useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { AlertTriangle, Building2, CheckCircle2, FileText, GraduationCap, FileUp, FileX2, Link2, MousePointerClick, PencilLine, Plus, SearchX, ShieldAlert, X } from "lucide-react";

interface SectionOption { sectionId: number; label: string; sites: number }
interface Rejection {
  kind: string; message: string;
  mismatch?: { fields: Array<"college" | "department">; sheet: { college?: string; department?: string; departmentCode?: string }; chosen: { college?: string; department?: string; departmentCode?: string } };
}
interface Outcome {
  unlinked: number; prereqPrinted: number; prereqLinked: number;
  sites: number;
  renamed: { before: string; after: string } | null;
  recoded: { before: string; after: string } | null;
  planId: string; planName: string; planCreated: boolean; created: number; updated: number; linked: number; unchanged: number; rules: number;
}

const SHORT: Record<string, { icon: typeof FileX2; title: string; hint: string }> = {
  unreadable: { icon: FileX2, title: "الملف غير مقروء", hint: "ارفع PDF «الخطة الدراسية» من SWRCAPP" },
  unverified: { icon: ShieldAlert, title: "القراءة لا تطابق حسابها", hint: "أرسل الملف لفحصه" },
  order: { icon: SearchX, title: "لا صحيفة سابقة للقسم", hint: "ارفع القديمة قبل الجديدة" },
  empty: { icon: SearchX, title: "لا مقررات لهذا القسم", hint: "في الصحيفة" },
};

export default function PlanSheetUpload({ targets, sectionId, onDone }: { targets: SectionOption[]; sectionId: number; onDone: (sectionId: number, planId: string) => void }) {
  const [chosen, setChosen] = useState(targets.find(item => item.sectionId === sectionId)?.sectionId || targets[0]?.sectionId || 0);
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number; ok: number; prereqLinked: number; prereqPrinted: number; pass: 1 | 2; failed: Array<{ name: string; reason: string }> } | null>(null);

  const lastFile = useRef<File | null>(null);
  const upload = async (file: File | undefined, force = false) => {
    if (!file || !chosen) return;
    lastFile.current = file;
    setBusy(true); setRejection(null); setError(""); setOutcome(null); setBatch(null);
    try {
      const response = await fetch(`/api/plan-review/sheet/import?sectionId=${chosen}${force ? "&force=1" : ""}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await file.arrayBuffer() });
      const data = await response.json().catch(() => ({} as any));
      if (response.status === 422 && data.rejection) { setRejection(data.rejection as Rejection); return; }
      if (!response.ok) throw new Error(data.error || "تعذّر رفع الصحيفة");
      setOutcome(data as Outcome);
      onDone(Number(data.sectionId || chosen), String(data.planId || ""));
    } catch (e: any) { setError(e.message || "تعذّر رفع الصحيفة"); }
    finally { setBusy(false); }
  };

  /* رفعُ كل الملفات دفعة واحدة: كل صحيفة تُوجَّه تلقائياً إلى قسمها باسمه، وما لم يُعرف قسمه يُذكر باسم ملفه. */
  const uploadAll = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setRejection(null); setError(""); setOutcome(null);
    const state = { done: 0, total: files.length, ok: 0, prereqLinked: 0, prereqPrinted: 0, pass: 1 as 1 | 2, failed: [] as Array<{ name: string; reason: string }> };
    setBatch({ ...state });
    let last = { sectionId: 0, planId: "" };
    const send = async (file: File) => {
      const response = await fetch("/api/plan-review/sheet/import", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await file.arrayBuffer() });
      return { response, data: await response.json().catch(() => ({} as any)) };
    };
    const accepted: File[] = [];
    for (const file of files) {
      try {
        const { response, data } = await send(file);
        if (response.ok) { state.ok += 1; accepted.push(file); last = { sectionId: Number(data.sectionId || 0), planId: String(data.planId || "") }; }
        else state.failed.push({ name: file.name.replace(/\.pdf$/i, ""), reason: SHORT[data.rejection?.kind]?.title || ({ department: "لا قسم بهذا الاسم", college: "كلية أخرى" } as Record<string, string>)[data.rejection?.kind] || data.error || "تعذّر" });
      } catch { state.failed.push({ name: file.name.replace(/\.pdf$/i, ""), reason: "تعذّر الرفع" }); }
      state.done += 1; setBatch({ ...state, failed: [...state.failed] });
    }
    /* مرورٌ ثانٍ على ما قُبل: مسبقٌ لمقررِ قسمٍ رُفع بعده لم يكن موجوداً وقت الأول، فيُربط الآن. */
    state.pass = 2; state.done = 0; state.total = accepted.length;
    for (const file of accepted) {
      try { const { response, data } = await send(file); if (response.ok) { state.prereqLinked += Number(data.prereqLinked || 0); state.prereqPrinted += Number(data.prereqPrinted || 0); } } catch { /* المرور الأول كفى */ }
      state.done += 1; setBatch({ ...state, failed: [...state.failed] });
    }
    setBusy(false);
    if (state.ok && last.sectionId) onDone(last.sectionId, last.planId);
  };

  const short = rejection ? SHORT[rejection.kind] : undefined;
  return (
    <section className="pr-import pr-sheet">
      <div className="pr-import-head">
        <span className="pr-import-ic"><GraduationCap /></span>
        <div><b>رفع الخطة الدراسية لقسم</b><small>PDF من SWRCAPP · مقررات القسم وحدها · يعتمدها القسم بعد الرفع</small></div>
        <div className="pr-import-actions">
          <select aria-label="قسم الصحيفة" value={chosen} disabled={busy} onChange={e => { setChosen(Number(e.target.value)); setRejection(null); setOutcome(null); }}>
            {targets.map(item => <option key={item.sectionId} value={item.sectionId}>{item.label}{item.sites > 1 ? ` (${countOf(item.sites, AR.site)})` : ""}</option>)}
          </select>
          <label className={`btn btn-primary${busy ? " is-busy" : ""}`}>
            <FileUp aria-hidden="true" size={16} /> {busy ? "جارٍ القراءة…" : "ارفع الصحيفة"}
            <input type="file" accept="application/pdf,.pdf" hidden disabled={busy || !chosen} aria-label="الخطة الدراسية PDF" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <label className={`btn btn-secondary${busy ? " is-busy" : ""}`} data-guide-ignore="رفع كل الصحائف دفعة واحدة داخل شاشة مراجعة الصحيفة">
            <FileUp aria-hidden="true" size={16} /> ارفع كل الصحف
            <input type="file" accept="application/pdf,.pdf" multiple hidden disabled={busy} aria-label="كل الخطط الدراسية PDF دفعة واحدة" onChange={e => { void uploadAll([...(e.target.files || [])].slice(0, 120)); e.target.value = ""; }} />
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
          {rejection.kind === "department" && lastFile.current ? (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void upload(lastFile.current || undefined, true)} data-guide-ignore="رفع الصحيفة على القسم المختار صراحةً رغم اختلاف اسمه ورمزه داخل شاشة مراجعة الصحيفة">
              <FileUp aria-hidden="true" size={16} /> ارفعها على هذا القسم رغم الاختلاف
            </button>
          ) : null}
        </div>
      ) : null}
      {batch ? (
        <div className="pr-sheet-result" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span title="دخلت"><Plus aria-hidden="true" /> {batch.ok}</span>
          <span title="لم تدخل"><X aria-hidden="true" /> {batch.failed.length}</span>
          {batch.prereqPrinted ? <span title="مسبقات مربوطة من المطبوعة؛ الباقي نصيحةُ PEN أو مقرراتُ أقسامٍ لم تُرفع صحائفها"><Link2 aria-hidden="true" /> {batch.prereqLinked}/{batch.prereqPrinted}</span> : null}
          <small>{batch.done < batch.total || (batch.pass === 1 && busy) ? `${batch.pass === 2 ? "المسبقات · " : ""}${batch.done} / ${batch.total}` : "تم"}</small>
          {batch.failed.length ? <ul>{batch.failed.map((item, index) => <li key={index}><b>{item.name}</b> · {item.reason}</li>)}</ul> : null}
        </div>
      ) : null}
      {outcome ? (
        <div className="pr-sheet-result" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span title="مقررات جديدة"><Plus aria-hidden="true" /> {outcome.created}</span>
          <span title="مقررات صُحّحت"><PencilLine aria-hidden="true" /> {outcome.updated}</span>
          <span title="رُبطت بالصحيفة"><Link2 aria-hidden="true" /> {outcome.linked}</span>
          <span title={outcome.prereqLinked < outcome.prereqPrinted ? "مسبقات مربوطة من المطبوعة؛ الباقي نصيحةُ PEN أو مقررُ قسمٍ لم تُرفع صحيفته بعد (يُربط عند الرفع التالي)" : "كل المسبقات المطبوعة مربوطة"}><Link2 aria-hidden="true" /> {outcome.prereqLinked}/{outcome.prereqPrinted}</span>
          <small>{outcome.planName} · بانتظار اعتماد القسم{outcome.sites > 1 ? ` · ${countOf(outcome.sites, AR.site)}` : ""}</small>
        </div>
      ) : null}
    </section>
  );
}
