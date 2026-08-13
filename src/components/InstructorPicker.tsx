import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, UserRound, X } from "lucide-react";
import { byArabic } from "../utils/sorting";
import { validateCivilId } from "../utils/civilId";

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
  onCreated?: (instructor: Instructor) => void;
  disabled?: boolean;
}

/** Arabic names differ in ways that should never hide a match. */
const fold = (value: string) =>
  String(value || "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^ء-ي0-9a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Titles are written inconsistently, so they never take part in matching. */
const withoutTitles = (value: string) =>
  fold(value).replace(/^(?:ا?د|ا|م|أ|prof|dr|mr|ms)\s+/g, "").trim();

export default function InstructorPicker({ value, onChange, instructors, departmentIds, onCreated, disabled }: Props) {
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

  const byId = useMemo(() => new Map(instructors.map(x => [x.AdInstructorId, x])), [instructors]);
  const selected = byId.get(value) || null;

  /**
   * The full register arrives only when it is needed.
   *
   * The list opens on the department, which is what almost every choice is
   * about. The moment someone types past it, the rest of the university is
   * fetched once and kept — so the common case costs nothing and the rare case
   * costs one request.
   */
  const [reachedWider, setReachedWider] = useState(false);
  const [wider, setWider] = useState<Instructor[]>([]);
  useEffect(() => {
    if (!query.trim() || reachedWider) return;
    setReachedWider(true);
    fetch("/api/instructors")
      .then(response => (response.ok ? response.json() : []))
      .then(list => { if (Array.isArray(list)) setWider(list); })
      .catch(() => undefined);
  }, [query, reachedWider]);

  const departmentRank = useMemo(() => new Map(departmentIds.map((id, index) => [id, index])), [departmentIds]);

  const results = useMemo(() => {
    const needle = withoutTitles(query);
    if (!needle) {
      // Nothing typed: the department, in the order it actually teaches.
      return departmentIds.map(id => byId.get(id)).filter(Boolean) as Instructor[];
    }
    const pool = wider.length > instructors.length ? wider : instructors;
    const scored = pool
      .map(person => {
        const name = withoutTitles(person.AdInstructorName);
        const civil = String(person.AdInstructorCivil || "");
        let score = -1;
        if (name.startsWith(needle)) score = 0;
        else if (name.includes(needle)) score = 1;
        else if (civil.includes(needle)) score = 2;
        else if (needle.split(" ").every(part => name.includes(part))) score = 3;
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
  }, [query, instructors, wider, departmentIds, byId, departmentRank]);

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
    if (instructors.some(x => String(x.AdInstructorCivil || "") === civil)) {
      setError("هذا الرقم المدني مسجّل بالفعل.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ AdInstructorCivil: civil, AdInstructorName: name, AdInstructorMobile: newMobile.trim() })
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
    <div className={`instructor-picker ${open ? "open" : ""}`} ref={boxRef}>
      <button
        type="button"
        className="instructor-trigger"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <UserRound aria-hidden="true" />
        <span className="instructor-identity">
          <b>{selected ? selected.AdInstructorName : "اختر أستاذ المقرر"}</b>
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

          {!query ? <p className="instructor-scope">أساتذة هذا القسم — اكتب للبحث في الكلية كلها</p> : null}

          <div className="instructor-results" hidden={adding}>
            {results.length ? results.map(person => (
              <button
                type="button"
                key={person.AdInstructorId}
                className={person.AdInstructorId === value ? "chosen" : ""}
                role="option"
                aria-selected={person.AdInstructorId === value}
                onClick={() => { onChange(person.AdInstructorId); setOpen(false); }}
              >
                {/* The name gets the width; the civil ID sits beneath it. Side
                    by side, twelve monospace digits left a department's names
                    truncated to a single letter. */}
                <span className="instructor-identity">
                  <b>{person.AdInstructorName}</b>
                  <small dir="ltr">{person.AdInstructorCivil || "—"}</small>
                </span>
                {departmentRank.has(person.AdInstructorId) ? <i title="يدرّس في هذا القسم">•</i> : null}
                {person.AdInstructorId === value ? <Check aria-hidden="true" /> : null}
              </button>
            )) : (
              <p className="instructor-empty">لا نتيجة لـ «{query}»</p>
            )}
          </div>

          {adding ? (
            <div className="instructor-new">
              <strong>أستاذ جديد</strong>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="الاسم الكامل" aria-label="اسم الأستاذ" />
              <input value={newCivil} onChange={e => setNewCivil(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" placeholder="الرقم المدني" aria-label="الرقم المدني" dir="ltr" />
              <input value={newMobile} onChange={e => setNewMobile(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="الهاتف (اختياري)" aria-label="الهاتف" dir="ltr" />
              {error ? <em>{error}</em> : null}
              <div>
                <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>{busy ? "يحفظ…" : "أضف واختر"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setError(null); }}>إلغاء</button>
              </div>
            </div>
          ) : (
            <button type="button" className="instructor-add" onClick={() => { setAdding(true); setNewName(query.trim()); }}>
              <Plus aria-hidden="true" />
              إضافة أستاذ جديد{query.trim() ? ` باسم «${query.trim()}»` : ""}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
