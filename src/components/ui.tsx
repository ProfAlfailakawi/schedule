import React from "react";
import { createPortal } from "react-dom";
import { runVisualTransition } from "../utils/visualTransition";
import { AlertTriangle, Check, Edit2, Plus, Search, Trash2, X, Inbox, ChevronLeft, CalendarDays, Clock3, Hash, Hourglass, Layers, ListOrdered, MapPin, Tag } from "lucide-react";

export function PageTitle({ children, action, subtitle, eyebrow }: { children: React.ReactNode; action?: React.ReactNode; subtitle?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return <div className="page-heading"><div className="page-heading-copy">{eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}<h1>{children}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>{action ? <div className="page-heading-action">{action}</div> : null}</div>;
}
export function Surface({ children, className = "" }: { children?: React.ReactNode; className?: string }) { return <section className={`surface ${className}`.trim()}>{children}</section>; }
/**
 * Every message in the product lands in the same place.
 *
 * These used to render wherever the calling screen happened to sit, so after an
 * action the message could appear above the fold, below it, or inside a panel
 * the user had already scrolled past. A single fixed layer removes the guessing:
 * the message always arrives at the top of the viewport, always looks the same,
 * and a success message clears itself.
 *
 * `inline` is kept for the two places where the message belongs inside the
 * surface it describes — the login card and any printed sheet.
 */
export function Notice({ type = "error", children, inline = false, onDismiss }: {
  type?: "error" | "success";
  children: React.ReactNode;
  inline?: boolean;
  onDismiss?: () => void;
}) {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => { setVisible(true); }, [children, type]);
  React.useEffect(() => {
    if (inline || type !== "success" || !visible) return;
    const timer = window.setTimeout(() => { setVisible(false); onDismiss?.(); }, 4200);
    return () => window.clearTimeout(timer);
  }, [inline, type, visible, children, onDismiss]);

  if (!visible) return null;

  const body = (
    <div className={`notice notice-${type}`} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"}>
      {type === "error" ? <AlertTriangle aria-hidden="true" /> : <Check aria-hidden="true" />}
      <span title={typeof children === "string" ? children : undefined}>{children}</span>
      <button
        type="button"
        className="notice-close"
        aria-label="إغلاق الرسالة"
        title="إغلاق"
        onClick={() => { setVisible(false); onDismiss?.(); }}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );

  if (inline || typeof document === "undefined") return body;
  return createPortal(<div className="toast-layer no-print">{body}</div>, document.body);
}
export function PrimaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-primary ${className}`.trim()}>{children}</button>; }
export function SecondaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-secondary ${className}`.trim()}>{children}</button>; }
export function GhostButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-ghost ${className}`.trim()}>{children}</button>; }
export function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <PrimaryButton onClick={onClick}><Plus aria-hidden="true" />{children}</PrimaryButton>; }
export function IconAction({ label, kind, onClick }: { label: string; kind: "edit" | "delete"; onClick: () => void }) { return <button className={`icon-action icon-action-${kind}`} type="button" title={label} aria-label={label} onClick={onClick}>{kind === "edit" ? <Edit2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>; }
export function Field({ label, required, children, hint }: { label: React.ReactNode; required?: boolean; children: React.ReactNode; hint?: React.ReactNode }) { return <div className="field"><label>{label}{required ? <span className="required">*</span> : null}</label>{children}{hint ? <span className="field-help">{hint}</span> : null}</div>; }
export function FormActions({ onBack, loading, submitDisabled, submitLabel = "موافق" }: { onBack: () => void; loading?: boolean; submitDisabled?: boolean; submitLabel?: React.ReactNode }) { return <div className="form-actions"><PrimaryButton type="submit" disabled={loading || submitDisabled}>{submitLabel}</PrimaryButton><SecondaryButton type="button" onClick={onBack} disabled={loading}>تراجع</SecondaryButton></div>; }
export function EmptyRow({ colSpan, label = "لا توجد بيانات مطابقة" }: { colSpan: number; label?: string }) { return <tr><td className="empty-cell" colSpan={colSpan}><span>{label}</span></td></tr>; }
export function ListToolbar({ value, onChange, placeholder = "بحث داخل البيانات", count, children }: { value: string; onChange: (value: string) => void; placeholder?: string; count?: number; children?: React.ReactNode }) { return <div className="list-toolbar"><div className="list-search"><Search aria-hidden="true"/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value?<button type="button" onClick={()=>onChange("")} aria-label="مسح"><X/></button>:null}</div><div className="list-toolbar-side">{typeof count === "number" ? <span className="count-chip">{count.toLocaleString("ar-KW-u-nu-latn")} سجل</span> : null}{children}</div></div>; }
export function StatCard({ label, value, detail, icon }: { label: React.ReactNode; value: React.ReactNode; detail?: React.ReactNode; icon?: React.ReactNode }) { return <article className="stat-card"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span>{detail ? <small>{detail}</small> : null}</div></article>; }
export function Segmented({ value, options, onChange }: { value: string; options: Array<{value:string;label:React.ReactNode}>; onChange:(value:string)=>void }) { return <div className="segmented">{options.map(option=><button key={option.value} type="button" className={value===option.value?"active":""} onClick={()=>runVisualTransition(()=>onChange(option.value))}>{option.label}</button>)}</div>; }
/**
 * The identity every printed sheet carries.
 *
 * A page that leaves the building has to say what it is, what it covers and
 * when it was produced — otherwise two printouts of the same report cannot be
 * told apart. The footer repeats on every page because a stack of loose sheets
 * is the normal way these reports are read.
 */
export function PrintLetterhead({ title, scope }: { title: React.ReactNode; scope?: React.ReactNode }) {
  const stamp = new Date().toLocaleString("ar-KW-u-nu-latn", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  return (
    <>
      <header className="print-head">
        <div className="print-head-title">
          <h1>{title}</h1>
          {scope ? <p>{scope}</p> : null}
        </div>
        <div className="print-head-mark">
          <strong>SCHEDULE</strong>
          <span>الجدول الأكاديمي</span>
        </div>
      </header>
      <footer className="print-foot">
        <span>{title}</span>
        <span>{stamp}</span>
      </footer>
    </>
  );
}
/** Lends an embedded screen's primary action to the console header above it. */
export function EmbeddedAction({ slot, children }: { slot: HTMLElement | null; children: React.ReactNode }) {
  if (!slot) return null;
  return createPortal(children, slot);
}
/**
 * The rail that fronts a console page (academic reference, system admin).
 *
 * It is navigation and census in one control: an icon chip identifies the
 * section at a glance and, where the number is cheap to know, the size of the
 * section sits above its name. `count: null` means "still counting", which
 * keeps the row from jumping once the answer arrives; omitting `count`
 * entirely gives a purely navigational tab.
 */
export function ConsoleRail({ value, options, onChange, label }: {
  value: string;
  options: Array<{ value: string; label: React.ReactNode; icon: React.ReactNode; count?: number | null }>;
  onChange: (value: string) => void;
  label: string;
}) {
  // On a narrow screen the rail scrolls, and the section you are actually in
  // can start off-screen. Bring it into view whenever it changes.
  const active = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <nav className="console-rail no-print" aria-label={label}>
      {options.map(option => {
        const counted = option.count !== undefined;
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            ref={on ? active : undefined}
            className={`console-tab ${on ? "active" : ""} ${counted ? "" : "console-tab-plain"}`.trim()}
            aria-current={on ? "page" : undefined}
            onClick={() => runVisualTransition(() => onChange(option.value))}
          >
            <span className="console-tab-icon" aria-hidden="true">{option.icon}</span>
            {counted ? (
              <b className={option.count === null ? "pending" : ""}>
                {option.count === null ? "—" : option.count.toLocaleString("ar-KW-u-nu-latn")}
              </b>
            ) : null}
            <span className="console-tab-label">{option.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral"|"success"|"warning"|"danger"|"info" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }

export function EmptyState({ title="لا توجد بيانات", detail, action }: { title?:React.ReactNode; detail?:React.ReactNode; action?:React.ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon"><Inbox/></span><strong>{title}</strong><p>{detail}</p>{action?<div>{action}</div>:null}</div>;
}
export function RecordDeck({children,className=""}:{children:React.ReactNode;className?:string}){return <div className={`record-deck ${className}`.trim()}>{children}</div>}
export function RecordCard({icon,title,subtitle,meta,actions,onClick,className="",children}:{key?:string|number;icon?:React.ReactNode;title:React.ReactNode;subtitle?:React.ReactNode;meta?:React.ReactNode;actions?:React.ReactNode;onClick?:()=>void;className?:string;children?:React.ReactNode}){
  const engage=()=>{if(onClick)runVisualTransition(onClick)};
  const activate=(e:any)=>{if(!onClick)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();engage()}};
  return <article role={onClick?"button":undefined} tabIndex={onClick?0:undefined} onKeyDown={activate} onClick={onClick?engage:undefined} className={`record-card ${onClick?"record-card-clickable":""} ${className}`.trim()}><div className="record-card-lead">{icon?<span className="record-card-icon">{icon}</span>:null}<div className="record-card-copy"><strong>{title}</strong>{subtitle?<span>{subtitle}</span>:null}{meta?<div className="record-card-meta">{meta}</div>:null}</div></div>{children?<div className="record-card-body">{children}</div>:null}{actions?<div className="record-card-actions" onClick={(e:any)=>e.stopPropagation()}>{actions}</div>:onClick?<ChevronLeft className="record-card-arrow"/>:null}</article>;
}
/** Metadata reads as a glyph plus its value. The word survives only as a tooltip. */
const PILL_GLYPHS:Record<string,React.ReactNode>={
  "الوقت":<Clock3/>,"الأيام":<CalendarDays/>,"المكان":<MapPin/>,
  "الوحدات":<Layers/>,"الساعات":<Hourglass/>,"الترتيب":<ListOrdered/>,
  "الرمز":<Tag/>,"رمز القسم":<Tag/>,"السعة":<Hash/>
};
export function MetaPill({label,value,dir}:{label:React.ReactNode;value:React.ReactNode;dir?:"ltr"|"rtl"}){
  const key=typeof label==="string"?label:"";
  const glyph=PILL_GLYPHS[key];
  return <span className="meta-pill" dir={dir} title={key||undefined}>{glyph?<span className="meta-pill-glyph" aria-hidden="true">{glyph}</span>:<small>{label}</small>}<b>{value}</b></span>;
}
export function SkeletonDeck({count=4}:{count?:number}){return <div className="record-deck skeleton-deck">{Array.from({length:count},(_,i)=><article className="record-card skeleton-card" key={i}><span/><div><i/><i/></div></article>)}</div>}
