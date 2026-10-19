import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer, QrCode, RefreshCw, Workflow, X } from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton, MicroLoader, EmptyState } from "./ui";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── نشرُ الصحيفة للجميع ───────────────────────────────────────────────────
 *
 * رئيس لجنة الجدول ينشر صحيفةً معتمدة فتصير رابطاً عاماً وQR وPDF بلا حساب (الخادمُ يرسم الصفحة بتصميم
 * قسم تكنولوجيا التعليم نفسه). الصفحةُ المنشورة لقطةٌ مستقلة: مسحُ الخطة بعد الاعتماد لا يُسقطها.
 * رمز QR يُرسم في المتصفح بالمولّد الموجود، فلا خدمةَ خارجية.
 */
interface SheetRow { planId: string; name: string; ruleVersion: number; published: boolean; publishedAt: string; stale: boolean; url: string }
interface SectionRow { sectionId: number; sectionName: string; collegeName?: string; label?: string; family?: string; track?: string; trackLabel?: string; members?: number[]; campuses?: number; sheets: SheetRow[]; deptUrl: string; indexUrl: string }
interface State { sections: SectionRow[]; canPublish: boolean }
type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };

const dateOf = (iso: string) => { try { return new Date(iso).toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; } };

async function call(url: string, body?: unknown) {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "تعذّر تنفيذ الطلب.");
  return json;
}

export default function PlanSheetPublisher({ onChanged, focusSectionId = 0, readOnly = false }: { onChanged?: () => void; focusSectionId?: number; readOnly?: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<{ title: string; url: string; svg: string } | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try { setState(await call(focusSectionId ? `/api/plan-sheets?section=${focusSectionId}` : "/api/plan-sheets")); setError(""); }
    catch (e: any) { setError(e?.message || "تعذّر تحميل الصحائف."); setState({ sections: [], canPublish: false }); }
  }, [focusSectionId]);
  useEffect(() => { void load(); }, [load]);

  /* قسمُ نطاق القرار المختار: رمزُ QR لصفحته يظهر في أعلى اللوحة بلا بحثٍ ولا ضغط. */
  /* للقسم مساران لا غير: بنات (بمواقعهنّ الجهراء والفحيحيل) وبنين — الصحيفةُ للبنات واحدة وتُنسخ إلى مواقعهنّ. */
  const labelOf = (row: SectionRow) => row.label || (row.trackLabel ? `${row.sectionName} — ${row.trackLabel}` : row.sectionName);
  const isFocus = (row: SectionRow) => row.sectionId === focusSectionId || Boolean(row.members?.includes(focusSectionId));
  const focus = state?.sections.find(isFocus);
  const focusPublished = Boolean(focus?.sheets.some(x => x.published));
  /* قسمٌ بالاسم نفسه في كليةٍ أخرى له صحائف معتمدة: سببُ «لا صحيفة» الشائع حين يُعتمد في كلية ويُختار نطاقُ كليةٍ أخرى. */
  const sibling = focus && !focus.sheets.length ? state?.sections.find(row => row.sectionId !== focus.sectionId && row.sectionName === focus.sectionName && row.family === focus.family && row.sheets.length > 0) : undefined;
  const [focusQr, setFocusQr] = useState("");
  useEffect(() => {
    let live = true;
    setFocusQr("");
    if (!focus || !focusPublished) return;
    import("../utils/qrcodeGenerator").then(mod => {
      const factory = mod.default as unknown as QrFactory;
      const code = factory(0, "M"); code.addData(focus.deptUrl); code.make();
      if (live) setFocusQr(code.createSvgTag({ scalable: true, margin: 2 }));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [focus?.deptUrl, focusPublished]);

  const run = async (key: string, task: () => Promise<string>) => {
    setBusy(key); setError(""); setNote("");
    try { setNote(await task()); await load(); onChanged?.(); }
    catch (e: any) { setError(e?.message || "تعذّر التنفيذ."); }
    finally { setBusy(""); }
  };
  const publish = (body: Record<string, unknown>, key: string) => run(key, async () => {
    const out = await call("/api/plan-sheets/publish", body);
    return `نُشرت ${countOf(out.published.length, AR.sheet)}${out.copiedToCampuses ? ` ونُسخت إلى ${countOf(out.copiedToCampuses, AR.sheet)} في الجهراء والفحيحيل` : ""}${out.unmatchedCampuses?.length ? ` (لم تُطابَق صحيفةٌ في: ${out.unmatchedCampuses.join("، ")})` : ""}.`
  });
  const unpublish = (planId: string) => run(`u${planId}`, async () => { await call("/api/plan-sheets/unpublish", { planId }); return "أُوقف نشر الصحيفة."; });

  const showQr = async (title: string, url: string) => {
    try {
      const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
      const code = factory(0, "M"); code.addData(url); code.make();
      setQr({ title, url, svg: code.createSvgTag({ scalable: true, margin: 2 }) });
    } catch { setError("تعذّر توليد رمز QR."); }
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(url); window.setTimeout(() => setCopied(""), 1600); } catch { /* نسخٌ يدوي من الحقل */ }
  };
  const downloadQr = () => {
    if (!qr) return;
    const svg = qr.svg.includes("xmlns=") ? qr.svg : qr.svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024); ctx.drawImage(image, 0, 0, 1024, 1024);
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "qr-plan.png"; a.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  /* ملصقُ A4 للقسم: الاسم والرمز كبيراً، يُعلَّق على لوحة القسم كملصق «مساري». */
  const printPoster = (target: { title: string; url: string; svg: string } | null = qr) => {
    if (!target) return;
    const win = window.open("", "_blank", "width=720,height=960");
    if (!win) { setError("اسمح بالنوافذ المنبثقة لطباعة الملصق."); return; }
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(target.title)}</title>
<style>@page{size:A4;margin:0}body{margin:0;font-family:"Plex Arabic",Tahoma,sans-serif;color:#0B2545;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.p{box-sizing:border-box;min-height:100vh;padding:64px 48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:linear-gradient(#EEF4FF,#fff)}
.k{font-size:20px;font-weight:700;color:#2563EB;letter-spacing:.5px}h1{margin:0;font-size:46px;line-height:1.3;font-weight:900}
.bar{width:140px;height:6px;border-radius:6px;background:linear-gradient(90deg,#EA580C 0 25%,#2563EB 25%)}
.qr{width:360px;height:360px;padding:18px;background:#fff;border-radius:28px;box-shadow:0 10px 40px rgba(11,37,69,.12);margin-top:18px}.qr svg{width:100%;height:100%}
p{margin:0;font-size:22px;font-weight:700}small{font-size:14px;color:#64748B;direction:ltr}</style></head>
<body><div class="p"><div class="k">الخطة الدراسية</div><h1>${esc(target.title)}</h1><div class="bar"></div><div class="qr">${target.svg}</div><p>امسح الرمز لتفتح الخطة التفاعلية</p><small>${esc(target.url)}</small></div></body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 250);
  };

  if (!state) return <MicroLoader />;
  /* رئيس لجنة الجدول: خريطة قسمه فقط، دون أي أزرار لنشر الصحائف أو إيقافها.
     لا نضع رابطاً لصحيفة غير منشورة، ولا نعرض أقساماً خارج النطاق المختار. */
  if (readOnly) {
    const published = focus?.sheets.filter(sheet => sheet.published) || [];
    return (
      <div className="psh" dir="rtl">
        <header className="psh-head">
          <span className="psh-ic" aria-hidden="true"><Workflow /></span>
          <div><strong>خريطة القسم</strong><small>مقررات القسم ومسبقاتها في الصحائف التفاعلية المنشورة</small></div>
        </header>
        {error ? <Notice type="error">{error}</Notice> : null}
        {focus && published.length ? (
          <>
            <section className="psh-focus" aria-label={`خريطة ${labelOf(focus)}`}>
              {focusQr ? <div className="psh-focus-qr" role="img" aria-label="رمز QR لخريطة القسم" dangerouslySetInnerHTML={{ __html: focusQr }} /> : <div className="psh-focus-qr empty" aria-hidden="true"><QrCode /></div>}
              <div className="psh-focus-body">
                <strong>{labelOf(focus)}</strong>
                <small>افتح الصحيفة التفاعلية؛ الأسهم تشرح المسبقات والمقررات التي تفتحها.</small>
                <span className="psh-focus-actions">
                  <a className="psh-open" href={focus.deptUrl} target="_blank" rel="noopener noreferrer" data-guide-ignore="فتح صحائف القسم المنشورة فقط"><ExternalLink /> افتح خريطة القسم</a>
                </span>
              </div>
            </section>
            <section className="psh-dept" aria-label="الصحائف المنشورة">
              <ul className="psh-list">
                {published.map(sheet => (
                  <li key={sheet.planId} className="live">
                    <span className="psh-name"><b>{sheet.name || "الخطة الدراسية"}</b><small>منشورة · {dateOf(sheet.publishedAt)}</small></span>
                    <span className="psh-row-actions">
                      <a className="psh-open" href={sheet.url} target="_blank" rel="noopener noreferrer" data-guide-ignore="فتح الصحيفة المنشورة فقط"><ExternalLink /> افتح</a>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : <EmptyState title="لا صحيفة منشورة لهذا القسم" detail="بعد اعتماد ونشر الصحيفة من إدارة النظام ستظهر خريطة قسمك هنا تلقائيًا." />}
      </div>
    );
  }
  if (!state.sections.length) return <EmptyState title="لا صحيفةَ معتمدة بعد" detail="اعتمد قواعد صحيفة القسم من «مراجعة الصحيفة» في القائمة، فتظهر هنا مع رمز QR ورابطها العام." />;
  const pending = state.sections.reduce((n, s) => n + s.sheets.filter(x => !x.published || x.stale).length, 0);
  const total = state.sections.reduce((n, s) => n + s.sheets.length, 0);
  const publishedCount = state.sections.reduce((n, s) => n + s.sheets.filter(x => x.published).length, 0);
  const indexUrl = state.sections[0].indexUrl;

  return (
    <div className="psh" dir="rtl">
      <header className="psh-head">
        <span className="psh-ic" aria-hidden="true"><Workflow /></span>
        <div><strong>انشر الصحيفة للجميع</strong><small>رابطٌ تفاعلي وQR وPDF بلا حساب · {publishedCount} من {total} منشورة</small></div>
        <div className="psh-head-actions">
          <PrimaryButton disabled={!pending || Boolean(busy)} onClick={() => publish({}, "all")} data-guide-ignore="نشر كل ما يملكه الحساب من صحائف معتمدة دفعةً واحدة">{busy === "all" ? "جارٍ النشر…" : `انشر كل صحائفي${pending ? ` (${pending})` : ""}`}</PrimaryButton>
          <SecondaryButton onClick={() => showQr("كل الأقسام", indexUrl)} data-guide-ignore="رمز QR لفهرس الخطط الدراسية العام"><QrCode /> QR كل الأقسام</SecondaryButton>
        </div>
      </header>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {focus ? (
        <section className={`psh-focus${focusPublished ? "" : " off"}`} aria-label={`صحيفة ${labelOf(focus)}`}>
          {focusPublished
            ? <div className="psh-focus-qr" role="img" aria-label="رمز QR لصفحة القسم" dangerouslySetInnerHTML={{ __html: focusQr }} />
            : <div className="psh-focus-qr empty" aria-hidden="true"><QrCode /></div>}
          <div className="psh-focus-body">
            <strong>{labelOf(focus)}</strong>
            {focusPublished ? <>
              <small>امسح الرمز لتفتح صحيفة القسم التفاعلية وملف PDF</small>
              <code dir="ltr">{focus.deptUrl}</code>
              <span className="psh-focus-actions">
                <SecondaryButton onClick={() => copy(focus.deptUrl)} data-guide-ignore="نسخ رابط صفحة القسم">{copied === focus.deptUrl ? <Check /> : <Copy />} انسخ الرابط</SecondaryButton>
                <a className="psh-open" href={`${focus.deptUrl}?pdf=1`} target="_blank" rel="noopener noreferrer" data-guide-ignore="تحميل PDF لصحائف القسم: تفتح الصفحة العامة وتبدأ الطباعة A3"><Download /> PDF</a>
                <SecondaryButton disabled={!focusQr} onClick={() => printPoster({ title: labelOf(focus), url: focus.deptUrl, svg: focusQr })} data-guide-ignore="طباعة ملصق A4 برمز QR لصفحة القسم"><Printer /> اطبع ملصقاً</SecondaryButton>
              </span>
            </> : <>
              <small>{focus.sheets.length ? "لم تُنشر صحيفة هذا القسم بعد. انشرها فيظهر رمز QR ورابطها هنا." : sibling
              ? `لم تُعتمد قواعد صحيفة ${focus.trackLabel || "هذا القسم"} بعد، أما صحيفة ${sibling.trackLabel || "المسار الآخر"} فمعتمدة. اعتمد هذه في «مراجعة الصحيفة» ثم تُنشر هنا.`
              : "لا صحيفة معتمدة لهذا القسم بعد. يعتمد رئيس لجنة الجدول قواعدها في «مراجعة الصحيفة» ثم تُنشر هنا."}</small>
              {focus.sheets.length ? <span className="psh-focus-actions">
                <PrimaryButton disabled={Boolean(busy)} onClick={() => publish({ sectionId: focus.sectionId }, `s${focus.sectionId}`)} data-guide-ignore="نشر صحيفة القسم المختار">{busy === `s${focus.sectionId}` ? "جارٍ النشر…" : "انشر صحيفة القسم"}</PrimaryButton>
              </span> : null}
            </>}
          </div>
        </section>
      ) : null}
      {note ? <Notice type="success" onDismiss={() => setNote("")}>{note}</Notice> : null}

      {[...state.sections].filter(row => row.sheets.length > 0 || !isFocus(row)).sort((x, y) => Number(isFocus(y)) - Number(isFocus(x))).map(section => {
        const todo = section.sheets.filter(x => !x.published || x.stale).length;
        return (
          <section className="psh-dept" key={section.sectionId}>
            <div className="psh-dept-head">
              <b>{labelOf(section)}</b>
              {section.campuses ? <small>مع الجهراء والفحيحيل</small> : null}
              <small>{countOf(section.sheets.length, AR.sheet)}</small>
              <span className="psh-dept-actions">
                {section.sheets.some(x => x.published) ? <>
                  <button type="button" className="psh-link" onClick={() => showQr(labelOf(section), section.deptUrl)} data-guide-ignore="رابط صفحة القسم العامة ورمز QR وPDF في نافذةٍ واحدة"><QrCode /> الروابط</button>
                </> : null}
                {section.sheets.length > 1 ? <SecondaryButton disabled={!todo || Boolean(busy)} onClick={() => publish({ sectionId: section.sectionId }, `s${section.sectionId}`)} data-guide-ignore="نشر كل صحائف هذا القسم دفعةً واحدة">{busy === `s${section.sectionId}` ? "جارٍ النشر…" : "انشر كل صحائف القسم"}</SecondaryButton> : null}
              </span>
            </div>
            <ul className="psh-list">
              {section.sheets.map(sheet => (
                <li key={sheet.planId} className={sheet.published ? (sheet.stale ? "stale" : "live") : "off"}>
                  <span className="psh-name"><b>{sheet.name || "الخطة الدراسية"}</b>
                    <small>{sheet.published ? (sheet.stale ? "تغيّرت بعد النشر — أعد النشر" : `منشورة · ${dateOf(sheet.publishedAt)}`) : "غير منشورة"}</small></span>
                  <span className="psh-row-actions">
                    {sheet.published ? <>
                      <button type="button" className="psh-ico" aria-label="الرابط وQR وPDF" title="الرابط وQR وPDF" data-guide-ignore="رابط هذه الصحيفة المنشورة ورمز QR وPDF في نافذةٍ واحدة" onClick={() => showQr(`${labelOf(section)} — ${sheet.name}`, sheet.url)}><QrCode /></button>
                    </> : null}
                    {!sheet.published || sheet.stale
                      ? <PrimaryButton disabled={Boolean(busy)} onClick={() => publish({ planId: sheet.planId, sectionId: section.sectionId }, `p${sheet.planId}`)} data-guide-ignore="نشر هذه الصحيفة للعامة">{busy === `p${sheet.planId}` ? <RefreshCw className="spin" /> : null}{sheet.stale ? "أعد النشر" : "انشر"}</PrimaryButton>
                      : <button type="button" className="psh-stop" disabled={Boolean(busy)} onClick={() => unpublish(sheet.planId)} data-guide-ignore="إيقاف نشر هذه الصحيفة">إيقاف</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {qr ? (
        <div className="psh-qr" role="dialog" aria-modal="true" aria-label={`رمز QR — ${qr.title}`} onClick={event => { if (event.target === event.currentTarget) setQr(null); }}>
          <div className="psh-qr-card">
            <button type="button" className="psh-qr-x" aria-label="إغلاق" data-guide-ignore="إغلاق نافذة رمز QR" onClick={() => setQr(null)}><X /></button>
            <strong>{qr.title}</strong>
            <div className="psh-qr-img" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <input readOnly value={qr.url} dir="ltr" onFocus={event => event.currentTarget.select()} aria-label="الرابط" />
            <div className="psh-qr-actions">
              <SecondaryButton onClick={() => copy(qr.url)} data-guide-ignore="نسخ رابط الصحيفة من نافذة رمز QR">{copied === qr.url ? <Check /> : <Copy />} انسخ الرابط</SecondaryButton>
              <a className="psh-open" href={`${qr.url}?pdf=1`} target="_blank" rel="noopener noreferrer" data-guide-ignore="تحميل PDF: تفتح الصفحة العامة وتبدأ الطباعة A3"><Download /> PDF</a>
              <a className="psh-open" href={qr.url} target="_blank" rel="noopener noreferrer" data-guide-ignore="فتح الصفحة العامة في تبويبٍ جديد"><ExternalLink /> افتح</a>
              <SecondaryButton onClick={downloadQr} data-guide-ignore="تنزيل رمز QR صورةً"><Download /> صورة QR</SecondaryButton>
              <SecondaryButton onClick={() => printPoster()} data-guide-ignore="طباعة ملصق A4 برمز QR للقسم أو الصحيفة"><Printer /> اطبع ملصقاً</SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
