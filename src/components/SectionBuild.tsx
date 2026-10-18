import React, { useState } from "react";
import { CalendarCheck, CircleAlert, CheckCircle2, ClipboardPenLine, DoorClosed, Layers, Undo2, UserRoundX } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";
import { ImpactCard, postWhatIf, type ChangeImpact } from "./ApplyProposal";

/**
 * ── نزّل الشعب ───────────────────────────────────────────────────────────────
 *
 * يقارن ما اختاره القسم في «تخطيط الشعب» بما في جدول الفصل (المطلوب ٦، الموجود ٥، باقٍ ١)، ويبني
 * الباقي بمحرّك التوصيات نفسه، ويعرضه أسبوعاً قبل أن يكتب شيئاً. الكتابة كلها في الخادم بمساره
 * المشترك (النطاق، القفل، التعارض)، كلّها أو لا شيء، ولها تراجعٌ بضغطة.
 */

interface Placement { pending?: boolean; days?: string[]; index: number; day: string; dayLabel: string; start: string; end: string; roomCode: string; roomHall: string; instructorName: string; sectionCode: string; buildingId: string; roomId: string; instructorId: number }
interface BuildRow { courseId: number; name: string; code: string; target: number | null; existing: number; remaining: number; state: "done" | "missing" | "over" | "unset"; placements: Placement[]; unplaced: number; reason: string }
interface Built { rows: BuildRow[]; started: boolean; fingerprint: string; totals: { target: number; existing: number; remaining: number; placeable: number; pending: number; roomless: number } }

/** ما يفعله القسم لكل سببٍ يمنع البناء: يُستخرج من نصّ السبب القادم من الخادم. */
const FIX_FOR = (reason: string) => /قاعة/.test(reason) ? "أضِف سعة القاعات في سجلّ القاعات"
  : /أحمال|نصاب/.test(reason) ? "سجّل نصاب الأساتذة أو خفّف أحمالهم"
  : /أستاذ/.test(reason) ? "اختر أستاذاً من ورشة الجدول"
  : /وقت/.test(reason) ? "حرّر قاعةً أو أستاذاً في وقتٍ آخر"
  : /تاريخ|مدة/.test(reason) ? "أضِف أول موعدٍ للمقرر ليُعرف طوله" : "";

const call = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw Object.assign(new Error(data.error || "تعذّر التنفيذ."), { code: data.code });
  return data;
};

/** نقاطٌ بعدد المطلوب: ممتلئة = موجودة، ملوّنة = ستُنزَّل، مجوّفة = عالقة. */
function Dots({ row, picked }: { row: BuildRow; picked: Set<string> }) {
  const target = row.target ?? 0;
  const have = Math.min(row.existing, target);
  const will = row.placements.filter(p => picked.has(`${row.courseId}:${p.sectionCode}`)).length;
  const dots = Array.from({ length: Math.min(target, 12) }, (_, i) => i < have ? "have" : i < have + will ? "will" : "gap");
  return <span className="sb-dots" aria-hidden="true">{dots.map((kind, i) => <i key={i} className={`sb-dot ${kind}`} />)}</span>;
}

export default function SectionBuild({ collegeId, sectionId, termId, targets, onBuilt, onReview }: {
  key?: React.Key; collegeId: number; sectionId: number; termId: number; targets: Record<string, number>; onBuilt?: () => void;
  /** صفوفٌ بشكل نموذج الاستيراد تُفتح في شاشة المراجعة نفسها. */
  onReview?: (rows: any[], meta?: { existing: number; added: number; pending: number; existingKeys?: string[] }) => void;
}) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [impact, setImpact] = useState<ChangeImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<{ batchId: string; count: number; amendment: boolean } | null>(null);
  const [undone, setUndone] = useState(0);

  const base = { collegeId, sectionId, termId, targets };
  const look = async () => {
    setBusy(true); setError(""); setAsking(false); setDone(null); setUndone(0); setImpact(null);
    try {
      const data: Built = await call("/api/section-build/preview", base);
      setBuilt(data);
      setPicked(new Set(data.rows.flatMap(row => row.placements.filter(p => !p.pending).map(p => `${row.courseId}:${p.sectionCode}`))));
      const items = data.rows.flatMap(row => row.placements.filter(p => !p.pending).map(p => ({ collegeId, sectionId, courseId: row.courseId, placement: p })));
      if (items.length) postWhatIf({ kind: "openings", termId, items }).then(setImpact).catch(() => setImpact(null));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError("");
    try { const data = await call("/api/section-build/review-rows", { ...base, pick: [...picked, ...(built?.rows.flatMap(row => row.placements.filter(p => p.pending).map(p => `${row.courseId}:${p.sectionCode}`)) || [])] }); setBuilt(null); onReview?.(data.rows || [], { existing: Number(data.existing) || 0, added: Number(data.added) || 0, pending: Number(data.pending) || 0, existingKeys: Array.isArray(data.existingKeys) ? data.existingKeys.map(String) : undefined }); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const toggle = (key: string) => setPicked(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const apply = async () => {
    if (!built) return;
    setBusy(true); setError("");
    try {
      const data = await call("/api/section-build/apply", { ...base, fingerprint: built.fingerprint, pick: [...picked] });
      setDone({ batchId: data.batchId, count: (data.applied || []).length, amendment: Boolean(data.amendment) });
      setAsking(false); setBuilt(null); onBuilt?.();
    } catch (e: any) { setError(e.message); setAsking(false); if (e.code === "stale") setBuilt(null); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!done) return;
    setBusy(true); setError("");
    try { const data = await call("/api/section-build/undo", { collegeId, sectionId, termId, batchId: done.batchId }); setUndone(data.removed || 0); setDone(null); onBuilt?.(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const totals = built?.totals;
  const chosenCount = picked.size;
  const days = built ? [...new Map(built.rows.flatMap(row => row.placements.filter(p => picked.has(`${row.courseId}:${p.sectionCode}`)).map(p => [p.day, p.dayLabel] as const))).entries()] : [];

  return (
    <section className="sb" aria-label="نزّل الشعب">
      <header className="sb-head">
        <span className="sb-ic" aria-hidden="true"><Layers /></span>
        <div><b>نزّل الشعب</b><small>يقارن اختيارك بالجدول، ويبني الباقي بلا تعارض، ثم يعرضه قبل أن يكتب.</small></div>
        {!built && !done ? <PrimaryButton type="button" disabled={busy} onClick={look} data-guide-ignore="معاينة الشعب الباقية؛ لا يكتب شيئاً في الجدول">{busy ? "جارٍ البناء…" : "عاين ما سيُنزَّل"}</PrimaryButton> : null}
      </header>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {undone ? <Notice type="success" inline>تم التراجع: حُذفت {countOf(undone, AR.section)} من الجدول.</Notice> : null}
      {done ? (
        <div className="sb-done" role="status">
          <CheckCircle2 aria-hidden="true" />
          <p><b>نُزّلت {countOf(done.count, AR.section)}</b> في الجدول باسمك، ومصدرها «تخطيط الشعب».{done.amendment ? " الجدول كان مقبولاً من التسجيل فبدأت جولة تعديل." : ""}</p>
          <SecondaryButton type="button" disabled={busy} onClick={undo} data-guide-ignore="حذف الشعب التي نزّلتها هذه الدفعة"><Undo2 aria-hidden="true" /> تراجع</SecondaryButton>
          <SecondaryButton type="button" onClick={look} data-guide-ignore="إعادة قراءة الفجوة بعد التنزيل">أعد الفحص</SecondaryButton>
        </div>
      ) : null}
      {built && totals ? (
        <div className="sb-body">
          <p className="sb-totals" role="status">
            <span><b>{totals.target}</b> مطلوبة</span><span><b>{totals.existing}</b> موجودة</span><span className={totals.remaining ? "is-gap" : "is-ok"}><b>{totals.remaining}</b> باقية</span>
          </p>
          {built.rows.some(row => row.unplaced > 0) ? (
            <ul className="sb-why" aria-label="لماذا لم تُبنَ بعض الشعب">
              {[...built.rows.filter(row => row.unplaced > 0).reduce((map, row) => map.set(row.reason, (map.get(row.reason) || 0) + row.unplaced), new Map<string, number>()).entries()].map(([reason, n]) => (
                <li key={reason}><UserRoundX aria-hidden="true" /><span><b>{countOf(n, AR.section)}</b> {reason}{FIX_FOR(reason) ? <small>{FIX_FOR(reason)}</small> : null}</span></li>
              ))}
            </ul>
          ) : null}
          <ul className="sb-rows">
            {built.rows.filter(row => row.state !== "unset").map(row => (
              <li key={row.courseId} className={`sb-row s-${row.state}`}>
                <div className="sb-name"><b>{row.name}</b><small dir="ltr">{row.code}</small></div>
                <div className="sb-gap" aria-label={row.state === "over" ? `مطلوب ${row.target}، موجود ${row.existing}، زائد ${row.existing - (row.target ?? 0)}` : `مطلوب ${row.target}، موجود ${row.existing}، باقٍ ${row.remaining}`}>
                  <span><b>{row.target}</b><small>مطلوبة</small></span>
                  <span><b>{row.existing}</b><small>في الجدول</small></span>
                  <span className={row.remaining ? "is-gap" : "is-ok"}>{row.state === "done" ? <CheckCircle2 aria-hidden="true" /> : <b>{row.state === "over" ? row.existing - (row.target ?? 0) : row.remaining}</b>}<small>{row.state === "done" ? "مكتمل" : row.state === "over" ? "زائدة" : "باقية"}</small></span>
                  <Dots row={row} picked={picked} />
                </div>
                {row.placements.map(p => {
                  const key = `${row.courseId}:${p.sectionCode}`;
                  return p.pending ? (
                    <div key={key} className="sb-slot is-pending">
                      <span><b>شعبة {p.sectionCode}</b> · {p.dayLabel} {p.start}–{p.end}</span>
                      <small>{p.roomId ? `${p.roomCode}/${p.roomHall}` : <><DoorClosed aria-hidden="true" /> قاعة؟</>} · {p.instructorName || "أستاذ؟"}</small>
                    </div>
                  ) : (
                    <label key={key} className="sb-slot">
                      <input type="checkbox" checked={picked.has(key)} onChange={() => toggle(key)} />
                      <span><b>شعبة {p.sectionCode}</b> · {p.dayLabel} {p.start}–{p.end}</span>
                      <small>{p.roomCode}/{p.roomHall} · {p.instructorName}</small>
                    </label>
                  );
                })}
                {row.unplaced > 0 ? <p className="sb-stuck"><UserRoundX aria-hidden="true" /> <b>{countOf(row.unplaced, AR.section)} لم تُبنَ:</b> {row.reason}</p> : null}
              </li>
            ))}
          </ul>
          {days.length ? <p className="sb-days"><CalendarCheck aria-hidden="true" /> تقع في: {days.map(([, label]) => label).join("، ")}</p> : null}
          {impact ? <ImpactCard impact={impact} /> : null}
          {!totals.placeable && totals.remaining ? <Notice type="warning" inline><CircleAlert aria-hidden="true" /> لا شعبة قابلة للبناء الآن؛ أسباب كل مقرر أعلاه.</Notice> : null}
          {!totals.remaining ? <Notice type="success" inline>كل ما اخترته موجودٌ في الجدول.</Notice> : null}
          {totals.placeable > 0 && onReview ? (
            <div className="sb-review">
              <ClipboardPenLine aria-hidden="true" />
              <p>
                افتح الشعب المقترحة (<b>{countOf(chosenCount + totals.pending, AR.section)}</b>) في المراجعة لتعدّلها ثم تنزّلها.
                {totals.roomless > 0 ? <> <b>{countOf(totals.roomless, AR.section)}</b> منها بلا قاعة، تختارها هناك.</> : null}
              </p>
              <PrimaryButton type="button" disabled={busy} onClick={review} data-guide-ignore="فتح الشعب المقترحة مع مواعيد القسم الحالية في شاشة مراجعة الاستيراد للتعديل قبل النشر">راجع وعدّل</PrimaryButton>
            </div>
          ) : null}
          {chosenCount ? (
            asking ? (
              <div className="sb-confirm" role="alertdialog" aria-modal="false" aria-label="تأكيد تنزيل الشعب">
                <p>ستُكتب <b>{countOf(chosenCount, AR.section)}</b> في جدول الفصل باسم حسابك، بعد فحص التعارض من جديد. لا تُكتب شعبةٌ واحدة إن تعذّرت إحداها، ويمكنك التراجع بعدها.</p>
                <div><PrimaryButton type="button" disabled={busy} onClick={apply} data-guide-ignore="تأكيد كتابة الشعب في الجدول">{busy ? "جارٍ الكتابة…" : "نعم، نزّلها"}</PrimaryButton><SecondaryButton type="button" onClick={() => setAsking(false)} data-guide-ignore="إلغاء التنزيل">لا</SecondaryButton></div>
              </div>
            ) : <div className="sb-actions"><PrimaryButton type="button" onClick={() => setAsking(true)} data-guide-ignore="طلب تأكيد تنزيل الشعب">نزّل {countOf(chosenCount, AR.section)} مباشرة</PrimaryButton><SecondaryButton type="button" onClick={() => setBuilt(null)} data-guide-ignore="إغلاق المعاينة دون كتابة">إغلاق</SecondaryButton></div>
          ) : <div className="sb-actions"><SecondaryButton type="button" onClick={() => setBuilt(null)} data-guide-ignore="إغلاق المعاينة">إغلاق</SecondaryButton></div>}
        </div>
      ) : null}
    </section>
  );
}
