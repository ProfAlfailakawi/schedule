/**
 * ── جدولُ الأستاذ الأسبوعي (العنصر الأساسي في المساحة) ───────────────────────
 *
 * يُرسَم من البيانات نفسها في الحالتين: «الجدول الحالي» و«مع المقترح»، ويُميَّز
 * كلُّ موعدٍ بحدٍّ ونصٍّ ورمزٍ — لا باللون وحده. المحاضراتُ المتداخلة تُرسم
 * جنباً إلى جنب لا فوق بعضها، فالتعارضُ يُرى ولا يُخفى.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeftRight, CalendarDays, Eye, EyeOff, List, Pencil, Plus, Sparkles, Trash2, X, CircleDashed, Lock, Building2,
} from "lucide-react";
import type { StudyProposalDayKey } from "../../types";
import { PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, type GridItem, type ProposalFinding } from "../../utils/studyProposal";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "../../utils/scheduleTime";
import { timeRange } from "./proposalFormat";
import { AR, countOf } from "../../utils/arabicCount";

export type GridMode = "current" | "with";

const SLOT = 30;
const SLOT_PX = 44;
const SNAP = 10;

const TAGS: Record<string, { text: string; Icon: React.ComponentType<any> }> = {
  proposed: { text: "مقترح", Icon: Plus },
  modified: { text: "معدّل", Icon: Pencil },
  out: { text: "سيخرج", Icon: ArrowLeftRight },
  draft: { text: "قيد الإعداد", Icon: CircleDashed },
  outside: { text: "التزام خارج القسم", Icon: Lock },
};

export function tagFor(item: GridItem, marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> }) {
  if (marks.blocker.has(item.key)) return { text: "تعارض", Icon: AlertTriangle, kind: "conflict" as const };
  const tag = TAGS[item.state === "out" && item.outAction === "delete" ? "out" : item.state];
  if (item.state === "out" && item.outAction === "delete") return { text: "سيُحذف", Icon: Trash2, kind: "out" as const };
  if (tag) return { text: tag.text, Icon: tag.Icon, kind: item.state };
  if (marks.review.has(item.key)) return { text: "للمراجعة", Icon: Sparkles, kind: "review" as const };
  return null;
}

interface Laid { item: GridItem; day: StudyProposalDayKey; top: number; height: number; lane: number; lanes: number }

function layout(items: readonly GridItem[], winStart: number): Map<StudyProposalDayKey, Laid[]> {
  const out = new Map<StudyProposalDayKey, Laid[]>();
  for (const day of PROPOSAL_DAY_KEYS) {
    const list = items
      .filter(item => item.days.includes(day))
      .map(item => ({ item, s: timeToMinutes(item.start), e: Math.max(timeToMinutes(item.end), timeToMinutes(item.start) + 10) }))
      .sort((a, b) => a.s - b.s || a.e - b.e);
    const placed: Laid[] = [];
    let cluster: Array<{ laid: Laid; e: number }> = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = Math.max(1, ...cluster.map(c => c.laid.lane + 1));
      cluster.forEach(c => { c.laid.lanes = lanes; });
      cluster = [];
    };
    for (const entry of list) {
      if (cluster.length && entry.s >= clusterEnd) { flush(); clusterEnd = -1; }
      const used = new Set(cluster.filter(c => c.e > entry.s).map(c => c.laid.lane));
      let lane = 0;
      while (used.has(lane)) lane += 1;
      const laid: Laid = {
        item: entry.item, day, lane, lanes: 1,
        top: ((entry.s - winStart) / SLOT) * SLOT_PX,
        height: Math.max(26, ((entry.e - entry.s) / SLOT) * SLOT_PX - 3),
      };
      cluster.push({ laid, e: entry.e });
      clusterEnd = Math.max(clusterEnd, entry.e);
      placed.push(laid);
    }
    flush();
    out.set(day, placed);
  }
  return out;
}

export function windowFor(items: readonly GridItem[]) {
  let start = SCHEDULE_DAY_START, end = 17 * 60 + 30;
  for (const item of items) {
    start = Math.min(start, Math.floor(timeToMinutes(item.start) / 60) * 60);
    end = Math.max(end, Math.ceil(timeToMinutes(item.end) / 30) * 30);
  }
  start = Math.max(SCHEDULE_DAY_START, start);
  end = Math.min(SCHEDULE_DAY_END, Math.max(end + 30, 17 * 60 + 30));
  return { start, end };
}

export interface WeekGridProps {
  mode: GridMode;
  onMode: (mode: GridMode) => void;
  showGhosts: boolean;
  onShowGhosts: (value: boolean) => void;
  currentItems: GridItem[];
  afterItems: GridItem[];
  ghosts: GridItem[];
  draft: GridItem | null;
  marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> };
  focusKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** سحبٌ (أو نقرٌ) على فراغ: اليوم وحدّا الوقت ومكانُ المؤشّر لتُفتح البطاقة عنده. */
  onPaint: (day: StudyProposalDayKey, start: number, end: number, x: number, y: number) => void;
  /** إضافةٌ إلى يومٍ بعينه من العرض الضيّق (القائمة) حيث لا سحب. */
  onAddDay?: (day: StudyProposalDayKey) => void;
  /** عرضٌ للقراءة فقط (معاينة الإرسال والتثبيت): لا سحب ولا إضافة. */
  readOnly?: boolean;
  checking: boolean;
  /** نتائج الفحص المتعلقة بالعنصر المختار. */
  findingsFor: (key: string) => ProposalFinding[];
  actionsFor: (item: GridItem) => Array<{ label: string; Icon: React.ComponentType<any>; run: () => void; tone?: "danger" }>;
  empty?: React.ReactNode;
  variant?: "auto" | "grid" | "agenda";
}

export default function ProposalWeekGrid(props: WeekGridProps) {
  const { mode, onMode, showGhosts, onShowGhosts, currentItems, afterItems, ghosts, draft, marks, focusKeys, selectedKey, onSelect, onPaint, checking } = props;
  const variant = props.variant ?? "auto";
  const [layoutMode, setLayoutMode] = useState<"grid" | "agenda">("grid");
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /* الإبراز (selectedKey) يأتي من أي مكان؛ أما بطاقة التفاصيل فلا تُفتح إلا بنقرٍ على الموعد نفسه. */
  const [detailKey, setDetailKey] = useState<string | null>(null);
  useEffect(() => { if (!selectedKey) setDetailKey(null); }, [selectedKey]);
  const pick = (key: string) => { const next = selectedKey === key && detailKey === key ? null : key; onSelect(next); setDetailKey(next); };

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setNarrow(entries[0].contentRect.width < 560));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const effectiveLayout = variant === "grid" ? "grid" : variant === "agenda" ? "agenda" : narrow ? "agenda" : layoutMode;

  const base = mode === "current" ? currentItems : afterItems;
  const visible = useMemo(() => {
    const list = [...base];
    if (mode === "with" && showGhosts) list.push(...ghosts);
    if (draft) list.push(draft);
    return list;
  }, [base, ghosts, draft, mode, showGhosts]);
  const win = useMemo(() => windowFor(visible), [visible]);
  /* الحدّ القديم (سيخرج) والمحاضرة الجاري إعدادها طبقتان فوق الجدول لا تأخذان حارةً:
     لو أخذتا حارة لضاق بهما وبالمواعيد الحقيقية العرضُ حتى لا يُقرأ شيء. */
  const isOverlay = (item: GridItem) => item.state === "out" || item.state === "draft";
  const laid = useMemo(() => layout(visible.filter(item => !isOverlay(item)), win.start), [visible, win.start]);
  const overlays = useMemo(() => layout(visible.filter(isOverlay), win.start), [visible, win.start]);
  const selected = visible.find(item => item.key === detailKey) || null;
  const rows = Math.ceil((win.end - win.start) / SLOT);
  const hours: number[] = [];
  for (let m = win.start; m < win.end; m += 60) hours.push(m);

  const counts = useMemo(() => Object.fromEntries(PROPOSAL_DAY_KEYS.map(day => [day, base.filter(item => item.days.includes(day)).length])) as Record<StudyProposalDayKey, number>, [base]);
  const changeCount = mode === "with" ? afterItems.filter(i => i.state === "proposed" || i.state === "modified").length + ghosts.length : 0;

  /* السحب على فراغٍ يرسم المدّة ثم يفتح البطاقة عند المؤشّر؛ والنقرُ وحده يعطي محاضرةً من خمسين دقيقة. */
  const [paint, setPaint] = useState<{ day: StudyProposalDayKey; from: number; to: number } | null>(null);
  const stroke = useRef<{ day: StudyProposalDayKey; anchor: number; rect: DOMRect; from: number; to: number } | null>(null);
  const minutesAt = (rect: DOMRect, clientY: number) => {
    const raw = win.start + (((clientY - rect.top) / SLOT_PX) * SLOT);
    return Math.max(SCHEDULE_DAY_START, Math.min(SCHEDULE_DAY_END, Math.round(raw / SNAP) * SNAP));
  };
  const beginPaint = (day: StudyProposalDayKey, event: React.PointerEvent<HTMLDivElement>) => {
    if (props.readOnly || event.target !== event.currentTarget || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = minutesAt(rect, event.clientY);
    stroke.current = { day, anchor, rect, from: anchor, to: anchor + 50 };
    setPaint({ day, from: anchor, to: anchor + 50 });
    const move = (e: PointerEvent) => {
      const s = stroke.current; if (!s) return;
      const m = minutesAt(s.rect, e.clientY);
      s.from = Math.min(s.anchor, m); s.to = Math.max(s.anchor, m);
      if (s.to - s.from < 30) s.to = s.from + 50;
      setPaint({ day: s.day, from: s.from, to: Math.min(SCHEDULE_DAY_END, s.to) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      const s = stroke.current; stroke.current = null; setPaint(null);
      if (s) onPaint(s.day, s.from, Math.min(SCHEDULE_DAY_END, s.to), e.clientX, e.clientY);
    };
    const cancel = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); stroke.current = null; setPaint(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
  };

  const eventButton = (entry: Laid, overlay = false) => {
    const { item } = entry;
    const tag = tagFor(item, marks);
    const width = overlay ? 100 : 100 / entry.lanes;
    const compact = entry.height < 58;
    const tiny = entry.height < 40;
    return (
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها"
        key={`${item.key}-${entry.day}`} type="button" className="sp-ev"
        data-state={item.state} data-conflict={marks.blocker.has(item.key) || undefined} data-review={marks.review.has(item.key) || undefined}
        data-selected={selectedKey === item.key || undefined} data-focus={focusKeys.has(item.key) || undefined}
        data-compact={compact || undefined} data-tiny={tiny || undefined} data-lanes={!overlay && entry.lanes > 1 ? entry.lanes : undefined} data-checking={checking && (item.state === "proposed" || item.state === "modified") || undefined}
        style={{ insetBlockStart: entry.top, blockSize: entry.height, insetInlineStart: overlay ? 0 : `${entry.lane * width}%`, inlineSize: `calc(${width}% - 3px)` }}
        data-overlay={overlay || undefined}
        aria-pressed={selectedKey === item.key}
        aria-label={`${item.outside ? "التزام خارج القسم" : `${item.courseName}${item.SCode ? ` شعبة ${item.SCode}` : ""}`}، ${PROPOSAL_DAY_NAMES[entry.day]}، ${item.start} إلى ${item.end}${tag ? `، ${tag.text}` : ""}`}
        onClick={event => { event.stopPropagation(); pick(item.key); }}
      >
        {item.outside ? (
          <span className="sp-ev-title"><Lock aria-hidden="true" /> التزام خارج القسم</span>
        ) : (
          <>
            <span className="sp-ev-title">{item.courseName || "موعد"}</span>
            {!tiny && <span className="sp-ev-meta">{item.SCode ? <bdi>شعبة {item.SCode}</bdi> : null}<bdi className="sp-time">{timeRange(item.start, item.end)}</bdi></span>}
            {!compact && item.place ? <span className="sp-ev-place"><Building2 aria-hidden="true" />{item.place}</span> : null}
          </>
        )}
        {tag && !tiny ? <span className="sp-tag" data-kind={tag.kind}><tag.Icon aria-hidden="true" />{tag.text}</span> : null}
        {tag && tiny ? <span className="sp-tag sp-tag-dot" data-kind={tag.kind} title={tag.text}><tag.Icon aria-hidden="true" /></span> : null}
      </button>
    );
  };

  const legend = (
    <ul className="sp-legend" aria-label="دليل الألوان والرموز">
      <li data-kind="current"><i aria-hidden="true" />قائم</li>
      <li data-kind="proposed"><i aria-hidden="true" />مقترح</li>
      <li data-kind="modified"><i aria-hidden="true" />معدّل</li>
      <li data-kind="out"><i aria-hidden="true" />سيخرج</li>
      <li data-kind="conflict"><i aria-hidden="true" />تعارض</li>
    </ul>
  );

  const detail = selected ? (
    <aside className="sp-detail" role="region" aria-label="تفاصيل الموعد المحدد">
      <header>
        <div>
          <strong>{selected.outside ? "التزام خارج القسم" : selected.courseName}</strong>
          {!selected.outside && <small>{[selected.courseCode, selected.SCode ? `شعبة ${selected.SCode}` : ""].filter(Boolean).join(" · ")}</small>}
        </div>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-btn" onClick={() => { onSelect(null); setDetailKey(null); }} aria-label="إغلاق التفاصيل"><X aria-hidden="true" /></button>
      </header>
      {(() => { const tag = tagFor(selected, marks); return tag ? <span className="sp-tag" data-kind={tag.kind}><tag.Icon aria-hidden="true" />{tag.text}</span> : null; })()}
      <dl>
        <div><dt>الأيام</dt><dd>{selected.days.map(day => PROPOSAL_DAY_NAMES[day]).join("، ")}</dd></div>
        <div><dt>الوقت</dt><dd className="sp-time">{timeRange(selected.start, selected.end)}</dd></div>
        {!selected.outside && <div><dt>المكان</dt><dd>{selected.place || "—"}{selected.place && !selected.placeKnown ? "" : ""}</dd></div>}
        {selected.collegeName && <div><dt>الكلية والقسم</dt><dd>{[selected.collegeName, selected.sectionName].filter(Boolean).join(" · ")}</dd></div>}
      </dl>
      {props.findingsFor(selected.key).map(finding => (
        <p key={finding.id} className="sp-detail-finding" data-kind={finding.kind}>
          <AlertTriangle aria-hidden="true" /><span><b>{finding.title}</b> {finding.detail}</span>
        </p>
      ))}
      <footer>
        {props.actionsFor(selected).map(action => (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={action.label} type="button" className="sp-chip-btn" data-tone={action.tone} onClick={action.run}><action.Icon aria-hidden="true" />{action.label}</button>
        ))}
      </footer>
    </aside>
  ) : null;

  return (
    <section className="sp-week" ref={rootRef} aria-label="الجدول الأسبوعي للأستاذ" data-checking={checking || undefined}>
      <div className="sp-week-bar">
        <div className="sp-seg" role="group" aria-label="عرض الجدول">
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={mode === "current"} onClick={() => onMode("current")}>الجدول الحالي</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={mode === "with"} onClick={() => onMode("with")}>
            مع المقترح{changeCount > 0 ? <span className="sp-count" aria-label={countOf(changeCount, AR.change)}>{changeCount}</span> : null}
          </button>
        </div>
        {mode === "with" && (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-toggle" aria-pressed={showGhosts} onClick={() => onShowGhosts(!showGhosts)}>
            {showGhosts ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}إظهار ما سيخرج أو يتغيّر
          </button>
        )}
        <span className="sp-week-spacer" />
        {!narrow && variant === "auto" && (
          <div className="sp-seg sp-seg-icons" role="group" aria-label="طريقة العرض">
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={layoutMode === "grid"} onClick={() => setLayoutMode("grid")} title="شبكة أسبوعية"><CalendarDays aria-hidden="true" /><span>أسبوعي</span></button>
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" aria-pressed={layoutMode === "agenda"} onClick={() => setLayoutMode("agenda")} title="قائمة زمنية"><List aria-hidden="true" /><span>قائمة</span></button>
          </div>
        )}
        {legend}
      </div>

      <div className="sp-week-body">
        {!visible.length && props.empty ? <div className="sp-week-empty">{props.empty}</div> : null}
        {effectiveLayout === "grid" ? (
          <div className="sp-grid" role="group" aria-label="شبكة أيام الأسبوع" style={{ ["--sp-rows" as any]: rows, ["--sp-slot" as any]: `${SLOT_PX}px` }}>
            <div className="sp-grid-head">
              <span className="sp-corner" aria-hidden="true" />
              {PROPOSAL_DAY_KEYS.map(day => (
                <span key={day} className="sp-day-head"><b>{PROPOSAL_DAY_NAMES[day]}</b><small>{counts[day] ? `${counts[day]}` : "—"}</small></span>
              ))}
            </div>
            <div className="sp-grid-body" style={{ blockSize: rows * SLOT_PX }}>
              <div className="sp-hours" aria-hidden="true">
                {hours.map(m => <span key={m} style={{ insetBlockStart: ((m - win.start) / SLOT) * SLOT_PX }}>{String(Math.floor(m / 60)).padStart(2, "0")}:00</span>)}
              </div>
              {PROPOSAL_DAY_KEYS.map(day => (
                <div key={day} className="sp-col" data-day={day} onPointerDown={event => beginPaint(day, event)} role="presentation">
                  {paint && paint.day === day ? <div className="sp-paint" aria-hidden="true" style={{ insetBlockStart: ((paint.from - win.start) / SLOT) * SLOT_PX, blockSize: ((paint.to - paint.from) / SLOT) * SLOT_PX }}><span>{String(Math.floor(paint.from / 60)).padStart(2, "0")}:{String(paint.from % 60).padStart(2, "0")} – {String(Math.floor(paint.to / 60)).padStart(2, "0")}:{String(paint.to % 60).padStart(2, "0")}</span></div> : null}
                  {(overlays.get(day) || []).map(entry => eventButton(entry, true))}
                  {(laid.get(day) || []).map(entry => eventButton(entry))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AgendaView laid={mergeAgenda(laid, overlays)} onAddDay={props.onAddDay} marks={marks} selectedKey={detailKey} focusKeys={focusKeys} onSelect={key => pick(key as string)} />
        )}
        {detail}
      </div>
    </section>
  );
}

function mergeAgenda(a: Map<StudyProposalDayKey, Laid[]>, b: Map<StudyProposalDayKey, Laid[]>) {
  const out = new Map<StudyProposalDayKey, Laid[]>();
  for (const day of PROPOSAL_DAY_KEYS) out.set(day, [...(a.get(day) || []), ...(b.get(day) || [])]);
  return out;
}

function AgendaView({ laid, marks, selectedKey, focusKeys, onSelect, onAddDay }: {
  laid: Map<StudyProposalDayKey, Laid[]>;
  onAddDay?: (day: StudyProposalDayKey) => void;
  marks: { blocker: ReadonlySet<string>; review: ReadonlySet<string> };
  selectedKey: string | null; focusKeys: ReadonlySet<string>; onSelect: (key: string | null) => void;
}) {
  const days = onAddDay ? PROPOSAL_DAY_KEYS : PROPOSAL_DAY_KEYS.filter(day => (laid.get(day) || []).length);
  const [active, setActive] = useState<StudyProposalDayKey | "all">("all");
  useEffect(() => { if (active !== "all" && !days.includes(active)) setActive("all"); }, [days, active]);
  const shown = active === "all" ? days : days.filter(d => d === active);
  return (
    <div className="sp-agenda">
      <div className="sp-agenda-tabs" role="tablist" aria-label="أيام الأسبوع">
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="tab" aria-selected={active === "all"} onClick={() => setActive("all")}>كل الأيام</button>
        {PROPOSAL_DAY_KEYS.map(day => (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={day} type="button" role="tab" aria-selected={active === day} disabled={!(laid.get(day) || []).length} onClick={() => setActive(day)}>
            {PROPOSAL_DAY_NAMES[day]}<small>{(laid.get(day) || []).length || ""}</small>
          </button>
        ))}
      </div>
      {!shown.length && <p className="sp-agenda-empty">لا مواعيد في هذا العرض.</p>}
      {shown.map(day => (
        <section key={day} className="sp-agenda-day" aria-label={PROPOSAL_DAY_NAMES[day]}>
          <h4>{PROPOSAL_DAY_NAMES[day]}{onAddDay ? <button type="button" className="sp-day-add" onClick={() => onAddDay(day)} aria-label={`إضافة موعد يوم ${PROPOSAL_DAY_NAMES[day]}`} data-guide-ignore="يفتح بطاقة إضافة لهذا اليوم — لا يكتب في الجدول"><Plus aria-hidden="true" />إضافة</button> : null}</h4>
          {!(laid.get(day) || []).length ? <p className="sp-agenda-empty">لا مواعيد</p> : null}
          <ol>
            {[...(laid.get(day) || [])].sort((a, b) => a.top - b.top).map(({ item }) => {
              const tag = tagFor(item, marks);
              return (
                <li key={`${item.key}-${day}`}>
                  <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-ag-item" data-state={item.state} data-conflict={marks.blocker.has(item.key) || undefined}
                    data-selected={selectedKey === item.key || undefined} data-focus={focusKeys.has(item.key) || undefined}
                    aria-pressed={selectedKey === item.key} onClick={() => onSelect(selectedKey === item.key ? null : item.key)}>
                    <span className="sp-ag-time sp-time">{timeRange(item.start, item.end)}</span>
                    <span className="sp-ag-main">
                      <b>{item.outside ? "التزام خارج القسم" : item.courseName}</b>
                      {!item.outside && <small>{[item.SCode ? `شعبة ${item.SCode}` : "", item.place].filter(Boolean).join(" · ")}</small>}
                    </span>
                    {tag ? <span className="sp-tag" data-kind={tag.kind}><tag.Icon aria-hidden="true" />{tag.text}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
