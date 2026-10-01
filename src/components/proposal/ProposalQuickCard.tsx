/**
 * ── بطاقةُ الإضافة السريعة للمقترح ──────────────────────────────────────────
 *
 * الفكرةُ نفسُها في «إضافة سريعة» بالجدول الدراسي: الحركةُ على الجدول تجيب عن
 * اليوم والساعة، والبطاقةُ تسأل عن الناقص فقط — المقرر، والقاعة — وكلُّ ما
 * سواه (النموذج الكامل بأنواعه الأربعة) باقٍ خلف «تفاصيل أكثر».
 *
 * ثلاثُ حالات: شعبةٌ جديدة · إسنادُ شعبةٍ من «هيئة تدريسية» · تعديلُ موعدٍ قائم.
 * لا تكتب شيئاً في الجدول: تُضيف مادةً إلى المسودة فقط.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FilePlus2, Maximize2, Pencil, Search, UserRoundPlus, X } from "lucide-react";
import LocationPicker from "../LocationPicker";
import { TimeWheels } from "../TimeCounter";
import type { StudyProposalDayKey } from "../../types";
import { PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, daysLabel } from "../../utils/studyProposal";
import { quickOverlap, suggestSectionCode } from "./proposalDraft";
import { toEnglishDigits } from "../../utils/digits";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { timeRange } from "./proposalFormat";
import { CourseHistoryNote, scopeOfDraft } from "./ProposalOpForm";
import type { Workspace } from "./useProposalWorkspace";

export type QuickKind = "create" | "assign" | "edit";
export interface QuickSeed { kind: QuickKind; x?: number; y?: number }

const TITLE: Record<QuickKind, string> = { create: "شعبة جديدة", assign: "إسناد شعبة", edit: "تعديل موعد" };

export default function ProposalQuickCard({ ws, seed, onClose, onMore }: {
  ws: Workspace; seed: QuickSeed; onClose: () => void; onMore: () => void;
}) {
  const { draft, ctx } = ws;
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const [query, setQuery] = useState("");
  const kind = seed.kind;

  const place = () => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 12;
    const hasPoint = typeof seed.x === "number" && typeof seed.y === "number";
    let left = hasPoint ? seed.x! - rect.width / 2 : (window.innerWidth - rect.width) / 2;
    let top = hasPoint ? seed.y! + 14 : Math.max(margin, (window.innerHeight - rect.height) / 3);
    if (top + rect.height > window.innerHeight - margin) top = hasPoint ? seed.y! - rect.height - 14 : window.innerHeight - rect.height - margin;
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
    top = Math.max(margin, top);
    left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
    setBox(prev => prev && prev.left === left && prev.top === top ? prev : { left, top });
  };
  useLayoutEffect(place, [seed.x, seed.y, kind]);
  /* المحتوى يكبر بعد الفتح (سجل المقرر، قائمة الشعب): يُعاد الموضع كي لا تُقصّ الأزرار. */
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place());
    observer.observe(element);
    return () => observer.disconnect();
  }, [seed.x, seed.y, kind]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  const scope = scopeOfDraft(ws);
  const courses = useMemo(() => [...(ctx?.courses || [])].sort((a, b) => a.name.localeCompare(b.name, "ar")), [ctx]);
  const suggestion = suggestSectionCode(draft.courseId, ctx?.usedCodes || {}, ws.ops, draft.editingOpId);
  const clash = draft.start && draft.end && draft.days.length ? quickOverlap({ days: draft.days, start: draft.start, end: draft.end }, ws.currentItems.filter(i => i.rowId !== draft.rowId)) : null;
  const toggleDay = (day: StudyProposalDayKey) => ws.patchDraft(cur => ({ days: cur.days.includes(day) ? cur.days.filter(d => d !== day) : [...cur.days, day] }));
  const editingRow = draft.rowId != null ? ws.currentItems.find(i => i.rowId === draft.rowId) : undefined;

  const submit = () => { if (ws.submitDraft()) onClose(); };
  const ready = kind === "assign" ? draft.facultyId != null
    : kind === "edit" ? draft.rowId != null && draft.days.length > 0 && Boolean(draft.start && draft.end)
      : Boolean(draft.courseId && draft.scode.trim() && draft.days.length && draft.start && draft.end);

  const facultyList = useMemo(() => {
    if (kind !== "assign") return [];
    const q = toEnglishDigits(query).trim().toLowerCase();
    const used = new Set(ws.ops.filter(op => op.id !== draft.editingOpId && op.source).map(op => op.source!.id));
    return (ctx?.faculty || [])
      .filter(entry => !q || `${entry.snapshot.courseName} ${entry.snapshot.courseCode} ${entry.snapshot.SCode}`.toLowerCase().includes(q))
      .map(entry => ({ entry, used: used.has(entry.snapshot.id), clash: quickOverlap({ days: entry.snapshot.days, start: entry.snapshot.fstarttime, end: entry.snapshot.fendtime }, ws.currentItems) }))
      .slice(0, 40);
  }, [kind, query, ctx, ws.ops, ws.currentItems, draft.editingOpId]);

  const Mark = kind === "assign" ? UserRoundPlus : kind === "edit" ? Pencil : FilePlus2;
  return (
    <div className="quick-create visual-minimal sp-quick" ref={ref} role="dialog" aria-modal="false" aria-label={TITLE[kind]}
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }} onPointerDown={e => e.stopPropagation()}>
      <header className="qc-head">
        <span className="qc-mark" aria-hidden="true"><Mark /></span>
        <div>
          <strong>{TITLE[kind]}</strong>
          <small>{kind === "assign" ? "لا شيء يُكتب في الجدول قبل التثبيت" : <>{daysLabel(draft.days) || "اختر اليوم"} · <time dir="ltr">{draft.start && draft.end ? formatScheduleTimeRange(draft.start, draft.end) : "—"}</time></>}</small>
        </div>
        <button type="button" className="qc-close" onClick={onClose} data-guide-ignore="جزء من بطاقة الإضافة السريعة للمقترح — لا يكتب في الجدول" aria-label="إغلاق بدون إضافة"><X aria-hidden="true" /></button>
      </header>

      {kind === "assign" ? (
        <div className="sp-quick-assign">
          <label className="sp-search"><Search aria-hidden="true" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم المقرر أو رمزه أو الشعبة" /></label>
          {!ctx?.faculty.length ? <p className="sp-hint">لا توجد شعب «هيئة تدريسية» متاحة ضمن نطاقك.</p> : null}
          <ul role="radiogroup" aria-label="الشعب المتاحة للإسناد">
            {facultyList.map(({ entry, used, clash: overlap }) => {
              const s = entry.snapshot, on = draft.facultyId === s.id;
              return (
                <li key={s.id}>
                  <button type="button" role="radio" aria-checked={on} data-on={on || undefined} disabled={used}
                    onClick={() => ws.pickFaculty(s.id)} data-guide-ignore="يختار شعبة للإسناد — لا يكتب في الجدول">
                    <b>{s.courseName}</b>
                    <small>شعبة {s.SCode} · {daysLabel(s.days)} · <bdi className="sp-time">{timeRange(s.fstarttime, s.fendtime)}</bdi></small>
                    <em data-fit={used ? "used" : overlap ? "clash" : "clear"}>{used ? "مضافة" : overlap ? `يتداخل مع ${overlap.courseName || "محاضرة"}` : "لا تعارض"}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <>
          {kind === "create" ? (
            <>
              <label className="qc-field qc-wide"><span>المقرر</span>
                <select autoFocus value={draft.courseId ?? ""} onChange={e => ws.patchDraft({ courseId: Number(e.target.value) || null })}>
                  <option value="">اختر المقرر…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ""}{c.name}</option>)}
                </select>
              </label>
              <label className="qc-field qc-narrow"><span>الشعبة</span>
                <input value={draft.scode} inputMode="numeric" dir="ltr" placeholder={suggestion || "501"}
                  onChange={e => ws.patchDraft({ scode: toEnglishDigits(e.target.value).replace(/\D/g, "") })} />
              </label>
            </>
          ) : (
            <p className="sp-quick-course"><b>{editingRow?.courseName || "الموعد"}</b>{editingRow?.SCode ? <small> · شعبة {editingRow.SCode}</small> : null}</p>
          )}
          <CourseHistoryNote ws={ws} scope={scope} compact />
          <TimeWheels start={draft.start || "08:00"} end={draft.end || "08:50"} preferredDuration={draft.block || undefined}
            onChange={next => ws.patchDraft({ start: next.start, end: next.end, endTouched: true })} />
          <div className="sp-quick-days" role="group" aria-label="الأيام">
            {PROPOSAL_DAY_KEYS.map(day => (
              <button key={day} type="button" aria-pressed={draft.days.includes(day)} onClick={() => toggleDay(day)} data-guide-ignore="يبدّل يوماً في المادة">{PROPOSAL_DAY_NAMES[day]}</button>
            ))}
          </div>
          <div className="qc-location">
            <LocationPicker collegeId={scope.collegeId} sectionId={scope.sectionId} termId={ctx?.term.id}
              value={{ AdRoomCode: draft.location.AdRoomCode, AdRoomHall: draft.location.AdRoomHall, buildingId: draft.location.buildingId, roomId: draft.location.roomId, locationStatus: draft.location.locationStatus }}
              onChange={patch => ws.patchDraft(cur => ({ location: {
                AdRoomCode: String(patch.AdRoomCode ?? cur.location.AdRoomCode ?? ""), AdRoomHall: String(patch.AdRoomHall ?? cur.location.AdRoomHall ?? ""),
                buildingId: "buildingId" in patch ? patch.buildingId : cur.location.buildingId, roomId: "roomId" in patch ? patch.roomId : cur.location.roomId,
                locationStatus: ("locationStatus" in patch ? patch.locationStatus : cur.location.locationStatus) as any,
              } }))} />
          </div>
          {clash ? <p className="qc-warn"><AlertTriangle aria-hidden="true" />يتداخل مع «{clash.courseName || "محاضرة"}» في جدول الأستاذ.</p> : null}
        </>
      )}
      {ws.formIssues.length ? <p className="qc-warn qc-warn-hard" role="alert"><AlertTriangle aria-hidden="true" />{ws.formIssues[0]}</p> : null}

      <footer className="qc-foot">
        <button type="button" className="qc-expand" onClick={onMore} data-guide-ignore="جزء من بطاقة الإضافة السريعة للمقترح — لا يكتب في الجدول"><Maximize2 aria-hidden="true" />تفاصيل أكثر</button>
        <button type="button" className="qc-cancel" onClick={onClose} data-guide-ignore="جزء من بطاقة الإضافة السريعة للمقترح — لا يكتب في الجدول">إلغاء</button>
        <button type="button" className="qc-create" disabled={!ready} onClick={submit} data-guide-ignore="يضيف المادة إلى مسودة المقترح — لا يكتب في الجدول"
          title={ready ? "أضف إلى المقترح" : kind === "assign" ? "اختر شعبة" : "أكمل المقرر والوقت"}>
          <Check aria-hidden="true" />{kind === "assign" ? "أسند" : kind === "edit" ? "حفظ التعديل" : "أضف"}
        </button>
      </footer>
    </div>
  );
}
