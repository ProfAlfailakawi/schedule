/**
 * ── شاشة الإعلانات ───────────────────────────────────────────────────────────────
 *
 * مواقعُ الإعلان ومقاساتها وسعتها، وحملاتُ الشركات بتواريخ بدايتها ونهايتها، وأرقام
 * كل حملة. لا أسعار هنا؛ الشاشة للتتبع. الشروط تُفرض في الخادم (مقاس، وزن، رابط،
 * سعة، فئة منافس)، وهذه الواجهة تعرضها وتشرحها قبل أن تُرفض الحملة.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Pause, Play, Plus, Trash2, Upload } from "lucide-react";
import { Badge, EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { AR, countOf } from "../utils/arabicCount";

interface Slot { id: string; label: string; where: string; audience: string; width: number; height: number; capacity: number; exclusive?: boolean; live: number; nextFree: string }
interface Totals { impressions: number; uniques: number; clicks: number; filteredClicks: number; ctr: number }
interface Creative { id: string; label: string; width: number; height: number; bytes: number }
interface Campaign {
  id: string; company: string; category: string; slot: string; linkUrl: string; coupon?: string; startDay: string; endDay: string; note?: string;
  status: "draft" | "approved" | "paused"; trial?: boolean; phase: "draft" | "paused" | "scheduled" | "live" | "ended"; daysLeft: number; endingSoon: boolean;
  creatives: Creative[]; totals: Totals; breakdown: Array<{ creativeId: string } & Totals>; sharePct: number; reportUrl: string;
}
interface Payload { today: string; slots: Slot[]; categories: string[]; rules: string[]; maxBytes: number; campaigns: Campaign[]; partnerKit: string }

const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
const fmt = (n: number) => nf.format(Math.round(n));
const PHASE: Record<Campaign["phase"], { label: string; cls: string }> = {
  live: { label: "تعمل الآن", cls: "live" }, scheduled: { label: "مجدولة", cls: "" }, ended: { label: "منتهية", cls: "off" },
  paused: { label: "موقوفة", cls: "warn" }, draft: { label: "مسودة", cls: "" },
};
const blank = { id: "", company: "", category: "", slot: "me", startDay: "", endDay: "", linkUrl: "https://", coupon: "", note: "", trial: false };

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "تعذّر تنفيذ الطلب."), { problems: body.problems as string[] | undefined });
  return body as T;
}

export default function AdsManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState("");
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef("");

  const load = useCallback(async () => {
    try { setData(await api<Payload>("/api/admin/ads")); setError(""); }
    catch (e: any) { setError(String(e.message || e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, run: () => Promise<unknown>, ok = "") => {
    setBusy(key); setMsg(""); setError("");
    try { await run(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setError([e.message, ...(e.problems || []).slice(1)].filter(Boolean).join(" · ")); }
    finally { setBusy(""); }
  };

  const save = () => form && act("save", async () => {
    await api("/api/admin/ads/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm(null);
  }, "حُفظت الحملة. ارفع صورتها ثم اعتمدها.");

  const upload = async (file: File | undefined) => {
    const id = uploadFor.current;
    if (!file || !id) return;
    await act(`up-${id}`, async () => {
      await api(`/api/admin/ads/campaigns/${id}/creatives`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-Label": encodeURIComponent(file.name.replace(/\.[^.]+$/, "").slice(0, 40)) }, body: file });
    }, "رُفعت الصورة.");
    if (fileRef.current) fileRef.current.value = "";
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(new URL(text, location.origin).toString()); setMsg("نُسخ الرابط."); }
    catch { setMsg("انسخ الرابط يدوياً: " + new URL(text, location.origin).toString()); }
  };

  if (!data) return <div className="pt-page">{error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يجهّز الإعلانات…" />}</div>;
  const slotOf = (id: string) => data.slots.find(s => s.id === id);
  const picked = form ? slotOf(form.slot) : undefined;
  const previewCampaign = form?.id ? data.campaigns.find(c => c.id === form.id) : undefined;
  const ending = data.campaigns.filter(c => c.endingSoon);

  return (
    <div className="pt-page">
      <PageTitle eyebrow="للإدارة الرئيسية" subtitle="مواقع الإعلان وحملات الشركات وأرقامها، بشروطنا وحدنا." action={<PrimaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => setForm({ ...blank, category: data.categories[0] || "", startDay: data.today })}><Plus aria-hidden="true" size={16} /> حملة جديدة</PrimaryButton>}>الإعلانات</PageTitle>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {msg ? <Notice type="success" onDismiss={() => setMsg("")}>{msg}</Notice> : null}
      {ending.length ? <div className="pt-alert" role="status">{countOf(ending.length, AR.campaign)} تنتهي خلال ٧ أيام: {ending.map(c => c.company).join("، ")}. تواصل معهم للتجديد.</div> : null}

      <section aria-label="المواقع">
        <h3 style={{ margin: "0 0 10px" }}>المواقع ومقاساتها</h3>
        <div className="ad-slots">
          {data.slots.map(slot => {
            const cap = slot.exclusive ? 1 : slot.capacity;
            return (
              <article className="ad-slot" key={slot.id}>
                <h4>{slot.label}</h4>
                <small>{slot.where}</small>
                <div className="ad-mock" style={{ inlineSize: Math.min(210, slot.width / 3), aspectRatio: `${slot.width}/${slot.height}` }}><bdi dir="ltr">{slot.width}×{slot.height}</bdi></div>
                <div className="ad-meter" aria-label={`${slot.live} من ${cap}`}>{Array.from({ length: cap }, (_, i) => <i key={i} className={i < slot.live ? "on" : ""} />)}</div>
                <small>{slot.exclusive ? "حصري لشركة واحدة" : `تتناوب حتى ${countOf(cap, AR.campaign)}`} · {slot.live >= cap ? `ممتلئ${slot.nextFree ? ` حتى ${slot.nextFree}` : ""}` : "متاح"}</small>
              </article>
            );
          })}
        </div>
      </section>

      {form ? (
        <Surface>
          <h3 style={{ marginTop: 0 }}>{form.id ? "تعديل الحملة" : "حملة جديدة"}</h3>
          <div className="ad-form">
            <label>اسم الشركة<input value={form.company} maxLength={80} onChange={e => setForm({ ...form, company: e.target.value })} /></label>
            <label>الفئة<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{data.categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>الموقع<select value={form.slot} disabled={Boolean(previewCampaign?.creatives.length)} onChange={e => setForm({ ...form, slot: e.target.value })}>{data.slots.map(s => <option key={s.id} value={s.id}>{s.label} — {s.width}×{s.height}</option>)}</select></label>
            <label>من (تاريخ البداية)<input type="date" value={form.startDay} onChange={e => setForm({ ...form, startDay: e.target.value })} /></label>
            <label>إلى (تاريخ النهاية شامل)<input type="date" value={form.endDay} onChange={e => setForm({ ...form, endDay: e.target.value })} /></label>
            <label>كود الخصم (اختياري)<input value={form.coupon} dir="ltr" maxLength={24} onChange={e => setForm({ ...form, coupon: e.target.value })} /></label>
            <label className="wide">رابط الوجهة (https)<input dir="ltr" value={form.linkUrl} onChange={e => setForm({ ...form, linkUrl: e.target.value })} /></label>
            <label className="wide">ملاحظة داخلية<input value={form.note} maxLength={300} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
            <label style={{ gridColumn: "1/-1", display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}><input type="checkbox" checked={form.trial} onChange={e => setForm({ ...form, trial: e.target.checked })} style={{ minBlockSize: 0 }} /> حملة تجريبية مجانية (تُوسَم في تقريرها)</label>
          </div>
          {picked ? <p className="pt-note">المقاس المطلوب لهذا الموقع <b><bdi dir="ltr">{picked.width}×{picked.height}</bdi></b> تماماً، بوزن لا يتجاوز {data.maxBytes / 1024} كيلوبايت. الصورة تُعرض بنسبتها نفسها على الجوال، فاجعل الكلام المهم في وسطها.</p> : null}
          <div className="ad-actions" style={{ marginTop: 12 }}>
            <PrimaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => void save()} disabled={busy === "save"}>{busy === "save" ? "يحفظ…" : "حفظ"}</PrimaryButton>
            <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => setForm(null)}>إلغاء</SecondaryButton>
          </div>
        </Surface>
      ) : null}

      <section aria-label="الحملات">
        <h3 style={{ margin: "0 0 10px" }}>الحملات</h3>
        {!data.campaigns.length ? <EmptyState title="لا حملات بعد" detail="أنشئ أول حملة، وارفع صورتها، ثم اعتمدها لتظهر." /> : (
          <div className="ad-camps">
            {data.campaigns.map(c => {
              const slot = slotOf(c.slot);
              const acc = Boolean(accept[c.id]);
              const ph = PHASE[c.phase];
              return (
                <article className="ad-camp" key={c.id}>
                  <header>
                    <div>
                      <h4>{c.company}</h4>
                      <div className="ad-badges">
                        <span className={`ad-badge ${ph.cls}`}>{ph.label}</span>
                        {c.trial ? <span className="ad-badge warn">تجريبية</span> : null}
                        <span className="ad-badge">{slot?.label || c.slot}</span>
                        <span className="ad-badge">{c.category}</span>
                        <span className="ad-badge">{c.startDay} ← {c.endDay}</span>
                        {c.phase === "live" ? <span className={`ad-badge ${c.endingSoon ? "warn" : ""}`}>متبقٍ {countOf(Math.max(0, c.daysLeft), AR.day)}</span> : null}
                        {c.phase === "live" ? <span className="ad-badge">حصتها {fmt(c.sharePct)}٪</span> : null}
                      </div>
                    </div>
                    <div className="ad-actions">
                      <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => setForm({ id: c.id, company: c.company, category: c.category, slot: c.slot, startDay: c.startDay, endDay: c.endDay, linkUrl: c.linkUrl, coupon: c.coupon || "", note: c.note || "", trial: Boolean(c.trial) })}>تعديل</SecondaryButton>
                    </div>
                  </header>

                  <div className="ad-nums">
                    <div><b>{fmt(c.totals.impressions)}</b><span>ظهور مرئي</span></div>
                    <div><b>{fmt(c.totals.uniques)}</b><span>مشاهدون (تقدير)</span></div>
                    <div><b>{fmt(c.totals.clicks)}</b><span>عدد النقرات الصحيحة</span></div>
                    <div><b>{c.totals.ctr.toLocaleString("ar-KW-u-nu-latn")}٪</b><span>نسبة النقر</span></div>
                    <div><b>{fmt(c.totals.filteredClicks)}</b><span>عدد النقرات المُرشَّحة</span></div>
                  </div>

                  <div className="ad-thumbs">
                    {c.creatives.map(cr => {
                      const b = c.breakdown.find(x => x.creativeId === cr.id);
                      return (
                        <figure key={cr.id}>
                          <img src={`/api/admin/ads/creatives/${cr.id}/img`} alt={cr.label} width={cr.width} height={cr.height} loading="lazy" />
                          <figcaption><span>{cr.label}{b && c.breakdown.length > 1 ? ` · نقر ${b.ctr.toLocaleString("ar-KW-u-nu-latn")}٪` : ""}</span>
                            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-badge off" style={{ border: 0, cursor: "pointer" }} aria-label={`حذف ${cr.label}`} onClick={() => void act(`rm-${cr.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/creatives/${cr.id}`, { method: "DELETE" }))}>حذف</button>
                          </figcaption>
                        </figure>
                      );
                    })}
                    {c.creatives.length < 2 ? (
                      <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-badge" style={{ border: "1.5px dashed var(--line-strong,var(--line))", cursor: "pointer", padding: "18px 22px", borderRadius: 14 }}
                        onClick={() => { uploadFor.current = c.id; fileRef.current?.click(); }}>
                        <Upload aria-hidden="true" size={16} /> {c.creatives.length ? "صورة ثانية للمقارنة A/B" : `ارفع الصورة ${slot ? `(\u200E${slot.width}×${slot.height})` : ""}`}
                      </button>
                    ) : null}
                  </div>

                  {c.status !== "approved" ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <ul className="ad-rules">{data.rules.map(r => <li key={r}>{r}</li>)}</ul>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={acc} onChange={e => setAccept({ ...accept, [c.id]: e.target.checked })} /> أقرّ أن الحملة مطابقة للشروط أعلاه</label>
                    </div>
                  ) : null}

                  <div className="ad-actions">
                    {c.status !== "approved"
                      ? <PrimaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" disabled={!acc || !c.creatives.length || busy === `ap-${c.id}`} onClick={() => void act(`ap-${c.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", rulesAccepted: true }) }), "اعتُمدت الحملة.")}><Check aria-hidden="true" size={16} /> {c.status === "paused" ? "استئناف" : "اعتماد"}</PrimaryButton>
                      : <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => void act(`pa-${c.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause" }) }), "أُوقفت الحملة فوراً.")}><Pause aria-hidden="true" size={16} /> إيقاف فوري</SecondaryButton>}
                    <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => void copy(c.reportUrl)}><Copy aria-hidden="true" size={16} /> نسخ رابط تقرير الشركة</SecondaryButton>
                    <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => window.open(c.reportUrl, "_blank", "noopener")}><ExternalLink aria-hidden="true" size={16} /> فتح التقرير</SecondaryButton>
                    <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => { if (window.confirm("تغيير رابط التقرير يُبطل الرابط القديم عند الشركة. متابعة؟")) void act(`rot-${c.id}`, () => api(`/api/admin/ads/campaigns/${c.id}/rotate-report`, { method: "POST" }), "تجدّد رابط التقرير."); }}><Play aria-hidden="true" size={16} /> تجديد الرابط</SecondaryButton>
                    <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => { if (window.confirm(`حذف حملة «${c.company}» نهائياً؟`)) void act(`del-${c.id}`, () => api(`/api/admin/ads/campaigns/${c.id}`, { method: "DELETE" }), "حُذفت الحملة."); }}><Trash2 aria-hidden="true" size={16} /> حذف</SecondaryButton>
                  </div>

                  {c.creatives[0] && slot ? (
                    <details>
                      <summary>معاينة على الجوال</summary>
                      <div className="ad-phone" aria-label="معاينة الإعلان على الجوال">
                        <div className="bar" /><div className="bar s" />
                        <div className="box"><span>إعلان</span><img src={`/api/admin/ads/creatives/${c.creatives[0].id}/img`} alt="" /></div>
                        <div className="bar" /><div className="bar s" />
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Surface>
        <h3 style={{ marginTop: 0 }}>ملف الشراكة للشركات</h3>
        <p className="pt-note">صفحة واحدة تُرسل رابطها للشركة: حجم الجمهور بأرقامٍ تقريبية، والمواقع ومقاساتها وتوفرها، وشروطنا. تتحدث وحدها ولا تكشف أي اسم.</p>
        <div className="ad-actions">
          <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" disabled={busy === "kit"} onClick={() => void act("kit", () => api("/api/admin/ads/partner-kit", { method: "POST" }), data.partnerKit ? "تجدّد رابط ملف الشراكة." : "أُنشئ رابط ملف الشراكة.")}>{data.partnerKit ? "تجديد الرابط" : "إنشاء الرابط"}</SecondaryButton>
          {data.partnerKit ? <>
            <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => void copy(data.partnerKit)}><Copy aria-hidden="true" size={16} /> نسخ</SecondaryButton>
            <SecondaryButton data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" onClick={() => window.open(data.partnerKit, "_blank", "noopener")}><ExternalLink aria-hidden="true" size={16} /> فتح</SecondaryButton>
          </> : null}
        </div>
        {data.partnerKit ? <p className="ad-link" style={{ marginTop: 10 }}>{new URL(data.partnerKit, location.origin).toString()}</p> : null}
      </Surface>

      <Surface>
        <h3 style={{ marginTop: 0 }}>شروط الإعلان</h3>
        <ul className="ad-rules">{data.rules.map(r => <li key={r}>{r}</li>)}</ul>
      </Surface>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void upload(e.target.files?.[0])} />
    </div>
  );
}
