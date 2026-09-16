import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleDot, Plus, Search, UserRound, X } from "lucide-react";
import { byArabic } from "../utils/sorting";
import { validateCivilId } from "../utils/civilId";
import { numericText } from "../utils/digits";
import { instructorCleanName } from "../utils/instructorIdentity";

/**
 * Choosing who teaches this, out of thousands.
 *
 * A university-wide dropdown of every name is the wrong shape for a question
 * that is almost always about one department. The list therefore opens on the
 * people who already teach in this department this term — usually a handful,
 * ordered by how much of it they carry — and only reaches the rest of the
 * university when something is actually typed. The search itself forgives the
 * things Arabic names differ by: the definite article, hamza seats, taa
 * marbuta, and the honorifics that may or may not be written.
 *
 * A name that is not there yet can be added without leaving the form, because
 * "a new colleague joined and I cannot schedule them" is not an acceptable
 * dead end in the middle of building a timetable.
 */

interface Instructor {
  AdInstructorId: number;
  AdInstructorName: string;
  AdInstructorCivil?: string;
  AdInstructorMobile?: string;
}

interface Props {
  value: number;
  onChange: (id: number) => void;
  /** Everyone the account may see. */
  instructors: Instructor[];
  /** Ids already teaching in the open department this term, most-loaded first. */
  departmentIds: number[];
  /** Delegates explicitly selected to teach in the open term. */
  visitingIds?: Iterable<number>;
  /** شاشات القراءة والتقارير تختار أستاذاً ولا تُنشئ واحداً: تُخفي الزر بدل
      أن تقود المستخدم إلى نموذج سيرفضه الخادم. الافتراضي هو السماح، فشاشات
      بناء الجدول لا تتغير. */
  canCreate?: boolean;
  departmentOnly?: boolean;
  /** الاسم كما طُبع في المصدر، حين تُفتح القائمة على خانة لم تُربط بعد.
      المراجع أمامه تسعة أسماء عربية كاملة مقروءة أصلاً؛ إعادةُ كتابتها حرفاً
      بحرف عملٌ اخترعناه له. يُملأ نموذج الإضافة به، فلا يبقى عليه إلا الرقم
      المدني — وهو وحده ما لا تحمله الورقة. */
  suggestedName?: string;
  onCreated?: (instructor: Instructor) => void;
  onSelected?: (instructor: Instructor) => void;
  collegeId?: number;
  sectionId?: number;
  termId?: number;
  disabled?: boolean;
}

/** قانون هوية الاسم المشترك نفسه الذي تحكم به مطابقة الاستيراد: همزات الألف،
    ى=ي، ة=ه، ؤ=و، ئ=ي، الهمزة الساقطة، الألقاب — البحث هنا يجب أن يجد كل من
    تجده المطابقة، وإلا وقف المستخدم أمام قائمة «لا نتيجة» لشخص موجود. */
const withoutTitles = instructorCleanName;
/** والمسافات نفسها لا تحجب: «عبد العزيز» يجد «عبدالعزيز». */
const spaceless = (value: string) => value.replace(/ /g, "");

export default function InstructorPicker({ value, onChange, instructors, departmentIds, visitingIds, canCreate = true, departmentOnly = false, suggestedName = "", onCreated, onSelected, collegeId = 0, sectionId = 0, termId = 0, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCivil, setNewCivil] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [departmentRoster, setDepartmentRoster] = useState<Instructor[]>([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);

  // Every instructor picker owns one reliable department-roster read. Parent
  // screens may have no rows yet (a new term) or may be showing a report-wide
  // catalogue; neither is a valid reason for the department's names to vanish.
  useEffect(() => {
    if (!sectionId) { setDepartmentRoster([]); setDepartmentLoading(false); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({ sectionId: String(sectionId) });
    if (collegeId) params.set("collegeId", String(collegeId));
    if (termId) params.set("termId", String(termId));
    setDepartmentLoading(true);
    fetch(`/api/instructors?${params}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(list => setDepartmentRoster(Array.isArray(list) ? list : []))
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setDepartmentLoading(false); });
    return () => controller.abort();
  }, [collegeId, sectionId, termId]);

  const knownInstructors = useMemo(() =>
    [...new Map([...instructors, ...departmentRoster].map(person => [Number(person.AdInstructorId), person])).values()],
    [instructors, departmentRoster]);
  const byId = useMemo(() => new Map(knownInstructors.map(x => [x.AdInstructorId, x])), [knownInstructors]);
  const selected = byId.get(value) || null;

  /**
   * The full register arrives only when it is needed.
   *
   * The list opens on the department, which is what almost every choice is
   * about. The moment someone types past it, the rest of the university is
   * fetched once and kept — so the common case costs nothing and the rare case
   * costs one request.
   */
  const [wider, setWider] = useState<Instructor[]>([]);
  useEffect(() => {
    const needle = query.trim();
    if (departmentOnly || needle.length < 2) { setWider([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: needle, limit: "40" });
      if (collegeId) params.set("collegeId", String(collegeId));
      if (termId) params.set("termId", String(termId));
      fetch(`/api/instructors?${params}`, { signal: controller.signal })
        .then(response => (response.ok ? response.json() : []))
        .then(list => { if (Array.isArray(list)) setWider(list); })
        .catch(() => undefined);
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, collegeId, termId, departmentOnly]);

  const effectiveDepartmentIds = useMemo(() => {
    const rosterIds = departmentRoster.map(person => Number(person.AdInstructorId)).filter(Boolean);
    return [...new Set([...departmentIds.map(Number).filter(Boolean), ...rosterIds])];
  }, [departmentIds, departmentRoster]);
  const departmentRank = useMemo(() => new Map(effectiveDepartmentIds.map((id, index) => [id, index])), [effectiveDepartmentIds]);
  const visitingSet = useMemo(() => new Set(Array.from(visitingIds || [], Number).filter(Boolean)), [visitingIds]);

  // A retired or sabbatical teacher keeps their existing appointments but is not
  // offered for new ones, so their name stops appearing where it should not (Note 2).
  const isHidden = (person: any) =>
    person?.AdInstructorStatus === "retired" || person?.AdInstructorStatus === "sabbatical";
  const results = useMemo(() => {
    const needle = withoutTitles(query);
    if (!needle) {
      // Nothing typed: show the department and ONLY the department. Wider
      // university search starts after the user types, exactly as the hint says.
      const deptList = effectiveDepartmentIds.map(id => byId.get(id)).filter(p => p && !isHidden(p)) as Instructor[];
      if (deptList.length) return deptList;
      // Older screens that do not know a section still pass an already-scoped
      // instructor list; keep that compatibility without widening a known section.
      return sectionId ? [] : knownInstructors.filter(p => !isHidden(p));
    }
    const pool = [...new Map([...knownInstructors, ...wider].map(person => [person.AdInstructorId, person])).values()]
      .filter(person => !departmentOnly || departmentRank.has(Number(person.AdInstructorId)) || visitingSet.has(Number(person.AdInstructorId)));
    const scored = pool
      .map(person => {
        if (isHidden(person)) return null;
        const name = withoutTitles(person.AdInstructorName);
        const civil = String(person.AdInstructorCivil || "");
        let score = -1;
        if (name.startsWith(needle)) score = 0;
        else if (name.includes(needle)) score = 1;
        else if (civil.includes(needle)) score = 2;
        else if (spaceless(name).includes(spaceless(needle))) score = 3;
        else if (needle.split(" ").every(part => name.includes(part))) score = 4;
        if (score < 0) return null;
        // Someone already teaching here outranks an equal match elsewhere.
        const inDepartment = departmentRank.has(person.AdInstructorId) ? 0 : 1;
        return { person, score, inDepartment, rank: departmentRank.get(person.AdInstructorId) ?? 9999 };
      })
      .filter(Boolean) as Array<{ person: Instructor; score: number; inDepartment: number; rank: number }>;
    return scored
      .sort((a, b) =>
        a.inDepartment - b.inDepartment ||
        a.score - b.score ||
        a.rank - b.rank ||
        byArabic(a.person.AdInstructorName, b.person.AdInstructorName))
      .slice(0, 40)
      .map(x => x.person);
  }, [query, knownInstructors, wider, effectiveDepartmentIds, byId, departmentRank, sectionId, departmentOnly, visitingSet]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) { setOpen(false); setAdding(false); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setAdding(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    window.setTimeout(() => searchRef.current?.focus(), 20);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  const create = async () => {
    setError(null);
    const name = newName.trim();
    const civil = newCivil.trim();
    if (!name || !civil) { setError("الاسم والرقم المدني مطلوبان."); return; }
    const check = validateCivilId(civil);
    if (!check.isValid) { setError(check.message || "الرقم المدني غير صحيح."); return; }
    /* برقم مدني مسجّل مسبقاً: داخل نطاق قسمٍ يضمّه الخادم إلى القسم ويعيده
       كاختيار، فلا يُسدّ الطريق هنا. وبلا نطاق يبقى الفحص المحلي أسرع من طلبٍ
       سيُرفض بنفس الرسالة. */
    const already = [...knownInstructors, ...wider].find(x => String(x.AdInstructorCivil || "").trim() === civil);
    if (already && !(collegeId && sectionId)) {
      setError(`هذا الرقم المدني مسجّل بالفعل باسم «${already.AdInstructorName}» — ابحث عنه بالرقم المدني واختره.`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* النطاق يرافق الإضافة كي تُسجَّل العضوية في دليل القسم لا سجلاً
           جامعياً عائماً: هذا ما يجعل «موجود عندنا» حقيقة تعرفها المطابقة. */
        body: JSON.stringify({ AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: newMobile.trim(), collegeId, sectionId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إضافة الأستاذ");
      onCreated?.(data);
      onChange(Number(data.AdInstructorId));
      setAdding(false);
      setOpen(false);
      setNewName(""); setNewCivil(""); setNewMobile(""); setQuery("");
    } catch (e: any) {
      setError(e.message || "تعذر إضافة الأستاذ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`instructor-picker visual-minimal ${open ? "open" : ""}`} ref={boxRef}>
      <button
        type="button"
        className="instructor-trigger"
        data-guide-ignore="فتح قائمة أستاذ المقرر فقط؛ اختيار الأستاذ نفسه موثق داخل خيارات القائمة"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <UserRound aria-hidden="true" />
        <span className="instructor-identity">
          <b>{selected ? <>{selected.AdInstructorName}{visitingSet.has(selected.AdInstructorId) ? <em className="instructor-visiting-label">منتدب</em> : null}</> : "اختر أستاذ المقرر"}</b>
          {selected?.AdInstructorCivil ? <small dir="ltr">{selected.AdInstructorCivil}</small> : null}
        </span>
      </button>

      {open ? (
        <div className="instructor-pop" role="listbox">
          <label className="instructor-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="اسم أو رقم مدني"
              aria-label="ابحث عن أستاذ"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="مسح"><X /></button>
            ) : null}
          </label>

          {!query ? <p className="instructor-scope">{departmentOnly ? "أساتذة هذا القسم فقط" : "أساتذة هذا القسم — اكتب للبحث خارج القسم"}</p> : null}

          <div className="instructor-results" hidden={adding}>
            {results.length ? results.map(person => (
              <button
                type="button"
                key={person.AdInstructorId}
                data-guide-feature-id="schedule.action.change-instructor"
                className={person.AdInstructorId === value ? "chosen" : ""}
                role="option"
                aria-selected={person.AdInstructorId === value}
                onClick={() => { onSelected?.(person); onChange(person.AdInstructorId); setOpen(false); }}
              >
                {/* The name gets the width; the civil ID sits beneath it. Side
                    by side, twelve monospace digits left a department's names
                    truncated to a single letter. */}
                <span className="instructor-identity">
                  <b>{person.AdInstructorName}{visitingSet.has(person.AdInstructorId) ? <em className="instructor-visiting-label">منتدب</em> : null}</b>
                  <small dir="ltr">{person.AdInstructorCivil || "—"}</small>
                </span>
                {departmentRank.has(person.AdInstructorId) ? <i className="instructor-department-mark" title={visitingSet.has(person.AdInstructorId) ? "منتدب يدرّس هذا الفصل" : "يدرّس في هذا القسم"} aria-label={visitingSet.has(person.AdInstructorId) ? "منتدب يدرّس هذا الفصل" : "يدرّس في هذا القسم"}><CircleDot aria-hidden="true" /></i> : null}
                {person.AdInstructorId === value ? <Check aria-hidden="true" /> : null}
              </button>
            )) : (
              <p className="instructor-empty">{!query && departmentLoading ? "جارٍ تحميل أساتذة القسم…" : (!query ? "لا يوجد أساتذة مرتبطون بهذا القسم بعد." : `لا نتيجة لـ «${query}»`)}</p>
            )}
          </div>

          {!canCreate ? null : adding ? (
            <div className="instructor-new">
              <strong>أستاذ جديد</strong>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="الاسم الكامل" aria-label="اسم الأستاذ" />
              <input value={newCivil} onChange={e => setNewCivil(numericText(e.target.value).slice(0, 12))} inputMode="numeric" placeholder="الرقم المدني" aria-label="الرقم المدني" dir="ltr" />
              <input value={newMobile} onChange={e => setNewMobile(numericText(e.target.value).slice(0, 8))} inputMode="numeric" placeholder="الهاتف (اختياري)" aria-label="الهاتف" dir="ltr" />
              {error ? <em>{error}</em> : null}
              <div>
                <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>{busy ? "يحفظ…" : "أضف واختر"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setError(null); }}>إلغاء</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="instructor-add"
              data-guide-ignore="يفتح نموذج تسجيل أستاذ داخل نفس القائمة؛ اختيار الأستاذ نفسه موثق في schedule.action.change-instructor، والتسجيل خطوة فرعية لا رحلة مستقلة"
              onClick={() => { setAdding(true); setNewName(query.trim() || suggestedName.trim()); }}
            >
              <Plus aria-hidden="true" />
              إضافة أستاذ جديد{(query.trim() || suggestedName.trim()) ? ` باسم «${query.trim() || suggestedName.trim()}»` : ""}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
