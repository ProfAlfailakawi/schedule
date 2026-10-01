/**
 * ── حالةُ مساحة إعداد المقترح ──────────────────────────────────────────────
 *
 * كلُّ ما يتغيّر أثناء العمل في موضعٍ واحد: المواد، والنموذج، والفحص، والحفظ،
 * والبدائل. المبدأ: المعاينةُ تتحرّك فوراً من الذاكرة، والحكمُ يأتي من الخادم
 * متأخراً قليلاً، ولا يُعرض «لا توجد تعارضات» ما لم يكن الفحصُ المكتمل
 * لهذه المواد بعينها.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  StudyProposal, StudyProposalDayKey, StudyProposalOp, StudyProposalResponseMode,
} from "../../types";
import { safeStorage } from "../../utils/safeStorage";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import {
  daysOf, materialFingerprint, PROPOSAL_DEFAULT_DAYS, PROPOSAL_DEFAULT_MESSAGE, placeLabel, type GridItem, type ProposalEvaluation,
} from "../../utils/studyProposal";
import {
  proposalApi, ProposalApiError, type AlternativeSuggestion, type ProposalContext, type StaffProposalView,
} from "./proposalApi";
import {
  blankDraft, draftFromFaculty, draftFromItem, draftToOp, opToDraft, quickOverlap, suggestSectionCode, autoEnd,
  type FormDraft, type WorkMode, type DraftContext,
} from "./proposalDraft";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";
export type EvalState = "idle" | "checking" | "ready" | "failed";

interface Backup { ops: StudyProposalOp[]; message: string; title: string; mode: StudyProposalResponseMode; expiryDays: number; at: number; baseRev: number }
const backupKey = (requestId: string, proposalId?: string | null) => `study-proposal-backup:${requestId}:${proposalId || "new"}`;

/** معاينةٌ فوريةٌ للجدول الناتج من الذاكرة، قبل أن يردّ الخادم. */
export function localAfter(current: GridItem[], ops: readonly StudyProposalOp[]): { items: GridItem[]; ghosts: GridItem[] } {
  const removed = new Map<number, { opId: string; action?: "unassign" | "delete"; replacedBy?: boolean }>();
  const items: GridItem[] = [];
  const ghosts: GridItem[] = [];
  for (const op of ops) {
    if (op.out) removed.set(op.out.snapshot.id, { opId: op.id, action: op.out.action });
    if (op.kind === "edit" && op.source) removed.set(op.source.id, { opId: op.id, replacedBy: true });
  }
  for (const item of current) {
    const gone = removed.get(item.rowId);
    if (!gone) { items.push(item); continue; }
    ghosts.push({ ...item, state: "out", key: `old:${item.rowId}`, opId: gone.opId, outAction: gone.action });
  }
  ops.forEach((op, index) => {
    const t = op.target;
    const place = placeLabel(t);
    const isNew = op.kind === "create" || (op.kind === "replace" && op.incoming === "create");
    items.push({
      key: isNew ? `new:${op.id}` : `row:${op.source?.id ?? `local${index}`}`,
      state: op.kind === "edit" ? "modified" : "proposed", opId: op.id, rowId: isNew ? -1000 - index : (op.source?.id ?? -1000 - index),
      courseName: t.courseName, courseCode: t.courseCode, SCode: t.SCode, days: daysOf(t), start: t.fstarttime, end: t.fendtime,
      place: place.text, placeKnown: place.known,
    });
  });
  return { items, ghosts };
}

export function useProposalWorkspace(options: { requestId: string; proposalId?: string | null; itemIndex?: number | null; onChanged?: () => void }) {
  const { requestId, itemIndex = null, onChanged } = options;
  const [ctx, setCtx] = useState<ProposalContext | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<StaffProposalView | null>(null);
  const proposal: StudyProposal | null = view?.proposal ?? null;
  const [ops, setOps] = useState<StudyProposalOp[]>([]);
  const [message, setMessage] = useState(PROPOSAL_DEFAULT_MESSAGE);
  const [title, setTitle] = useState("");
  const [responseMode, setResponseMode] = useState<StudyProposalResponseMode>("independent");
  const [expiryDays, setExpiryDays] = useState(PROPOSAL_DEFAULT_DAYS);
  const savedSig = useRef("");
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState<StudyProposal | null>(null);
  const [restorable, setRestorable] = useState<Backup | null>(null);

  const [evaluation, setEvaluation] = useState<ProposalEvaluation | null>(null);
  const [evalState, setEvalState] = useState<EvalState>("idle");
  const [evalFor, setEvalFor] = useState("");
  const [evalError, setEvalError] = useState("");
  const [evalTick, setEvalTick] = useState(0);

  const [draft, setDraft] = useState<FormDraft>(blankDraft("assign"));
  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusOpId, setFocusOpId] = useState<string | null>(null);
  const [focusFindingId, setFocusFindingId] = useState<string | null>(null);

  const [alts, setAlts] = useState<{ opId: string; loading: boolean; suggestions: AlternativeSuggestion[]; note?: string; error?: string } | null>(null);
  const [undo, setUndo] = useState<{ opId: string; before: StudyProposalOp["target"]; label: string } | null>(null);

  /* ── التحميل ──────────────────────────────────────────────────────────── */
  const hydrate = useCallback((context: ProposalContext, source: StaffProposalView | null) => {
    setCtx(context);
    if (source) {
      const p = source.proposal;
      setView(source);
      setOps(p.ops); setMessage(p.message); setTitle(p.title); setResponseMode(p.responseMode); setExpiryDays(p.expiryDays || PROPOSAL_DEFAULT_DAYS);
      savedSig.current = JSON.stringify([materialFingerprint(p.ops, p.responseMode), p.message, p.title, p.expiryDays || PROPOSAL_DEFAULT_DAYS]);
      setSaveState("clean");
    } else {
      setTitle(`مقترح دراسي — ${context.instructor.name}`);
      savedSig.current = "";
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    proposalApi.context(requestId, options.proposalId || undefined, controller.signal)
      .then(context => {
        hydrate(context, context.proposal);
        const backup = safeStorage.json<Backup | null>(backupKey(requestId, options.proposalId), null, "local");
        if (backup && backup.ops?.length && (!context.proposal || backup.baseRev === context.proposal.proposal.rev) && Date.now() - backup.at < 7 * 86400000) {
          const same = JSON.stringify(backup.ops) === JSON.stringify(context.proposal?.proposal.ops || []);
          if (!same) setRestorable(backup);
        }
      })
      .catch(error => { if ((error as any)?.name !== "AbortError") setLoadError(error instanceof Error ? error.message : "تعذّر تحميل مساحة المقترح."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [requestId, options.proposalId, hydrate]);

  /* ── ما يُقاس عليه «هل تغيّر شيء؟» ──────────────────────────────────── */
  const sig = useMemo(() => JSON.stringify([materialFingerprint(ops, responseMode), message, title, expiryDays]), [ops, responseMode, message, title, expiryDays]);
  const opsFingerprint = useMemo(() => materialFingerprint(ops, responseMode), [ops, responseMode]);
  const dirty = ctx !== null && sig !== savedSig.current && !(proposal === null && ops.length === 0);
  useEffect(() => { if (dirty && saveState !== "saving") setSaveState(s => (s === "error" ? s : "dirty")); }, [dirty, saveState]);

  /* نسخةٌ احتياطيةٌ محلية: إغلاقُ الشاشة أو انقطاعُ الشبكة لا يُضيّع ما كُتب. */
  useEffect(() => {
    if (!ctx || !dirty) return;
    const handle = window.setTimeout(() => {
      safeStorage.set(backupKey(requestId, options.proposalId || proposal?.id), JSON.stringify({
        ops, message, title, mode: responseMode, expiryDays, at: Date.now(), baseRev: proposal?.rev ?? 0,
      } satisfies Backup), "local");
    }, 400);
    return () => window.clearTimeout(handle);
  }, [ctx, dirty, ops, message, title, responseMode, expiryDays, requestId, options.proposalId, proposal]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  /* ── الفحص ─────────────────────────────────────────────────────────────── */
  const evalSeq = useRef(0);
  /* مقترحٌ ثُبّت أو سُحب لا يُفحص: جدولُه الحيّ صار يحمل نتيجته، فمقارنتُه به تُظهر «تغيّراً» لم يحدث. */
  const terminal = Boolean(proposal && (proposal.commit || proposal.status === "committed" || proposal.status === "withdrawn"));
  useEffect(() => {
    if (!ctx) return;
    if (terminal) { setEvaluation(null); setEvalState("idle"); setEvalFor(""); return; }
    if (!ops.length) { setEvaluation(null); setEvalState("idle"); setEvalFor(""); return; }
    setEvalState("checking");
    const controller = new AbortController();
    const seq = ++evalSeq.current;
    const handle = window.setTimeout(() => {
      proposalApi.evaluate({ requestId, proposalId: proposal?.id, ops }, controller.signal)
        .then(({ evaluation: result }) => {
          if (seq !== evalSeq.current) return;
          setEvaluation(result); setEvalFor(opsFingerprint); setEvalState("ready"); setEvalError("");
        })
        .catch(error => {
          if ((error as any)?.name === "AbortError" || seq !== evalSeq.current) return;
          setEvalState("failed"); setEvalError(error instanceof Error ? error.message : "تعذّر الفحص.");
        });
    }, 380);
    return () => { window.clearTimeout(handle); controller.abort(); };
  }, [ctx, ops, opsFingerprint, requestId, proposal?.id, evalTick, terminal]);

  const evalCurrent = evaluation !== null && evalFor === opsFingerprint && evalState === "ready";
  const retryEvaluation = useCallback(() => setEvalTick(t => t + 1), []);

  /* ── المواد ────────────────────────────────────────────────────────────── */
  const dctx: DraftContext | null = useMemo(() => ctx ? ({
    faculty: new Map(ctx.faculty.map(entry => [entry.snapshot.id, entry])),
    instructorItems: new Map(ctx.current.items.map(item => [item.rowId, item])),
    courses: new Map(ctx.courses.map(course => [course.id, course])),
  }) : null, [ctx]);

  const chooseMode = useCallback((mode: WorkMode) => {
    setDraft(current => current.editingOpId ? current : { ...blankDraft(mode), location: { AdRoomCode: "", AdRoomHall: "" } });
    setFormIssues([]);
  }, []);

  const patchDraft = useCallback((patch: Partial<FormDraft> | ((current: FormDraft) => Partial<FormDraft>)) => {
    setDraft(current => {
      const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
      /* النهايةُ تتبع البداية والنمط ما لم يكتبها المنسّق بنفسه. */
      if (!next.endTouched && (next.start !== current.start || next.days.join() !== current.days.join())) {
        const end = autoEnd(next.days, next.start);
        if (end) next.end = end;
      }
      /* رقمُ الشعبة المقترح لمقررٍ جديدٍ يُملأ ما لم يكتب المنسّق شيئاً. */
      const creates = next.mode === "create" || (next.mode === "replace" && next.incoming === "create");
      if (creates && next.courseId && next.courseId !== current.courseId && ctx) {
        next.scode = suggestSectionCode(next.courseId, ctx.usedCodes, ops, next.editingOpId);
      }
      return next;
    });
    setFormIssues([]);
  }, [ctx, ops]);

  const pickFaculty = useCallback((id: number) => {
    const entry = dctx?.faculty.get(id);
    if (!entry) return;
    setDraft(current => draftFromFaculty(current, entry));
    setFormIssues([]);
  }, [dctx]);

  const pickRow = useCallback((rowId: number) => {
    const item = dctx?.instructorItems.get(rowId);
    if (!item) return;
    setDraft(current => draftFromItem(current, item));
    setFormIssues([]);
    setSelectedKey(item.key);
  }, [dctx]);

  const submitDraft = useCallback((): boolean => {
    if (!dctx) return false;
    const { op, issues } = draftToOp(draft, dctx);
    if (!op) { setFormIssues(issues); return false; }
    setOps(current => {
      const at = current.findIndex(item => item.id === op.id);
      return at >= 0 ? current.map(item => item.id === op.id ? op : item) : [...current, op];
    });
    setFocusOpId(op.id);
    setFormIssues([]);
    setDraft(blankDraft(draft.mode));
    setUndo(null);
    return true;
  }, [draft, dctx]);

  const editOp = useCallback((opId: string) => {
    const op = ops.find(item => item.id === opId);
    if (!op) return;
    setDraft(opToDraft(op));
    setFocusOpId(opId); setFormIssues([]);
  }, [ops]);

  const cancelEdit = useCallback(() => { setDraft(current => blankDraft(current.mode)); setFormIssues([]); }, []);

  const removeOp = useCallback((opId: string) => {
    setOps(current => current.filter(item => item.id !== opId));
    setDraft(current => current.editingOpId === opId ? blankDraft(current.mode) : current);
    setFocusOpId(current => current === opId ? null : current);
    setAlts(current => current?.opId === opId ? null : current);
  }, []);

  /** تعديلٌ مباشرٌ على هدف مادةٍ من خارج النموذج (جرّب هذا الوقت، وقت الأستاذ). */
  const retargetOp = useCallback((opId: string, patch: Partial<StudyProposalOp["target"]>, label: string) => {
    setOps(current => current.map(op => {
      if (op.id !== opId) return op;
      setUndo({ opId, before: op.target, label });
      return { ...op, target: { ...op.target, ...patch } };
    }));
    setDraft(current => current.editingOpId === opId ? {
      ...current, days: (patch.days as StudyProposalDayKey[]) ?? current.days, start: patch.fstarttime ?? current.start, end: patch.fendtime ?? current.end, endTouched: true,
    } : current);
  }, []);

  const undoRetarget = useCallback(() => {
    if (!undo) return;
    setOps(current => current.map(op => op.id === undo.opId ? { ...op, target: undo.before } : op));
    setUndo(null);
  }, [undo]);

  /** النقر على فراغٍ في الجدول: اليومُ والبدايةُ تُملآن في النموذج. */
  const fillFromCell = useCallback((day: StudyProposalDayKey, startMinutes: number) => {
    const hh = String(Math.floor(startMinutes / 60)).padStart(2, "0"), mm = String(startMinutes % 60).padStart(2, "0");
    patchDraft(current => ({
      /* يومٌ داخل النمط المختار يُبقي النمط ويحرّك البداية؛ يومٌ خارجه يبدأ نمطاً جديداً. */
      days: current.days.includes(day) ? current.days : [day],
      start: `${hh}:${mm}`, endTouched: false,
    }));
  }, [patchDraft]);

  /* ── البدائل ───────────────────────────────────────────────────────────── */
  const loadAlternatives = useCallback((opId: string) => {
    setAlts({ opId, loading: true, suggestions: [] });
    proposalApi.alternatives({ requestId, proposalId: proposal?.id, ops, opId })
      .then(result => setAlts({ opId, loading: false, suggestions: result.suggestions, note: result.note }))
      .catch(error => setAlts({ opId, loading: false, suggestions: [], error: error instanceof Error ? error.message : "تعذّر جلب البدائل." }));
  }, [requestId, proposal?.id, ops]);

  const applyAlternative = useCallback((opId: string, alt: AlternativeSuggestion) => {
    retargetOp(opId, { days: alt.days, fstarttime: alt.start, fendtime: alt.end }, "جُرّب وقتٌ بديل");
    setAlts(null);
  }, [retargetOp]);

  /* ── الحفظ ─────────────────────────────────────────────────────────────
     كلُّ حفظٍ ينتظر الذي قبله ويقرأ آخر حالةٍ وقت دوره: الحفظُ التلقائي وحفظُ
     المعاينة لا يتسابقان فيصطدم أحدُهما بمراجعة الآخر ويُظنّ أن غيرنا عدّل. */
  const latest = useRef({ proposal, ops, message, title, responseMode, expiryDays });
  latest.current = { proposal, ops, message, title, responseMode, expiryDays };
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const doSave = useCallback(async (opts: { silent?: boolean } = {}): Promise<StudyProposal | null> => {
    const cur = latest.current;
    if (!ctx) return null;
    if (!cur.ops.length && !cur.proposal) return null;
    setSaveState("saving"); setSaveError("");
    const body = { requestId, itemIndex, title: cur.title, message: cur.message, responseMode: cur.responseMode, ops: cur.ops, expiryDays: cur.expiryDays };
    try {
      const result = cur.proposal
        ? await proposalApi.save(cur.proposal.id, { ...body, rev: cur.proposal.rev })
        : await proposalApi.create(body);
      latest.current = { ...latest.current, proposal: result.proposal, ops: result.proposal.ops };
      setView(result);
      setOps(result.proposal.ops);
      savedSig.current = JSON.stringify([materialFingerprint(result.proposal.ops, result.proposal.responseMode), result.proposal.message, result.proposal.title, result.proposal.expiryDays || PROPOSAL_DEFAULT_DAYS]);
      setSaveState("saved"); setSavedAt(Date.now()); setConflict(null);
      safeStorage.remove(backupKey(requestId, options.proposalId || result.proposal.id), "local");
      safeStorage.remove(backupKey(requestId, null), "local");
      onChanged?.();
      return result.proposal;
    } catch (error) {
      if (error instanceof ProposalApiError && error.isRevisionConflict) { setConflict(error.body.current as StudyProposal); setSaveState("error"); setSaveError(error.message); return null; }
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "تعذّر الحفظ.");
      if (!opts.silent) console.error(error);
      return null;
    }
  }, [ctx, requestId, itemIndex, options.proposalId, onChanged]);
  const save = useCallback((opts: { silent?: boolean } = {}): Promise<StudyProposal | null> => {
    const run = chain.current.then(() => doSave(opts));
    chain.current = run.catch(() => null);
    return run;
  }, [doSave]);

  /* حفظٌ تلقائي لمسودةٍ لم تُرسَل قط: لا يُنشئ نسخاً ولا يلمس ما وصل الأستاذ. */
  useEffect(() => {
    if (!dirty || saveState === "saving" || saveState === "error" || conflict) return;
    if (!ops.length) return;
    if (proposal && proposal.sentVersion > 0) return;
    const handle = window.setTimeout(() => { void save({ silent: true }); }, 2600);
    return () => window.clearTimeout(handle);
  }, [dirty, saveState, ops, proposal, conflict, save, sig]);

  const takeTheirs = useCallback(() => {
    if (!conflict || !ctx) return;
    setView(prev => prev ? { ...prev, proposal: conflict } : prev);
    setOps(conflict.ops); setMessage(conflict.message); setTitle(conflict.title); setResponseMode(conflict.responseMode);
    savedSig.current = JSON.stringify([materialFingerprint(conflict.ops, conflict.responseMode), conflict.message, conflict.title, conflict.expiryDays || PROPOSAL_DEFAULT_DAYS]);
    setConflict(null); setSaveState("clean");
  }, [conflict, ctx]);

  const keepMine = useCallback(() => {
    if (!conflict) return;
    setView(prev => prev ? { ...prev, proposal: conflict } : prev);
    setConflict(null); setSaveState("dirty");
  }, [conflict]);

  const restoreBackup = useCallback(() => {
    if (!restorable) return;
    setOps(restorable.ops); setMessage(restorable.message); setTitle(restorable.title); setResponseMode(restorable.mode); setExpiryDays(restorable.expiryDays);
    setRestorable(null);
  }, [restorable]);
  const discardBackup = useCallback(() => {
    safeStorage.remove(backupKey(requestId, options.proposalId), "local"); setRestorable(null);
  }, [requestId, options.proposalId]);

  const replaceView = useCallback((next: StaffProposalView) => {
    setView(next);
    setOps(next.proposal.ops); setMessage(next.proposal.message); setTitle(next.proposal.title);
    setResponseMode(next.proposal.responseMode); setExpiryDays(next.proposal.expiryDays || PROPOSAL_DEFAULT_DAYS);
    savedSig.current = JSON.stringify([materialFingerprint(next.proposal.ops, next.proposal.responseMode), next.proposal.message, next.proposal.title, next.proposal.expiryDays || PROPOSAL_DEFAULT_DAYS]);
    setSaveState("saved"); setSavedAt(Date.now());
    onChanged?.();
  }, [onChanged]);

  /* ── ما يُعرض ──────────────────────────────────────────────────────────── */
  const currentItems = ctx?.current.items ?? [];
  const optimistic = useMemo(() => localAfter(currentItems, ops), [currentItems, ops]);
  const afterItems = terminal ? currentItems : evalCurrent ? evaluation!.after.items : optimistic.items;
  const ghostItems = terminal ? [] : evalCurrent ? evaluation!.after.ghosts : optimistic.ghosts;

  /** المحاضرةُ الجاري إعدادها: ما في النموذج الآن، قبل أن تُضاف. */
  const draftItem: GridItem | null = useMemo(() => {
    if (!draft.days.length || !/^\d{1,2}:\d{2}$/.test(draft.start) || !/^\d{1,2}:\d{2}$/.test(draft.end)) return null;
    if (timeToMinutes(draft.end) <= timeToMinutes(draft.start)) return null;
    const faculty = draft.facultyId != null ? dctx?.faculty.get(draft.facultyId) : undefined;
    const row = draft.rowId != null ? dctx?.instructorItems.get(draft.rowId) : undefined;
    const course = draft.courseId ? dctx?.courses.get(draft.courseId) : undefined;
    const place = placeLabel({ AdRoomCode: draft.location.AdRoomCode, AdRoomHall: draft.location.AdRoomHall, locationStatus: draft.location.locationStatus, roomId: draft.location.roomId });
    return {
      key: "draft", state: "draft", rowId: -1, opId: draft.editingOpId || undefined,
      courseName: faculty?.snapshot.courseName || row?.courseName || course?.name || "مادة جديدة",
      courseCode: faculty?.snapshot.courseCode || row?.courseCode || course?.code || "", SCode: draft.scode || faculty?.snapshot.SCode || row?.SCode || "",
      days: draft.days, start: draft.start, end: draft.end, place: place.text, placeKnown: place.known,
    };
  }, [draft, dctx]);

  /** مفاتيح المحاضرات المعنية بالموانع والملاحظات، للتمييز على الجدول. */
  const marks = useMemo(() => {
    const blocker = new Set<string>(), review = new Set<string>();
    if (evalCurrent) for (const finding of evaluation!.findings) {
      if (finding.kind === "info") continue;
      for (const key of finding.gridKeys || []) (finding.kind === "blocker" ? blocker : review).add(key);
    }
    return { blocker, review };
  }, [evalCurrent, evaluation]);

  const focusKeys = useMemo(() => {
    const keys = new Set<string>();
    if (focusFindingId && evaluation) for (const key of evaluation.findings.find(f => f.id === focusFindingId)?.gridKeys || []) keys.add(key);
    if (focusOpId) for (const item of [...afterItems, ...ghostItems]) if (item.opId === focusOpId) keys.add(item.key);
    return keys;
  }, [focusFindingId, focusOpId, evaluation, afterItems, ghostItems]);

  const draftFit = useMemo(() => {
    if (!draftItem) return null;
    const ignore = new Set<string>();
    if (draft.rowId != null) ignore.add(`row:${draft.rowId}`);
    if (draft.mode === "replace" && draft.rowId != null) ignore.add(`row:${draft.rowId}`);
    return quickOverlap(draftItem, currentItems.filter(i => !i.outside || true), ignore);
  }, [draftItem, currentItems, draft.rowId, draft.mode]);

  return {
    ctx, loading, loadError, view, proposal, ops, setOps, message, setMessage, title, setTitle, responseMode, setResponseMode,
    expiryDays, setExpiryDays, dirty, saveState, savedAt, saveError, conflict, takeTheirs, keepMine, restorable, restoreBackup, discardBackup,
    evaluation, evalState, evalCurrent, evalError, retryEvaluation,
    draft, patchDraft, chooseMode, pickFaculty, pickRow, submitDraft, editOp, cancelEdit, removeOp, formIssues, setFormIssues,
    selectedKey, setSelectedKey, focusOpId, setFocusOpId, focusFindingId, setFocusFindingId, focusKeys,
    alts, setAlts, loadAlternatives, applyAlternative, retargetOp, undo, undoRetarget, fillFromCell,
    save, replaceView, hydrate,
    currentItems, afterItems, ghostItems, draftItem, marks, draftFit, itemIndex, terminal,
  };
}

export type Workspace = ReturnType<typeof useProposalWorkspace>;
