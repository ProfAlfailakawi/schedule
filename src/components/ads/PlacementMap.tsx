/**
 * خريطةُ المواضع وتقويمُ المواسم: ما كان جدولاً من أرقامٍ صار صورةً تُرى: أين يقع كل موقع إعلاني
 * من الشاشة، وكم حملةً فيه الآن، ومتى يكون الطلبةُ في أي موسم.
 */
import React, { useMemo } from "react";
import { AR, countOf } from "../../utils/arabicCount";
import { dateShort, type Payload, type Slot } from "./shared";

function SlotBlock({ slot, thin = false }: { slot?: Slot; thin?: boolean }) {
  if (!slot) return null;
  const cap = slot.exclusive ? 1 : slot.capacity;
  const ratio = slot.live / cap;
  const tone = ratio >= 1 ? "full" : ratio >= 0.6 ? "busy" : "free";
  return (
    <div className={`ad-slotblock ${tone}${thin ? " thin" : ""}`} style={{ aspectRatio: `${slot.width}/${slot.height}` }} title={slot.where}>
      <b>{slot.label}</b>
      <small><bdi dir="ltr">{slot.width}×{slot.height}</bdi></small>
      <span className="ad-meter" aria-label={`${slot.live} من ${cap}`}>{Array.from({ length: cap }, (_, i) => <i key={i} className={i < slot.live ? "on" : ""} />)}</span>
    </div>
  );
}

export function PlacementMap({ data }: { data: Payload }) {
  const by = (id: string) => data.slots.find(s => s.id === id);
  return (
    <div className="ad-map">
      <figure className="ad-surface">
        <div className="ad-phone3">
          <div className="ad-sk ad-sk-bar" /><div className="ad-sk ad-sk-hero" />
          <div className="ad-sk ad-sk-card"><i /><i /><i className="s" /><SlotBlock slot={by("break")} /></div>
          <SlotBlock slot={by("sponsor")} thin /><SlotBlock slot={by("me")} />
          <div className="ad-sk ad-sk-tabs" />
        </div>
        <figcaption><b>«مساري» · كل الجامعة</b><span>يصل كل الطلبة من كل الكليات افتراضياً، ويمكن حصره بكلية. على الجوال: «وقت الفراغ» داخل التذكرة، و«مساري» أسفل الصفحة، والراعي فوقها. لا إعلان قبل الدخول.</span></figcaption>
      </figure>
      <figure className="ad-surface">
        <div className="ad-desk">
          <div className="ad-sk ad-sk-bar" />
          <div className="ad-grid-sk">{Array.from({ length: 20 }, (_, i) => <i key={i} />)}</div>
          <SlotBlock slot={by("sponsor")} thin /><SlotBlock slot={by("schedule")} />
        </div>
        <figcaption><b>الجدول العام وجدول الطلبة</b><span>أسفل الجدول (روابط الجداول للعرض فقط). لا إعلان في بطاقة الأستاذ ولا الاستبيان.</span></figcaption>
      </figure>
      <figure className="ad-surface">
        <div className="ad-desk">
          <div className="ad-sk ad-sk-bar" />
          <div className="ad-stat-sk"><i /><i /><i /><i /></div>
          <SlotBlock slot={by("dashboard")} />
        </div>
        <figcaption><b>أعضاء هيئة التدريس والإداريين</b><span>بطاقةٌ في لوحة الأساتذة والإداريين بعد تسجيل الدخول.</span></figcaption>
      </figure>
    </div>
  );
}

export function SeasonTimeline({ data }: { data: Payload }) {
  const model = useMemo(() => {
    const items = data.calendar.filter(i => i.to >= data.today);
    if (!items.length) return null;
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
    const from = Math.min(day(data.today) - 7, ...items.map(i => day(i.from)));
    const to = Math.min(day(data.today) + 300, Math.max(...items.map(i => day(i.to))));
    const span = Math.max(30, to - from);
    const pos = (d: string) => Math.max(0, Math.min(100, ((day(d) - from) / span) * 100));
    return { items, span, from, pos, today: pos(data.today) };
  }, [data]);

  if (!model) return <p className="ad-note">لا تواريخ فصلٍ مسجّلة بعد؛ أضفها من شاشة الفصول لتظهر المواسم هنا.</p>;
  const months: Array<{ label: string; at: number }> = [];
  for (let t = Math.ceil(model.from / 30.4) * 30.4; t < model.from + model.span; t += 30.4) {
    const d = new Date(t * 86_400_000).toISOString().slice(0, 10);
    months.push({ label: new Intl.DateTimeFormat("ar-KW-u-nu-latn", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)), at: ((t - model.from) / model.span) * 100 });
  }
  const targeting = (id: string) => data.campaigns.filter(c => c.status === "approved" && c.phase !== "ended" && (!c.seasons?.length || c.seasons.includes(id))).length;
  return (
    <div className="ad-timeline" role="img" aria-label="تقويم المواسم">
      <div className="ad-tl-head" aria-hidden="true">{months.map(m => <span key={m.label + m.at} style={{ insetInlineStart: `${m.at}%` }}>{m.label}</span>)}</div>
      {data.seasons.filter(s => s.id !== "break").map(s => {
        const rows = model.items.filter(i => i.season === s.id);
        const n = targeting(s.id);
        return (
          <div className="ad-tl-row" key={s.id}>
            <div className="ad-tl-lab"><b>{s.label}</b><small>{n ? `${countOf(n, AR.campaign)} تستهدفه` : "بلا حملات"}</small></div>
            <div className="ad-tl-track">
              {rows.map(i => <span key={i.from + i.to} className={`ad-tl-bar s-${s.id}${i.now ? " now" : ""}`} style={{ insetInlineStart: `${model.pos(i.from)}%`, inlineSize: `${Math.max(1.5, model.pos(i.to) - model.pos(i.from))}%` }} title={`${i.term}: ${i.from} ← ${i.to}`}><em>{dateShort(i.from)}</em></span>)}
              {rows.length ? null : <span className="ad-tl-empty">لا موعد قادم لهذا الموسم</span>}
              <i className="ad-tl-today" style={{ insetInlineStart: `${model.today}%` }} aria-hidden="true" />
            </div>
          </div>
        );
      })}
      <p className="ad-note">الخط الرأسي = اليوم. المواسم تُشتق من تواريخ الفصل ومراحل الطلبة المسجّلة، وهي نفسها المعروضة للشركات. موسم «بين الفصول» {data.activeSeasons.includes("break") ? "هو الجاري الآن" : "ليس جارياً الآن"}.</p>
    </div>
  );
}
