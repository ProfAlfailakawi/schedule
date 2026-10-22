import React, { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Save, Search, Trash2 } from "lucide-react";
import { Notice, PageTitle, PrimaryButton, SecondaryButton, Surface, GhostButton } from "./ui";
import { evaluateTeachingLoad, emptyTeachingLoadConfig, hoursLabel, MAX_ACADEMIC_RANKS, MAX_EXTRA_HOURS, MAX_LOAD_HOURS, teachingLoadProblem } from "../utils/teachingLoad";
import { compareArabic } from "../utils/arabicText";
import type { AcademicRank, TeachingLoadAssignment, TeachingLoadConfig } from "../types";

type Member = { id: number; name: string; retired: boolean; hours: number };
type TermOption = { id: number; name: string };

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn", { maximumFractionDigits: 2 });
/** حقلٌ رقميّ اختياري: فارغٌ = غيرُ محدّد. */
const parseHours = (text: string): number | undefined => (text.trim() === "" ? undefined : Number(text));
const newRankId = () => `rank-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * ── إدارة النصاب التدريسي ─ للمسؤول المخوّل ──────────────────────────────────
 *
 * ميزةٌ اختيارية: مفتاحٌ واحدٌ يفعّلها، وما دام مطفأً لا يظهر للمخطّط شيء. الدرجاتُ بنصابها الأدنى والأعلى،
 * ثم لكل عضوٍ درجتُه ونصابٌ خاصٌّ إن لزم وساعاتٌ إضافيةٌ مسموحة. والعبءُ المعروض محسوبٌ من ساعات مقررات
 * الفصل المختار نفسها التي يقرؤها المخطّط، فما يراه هنا هو ما سيُنبَّه به هناك.
 */
export default function TeachingLoadSettings({ header, demoReadOnly = false }: { header?: React.ReactNode; demoReadOnly?: boolean }) {
  const [config, setConfig] = useState<TeachingLoadConfig>(emptyTeachingLoadConfig());
  const [saved, setSaved] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const load = async (requestedTerm = 0) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/teaching-load${requestedTerm ? `?termId=${requestedTerm}` : ""}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر تحميل إعدادات النصاب");
      setConfig(data.config);
      setSaved(JSON.stringify(data.config));
      setMembers((data.instructors || []).map((row: any) => ({ id: row.id, name: row.name, retired: Boolean(row.retired), hours: Number(row.hours || 0) })));
      setTerms(data.terms || []);
      setTermId(Number(data.term?.id || 0));
    } catch (error: any) {
      setNotice({ text: error.message || "تعذّر تحميل إعدادات النصاب", type: "error" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = JSON.stringify(config) !== saved;
  const problem = teachingLoadProblem(config);
  const patchRank = (id: string, patch: Partial<AcademicRank>) => setConfig(current => ({ ...current, ranks: current.ranks.map(rank => (rank.id === id ? { ...rank, ...patch } : rank)) }));
  const addRank = () => setConfig(current => (current.ranks.length >= MAX_ACADEMIC_RANKS ? current : { ...current, ranks: [...current.ranks, { id: newRankId(), name: "", minHours: 9, maxHours: 12 }] }));
  const removeRank = (id: string) => setConfig(current => ({
    ...current,
    ranks: current.ranks.filter(rank => rank.id !== id),
    // عضوٌ كانت درجتُه المحذوفة مصدرَ نصابه يعود غيرَ مضبوط، ويبقى ما خُصّص له بنفسه.
    assignments: Object.fromEntries((Object.entries(current.assignments) as Array<[string, TeachingLoadAssignment]>).map(([key, value]) => [key, value.rankId === id ? { ...value, rankId: undefined } : value])),
  }));
  const patchAssignment = (id: number, patch: Partial<TeachingLoadAssignment>) => setConfig(current => {
    const next: TeachingLoadAssignment = { ...(current.assignments[String(id)] || {}), ...patch };
    const clean = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== "")) as TeachingLoadAssignment;
    const assignments = { ...current.assignments };
    if (Object.keys(clean).length) assignments[String(id)] = clean; else delete assignments[String(id)];
    return { ...current, assignments };
  });

  const save = async () => {
    if (demoReadOnly || busy || problem) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/teaching-load", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر حفظ إعدادات النصاب");
      setConfig(data.config);
      setSaved(JSON.stringify(data.config));
      setNotice({ text: "حُفظت إعدادات النصاب.", type: "success" });
    } catch (error: any) {
      setNotice({ text: error.message || "تعذّر حفظ إعدادات النصاب", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => members
    .filter(member => !query.trim() || member.name.includes(query.trim()))
    .filter(member => !onlyAssigned || config.assignments[String(member.id)])
    .filter(member => !member.retired || config.assignments[String(member.id)] || member.hours > 0)
    .sort((a, b) => compareArabic(a.name, b.name)), [members, query, onlyAssigned, config.assignments]);
  const overCount = useMemo(() => members.filter(member => evaluateTeachingLoad(config, member.id, member.hours).state === "over").length, [members, config]);

  return (
    <div className="content-stack admin-page teaching-load">
      {header}
      <PageTitle eyebrow="إدارة النظام · للمدير الرئيسي فقط" subtitle="ميزةٌ اختيارية: درجاتٌ علمية بنصابها بالساعات، وتنبيهٌ هادئ للمخطّط إن تجاوز عضوٌ نصابه. لا تمنع تعديل الجدول.">النصاب التدريسي</PageTitle>
      {notice ? <Notice type={notice.type}>{notice.text}</Notice> : null}
      {demoReadOnly ? <Notice type="info">الإعدادات للعرض في الديمو، والحفظ معطّل.</Notice> : null}

      <Surface className="tl-switch">
        <span className="tl-mark"><GraduationCap aria-hidden="true" /></span>
        <div className="tl-switch-copy">
          <strong>إدارة النصاب التدريسي</strong>
          <small>{config.enabled ? "مفعّلة: يظهر للمخطّط تنبيهٌ صغير عند تجاوز عضوٍ نصابه." : "معطّلة: لا يُحسب شيءٌ ولا يظهر أي تنبيه."}</small>
        </div>
        <label className="tl-toggle" data-guide-ignore="مفتاحُ تفعيل ميزة النصاب في شاشة إعدادها؛ لا يغيّر جدولاً">
          <input type="checkbox" role="switch" checked={config.enabled} disabled={demoReadOnly || loading} onChange={event => setConfig(current => ({ ...current, enabled: event.target.checked }))} aria-label="تفعيل إدارة النصاب التدريسي" />
          <i aria-hidden="true" />
        </label>
      </Surface>

      <Surface className="tl-card">
        <header className="tl-head">
          <div><strong>الدرجات العلمية</strong><small>الحدّان الأدنى والأعلى للنصاب بالساعات في الفصل</small></div>
          <SecondaryButton type="button" data-guide-ignore="إضافة صفّ درجةٍ علمية في إعدادات النصاب؛ لا يحفظ حتى الضغط على «حفظ»" disabled={demoReadOnly || config.ranks.length >= MAX_ACADEMIC_RANKS} onClick={addRank}><Plus aria-hidden="true" /> إضافة درجة</SecondaryButton>
        </header>
        {config.ranks.length ? (
          <ul className="tl-ranks">
            <li className="tl-ranks-head" aria-hidden="true"><span>الدرجة</span><span>الأدنى</span><span>الأعلى</span><span /></li>
            {config.ranks.map(rank => (
              <li key={rank.id}>
                <input type="text" value={rank.name} placeholder="اسم الدرجة" aria-label="اسم الدرجة العلمية" maxLength={60} disabled={demoReadOnly} onChange={event => patchRank(rank.id, { name: event.target.value })} />
                <input type="number" inputMode="decimal" min={0} max={MAX_LOAD_HOURS} step="0.5" dir="ltr" value={rank.minHours} aria-label={`الحد الأدنى لنصاب ${rank.name || "الدرجة"}`} disabled={demoReadOnly} onChange={event => patchRank(rank.id, { minHours: Number(event.target.value) })} />
                <input type="number" inputMode="decimal" min={0} max={MAX_LOAD_HOURS} step="0.5" dir="ltr" value={rank.maxHours} aria-label={`الحد الأعلى لنصاب ${rank.name || "الدرجة"}`} disabled={demoReadOnly} onChange={event => patchRank(rank.id, { maxHours: Number(event.target.value) })} />
                <GhostButton type="button" className="tl-del" data-guide-ignore="حذف صفّ درجةٍ علمية من إعدادات النصاب؛ يبقى حتى الحفظ" aria-label={`حذف الدرجة ${rank.name || ""}`} title="حذف الدرجة" disabled={demoReadOnly} onClick={() => removeRank(rank.id)}><Trash2 aria-hidden="true" /></GhostButton>
              </li>
            ))}
          </ul>
        ) : <p className="tl-empty">لا درجاتٍ بعد. أضف درجةً وحدّد نصابها، ثم اختر درجةَ كل عضو.</p>}
      </Surface>

      <Surface className="tl-card">
        <header className="tl-head">
          <div>
            <strong>أعضاء هيئة التدريس</strong>
            <small>العبءُ من ساعات المقررات المسجّلة للعضو في الفصل{overCount ? ` · ${overCount.toLocaleString("ar-KW-u-nu-latn")} متجاوزاً` : ""}</small>
          </div>
          <label className="tl-term">
            <span>الفصل</span>
            <select value={termId || ""} onChange={event => void load(Number(event.target.value))} aria-label="الفصل المحسوب عليه العبء">
              {terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
        </header>
        <div className="tl-filter">
          <label className="tl-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم العضو" aria-label="بحث عن عضو هيئة تدريس" /></label>
          <label className="tl-check"><input type="checkbox" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)} /> المضبوط نصابهم فقط</label>
        </div>
        {loading ? <p role="status" className="tl-empty">يجري التحميل…</p> : rows.length ? (
          <div className="tl-members" role="table" aria-label="نصاب أعضاء هيئة التدريس">
            <div className="tl-row tl-row-head" role="row" aria-hidden="true"><span>العضو</span><span>الدرجة</span><span>أدنى خاص</span><span>أعلى خاص</span><span>إضافية</span><span>العبء</span></div>
            {rows.map(member => {
              const entry = config.assignments[String(member.id)] || {};
              const status = evaluateTeachingLoad(config, member.id, member.hours);
              return (
                <div className="tl-row" role="row" key={member.id} data-state={status.state}>
                  <span className="tl-name" role="cell">{member.name}{member.retired ? <small>غير نشط</small> : null}</span>
                  <select role="cell" value={entry.rankId || ""} aria-label={`درجة ${member.name}`} disabled={demoReadOnly} onChange={event => patchAssignment(member.id, { rankId: event.target.value || undefined })}>
                    <option value="">بلا درجة</option>
                    {config.ranks.map(rank => <option key={rank.id} value={rank.id}>{rank.name || "(بلا اسم)"}</option>)}
                  </select>
                  <input role="cell" type="number" inputMode="decimal" min={0} max={MAX_LOAD_HOURS} step="0.5" dir="ltr" placeholder={status.rank ? String(status.rank.minHours) : "—"} value={entry.minHours ?? ""} aria-label={`الحد الأدنى الخاص بـ${member.name}`} disabled={demoReadOnly} onChange={event => patchAssignment(member.id, { minHours: parseHours(event.target.value) })} />
                  <input role="cell" type="number" inputMode="decimal" min={0} max={MAX_LOAD_HOURS} step="0.5" dir="ltr" placeholder={status.rank ? String(status.rank.maxHours) : "—"} value={entry.maxHours ?? ""} aria-label={`الحد الأعلى الخاص بـ${member.name}`} disabled={demoReadOnly} onChange={event => patchAssignment(member.id, { maxHours: parseHours(event.target.value) })} />
                  <input role="cell" type="number" inputMode="decimal" min={0} max={MAX_EXTRA_HOURS} step="0.5" dir="ltr" placeholder="0" value={entry.extraHours ?? ""} aria-label={`الساعات الإضافية المسموحة لـ${member.name}`} disabled={demoReadOnly} onChange={event => patchAssignment(member.id, { extraHours: parseHours(event.target.value) })} />
                  <span className="tl-load" role="cell">
                    <b>{num(member.hours)}</b>
                    {status.allowed !== null ? <small>من {num(status.allowed)}{status.extra ? <> (<bdi dir="ltr">{num(status.max ?? 0)}+{num(status.extra)}</bdi>)</> : null}</small> : <small>—</small>}
                    <em className={`tl-chip tl-chip-${status.state}`}>
                      {status.state === "over" ? `تجاوز ${hoursLabel(status.excess)}` : status.state === "within" ? "ضمن النصاب" : status.state === "under" ? "دون الأدنى" : "غير مضبوط"}
                    </em>
                  </span>
                </div>
              );
            })}
          </div>
        ) : <p className="tl-empty">لا أعضاء مطابقين.</p>}
      </Surface>

      <div className="tl-save">
        {problem ? <span className="tl-problem" role="alert">{problem}</span> : <span className="tl-hint">{dirty ? "تغييراتٌ لم تُحفظ." : "كل شيءٍ محفوظ."}</span>}
        <PrimaryButton type="button" data-guide-ignore="حفظ إعدادات النصاب التدريسي (الدرجات والإسناد)؛ لا يغيّر جدولاً ولا يمنع تعديلاً" disabled={busy || demoReadOnly || !dirty || Boolean(problem)} onClick={() => void save()}><Save aria-hidden="true" /> {busy ? "جارٍ الحفظ…" : "حفظ"}</PrimaryButton>
      </div>
    </div>
  );
}
