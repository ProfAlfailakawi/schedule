/**
 * ── طلبات الحملات من الشركات ─────────────────────────────────────────────────
 *
 * الشركة تضغط «حملة جديدة» في رابطها وتترك بياناتها؛ تظهر هنا بأزرار اتصالٍ مباشر (اتصال، واتساب، بريد)، وزرٌّ واحد
 * «تم التواصل» يُزيلها من الجديدة ومن إشعارات الجرس. بياناتُ التواصل لا تظهر في أي مكانٍ غير هذه الشاشة.
 */
import React from "react";
import { Check, Mail, MessageCircle, Phone, Inbox } from "lucide-react";
import { Avatar, type Lead, type Payload } from "./shared";

const when = (iso: string) => {
  try { return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuwait" }).format(new Date(iso)); } catch { return iso; }
};
/** رقمٌ محلي من ثمانية أرقام يُسبق برمز الكويت لرابط واتساب. */
const waNumber = (phone: string) => (/^\d{8}$/.test(phone) ? `965${phone}` : phone.replace(/^00/, ""));

const LeadCard: React.FC<{ lead: Lead; data: Payload; busy: boolean; onContacted: (id: string) => void }> = ({ lead, data, busy, onContacted }) => {
  const slots = lead.slots.map(id => data.slots.find(s => s.id === id)?.label || id);
  const season = lead.season ? data.seasons.find(s => s.id === lead.season)?.label || lead.season : "";
  const done = lead.status === "contacted";
  return (
    <article className={`ad-leadcard${done ? " done" : ""}`}>
      <Avatar name={lead.company} size={44} />
      <div className="ad-lead-main">
        <header>
          <b>{lead.company}</b>
          <span className="ad-lead-who">{lead.name}</span>
          <time dateTime={lead.createdAt}>{when(lead.createdAt)}</time>
        </header>
        {slots.length || season ? (
          <div className="ad-lead-tags">
            {slots.map(l => <span key={l}>{l}</span>)}
            {season ? <span className="when">{season}</span> : null}
          </div>
        ) : null}
        {lead.note ? <p className="ad-lead-note">{lead.note}</p> : null}
        <div className="ad-lead-actions">
          <a className="btn btn-secondary" href={`tel:+${waNumber(lead.phone)}`}><Phone aria-hidden="true" size={16} /><bdi dir="ltr">{lead.phone}</bdi></a>
          <a className="btn btn-secondary" href={`https://wa.me/${waNumber(lead.phone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" size={16} />واتساب</a>
          {lead.email ? <a className="btn btn-secondary" href={`mailto:${lead.email}`}><Mail aria-hidden="true" size={16} />بريد</a> : null}
          {done
            ? <span className="ad-lead-done"><Check aria-hidden="true" size={16} />تم التواصل</span>
            : <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" disabled={busy} onClick={() => onContacted(lead.id)}><Check aria-hidden="true" size={16} />تم التواصل</button>}
        </div>
      </div>
    </article>
  );
};

export default function LeadsPanel({ data, busy, onContacted }: { data: Payload; busy: string; onContacted: (id: string) => void }) {
  const fresh = data.leads.filter(l => l.status === "new");
  const old = data.leads.filter(l => l.status !== "new");
  if (!data.leads.length) {
    return (
      <div className="ad-empty-leads">
        <span className="ic"><Inbox aria-hidden="true" /></span>
        <b>لا طلبات بعد</b>
        <p>حين تضغط شركةٌ «حملة جديدة» في رابط ملف الشراكة وتترك بياناتها، تظهر هنا ويصلك إشعار.</p>
      </div>
    );
  }
  return (
    <div className="ad-leads">
      {fresh.length ? fresh.map(l => <LeadCard key={l.id} lead={l} data={data} busy={busy === `lead-${l.id}`} onContacted={onContacted} />) : <p className="ad-note">لا طلبات جديدة.</p>}
      {old.length ? (
        <details className="ad-more"><summary>تم التواصل معهم</summary>
          <div className="ad-leads">{old.map(l => <LeadCard key={l.id} lead={l} data={data} busy={false} onContacted={onContacted} />)}</div>
        </details>
      ) : null}
    </div>
  );
}
