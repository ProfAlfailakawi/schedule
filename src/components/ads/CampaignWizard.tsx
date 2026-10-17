/**
 * معالجُ «حملة جديدة»: أربع خطواتٍ قصيرة بدل نموذجٍ واحدٍ طويل يُفتح في منتصف الصفحة.
 *   ١ الشركة والموقع والتواريخ   ٢ الجمهور (مواسم وكليات)   ٣ الصورة مع معاينة   ٤ المراجعة والاعتماد
 * تُحفظ الحملةُ مسودةً عند الانتقال من الثانية إلى الثالثة (الصورة تحتاج رقم حملة)، وللإدارة أن تغلق في أي وقتٍ فتبقى المسودة.
 */
import React, { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImagePlus, Upload, Globe2 } from "lucide-react";
import { CatalogFormDrawer } from "../ui";
import { AR, countOf } from "../../utils/arabicCount";
import type { DrawerActions } from "./CampaignDrawer";
import { addDay, dateShort, fmt, type Campaign, type Payload } from "./shared";

export interface WizardForm {
  id: string; company: string; category: string; slot: string; startDay: string; endDay: string;
  linkUrl: string; coupon: string; note: string; trial: boolean; seasons: string[]; colleges: number[];
}
const STEPS = ["الشركة والموقع", "الجمهور", "الصورة", "المراجعة"];

export const blankForm = (data: Payload): WizardForm => ({
  id: "", company: "", category: data.categories[0] || "", slot: data.slots.find(s => s.id === "me")?.id || data.slots[0]?.id || "", startDay: data.today, endDay: addDay(data.today, 29),
  linkUrl: "https://", coupon: "", note: "", trial: false, seasons: [], colleges: [],
});
export const formOf = (c: Campaign): WizardForm => ({
  id: c.id, company: c.company, category: c.category, slot: c.slot, startDay: c.startDay, endDay: c.endDay, linkUrl: c.linkUrl,
  coupon: c.coupon || "", note: c.note || "", trial: Boolean(c.trial), seasons: c.seasons || [], colleges: c.colleges || [],
});

/** هاتفٌ مبسّط يعرض الصورة في موضعها: ليرى صاحبُ القرار كيف تبدو قبل الاعتماد. */
function PhoneAd({ src, slotLabel }: { src?: string; slotLabel: string }) {
  return (
    <div className="ad-phone2" aria-label={`معاينة الإعلان في ${slotLabel}`}>
      <span className="ad-phone2-notch" aria-hidden="true" />
      <div className="ad-sk ad-sk-h" /><div className="ad-sk ad-sk-card" />
      <div className="ad-phone2-ad">{src ? <img src={src} alt="" /> : <span><ImagePlus aria-hidden="true" size={18} /> مكان الإعلان</span>}<em>إعلان</em></div>
      <div className="ad-sk" /><div className="ad-sk ad-sk-s" />
    </div>
  );
}

export default function CampaignWizard({ data, initial, startStep = 1, onClose, onSaved, actions }: {
  data: Payload; initial: WizardForm; startStep?: number; onClose: () => void; onSaved: (id: string) => Promise<void> | void; actions: DrawerActions;
}) {
  const [form, setForm] = useState<WizardForm>(initial);
  const [step, setStep] = useState(Math.max(1, Math.min(4, startStep)));
  const [savedId, setSavedId] = useState(initial.id);
  const [err, setErr] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showColleges, setShowColleges] = useState(initial.colleges.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { api, upload, act, busy } = actions;

  const slot = data.slots.find(s => s.id === form.slot);
  const saved = data.campaigns.find(c => c.id === savedId);
  const slotLocked = Boolean(saved?.creatives.length);
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const span = Math.round((Date.parse(`${form.endDay}T00:00:00Z`) - Date.parse(`${form.startDay}T00:00:00Z`)) / 86_400_000) + 1;
  const finals = data.calendar.find(i => i.season === "finals" && i.to >= data.today)?.to;
  const seasonText = form.seasons.length ? form.seasons.map(id => data.seasons.find(s => s.id === id)?.label || id).join("، ") : "كل المواسم";

  const stepOneProblems = useMemo(() => {
    const p: string[] = [];
    if (!form.company.trim()) p.push("اسم الشركة مطلوب.");
    if (!form.slot) p.push("اختر موقعاً.");
    if (!form.startDay || !form.endDay) p.push("حدّد تاريخي البداية والنهاية.");
    else if (form.endDay < form.startDay) p.push("تاريخ النهاية قبل البداية.");
    if (!/^https:\/\/.+\..+/.test(form.linkUrl.trim())) p.push("رابط الوجهة يجب أن يبدأ بـ https://");
    return p;
  }, [form]);

  const save = async (): Promise<boolean> => {
    setSaving(true); setErr([]);
    try {
      const out = await api<{ id: string }>("/api/admin/ads/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, colleges: slot?.wholeUniversity ? [] : form.colleges, id: savedId || form.id || undefined }) });
      setSavedId(out.id);
      await onSaved(out.id);
      return true;
    } catch (e: any) { setErr([e.message, ...(e.problems || []).slice(1)].filter(Boolean)); return false; }
    finally { setSaving(false); }
  };

  const next = async () => {
    if (step === 1 && stepOneProblems.length) { setErr(stepOneProblems); return; }
    setErr([]);
    if (step === 2) { if (!(await save())) return; }
    setStep(s => Math.min(4, s + 1));
  };
  const goto = (n: number) => { if (n <= step || (n === 3 && savedId) || (n === 4 && savedId)) { setErr([]); setStep(n); } };

  const quick = (days: number, trial = false) => setForm(f => ({ ...f, endDay: addDay(f.startDay || data.today, days - 1), trial }));
  /* كل خروجٍ أو اعتماد يحفظ النموذج الحالي أولاً؛ وإلا بقيت القيم القديمة في الخادم رغم ما يراه المدير. */
  const persist = async (): Promise<boolean> => {
    if (stepOneProblems.length) { setStep(1); setErr(stepOneProblems); return false; }
    return save();
  };
  const finish = async (approve: boolean) => {
    if (!(await persist())) return;
    if (!approve) { onClose(); return; }
    await act(`ap-${savedId}`, async () => {
      await api(`/api/admin/ads/campaigns/${savedId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", rulesAccepted: true }) });
      onClose();
    }, "اعتُمدت الحملة.");
  };

  return (
    <CatalogFormDrawer label={initial.id ? "تعديل الحملة" : "حملة جديدة"} onClose={onClose} wide>
      <header className="ad-whead">
        <h2>{initial.id ? "تعديل الحملة" : "حملة جديدة"}</h2>
        <ol className="ad-steps" aria-label="خطوات الحملة">
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} className={n === step ? "now" : n < step ? "done" : ""}>
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={() => goto(n)} aria-current={n === step ? "step" : undefined}><i>{n < step ? <Check size={13} aria-hidden="true" /> : fmt(n)}</i><span>{label}</span></button>
              </li>
            );
          })}
        </ol>
      </header>

      {err.length ? <div className="ad-errbox" role="alert"><b>{err[0]}</b>{err.slice(1).map(e => <span key={e}>{e}</span>)}</div> : null}

      {step === 1 ? (
        <div className="ad-wbody">
          <label className="ad-field ad-field-big">اسم الشركة<input value={form.company} maxLength={80} autoFocus onChange={e => set("company", e.target.value)} placeholder="مثال: مطعم الواحة" /></label>

          <div className="ad-field"><span className="ad-lab">الفئة <small>(لا يظهر منافسان من فئةٍ واحدة في الموقع نفسه)</small></span>
            <div className="ad-chips ad-chips-wrap" role="group" aria-label="الفئة">{data.categories.map(c => <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={c} type="button" className={`ad-chip${form.category === c ? " on" : ""}`} aria-pressed={form.category === c} onClick={() => set("category", c)}>{c}</button>)}</div>
          </div>

          <div className="ad-field"><span className="ad-lab">الموقع {slotLocked ? <small>(مقفل: الصور مرتبطة بمقاس الموقع)</small> : null}</span>
            <div className="ad-slotpick" role="radiogroup" aria-label="الموقع">
              {data.slots.map(s => {
                const cap = s.exclusive ? 1 : s.capacity, full = s.live >= cap;
                return (
                  <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={s.id} type="button" role="radio" aria-checked={form.slot === s.id} disabled={slotLocked && form.slot !== s.id} className={`ad-slotcard${form.slot === s.id ? " on" : ""}${full ? " full" : ""}`} onClick={() => set("slot", s.id)}>
                    <span className="ad-slotart" style={{ aspectRatio: `${s.width}/${s.height}` }}><bdi dir="ltr">{s.width}×{s.height}</bdi></span>
                    <b>{s.label}</b>
                    <small>{s.where}</small>
                    <em>{s.exclusive ? (full ? "محجوز" : "حصري · متاح") : `${fmt(s.live)} من ${fmt(cap)} · ${full ? "ممتلئ" : "متاح"}`}</em>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ad-field"><span className="ad-lab">مدة العرض</span>
            <div className="ad-dates">
              <label>من<input type="date" value={form.startDay} onChange={e => set("startDay", e.target.value)} /></label>
              <label>إلى (شامل)<input type="date" value={form.endDay} onChange={e => set("endDay", e.target.value)} /></label>
              <span className="ad-span">{span > 0 ? countOf(span, AR.day) : "—"}</span>
            </div>
            <div className="ad-quick">
              <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className={`ad-chip${form.trial ? " on" : ""}`} onClick={() => quick(7, true)}>تجربة ٧ أيام مجانية</button>
              <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-chip" onClick={() => quick(30)}>٣٠ يوماً</button>
              <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-chip" onClick={() => quick(90)}>٩٠ يوماً</button>
              {finals ? <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-chip" onClick={() => setForm(f => ({ ...f, endDay: finals, trial: false }))}>حتى نهاية الفصل <bdi>{dateShort(finals)}</bdi></button> : null}
            </div>
          </div>

          <label className="ad-field">رابط الوجهة (https)<input dir="ltr" value={form.linkUrl} onChange={e => set("linkUrl", e.target.value)} /></label>
          <details className="ad-more"><summary>خياراتٌ إضافية: كود خصم وملاحظة</summary>
            <div className="ad-grid2">
              <label className="ad-field">كود الخصم <small>(يظهر تحت الإعلان ويقيس التحويل)</small><input dir="ltr" maxLength={24} value={form.coupon} onChange={e => set("coupon", e.target.value)} /></label>
              <label className="ad-field">ملاحظة داخلية<input maxLength={300} value={form.note} onChange={e => set("note", e.target.value)} /></label>
            </div>
          </details>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="ad-wbody">
          <p className="ad-lead">متى ولمن تظهر هذه الحملة؟ بلا اختيارٍ تظهر دائماً وللجميع.</p>
          <div className="ad-field"><span className="ad-lab">الموسم</span>
            <div className="ad-seasonpick" role="group" aria-label="الموسم">
              {data.seasons.map(se => {
                const on = form.seasons.includes(se.id), now = data.activeSeasons.includes(se.id);
                return <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={se.id} type="button" className={`ad-seasoncard${on ? " on" : ""}`} aria-pressed={on} onClick={() => set("seasons", toggle(form.seasons, se.id))}><b>{se.label}</b><small>{se.hint}</small>{now ? <em>الآن</em> : null}</button>;
              })}
            </div>
          </div>
          {slot?.wholeUniversity ? (
            <div className="ad-reach"><Globe2 aria-hidden="true" size={18} /><div><b>يصل كل طلبة الجامعة</b><span>{slot.label} يعرض إعلانك لكل طالبٍ يدخل، من كل الكليات، بلا حاجةٍ لأي تخصيص.</span></div></div>
          ) : <div className="ad-field">
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-link" onClick={() => setShowColleges(v => !v)}>{showColleges ? "إخفاء تخصيص الكليات" : "تخصيص الكليات (اختياري)"}</button>
            {showColleges ? (
              <>
                <div className="ad-chips ad-chips-wrap" role="group" aria-label="الكليات">{data.colleges.map(co => <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={co.id} type="button" className={`ad-chip${form.colleges.includes(co.id) ? " on" : ""}`} aria-pressed={form.colleges.includes(co.id)} onClick={() => set("colleges", toggle(form.colleges, co.id))}>{co.name}</button>)}</div>
                <p className="ad-note">يعمل الاستهداف بالكلية في صفحتي الجدول العام وجدول الطلبة (تعرفان كلية الطالب)؛ لا تظهر الحملة المستهدَفة بكلية داخل «مساري».</p>
              </>
            ) : null}
          </div>}
          <div className="ad-sumline"><b>ستظهر في:</b> {slot?.label || form.slot} · {seasonText} · {slot?.wholeUniversity ? "كل الجامعة" : form.colleges.length ? countOf(form.colleges.length, AR.college) : "كل الكليات"}</div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="ad-wbody ad-wimg">
          <div>
            <p className="ad-lead">المقاس المطلوب لموقع {slot?.label} هو <bdi dir="ltr"><b>{slot?.width}×{slot?.height}</b></bdi> تماماً، بوزنٍ حتى {fmt(data.maxBytes / 1024)} كيلوبايت. اجعل الكلام المهم في وسط الصورة؛ تُعرض بنسبتها على الجوال.</p>
            <div className="ad-imgs">
              {(saved?.creatives || []).map(cr => (
                <figure key={cr.id}>
                  <img src={`/api/admin/ads/creatives/${cr.id}/img`} alt={cr.label} width={cr.width} height={cr.height} />
                  <figcaption><span>{cr.label}</span><button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-link-danger" onClick={() => void act(`rm-${cr.id}`, () => api(`/api/admin/ads/campaigns/${savedId}/creatives/${cr.id}`, { method: "DELETE" }))}>حذف</button></figcaption>
                </figure>
              ))}
              {(saved?.creatives.length || 0) < 2 ? (
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="ad-drop" onClick={() => fileRef.current?.click()} disabled={!savedId}>
                  <Upload aria-hidden="true" size={22} /><b>{saved?.creatives.length ? "صورة ثانية للمقارنة A/B" : "اختر صورة الحملة"}</b><small>PNG أو JPEG أو WebP</small>
                </button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f && savedId) void upload(savedId, f); if (fileRef.current) fileRef.current.value = ""; }} />
            <p className="ad-note">نفحص الصورة تلقائياً (فراغ، تباين، تفاصيل). وللإدارة أن ترفعها رغم التحذير بقرارٍ صريح يُسجَّل.</p>
          </div>
          <PhoneAd src={saved?.creatives[0] ? `/api/admin/ads/creatives/${saved.creatives[0].id}/img` : undefined} slotLabel={slot?.label || ""} />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="ad-wbody">
          <dl className="ad-dl ad-review">
            <div><dt>الشركة</dt><dd>{form.company}{form.trial ? " · تجريبية" : ""}</dd></div>
            <div><dt>الموقع</dt><dd>{slot?.label} <bdi dir="ltr">({slot?.width}×{slot?.height})</bdi></dd></div>
            <div><dt>المدة</dt><dd>من <bdi>{dateShort(form.startDay)}</bdi> إلى <bdi>{dateShort(form.endDay)}</bdi> · {countOf(Math.max(1, span), AR.day)}</dd></div>
            <div><dt>الجمهور</dt><dd>{seasonText} · {slot?.wholeUniversity ? "كل الجامعة" : form.colleges.length ? countOf(form.colleges.length, AR.college) : "كل الكليات"}</dd></div>
            <div><dt>الصور</dt><dd>{saved?.creatives.length ? "مرفوعة" : "لم تُرفع بعد"}</dd></div>
            <div><dt>الوجهة</dt><dd><bdi dir="ltr" className="ad-url">{form.linkUrl}</bdi></dd></div>
          </dl>
          <details className="ad-rules-box" open><summary>شروط الإعلان</summary><ul>{data.rules.map(r => <li key={r}>{r}</li>)}</ul></details>
          <label className="ad-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> أقرّ أن الحملة مطابقة للشروط أعلاه</label>
          {!saved?.creatives.length ? <p className="ad-note">ارفع صورةً في الخطوة السابقة قبل الاعتماد، أو احفظ الحملة مسودةً وأكمل لاحقاً.</p> : null}
        </div>
      ) : null}

      <footer className="ad-wfoot">
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-ghost" onClick={() => (step === 1 ? onClose() : setStep(step - 1))}>{step === 1 ? "إلغاء" : <><ChevronRight aria-hidden="true" size={15} /> السابق</>}</button>
        <span className="ad-spacer" />
        {step < 4 ? (
          <>
            {savedId ? <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" disabled={saving} onClick={() => void finish(false)}>حفظ وإغلاق</button> : null}
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" disabled={saving} onClick={() => void next()}>{saving ? "يحفظ…" : step === 2 ? "حفظ والمتابعة إلى الصورة" : "التالي"} <ChevronLeft aria-hidden="true" size={15} /></button>
          </>
        ) : (
          <>
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => void finish(false)}>حفظ مسودةً وإغلاق</button>
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" disabled={!accepted || !saved?.creatives.length || busy === `ap-${savedId}`} onClick={() => void finish(true)}><Check aria-hidden="true" size={15} /> اعتماد الحملة</button>
          </>
        )}
      </footer>
    </CatalogFormDrawer>
  );
}
