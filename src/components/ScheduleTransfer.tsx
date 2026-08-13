import React, { useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Copy, Download, Plus, Upload, UserMinus, UserPlus, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";

/**
 * Moving a term in, out, and off one person's shoulders.
 *
 * Three jobs that all mean "change many appointments at once", kept in one
 * place because they share the same discipline: nothing happens until the
 * consequence has been shown and accepted. Import previews what it would add
 * and what it cannot place; retiring a member of staff previews how many
 * appointments would change hands. The commit is a second, deliberate press.
 */

interface Instructor {
  AdInstructorId: number;
  AdInstructorName: string;
  AdInstructorCivil?: string;
}

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  instructors: Instructor[];
  /** Ids that actually teach in the open scope, so the list is short. */
  departmentIds: number[];
  /** Every term, so the roster can be started from another one. */
  terms: Array<{ AdTermId: number; AdTermName: string }>;
  /**
   * Carrying a whole term in or out, and reassigning a member of staff across
   * it, are administrator work. A department manages its own visiting roster
   * and nothing else here, so the other three tabs are simply absent for them —
   * a disabled tab still invites the question of why.
   */
  canTransfer: boolean;
  onChanged: () => void;
  onClose: () => void;
}

type Tab = "export" | "import" | "retire" | "visiting";

export default function ScheduleTransfer({ collegeId, sectionId, termId, instructors, departmentIds, terms, canTransfer, onChanged, onClose }: Props) {
  const [tab, setTab] = useState<Tab>(canTransfer ? "export" : "visiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [payload, setPayload] = useState<any>(null);
  const [fromId, setFromId] = useState(0);
  const [toId, setToId] = useState(0);
  const [retirePreview, setRetirePreview] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [roster, setRoster] = useState<number[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const [copyFrom, setCopyFrom] = useState(0);

  React.useEffect(() => {
    if (tab !== "visiting" || !scopeReadyRef.current) return;
    const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
    fetch(`/api/visiting-roster?${query}`)
      .then(response => (response.ok ? response.json() : { instructorIds: [] }))
      .then(data => { setRoster(data.instructorIds || []); setRosterLoaded(true); })
      .catch(() => setRosterLoaded(true));
  }, [tab, collegeId, sectionId, termId]);

  const saveRoster = async (ids: number[]) => {
    setRoster(ids);
    setBusy(true);
    try {
      await fetch("/api/visiting-roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, instructorIds: ids })
      });
      onChanged();
    } finally { setBusy(false); }
  };

  const copyRoster = async () => {
    if (!copyFrom) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/visiting-roster/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, fromTermId: copyFrom, toTermId: termId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر النسخ");
      setRoster(data.instructorIds || []);
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const scopeReady = Boolean(collegeId && sectionId && termId);
  const scopeReadyRef = useRef(scopeReady);
  scopeReadyRef.current = scopeReady;
  const named = (id: number) => instructors.find(x => x.AdInstructorId === id)?.AdInstructorName || "";
  const departmentStaff = departmentIds
    .map(id => instructors.find(x => x.AdInstructorId === id))
    .filter(Boolean) as Instructor[];

  const exportTerm = () => {
    const query = new URLSearchParams();
    if (collegeId) query.set("collegeId", String(collegeId));
    if (sectionId) query.set("sectionId", String(sectionId));
    if (termId) query.set("termId", String(termId));
    window.location.href = `/api/schedules/export?${query}`;
  };

  const readFile = async (file: File) => {
    setError(null); setPreview(null); setPayload(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : null;
      if (!rows) throw new Error("الملف لا يطابق صيغة تصدير الجدول.");
      setPayload(rows);
      await run(rows, false);
    } catch (e: any) {
      setError(e.message || "تعذر قراءة الملف");
    }
  };

  const run = async (rows: any[], commit: boolean) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/schedules/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, rows, commit })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر الاستيراد");
      setPreview(data);
      if (commit) { onChanged(); }
    } catch (e: any) {
      setError(e.message || "تعذر الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const retire = async (commit: boolean) => {
    if (!fromId) { setError("اختر الأستاذ المراد استبداله."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/schedules/replace-instructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromInstructorId: fromId, toInstructorId: toId, collegeId, sectionId, termId, commit })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر التنفيذ");
      if (commit) { setRetirePreview(null); setFromId(0); setToId(0); onChanged(); onClose(); }
      else setRetirePreview(Number(data.affected || 0));
    } catch (e: any) {
      setError(e.message || "تعذر التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="transfer-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="transfer-sheet" role="dialog" aria-modal="true" aria-label="نقل الجدول">
        <header>
          <div>
            <span className="surface-kicker">{canTransfer ? "الجدول كوحدة واحدة" : "أساتذة الفصل"}</span>
            <h2>{canTransfer ? "استيراد · تصدير · استبدال" : "المنتدبون"}</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        <nav className="transfer-tabs">
          {canTransfer ? (
            <>
              <button type="button" className={tab === "export" ? "active" : ""} onClick={() => setTab("export")}><Download />تصدير</button>
              <button type="button" className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}><Upload />استيراد</button>
              <button type="button" className={tab === "retire" ? "active" : ""} onClick={() => setTab("retire")}><UserMinus />استبدال أستاذ</button>
            </>
          ) : null}
          <button type="button" className={tab === "visiting" ? "active" : ""} onClick={() => setTab("visiting")}><UserPlus />المنتدبون</button>
        </nav>

        {!scopeReady ? (
          <p className="transfer-note"><AlertTriangle />اختر الكلية والقسم والفصل أولاً.</p>
        ) : null}
        {error ? <p className="transfer-error"><AlertTriangle />{error}</p> : null}

        <div className="transfer-body">
          {canTransfer && tab === "export" ? (
            <>
              <p>يُصدَّر الفصل الحالي كاملاً بصيغة نصية مقروءة — الرموز والأسماء والأوقات والأيام — صالحة للأرشفة أو للاستيراد في نسخة أخرى.</p>
              <PrimaryButton type="button" onClick={exportTerm} disabled={!scopeReady}><Download />نزّل ملف الفصل</PrimaryButton>
            </>
          ) : null}

          {canTransfer && tab === "import" ? (
            <>
              <p>يُطابَق كل صف بـ <b>رمز المقرر</b> و<b>الرقم المدني للأستاذ</b>، لا بالمعرّفات الداخلية. لا يُكتب شيء قبل أن ترى الحصيلة وتوافق.</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="transfer-file"
                onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }}
              />
              <SecondaryButton type="button" onClick={() => fileRef.current?.click()} disabled={!scopeReady || busy}>
                <Upload />اختر ملفاً
              </SecondaryButton>

              {preview ? (
                <div className="transfer-preview">
                  <div className="transfer-counts">
                    <span><b>{Number(preview.ready ?? preview.added ?? 0).toLocaleString("ar-KW-u-nu-latn")}</b>{preview.preview ? "جاهز للإضافة" : "أُضيف"}</span>
                    <span className="warn"><b>{(preview.rejected?.length || 0).toLocaleString("ar-KW-u-nu-latn")}</b>مرفوض</span>
                  </div>
                  {preview.rejected?.length ? (
                    <ul className="transfer-rejected">
                      {preview.rejected.slice(0, 8).map((item: any, index: number) => (
                        <li key={index}><b>{item.label}</b><span>{item.reason}</span></li>
                      ))}
                      {preview.rejected.length > 8 ? <li className="muted">و{preview.rejected.length - 8} غيرها…</li> : null}
                    </ul>
                  ) : null}
                  {preview.preview && preview.ready ? (
                    <PrimaryButton type="button" onClick={() => payload && run(payload, true)} disabled={busy}>
                      {busy ? "يستورد…" : `أضف ${Number(preview.ready).toLocaleString("ar-KW-u-nu-latn")} موعداً`}
                    </PrimaryButton>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "visiting" ? (
            <>
              <p>قائمة المنتدبين لهذا الفصل. من تختاره هنا يظهر في الجدول بعلامة «منتدب» بجانب اسمه، ويمكنك بدء الفصل الجديد بنسخ قائمة فصل سابق بدل كتابتها من جديد.</p>
              <div className="roster-copy">
                <select value={copyFrom || ""} onChange={e => setCopyFrom(Number(e.target.value) || 0)}>
                  <option value="">انسخ من فصل…</option>
                  {terms.filter(term => Number(term.AdTermId) !== termId).map(term => (
                    <option key={term.AdTermId} value={term.AdTermId}>{term.AdTermName}</option>
                  ))}
                </select>
                <SecondaryButton type="button" onClick={copyRoster} disabled={!copyFrom || busy}><Copy />انسخ</SecondaryButton>
              </div>
              <input
                className="roster-search"
                value={rosterQuery}
                onChange={e => setRosterQuery(e.target.value)}
                placeholder="ابحث عن اسم لإضافته"
                aria-label="ابحث عن أستاذ"
              />
              <div className="roster-list">
                {/* Arabic names differ in ways that must never hide a match: the
                    definite article, hamza seats, taa marbuta, and the titles
                    that may or may not be written. */}
                {(rosterQuery.trim()
                  ? instructors
                      .filter(person => {
                        const fold = (value: string) => String(value || "")
                          .replace(/[\u064B-\u0652\u0640]/g, "")
                          .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
                          .replace(/\s+/g, " ").trim().toLowerCase();
                        const needle = fold(rosterQuery);
                        return fold(person.AdInstructorName).includes(needle) ||
                          String(person.AdInstructorCivil || "").includes(rosterQuery.trim());
                      })
                      .slice(0, 25)
                  : instructors.filter(person => roster.includes(person.AdInstructorId))
                ).map(person => {
                  const on = roster.includes(person.AdInstructorId);
                  return (
                    <button
                      type="button"
                      key={person.AdInstructorId}
                      className={on ? "on" : ""}
                      onClick={() => saveRoster(on
                        ? roster.filter(id => id !== person.AdInstructorId)
                        : [...roster, person.AdInstructorId])}
                    >
                      {on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      <span className="instructor-identity">
                        <b>{person.AdInstructorName}</b>
                        <small dir="ltr">{person.AdInstructorCivil || "—"}</small>
                      </span>
                    </button>
                  );
                })}
                {rosterLoaded && !rosterQuery.trim() && !roster.length ? (
                  <p className="roster-empty">لا منتدبين في هذا الفصل بعد — ابحث عن اسم أو انسخ قائمة فصل سابق.</p>
                ) : null}
                {rosterQuery.trim() && !instructors.some(person =>
                  person.AdInstructorName.includes(rosterQuery.trim()) ||
                  String(person.AdInstructorCivil || "").includes(rosterQuery.trim())) ? (
                  <p className="roster-empty">لا اسم يطابق «{rosterQuery.trim()}». أضِف الأستاذ من سجل الأساتذة أولاً ثم اختره هنا.</p>
                ) : null}
              </div>
            </>
          ) : null}

          {canTransfer && tab === "retire" ? (
            <>
              <p>لأستاذ تقاعد أو استقال أو تفرّغ: تنتقل كل مواعيده في هذا الفصل إلى بديل بضغطة واحدة، أو تُترك بلا أستاذ لتوزَّع لاحقاً. لا يُحذف أي موعد.</p>
              <div className="transfer-swap">
                <label>
                  <span>من</span>
                  <select value={fromId || ""} onChange={e => { setFromId(Number(e.target.value) || 0); setRetirePreview(null); }}>
                    <option value="">اختر الأستاذ</option>
                    {departmentStaff.map(person => (
                      <option key={person.AdInstructorId} value={person.AdInstructorId}>{person.AdInstructorName}</option>
                    ))}
                  </select>
                </label>
                <ArrowLeftRight aria-hidden="true" />
                <label>
                  <span>إلى</span>
                  <select value={toId || ""} onChange={e => setToId(Number(e.target.value) || 0)}>
                    <option value="">اتركها بلا أستاذ</option>
                    {instructors.map(person => (
                      <option key={person.AdInstructorId} value={person.AdInstructorId}>{person.AdInstructorName}</option>
                    ))}
                  </select>
                </label>
              </div>
              {retirePreview === null ? (
                <SecondaryButton type="button" onClick={() => retire(false)} disabled={!fromId || busy}>
                  كم موعداً سيتغيّر؟
                </SecondaryButton>
              ) : (
                <div className="transfer-preview">
                  <div className="transfer-counts">
                    <span><b>{retirePreview.toLocaleString("ar-KW-u-nu-latn")}</b>موعد سينتقل</span>
                  </div>
                  <p className="transfer-note">
                    {toId ? `من ${named(fromId)} إلى ${named(toId)}.` : `من ${named(fromId)} إلى «بلا أستاذ» — ستظهر كمواعيد ناقصة في مراجعة الاعتماد.`}
                  </p>
                  {retirePreview ? (
                    <PrimaryButton type="button" onClick={() => retire(true)} disabled={busy}>
                      {busy ? "ينفّذ…" : "نفّذ الاستبدال"}
                    </PrimaryButton>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
