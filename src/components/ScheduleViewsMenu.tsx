import React, { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Pencil, Star, Trash2, X } from "lucide-react";
import type { ScheduleSavedView } from "../utils/scheduleViews";

/**
 * ── The saved-view control ─────────────────────────────────────────────────
 *
 * It is not in the toolbar until it has something to say. A reader who has
 * never saved a view sees the screen exactly as it was — no empty dropdown, no
 * placeholder, no invitation. The moment they save their first one, a quiet
 * label appears beside the view switch and stays out of the way.
 *
 * The dot after the name is the whole of its state reporting: it means the
 * board no longer matches what was saved. No banner, no modal, no toast — the
 * difference is a fact about the screen, not an event that happened to it.
 */

export function SavedViewName({ view, dirty }: { view: ScheduleSavedView | null; dirty: boolean }) {
  if (!view) return <span className="views-none">العروض</span>;
  return (
    <>
      <span className="views-name">{view.name}</span>
      {dirty ? <i className="views-dirty" aria-hidden="true" title="الوضع الحالي يختلف عن النسخة المحفوظة" /> : null}
    </>
  );
}

export default function ScheduleViewsMenu({
  views, activeId, dirty, onOpenView, onUpdateActive, onRestoreActive,
  onSaveAs, onRename, onDelete, onToggleFavorite,
}: {
  views: ScheduleSavedView[];
  activeId: string | null;
  dirty: boolean;
  onOpenView: (view: ScheduleSavedView) => void;
  onUpdateActive: () => void;
  onRestoreActive: () => void;
  onSaveAs: () => void;
  onRename: (view: ScheduleSavedView) => void;
  onDelete: (view: ScheduleSavedView) => void;
  onToggleFavorite: (view: ScheduleSavedView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const active = views.find(view => view.id === activeId) || null;

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current || box.current.contains(event.target as Node)) return;
      setOpen(false); setManaging(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setManaging(false); }
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  if (!views.length) return null;
  const favorites = views.filter(view => view.favorite);
  const rest = views.filter(view => !view.favorite && view.id !== activeId);

  return (
    <div className="schedule-views" ref={box}>
      <button
        type="button"
        className={`views-trigger ${open ? "is-open" : ""} ${dirty ? "is-dirty" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(value => !value)}
        title={active ? `العرض الحالي: ${active.name}` : "العروض المحفوظة"}
      >
        <Bookmark aria-hidden="true" />
        <SavedViewName view={active} dirty={dirty} />
      </button>
      {open ? (
        <div className="views-menu" role="menu">
          {active ? (
            <div className="views-current">
              <Check aria-hidden="true" />
              <strong>{active.name}</strong>
              {dirty ? <em>مُعدَّل</em> : null}
            </div>
          ) : null}
          {favorites.length ? (
            <div className="views-section">
              <span className="views-section-name">المفضلة</span>
              {favorites.map(view => (
                <button key={view.id} type="button" role="menuitem" className="views-item"
                  onClick={() => { setOpen(false); onOpenView(view); }}>
                  <Star aria-hidden="true" />
                  <span>{view.name}</span>
                  {view.id === activeId ? <Check aria-hidden="true" className="views-tick" /> : null}
                </button>
              ))}
            </div>
          ) : null}
          {rest.length ? (
            <div className="views-section">
              {favorites.length ? <span className="views-section-name">العروض</span> : null}
              {rest.map(view => (
                <button key={view.id} type="button" role="menuitem" className="views-item"
                  onClick={() => { setOpen(false); onOpenView(view); }}>
                  <Bookmark aria-hidden="true" />
                  <span>{view.name}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="views-section views-actions">
            {active && dirty ? (
              <>
                <button type="button" role="menuitem" className="views-item" onClick={() => { setOpen(false); onUpdateActive(); }}>
                  تحديث العرض الحالي
                </button>
                <button type="button" role="menuitem" className="views-item" onClick={() => { setOpen(false); onRestoreActive(); }}>
                  العودة إلى المحفوظ
                </button>
              </>
            ) : null}
            <button type="button" role="menuitem" className="views-item" onClick={() => { setOpen(false); onSaveAs(); }}>
              حفظ كعرض جديد
            </button>
            <button type="button" role="menuitem" className="views-item" onClick={() => setManaging(value => !value)}>
              {managing ? "إنهاء الإدارة" : "إدارة العروض"}
            </button>
          </div>
          {managing ? (
            <div className="views-manage">
              {views.map(view => (
                <div className="views-manage-row" key={view.id}>
                  <span>{view.name}</span>
                  <button type="button" onClick={() => onToggleFavorite(view)}
                    title={view.favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة (٣ كحد أقصى)"}
                    aria-pressed={Boolean(view.favorite)}>
                    <Star aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRename(view)} title="إعادة تسمية">
                    <Pencil aria-hidden="true" />
                  </button>
                  <button type="button" data-guide-ignore="حذف عرض شخصي محفوظ ولا يغيّر بيانات الجدول" onClick={() => onDelete(view)} title="حذف">
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A single field and two buttons — naming a view is not a form. */
export function SaveViewDialog({ initial, title, onCancel, onSave }: {
  initial: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return (
    <div className="views-dialog-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <form
        className="views-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={event => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }}
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onCancel} aria-label="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <label>
          <span>اسم العرض</span>
          <input ref={input} value={name} onChange={event => setName(event.target.value)} placeholder="مثال: مراجعة القاعات" maxLength={40} />
        </label>
        <footer>
          <button type="button" className="views-dialog-cancel" onClick={onCancel}>إلغاء</button>
          <button type="submit" className="views-dialog-save" disabled={!name.trim()}>حفظ</button>
        </footer>
      </form>
    </div>
  );
}
