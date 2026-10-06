import { byArabic } from "../utils/sorting";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Check, Search, Users, X } from "lucide-react";
import { PrimaryButton } from "./ui";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { AR, countOf } from "../utils/arabicCount";
import { meetingParticipants, type MeetingAnswer, type MeetingWindow } from "../utils/meetingSlots";

/**
 * ── متى نلتقي؟ ──────────────────────────────────────────────────────────────
 *
 * The most repeated question in any department: when can the committee meet?
 * The term's own schedule already knows when every chosen person teaches, so
 * the answer is computed, not negotiated. The server reveals nothing beyond
 * busy/free for people the coordinator picked by name — no courses, no rooms.
 */

type PersonOption = { AdInstructorId: number; AdInstructorName: string };

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

/* Start – end, from the shared formatter. Drawn as its own LTR inline-block:
   Safari flipped a bare isolate sitting inside a bold Arabic line
   («20:00 – 18:00»), while the same text in a box of its own read right. */
const range = (start: string, end: string) => formatScheduleTimeRange(start, end);
const Time = ({ start, end }: { start: string; end: string }) => <span className="meeting-time" dir="ltr">{range(start, end)}</span>;
const freeShare = (slot: MeetingWindow) => Math.round((slot.free / Math.max(1, slot.total)) * 100);

/* Who conflicts, named — but a list of forty names is not a sentence. */
const whoConflicts = (busy: string[]) =>
  busy.length <= 4 ? busy.join("، ") : `${busy.slice(0, 4).join("، ")} و${countOf(busy.length - 4, AR.participant)} غيرهم`;
const windowLine = (slot: MeetingWindow) => `${slot.free} من ${slot.total} متفرغ`;

export default function MeetingSlots({ instructors, scopeNarrowed = false, termId, sectionId = 0, onClose }: {
  instructors: PersonOption[];
  /** اختار المستخدم كلية أو قسماً: يُقال له إن الانشغال يُقرأ من الكليات كلها. */
  scopeNarrowed?: boolean;
  termId: number;
  /** القسم المعروض: يُجمع معه أساتذته من كليات القسم الأخرى. */
  sectionId?: number;
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

  /* بلا «هيئة تدريسية» ولا منتدبين. الخادم هو الحَكَم: يقرأ منتدبي الفصل كله
     عبر الكليات، فلا يتغيّر الجواب باختيار القسم أو عدمه. القاعدة نفسها
     (meetingParticipants) تُطبَّق هنا على ما أعاده. */
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  /* اجتماع القسم: أساتذة القسم من كل كلياته يأتون من الخادم إن حُدّد القسم. */
  const [familyPeople, setFamilyPeople] = useState<PersonOption[] | null>(null);
  useEffect(() => {
    if (!termId) return;
    let live = true;
    readJson(`/api/schedules/meeting-participants?termId=${termId}${sectionId ? `&sectionId=${sectionId}` : ""}`)
      .then(body => {
        if (!live) return;
        setExcludedIds((body?.excludedInstructorIds || []).map(Number));
        setFamilyPeople(Array.isArray(body?.participants) ? body.participants : null);
      })
      .catch(() => { /* الخادم يُسقطهم عند الحساب على أي حال */ });
    return () => { live = false; };
  }, [termId, sectionId]);
  const faculty = useMemo(() => {
    const people = familyPeople ? [...new Map([...instructors, ...familyPeople].map(p => [Number(p.AdInstructorId), p])).values()] : instructors;
    return meetingParticipants([...people].sort((a, b) => byArabic(a.AdInstructorName, b.AdInstructorName)), excludedIds);
  }, [instructors, familyPeople, excludedIds]);
  const options = useMemo(() => {
    const needle = query.trim();
    return needle ? faculty.filter(person => person.AdInstructorName.includes(needle)) : faculty;
  }, [faculty, query]);

  const toggle = useCallback((id: number) => {
    setAnswer(null);
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* «تحديد الكل» acts on what is ON SCREEN, which is what a search box makes
     the reader expect: filter to a division, take all of it, clear the filter,
     filter again, take that too. Selecting a hidden name would be a surprise. */
  const shownIds = useMemo(() => options.map(person => person.AdInstructorId), [options]);
  const allShownPicked = shownIds.length > 0 && shownIds.every(id => picked.has(id));
  const toggleAllShown = useCallback(() => {
    setAnswer(null);
    setPicked(current => {
      const next = new Set(current);
      if (shownIds.every(id => next.has(id))) shownIds.forEach(id => next.delete(id));
      else shownIds.forEach(id => next.add(id));
      return next;
    });
  }, [shownIds]);
  const clearAll = useCallback(() => { setAnswer(null); setPicked(new Set()); }, []);

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
            <p>اختر المشاركين، والجدول يجيب: أي نافذة أسبوعية يتفرغ فيها الجميع، أو أكثرهم.</p>
            {scopeNarrowed ? <p className="meeting-slots-scope-note">الانشغال يُقرأ من جدول كل أستاذ في الكليات والأقسام كلها هذا الفصل، لا من النطاق المعروض وحده.</p> : null}
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

        <div className="meeting-slots-bulk">
          <button
            type="button"
            className="meeting-slots-bulk-btn"
            data-guide-ignore="اختيار جماعي داخل نافذة الاجتماع فقط ولا يغيّر الجدول"
            onClick={toggleAllShown}
            disabled={!shownIds.length}
          >
            {allShownPicked
              ? (query.trim() ? "أزل تحديد الظاهرين" : "أزل تحديد الكل")
              : (query.trim() ? `حدّد الظاهرين (${options.length})` : `تحديد الكل (${options.length})`)}
          </button>
          {picked.size ? (
            <button
              type="button"
              className="meeting-slots-bulk-btn is-quiet"
              data-guide-ignore="تفريغ اختيار المشاركين داخل النافذة فقط"
              onClick={clearAll}
            >
              تفريغ الاختيار
            </button>
          ) : null}
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
          <span className="meeting-slots-count">{picked.size ? countOf(picked.size, AR.participant) : "لم تختر أحداً بعد"}</span>
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
                  <small>أفضل وقت مقترح · الجميع متفرغون</small>
                  <strong>{answer.best.label} <Time start={answer.best.start} end={answer.best.end} /></strong>
                </div>
              </article>
            ) : answer.ranked[0] ? (
              <article className="meeting-slots-best meeting-slots-partial">
                <Check aria-hidden="true" />
                <div>
                  <small>لا نافذة يتفرغ فيها الجميع بهذه المدة — هذا أقرب وقت</small>
                  <strong>{answer.ranked[0].label} <Time start={answer.ranked[0].start} end={answer.ranked[0].end} /></strong>
                  <small>{windowLine(answer.ranked[0])} · يتعارض: {whoConflicts(answer.ranked[0].busy)}</small>
                </div>
              </article>
            ) : null}
            {answer.ranked.length > 1 ? (
              <>
                <div className="meeting-slots-alternatives-title"><small>مرتبة بعدد المتفرغين</small><strong>أفضل النوافذ</strong></div>
                <ol className="meeting-slots-ranked">
                  {answer.ranked.slice(1).map((slot, index) => (
                    <li key={`${slot.day}-${slot.start}`}>
                      <span className="meeting-rank" aria-hidden="true">{index + 1}</span>
                      <div className="meeting-rank-body">
                        <div className="meeting-rank-head">
                          <strong>{slot.label}</strong>
                          <Time start={slot.start} end={slot.end} />
                          <span className="meeting-free">{slot.busy.length ? windowLine(slot) : "الجميع متفرغون"}</span>
                        </div>
                        <span className="meeting-meter" aria-hidden="true"><i style={{ inlineSize: `${freeShare(slot)}%` }} /></span>
                        {slot.busy.length ? (
                          <div className="meeting-busy">
                            <small>يتعارض</small>
                            {slot.busy.slice(0, 4).map(name => <span key={name}>{name}</span>)}
                            {slot.busy.length > 4 ? <span>+{slot.busy.length - 4}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            <div className="meeting-slots-alternatives-title"><small>يوماً بيوم</small><strong>أفضل وقت في كل يوم</strong></div>
            <div className="meeting-slots-days">
              {answer.days.map(day => (
                <section key={day.dayKey}>
                  <h3>{day.label}</h3>
                  {day.free.length ? (
                    <ul>
                      {day.free.map(slot => (
                        <li key={`${day.dayKey}-${slot.start}`}>
                          <Time start={slot.start} end={slot.end} />
                          <small>الجميع متفرغون</small>
                        </li>
                      ))}
                    </ul>
                  ) : day.bestPartial ? (
                    <ul className="meeting-slots-miss">
                      <li>
                        <Time start={day.bestPartial.start} end={day.bestPartial.end} />
                        <small>{windowLine(day.bestPartial)} — يتعارض: {whoConflicts(day.bestPartial.busy)}</small>
                      </li>
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
