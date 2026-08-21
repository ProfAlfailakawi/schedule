import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Check, Search, Users, X } from "lucide-react";
import { PrimaryButton } from "./ui";
import { scheduleClockForDisplay } from "../utils/scheduleTime";

/**
 * ── متى نلتقي؟ ──────────────────────────────────────────────────────────────
 *
 * The most repeated question in any department: when can the committee meet?
 * The term's own schedule already knows when every chosen person teaches, so
 * the answer is computed, not negotiated. The server reveals nothing beyond
 * busy/free for people the coordinator picked by name — no courses, no rooms.
 */

type PersonOption = { AdInstructorId: number; AdInstructorName: string };

type MeetingDay = {
  dayKey: string;
  label: string;
  free: { start: string; end: string; minutes: number }[];
  nearMiss: { start: string; end: string; busy: string[] }[];
};

type MeetingAnswer = {
  duration: number;
  participants: string[];
  days: MeetingDay[];
  best: { day: string; label: string; start: string; end: string } | null;
};

async function readJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "تعذر إكمال العملية");
  return body;
}

const range = (start: string, end: string) =>
  `${scheduleClockForDisplay(start)} – ${scheduleClockForDisplay(end)}`;

export default function MeetingSlots({ instructors, termId, onClose }: {
  instructors: PersonOption[];
  termId: number;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [query, setQuery] = useState("");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<MeetingAnswer | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = useMemo(() => {
    const needle = query.trim();
    const list = needle
      ? instructors.filter(person => person.AdInstructorName.includes(needle))
      : instructors;
    return list.slice(0, 80);
  }, [instructors, query]);

  const toggle = useCallback((id: number) => {
    setAnswer(null);
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const ask = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await readJson("/api/schedules/meeting-slots", {
        method: "POST",
        body: JSON.stringify({ termId, durationMinutes: duration, instructorIds: [...picked] }),
      });
      setAnswer(body as MeetingAnswer);
    } catch (issue) {
      setAnswer(null);
      setError(issue instanceof Error ? issue.message : "تعذر الحساب");
    } finally {
      setLoading(false);
    }
  }, [termId, duration, picked]);

  return (
    <>
      <div className="meeting-slots-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <section className="meeting-slots no-print" role="dialog" aria-modal="true" aria-label="متى نلتقي؟">
        <header className="meeting-slots-head">
          <span className="meeting-slots-mark" aria-hidden="true"><Users /></span>
          <div>
            <small>من جداول هذا الفصل نفسها</small>
            <h2>متى نلتقي؟</h2>
            <p>اختر المشاركين، والجدول يجيب: أي نافذة أسبوعية يتفرغ فيها الجميع.</p>
          </div>
          <button type="button" className="drawer-close" data-guide-ignore="إغلاق نافذة منسق الاجتماعات فقط" onClick={onClose} aria-label="إغلاق منسق الاجتماعات" title="إغلاق"><X /></button>
        </header>

        <div className="meeting-slots-controls">
          <label className="meeting-slots-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="ابحث باسم الأستاذ"
              aria-label="بحث في الأساتذة"
            />
          </label>
          <label className="meeting-slots-duration">
            <span>مدة الاجتماع</span>
            <select value={duration} onChange={event => { setAnswer(null); setDuration(Number(event.target.value)); }}>
              <option value={30}>30 دقيقة</option>
              <option value={45}>45 دقيقة</option>
              <option value={60}>ساعة</option>
              <option value={90}>ساعة ونصف</option>
              <option value={120}>ساعتان</option>
            </select>
          </label>
        </div>

        <ul className="meeting-slots-people" aria-label="المشاركون">
          {options.map(person => (
            <li key={person.AdInstructorId}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.has(person.AdInstructorId)}
                  onChange={() => toggle(person.AdInstructorId)}
                />
                <span>{person.AdInstructorName}</span>
              </label>
            </li>
          ))}
          {!options.length ? <li className="meeting-slots-empty">لا نتائج لهذا الاسم</li> : null}
        </ul>

        <div className="meeting-slots-ask">
          <span className="meeting-slots-count">{picked.size ? `${picked.size} مشاركاً` : "لم تختر أحداً بعد"}</span>
          <PrimaryButton type="button" data-guide-ignore="قراءة فقط: يحسب النوافذ المشتركة ولا يغيّر الجدول" disabled={picked.size < 2 || loading} onClick={() => void ask()}>
            <CalendarCheck2 aria-hidden="true" /> {loading ? "يحسب…" : "اعرض النوافذ المتاحة"}
          </PrimaryButton>
        </div>

        {error ? <p className="meeting-slots-error" role="alert">{error}</p> : null}

        {answer ? (
          <div className="meeting-slots-answer" aria-live="polite">
            {answer.best ? (
              <article className="meeting-slots-best">
                <Check aria-hidden="true" />
                <div>
                  <small>أفضل نافذة يتفرغ فيها الجميع</small>
                  <strong>{answer.best.label} · <bdi dir="ltr">{range(answer.best.start, answer.best.end)}</bdi></strong>
                </div>
              </article>
            ) : (
              <article className="meeting-slots-best meeting-slots-none">
                <div>
                  <strong>لا توجد نافذة يتفرغ فيها الجميع بهذه المدة</strong>
                  <small>جرّب مدة أقصر، أو انظر «الحل الوسط» أدناه.</small>
                </div>
              </article>
            )}
            <div className="meeting-slots-days">
              {answer.days.map(day => (
                <section key={day.dayKey}>
                  <h3>{day.label}</h3>
                  {day.free.length ? (
                    <ul>
                      {day.free.map(slot => (
                        <li key={`${day.dayKey}-${slot.start}`}>
                          <bdi dir="ltr">{range(slot.start, slot.end)}</bdi>
                          <small>الجميع متفرغون</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="meeting-slots-quiet">لا نافذة كاملة</p>
                  )}
                  {day.nearMiss.length ? (
                    <ul className="meeting-slots-miss">
                      {day.nearMiss.map(slot => (
                        <li key={`${day.dayKey}-miss-${slot.start}`}>
                          <bdi dir="ltr">{range(slot.start, slot.end)}</bdi>
                          <small>حل وسط — مشغول فيها: {slot.busy.join("، ")}</small>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
