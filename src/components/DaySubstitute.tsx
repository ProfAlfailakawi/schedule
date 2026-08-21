import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClockOff, CalendarClock, Check, MessageCircle, ShieldCheck, Trash2, UserCheck, X } from "lucide-react";
import { GhostButton, SecondaryButton } from "./ui";
import { whatsappNumber } from "../utils/reachInstructor";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

/**
 * ── بديل اليوم ───────────────────────────────────────────────────────────────
 *
 * The weekly schedule answers "when does this class meet?"; this sheet answers
 * the morning phone call: "who can cover it TODAY?". It records dated facts —
 * cancelled this date, covered this date by a named colleague — as exceptions
 * OVER the appointment, never touching the appointment itself. The calendar
 * subscriptions read those facts, so every subscribed phone follows along
 * without anyone sending anything.
 *
 * The WhatsApp button opens a pre-written conversation on the coordinator's
 * own device; the human presses send. The system transmits nothing — the same
 * honesty contract as the staff-card delivery in SchedulePublish.
 */

type LectureRow = {
  id: number;
  AdCourseName: string;
  SCode: string;
  AdInstructorId: number;
  fstarttime: string;
  fendtime: string;
  AdRoomCode: string;
  AdRoomHall: string;
};

type Candidate = {
  id: number;
  name: string;
  mobile: string;
  score: number;
  taughtTerms: number;
  reasons: string[];
};

type WeekException = {
  id: string;
  date: string;
  kind: "cancel" | "cover";
  coverInstructorName?: string;
  note?: string;
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

/** Today by Kuwait's clock, not the browser's UTC midnight. */
function kuwaitToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function DaySubstitute({ row, instructorName, onClose, onRecorded }: {
  row: LectureRow;
  instructorName?: string;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const [date, setDate] = useState(kuwaitToday());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [exceptions, setExceptions] = useState<WeekException[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async (chosen: string) => {
    setLoading(true);
    setError(null);
    try {
      const body = await readJson(`/api/schedules/${row.id}/substitutes?date=${encodeURIComponent(chosen)}`);
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
      setExceptions(Array.isArray(body.exceptions) ? body.exceptions : []);
    } catch (issue) {
      setCandidates([]);
      setError(issue instanceof Error ? issue.message : "تعذر قراءة المرشحين");
      try {
        const list = await readJson(`/api/schedules/${row.id}/exceptions`);
        setExceptions(Array.isArray(list.exceptions) ? list.exceptions : []);
      } catch { /* the primary error already speaks */ }
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  useEffect(() => { void load(date); }, [load, date]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const record = useCallback(async (kind: "cancel" | "cover", coverInstructorId?: number) => {
    setSaving(kind + (coverInstructorId || ""));
    setError(null);
    try {
      await readJson(`/api/schedules/${row.id}/exceptions`, {
        method: "POST",
        body: JSON.stringify({ date, kind, coverInstructorId }),
      });
      setDone(kind === "cancel" ? "سُجّل الإلغاء لهذا اليوم — التقويمات المشتركة ستتبع تلقائياً." : "سُجّلت التغطية — ستظهر في تقويم البديل تلقائياً.");
      await load(date);
      onRecorded?.();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "تعذر التسجيل");
    } finally {
      setSaving(null);
    }
  }, [row.id, date, load, onRecorded]);

  const removeException = useCallback(async (id: string) => {
    setSaving(`delete-${id}`);
    setError(null);
    try {
      await readJson(`/api/schedules/${row.id}/exceptions/${encodeURIComponent(id)}`, { method: "DELETE" });
      setDone(null);
      await load(date);
      onRecorded?.();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "تعذر الحذف");
    } finally {
      setSaving(null);
    }
  }, [row.id, date, load, onRecorded]);

  /* END - START, like every other range the program prints. */
  const timeRange = useMemo(
    () => formatScheduleTimeRange(row.fstarttime, row.fendtime),
    [row.fstarttime, row.fendtime],
  );
  const room = [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join(" / ");
  const dayException = exceptions.find(item => item.date === date) || null;

  const waHref = (candidate: Candidate) => {
    const number = whatsappNumber(candidate.mobile);
    if (!number) return null;
    const text =
      `السلام عليكم د. ${candidate.name}،` +
      ` هل تتكرم بتغطية محاضرة «${row.AdCourseName}» شعبة ${row.SCode}` +
      ` بتاريخ ${date} الساعة ${timeRange}${room ? ` في القاعة ${room}` : ""}؟` +
      ` وجزاك الله خيراً.`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  };

  return (
    <>
      <div className="day-substitute-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <section className="day-substitute no-print" role="dialog" aria-modal="true" aria-label="بديل اليوم">
        <header className="day-substitute-head">
          <span className="day-substitute-mark" aria-hidden="true"><CalendarClock /></span>
          <div>
            <small>ليوم واحد فقط — الموعد الأسبوعي لا يُمس</small>
            <h2>بديل اليوم</h2>
            <p>{row.AdCourseName} · شعبة {row.SCode} · <bdi dir="ltr">{timeRange}</bdi>{room ? ` · ${room}` : ""}{instructorName ? ` · ${instructorName}` : ""}</p>
          </div>
          <button type="button" className="drawer-close" data-guide-ignore="إغلاق نافذة بديل اليوم فقط" onClick={onClose} aria-label="إغلاق بديل اليوم" title="إغلاق"><X /></button>
        </header>

        <label className="day-substitute-date">
          <span>التاريخ المقصود</span>
          <input
            type="date"
            value={date}
            onChange={event => { setDone(null); setDate(event.target.value); }}
            aria-label="تاريخ اليوم المستثنى"
          />
        </label>

        {error ? <p className="day-substitute-error" role="alert">{error}</p> : null}
        {done ? <p className="day-substitute-done" role="status"><Check aria-hidden="true" /> {done}</p> : null}

        {dayException ? (
          <article className="day-substitute-existing">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>{dayException.kind === "cancel" ? "المحاضرة ملغاة في هذا اليوم" : `يغطيها ${dayException.coverInstructorName || "زميل"} في هذا اليوم`}</strong>
              <small>مسجّلة كاستثناء يوم واحد، والتقويمات المشتركة تتبعها.</small>
            </div>
            <GhostButton
              type="button"
              data-guide-ignore="حذف استثناء اليوم الواحد المسجل — يعيد الموعد كما كان"
              disabled={saving === `delete-${dayException.id}`}
              onClick={() => void removeException(dayException.id)}
            >
              <Trash2 aria-hidden="true" /> تراجع
            </GhostButton>
          </article>
        ) : (
          <>
            <div className="day-substitute-cancel">
              <SecondaryButton
                type="button"
                data-guide-ignore="يسجل إلغاء ليوم واحد فوق الموعد — لا يغيّر الموعد الأسبوعي نفسه"
                disabled={Boolean(saving) || loading}
                onClick={() => void record("cancel")}
                title="تُسجَّل كإلغاء ليوم واحد ويختفي هذا اليوم من التقويمات المشتركة"
              >
                <AlarmClockOff aria-hidden="true" /> إلغاء محاضرة هذا اليوم
              </SecondaryButton>
              <small>بلا بديل — يُسجَّل الإلغاء وتتبعه التقويمات.</small>
            </div>

            <h3 className="day-substitute-subtitle">من يستطيع تغطيتها؟</h3>
            {loading ? (
              <p className="day-substitute-quiet">يقرأ جداول الأساتذة…</p>
            ) : candidates.length ? (
              <ul className="day-substitute-list">
                {candidates.map(candidate => {
                  const href = waHref(candidate);
                  return (
                    <li key={candidate.id}>
                      <div className="day-substitute-person">
                        <strong>{candidate.name}</strong>
                        <small>{candidate.reasons.join(" · ")}</small>
                      </div>
                      <div className="day-substitute-acts">
                        {href ? (
                          <a className="day-substitute-wa" href={href} target="_blank" rel="noopener noreferrer" title="يفتح محادثة واتساب برسالة جاهزة — أنت من يضغط إرسال">
                            <MessageCircle aria-hidden="true" /> واتساب
                          </a>
                        ) : (
                          <span className="day-substitute-nowa" title="لا يوجد رقم جوال صالح في سجل الأستاذ">بلا رقم</span>
                        )}
                        <GhostButton
                          type="button"
                          data-guide-ignore="يسجل تغطية يوم واحد باسم البديل — لا يغيّر الموعد الأسبوعي"
                          disabled={Boolean(saving)}
                          onClick={() => void record("cover", candidate.id)}
                          title="سجّل أن هذا الأستاذ يغطي المحاضرة في هذا اليوم"
                        >
                          <UserCheck aria-hidden="true" /> سجّل التغطية
                        </GhostButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : !error ? (
              <p className="day-substitute-quiet">لا يوجد متفرغ مناسب في هذا الوقت — جرّب الإلغاء أو تاريخاً آخر.</p>
            ) : null}
          </>
        )}

        {exceptions.filter(item => item.date !== date).length ? (
          <details className="day-substitute-log">
            <summary>استثناءات مسجلة أخرى لهذا الموعد ({exceptions.filter(item => item.date !== date).length})</summary>
            <ul>
              {exceptions.filter(item => item.date !== date).map(item => (
                <li key={item.id}>
                  <bdi dir="ltr">{item.date}</bdi>
                  <span>{item.kind === "cancel" ? "إلغاء" : `تغطية: ${item.coverInstructorName || "زميل"}`}</span>
                  <button
                    type="button"
                    data-guide-ignore="حذف استثناء يوم واحد مسجل — يعيد ذلك اليوم كما كان"
                    disabled={saving === `delete-${item.id}`}
                    onClick={() => void removeException(item.id)}
                    aria-label={`حذف استثناء ${item.date}`}
                    title="حذف الاستثناء"
                  ><Trash2 aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <footer className="day-substitute-foot">
          <ShieldCheck aria-hidden="true" />
          <span>الاستثناء يوم واحد فوق الجدول: لا يغيّر الموعد ولا تعارضاته ولا تاريخه، وحذفه يعيد كل شيء كما كان.</span>
        </footer>
      </section>
    </>
  );
}
