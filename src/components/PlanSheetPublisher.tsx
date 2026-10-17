import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Link2, QrCode, RefreshCw, Workflow, X } from "lucide-react";
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
interface SectionRow { sectionId: number; sectionName: string; sheets: SheetRow[]; deptUrl: string; indexUrl: string }
interface State { sections: SectionRow[]; canPublish: boolean }
type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };

const dateOf = (iso: string) => { try { return new Date(iso).toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; } };

async function call(url: string, body?: unknown) {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "تعذّر تنفيذ الطلب.");
  return json;
}

export default function PlanSheetPublisher({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<{ title: string; url: string; svg: string } | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try { setState(await call("/api/plan-sheets")); setError(""); }
    catch (e: any) { setError(e?.message || "تعذّر تحميل الصحائف."); setState({ sections: [], canPublish: false }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, task: () => Promise<string>) => {
    setBusy(key); setError(""); setNote("");
    try { setNote(await task()); await load(); onChanged?.(); }
    catch (e: any) { setError(e?.message || "تعذّر التنفيذ."); }
    finally { setBusy(""); }
  };
  const publish = (body: Record<string, unknown>, key: string) => run(key, async () => {
    const out = await call("/api/plan-sheets/publish", body);
    return `نُشرت ${countOf(out.published.length, AR.sheet)}.`;
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

  if (!state) return <MicroLoader />;
  if (!state.sections.length) return <EmptyState title="لا صحائف معتمدة لتُنشر" detail="تظهر هنا الصحائف التي اعتمدتها بعد مراجعتها." />;
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
      {note ? <Notice type="success" onDismiss={() => setNote("")}>{note}</Notice> : null}

      {state.sections.map(section => {
        const todo = section.sheets.filter(x => !x.published || x.stale).length;
        return (
          <section className="psh-dept" key={section.sectionId}>
            <div className="psh-dept-head">
              <b>{section.sectionName}</b>
              <small>{countOf(section.sheets.length, AR.sheet)}</small>
              <span className="psh-dept-actions">
                {section.sheets.some(x => x.published) ? <>
                  <button type="button" className="psh-link" onClick={() => showQr(section.sectionName, section.deptUrl)} data-guide-ignore="رمز QR لصفحة القسم التي تجمع كل صحائفه"><QrCode /> QR القسم</button>
                  <button type="button" className="psh-link" onClick={() => copy(section.deptUrl)} data-guide-ignore="نسخ رابط صفحة القسم">{copied === section.deptUrl ? <Check /> : <Link2 />} رابط القسم</button>
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
                      <button type="button" className="psh-ico" aria-label="رمز QR" title="رمز QR" data-guide-ignore="رمز QR لهذه الصحيفة المنشورة" onClick={() => showQr(`${section.sectionName} — ${sheet.name}`, sheet.url)}><QrCode /></button>
                      <button type="button" className="psh-ico" aria-label="نسخ الرابط" title="نسخ الرابط" data-guide-ignore="نسخ رابط هذه الصحيفة المنشورة" onClick={() => copy(sheet.url)}>{copied === sheet.url ? <Check /> : <Copy />}</button>
                      <a className="psh-ico" aria-label="فتح الصحيفة" title="فتح الصحيفة" data-guide-ignore="فتح الصفحة العامة للصحيفة في تبويبٍ جديد" href={sheet.url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
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
              <SecondaryButton onClick={downloadQr} data-guide-ignore="تنزيل رمز QR صورةً"><Download /> تنزيل QR</SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
