/**
 * ── شاشة الإعلانات ───────────────────────────────────────────────────────────────
 *
 * رأسٌ بالأرقام، وثلاثةُ تبويبات (الحملات · المواقع والمواسم · ملف الشراكة). القائمة مضغوطة، وتفاصيل الحملة
 * وإجراءاتها في درجٍ جانبي، و«حملة جديدة» معالجٌ من أربع خطوات في درج. لا أسعار هنا؛ الشاشة للتتبع.
 * الشروط تُفرض في الخادم (مقاس، وزن، جودة، رابط، سعة، فئة منافس) وتُشرح هنا قبل أن تُرفض الحملة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, Megaphone, Plus, Send, ShieldCheck, TrendingUp } from "lucide-react";
import { MicroLoader, Notice, PageTitle } from "./ui";
import CampaignList from "./ads/CampaignList";
import CampaignDrawer, { type DrawerActions } from "./ads/CampaignDrawer";
import CampaignWizard, { blankForm, formOf, type WizardForm } from "./ads/CampaignWizard";
import { PlacementMap, SeasonTimeline } from "./ads/PlacementMap";
import AttentionList, { attentionItems } from "./ads/AttentionList";
import { api, fmt, pct1, type Payload } from "./ads/shared";

type Tab = "campaigns" | "placements" | "kit";

export default function AdsManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("campaigns");
  const [openId, setOpenId] = useState("");
  const [wizard, setWizard] = useState<{ form: WizardForm; step: number } | null>(null);
  const toastTimer = useRef(0);

  const load = useCallback(async () => {
    try { setData(await api<Payload>("/api/admin/ads")); setError(""); }
    catch (e: any) { setError(String(e.message || e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!msg) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMsg(""), 6000);
    return () => window.clearTimeout(toastTimer.current);
  }, [msg]);

  const act = useCallback(async (key: string, run: () => Promise<unknown>, ok = "") => {
    setBusy(key); setMsg(""); setError("");
    try { await run(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setError([e.message, ...(e.problems || []).slice(1)].filter(Boolean).join(" · ")); }
    finally { setBusy(""); }
  }, [load]);

  const copy = useCallback(async (text: string) => {
    const full = new URL(text, location.origin).toString();
    try { await navigator.clipboard.writeText(full); setMsg("نُسخ الرابط."); }
    catch { setMsg("انسخ الرابط يدوياً: " + full); }
  }, []);

  /* الرفع: فحصُ الجودة قد يرفض الصورة بـ٤٢٢؛ تُعرض الأسباب وللإدارة أن ترفعها رغم ذلك بقرارٍ صريح يُسجَّل. */
  const upload = useCallback(async (campaignId: string, file: File) => {
    const send = (override: boolean) => api(`/api/admin/ads/campaigns/${campaignId}/creatives`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-Label": encodeURIComponent(file.name.replace(/\.[^.]+$/, "").slice(0, 40)), ...(override ? { "X-Quality-Override": "1" } : {}) },
      body: file,
    });
    await act(`up-${campaignId}`, async () => {
      try { await send(false); }
      catch (e: any) {
        if (e?.code === "quality" && window.confirm(`فحص الجودة وجد:\n\n• ${(e.problems || [e.message]).join("\n• ")}\n\nهل ترفع الصورة رغم ذلك؟`)) await send(true);
        else throw e;
      }
    }, "رُفعت الصورة.");
  }, [act]);

  const stats = useMemo(() => {
    if (!data) return null;
    const live = data.campaigns.filter(c => c.phase === "live");
    const week = data.campaigns.reduce((s, c) => s + (c.weekly?.thisWeek.impressions || 0), 0);
    const impressions = data.campaigns.reduce((s, c) => s + c.totals.impressions, 0);
    const clicks = data.campaigns.reduce((s, c) => s + c.totals.clicks, 0);
    const capacity = data.slots.reduce((s, x) => s + (x.exclusive ? 1 : x.capacity), 0);
    return { live: live.length, capacity, week, ctr: impressions ? (clicks / impressions) * 100 : 0, soon: data.campaigns.filter(c => c.endingSoon).length, drafts: data.campaigns.filter(c => c.phase === "draft").length };
  }, [data]);

  if (!data || !stats) return <div className="pt-page">{error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يجهّز الإعلانات…" />}</div>;

  const open = data.campaigns.find(c => c.id === openId);
  const actions: DrawerActions = {
    busy, act, api, copy, upload, setMsg,
    edit: (c, step) => { setOpenId(""); setWizard({ form: formOf(c), step }); },
  };
  const newCampaign = () => { setOpenId(""); setWizard({ form: blankForm(data), step: 1 }); };
  const kitUrl = data.partnerKit ? new URL(data.partnerKit, location.origin).toString() : "";

  return (
    <div className="pt-page ad-page">
      <PageTitle
        eyebrow="للإدارة الرئيسية"
        subtitle="حملات الشركات ومواقعها وأرقامها، بشروطنا وحدنا."
        action={<button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" onClick={newCampaign}><Plus aria-hidden="true" size={16} /> حملة جديدة</button>}
      >الإعلانات</PageTitle>

      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {msg ? <Notice type="success" onDismiss={() => setMsg("")}>{msg}</Notice> : null}

      <section className="ad-hero" aria-label="لمحة">
        <div className="ad-hero-kpi"><span className="ic"><Megaphone aria-hidden="true" /></span><b>{fmt(stats.live)}<small> / {fmt(stats.capacity)}</small></b><span>الحملات العاملة الآن من سعة المواقع</span></div>
        <div className="ad-hero-kpi"><span className="ic"><TrendingUp aria-hidden="true" /></span><b>{fmt(stats.week)}</b><span>ظهور مرئي آخر ٧ أيام</span></div>
        <div className="ad-hero-kpi"><span className="ic"><ShieldCheck aria-hidden="true" /></span><b>{pct1(stats.ctr)}</b><span>نسبة النقر الإجمالية</span></div>
        <div className={`ad-hero-kpi${stats.soon ? " warn" : ""}`}><span className="ic"><Send aria-hidden="true" /></span><b>{fmt(stats.soon)}</b><span>{stats.soon ? "تنتهي خلال ٧ أيام: تواصل للتجديد" : "لا حملة تنتهي هذا الأسبوع"}</span></div>
      </section>

      <div className="ad-tabs" role="tablist" aria-label="أقسام الإعلانات">
        {([["campaigns", "الحملات", data.campaigns.length], ["placements", "المواقع والمواسم", 0], ["kit", "ملف الشراكة", 0]] as Array<[Tab, string, number]>).map(([id, label, n]) => (
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={id} type="button" role="tab" id={`ad-tab-${id}`} aria-selected={tab === id} aria-controls={`ad-panel-${id}`} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}{n ? <em>{fmt(n)}</em> : null}
          </button>
        ))}
      </div>

      {tab === "campaigns" ? (
        <section id="ad-panel-campaigns" role="tabpanel" aria-labelledby="ad-tab-campaigns">
          <AttentionList items={attentionItems(data)} onCampaign={setOpenId} onTab={setTab} />
          <CampaignList data={data} onOpen={c => setOpenId(c.id)} onNew={newCampaign} />
        </section>
      ) : null}

      {tab === "placements" ? (
        <section id="ad-panel-placements" role="tabpanel" aria-labelledby="ad-tab-placements" className="ad-sec">
          <div className="ad-sech"><h3>أين تظهر الإعلانات</h3><p>مخططاتٌ مبسّطة للصفحات الثلاث؛ اللون يدل على امتلاء كل موقع (أخضر متاح، كهرماني قارب الامتلاء، أحمر ممتلئ).</p></div>
          <PlacementMap data={data} />
          <div className="ad-sech"><h3>تقويم المواسم</h3><p>متى يكون الطلبة في موسم التسجيل أو بدء الفصل أو نهايته، لتختار كل شركةٍ موسم منتجها.</p></div>
          <SeasonTimeline data={data} />
        </section>
      ) : null}

      {tab === "kit" ? (
        <section id="ad-panel-kit" role="tabpanel" aria-labelledby="ad-tab-kit" className="ad-sec">
          <div className="ad-kit">
            <div className="ad-kit-main">
              <h3>ملف الشراكة للشركات</h3>
              <p>صفحةٌ واحدة ترسل رابطها للشركة: حجم الجمهور بأرقامٍ تقريبية، وما يبحث عنه الطلبة، وتقويم المواسم، والمواقع ومقاساتها وتوفرها، وشروطنا. تتحدث وحدها ولا تكشف أي اسم.</p>
              <ol className="ad-steps3">
                <li><b>١</b><span>أنشئ الرابط (مرةً، وتجدّده متى شئت)</span></li>
                <li><b>٢</b><span>أرسله للشركة قبل الاجتماع أو بعده</span></li>
                <li><b>٣</b><span>أضف حملتها وأرسل لها رابط تقريرها الحي</span></li>
              </ol>
              <div className="ad-btnrow">
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" disabled={busy === "kit"} onClick={() => void act("kit", () => api("/api/admin/ads/partner-kit", { method: "POST" }), data.partnerKit ? "تجدّد رابط ملف الشراكة." : "أُنشئ رابط ملف الشراكة.")}>{data.partnerKit ? "تجديد الرابط" : "إنشاء الرابط"}</button>
                {data.partnerKit ? <>
                  <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => void copy(data.partnerKit)}><Copy aria-hidden="true" size={15} /> نسخ</button>
                  <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" onClick={() => window.open(data.partnerKit, "_blank", "noopener")}><ExternalLink aria-hidden="true" size={15} /> فتح</button>
                </> : null}
              </div>
              {kitUrl ? <p className="ad-url-box"><bdi dir="ltr">{kitUrl}</bdi></p> : null}
            </div>
            <aside className="ad-kit-rules">
              <h4>شروط الإعلان</h4>
              <ul>{data.rules.map(r => <li key={r}>{r}</li>)}</ul>
            </aside>
          </div>
        </section>
      ) : null}

      {open ? <CampaignDrawer campaign={open} data={data} onClose={() => setOpenId("")} actions={actions} /> : null}
      {wizard ? (
        <CampaignWizard
          data={data} initial={wizard.form} startStep={wizard.step} actions={actions}
          onClose={() => { setWizard(null); void load(); }}
          onSaved={async () => { await load(); }}
        />
      ) : null}
    </div>
  );
}
