import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ChevronLeft, Clock3, X, Zap } from "lucide-react";
import type { CenterNotification, NotificationTone } from "../utils/notificationCenter";
import { NOTIFY_FOCUS_KEY, writeNotifyFocus } from "../utils/notifyFocus";
import { AR, countOf, oblique } from "../utils/arabicCount";

/**
 * ── مركز الإشعارات ──────────────────────────────────────────────────────────
 *
 * جرسٌ واحد لكل صاحب صفة: الرقمُ عليه هو ما بقي عليه هو، لا كلُّ ما جرى. وما
 * ينتظر غيرَه وما تمّ يُقرآن تحته، في مجموعتين هادئتين.
 */

interface Props {
  userKey: string;
  onNavigate: (view: string) => void;
}

const GROUPS: Array<{ id: string; label: string; tones: NotificationTone[] }> = [
  { id: "mine", label: "مطلوبٌ منك", tones: ["alert", "action"] },
  { id: "others", label: "بانتظار غيرك", tones: ["waiting"] },
  { id: "done", label: "تمّ", tones: ["done"] },
];

const ICON: Record<NotificationTone, React.ReactNode> = {
  alert: <AlertTriangle aria-hidden="true" />,
  action: <Zap aria-hidden="true" />,
  waiting: <Clock3 aria-hidden="true" />,
  done: <CheckCircle2 aria-hidden="true" />,
};

const when = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return minutes === 1 ? "قبل دقيقة" : minutes === 2 ? "قبل دقيقتين" : `قبل ${countOf(minutes, oblique(AR.minute))}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : hours === 2 ? "قبل ساعتين" : `قبل ${countOf(hours, oblique(AR.hour))}`;
  return date.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" });
};

/* الإشعارُ يعرف قسمه: يُترك النطاقُ للشاشة التي يُفتح عليها، فتفتح عليه مباشرة
   (src/utils/notifyFocus.ts — الكاتب والقارئ في ملفٍّ واحد). */
export { NOTIFY_FOCUS_KEY };
const focusOn = (item: CenterNotification) => writeNotifyFocus(item);

export default function NotificationCenter({ userKey, onNavigate }: Props) {
  const [items, setItems] = useState<CenterNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`notify-seen:${userKey}`) || "[]")); } catch { return new Set(); }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  /* ── ما وصل الآن ─────────────────────────────────────────────────────────
     أوّلُ قراءةٍ تُعرّف «ما كان»، وكلُّ قراءةٍ بعدها تسأل: ما المطلوبُ منّي
     الذي لم يكن قبل لحظة؟ فيطفو سطرُه تحت الجرس ولو كانت الشاشةُ في عملٍ آخر. */
  const known = useRef<Set<string> | null>(null);
  const [toast, setToast] = useState<CenterNotification | null>(null);
  const [toastMore, setToastMore] = useState(0);

  const load = useCallback(() => {
    fetch("/api/notifications", { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data || !Array.isArray(data.items)) return;
        const next: CenterNotification[] = data.items;
        const urgent = next.filter(item => item.tone === "action" || item.tone === "alert");
        if (known.current) {
          const arrived = urgent.filter(item => !known.current!.has(item.id));
          if (arrived.length) {
            setToast(arrived[0]);
            setToastMore(arrived.length - 1);
            try {
              if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                new Notification("SCHEDULE", { body: arrived[0].title, tag: arrived[0].id });
              }
            } catch { /* المتصفّح يمنع — يكفي الجرس */ }
          }
        }
        known.current = new Set(next.map(item => item.id));
        setItems(next);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener("focus", load);
    /* النبضةُ الحيّة: الخادم يقول «تغيّر شيء» فيُسأل فوراً — طلبُ أستاذ،
       إرجاعٌ، اعتماد. والقراءةُ الدورية تبقى احتياطاً إن انقطع الخيط. */
    let source: EventSource | null = null;
    let pending = 0;
    const soon = () => { window.clearTimeout(pending); pending = window.setTimeout(load, 700); };
    try {
      if (typeof EventSource !== "undefined") {
        source = new EventSource("/api/schedules/events");
        source.addEventListener("notify", soon);
        source.addEventListener("schedules", soon);
      }
    } catch { source = null; }
    return () => {
      window.clearInterval(timer); window.clearTimeout(pending);
      window.removeEventListener("focus", load);
      source?.close();
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* عنوانُ النافذة يحمل العدد: من فتح النظامَ في لسانٍ جانبيٍّ يراه دون أن يعود إليه. */
  const mineCount = items.filter(item => item.tone === "alert" || item.tone === "action").length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const unread = items.filter(item => (item.tone === "alert" || item.tone === "action") && !seen.has(item.id)).length;
    document.title = unread ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [items, seen]);

  useEffect(() => {
    if (!open) return;
    load();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); bellRef.current?.focus(); } };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !bellRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open, load]);

  /* المقروءُ ما ضُغط عليه وحده، أو ما قُرئ كلُّه بالزرّ الصامت أعلى اللوحة:
     فتحُ الجرس وحده لا يُسقط علامةَ «جديد» عن شيءٍ لم يُنظر فيه. */
  const markRead = useCallback((ids: string[]) => {
    setSeen(previous => {
      const next = new Set([...previous, ...ids]);
      if (next.size === previous.size) return previous;
      try { localStorage.setItem(`notify-seen:${userKey}`, JSON.stringify([...next].slice(-300))); } catch { /* تفضيلٌ لا أكثر */ }
      return next;
    });
  }, [userKey]);

  const mine = mineCount;
  const fresh = items.filter(item => !seen.has(item.id)).length;
  /* رقمُ الجرس هو المطلوبُ منك الذي لم تقرأه بعد: يقلّ مع كل إشعارٍ تضغطه ويختفي بـ«قراءة الكل»،
     ويعود إن جدّ أمرٌ جديد. */
  const unreadMine = items.filter(item => (item.tone === "alert" || item.tone === "action") && !seen.has(item.id)).length;
  const groups = useMemo(() => GROUPS
    .map(group => ({ ...group, rows: items.filter(item => group.tones.includes(item.tone)) }))
    .filter(group => group.rows.length), [items]);

  /* على سطح الصفحة لا داخلها: لوحةٌ تُرسم داخل الغلاف تختفي خلف بطاقاتٍ
     لها طبقاتُها الخاصة — كما وقع خلف مرشّحات «الجدول الدراسي». */
  if (typeof document === "undefined") return null;
  return createPortal((
    <>
      <button
        ref={bellRef}
        type="button"
        className="notify-bell no-print"
        data-fresh={fresh > 0 ? "true" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadMine ? `الإشعارات — ${unreadMine} غير مقروء` : "الإشعارات"}
        title="الإشعارات"
        data-guide-ignore="مركز الإشعارات يعرض ما بقي ولا يعدّل البيانات"
        onClick={() => {
          setOpen(value => !value);
          setToast(null);
          try { if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); } catch { /* اختياري */ }
        }}
      >
        <Bell aria-hidden="true" />
        {unreadMine ? <b className="notify-count">{unreadMine > 99 ? "99+" : unreadMine}</b> : fresh ? <i className="notify-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div ref={panelRef} className="notify-panel no-print" role="dialog" aria-label="مركز الإشعارات">
          <header>
            <div>
              <strong>الإشعارات</strong>
              <small>{mine ? (mine === 1 ? "أمرٌ واحد ينتظرك" : mine === 2 ? "أمران ينتظرانك" : `${mine} أمور تنتظرك`) : "لا شيء مطلوبٌ منك الآن"}</small>
            </div>
            <span className="notify-actions">
              {fresh ? (
                <button type="button" className="notify-read-all" aria-label="تعليم الكل كمقروء" title="تعليم الكل كمقروء" data-guide-ignore="تعليم الإشعارات كمقروءة تفضيلٌ محلي لا يعدّل البيانات" onClick={() => markRead(items.map(item => item.id))}><CheckCheck aria-hidden="true" /></button>
              ) : null}
              <button type="button" aria-label="إغلاق" data-guide-ignore="إغلاق لوحة الإشعارات لا يعدّل البيانات" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
            </span>
          </header>
          {groups.length ? groups.map(group => (
            <section key={group.id} aria-label={group.label}>
              <h3>{group.label} <span>{group.rows.length}</span></h3>
              <ul>
                {group.rows.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="notify-item"
                      data-guide-ignore="فتح الشاشة التي يخصّها الإشعار — تنقّلٌ لا يعدّل البيانات"
                      data-tone={item.tone}
                      data-read={seen.has(item.id) ? "true" : undefined}
                      onClick={() => { markRead([item.id]); if (item.view) { focusOn(item); setOpen(false); onNavigate(item.view); } }}
                    >
                      <span className="notify-icon">{ICON[item.tone]}</span>
                      <span className="notify-text">
                        <strong>{item.title}{!seen.has(item.id) ? <em>جديد</em> : null}</strong>
                        {item.detail ? <small>{item.detail}</small> : null}
                        {item.at ? <time dateTime={item.at}>{when(item.at)}</time> : null}
                      </span>
                      {item.view ? <ChevronLeft className="notify-go" aria-hidden="true" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )) : (
            <p className="notify-empty"><CheckCircle2 aria-hidden="true" /> كل شيءٍ على ما يرام — لا إشعارات.</p>
          )}
        </div>
      ) : null}
      {toast && !open ? (
        <div className="notify-toast no-print" role="status" aria-live="polite" data-tone={toast.tone}>
          <button
            type="button"
            className="notify-toast-body"
            data-guide-ignore="فتح الشاشة التي يخصّها الإشعار الجديد — تنقّلٌ لا يعدّل البيانات"
            onClick={() => { const view = toast.view; markRead([toast.id]); focusOn(toast); setToast(null); if (view) onNavigate(view); else setOpen(true); }}
          >
            <span className="notify-icon">{ICON[toast.tone]}</span>
            <span className="notify-text">
              <small className="notify-toast-kicker">وصل الآن{toastMore ? ` · و${toastMore} غيره` : ""}</small>
              <strong>{toast.title}</strong>
              {toast.detail ? <small>{toast.detail}</small> : null}
            </span>
          </button>
          <button type="button" className="notify-toast-close" aria-label="إخفاء" data-guide-ignore="إخفاء الإشعار العائم" onClick={() => setToast(null)}><X aria-hidden="true" /></button>
        </div>
      ) : null}
    </>
  ), document.body);
}
