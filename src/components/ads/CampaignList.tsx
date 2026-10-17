/**
 * قائمةُ الحملات: صفٌّ مضغوطٌ لكل حملة (صورة، حالة، ثلاثة أرقام، رسمٌ مصغّر) وما عداه في الدرج.
 * كان لكل حملةٍ بطاقةٌ بستة أزرار وقائمة شروط، فبلغت الصفحة آلاف البكسلات؛ الآن يُقرأ الكلُّ في لمحة.
 */
import React, { useMemo, useState } from "react";
import { ChevronLeft, ImagePlus, Plus, Search } from "lucide-react";
import { AR, countOf } from "../../utils/arabicCount";
import { Avatar, Sparkline, StatusPill, arrowOf, dateShort, fmt, pct1, progressOf, type Campaign, type Payload, type Phase } from "./shared";

type Filter = "all" | Phase;
type Sort = "recent" | "ctr" | "ending";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "الكل" }, { id: "live", label: "تعمل" }, { id: "scheduled", label: "مجدولة" },
  { id: "draft", label: "مسودات" }, { id: "paused", label: "موقوفة" }, { id: "ended", label: "منتهية" },
];

export default function CampaignList({ data, onOpen, onNew }: { data: Payload; onOpen: (c: Campaign) => void; onNew: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: data.campaigns.length };
    for (const c of data.campaigns) out[c.phase] = (out[c.phase] || 0) + 1;
    return out;
  }, [data.campaigns]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.campaigns.filter(c => (filter === "all" || c.phase === filter) && (!q || `${c.company} ${c.category}`.toLowerCase().includes(q)));
    const by: Record<Sort, (a: Campaign, b: Campaign) => number> = {
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
      ctr: (a, b) => b.totals.ctr - a.totals.ctr,
      ending: (a, b) => (a.phase === "live" ? a.daysLeft : 9999) - (b.phase === "live" ? b.daysLeft : 9999),
    };
    return [...list].sort(by[sort]);
  }, [data.campaigns, filter, query, sort]);

  if (!data.campaigns.length) {
    return (
      <div className="ad-empty">
        <span className="ad-empty-art" aria-hidden="true"><ImagePlus /></span>
        <h3>لا حملات بعد</h3>
        <p>ابدأ بحملةٍ أولى: اختر الشركة والموقع والتواريخ، ثم ارفع الصورة واعتمدها لتظهر.</p>
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" onClick={onNew}><Plus aria-hidden="true" size={16} /> حملة جديدة</button>
      </div>
    );
  }

  return (
    <div className="ad-listwrap">
      <div className="ad-toolbar">
        <div className="ad-chips" role="group" aria-label="تصفية الحملات">
          {FILTERS.filter(f => f.id === "all" || counts[f.id]).map(f => (
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={f.id} type="button" className={`ad-chip${filter === f.id ? " on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<em>{fmt(counts[f.id] || 0)}</em>
            </button>
          ))}
        </div>
        <div className="ad-tools">
          <label className="ad-search"><Search aria-hidden="true" size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم الشركة أو الفئة" aria-label="بحث في الحملات" /></label>
          <select className="ad-sort" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="الترتيب">
            <option value="recent">الأحدث</option><option value="ctr">الأعلى نقراً</option><option value="ending">ينتهي قريباً</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? <p className="ad-none">لا حملات مطابقة لهذه التصفية.</p> : (
        <ul className="ad-list">
          {rows.map(c => {
            const live = c.phase === "live";
            const values = c.series.slice(-14).map(p => p.impressions);
            return (
              <li key={c.id}>
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className={`ad-row ad-row-${c.phase}${c.endingSoon ? " is-soon" : ""}`} onClick={() => onOpen(c)} aria-label={`فتح حملة ${c.company}`}>
                  <span className="ad-thumb">
                    {c.creatives[0]
                      ? <img src={`/api/admin/ads/creatives/${c.creatives[0].id}/img`} alt="" loading="lazy" />
                      : <span className="ad-thumb-empty"><ImagePlus aria-hidden="true" size={18} /><small>بلا صورة</small></span>}
                  </span>
                  <span className="ad-main">
                    <span className="ad-name"><Avatar name={c.company} size={22} /><b>{c.company}</b>{c.trial ? <span className="ad-tag ad-tag-trial">تجريبية</span> : null}</span>
                    <span className="ad-sub"><StatusPill phase={c.phase} /><span>{c.slotLabel || c.slot}</span><span className="ad-dot" aria-hidden="true" /><span>{c.seasons?.length ? c.seasons.map(id => data.seasons.find(s => s.id === id)?.label || id).join("، ") : "كل المواسم"}</span>{c.colleges?.length ? <><span className="ad-dot" aria-hidden="true" /><span>{countOf(c.colleges.length, AR.college)} مستهدفة</span></> : null}</span>
                    <span className="ad-when"><span>{dateShort(c.startDay)}</span> ← <span>{dateShort(c.endDay)}</span>{live ? <b className={c.endingSoon ? "soon" : ""}> · متبقٍّ {countOf(Math.max(0, c.daysLeft), AR.day)}</b> : null}</span>
                  </span>
                  <span className="ad-metrics" aria-label="الأرقام">
                    <span><b>{fmt(c.totals.impressions)}</b><small>ظهور</small></span>
                    <span><b>{pct1(c.totals.ctr)}</b><small>نسبة النقر</small></span>
                    <span className={`ad-trend${c.weekly?.hasLastWeek ? ((c.weekly.impressionsChange ?? 0) < 0 ? " down" : " up") : ""}`}><b>{c.weekly?.hasLastWeek ? arrowOf(c.weekly.impressionsChange) : "—"}</b><small>عن الأسبوع الماضي</small></span>
                  </span>
                  <span className="ad-spark-cell"><Sparkline values={values} label="الظهور آخر ١٤ يوماً" /></span>
                  <ChevronLeft className="ad-go" aria-hidden="true" size={18} />
                  {live ? <i className="ad-progress" style={{ inlineSize: `${progressOf(c, data.today)}%` }} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
