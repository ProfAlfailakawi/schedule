/**
 * درجُ حملةٍ واحدة: أداؤها، وصورها، وجمهورها، واعتمادها، وروابطها. كل ما كان مبعثراً في بطاقةٍ طويلة
 * صار هنا مرتّباً في أقسامٍ قصيرة، والقائمة تبقى نظيفة.
 */
import React, { useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Pause, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { CatalogFormDrawer } from "../ui";
import { AR, countOf } from "../../utils/arabicCount";
import { Avatar, StatusPill, arrowOf, dateShort, fmt, nf, pct1, type Campaign, type Payload } from "./shared";

export interface DrawerActions {
  busy: string;
  act: (key: string, run: () => Promise<unknown>, ok?: string) => Promise<void>;
  api: <T = any>(url: string, init?: RequestInit) => Promise<T>;
  copy: (text: string) => void;
  upload: (campaignId: string, file: File) => Promise<void>;
  edit: (c: Campaign, step: number) => void;
  setMsg: (m: string) => void;
}

/** نصٌّ جاهز للواتساب: ملخص الأسبوع ورابط التقرير الحي. لا يُرسَل شيء؛ يُنسخ لتلصقه أنت. */
export function summaryText(c: Campaign, slotLabel: string): string {
  const w = c.weekly;
  const lines = [
    "السلام عليكم،",
    `ملخص حملة «${c.company}» (${slotLabel}):`,
    `• الظهور المرئي هذا الأسبوع: ${nf.format(w?.thisWeek.impressions ?? 0)}${w?.hasLastWeek ? ` (${arrowOf(w.impressionsChange)} عن الأسبوع الماضي)` : ""}`,
    `• النقرات الصحيحة: ${nf.format(w?.thisWeek.clicks ?? 0)}${w?.hasLastWeek ? ` (${arrowOf(w.clicksChange)})` : ""}`,
    `• نسبة النقر: ${nf.format(w?.thisWeek.ctr ?? 0)}٪`,
    `• منذ بداية الحملة: ظهور ${nf.format(c.totals.impressions)}، مشاهدون تقريباً ${nf.format(c.totals.uniques)}، نقرات ${nf.format(c.totals.clicks)}`,
    c.trial ? (c.phase === "ended" ? "انتهت التجربة المجانية؛ يسعدنا تثبيت مكانكم في الفصل القادم." : "التجربة المجانية جارية، وتنتهي تلقائياً في موعدها.") : (c.endingSoon ? `تنتهي الحملة بعد ${countOf(Math.max(0, c.daysLeft), AR.day)}؛ نرتّب التجديد؟` : ""),
    `تقريركم الحي: ${new URL(c.reportUrl, location.origin).toString()}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 560, H = 120, pb = 6, pt = 8;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length);
  const bw = Math.max(3, Math.min(22, step * 0.66));
  return (
    <>
      <svg className="ad-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="الظهور اليومي">
        <line x1="0" x2={W} y1={H - pb} y2={H - pb} stroke="var(--line)" />
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 0, (v / max) * (H - pb - pt));
          const x = W - step * (i + 1) + (step - bw) / 2;
          return <rect key={i} x={x} y={H - pb - h} width={bw} height={h} rx={3} fill="var(--accent)" opacity={0.88}><title>{`${labels[i]} · ${fmt(v)}`}</title></rect>;
        })}
      </svg>
      <div className="ad-axis"><bdi dir="ltr">{labels[0]}</bdi><span>الذروة {fmt(max)}</span><bdi dir="ltr">{labels[labels.length - 1]}</bdi></div>
    </>
  );
}

export default function CampaignDrawer({ campaign: c, data, onClose, actions }: { campaign: Campaign; data: Payload; onClose: () => void; actions: DrawerActions }) {
  const { busy, act, api, copy, upload, edit, setMsg } = actions;
  const [accepted, setAccepted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const slot = data.slots.find(s => s.id === c.slot);
  const slotLabel = c.slotLabel || slot?.label || c.slot;
  const series = useMemo(() => c.series.slice(-30), [c.series]);
  const seasonText = c.seasons?.length ? c.seasons.map(id => data.seasons.find(s => s.id === id)?.label || id).join("، ") : "كل المواسم";
  const collegeText = c.colleges?.length ? c.colleges.map(id => data.colleges.find(x => x.id === id)?.name || `كلية ${id}`).join("، ") : "كل الكليات";
  const approved = c.status === "approved";
  const post = (action: string, extra: Record<string, unknown> = {}) => api(`/api/admin/ads/campaigns/${c.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
  const url = new URL(c.reportUrl, location.origin).toString();

  return (
    <CatalogFormDrawer label={`حملة ${c.company}`} onClose={onClose} wide>
      <header className="ad-dhead">
        <Avatar name={c.company} size={52} />
        <div>
          <h2>{c.company}</h2>
          <p><StatusPill phase={c.phase} />{c.trial ? <span className="ad-tag ad-tag-trial">تجريبية</span> : null}<span>{slotLabel}</span><span className="ad-dot" aria-hidden="true" /><span>{c.category}</span></p>
          <p className="ad-dmeta"><span>{dateShort(c.startDay)}</span> ← <span>{dateShort(c.endDay)}</span>{c.phase === "live" ? <> · متبقٍّ {countOf(Math.max(0, c.daysLeft), AR.day)}</> : null}{c.phase === "live" && c.sharePct < 100 ? <> · حصتها المتوقعة {fmt(c.sharePct)}٪ من الظهور</> : null}</p>
        </div>
        <div className="ad-dactions">
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => edit(c, 1)}><Pencil aria-hidden="true" size={15} /> تعديل</button>
          {approved
            ? <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" disabled={busy === `pa-${c.id}`} onClick={() => void act(`pa-${c.id}`, () => post("pause"), "أُوقفت الحملة فوراً.")}><Pause aria-hidden="true" size={15} /> إيقاف فوري</button>
            : null}
        </div>
      </header>

      <section className="ad-dsec">
        <h3>الأداء</h3>
        <div className="ad-kpis">
          <div><b>{fmt(c.totals.impressions)}</b><span>ظهور مرئي</span><small>{c.weekly?.hasLastWeek ? `${arrowOf(c.weekly.impressionsChange)} عن الأسبوع الماضي` : "إعلانك كان على الشاشة فعلاً"}</small></div>
          <div><b>{fmt(c.totals.uniques)}</b><span>مشاهدون (تقدير)</span><small>متصفحٌ واحد = مرة في اليوم</small></div>
          <div><b>{fmt(c.totals.clicks)}</b><span>عدد النقرات الصحيحة</span><small>{c.totals.filteredClicks ? `استُبعدت ${countOf(c.totals.filteredClicks, AR.click)}` : c.weekly?.hasLastWeek ? `${arrowOf(c.weekly.clicksChange)} عن الأسبوع الماضي` : "بعد استبعاد الروبوتات"}</small></div>
          <div><b>{pct1(c.totals.ctr)}</b><span>نسبة النقر</span><small>النقرات ÷ الظهور</small></div>
        </div>
        {series.length > 1 ? <Bars values={series.map(p => p.impressions)} labels={series.map(p => p.day.slice(5))} /> : <p className="ad-note">يظهر الرسم بعد أول يومٍ من العرض.</p>}
      </section>

      <section className="ad-dsec">
        <h3>الصور <small>{slot ? <>المقاس المطلوب <bdi dir="ltr">{slot.width}×{slot.height}</bdi></> : null}</small></h3>
        <div className="ad-imgs">
          {c.creatives.map(cr => {
            const b = c.breakdown.find(x => x.creativeId === cr.id);
            return (
              <figure key={cr.id}>
                <img src={`/api/admin/ads/creatives/${cr.id}/img`} alt={cr.label} width={cr.width} height={cr.height} loading="lazy" />
                <figcaption>
                  <span>{cr.label}{b && c.breakdown.length > 1 ? ` · نقر ${pct1(b.ctr)}` : ""}{cr.qualityOverride ? " · تجاوز فحص الجودة" : ""}</span>
                  <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-link-danger" aria-label={`حذف ${cr.label}`} onClick={() => void act(`rm-${cr.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/creatives/${cr.id}`, { method: "DELETE" }))}>حذف</button>
                </figcaption>
              </figure>
            );
          })}
          {c.creatives.length < 2 ? (
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-drop" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" size={20} />
              <b>{c.creatives.length ? "صورة ثانية للمقارنة A/B" : "ارفع صورة الحملة"}</b>
              <small>PNG أو JPEG أو WebP · حتى {fmt(data.maxBytes / 1024)} كيلوبايت</small>
            </button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(c.id, f); if (fileRef.current) fileRef.current.value = ""; }} />
      </section>

      <section className="ad-dsec">
        <h3>الجمهور والتفاصيل <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-link" onClick={() => edit(c, 2)}>تعديل</button></h3>
        <dl className="ad-dl">
          <div><dt>المواسم</dt><dd>{seasonText}</dd></div>
          <div><dt>الكليات</dt><dd>{collegeText}</dd></div>
          <div><dt>الوجهة</dt><dd><bdi dir="ltr" className="ad-url">{c.linkUrl}</bdi></dd></div>
          {c.coupon ? <div><dt>كود الخصم</dt><dd><bdi dir="ltr">{c.coupon}</bdi></dd></div> : null}
          {c.note ? <div><dt>ملاحظة</dt><dd>{c.note}</dd></div> : null}
        </dl>
      </section>

      {!approved ? (
        <section className="ad-dsec ad-approve">
          <h3>الاعتماد</h3>
          <details className="ad-rules-box"><summary>شروط الإعلان ({fmt(data.rules.length)})</summary><ul>{data.rules.map(r => <li key={r}>{r}</li>)}</ul></details>
          <label className="ad-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> أقرّ أن الحملة مطابقة للشروط</label>
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" disabled={!accepted || !c.creatives.length || busy === `ap-${c.id}`} onClick={() => void act(`ap-${c.id}`, () => post("approve", { rulesAccepted: true }), "اعتُمدت الحملة.")}>
            <Check aria-hidden="true" size={16} /> {c.status === "paused" ? "استئناف الحملة" : "اعتماد الحملة"}
          </button>
          {!c.creatives.length ? <p className="ad-note">ارفع صورةً أولاً.</p> : null}
        </section>
      ) : null}

      <section className="ad-dsec">
        <h3>مشاركة الأرقام مع الشركة</h3>
        <p className="ad-url-box"><bdi dir="ltr">{url}</bdi></p>
        <div className="ad-btnrow">
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => copy(c.reportUrl)}><Copy aria-hidden="true" size={15} /> نسخ رابط التقرير</button>
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => window.open(c.reportUrl, "_blank", "noopener")}><ExternalLink aria-hidden="true" size={15} /> فتح التقرير</button>
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(summaryText(c, slotLabel)); setMsg("نُسخ ملخص الأسبوع؛ الصقه في واتساب."); } catch { setMsg("تعذّر النسخ تلقائياً."); } }}><Copy aria-hidden="true" size={15} /> نسخ ملخص الأسبوع</button>
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-ghost" onClick={() => { if (window.confirm("تجديد الرابط يُبطل الرابط القديم عند الشركة. متابعة؟")) void act(`rot-${c.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/rotate-report`, { method: "POST" }), "تجدّد رابط التقرير."); }}><RefreshCw aria-hidden="true" size={15} /> تجديد الرابط</button>
        </div>
      </section>

      <section className="ad-dsec ad-danger">
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-link-danger" onClick={() => { if (window.confirm(`حذف حملة «${c.company}» نهائياً؟ تبقى أرقامها محفوظة لكن لن يمكن استعادتها.`)) void act(`del-${c.id}`, async () => { await api(`/api/admin/ads/campaigns/${c.id}`, { method: "DELETE" }); onClose(); }, "حُذفت الحملة."); }}><Trash2 aria-hidden="true" size={14} /> حذف الحملة</button>
      </section>
    </CatalogFormDrawer>
  );
}
