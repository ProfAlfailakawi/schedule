import React, { useEffect, useState } from "react";
import { Check, Copy, Download, KeyRound, Link, Send, X } from "lucide-react";
import BrandMark from "./BrandMark";
import "./account-invitation.css";

type Props = { name: string; login: string; active: boolean; hasPassword?: boolean };
const SITE = "https://schedule-kw.com/";

export default function AccountInvitation({ name, login, active, hasPassword }: Props) {
  const [open, setOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("12345678");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOpen(false);
    setTemporaryPassword("12345678");
    setStatus("");
  }, [login]);
  const invite = new URLSearchParams({ username: login, password: temporaryPassword });
  const url = `${SITE}#invite&${invite.toString()}`;
  const message = `أهلًا بـ${name}\n\nبيانات دخولكم إلى *SCHEDULE*\nنظام القرار الأكاديمي\n\nرابط الدخول:\n${url}\n\nاسم المستخدم:\n${login}\n\nكلمة المرور المؤقتة:\n${temporaryPassword}\n\nاحتفظوا ببيانات الدخول لدى المسؤول عن الحساب.`;
  const ready = active && hasPassword !== false && Boolean(temporaryPassword.trim());

  async function copy() {
    try { await navigator.clipboard.writeText(message); setStatus("نُسخت الرسالة، جاهزة للصق في واتساب"); }
    catch { setStatus("تعذّر النسخ. حاول مرة أخرى من متصفح يدعم الحافظة."); }
  }

  async function download() {
    setBusy(true); setStatus("");
    try {
      await Promise.all([
        document.fonts.load('400 28px "Plex Arabic"', "دعوة إلى مساحة عملكم"),
        document.fonts.load('700 80px "Plex Arabic"', "SCHEDULE"),
        document.fonts.load('600 56px "Plex Mono"', login),
      ]);
      await document.fonts.ready;
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 1440;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#f4f2eb";
      ctx.beginPath(); ctx.roundRect(0, 0, 1200, 900, 28); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, 1200, 900, 28); ctx.clip();
      ctx.fillStyle = "#123e35"; ctx.fillRect(0, 0, 1200, 350);
      const markSource = document.querySelector<SVGSVGElement>(".invitation-card header svg");
      if (markSource) {
        const mark = markSource.cloneNode(true) as SVGSVGElement;
        mark.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        mark.querySelectorAll("rect").forEach((rect, index) => {
          const source = markSource.querySelectorAll("rect")[index];
          if (!source) return;
          const computed = getComputedStyle(source);
          rect.style.fill = computed.fill;
          rect.style.stroke = computed.stroke;
          rect.style.strokeOpacity = computed.strokeOpacity;
          rect.style.strokeWidth = computed.strokeWidth;
        });
        const svg = new XMLSerializer().serializeToString(mark);
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();
        ctx.drawImage(image, 52, 52, 64, 64);
      }
      ctx.textAlign = "right"; ctx.direction = "rtl";
      ctx.font = '500 28px "Plex Arabic", sans-serif'; ctx.fillStyle = "#d5bd84"; ctx.fillText("دعوة إلى مساحة عملكم", 1090, 130);
      ctx.font = '700 68px "Plex Arabic", sans-serif'; ctx.fillStyle = "#ffffff"; ctx.fillText("SCHEDULE", 1090, 225);
      ctx.font = '400 28px "Plex Arabic", sans-serif'; ctx.fillStyle = "#e2e8e0"; ctx.fillText("نظام القرار الأكاديمي", 1090, 285);
      ctx.restore();
      ctx.textAlign = "right"; ctx.direction = "rtl";
      ctx.fillStyle = "#123e35"; ctx.font = '700 38px "Plex Arabic", sans-serif';
      // Fit long department names without truncating the recipient's identity.
      let size = 38; while (ctx.measureText(name).width > 1060 && size > 24) { ctx.font = `700 ${--size}px "Plex Arabic", sans-serif`; }
      ctx.fillText(name, 1090, 470);
      ctx.font = '400 26px "Plex Arabic", sans-serif'; ctx.fillStyle = "#68766e"; ctx.fillText("أهلًا بكم، هنا تبدأ خطوتكم القادمة", 1090, 530);
      const credential = (label: string, value: string, y: number) => {
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(100, y, 1000, 205, 26); ctx.fill();
        ctx.textAlign = "right"; ctx.direction = "rtl"; ctx.font = '400 25px "Plex Arabic", sans-serif'; ctx.fillStyle = "#68766e"; ctx.fillText(label, 1050, y + 68);
        ctx.textAlign = "center"; ctx.direction = "ltr"; let fontSize = 42; ctx.font = `600 ${fontSize}px "Plex Mono", monospace`;
        while (ctx.measureText(value).width > 900 && fontSize > 18) ctx.font = `600 ${--fontSize}px "Plex Mono", monospace`;
        ctx.fillStyle = "#123e35"; ctx.fillText(value, 600, y + 145);
      };
      credential("اسم المستخدم", login, 620); credential("كلمة المرور المؤقتة", temporaryPassword, 855);
      ctx.textAlign = "center"; ctx.direction = "ltr"; ctx.font = '600 30px "Plex Arabic", sans-serif'; ctx.fillStyle = "#123e35"; ctx.fillText("schedule-kw.com", 600, 1165);
      ctx.direction = "rtl"; ctx.font = '400 24px "Plex Arabic", sans-serif'; ctx.fillStyle = "#68766e"; ctx.fillText("رابط الدخول القابل للنقر في الرسالة المرفقة", 600, 1230);
      ctx.fillStyle = "#d5bd84"; ctx.fillRect(520, 1310, 160, 3);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("export")), "image/png"));
      const objectUrl = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = objectUrl; a.download = `SCHEDULE-${login.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      setStatus("حُفظت البطاقة. أرفق معها الرسالة ليتمكن المستلم من نسخ البيانات وفتح الرابط.");
    } catch { setStatus("تعذّر حفظ الصورة. يمكنك نسخ رسالة الدخول."); }
    finally { setBusy(false); }
  }

  return <section className="account-invitation" aria-label="مشاركة بيانات الدخول">
    <button type="button" className="invitation-launch" data-guide-ignore="تجهيز بطاقة دخول للمستخدم المحدد دون تغيير حسابه" aria-expanded={open} onClick={() => { setOpen(!open); setStatus(""); }}>
      <span className="invitation-launch-icon"><Send aria-hidden="true" /></span><span><strong>بطاقة الدخول</strong><small>دعوة باسم القسم · صورة ورسالة جاهزة</small></span>{open ? <X aria-hidden="true" /> : <Link aria-hidden="true" />}
    </button>
    {open && <div className="invitation-body">
      <div className="invitation-card" dir="rtl">
        <header><BrandMark /><div><small>دعوة إلى مساحة عملكم</small><b>SCHEDULE</b><span>نظام القرار الأكاديمي</span></div></header>
        <div className="invitation-card-content"><h3>{name}</h3><p>أهلًا بكم، هنا تبدأ خطوتكم القادمة</p>
          <div className="invitation-credential"><small>اسم المستخدم</small><bdi dir="ltr">{login}</bdi></div>
          <div className="invitation-credential"><small>كلمة المرور المؤقتة</small><bdi dir="ltr">{temporaryPassword || "—"}</bdi></div>
          <footer><strong dir="ltr">schedule-kw.com</strong><small>رابط الدخول المعبّأ موجود في رسالة واتساب</small></footer>
        </div>
      </div>
      <label className="invitation-password"><span><KeyRound aria-hidden="true" /> كلمة المرور التي ستُرسل</span><input dir="ltr" value={temporaryPassword} onChange={e => { setTemporaryPassword(e.target.value); setStatus(""); }} autoComplete="off" maxLength={128} /><small>القيمة الافتراضية 12345678. راجع مطابقتها لكلمة الحساب الحالية؛ إعداد البطاقة لا يغيّر كلمة المرور.</small></label>
      {!active || hasPassword === false ? <p className="invitation-feedback" role="status">فعّل الحساب واضبط كلمة مروره أولًا قبل تجهيز الدعوة.</p> : null}
      <div className="invitation-actions"><button type="button" data-guide-ignore="نسخ رسالة بيانات الدخول بعد مراجعتها" disabled={!ready} onClick={() => void copy()}><Copy aria-hidden="true" /> نسخ رسالة واتساب</button><button type="button" data-guide-ignore="تنزيل صورة بطاقة الدخول بعد مراجعتها" disabled={!ready || busy} onClick={() => void download()}><Download aria-hidden="true" /> {busy ? "جارٍ تجهيز الصورة…" : "حفظ البطاقة كصورة"}</button></div>
      {status && <p className="invitation-feedback" role="status"><Check aria-hidden="true" />{status}</p>}
    </div>}
  </section>;
}
