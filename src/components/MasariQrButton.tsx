import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Printer, QrCode, X } from "lucide-react";
import { SecondaryButton, useDialogDismiss } from "./ui";

/**
 * ── رمز QR لـ«مساري» ─────────────────────────────────────────────────────────
 *
 * رابطٌ واحدٌ للجامعة كلها (`/me`): لا قسمَ فيه ولا فصلاً، فيُطبع الملصقُ مرةً ويبقى
 * صالحاً سنين، ويضعه كلُّ قسمٍ على لوحته. الرسمُ في المتصفح بالمولّد الموجود
 * (utils/qrcodeGenerator، يُحمَّل عند الطلب) — لا خدمةَ خارجية.
 */
type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };

export default function MasariQrButton({ sectionName }: { sectionName?: string; "data-guide-ignore"?: string }) {
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
      const url = `${window.location.origin}/me`;
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
      a.download = "qr-masari.png";
      a.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };
  const print = () => {
    if (!qr) return;
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مساري</title>
<style>body{font-family:"Plex Arabic",Tahoma,sans-serif;text-align:center;margin:0;padding:48px 24px;color:#111}
h1{font-size:44px;margin:0 0 6px;color:#1f6b5c}h2{font-size:20px;margin:0 0 8px;color:#333}p{font-size:18px;color:#444;margin:0 0 28px;line-height:1.9}.qr{width:340px;height:340px;margin:0 auto}
.qr svg{width:100%;height:100%}small{display:block;margin-top:22px;font-size:13px;color:#666;direction:ltr}</style></head>
<body><h1>مساري</h1>${sectionName ? `<h2>${esc(sectionName)}</h2>` : ""}<p>امسح الرمز: جدولك المتوقع قبل التسجيل، ورغباتك، وتذكرتك — في مكانٍ واحد</p><div class="qr">${qr.svg}</div><small>${esc(qr.url)}</small></body></html>`);
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
      <SecondaryButton type="button" onClick={start} aria-haspopup="dialog" data-guide-ignore="أزرارُ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation">
        <QrCode aria-hidden="true" /> رمز QR لمساري
      </SecondaryButton>
      {open ? createPortal(
        <div className="student-qr-backdrop" onClick={close}>
          <div className="student-qr-sheet" role="dialog" aria-modal="true" aria-label="رمز QR لمساري" onClick={e => e.stopPropagation()}>
            <header>
              <strong>رمز QR لمساري</strong>
              <button data-guide-ignore="أزرارُ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation" type="button" className="student-qr-close" onClick={close} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <p className="student-qr-lede">رابطٌ دائمٌ واحدٌ للجامعة كلها: يفتح «مساري» للطالب في أي فصل. اطبعه مرةً وضعه على لوحة القسم.</p>
            {busy ? <p className="student-qr-lede">يُولَّد الرمز…</p> : null}
            {error ? <p className="student-qr-error" role="alert">{error}</p> : null}
            {qr ? (
              <>
                <div className="student-qr-code" role="img" aria-label={`رمز QR للرابط ${qr.url}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
                <input className="student-qr-url" readOnly value={qr.url} dir="ltr" aria-label="رابط مساري" onFocus={e => e.currentTarget.select()} />
                <div className="student-qr-actions">
                  <SecondaryButton type="button" onClick={print} data-guide-ignore="أزرارُ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Printer aria-hidden="true" /> طباعة ملصق</SecondaryButton>
                  <SecondaryButton type="button" onClick={download} data-guide-ignore="أزرارُ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Download aria-hidden="true" /> تنزيل صورة</SecondaryButton>
                  <SecondaryButton type="button" onClick={copy} data-guide-ignore="أزرارُ رمز «مساري» داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Copy aria-hidden="true" /> {copied ? "نُسخ" : "نسخ الرابط"}</SecondaryButton>
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
