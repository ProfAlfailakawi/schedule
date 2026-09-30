import React, { useEffect, useMemo, useState } from "react";
import { Check, Save } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import { suggestSectionCount, type SimilarTermHistory } from "../utils/sectionCountSuggestion";

/**
 * ── تخطيط الشعب: إحصاءُ التسجيل ← عددُ الشعب المقترح ────────────────────────
 *
 * جدولٌ واحد: لكل مقرر عددُ الطلبة (يُكتب)، وسعتُه، والاقتراح وسببه، وزرّ
 * «اعتماد» اختياري يحفظ العدد المقبول. الحساب في sectionCountSuggestion.ts.
 */
interface Payload {
  termName: string;
  similarTerms: string[];
  courses: Array<{ id: number; code: string; name: string; capacity: number }>;
  counts: Record<string, number>;
  accepted: Record<string, number>;
  updatedAt: string;
  history: Record<string, SimilarTermHistory[]>;
}

export default function SectionPlanning({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    setData(null); setError(null);
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(async response => { const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error || "تعذّر تحميل الإحصاء"); return body as Payload; })
      .then(body => {
        if (cancelled) return;
        setData(body);
        setCounts(Object.fromEntries(Object.entries(body.counts || {}).map(([k, v]) => [k, String(v)])));
        setAccepted(body.accepted || {});
        setSavedAt(body.updatedAt || "");
      })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId]);

  const rows = useMemo(() => (data?.courses || []).map(course => {
    const key = String(course.id);
    const registered = Number(counts[key] || 0);
    return { course, key, registered, entered: counts[key] !== undefined && counts[key] !== "",
      suggestion: suggestSectionCount(registered, course.capacity, data?.history?.[key] || []) };
  }), [data, counts]);
  const visible = rows.filter(row => !query.trim() || `${row.course.code} ${row.course.name}`.includes(query.trim()));
  const totalSuggested = rows.filter(row => row.entered).reduce((sum, row) => sum + (row.suggestion.suggested || 0), 0);

  const save = async (nextAccepted = accepted) => {
    setSaving(true); setError(null);
    try {
      const numeric = Object.fromEntries(Object.entries(counts).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
      const response = await fetch("/api/registration-stats", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, counts: numeric, accepted: nextAccepted }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "تعذّر الحفظ");
      setSavedAt(body.updatedAt || new Date().toISOString());
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };
  const accept = (key: string, value: number | null) => {
    const next = { ...accepted };
    if (value == null || next[key] === value) delete next[key]; else next[key] = value;
    setAccepted(next);
    void save(next);
  };

  if (error && !data) return <p className="section-plan-note" role="alert">{error}</p>;
  if (!data) return <p className="section-plan-note">يُحمَّل…</p>;
  return (
    <div className="section-plan">
      <p className="section-plan-note">
        اكتب عدد الطلبة المسجّلين لكل مقرر في «{data.termName}». يُقترح عدد الشعب من سعة المقرر
        {data.similarTerms.length ? <> ومن الفصول المماثلة ({data.similarTerms.join("، ")})</> : null}.
      </p>
      <div className="section-plan-bar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن مقرر" aria-label="ابحث عن مقرر" />
        <span>المجموع المقترح: <b>{totalSuggested}</b></span>
        <PrimaryButton data-guide-feature-id="schedule.tool.data" type="button" onClick={() => save()} disabled={saving}><Save aria-hidden="true" /> {saving ? "يُحفظ…" : "حفظ الإحصاء"}</PrimaryButton>
      </div>
      {error ? <p className="section-plan-note" role="alert">{error}</p> : null}
      <div className="section-plan-table" role="table" aria-label="إحصاء التسجيل واقتراح الشعب">
        <div className="section-plan-row head" role="row">
          <span role="columnheader">المقرر</span><span role="columnheader">الطلبة</span><span role="columnheader">السعة</span>
          <span role="columnheader">المقترح</span><span role="columnheader">السبب</span><span role="columnheader">اعتماد</span>
        </div>
        {visible.map(({ course, key, entered, suggestion }) => (
          <div className="section-plan-row" role="row" key={key}>
            <span role="cell"><b dir="ltr">{course.code}</b> {course.name}</span>
            <span role="cell">
              <input type="number" min={0} max={100000} inputMode="numeric" value={counts[key] ?? ""} aria-label={`عدد طلبة ${course.name}`}
                onChange={e => setCounts(current => ({ ...current, [key]: e.target.value }))} />
            </span>
            <span role="cell">{course.capacity || "—"}</span>
            <span role="cell" className="section-plan-count">{entered && suggestion.suggested != null ? suggestion.suggested : "—"}</span>
            <span role="cell" className="section-plan-reason">{entered ? suggestion.reason : "—"}</span>
            <span role="cell">
              {entered && suggestion.suggested != null ? (
                <SecondaryButton data-guide-feature-id="schedule.tool.data" type="button" aria-pressed={accepted[key] === suggestion.suggested} onClick={() => accept(key, suggestion.suggested)}>
                  {accepted[key] === suggestion.suggested ? <><Check aria-hidden="true" /> معتمد</> : accepted[key] != null ? `معتمد ${accepted[key]} · اعتمد ${suggestion.suggested}` : "اعتمد"}
                </SecondaryButton>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {savedAt ? <p className="section-plan-note">آخر حفظ: {new Date(savedAt).toLocaleString("ar-KW-u-nu-latn")}</p> : null}
    </div>
  );
}
