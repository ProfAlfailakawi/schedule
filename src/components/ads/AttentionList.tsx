/**
 * «تحتاج انتباهك»: ما يستحق قراراً الآن، مجمّعاً بدل أن يبحث عنه المدير في القائمة.
 * تُحسب العناصر من بيانات الشاشة نفسها بلا طلبٍ إضافي، وكلُّ عنصرٍ ينقل إلى الحملة أو التبويب المعني.
 */
import React from "react";
import { AlertTriangle, CalendarClock, ImageOff, RefreshCw, Users } from "lucide-react";
import { AR, countOf } from "../../utils/arabicCount";
import type { Campaign, Payload } from "./shared";

export interface AttentionItem { key: string; tone: "warn" | "info" | "bad"; icon: React.ReactNode; text: string; campaignId?: string; tab?: "placements" }

export function attentionItems(data: Payload): AttentionItem[] {
  const out: AttentionItem[] = [];
  const by = (f: (c: Campaign) => boolean) => data.campaigns.filter(f);
  for (const c of by(c => c.phase === "draft" && c.creatives.length > 0)) out.push({ key: `draft-${c.id}`, tone: "warn", icon: <AlertTriangle size={16} aria-hidden="true" />, text: `حملة «${c.company}» جاهزة بصورتها وتنتظر اعتمادك.`, campaignId: c.id });
  for (const c of by(c => c.phase === "draft" && c.creatives.length === 0)) out.push({ key: `noimg-${c.id}`, tone: "info", icon: <ImageOff size={16} aria-hidden="true" />, text: `حملة «${c.company}» مسودة بلا صورة بعد.`, campaignId: c.id });
  for (const c of by(c => c.endingSoon)) out.push({ key: `end-${c.id}`, tone: "warn", icon: <CalendarClock size={16} aria-hidden="true" />, text: `حملة «${c.company}» تنتهي بعد ${countOf(Math.max(0, c.daysLeft), AR.day)}؛ أرسل لها رسالة التجديد.`, campaignId: c.id });
  for (const c of by(c => c.trial && c.phase === "ended" && c.daysLeft >= -7)) out.push({ key: `trial-${c.id}`, tone: "info", icon: <RefreshCw size={16} aria-hidden="true" />, text: `انتهت تجربة «${c.company}» مؤخراً؛ وقتٌ مناسب لعرض التثبيت.`, campaignId: c.id });
  for (const c of by(c => c.creatives.some(x => x.qualityOverride) && c.phase !== "ended")) out.push({ key: `q-${c.id}`, tone: "bad", icon: <ImageOff size={16} aria-hidden="true" />, text: `حملة «${c.company}» تحمل صورةً رُفعت رغم تحذير الجودة.`, campaignId: c.id });
  for (const s of data.slots) {
    const cap = s.exclusive ? 1 : s.capacity;
    if (cap > 1 && s.live >= cap) out.push({ key: `full-${s.id}`, tone: "info", icon: <Users size={16} aria-hidden="true" />, text: `${s.label} ممتلئ؛ ${s.nextFree ? "أقرب خلوّ بعد انتهاء إحدى الحملات." : "لا مكان لحملةٍ جديدة الآن."}`, tab: "placements" });
  }
  return out;
}

export default function AttentionList({ items, onCampaign, onTab }: { items: AttentionItem[]; onCampaign: (id: string) => void; onTab: (tab: "placements") => void }) {
  if (!items.length) return <p className="ad-clear">كل شيءٍ على ما يرام: لا شيء ينتظر قرارك الآن.</p>;
  return (
    <section className="ad-attn" aria-label="تحتاج انتباهك">
      <h3>تحتاج انتباهك <em>{items.length}</em></h3>
      <ul>
        {items.slice(0, 6).map(it => (
          <li key={it.key} className={`t-${it.tone}`}>
            <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={() => (it.campaignId ? onCampaign(it.campaignId) : it.tab ? onTab(it.tab) : undefined)}>
              <span className="ic">{it.icon}</span><span>{it.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 ? <p className="ad-note">وغيرها ({items.length - 6}) في القائمة أدناه.</p> : null}
    </section>
  );
}
