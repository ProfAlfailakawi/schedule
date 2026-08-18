import React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { runVisualTransition } from "../utils/visualTransition";
import { AlertTriangle, Check, Edit2, Plus, Search, Trash2, X, Inbox, ChevronLeft, CalendarDays, Clock3, Hash, Hourglass, Layers, ListOrdered, MapPin, Tag, Info, ShieldAlert } from "lucide-react";

let toastHost: HTMLDivElement | null = null;
function getToastHost() {
  if (toastHost?.isConnected) return toastHost;
  const existing = document.getElementById("app-toast-layer");
  if (existing instanceof HTMLDivElement) {
    toastHost = existing;
    return toastHost;
  }
  toastHost = document.createElement("div");
  toastHost.id = "app-toast-layer";
  toastHost.className = "toast-layer no-print";
  document.body.appendChild(toastHost);
  return toastHost;
}

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
/**
 * Four kinds only — success, info, warning, block — the whole vocabulary of the
 * product's messages. `error` is kept as an alias of `block` so existing call
 * sites keep working. A message that carries a decision (warning/block/error)
 * stays until it is dealt with; a receipt (success/info) clears itself. An
 * optional single `action` is the one thing the reader can do about it.
 */
const NOTICE_ICON = { success: Check, info: Info, warning: AlertTriangle, block: ShieldAlert, error: ShieldAlert } as const;


type ConfirmTone = "danger" | "warning" | "info";
export function visualConfirm({
  title,
  message,
  confirmLabel = "متابعة",
  cancelLabel = "إلغاء",
  tone = "warning",
  compact = false,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /**
   * Small, local delete actions confirm in place instead of opening a second
   * sheet. The operation behind the button is unchanged; only the moment of
   * confirmation is made lighter and more contextual.
   */
  compact?: boolean;
}) {
  if (typeof document === "undefined") {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  }
  return new Promise<boolean>((resolve) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const triggerRect = trigger?.getBoundingClientRect?.();
    const inlineConfirm = compact && tone === "danger";
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (value: boolean) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    function ConfirmDialog() {
      const cancelRef = React.useRef<HTMLButtonElement>(null);
      React.useEffect(() => {
        cancelRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close(false);
          }
        };
        document.addEventListener("keydown", onKey);
        const expiry = inlineConfirm ? window.setTimeout(() => close(false), 4200) : 0;
        return () => {
          document.removeEventListener("keydown", onKey);
          if (expiry) window.clearTimeout(expiry);
        };
      }, []);
      const Icon = tone === "danger" ? Trash2 : tone === "info" ? Info : AlertTriangle;
      const eyebrow = tone === "danger" ? "إجراء حساس" : tone === "info" ? "تأكيد" : "راجع قبل المتابعة";
      const heading = title || (tone === "danger" ? "تأكيد الحذف" : "تأكيد الإجراء");

      if (inlineConfirm) {
        const center = triggerRect
          ? Math.max(70, Math.min(window.innerWidth - 70, triggerRect.left + triggerRect.width / 2))
          : window.innerWidth / 2;
        const top = triggerRect
          ? Math.max(12, Math.min(window.innerHeight - 64, triggerRect.top + triggerRect.height / 2 - 24))
          : Math.max(12, window.innerHeight / 2 - 24);
        return (
          <div className="schedule-confirm-inline-layer no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
            <section
              className="schedule-confirm-inline"
              role="alertdialog"
              aria-modal="true"
              aria-label={`${heading}. ${message}`}
              style={{ left: `${center}px`, top: `${top}px` }}
            >
              <span className="schedule-confirm-inline-mark" aria-hidden="true"><Trash2 /></span>
              <span className="sr-only">{heading}. {message}</span>
              <button
                ref={cancelRef}
                type="button"
                className="schedule-confirm-inline-cancel"
                data-guide-ignore="تأكيد بصري عام تابع لزر الحذف الذي فتحه"
                onClick={() => close(false)}
                aria-label={cancelLabel}
                title={cancelLabel}
              ><X aria-hidden="true" /></button>
              <button
                type="button"
                className="schedule-confirm-inline-accept"
                data-guide-ignore="تأكيد بصري عام تابع لزر الحذف الذي فتحه"
                onClick={() => close(true)}
                aria-label={confirmLabel}
                title={confirmLabel}
              ><Check aria-hidden="true" /></button>
            </section>
          </div>
        );
      }

      return (
        <div className="schedule-confirm-backdrop no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
          <section className={`schedule-confirm-card tone-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="schedule-confirm-title" aria-describedby="schedule-confirm-message">
            <span className="schedule-confirm-mark" aria-hidden="true"><Icon /></span>
            <div className="schedule-confirm-copy">
              <small>{eyebrow}</small>
              <strong id="schedule-confirm-title">{heading}</strong>
              <p id="schedule-confirm-message">{message}</p>
            </div>
            <div className="schedule-confirm-actions">
              <button ref={cancelRef} type="button" className="btn btn-secondary" data-guide-ignore="حوار تأكيد عام لا يمثل ميزة مستقلة في المرشد" onClick={() => close(false)}>{cancelLabel}</button>
              <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} data-guide-ignore="حوار تأكيد عام لا يمثل ميزة مستقلة في المرشد" onClick={() => close(true)}>{confirmLabel}</button>
            </div>
          </section>
        </div>
      );
    }
    root.render(<ConfirmDialog />);
  });
}
export function Notice({ type = "error", children, inline = false, onDismiss, action }: {
  type?: "success" | "info" | "warning" | "block" | "error";
  children: React.ReactNode;
  inline?: boolean;
  onDismiss?: () => void;
  action?: React.ReactNode;
}) {
  const [visible, setVisible] = React.useState(true);
  const assertive = type === "block" || type === "error";
  /**
   * Every message leaves on its own, and the heavier it is the longer it stays.
   *
   * Only receipts used to expire; a refusal — "the hall is booked at this hour"
   * — stayed on the screen until something else replaced it, so a reader who
   * had already understood it and moved on was still being told off by a red
   * bar minutes later. The message is not the state: the state is the schedule,
   * and it will say the same thing again the moment it is asked again. A
   * warning is given time to be read, not time to accumulate.
   */
  const life = type === "success" || type === "info" ? 4200 : type === "warning" ? 8000 : 12000;

  React.useEffect(() => { setVisible(true); }, [children, type]);
  React.useEffect(() => {
    if (inline || !visible) return;
    const timer = window.setTimeout(() => { setVisible(false); onDismiss?.(); }, life);
    return () => window.clearTimeout(timer);
  }, [inline, visible, children, onDismiss, life]);

  if (!visible) return null;
  const Icon = NOTICE_ICON[type] || ShieldAlert;

  const body = (
    <div className={`notice notice-${type}`} role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"}>
      <Icon aria-hidden="true" />
      <div className="notice-copy">
        <span title={typeof children === "string" ? children : undefined}>{children}</span>
        {action ? <div className="notice-action">{action}</div> : null}
      </div>
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
  return createPortal(body, getToastHost());
}
const DRAWER_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/**
 * Keyboard-complete side panels, in one hook.
 *
 * When a drawer opens it takes focus; Tab and Shift+Tab cycle inside it instead
 * of escaping to the page behind; Escape closes it; and closing hands focus back
 * to whatever opened it. Every panel that uses this behaves the same for a
 * keyboard or a screen reader — the difference between a panel and a trap.
 */
export function useDrawerA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = React.useRef<T>(null);
  // The close callback is read through a ref so the effect can mount ONCE.
  // Keyed on `onClose` — which callers create fresh on every render — the
  // effect re-ran on every keystroke, and its first act is to move focus to the
  // first element in the drawer: the ✕ button. So typing one character threw
  // the cursor onto Close, across every add/edit panel in the program. Now the
  // focus lands once, when the drawer opens, and stays where the reader puts it.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const list = (): HTMLElement[] => {
      const root = ref.current;
      if (!root) return [];
      return (Array.from(root.querySelectorAll(DRAWER_FOCUSABLE)) as HTMLElement[]).filter(el => el.offsetParent !== null);
    };
    // Open on the first real field, not the ✕ — a form should invite the first
    // answer, and the close button is reached by Tab or Escape when wanted.
    const focusables = list();
    const firstField = focusables.find(el => !el.classList.contains("drawer-close")) || focusables[0] || ref.current;
    firstField?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const els = list(); if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);
  return ref;
}
/** The academic add/edit side panel: a backdrop, a keyboard-complete drawer, one close. */
export function CatalogFormDrawer({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useDrawerA11y<HTMLElement>(onClose);
  return (
    <>
      <div className="catalog-form-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={ref} className={`content-stack editor-page catalog-form-drawer no-print ${wide ? "catalog-form-drawer-wide" : ""}`.trim()} role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="drawer-close catalog-drawer-close" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        {children}
      </aside>
    </>
  );
}
export function PrimaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-primary ${className}`.trim()}>{children}</button>; }
export function SecondaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-secondary ${className}`.trim()}>{children}</button>; }
export function GhostButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`btn btn-ghost ${className}`.trim()}>{children}</button>; }
export function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <PrimaryButton onClick={onClick}><Plus aria-hidden="true" />{children}</PrimaryButton>; }
export function IconAction({ label, kind, onClick }: { label: string; kind: "edit" | "delete"; onClick: () => void }) { return <button className={`icon-action icon-action-${kind}`} type="button" title={label} aria-label={label} data-guide-ignore="إجراء سجل محلي واضح؛ التعديل يفتح محرره والحذف يستخدم تأكيد الشاشة نفسه" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}>{kind === "edit" ? <Edit2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>; }
export function Field({ label, required, children, hint }: { label: React.ReactNode; required?: boolean; children: React.ReactNode; hint?: React.ReactNode }) { return <div className="field"><label>{label}{required ? <span className="required">*</span> : null}</label>{children}{hint ? <span className="field-help">{hint}</span> : null}</div>; }
/**
 * The way out is never disabled.
 *
 * Cancel used to be greyed out alongside submit whenever a request was in
 * flight, and the two share one busy flag — so a request that never settled
 * (a dropped campus connection, a gateway holding the socket open) left a
 * person inside a form with both buttons dead and no other exit: "it will not
 * let me out, and nothing happens". Leaving is a pure client-side reset with
 * nothing to lose, so it stays live at all times; only submit is guarded,
 * which is the button that could write twice.
 */
export function FormActions({ onBack, loading, submitDisabled, submitLabel = "موافق" }: { onBack: () => void; loading?: boolean; submitDisabled?: boolean; submitLabel?: React.ReactNode }) { return <div className="form-actions"><PrimaryButton type="submit" disabled={loading || submitDisabled}>{submitLabel}</PrimaryButton><SecondaryButton type="button" onClick={onBack}>تراجع</SecondaryButton></div>; }
export function EmptyRow({ colSpan, label = "لا توجد بيانات مطابقة" }: { colSpan: number; label?: string }) { return <tr><td className="empty-cell" colSpan={colSpan}><span>{label}</span></td></tr>; }
export function ListToolbar({ value, onChange, placeholder = "بحث داخل البيانات", count, children }: { value: string; onChange: (value: string) => void; placeholder?: string; count?: number; children?: React.ReactNode }) { return <div className="list-toolbar"><div className="list-search"><Search aria-hidden="true"/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value?<button type="button" onClick={()=>onChange("")} aria-label="مسح"><X/></button>:null}</div><div className="list-toolbar-side">{typeof count === "number" ? <span className="count-chip">{count.toLocaleString("ar-KW-u-nu-latn")} سجل</span> : null}{children}</div></div>; }
export function StatCard({ label, value, detail, icon }: { label: React.ReactNode; value: React.ReactNode; detail?: React.ReactNode; icon?: React.ReactNode }) { return <article className="stat-card"><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span>{detail ? <small>{detail}</small> : null}</div></article>; }
export function Segmented({ value, options, onChange, instant = false }: { value: string; options: Array<{value:string;label:React.ReactNode}>; onChange:(value:string)=>void; instant?: boolean }) { return <div className="segmented">{options.map(option=><button key={option.value} type="button" className={value===option.value?"active":""} onClick={()=>instant?onChange(option.value):runVisualTransition(()=>onChange(option.value))}>{option.label}</button>)}</div>; }
/**
 * The identity every printed sheet carries.
 *
 * A page that leaves the building has to say what it is, what it covers and
 * when it was produced — otherwise two printouts of the same report cannot be
 * told apart. The footer repeats on every page because a stack of loose sheets
 * is the normal way these reports are read.
 */
/**
 * The official masthead of every printable report (Note 32).
 *
 * The college's own name leads, beside a dignified academic emblem, so a printed
 * sheet reads as an institutional document rather than an app export. `college`
 * is optional — without it the mark falls back to the workspace name.
 */
let printHost: HTMLDivElement | null = null;
let printPortalUsers = 0;

/**
 * Printable documents live outside the application layout. Hiding a long
 * screen with visibility still leaves its boxes in pagination; a body-level
 * host gives the browser exactly one document tree to paginate.
 */
function getPrintHost() {
  if (typeof document === "undefined") return null;
  if (printHost?.isConnected) return printHost;
  const existing = document.getElementById("app-print-root");
  if (existing instanceof HTMLDivElement) { printHost = existing; return printHost; }
  printHost = document.createElement("div");
  printHost.id = "app-print-root";
  printHost.className = "print-portal-root";
  document.body.appendChild(printHost);
  return printHost;
}

export function PrintPortal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const host = React.useMemo(() => getPrintHost(), []);
  React.useLayoutEffect(() => {
    if (!host) return;
    printPortalUsers += 1;
    document.body.classList.add("has-print-portal");
    return () => {
      printPortalUsers = Math.max(0, printPortalUsers - 1);
      if (!printPortalUsers) document.body.classList.remove("has-print-portal");
    };
  }, [host]);
  if (!host) return null;
  return createPortal(<div className={`print-only ${className}`.trim()}>{children}</div>, host);
}

export function PrintLetterhead({ title, scope, college, footer = true }: { title: React.ReactNode; scope?: React.ReactNode; college?: React.ReactNode; footer?: boolean }) {
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <>
      <header className="print-head">
        <div className="print-head-title">
          <h1>{title}</h1>
          {scope ? <p>{scope}</p> : null}
        </div>
        <div className="print-head-brand">
          <span className="print-emblem" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40" role="img">
              <circle cx="20" cy="20" r="18.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.45" />
              <path d="M20 13.4c-2.7-1.9-6-1.9-8.4 0v10.8c2.4-1.9 5.7-1.9 8.4 0 2.7-1.9 6-1.9 8.4 0V13.4c-2.4-1.9-5.7-1.9-8.4 0z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <line x1="20" y1="13.4" x2="20" y2="24.2" stroke="currentColor" strokeWidth="1.05" />
              <path d="M20 5.4l1.05 2.13 2.35.34-1.7 1.66.4 2.34-2.1-1.1-2.1 1.1.4-2.34-1.7-1.66 2.35-.34z" fill="currentColor" />
            </svg>
          </span>
          <div className="print-head-org">
            <strong>{college || "الجدول الأكاديمي"}</strong>
            <span>{college ? "نظام الجدول الأكاديمي" : "SCHEDULE"}</span>
          </div>
        </div>
      </header>
      {footer ? (
        <footer className="print-foot">
          <span>{college || title}</span>
          <span className="print-page-number" aria-hidden="true" />
          <bdi dir="ltr">{stamp}</bdi>
        </footer>
      ) : null}
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
/**
 * ── رقم داخل نصّ عربي ───────────────────────────────────────────────────────
 *
 * A number written in Latin digits inside an Arabic paragraph is a left-to-
 * right run inside a right-to-left one, and the characters around it — a
 * slash, a plus, a per-cent sign — are *neutral*. Neutrals take the direction
 * of whatever surrounds them, so the browser moves them to the wrong end and
 * the reader gets:
 *
 *     ‎58 / 100  →  «100/»          ‎+11  →  «11+»          ‎49%  →  «49٪» ← ok
 *                                                          ‎%49  →  wrong
 *
 * None of that is a font problem or a spacing problem, and no amount of CSS
 * on the parent fixes it: the fix is to isolate the numeric run so its own
 * direction is decided independently of the sentence it sits in. That is
 * exactly what `<bdi>` is for, and it is one element.
 */
export function Num({ value, prefix, suffix, className }: {
  value: React.ReactNode;
  /** Goes to the LEFT of the number, where a sign belongs: + − ≈ */
  prefix?: string;
  /** Goes to the RIGHT: /100 · % · ٪ */
  suffix?: string;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={`num${className ? ` ${className}` : ""}`}>
      {prefix}{value}{suffix}
    </bdi>
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
  "الرمز":<Tag/>,"رمز القسم":<Tag/>,"الرقم الأكاديمي":<Hash/>,"السعة":<Hash/>
};
export function MetaPill({label,value,dir}:{label:React.ReactNode;value:React.ReactNode;dir?:"ltr"|"rtl"}){
  const key=typeof label==="string"?label:"";
  const glyph=PILL_GLYPHS[key];
  return <span className="meta-pill" dir={dir} title={key||undefined}>{glyph?<span className="meta-pill-glyph" aria-hidden="true">{glyph}</span>:<small>{label}</small>}<b>{value}</b></span>;
}
export function SkeletonDeck({count=4}:{count?:number}){return <div className="record-deck skeleton-deck">{Array.from({length:count},(_,i)=><article className="record-card skeleton-card" key={i}><span/><div><i/><i/></div></article>)}</div>}
