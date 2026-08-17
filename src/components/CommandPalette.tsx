import React, { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

/**
 * ── The command palette ────────────────────────────────────────────────────
 *
 * An entry point, not a feature. Every command here calls a function the screen
 * already owns — the same `changeView`, the same `openCreate`, the same undo —
 * so there is exactly one implementation of anything the program can do, and
 * this window is a faster way to reach it rather than a second way to define it.
 *
 * It has no button. A reader who does not know it exists sees a schedule screen
 * that is exactly as it was; a reader who does presses one key and is already
 * somewhere else. That asymmetry is the whole point: power without furniture.
 */

export type ScheduleCommand = {
  id: string;
  label: string;
  /** Extra words a reader might type — Arabic and English both. */
  keywords?: string[];
  shortcut?: string;
  group?: string;
  icon?: React.ReactNode;
  /** Present but not currently possible: shown dimmed, never silently missing. */
  enabled?: boolean;
  /** Not applicable at all right now: absent from the list. */
  visible?: boolean;
  execute: () => void | Promise<void>;
};

/**
 * Arabic is written with and without diacritics and with three shapes of alef,
 * so a raw substring match would make the reader spell a command the way the
 * source happens to spell it. Both sides are folded before they meet.
 */
const fold = (value: string) =>
  String(value || "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();

export default function CommandPalette({ commands, onClose }: {
  commands: ScheduleCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const available = useMemo(
    () => commands.filter(command => command.visible !== false),
    [commands],
  );

  const results = useMemo(() => {
    const needle = fold(query);
    if (!needle) return available;
    const words = needle.split(/\s+/).filter(Boolean);
    return available
      .map(command => {
        const hay = fold([command.label, command.group, ...(command.keywords || [])].filter(Boolean).join(" "));
        if (!words.every(word => hay.includes(word))) return null;
        // A match at the start of the label is what the reader meant first.
        const rank = fold(command.label).startsWith(words[0]) ? 0 : 1;
        return { command, rank };
      })
      .filter(Boolean)
      .sort((a, b) => a!.rank - b!.rank)
      .map(entry => entry!.command);
  }, [available, query]);

  /* Grouped for reading, flat for the keyboard — one index over the same order. */
  const groups = useMemo(() => {
    const map = new Map<string, ScheduleCommand[]>();
    results.forEach(command => {
      const key = command.group || "أوامر";
      const bucket = map.get(key);
      if (bucket) bucket.push(command);
      else map.set(key, [command]);
    });
    return [...map.entries()];
  }, [results]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // The active row is kept in sight without dragging the page behind it.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (command: ScheduleCommand) => {
    if (command.enabled === false) return;
    onClose();
    // After the window is gone, so the screen it acts on is the one behind it.
    window.setTimeout(() => { void command.execute(); }, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(current => (results.length ? (current + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(current => (results.length ? (current - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = results[active];
      if (command) run(command);
    }
  };

  let index = -1;
  return (
    <div
      className="cmdk-backdrop no-print"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="cmdk visual-minimal"
        role="dialog"
        aria-modal="true"
        aria-label="أوامر الجدول"
        onKeyDown={onKeyDown}
      >
        <label className="cmdk-field">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="اكتب أمراً… مثل: أسبوع، تعارض، حفظ العرض"
            aria-label="ابحث في أوامر الجدول"
            aria-controls="cmdk-results"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="cmdk-results" id="cmdk-results" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <p className="cmdk-empty">لا أمر بهذا الاسم.</p>
          ) : (
            groups.map(([group, list]) => (
              <div className="cmdk-group" key={group}>
                <span className="cmdk-group-name">{group}</span>
                {list.map(command => {
                  index += 1;
                  const position = index;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={position === active}
                      data-active={position === active ? "true" : undefined}
                      className={`cmdk-row ${command.enabled === false ? "is-off" : ""}`}
                      disabled={command.enabled === false}
                      onMouseEnter={() => setActive(position)}
                      onClick={() => run(command)}
                    >
                      {command.icon ? <span className="cmdk-icon" aria-hidden="true">{command.icon}</span> : <span className="cmdk-icon" />}
                      <span className="cmdk-label">{command.label}</span>
                      {command.shortcut ? <kbd className="cmdk-shortcut">{command.shortcut}</kbd> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <footer className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span>
          <span><kbd><CornerDownLeft aria-hidden="true" /></kbd> تنفيذ</span>
          <span><kbd>Esc</kbd> إغلاق</span>
        </footer>
      </div>
    </div>
  );
}
