import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDot,
  Compass,
  Eye,
  Gauge,
  Hand,
  History,
  LayoutDashboard,
  Lightbulb,
  MapPin,
  MousePointer2,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  type DynamicGuideFeature,
  type GuideFeature,
  type GuideCommand,
  allowedGuideFeatures,
  allAllowedGuideFeatures,
  canAccessGuideFeature,
  commonWorkflows,
  dialectIntentTerms,
  discoverVisibleControls,
  featureById,
  loadGuideProfile,
  markFeatureSeen,
  markGuideIconHintSeen,
  markDiscoveredSeen,
  markAllDiscoveredSeen,
  markAllGuideProductUpdatesSeen,
  masteryScore,
  noteHint,
  noteDiscoveredControls,
  predictedNextFeature,
  rankChangedFeatures,
  recordFeatureEvent,
  guideActionForFeature,
  canRunGuideAction,
  classifyGuideReason,
  parseStructuredGuideIntent,
  featureIdForGuideIntentGoal,
  guideUnreadSummary,
  stableDynamicControlId,
  needsGuideAIFallback,
  beginGuideTransaction,
  appendGuideTransactionOperation,
  completeGuideTransaction,
  journeyForFeature,
  startGuideJourney,
  advanceGuideJourney,
  completeGuideJourney,
  failGuideJourney,
  failGuideTransaction,
  expireGuideJourneys,
  transactionRollbackCommands,
  markGuideTransactionRolledBack,
  removeGuideRoutine,
  saveGuideRoutine,
  setGuideTask,
  setHintMode,
  setOnboardingDone,
  silenceHint,
  touchGuideRoutine,
  type GuideProfile,
} from "../guide/smartGuide";
import { telemetryGuideJourney } from "../utils/clientTelemetry";

type GuideHint = { key?: string; featureId?: string; title: string; detail?: string; level?: "soft" | "strong" };
type Props = {
  open: boolean;
  onClose: () => void;
  activeView: string;
  user: any;
  permissions: number[];
  root: boolean;
  hint: GuideHint | null;
  onDismissHint: () => void;
  context: any;
  onNavigate: (view: string) => void;
};
type TourStep = NonNullable<GuideFeature["steps"]>[number];
type TourState = { feature: GuideFeature; steps: TourStep[]; index: number };
type LocatedStep = { rect: DOMRect; text: string; index: number; total: number } | null;
type SearchRow =
  | { kind: "known"; feature: GuideFeature; score: number }
  | { kind: "dynamic"; feature: DynamicGuideFeature; score: number }
  | { kind: "routine"; feature: { id: string; name: string; sequence: string[] }; score: number };

const formatBadgeCount = (count:number, cap:number) => count > cap ? `${cap}+` : String(Math.max(0,count));
const searchRowKey = (row:SearchRow) => `${row.kind}:${row.feature.id}`;

const normalizeArabic = (value: string) => String(value || "")
  .toLowerCase()
  .replace(/[إأآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[ًٌٍَُِّْـٰ]/g, "")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

function targetElement(step: TourStep): HTMLElement | null {
  if (step.target) return document.querySelector<HTMLElement>(`[data-guide-target="${step.target}"],[data-guide-feature-id="${step.target}"]`);
  if (step.selector) return document.querySelector<HTMLElement>(step.selector);
  return null;
}

function targetNow(id?: string) {
  if (!id) return null;
  return document.querySelector<HTMLElement>(`[data-guide-target="${id}"],[data-guide-feature-id="${id}"]`);
}

function liveTargetLabel(id?: string) {
  const element = targetNow(id);
  if (!element) return "";
  return String(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 72);
}

function hydrateGuideSteps(steps: TourStep[]) {
  return steps.map((step) => {
    if (!step.target) return step;
    const label = liveTargetLabel(step.target);
    if (!label) return step;
    const text = /«[^»]+»/.test(step.text) ? step.text.replace(/«[^»]+»/, `«${label}»`) : step.text;
    return { ...step, text };
  });
}

function explainDynamic(feature: DynamicGuideFeature) {
  const normalized = normalizeArabic(feature.title);
  if (/حذف|مسح|ازاله/.test(normalized)) return "هذا إجراء حذف. لن ينفذه المرشد نيابةً عنك دون تأكيد صريح منك.";
  if (/اعتماد|نشر|استعاده|نسخه/.test(normalized)) return "هذا إجراء مؤثر. يمكنني أن أوضح نتيجته وأوصلك إليه، بينما يبقى القرار النهائي لك.";
  if (feature.kind === "select") return "هذا اختيار يغيّر نطاق البيانات الحالية أو طريقة عرضها.";
  if (feature.kind === "input") return "هذا حقل إدخال مرتبط بالشاشة الحالية، ويستخدم عادةً للبحث أو تضييق النتائج.";
  return feature.summary || "هذا عنصر حي في الشاشة الحالية، ويمكنني أن أحدد مكانه وأشرح استخدامه.";
}

function queryScore(query: string, feature: { title: string; summary: string; keywords?: string[] }) {
  const terms = dialectIntentTerms(query).map(normalizeArabic).filter(Boolean);
  const needle = normalizeArabic(query);
  if (!needle) return 0;
  const title = normalizeArabic(feature.title);
  const summary = normalizeArabic(feature.summary);
  const keywords = (feature.keywords || []).map(normalizeArabic);
  let score = 0;
  if (title === needle) score += 18;
  if (title.includes(needle) || needle.includes(title)) score += 10;
  if (summary.includes(needle)) score += 5;
  terms.forEach((term) => {
    if (title.includes(term)) score += 4;
    if (summary.includes(term)) score += 2;
    keywords.forEach((keyword) => {
      if (keyword.includes(term) || term.includes(keyword)) score += 4;
    });
  });
  return score;
}

function isSensitive(feature: GuideFeature) {
  return feature.risk === "sensitive" || /حذف|نشر|اعتماد|استعاده|استعادة|مسح/.test(normalizeArabic(feature.title));
}

export default function SmartGuide({
  open,
  onClose,
  activeView,
  user,
  permissions,
  root,
  hint,
  onDismissHint,
  context,
  onNavigate,
}: Props) {
  const userId = Number(user?.SystemUserId || 0);
  const [profile, setProfile] = useState<GuideProfile>(() => loadGuideProfile(userId));
  const [query, setQuery] = useState("");
  const [pointMode, setPointMode] = useState(false);
  const [drawerHidden, setDrawerHidden] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);
  const [aiIntent, setAiIntent] = useState<any>(null);
  const [dynamic, setDynamic] = useState<DynamicGuideFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDynamic, setSelectedDynamic] = useState<DynamicGuideFeature | null>(null);
  const [tour, setTour] = useState<TourState | null>(null);
  const [pendingTourId, setPendingTourId] = useState<string | null>(null);
  const [pendingTourStep, setPendingTourStep] = useState(0);
  const [located, setLocated] = useState<LocatedStep>(null);
  const [preview, setPreview] = useState<{ feature: GuideFeature; command: GuideCommand; transactionId?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState<"forYou" | "here" | "new" | "all">("forYou");
  const [sheetLevel, setSheetLevel] = useState<"peek" | "medium" | "full">("peek");
  const [iconIntro, setIconIntro] = useState<{ key:string; title:string; summary:string } | null>(null);
  const [screenHandoff, setScreenHandoff] = useState<{ title:string; detail:string } | null>(null);
  const [routineDraft, setRoutineDraft] = useState<{ sequence: string[]; name: string } | null>(null);
  const [collectiveFriction, setCollectiveFriction] = useState<Array<{ name: string; count: number }>>([]);
  const [collectiveInsights, setCollectiveInsights] = useState<Array<{ featureId:string; version:number; step:string; attempts:number; failureRate:number; abandonRate:number; helpRate:number; helpToSuccessRate:number; changeVsPrevious:number }>>([]);
  const drawerRef = useRef<HTMLElement | null>(null);
  const lastEscalationRef = useRef("");
  const discoveredSignatureRef = useRef("");
  const sheetDragStartRef = useRef<number | null>(null);
  const preSearchSheetRef = useRef<"peek" | "medium" | "full">("peek");
  const intentRequestRef = useRef(0);
  const iconActionRef = useRef<{ key:string; action:()=>void } | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const handoffTimerRef = useRef<number | null>(null);

  const showScreenHandoff = useCallback((title:string, detail:string) => {
    if (handoffTimerRef.current) window.clearTimeout(handoffTimerRef.current);
    setScreenHandoff({ title, detail });
    handoffTimerRef.current = window.setTimeout(() => setScreenHandoff(null), 2600);
  }, []);

  const refreshProfile = useCallback(() => setProfile(loadGuideProfile(userId)), [userId]);
  const admin = Boolean(root || user?.IsAdminUser);
  const permissionSession = useMemo(() => ({ permissions, root, admin }), [permissions, root, admin]);
  const known = useMemo(() => allowedGuideFeatures(activeView, permissions, root, admin), [activeView, permissions, root, admin]);
  const allAllowed = useMemo(() => allAllowedGuideFeatures(permissions, root, admin), [permissions, root, admin]);
  const pageFeature = useMemo(() => {
    const feature = featureById(`page.${activeView}`);
    return feature && canAccessGuideFeature(feature, permissionSession) ? feature : null;
  }, [activeView, permissionSession]);
  const pageMastery = masteryScore(profile, pageFeature);
  const isExpert = Boolean(context?.metrics?.isExpert) || pageMastery >= 0.72;
  const unreadSummary = useMemo(() => guideUnreadSummary(profile, allAllowed, activeView), [profile, allAllowed, activeView]);
  const allChanged = useMemo(() => rankChangedFeatures(profile, unreadSummary.product), [profile, unreadSummary.product]);
  const discoveredChanged = unreadSummary.runtime;
  const workflows = useMemo(() => commonWorkflows(profile, activeView).map(workflow => ({ ...workflow, sequence:workflow.sequence.filter(id => { const feature=featureById(id); return Boolean(feature && canAccessGuideFeature(feature, permissionSession)); }) })).filter(workflow => workflow.sequence.length > 0), [profile, activeView, permissionSession]);
  const selectedRaw = selectedId ? featureById(selectedId) : null;
  const selected = selectedRaw && canAccessGuideFeature(selectedRaw, permissionSession) ? selectedRaw : null;
  const selectedMastery = selected ? masteryScore(profile, selected) : 0;
  const selectedHistory = selected ? profile.mastery[selected.id] : undefined;
  const selectedRecentlyHelped = Boolean(selectedHistory?.lastHelp && Date.now() - selectedHistory.lastHelp < 2 * 60 * 60 * 1000);
  const selectedUpdated = Boolean(selected && selectedHistory?.versionSeen && selectedHistory.versionSeen < selected.version);
  const selectedForgotten = Boolean(selectedHistory?.uses && selectedHistory?.lastUsed && Date.now() - selectedHistory.lastUsed > 90 * 24 * 60 * 60 * 1000);
  const selectedReason = classifyGuideReason({ mastery:selectedMastery, versionChanged:selectedUpdated, forgotten:selectedForgotten });
  const selectedExpert = selectedReason === "NORMAL_EXPERT_BEHAVIOR";
  const selectedConcise = selectedExpert || selectedRecentlyHelped || selectedReason === "FORGOTTEN";
  const currentFeatureId = context?.currentFeatureId || `page.${activeView}`;
  const predicted = useMemo(() => predictedNextFeature(profile, currentFeatureId), [profile, currentFeatureId]);
  const predictedRaw = predicted ? featureById(predicted.id) : null;
  const predictedFeature = predictedRaw && canAccessGuideFeature(predictedRaw, permissionSession) ? predictedRaw : null;
  const routines = useMemo(() => (Object.values(profile.routines || {}) as Array<{id:string;name:string;sequence:string[];createdAt:number;lastUsed:number}>).sort((a, b) => b.lastUsed - a.lastUsed || b.createdAt - a.createdAt), [profile]);
  const rollbackTransaction = useMemo(() => [...(profile.transactions || [])].reverse().find((item) => item.status === "completed" && transactionRollbackCommands(profile, item.id).length) || null, [profile]);
  const undoGuideTransaction = useCallback(() => {
    if (!rollbackTransaction) return;
    const commands = transactionRollbackCommands(loadGuideProfile(userId), rollbackTransaction.id);
    if (!commands.length) return;
    showScreenHandoff("أعيد آخر عملية", `سأتراجع عن «${rollbackTransaction.title}» باستخدام أوامر التراجع الموثقة.`);
    setDrawerHidden(true);
    commands.forEach((command, index) => window.setTimeout(() => runCommand(command), index * 180));
    markGuideTransactionRolledBack(userId, rollbackTransaction.id);
    setNotice(`تم إرسال التراجع عن «${rollbackTransaction.title}».`);
    window.setTimeout(refreshProfile, commands.length * 180 + 260);
  // runCommand is declared below and is stable for the current context at invocation time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackTransaction?.id, userId, refreshProfile, showScreenHandoff]);

  const repeatSequence = useMemo(() => {
    const base = routines[0]?.sequence || workflows[0]?.sequence || [];
    const text = normalizeArabic(query);
    if (!base.length || !/بدون/.test(text)) return base;
    const excludeReports = /بدون.*تقرير|بدون.*تقارير/.test(text);
    const excludeIntelligence = /بدون.*ذكاء|بدون.*قرار/.test(text);
    return base.filter((id) => {
      const feature = featureById(id);
      if (!feature) return true;
      if (excludeReports && /تقرير|استعلام/.test(normalizeArabic(`${feature.title} ${feature.group}`))) return false;
      if (excludeIntelligence && /ذكاء|قرار/.test(normalizeArabic(`${feature.title} ${feature.group}`))) return false;
      return true;
    });
  }, [query, routines, workflows]);

  const ruleIntent = useMemo(() => parseStructuredGuideIntent(query), [query]);
  const resolvedIntent = aiIntent?.confidence > ruleIntent.confidence ? aiIntent : ruleIntent;
  const intentFeature = useMemo(() => {
    const feature = featureById(featureIdForGuideIntentGoal(String(resolvedIntent?.goal || "")));
    return feature && canAccessGuideFeature(feature, permissionSession) ? feature : null;
  }, [resolvedIntent?.goal, permissionSession]);

  const specialIntent = useMemo(() => {
    const text = normalizeArabic(query);
    if (!text) return null;
    if (/وين كنت|شنو كنت|كنت اسوي|ماذا كنت|اين توقفت|وين وقفت/.test(text)) {
      const task = profile.currentTask || profile.previousTask || context?.currentTask;
      return task ? { kind: "resume" as const, title: "آخر مهمة كنت تعمل عليها", detail: task.title || "المهمة السابقة" } : { kind: "empty" as const, title: "لا توجد مهمة معلقة", detail: "ابدأ أي مهمة وسأحفظ موضعها وخطوتها التالية تلقائيًا." };
    }
    if (/نفس اللي|نفس الي|مثل امس|مثل أمس|سويته امس|سويته أمس|كرر السابق/.test(text)) {
      const routine = routines[0];
      const workflow = workflows[0];
      const excluded = /بدون/.test(text) && repeatSequence.length < (routine?.sequence.length || workflow?.sequence.length || 0);
      return { kind: "repeat" as const, title: "إعادة المسار السابق بأمان", detail: routine ? `يمكنني تجهيز اختصار «${routine.name}» بعد اختيار النطاق الجديد${excluded ? " مع استبعاد الجزء الذي طلبت حذفه" : ""}.` : workflow ? `يمكنني إعادة فتح الأجزاء الآمنة من مسارك المعتاد بعد اختيار النطاق الجديد${excluded ? " مع استبعاد الجزء الذي طلبت حذفه" : ""}.` : "لم يتكوّن مسار متكرر كافٍ بعد. سأحتفظ بالخطوات المقبلة حتى أتعرف على نمطك." };
    }
    if (/اسرع|اختصر|طريقة اسرع|طريقه اسرع/.test(text) && workflows[0]) {
      return { kind: "faster" as const, title: "طريقة أقصر لمسارك المعتاد", detail: "تعرّفت على تسلسل يتكرر في عملك. يمكنني فتح خطواته الآمنة مباشرةً مع إبقاء القرارات المؤثرة لك." };
    }
    return null;
  }, [query, profile.currentTask, profile.previousTask, context?.currentTask, routines, workflows, repeatSequence]);

  const runCommand = useCallback((command?: GuideCommand) => {
    if (!command) return;
    if (command.scope === "app") {
      if (command.type === "navigate" && command.value) onNavigate(command.value);
      if (command.type === "simulate") {
        try {
          sessionStorage.setItem("schedule-guide-simulation", JSON.stringify({
            task: command.task || "scenario",
            selectedId: Number(context?.selected?.id || 0),
            selectedCourse: String(context?.selected?.course || ""),
            collegeId: Number(context?.collegeId || 0),
            sectionId: Number(context?.sectionId || 0),
            termId: Number(context?.termId || 0),
            query: String(query || "").slice(0,320),
            intent: resolvedIntent,
            createdAt: Date.now(),
          }));
        } catch {}
        onNavigate(command.value || "intelligence");
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: { scope: "intelligence", type: "scene", value: "try", task: command.task } }));
        }, 280);
      }
      return;
    }
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: command }));
  }, [context?.collegeId, context?.sectionId, context?.selected?.course, context?.selected?.id, context?.termId, onNavigate, query, resolvedIntent]);

  useEffect(() => {
    expireGuideJourneys(userId);
    setProfile(loadGuideProfile(userId));
  }, [userId, open]);
  useEffect(() => {
    const text = query.trim();
    const requestId = ++intentRequestRef.current;
    setAiIntent(null);
    setIntentLoading(false);
    if (!text || !needsGuideAIFallback(ruleIntent, text)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (requestId !== intentRequestRef.current) return;
      setIntentLoading(true);
      fetch("/api/guide/intent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: text,
          context: {
            view: activeView,
            currentFeatureId: context?.currentFeatureId || `page.${activeView}`,
            selected: context?.selected ? { id: Number(context.selected.id || 0), course: String(context.selected.course || "") } : null,
            currentTask: context?.currentTask ? { title: String(context.currentTask.title || ""), featureId: String(context.currentTask.featureId || "") } : null,
            currentError: String(context?.lastAction || context?.detectedHelp?.detail || "").slice(0,240),
          },
          allowedFeatureIds: allAllowed.map(feature => feature.id).slice(0,100),
        }),
      })
        .then(response => response.ok ? response.json() : null)
        .then(data => { if (requestId === intentRequestRef.current && data?.intent) setAiIntent(data.intent); })
        .catch(() => undefined)
        .finally(() => { if (requestId === intentRequestRef.current) setIntentLoading(false); });
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, ruleIntent, activeView, context?.currentFeatureId, context?.currentTask?.featureId, context?.currentTask?.title, context?.detectedHelp?.detail, context?.lastAction, context?.selected?.course, context?.selected?.id, allAllowed]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.userId || Number(detail.userId) === userId) refreshProfile();
    };
    window.addEventListener("schedule-smart-guide-profile", refresh as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-profile", refresh as EventListener);
  }, [refreshProfile, userId]);

  useEffect(() => {
    if (!open) return;
    const scan = () => {
      const items = discoverVisibleControls(activeView);
      setDynamic(items);
      const signature = items.map(item => `${item.id}:${item.title}:${item.target || ""}`).join("|");
      if (signature !== discoveredSignatureRef.current) {
        discoveredSignatureRef.current = signature;
        noteDiscoveredControls(userId, activeView, items);
      }
    };
    scan();
    const id = window.setInterval(scan, 2200);
    return () => window.clearInterval(id);
  }, [open, activeView, context, userId]);

  useEffect(() => {
    if (!open || !hint?.featureId) return;
    const feature = featureById(hint.featureId);
    if (!feature || !canAccessGuideFeature(feature, permissionSession)) return;
    setSelectedId(feature.id);
    setSelectedDynamic(null);
    markFeatureSeen(userId, feature.id);
  }, [hint?.featureId, open, permissionSession, userId]);

  useEffect(() => {
    if (!open) {
      setPointMode(false);
      setDrawerHidden(false);
      setAiIntent(null);
      setPendingTourId(null);
      setPendingTourStep(0);
      setSelectedId(null);
      setSelectedDynamic(null);
      setPreview(null);
      setNotice("");
      setSettingsOpen(false);
      setRoutineDraft(null);
      setBrowseMode("forYou");
      setSheetLevel("peek");
      setIconIntro(null);
      setScreenHandoff(null);
      iconActionRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim()) return;
    if (selectedId || selectedDynamic || preview) setSheetLevel("medium");
  }, [open, query, selectedId, selectedDynamic, preview]);

  const cycleSheet = (direction: "up" | "down" | "tap") => {
    setSheetLevel(current => {
      if (direction === "tap") return current === "peek" ? "medium" : current === "medium" ? "full" : "medium";
      if (direction === "up") return current === "peek" ? "medium" : "full";
      return current === "full" ? "medium" : "peek";
    });
  };
  const onSheetPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    sheetDragStartRef.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onSheetPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = sheetDragStartRef.current; sheetDragStartRef.current = null;
    if (start == null) return;
    const delta = event.clientY - start;
    if (Math.abs(delta) < 18) { cycleSheet("tap"); return; }
    cycleSheet(delta < 0 ? "up" : "down");
  };

  useEffect(() => {
    const restore = () => setDrawerHidden(false);
    window.addEventListener("schedule-smart-guide-restore", restore);
    return () => window.removeEventListener("schedule-smart-guide-restore", restore);
  }, []);

  useEffect(() => () => {
    if (handoffTimerRef.current) window.clearTimeout(handoffTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open || !root || !context?.collegeId || !context?.sectionId) {
      setCollectiveFriction([]);
      setCollectiveInsights([]);
      return;
    }
    let alive = true;
    const params = new URLSearchParams({ collegeId: String(context.collegeId), sectionId: String(context.sectionId) });
    fetch(`/api/intelligence/guide-friction?${params.toString()}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (alive) {
          setCollectiveFriction(Array.isArray(data?.items) ? data.items.slice(0, 4) : []);
          setCollectiveInsights(Array.isArray(data?.insights) ? data.insights.slice(0, 4) : []);
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [open, root, context?.collegeId, context?.sectionId]);

  useEffect(() => {
    if (!pointMode) {
      document.body.classList.remove("guide-point-mode");
      return;
    }
    document.body.classList.add("guide-point-mode");
    const click = (event: MouseEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      if (!raw || raw.closest(".smart-guide,.guide-point-banner,.guide-screen-handoff") || raw.closest("[data-guide-ignore]")) return;
      const carrier = raw.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target],[data-guide-stable-id],button,a,[role='button'],select,input");
      if (!carrier) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const owner = carrier.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target]");
      const featureId = carrier.getAttribute("data-guide-feature-id") || owner?.getAttribute("data-guide-feature-id") || "";
      const target = carrier.getAttribute("data-guide-target") || owner?.getAttribute("data-guide-target") || "";
      const knownFeature = featureById(featureId) || featureById(target);
      if (knownFeature && canAccessGuideFeature(knownFeature, permissionSession)) {
        setSelectedId(knownFeature.id);
        setSelectedDynamic(null);
        recordFeatureEvent(userId, knownFeature.id, "helped");
        markFeatureSeen(userId, knownFeature.id);
      } else {
        const title = String(carrier.getAttribute("data-guide-title") || carrier.getAttribute("aria-label") || carrier.getAttribute("title") || carrier.textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 72) || "هذا العنصر";
        const stableKey = carrier.getAttribute("data-guide-stable-id") || "";
        const id = stableDynamicControlId(activeView, {
          title,
          kind:carrier.tagName.toLowerCase(),
          featureId,
          target,
          stableKey,
          name:carrier.getAttribute("name") || carrier.getAttribute("type") || "",
          href:carrier.getAttribute("href") || "",
          role:carrier.getAttribute("role") || "",
        });
        setSelectedDynamic({ id, title, summary: "عنصر حي في الشاشة الحالية.", target: featureId || target || undefined, stableKey:stableKey || undefined, kind: carrier.tagName.toLowerCase() });
        setSelectedId(null);
      }
      carrier.setAttribute("data-guide-hot", "true");
      window.setTimeout(() => carrier.removeAttribute("data-guide-hot"), 2400);
      setPointMode(false);
      setDrawerHidden(false);
      setScreenHandoff(null);
      refreshProfile();
    };
    window.addEventListener("click", click, true);
    return () => {
      document.body.classList.remove("guide-point-mode");
      window.removeEventListener("click", click, true);
    };
  }, [pointMode, userId, activeView, permissionSession, refreshProfile]);
  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const featureId = String(detail.featureId || "");
      const feature = featureById(featureId);
      if (!feature || !canAccessGuideFeature(feature, permissionSession)) return;
      const journey = journeyForFeature(featureId);
      if (detail.signal && journey) advanceGuideJourney(userId, journey.id, String(detail.signal));
      if (detail.ok === true) {
        if (detail.final === false) {
          if (detail.transactionId && detail.rollbackCommand) appendGuideTransactionOperation(userId, String(detail.transactionId), { id:`prepare:${featureId}:${Date.now()}`, featureId, label:String(detail.label || feature.title), rollback:detail.rollbackCommand, verified:true });
        } else {
          const beforeCompletion=loadGuideProfile(userId).mastery[featureId];
          const resolvedAfterHelp=Boolean(beforeCompletion?.lastHelp && Date.now()-Number(beforeCompletion.lastHelp)<10*60*1000);
          recordFeatureEvent(userId, featureId, "completed", { durationMs:Number(detail.durationMs || 0) || undefined, stepCount:Number(detail.stepCount || 0) || undefined, retries:Number(detail.retries || 0) || undefined });
          telemetryGuideJourney({ featureId, version:feature.version, step:String(detail.signal || "journey"), outcome:resolvedAfterHelp ? "resolvedAfterHelp" : "completed" });
          if (journey) completeGuideJourney(userId, journey.id);
          if (detail.transactionId) {
            if (detail.rollbackCommand) appendGuideTransactionOperation(userId, String(detail.transactionId), { id:`rollback:${featureId}:${Date.now()}`, featureId, label:String(detail.label || feature.title), rollback:detail.rollbackCommand, verified:true });
            completeGuideTransaction(userId, String(detail.transactionId));
          }
          setGuideTask(userId, undefined);
        }
      } else if (detail.ok === false) {
        recordFeatureEvent(userId, featureId, "failed");
        telemetryGuideJourney({ featureId, version:feature.version, step:String(detail.signal || "journey"), outcome:"failed" });
        if (journey) failGuideJourney(userId, journey.id, String(detail.signal || "failed"));
        if (detail.transactionId) failGuideTransaction(userId, String(detail.transactionId));
      }
      if (detail.ok === false) setGuideTask(userId, undefined);
      refreshProfile();
    };
    window.addEventListener("schedule-smart-guide-action-result", onResult as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-action-result", onResult as EventListener);
  }, [permissionSession, refreshProfile, userId]);

  const locateStep = useCallback((state: TourState | null) => {
    if (!state) {
      setLocated(null);
      return;
    }
    const step = state.steps[state.index];
    if (!step) {
      setLocated(null);
      return;
    }
    if (step.command) runCommand(step.command);
    let attempts = 0;
    const find = () => {
      const element = targetElement(step);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        element.setAttribute("data-guide-hot", "true");
        setLocated({ rect: element.getBoundingClientRect(), text: step.text, index: state.index, total: state.steps.length });
        return;
      }
      attempts += 1;
      if (attempts < 15) window.setTimeout(find, 110);
      else setNotice("لم أتمكن من تحديد العنصر في الحالة الحالية. يمكنك استخدام «أشر لي» وتحديد العنصر مباشرةً.");
    };
    find();
  }, [runCommand]);

  useEffect(() => {
    document.querySelectorAll("[data-guide-hot='true']").forEach((element) => element.removeAttribute("data-guide-hot"));
    locateStep(tour);
    if (!tour) return;
    const refresh = () => {
      const step = tour.steps[tour.index];
      const element = step ? targetElement(step) : null;
      if (element) setLocated({ rect: element.getBoundingClientRect(), text: step.text, index: tour.index, total: tour.steps.length });
    };
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      document.querySelectorAll("[data-guide-hot='true']").forEach((element) => element.removeAttribute("data-guide-hot"));
    };
  }, [tour, locateStep]);

  const startTour = (feature: GuideFeature) => {
    if (!canAccessGuideFeature(feature, permissionSession)) {
      setNotice("هذه الميزة غير متاحة ضمن صلاحياتك الحالية.");
      setDrawerHidden(false);
      return;
    }
    if (feature.view && feature.view !== activeView) {
      setPendingTourStep(0);
      setPendingTourId(feature.id);
      showScreenHandoff("أنتقل إلى الشاشة المطلوبة", `سأفتح «${feature.title}» ثم أحدد مكانها لك.`);
      setDrawerHidden(true);
      onNavigate(feature.view);
      return;
    }
    let steps = hydrateGuideSteps([...(feature.steps || [])]);
    if (feature.id === "schedule.action.move-room" && context?.selected?.id) {
      const selectedStep: TourStep = {
        selector: `[data-row-id="${Number(context.selected.id)}"]`,
        text: `هذه بطاقة «${context.selected.course || "المقرر المحدد"}». ابدأ السحب منها إلى القاعة المطلوبة.`,
      };
      steps = [steps[0], selectedStep, ...steps.slice(2)].filter(Boolean) as TourStep[];
    }
    if (!steps.length) {
      if (!feature.target) {
        setDrawerHidden(false);
        setNotice(`«${feature.title}» صفحة أو وظيفة عامة لا تملك نقطة واحدة ثابتة على الشاشة. هذا شرحها المختصر: ${feature.summary}`);
        return;
      }
      const element = targetNow(feature.target);
      if (!element) {
        setDrawerHidden(false);
        setNotice(`أعرف وظيفة «${feature.title}»، لكن عنصرها غير ظاهر في الحالة الحالية. غيّر حالة الشاشة أو استخدم «أشر لي» لتحديد العنصر مباشرةً.`);
        return;
      }
      recordFeatureEvent(userId, feature.id, "helped");
      telemetryGuideJourney({ featureId:feature.id, version:feature.version, step:"guide", outcome:"helped" });
      markFeatureSeen(userId, feature.id);
      showScreenHandoff("هذا هو المكان", `سأبرز «${feature.title}» لثوانٍ ثم أعيد المرشد تلقائيًا.`);
      setDrawerHidden(true);
      element.scrollIntoView({ behavior: "smooth", block: "center", inline:"center" });
      element.setAttribute("data-guide-hot", "true");
      window.setTimeout(() => {
        element.removeAttribute("data-guide-hot");
        setDrawerHidden(false);
        setScreenHandoff(null);
      }, 2400);
      refreshProfile();
      return;
    }
    recordFeatureEvent(userId, feature.id, "helped");
    telemetryGuideJourney({ featureId:feature.id, version:feature.version, step:"guide", outcome:"helped" });
    markFeatureSeen(userId, feature.id);
    setGuideTask(userId, {
      id: `tour:${feature.id}`,
      title: `إرشاد حي: ${feature.title}`,
      featureId: feature.id,
      target: feature.target,
      command: feature.safeAction,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      step: 0,
    });
    showScreenHandoff("إرشاد حي على الشاشة", `سأحدد الآن أول خطوة في «${feature.title}».`);
    setDrawerHidden(true);
    setTour({ feature, steps, index: 0 });
    setNotice("");
    refreshProfile();
  };

  useEffect(() => {
    if (!pendingTourId) return;
    const feature = featureById(pendingTourId);
    if (!feature || (feature.view && feature.view !== activeView)) return;
    const resumeAt = pendingTourStep;
    setPendingTourId(null);
    setPendingTourStep(0);
    window.setTimeout(() => {
      let steps = hydrateGuideSteps([...(feature.steps || [])]);
      if (feature.id === "schedule.action.move-room" && context?.selected?.id) {
        const selectedStep: TourStep = { selector: `[data-row-id="${Number(context.selected.id)}"]`, text: `هذه بطاقة «${context.selected.course || "المقرر المحدد"}». ابدأ السحب منها إلى القاعة المطلوبة.` };
        steps = [steps[0], selectedStep, ...steps.slice(2)].filter(Boolean) as TourStep[];
      }
      if (!steps.length) { startTour(feature); return; }
      recordFeatureEvent(userId, feature.id, "helped");
      telemetryGuideJourney({ featureId:feature.id, version:feature.version, step:"guide", outcome:"helped" });
      markFeatureSeen(userId, feature.id);
      showScreenHandoff("أكمل من نفس الخطوة", `عدت إلى «${feature.title}» وسأبرز الخطوة التالية.`);
      setDrawerHidden(true);
      setTour({ feature, steps, index: Math.min(Math.max(0, resumeAt), steps.length - 1) });
      refreshProfile();
    }, 80);
  // startTour intentionally closes over the current screen state; the id is the stable trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTourId, pendingTourStep, activeView, context?.selected?.id, context?.selected?.course, refreshProfile, userId]);

  const stopTour = () => {
    setTour(null);
    setLocated(null);
    setDrawerHidden(false);
    setScreenHandoff(null);
    setGuideTask(userId, undefined);
    refreshProfile();
  };

  const nextTour = () => setTour((current) => {
    if (!current) return null;
    if (current.index >= current.steps.length - 1) {
      setGuideTask(userId, undefined);
      setLocated(null);
      window.setTimeout(() => setDrawerHidden(false), 120);
      refreshProfile();
      return null;
    }
    const next = { ...current, index: current.index + 1 };
    setGuideTask(userId, {
      id: `tour:${current.feature.id}`,
      title: `إرشاد حي: ${current.feature.title}`,
      featureId: current.feature.id,
      target: current.feature.target,
      command: current.feature.safeAction,
      startedAt: profile.currentTask?.startedAt || Date.now(),
      updatedAt: Date.now(),
      step: next.index,
    });
    return next;
  });

  const executeSafe = (feature: GuideFeature) => {
    if (!canAccessGuideFeature(feature, permissionSession)) {
      setNotice("هذه الميزة غير متاحة ضمن صلاحياتك الحالية.");
      return;
    }
    const action = guideActionForFeature(feature.id);
    if (action && !canRunGuideAction(action, permissionSession)) {
      setNotice("هذه العملية غير متاحة ضمن صلاحياتك الحالية.");
      return;
    }
    const needsSelection = new Set(["schedule.action.move-room","schedule.action.change-time","schedule.action.change-instructor","schedule.action.find-room"]).has(feature.id);
    if (needsSelection && !Number(context?.selected?.id || 0)) {
      setPreview(null);
      setDrawerHidden(false);
      setNotice(`قبل «${feature.title}» حدّد مقررًا واحدًا من الجدول. لن أبدأ معاملة أو تغييرًا قبل وجود مقرر محدد.`);
      if (feature.id === "schedule.action.move-room" || feature.id === "schedule.action.find-room") {
        showScreenHandoff("خطوة مطلوبة أولًا", "سأفتح عرض المباني والقاعات فقط؛ حدّد المقرر ثم اطلب المتابعة.");
        setDrawerHidden(true);
        runCommand({ scope:"schedule", type:"changeView", value:"rooms", featureId:"schedule.view.rooms" });
        window.setTimeout(() => setDrawerHidden(false), 1400);
      }
      return;
    }
    recordFeatureEvent(userId, feature.id, "attempt");
    const journey = journeyForFeature(feature.id);
    if (journey) startGuideJourney(userId, journey.id);
    if (feature.view && feature.view !== activeView && !feature.safeAction && !action?.command && !action?.prepare) {
      showScreenHandoff("أفتح الوجهة", `سأنتقل إلى «${feature.title}» دون تنفيذ أي تغيير.`);
      setDrawerHidden(true);
      onNavigate(feature.view);
      setGuideTask(userId, { id:`assist:${feature.id}`, title:`فتح ${feature.title}`, featureId:feature.id, startedAt:Date.now(), updatedAt:Date.now(), journeyId:journey?.id });
      return;
    }
    const command = action?.prepare || action?.command;
    if (!command || isSensitive(feature) || action?.risk === "sensitive") {
      setNotice(isSensitive(feature) ? "هذه العملية حساسة وتحتاج قرارك داخل الشاشة. سأحدد مكانها وأشرح النتيجة، لكنني لن أنفذها نيابةً عنك." : "هذه الميزة إرشادية فقط؛ سأحدد مكانها على الشاشة بدل تنفيذ ضغطات غير موثوقة.");
      startTour(feature);
      return;
    }
    if (action?.risk === "read") {
      recordFeatureEvent(userId, feature.id, "started");
      showScreenHandoff("أجهز الخطوة الآمنة", `سأفتح «${feature.title}» دون تعديل البيانات.`);
      setDrawerHidden(true);
      runCommand({ ...command, featureId: feature.id });
      setGuideTask(userId, { id:`assist:${feature.id}`, title:`مساعدة تنفيذية: ${feature.title}`, featureId:feature.id, target:feature.target, command, startedAt:Date.now(), updatedAt:Date.now(), journeyId:journey?.id });
      return;
    }
    const transactionId = beginGuideTransaction(userId, `مساعدة: ${feature.title}`);
    appendGuideTransactionOperation(userId, transactionId, { id:`prepare:${feature.id}`, featureId:feature.id, label:feature.title, execute:command });
    setPreview({ feature, command:{...command, transactionId, featureId:feature.id}, transactionId });
  };

  const cancelPreview = () => {
    if (preview?.transactionId) failGuideTransaction(userId, preview.transactionId);
    setPreview(null);
    refreshProfile();
  };

  useEffect(() => {
    if (!open) return;
    if (!previousFocusRef.current) previousFocusRef.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const previous=previousFocusRef.current;
      previousFocusRef.current=null;
      window.setTimeout(()=>previous?.focus?.(),0);
    };
  }, [open]);

  useEffect(() => {
    const drawer=drawerRef.current;
    if (!drawer) return;
    const inactive=Boolean(drawerHidden || pointMode || located || preview);
    if (inactive) drawer.setAttribute("inert","");
    else drawer.removeAttribute("inert");
    return () => drawer.removeAttribute("inert");
  }, [drawerHidden, pointMode, located, preview]);

  useEffect(() => {
    if (!open) return;
    const focusSurface = () => {
      if (preview) return document.querySelector<HTMLElement>(".guide-preview");
      if (located) return document.querySelector<HTMLElement>(".guide-ghost-card");
      if (!drawerHidden && !pointMode) return drawerRef.current;
      return null;
    };
    const onKeyDown=(event:KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (preview) { cancelPreview(); return; }
        if (pointMode) { setPointMode(false); setDrawerHidden(false); return; }
        if (tour || located) { stopTour(); return; }
        if (iconIntro) { iconActionRef.current=null; setIconIntro(null); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const surface=focusSurface();
      if (!surface) return;
      const focusables=[...surface.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(element=>element.offsetParent!==null);
      if (!focusables.length) { event.preventDefault(); surface.focus?.(); return; }
      const first=focusables[0], last=focusables[focusables.length-1], active=document.activeElement;
      if (event.shiftKey && (active===first || !surface.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active===last || !surface.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown",onKeyDown,true);
    window.setTimeout(()=>{
      const surface=focusSurface();
      if (!surface) {
        if (drawerHidden && drawerRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur?.();
        return;
      }
      if (!surface.contains(document.activeElement)) {
        const first=surface.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
        (first || surface).focus?.();
      }
    },0);
    return()=>document.removeEventListener("keydown",onKeyDown,true);
  }, [open, preview, pointMode, tour, located, iconIntro, settingsOpen, drawerHidden, onClose]);

  const confirmPreview = () => {
    if (!preview) return;
    recordFeatureEvent(userId, preview.feature.id, "started");
    const journey = journeyForFeature(preview.feature.id);
    showScreenHandoff("سلمتك الخطوة إلى الشاشة", `جهزت «${preview.feature.title}». القرار النهائي والحفظ يبقيان بيدك.`);
    setDrawerHidden(true);
    if (preview.feature.view && preview.feature.view !== activeView) {
      onNavigate(preview.feature.view);
      window.setTimeout(() => runCommand(preview.command), 320);
    } else runCommand(preview.command);
    setGuideTask(userId, {
      id: `assist:${preview.feature.id}`,
      title: `مساعدة تنفيذية: ${preview.feature.title}`,
      featureId: preview.feature.id,
      target: preview.feature.target,
      command: preview.command,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      journeyId: journey?.id,
    });
    setPreview(null);
    refreshProfile();
  };

  const simulateFeature = (feature: GuideFeature) => {
    if (!canAccessGuideFeature(feature, permissionSession)) { setNotice("هذه الميزة غير متاحة ضمن صلاحياتك الحالية."); return; }
    recordFeatureEvent(userId, feature.id, "attempt");
    showScreenHandoff("تجربة آمنة", `سأفتح مساحة تجربة لـ«${feature.title}» دون لمس الجدول الحقيقي.`);
    setDrawerHidden(true);
    if (feature.simulationAction) {
      runCommand({ ...feature.simulationAction, featureId:feature.id });
      setNotice("فتحت مساحة التجربة. لن يلمس هذا الاختبار الجدول الحقيقي حتى تعتمد أنت التغيير لاحقًا.");
      return;
    }
    if (activeView === "schedules") {
      runCommand({ scope: "app", type: "simulate", value: "intelligence", task: feature.id, featureId:feature.id });
      setNotice("سأحوّلك إلى مساحة «جرّب» لاختبار الفكرة دون تعديل الجدول الحقيقي.");
      return;
    }
    setDrawerHidden(false);
    setScreenHandoff(null);
    setNotice("هذه الميزة لا تحتاج محاكاة مستقلة؛ يمكنني عرضها على الشاشة أو تجهيز خطوتها الآمنة.");
  };

  const resumeTask = () => {
    showScreenHandoff("أستعيد آخر موضع", "سأعيدك إلى المهمة السابقة وخطوتها الحالية.");
    setDrawerHidden(true);
    const current = profile.currentTask;
    const currentGeneric = Boolean(current?.id?.startsWith("work:page:") || current?.id === "work:schedule" || current?.id === "work:intelligence");
    const task = currentGeneric && profile.previousTask ? profile.previousTask : (current || profile.previousTask || context?.currentTask);
    if (!task) {
      setDrawerHidden(false);
      setNotice("لا توجد مهمة معلقة حاليًا.");
      return;
    }
    if (task.featureId) {
      const feature = featureById(task.featureId);
      if (feature?.steps?.length) {
        const resumeAt = Math.min(Math.max(0, Number(task.step || 0)), feature.steps.length - 1);
        if (feature.view && feature.view !== activeView) {
          setPendingTourStep(resumeAt);
          setPendingTourId(feature.id);
          onNavigate(feature.view);
          return;
        }
        setTour({ feature, steps: hydrateGuideSteps(feature.steps), index: resumeAt });
        setNotice(`أعدتك إلى الخطوة ${resumeAt + 1} من «${feature.title}».`);
        return;
      }
    }
    if (task.command) runCommand(task.command);
    if (task.target) {
      const element = targetNow(task.target);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.setAttribute("data-guide-hot", "true");
      window.setTimeout(() => element?.removeAttribute("data-guide-hot"), 2400);
    }
    setNotice(`أعدتك إلى «${task.title || "المهمة السابقة"}».`);
  };

  const replayWorkflow = (sequence: string[]) => {
    showScreenHandoff("أفتح مسارك المعتاد", "سأنفذ خطوات القراءة والفتح الآمنة فقط، وأترك القرارات المؤثرة لك.");
    setDrawerHidden(true);
    const commands = sequence
      .map(featureById)
      .filter((feature): feature is GuideFeature => Boolean(feature && canAccessGuideFeature(feature, permissionSession)))
      .map(feature => ({ feature, action:guideActionForFeature(feature.id) }))
      .filter(item => Boolean(item.action && canRunGuideAction(item.action!, permissionSession) && item.action!.risk === "read" && item.action!.command))
      .map(item => ({ ...item.action!.command!, featureId:item.feature.id }));
    if (!commands.length) {
      setDrawerHidden(false);
      setScreenHandoff(null);
      setNotice("تعرّفت على هذا المسار كعادة لديك، لكن خطواته الحالية تحتاج قراراتك داخل الشاشة. سأستخدمه لترتيب الاقتراحات بدل تنفيذ ضغطات غير موثوقة.");
      return;
    }
    let delay = 0;
    commands.forEach((command) => {
      window.setTimeout(() => runCommand(command), delay);
      delay += 300;
    });
    setNotice("فتحت الأجزاء الآمنة فقط من مسارك المعتاد. لم يتم تنفيذ أي تغيير على البيانات.");
  };

  useEffect(() => {
    const normalized = normalizeArabic(query);
    if (!/ما فهمت|مو واضح|غير واضح|وضح اكثر|وضح أكثر|ورني|ارني/.test(normalized)) return;
    const feature = selected || featureById(context?.currentTask?.featureId || "") || pageFeature;
    if (!feature) return;
    const key = `${feature.id}:${normalized}`;
    if (lastEscalationRef.current === key) return;
    lastEscalationRef.current = key;
    setSelectedId(feature.id);
    setNotice("سأحوّل الشرح إلى إرشاد حي على الشاشة بدل تكرار النص نفسه.");
    window.setTimeout(() => startTour(feature), 120);
  // startTour intentionally uses the freshest visible context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const results = useMemo<SearchRow[]>(() => {
    if (!query.trim()) return [];
    const knownRows: SearchRow[] = allAllowed.map((feature) => ({ kind: "known", feature, score: queryScore(query, feature) }));
    const dynamicRows: SearchRow[] = dynamic
      .filter(feature => !featureById(feature.id) && !(feature.target && featureById(feature.target)))
      .map((feature) => ({ kind: "dynamic", feature, score: queryScore(query, { ...feature, keywords: [] }) }));
    const routineRows: SearchRow[] = routines.map((routine) => ({
      kind: "routine",
      feature: { id: routine.id, name: routine.name, sequence: routine.sequence },
      score: queryScore(query, { title: routine.name, summary: "اختصار لمسار عمل محفوظ", keywords: ["اختصار", "مسار", "روتين", "افتح"] }),
    }));
    const rows: SearchRow[] = [...knownRows, ...dynamicRows, ...routineRows];
    const normalized = normalizeArabic(query);
    if (/اسرع|اختصر|روتين|طريقتي/.test(normalized) && workflows[0]) {
      rows.push({ kind: "routine", feature: { id: "suggested-fast", name: "طريقة أسرع لمسارك المعتاد", sequence: workflows[0].sequence }, score: 30 });
    }
    if (/ما فهمت|مو واضح|غير واضح|وضح|ورني|ارني/.test(normalized)) {
      const helpFeature = selected || featureById(context?.currentTask?.featureId || "") || pageFeature;
      if (helpFeature) rows.push({ kind: "known", feature: helpFeature, score: 35 });
    }
    const deduped = new Map<string,SearchRow>();
    rows.filter((row) => row.score > 0).sort((a,b) => b.score-a.score).forEach(row => {
      if (row.kind === "known" && intentFeature && row.feature.id === intentFeature.id && resolvedIntent?.goal !== "unknown") return;
      const key=searchRowKey(row);
      const previous=deduped.get(key);
      if (!previous || row.score > previous.score) deduped.set(key,row);
    });
    return [...deduped.values()].sort((a,b)=>b.score-a.score).slice(0,12);
  }, [query, dynamic, allAllowed, routines, workflows, selected, context?.currentTask?.featureId, pageFeature, intentFeature, resolvedIntent?.goal]);

  const chooseKnown = (feature: GuideFeature) => {
    if (!canAccessGuideFeature(feature, permissionSession)) { setNotice("هذه الميزة غير متاحة ضمن صلاحياتك الحالية."); return; }
    setSelectedId(feature.id);
    setSelectedDynamic(null);
    markFeatureSeen(userId, feature.id);
    refreshProfile();
  };

  const chooseDynamic = (feature: DynamicGuideFeature) => {
    setSelectedDynamic(feature);
    setSelectedId(null);
    recordFeatureEvent(userId, feature.id, "helped");
    refreshProfile();
  };

  const runRoutine = (routine: { id: string; sequence: string[]; name: string }) => {
    replayWorkflow(routine.sequence);
    touchGuideRoutine(userId, routine.id);
    setNotice(`تم فتح الأجزاء الآمنة من اختصار «${routine.name}».`);
    refreshProfile();
  };

  const saveRoutineDraft = () => {
    if (!routineDraft) return;
    saveGuideRoutine(userId, routineDraft.name, routineDraft.sequence);
    setRoutineDraft(null);
    setNotice("تم حفظ المسار كاختصار شخصي. يمكنك تشغيله لاحقًا باسمه من المرشد.");
    refreshProfile();
  };

  const runIconAction = (key:string, title:string, summary:string, action:()=>void) => {
    const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px) and (pointer: coarse)").matches;
    if (mobile && !profile.iconHints?.[key]) {
      markGuideIconHintSeen(userId, key);
      refreshProfile();
      iconActionRef.current={key,action};
      setIconIntro({ key, title, summary });
      setNotice("");
      return;
    }
    iconActionRef.current=null;
    setIconIntro(null);
    action();
  };

  const startIntroducedIconAction = () => {
    const pending=iconActionRef.current;
    if (!pending || pending.key !== iconIntro?.key) { setIconIntro(null); return; }
    iconActionRef.current=null;
    setIconIntro(null);
    pending.action();
  };

  const onboardingChoose = (kind: "build" | "review" | "reports") => {
    showScreenHandoff("أفتح وجهتك", kind === "build" ? "سأفتح مساحة بناء الجدول." : kind === "review" ? "سأفتح الجدول ثم أجهز المراجعة." : "سأفتح التقرير المتاح ضمن صلاحياتك.");
    setDrawerHidden(true);
    setOnboardingDone(userId, true);
    refreshProfile();
    if (kind === "build") onNavigate("schedules");
    else if (kind === "review") {
      onNavigate("schedules");
      window.setTimeout(() => runCommand({ scope: "schedule", type: "openReview" }), 260);
    } else {
      const next = permissions.includes(14) ? "reportDepartment" : permissions.includes(8) ? "reportInstructor" : permissions.includes(9) ? "reportRoom" : "dashboard";
      onNavigate(next);
    }
  };

  const handleSearchChange = (value:string) => {
    if (!query.trim() && value.trim()) preSearchSheetRef.current=sheetLevel;
    if (value.trim()) setSheetLevel("full");
    setQuery(value);
  };

  const clearSearch = () => {
    setQuery("");
    setAiIntent(null);
    setIntentLoading(false);
    intentRequestRef.current+=1;
    setSheetLevel(selectedId || selectedDynamic || preview ? "medium" : preSearchSheetRef.current);
  };

  const markAllNewSeen = () => {
    markAllGuideProductUpdatesSeen(userId, allAllowed);
    markAllDiscoveredSeen(userId, activeView);
    refreshProfile();
    setNotice("اعتبرت تحديثات المنتج والعناصر الجديدة في هذه الشاشة مقروءة.");
  };

  const showDynamicOnScreen = (feature:DynamicGuideFeature) => {
    if (!feature.target) {
      setDrawerHidden(false);
      setNotice("اكتشفت هذا العنصر تلقائيًا، لكنه لا يملك هدفًا ثابتًا بعد. استخدم «أشر لي» وسأبقى معه بصريًا دون تنفيذ الضغط.");
      return;
    }
    const element=targetNow(feature.target);
    if (!element) {
      setDrawerHidden(false);
      setNotice("العنصر معروف، لكنه غير ظاهر في حالة الشاشة الحالية. افتح الجزء الذي يحتويه أو استخدم «أشر لي».");
      return;
    }
    showScreenHandoff("هذا هو العنصر", `سأبرز «${feature.title}» ثم أعيد المرشد تلقائيًا.`);
    setDrawerHidden(true);
    element.scrollIntoView({ behavior:"smooth", block:"center", inline:"center" });
    element.setAttribute("data-guide-hot","true");
    window.setTimeout(()=>{element.removeAttribute("data-guide-hot");setDrawerHidden(false);setScreenHandoff(null);},2400);
  };

  const pageTitle = context?.view === activeView ? (context?.title || pageFeature?.title || "هذه الشاشة") : (pageFeature?.title || "هذه الشاشة");
  const what = context?.view === activeView
    ? (context?.whatHappens || context?.summary || pageFeature?.summary || "أقرأ الشاشة الحالية وأقترح أقل قدر من المساعدة اللازمة.")
    : (pageFeature?.summary || "أقرأ الشاشة الحالية وأقترح أقل قدر من المساعدة اللازمة.");

  if (!open) return null;

  return (
    <>
      {!drawerHidden && !pointMode && !located && !preview ? (
        <div className="smart-guide-outside-dismiss no-print" role="presentation" onPointerDown={onClose} />
      ) : null}
      <aside className={`smart-guide no-print level-${sheetLevel} ${drawerHidden ? "is-screen-action" : ""}`} ref={drawerRef} role="dialog" aria-label="مرشد SCHEDULE" aria-modal={!drawerHidden && !pointMode && !located && !preview} aria-hidden={drawerHidden || pointMode || located || preview ? true : undefined} tabIndex={-1} dir="rtl">
        <button type="button" className="smart-guide-sheet-handle" aria-label="تغيير ارتفاع المرشد" onPointerDown={onSheetPointerDown} onPointerUp={onSheetPointerUp}><i /></button>
        <header className="smart-guide-hero">
          <div>
            <span className="smart-guide-kicker"><Bot aria-hidden="true" /> مرشد SCHEDULE <i aria-hidden="true">·</i> <b>{pageTitle}</b></span>
            <h2>كيف؟</h2>
            <p>{isExpert ? "أنت متمكن هنا؛ سأبقى هادئًا ما لم تخرج العملية عن نمطك المعتاد." : what}</p>
          </div>
          <div className="smart-guide-hero-tools">
            <button type="button" onClick={() => runIconAction("point", "أشر لي", "اضغط أي عنصر في الشاشة وسأشرح وظيفته دون تنفيذ الضغط.", () => { showScreenHandoff("وضع أشر لي", "سأخفي المرشد وأنتظر اختيارك؛ الضغط لن يُنفذ العنصر."); setDrawerHidden(true); setPointMode(true); })} aria-label="أشر لي" title="أشر لي"><Target /></button>
            <button type="button" onClick={() => runIconAction("now", "ماذا يحدث الآن؟", "ألخص حالة الشاشة الحالية وما يستحق الانتباه دون تغيير أي بيانات.", () => { setSelectedId(null); setSelectedDynamic(null); setNotice(what); })} aria-label="ماذا يحدث الآن؟" title="ماذا يحدث الآن؟"><BrainCircuit /></button>
            <button type="button" onClick={() => runIconAction("resume", "أكمل من حيث توقفت", "أعيدك إلى آخر مهمة وخطوتها الحالية، ثم أترك القرار لك.", resumeTask)} aria-label="أكمل من حيث توقفت" title="أكمل من حيث توقفت"><History /></button>
            <button type="button" className="smart-guide-close" onClick={onClose} aria-label="إغلاق"><X aria-hidden="true" /></button>
          </div>
        </header>

        {iconIntro ? (
          <section className="smart-guide-icon-intro" role="status" aria-live="polite">
            <Lightbulb aria-hidden="true" />
            <div><strong>{iconIntro.title}</strong><small>{iconIntro.summary}</small></div>
            <div className="smart-guide-icon-intro-actions"><button type="button" className="primary" onClick={startIntroducedIconAction}><Play />ابدأ</button><button type="button" onClick={() => { iconActionRef.current=null; setIconIntro(null); }} aria-label="إخفاء التعريف"><X /></button></div>
          </section>
        ) : null}

        <section className="smart-guide-location">
          <span><CircleDot aria-hidden="true" /></span>
          <div>
            <small>أنت هنا الآن</small>
            <strong>{pageTitle}</strong>
            <p>{context?.view === activeView ? (context?.scopeLabel || context?.placeLabel || "أعرف سياق الشاشة الحالية") : "أعرف سياق الشاشة الحالية"}</p>
          </div>
          <i className={isExpert ? "expert" : "learning"}>{isExpert ? "متمكن" : "يتعلم نمطك"}</i>
        </section>

        {(profile.currentTask || profile.previousTask) ? (() => {
          const current = profile.currentTask;
          const task = current?.id?.startsWith("work:page:") && profile.previousTask ? profile.previousTask : (current || profile.previousTask);
          if (!task || Date.now() - Number(task.updatedAt || 0) > 24 * 60 * 60 * 1000) return null;
          return <button type="button" className="smart-guide-pending-task" onClick={resumeTask}><History /><span><small>مهمة معلقة</small><strong>{task.title}</strong></span><ChevronLeft /></button>;
        })() : null}

        {!profile.onboardingDone && !isExpert ? (
          <details className="smart-guide-onboarding">
            <summary><Compass aria-hidden="true" /><span>ابدأ حسب هدفك</span><ChevronLeft aria-hidden="true" /></summary>
            <div>
              <button type="button" onClick={() => onboardingChoose("build")}><CalendarDays /><span><strong>بناء جدول</strong></span></button>
              <button type="button" onClick={() => onboardingChoose("review")}><ShieldCheck /><span><strong>مراجعة جدول</strong></span></button>
              <button type="button" onClick={() => onboardingChoose("reports")}><BarChart3 /><span><strong>بحث وتقارير</strong></span></button>
            </div>
          </details>
        ) : null}

        <label className="smart-guide-search" role="search">
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => handleSearchChange(event.target.value)} placeholder="اسأل بطريقتك… مثل: شلون أنقل المادة؟" aria-label="اسأل المرشد" />
          {query ? <button type="button" onClick={clearSearch} aria-label="مسح السؤال">×</button> : null}
        </label>

        {hint ? (
          <section className={`smart-guide-hint ${hint.level === "strong" ? "strong" : ""}`}>
            <Sparkles aria-hidden="true" />
            <span><strong>{hint.title}</strong><small>{hint.detail}</small></span>
            <div><button type="button" onClick={() => { onDismissHint(); refreshProfile(); }}>حسنًا</button>{hint.key ? <button type="button" onClick={() => { silenceHint(userId, hint.key!); onDismissHint(); refreshProfile(); }}>لا تقترح هذا مجددًا</button> : null}</div>
          </section>
        ) : null}

        <nav className="smart-guide-browse" aria-label="أقسام المرشد">
          <button className={browseMode === "forYou" ? "active" : ""} type="button" onClick={() => setBrowseMode("forYou")}><Target /><span>لك</span></button>
          <button className={browseMode === "here" ? "active" : ""} type="button" onClick={() => setBrowseMode("here")}><LayoutDashboard /><span>هنا</span></button>
          <button className={browseMode === "new" ? "active" : ""} type="button" onClick={() => setBrowseMode("new")}><Sparkles /><span>الجديد</span>{unreadSummary.total ? <i dir="ltr">{formatBadgeCount(unreadSummary.total,99)}</i> : null}</button>
          <button className={browseMode === "all" ? "active" : ""} type="button" onClick={() => setBrowseMode("all")}><Compass /><span>الكل</span></button>
        </nav>

        {context?.view === activeView && context?.selected ? (
          <section className="smart-guide-selected-context">
            <div className="smart-guide-selected-visual"><MapPin /><i /><b /></div>
            <div><small>العنصر المحدد</small><strong>{context.selected.course}</strong><span>{[context.selected.room, context.selected.start].filter(Boolean).join(" · ")}</span></div>
            <div className="smart-guide-selected-actions">
              <button type="button" onClick={() => chooseKnown(featureById("schedule.action.move-room")!)}>تغيير القاعة</button>
              <button type="button" onClick={() => { showScreenHandoff("أفتح محرر المقرر","سأفتح المقرر المحدد لتغيير الوقت؛ لن أحفظ نيابةً عنك."); setDrawerHidden(true); runCommand({ scope: "schedule", type: "openEditRow", value: String(context.selected.id) }); }}>تغيير الوقت</button>
              <button type="button" onClick={() => { showScreenHandoff("أحدد المقرر على الشاشة", context.selected.conflict ? "سأبرز مكان التعارض الحالي." : "سأبرز بطاقة المقرر على الجدول."); setDrawerHidden(true); runCommand({ scope: "schedule", type: "focusRow", value: String(context.selected.id) }); }}>{context.selected.conflict ? "أرني التعارض" : "أرني على الجدول"}</button>
              <button type="button" onClick={() => { showScreenHandoff("أبحث عن بديل","سأفتح البدائل للمقرر المحدد دون اعتماد تغيير."); setDrawerHidden(true); runCommand({ scope: "schedule", type: "findAlternative", value: String(context.selected.id) }); }}>ابحث عن بديل</button>
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="smart-guide-notice"><Lightbulb /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="إغلاق"><X /></button></div>
        ) : null}

        {query.trim() ? (
          <section className="smart-guide-results">
            <div className="smart-guide-section-head"><div><small>فهمت سؤالك</small><strong>{specialIntent || results.length ? "الأقرب إلى مقصدك" : "لم أجد تطابقًا مباشرًا"}</strong></div></div>
            {intentLoading ? <div className="smart-guide-intent-status"><Sparkles /><span>أفهم القيود التي ذكرتها…</span></div> : null}
            {!specialIntent && resolvedIntent?.clarification ? <div className="smart-guide-clarification" role="status"><Lightbulb /><span>{resolvedIntent.clarification}</span>{intentFeature ? <button type="button" onClick={() => chooseKnown(intentFeature)}>اعرض الأقرب</button> : null}</div> : null}
            {!specialIntent && resolvedIntent?.goal !== "unknown" && intentFeature ? (
              <article className="smart-guide-intent-card">
                <span><BrainCircuit /></span>
                <div>
                  <small>{resolvedIntent.source === "ai" ? "فهم مركب" : "فهم مباشر"}</small>
                  <strong>{intentFeature.title}</strong>
                  <em>{[
                    resolvedIntent.entities?.day ? ({fsunday:"الأحد",fmonday:"الاثنين",ftuesday:"الثلاثاء",fwednesday:"الأربعاء",fthursday:"الخميس"} as Record<string,string>)[resolvedIntent.entities.day] : "",
                    resolvedIntent.entities?.time || "",
                    resolvedIntent.constraints?.keepInstructor ? "مع إبقاء الأستاذ الحالي" : "",
                    resolvedIntent.constraints?.findAlternativeRoom ? "وابحث عن قاعة بديلة عند الحاجة" : "",
                  ].filter(Boolean).join(" · ")}</em>
                </div>
                {Number(resolvedIntent.confidence || 0) < .62 ? <button type="button" onClick={() => chooseKnown(intentFeature)}>هل هذا ما تقصده؟</button> : resolvedIntent.requestedAction === "simulate" ? <button type="button" onClick={() => simulateFeature(intentFeature)}>جرّب بأمان</button> : <button type="button" onClick={() => chooseKnown(intentFeature)}>متابعة</button>}
              </article>
            ) : null}
            {specialIntent ? <article className="smart-guide-special-answer"><span><History /></span><div><strong>{specialIntent.title}</strong><small>{specialIntent.detail}</small></div>{specialIntent.kind === "resume" ? <button type="button" onClick={resumeTask}>أكمل</button> : specialIntent.kind === "repeat" ? <button type="button" onClick={() => repeatSequence.length ? replayWorkflow(repeatSequence) : routines[0] ? runRoutine(routines[0]) : workflows[0] ? replayWorkflow(workflows[0].sequence) : setBrowseMode("forYou")}>جهّز المسار</button> : specialIntent.kind === "faster" ? <button type="button" onClick={() => replayWorkflow(workflows[0].sequence)}>افتح الأقصر</button> : null}</article> : null}
            {results.map((row) => {
              if (row.kind === "known") return <button key={row.feature.id} type="button" onClick={() => chooseKnown(row.feature)}><span><Sparkles /></span><div><strong>{row.feature.title}</strong><small>{row.feature.summary}</small></div></button>;
              if (row.kind === "dynamic") return <button key={row.feature.id} type="button" onClick={() => chooseDynamic(row.feature)}><span><MousePointer2 /></span><div><strong>{row.feature.title}</strong><small>{row.feature.summary}</small></div></button>;
              return <button key={row.feature.id} type="button" onClick={() => runRoutine(row.feature)}><span><Zap /></span><div><strong>{row.feature.name}</strong><small>اختصار شخصي لمسار عملك</small></div></button>;
            })}
            {!results.length && !specialIntent ? <p>صِف ما تريد إنجازه بدل اسم الزر، أو استخدم «أشر لي» وحدد العنصر مباشرةً.</p> : null}
          </section>
        ) : null}

        {selected ? (
          <section className="smart-guide-focus-card">
            <header><span><Sparkles /></span><div><small>{selectedReason === "UI_CHANGED" ? "تغيّرت هذه الوظيفة منذ آخر استخدام لك. سأحدد موضعها الحالي." : selectedReason === "FORGOTTEN" ? "استخدمت هذه الوظيفة سابقًا. هذا تذكير سريع." : selectedExpert ? "إجابة مختصرة لأنك تتقنها" : selectedRecentlyHelped ? "سبق أن شرحتها لك؛ سأختصر هذه المرة" : selected.group}</small><strong>{selected.title}</strong><p>{selected.summary}</p></div></header>
            {!selectedConcise ? <div className="smart-guide-infographic" aria-hidden="true"><span><Eye /></span><i /><span><MousePointer2 /></span><i /><span><Check /></span></div> : null}
            {!selectedConcise && selected.steps?.length ? <ol className="smart-guide-steps">{selected.steps.slice(0, 4).map((step, index) => <li key={index}><b>{String(index + 1).padStart(2, "0")}</b><span>{step.text}</span></li>)}</ol> : null}
            {selectedConcise ? <div className="smart-guide-actions expert"><button type="button" onClick={() => executeSafe(selected)}><Zap />افتح مباشرةً</button><button type="button" onClick={() => startTour(selected)}><Eye />أرني المكان</button></div> : <div className="smart-guide-actions"><button type="button" onClick={() => startTour(selected)}><Eye />أرني على شاشتي</button><button type="button" onClick={() => executeSafe(selected)}><WandSparkles />أكمل عني</button><button type="button" onClick={() => simulateFeature(selected)}><ShieldCheck />جرّب دون تغيير</button></div>}
            <button className="smart-guide-back-link" type="button" onClick={() => setSelectedId(null)}><ArrowLeft />العودة</button>
          </section>
        ) : null}

        {selectedDynamic ? (
          <section className="smart-guide-focus-card">
            <header><span><MousePointer2 /></span><div><small>عنصر حي</small><strong>{selectedDynamic.title}</strong><p>{explainDynamic(selectedDynamic)}</p></div></header>
            <div className="smart-guide-actions one"><button type="button" onClick={() => showDynamicOnScreen(selectedDynamic)}><Eye />أرني مكانه</button></div>
            <button className="smart-guide-back-link" type="button" onClick={() => setSelectedDynamic(null)}><ArrowLeft />العودة</button>
          </section>
        ) : null}

        {!query.trim() && !selected && !selectedDynamic ? (
          <>
            {browseMode === "forYou" ? (
              <>
                {predictedFeature ? <div className="smart-guide-next-wrap"><button type="button" className="smart-guide-next" onClick={() => chooseKnown(predictedFeature)}><Zap /><span><small>غالبًا خطوتك التالية</small><strong>{predictedFeature.title}</strong></span><ChevronLeft /></button><button type="button" className="smart-guide-next-why" onClick={() => setNotice("أقترح هذه الخطوة لأنها تأتي غالبًا بعد ما تفعله الآن ضمن نمط عملك المعتاد. إذا تغيّر نمطك فسيتغير الاقتراح تلقائيًا.")}>لماذا هذا الاقتراح؟</button></div> : null}
                {routines.length ? <><section className="smart-guide-section-head"><div><small>اختصاراتك</small><strong>مسارات حفظتها بطريقتك</strong></div></section><div className="smart-guide-routines">{routines.slice(0,5).map(routine => <article key={routine.id}><span><Zap /></span><div><strong>{routine.name}</strong><small>{routine.sequence.length} خطوات آمنة</small></div><button type="button" onClick={() => runRoutine(routine)}><Play />تشغيل</button><button type="button" className="danger" onClick={() => { removeGuideRoutine(userId,routine.id); refreshProfile(); }} aria-label={`حذف اختصار ${routine.name}`}><Trash2 /></button></article>)}</div></> : null}
                {workflows.length ? <><section className="smart-guide-section-head"><div><small>تعلّمت نمطك</small><strong>مسارات معتادة</strong></div></section><div className="smart-guide-workflows">{workflows.map((workflow,index) => <article key={index}><div><strong>{workflow.sequence.map(id => featureById(id)?.title || id.replace(/^page\./,"")).slice(-4).join(" ← ")}</strong><small>تكرر {workflow.count.toLocaleString("ar-KW-u-nu-latn")} مرات؛ لذلك لا أعتبره تعثرًا.</small></div><div><button type="button" onClick={() => replayWorkflow(workflow.sequence)}><Play />فتح المسار</button><button type="button" onClick={() => setRoutineDraft({sequence:workflow.sequence,name:"مساري المعتاد"})}><Plus />حفظ كاختصار</button></div></article>)}</div></> : null}
                {!routines.length && !workflows.length ? <><section className="smart-guide-section-head"><div><small>مخصص لك</small><strong>أتعلم طريقتك تدريجيًا</strong></div></section><div className="smart-guide-live-controls"><p>كلما استخدمت SCHEDULE أكثر، سأتعرف على المسارات التي تتقنها وأتوقف عن مقاطعتك فيها.</p></div></> : null}
              </>
            ) : null}

            {browseMode === "here" ? (
              <>
                <section className="smart-guide-section-head"><div><small>هذه الشاشة</small><strong>الأدوات المتاحة الآن</strong></div></section>
                <div className="smart-guide-feature-grid">{known.filter(feature => !feature.id.startsWith("page.")).map(feature => <button key={feature.id} type="button" onClick={() => chooseKnown(feature)}><span><Sparkles /></span><div><strong>{feature.title}</strong><small>{feature.summary}</small></div>{masteryScore(profile,feature)>=.72?<i>متقن</i>:null}</button>)}</div>
                <section className="smart-guide-section-head"><div><small>اكتشاف حي</small><strong>عناصر ظهرت في الشاشة</strong></div></section>
                <div className="smart-guide-live-controls">{dynamic.filter(item => !item.target || !featureById(item.target)).map(item => <button type="button" key={item.id} onClick={() => chooseDynamic(item)}><MousePointer2 /><span><strong>{item.title}</strong><small>اكتشفها المرشد تلقائيًا</small></span></button>)}{!dynamic.filter(item => !item.target || !featureById(item.target)).length?<p>كل العناصر الظاهرة حاليًا معرّفة داخل المرشد.</p>:null}</div>
              </>
            ) : null}

            {browseMode === "new" ? (
              <>
                <section className="smart-guide-section-head smart-guide-new-head"><div><small>ما الجديد لك</small><strong>{unreadSummary.total ? "تحديثات واضحة ومفصولة حسب مصدرها" : "أنت مطّلع على التحديثات المتاحة"}</strong></div>{unreadSummary.total ? <button type="button" className="smart-guide-mark-all" onClick={markAllNewSeen}>اعتبر الكل مقروءًا</button> : null}</section>
                <div className="smart-guide-new-summary" aria-label="نطاق عداد الجديد">
                  <article><Sparkles /><span><strong>{unreadSummary.product.length.toLocaleString("ar-KW-u-nu-latn")}</strong><small>تحديثات المنتج ضمن صلاحياتك</small></span></article>
                  <article><MousePointer2 /><span><strong>{unreadSummary.runtime.length.toLocaleString("ar-KW-u-nu-latn")}</strong><small>عناصر جديدة في هذه الشاشة فقط</small></span></article>
                </div>
                {allChanged.length ? <><section className="smart-guide-new-scope"><strong>تحديثات المنتج</strong><small>ميزات مسجلة تغيّر إصدارها أو أضيفت منذ آخر قراءة لك.</small></section><div className="smart-guide-new-grid">{allChanged.map(feature => <button type="button" key={feature.id} onClick={() => chooseKnown(feature)}><Sparkles /><span><strong>{feature.title}</strong><small>{profile.mastery[feature.id]?.versionSeen ? "تغيّرت منذ آخر استخدام لك" : "تحديث منتج لم تقرأه بعد"}</small></span></button>)}</div></> : null}
                {discoveredChanged.length ? <><section className="smart-guide-new-scope"><strong>جديد في {pageTitle}</strong><small>عناصر واجهة اكتشفها المرشد في هذه الشاشة بعد خط الأساس الأول.</small></section><div className="smart-guide-new-grid">{discoveredChanged.map(item => <button type="button" key={item.id} onClick={() => { markDiscoveredSeen(userId,item.id); refreshProfile(); const live=dynamic.find(value=>value.id===item.id); if(live) chooseDynamic(live); else setNotice(`ظهر «${item.title}» مؤخرًا هنا. سأحدده لك عندما يعود للظهور.`); }}><MousePointer2 /><span><strong>{item.title}</strong><small>عنصر واجهة جديد في هذه الشاشة</small></span></button>)}</div></> : null}
              </>
            ) : null}

            {browseMode === "all" ? (
              <>
                <section className="smart-guide-section-head"><div><small>كل الميزات</small><strong>ضمن صلاحياتك فقط</strong></div></section>
                <div className="smart-guide-feature-grid">
                  {allAllowed.map(feature => <button key={feature.id} type="button" onClick={() => chooseKnown(feature)}><span><Sparkles /></span><div><strong>{feature.title}</strong><small>{feature.group}</small></div>{masteryScore(profile,feature)>=.72?<i>متقن</i>:null}</button>)}
                  {dynamic.filter(item => !featureById(item.id)).map(item => <button key={item.id} type="button" onClick={() => chooseDynamic(item)}><span><MousePointer2 /></span><div><strong>{item.title}</strong><small>مكتشفة تلقائيًا</small></div></button>)}
                </div>
              </>
            ) : null}

            {routineDraft ? <section className="smart-guide-routine-editor"><Zap /><div><small>اسم الاختصار</small><input value={routineDraft.name} onChange={event => setRoutineDraft({...routineDraft,name:event.target.value})} maxLength={48}/></div><button type="button" onClick={saveRoutineDraft}>حفظ</button><button type="button" onClick={() => setRoutineDraft(null)}>إلغاء</button></section> : null}

            {root && collectiveFriction.length && browseMode === "forYou" ? <><section className="smart-guide-section-head"><div><small>تحسين المنتج</small><strong>أكثر نقاط التعثر جماعيًا</strong></div></section><div className="smart-guide-friction">{collectiveFriction.map((item,index) => <article key={`${item.name}-${index}`}><Gauge /><span><strong>{item.name}</strong><small>{item.count.toLocaleString("ar-KW-u-nu-latn")} إشارة مجهولة الهوية</small></span><i style={{"--guide-friction":`${Math.min(100,item.count*8)}%`} as React.CSSProperties}/></article>)}</div></> : null}
            {root && collectiveInsights.length && browseMode === "forYou" ? <><section className="smart-guide-section-head"><div><small>مؤشر تجربة المنتج</small><strong>أماكن قد تحتاج تحسينًا في الواجهة</strong></div></section><div className="smart-guide-friction product-insights">{collectiveInsights.map((item,index) => { const feature=featureById(item.featureId); const change=Math.round(Number(item.changeVsPrevious||0)*100); return <article key={`${item.featureId}-${item.step}-${index}`}><Gauge /><span><strong>{feature?.title || item.featureId}</strong><small>{`فشل ${Math.round(item.failureRate*100)}٪ · نجاح بعد المساعدة ${Math.round(Number(item.helpToSuccessRate||0)*100)}٪${change ? ` · ${change>0?"↑":"↓"}${Math.abs(change)}٪ عن السابق` : ""}`}</small></span><i style={{"--guide-friction":`${Math.min(100,Math.round((item.failureRate+item.abandonRate)*100))}%`} as React.CSSProperties}/></article>; })}</div></> : null}
          </>
        ) : null}

        {rollbackTransaction ? <button type="button" className="smart-guide-transaction-undo" onClick={undoGuideTransaction}><History /><span><small>آخر عملية نفذها المرشد</small><strong>{rollbackTransaction.title}</strong></span><b>تراجع</b></button> : null}

        <footer className="smart-guide-footer">
          <button type="button" onClick={() => setSettingsOpen((value) => !value)}><Settings2 />المساعدة الاستباقية</button>
          <small>{profile.hintMode === "off" ? "متوقفة" : profile.hintMode === "quiet" ? "قليلة" : "تلقائية"}</small>
          <em>التعلّم عن نمط استخدامك محفوظ على هذا الجهاز. وعند الحاجة فقط لفهم سؤال مركّب قد يُرسل نص السؤال وسياق محدود إلى خدمة الذكاء المهيأة للنظام.</em>
        </footer>
        {settingsOpen ? (
          <div className="smart-guide-settings">
            <button className={profile.hintMode === "auto" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "auto"); refreshProfile(); }}>تلقائية</button>
            <button className={profile.hintMode === "quiet" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "quiet"); refreshProfile(); }}>قليلة</button>
            <button className={profile.hintMode === "off" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "off"); refreshProfile(); }}>إيقاف</button>
          </div>
        ) : null}
      </aside>

      {screenHandoff ? <div className="guide-screen-handoff no-print" role="status" aria-live="assertive"><span><Sparkles /></span><div><strong>{screenHandoff.title}</strong><small>{screenHandoff.detail}</small></div></div> : null}

      {pointMode ? (
        <div className="guide-point-banner no-print" data-guide-ignore="شريط وضع أشر لي جزء من المرشد وليس هدفًا للشرح"><Hand /><span><strong>أشر لي</strong> اضغط أي عنصر داخل SCHEDULE؛ لن أنفذ الضغط، بل سأشرح العنصر فقط.</span><button type="button" data-guide-ignore="زر إلغاء أشر لي يجب أن يبقى إجراء تحكم بالمرشد" onClick={(event) => { event.stopPropagation(); setPointMode(false); setDrawerHidden(false); }}>إلغاء</button></div>
      ) : null}

      {located ? (
        <div className="guide-ghost-layer no-print" aria-live="polite">
          <div className="guide-ghost-ring" style={{ top: Math.max(4, located.rect.top - 7), left: Math.max(4, located.rect.left - 7), width: located.rect.width + 14, height: located.rect.height + 14 }} />
          <MousePointer2 className="guide-ghost-hand" style={{ top: Math.max(12, located.rect.top + Math.min(located.rect.height * 0.45, 36)), left: Math.max(12, located.rect.left + Math.min(located.rect.width * 0.55, 90)) }} />
          <div className="guide-ghost-card" role="dialog" aria-modal="true" aria-label="خطوات الإرشاد الحي" tabIndex={-1} style={{ top: Math.min(window.innerHeight - 170, Math.max(16, located.rect.bottom + 14)), left: Math.min(window.innerWidth - 330, Math.max(16, located.rect.left)) }}>
            <small>{located.index + 1} من {located.total}</small><strong>{located.text}</strong>
            <div><button type="button" onClick={stopTour}>إيقاف</button><button type="button" className="primary" onClick={nextTour}>{located.index + 1 >= located.total ? <><Check />تم</> : <>التالي<ChevronLeft /></>}</button></div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="guide-preview-backdrop no-print">
          <section className="guide-preview" role="dialog" aria-modal="true" aria-label="معاينة أكمل عني" tabIndex={-1}>
            <span><ShieldCheck /></span><h3>معاينة «أكمل عني»</h3>
            <p>سأنفذ فقط خطوة واجهة آمنة مرتبطة بـ«{preview.feature.title}». لن أحذف أو أنشر أو أعتمد تغييرًا حساسًا دون قرارك.</p>
            <div><button type="button" onClick={cancelPreview}>إلغاء</button><button type="button" className="primary" onClick={confirmPreview}><WandSparkles />جهّزها لي</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
