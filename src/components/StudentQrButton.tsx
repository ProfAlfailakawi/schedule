import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Printer, QrCode, X } from "lucide-react";
import { SecondaryButton, useDialogDismiss } from "./ui";

/**
 * ── رمز QR لجدول الطلبة ──────────────────────────────────────────────────────
 *
 * ضغطةٌ واحدة: يُصدَر (أو يُعاد) رابطُ القسم للطلبة (kind: "students")، ويُرسم
 * رمزُه في المتصفح بالمولّد الموجود (utils/qrcodeGenerator، يُحمَّل عند الطلب)،
 * ويُطبع ملصقاً أو يُنزَّل صورةً. الرابط يفتح دائماً الجدولَ المعتمد للفصل
 * الجاري، فالملصق المطبوع لا يتقادم بانتقال الفصل.
 */
type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };

interface Props { collegeId: number; sectionId: number; termId: number; sectionName?: string; "data-guide-feature-id"?: string }

export default function StudentQrButton({ collegeId, sectionId, termId, sectionName }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const close = () => setOpen(false);
  useDialogDismiss(open, close);

  const start = async () => {
    setOpen(true); setError(null);
    if (qr) return;
    setBusy(true);
    try {
      const response = await fetch("/api/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, kind: "students", showInstructors: true }),
      });
      const link = await response.json().catch(() => null);
      if (!response.ok || !link?.id) throw new Error(link?.error || "تعذّر إصدار رابط الطلبة");
      const url = `${window.location.origin}/t/${link.id}`;
      const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
      const code = factory(0, "M");
      code.addData(url);
      code.make();
      setQr({ url, svg: code.createSvgTag({ scalable: true, margin: 2 }) });
    } catch (e: any) {
      setError(e?.message || "تعذّر توليد رمز QR");
    } finally {
      setBusy(false);
    }
  };

  const title = `جدول ${sectionName || "القسم"}`;
  const download = () => {
    if (!qr) return;
    const svg = qr.svg.includes("xmlns=") ? qr.svg : qr.svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(image, 0, 0, 1024, 1024);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `qr-${title.replace(/\s+/g, "-")}.png`;
      a.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  const print = () => {
    if (!qr) return;
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:"Plex Arabic",Tahoma,sans-serif;text-align:center;margin:0;padding:48px 24px;color:#111}
h1{font-size:34px;margin:0 0 8px}p{font-size:18px;color:#444;margin:0 0 28px}.qr{width:340px;height:340px;margin:0 auto}
.qr svg{width:100%;height:100%}small{display:block;margin-top:22px;font-size:13px;color:#666;direction:ltr}</style></head>
<body><h1>${esc(title)}</h1><p>امسح الرمز لترى جدول الفصل الجاري: ابحث عن مقررك وصفِّ باليوم</p><div class="qr">${qr.svg}</div><small>${esc(qr.url)}</small></body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 250);
  };
  const copy = async () => {
    if (!qr) return;
    try { await navigator.clipboard.writeText(qr.url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* نسخٌ يدوي من الحقل */ }
  };

  return (
    <>
      <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={start} aria-haspopup="dialog">
        <QrCode aria-hidden="true" /> رمز QR للطلبة
      </SecondaryButton>
      {open ? createPortal(
        <div className="student-qr-backdrop" onClick={close}>
          <div className="student-qr-sheet" role="dialog" aria-modal="true" aria-label="رمز QR لجدول الطلبة" onClick={e => e.stopPropagation()}>
            <header>
              <strong>رمز QR لجدول الطلبة</strong>
              <button data-guide-feature-id="schedule.tool.data" type="button" className="student-qr-close" onClick={close} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <p className="student-qr-lede">يفتح الجدولَ <b>المعتمد</b> للفصل الجاري، ببحثٍ وتصفيةٍ باليوم. رمزٌ واحدٌ يبقى صالحاً عاماً كاملاً — اطبعه مرة.</p>
            {busy ? <p className="student-qr-lede">يُولَّد الرمز…</p> : null}
            {error ? <p className="student-qr-error" role="alert">{error}</p> : null}
            {qr ? (
              <>
                <div className="student-qr-code" role="img" aria-label={`رمز QR للرابط ${qr.url}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
                <input className="student-qr-url" readOnly value={qr.url} dir="ltr" aria-label="رابط جدول الطلبة" onFocus={e => e.currentTarget.select()} />
                <div className="student-qr-actions">
                  <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={print}><Printer aria-hidden="true" /> طباعة ملصق</SecondaryButton>
                  <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={download}><Download aria-hidden="true" /> تنزيل صورة</SecondaryButton>
                  <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={copy}><Copy aria-hidden="true" /> {copied ? "نُسخ" : "نسخ الرابط"}</SecondaryButton>
                </div>
              </>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
