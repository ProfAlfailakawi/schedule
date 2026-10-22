/**
 * ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسم ──────────────────────────────────
 * PDF من SWRCAPP يُرفع مرةً واحدة: يُقبل لقسمه وكليته المختارين فقط، وتُطبَّق مقررات القسم وحدها
 * مباشرةً (برقم المقرر، وأسماؤها مصحَّحة، والسعة كما هي)، ثم يعتمد القسم الصحيفة من «اعتماد الصحيفة».
 * الرفضُ صندوقٌ أحمر قصير بأيقونات، بلا نصٍّ طويل.
 */
import React, { useRef, useState } from "react";
import { AR, countOf } from "../utils/arabicCount";
import { AlertTriangle, CheckCircle2, Download, GraduationCap, FileUp, FileX2, History, Link2, PencilLine, Plus, SearchX, ShieldAlert, X } from "lucide-react";

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

type BatchPhase = "read" | "upload" | "prereq" | "done";
interface ReportRow {
  file: string; status: "ok" | "skipped" | "rejected" | "unreadable"; reason?: string; detail?: string;
  program?: string; programName?: string; year?: number; era?: "new" | "old";
  tracks?: number; sites?: number; sections?: string[]; plan?: string; created?: number; updated?: number; linked?: number;
  nameFixes?: number; otherDepartments?: number; prereqLinked?: number; prereqPrinted?: number; renames?: unknown[]; unresolved?: string[]; addedOther?: number; correctedOther?: number; noDepartment?: string[];
}
/** ما يُحفظ في التقرير من ردّ الخادم لصحيفةٍ مقبولة. */
const pick = (data: any): Partial<ReportRow> => ({
  tracks: Number(data.tracks || 1), sites: Number(data.sites || 1), sections: Array.isArray(data.sections) ? data.sections : [String(data.sectionName || "")],
  plan: String(data.planName || ""), created: Number(data.created || 0), updated: Number(data.updated || 0), linked: Number(data.linked || 0),
  nameFixes: typeof data.nameFixes === "number" ? data.nameFixes : Array.isArray(data.nameFixes) ? data.nameFixes.length : 0,
  otherDepartments: Number(data.otherDepartments || 0), prereqLinked: Number(data.prereqLinked || 0), prereqPrinted: Number(data.prereqPrinted || 0),
  renames: Array.isArray(data.renames) ? data.renames : [], unresolved: Array.isArray(data.unresolved) ? data.unresolved : [],
  addedOther: Number(data.addedOther || 0), correctedOther: Number(data.correctedOther || 0), noDepartment: Array.isArray(data.noDepartment) ? data.noDepartment : [],
});

/** رموز الأقسام المطبوعة في الصحف وغير الموجودة بالنظام، بعدد مقرراتها (للتقرير النهائي). */
const missingDepartments = (rows: ReportRow[]) => {
  const total = new Map<string, number>();
  for (const row of rows) for (const item of row.noDepartment || []) { const [code, count] = item.split("×"); total.set(code, Math.max(total.get(code) || 0, Number(count) || 0)); }
  return [...total].map(([code, courses]) => ({ code, courses })).sort((a, b) => a.code.localeCompare(b.code));
};

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
  const [batch, setBatch] = useState<{ phase: BatchPhase; done: number; total: number; ok: number; skipped: number; failed: number; prereqLinked: number; prereqPrinted: number; rows: ReportRow[] } | null>(null);

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

  /* رفعُ كل الملفات (جديدة وقديمة) دفعةً واحدة: تُقرأ ترويستُها أولاً، وتُوجَّه كل صحيفة إلى قسمها، ثم يُراجَع ما رُبط.
     ما عُرف قسمه وما رُفض وما تُرك (قديمةٌ أقدمُ من أحدث لبرنامجها) كلُّه في تقريرٍ يُنزَّل للمراجعة. */
  const uploadAll = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setRejection(null); setError(""); setOutcome(null);
    const state = { phase: "read" as BatchPhase, done: 0, total: files.length, ok: 0, skipped: 0, failed: 0, prereqLinked: 0, prereqPrinted: 0 };
    const rows: ReportRow[] = files.map(file => ({ file: file.name, status: "rejected" }));
    const publish = () => setBatch({ ...state, rows: rows.map(row => ({ ...row })) });
    publish();
    const post = async (path: string, file: File) => {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await file.arrayBuffer() });
      return { response, data: await response.json().catch(() => ({} as any)) };
    };
    /* 1) القراءة */
    const infos: Array<{ index: number; program: string; department: string; year: number; isNew: boolean } | null> = [];
    for (let index = 0; index < files.length; index += 1) {
      try {
        const { response, data } = await post("/api/plan-review/sheet/scan", files[index]);
        if (response.ok && data.readable) {
          infos.push({ index, program: data.program, department: data.department, year: Number(data.year) || 0, isNew: Boolean(data.isNew) });
          Object.assign(rows[index], { program: data.program, programName: data.programName, year: data.year, era: data.isNew ? "new" : "old" });
        } else { infos.push(null); rows[index] = { ...rows[index], status: "unreadable", reason: "الملف غير مقروء" }; state.failed += 1; }
      } catch { infos.push(null); rows[index] = { ...rows[index], status: "unreadable", reason: "تعذّر الرفع" }; state.failed += 1; }
      state.done += 1; publish();
    }
    /* 2) القديمة المتكررة لبرنامجٍ واحد: الأحدث وحدها */
    const readable = infos.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const latestOld = new Map<string, number>();
    for (const item of readable) if (!item.isNew) latestOld.set(`${item.program}|${item.department}`, Math.max(latestOld.get(`${item.program}|${item.department}`) || 0, item.year));
    const queue = readable.filter(item => {
      if (item.isNew || item.year >= (latestOld.get(`${item.program}|${item.department}`) || 0)) return true;
      rows[item.index] = { ...rows[item.index], status: "skipped", reason: `أقدم من صحيفة ${latestOld.get(`${item.program}|${item.department}`)} لنفس البرنامج` };
      state.skipped += 1; return false;
    }).sort((x, y) => Number(y.isNew) - Number(x.isNew));
    /* 3) الرفع: الجديدة أولاً */
    state.phase = "upload"; state.done = 0; state.total = queue.length; publish();
    let last = { sectionId: 0, planId: "" };
    const accepted: number[] = [];
    for (const item of queue) {
      try {
        const { response, data } = await post("/api/plan-review/sheet/import", files[item.index]);
        if (response.ok) { accepted.push(item.index); state.ok += 1; last = { sectionId: Number(data.sectionId || 0), planId: String(data.planId || "") }; rows[item.index] = { ...rows[item.index], status: "ok", ...pick(data) }; }
        else { state.failed += 1; rows[item.index] = { ...rows[item.index], status: "rejected", reason: data.rejection?.kind === "department" ? "لا قسم بهذا الاسم أو الرمز" : (SHORT[data.rejection?.kind]?.title || data.error || "تعذّر"), detail: data.rejection?.message }; }
      } catch { state.failed += 1; rows[item.index] = { ...rows[item.index], status: "rejected", reason: "تعذّر الرفع" }; }
      state.done += 1; publish();
    }
    /* 4) مرورٌ ثانٍ على ما قُبل: مسبقٌ لمقرر قسمٍ رُفع بعده يُربط الآن */
    state.phase = "prereq"; state.done = 0; state.total = accepted.length; publish();
    for (const index of accepted) {
      try { const { response, data } = await post("/api/plan-review/sheet/import", files[index]); if (response.ok) rows[index] = { ...rows[index], ...pick(data) }; } catch { /* المرور الأول كفى */ }
      state.done += 1; publish();
    }
    for (const index of accepted) { state.prereqLinked += rows[index].prereqLinked || 0; state.prereqPrinted += rows[index].prereqPrinted || 0; }
    state.phase = "done"; publish();
    setBusy(false);
    if (state.ok && last.sectionId) onDone(last.sectionId, last.planId);
  };

  /* تقريرُ الدفعة (ملفٌ يُنزَّل) للمراجعة: لكل ملفٍ ما دخل وأين وما رُفض ولماذا. */
  const downloadReport = () => {
    if (!batch) return;
    const text = JSON.stringify({ generatedAt: new Date().toISOString(), summary: { ok: batch.ok, skipped: batch.skipped, failed: batch.failed, prereqLinked: batch.prereqLinked, prereqPrinted: batch.prereqPrinted, missingDepartments: missingDepartments(batch.rows) }, files: batch.rows }, null, 1);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "تقرير-رفع-الصحف.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          {rejection.kind === "department" ? <p className="section-plan-reject-short" aria-hidden="true"><GraduationCap /> <b>القسم لا يطابق الصحيفة</b> <span>· اسماً ورمزاً</span></p>
            : short ? <p className="section-plan-reject-short" aria-hidden="true"><short.icon /> <b>{short.title}</b> <span>· {short.hint}</span></p>
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
          <span title="لم تدخل"><X aria-hidden="true" /> {batch.failed}</span>
          {batch.skipped ? <span title="قديمةٌ أقدمُ من أحدث لبرنامجها: تُركت"><History aria-hidden="true" /> {batch.skipped}</span> : null}
          {batch.phase === "done" && batch.prereqPrinted ? <span title="مسبقات مربوطة من المطبوعة؛ الباقي نصيحةُ PEN أو مقرراتُ أقسامٍ لم تُرفع صحائفها"><Link2 aria-hidden="true" /> {batch.prereqLinked}/{batch.prereqPrinted}</span> : null}
          <small>{batch.phase === "done" ? "تم" : `${batch.phase === "read" ? "قراءة" : batch.phase === "upload" ? "رفع" : "المسبقات"} · ${batch.done} / ${batch.total}`}</small>
          {batch.phase === "done" ? <button type="button" className="btn btn-secondary" onClick={downloadReport} data-guide-ignore="تنزيل تقرير رفع الصحائف للمراجعة داخل شاشة مراجعة الصحيفة"><Download aria-hidden="true" size={16} /> تقرير المراجعة</button> : null}
          {batch.rows.some(row => row.status !== "ok" && row.status !== "skipped") ? <ul>{batch.rows.filter(row => row.status !== "ok" && row.status !== "skipped").map((row, index) => <li key={index}><b>{row.file.replace(/\.pdf$/i, "")}</b> · {row.reason}</li>)}</ul> : null}
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
