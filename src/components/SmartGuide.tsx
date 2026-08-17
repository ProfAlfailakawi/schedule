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
  GUIDE_FEATURES,
  type DynamicGuideFeature,
  type GuideFeature,
  allowedGuideFeatures,
  changedFeatures,
  commonWorkflows,
  dialectIntentTerms,
  discoverVisibleControls,
  featureById,
  loadGuideProfile,
  markFeatureSeen,
  masteryScore,
  noteHint,
  predictedNextFeature,
  recordFeatureUse,
  removeGuideRoutine,
  saveGuideRoutine,
  setGuideTask,
  setHintMode,
  setOnboardingDone,
  silenceHint,
  touchGuideRoutine,
  type GuideProfile,
} from "../guide/smartGuide";

type GuideCommand = {
  scope?: string;
  type: string;
  value?: string;
  target?: string;
  task?: string;
};
type GuideHint = { key?: string; title: string; detail?: string; level?: "soft" | "strong" };
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
  if (step.target) return document.querySelector<HTMLElement>(`[data-guide-target="${step.target}"]`);
  if (step.selector) return document.querySelector<HTMLElement>(step.selector);
  return null;
}

function targetNow(id?: string) {
  if (!id) return null;
  return document.querySelector<HTMLElement>(`[data-guide-target="${id}"]`);
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
  const [dynamic, setDynamic] = useState<DynamicGuideFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDynamic, setSelectedDynamic] = useState<DynamicGuideFeature | null>(null);
  const [tour, setTour] = useState<TourState | null>(null);
  const [pendingTourId, setPendingTourId] = useState<string | null>(null);
  const [pendingTourStep, setPendingTourStep] = useState(0);
  const [located, setLocated] = useState<LocatedStep>(null);
  const [preview, setPreview] = useState<{ feature: GuideFeature; command: GuideCommand } | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState<"forYou" | "here" | "new" | "all">("forYou");
  const [routineDraft, setRoutineDraft] = useState<{ sequence: string[]; name: string } | null>(null);
  const [collectiveFriction, setCollectiveFriction] = useState<Array<{ name: string; count: number }>>([]);
  const drawerRef = useRef<HTMLElement | null>(null);
  const lastEscalationRef = useRef("");

  const refreshProfile = useCallback(() => setProfile(loadGuideProfile(userId)), [userId]);
  const admin = Boolean(root || user?.IsAdminUser);
  const known = useMemo(() => allowedGuideFeatures(activeView, permissions, root, admin), [activeView, permissions, root, admin]);
  const allAllowed = useMemo(() => GUIDE_FEATURES.filter(feature => (!feature.permission || permissions.includes(feature.permission)) && (!feature.rootOnly || root) && (!feature.adminOnly || admin)), [permissions, root, admin]);
  const pageFeature = useMemo(() => GUIDE_FEATURES.find((feature) => feature.id === `page.${activeView}`) || null, [activeView]);
  const pageMastery = masteryScore(profile, pageFeature);
  const isExpert = Boolean(context?.metrics?.isExpert) || pageMastery >= 0.72;
  const changed = useMemo(() => changedFeatures(profile, activeView, permissions, root, admin), [profile, activeView, permissions, root, admin]);
  const allChanged = useMemo(() => allAllowed.filter(feature => profile.catalog?.[feature.id] == null || feature.version > Number(profile.catalog?.[feature.id] || 0)).sort((a,b) => b.version - a.version), [allAllowed, profile]);
  const workflows = useMemo(() => commonWorkflows(profile, activeView), [profile, activeView]);
  const selected = selectedId ? featureById(selectedId) : null;
  const selectedMastery = selected ? masteryScore(profile, selected) : 0;
  const selectedHistory = selected ? profile.mastery[selected.id] : undefined;
  const selectedRecentlyHelped = Boolean(selectedHistory?.lastHelp && Date.now() - selectedHistory.lastHelp < 2 * 60 * 60 * 1000);
  const selectedUpdated = Boolean(selected && selectedHistory?.versionSeen && selectedHistory.versionSeen < selected.version);
  const selectedExpert = selectedMastery >= .72;
  const selectedConcise = selectedExpert || selectedRecentlyHelped;
  const currentFeatureId = context?.currentFeatureId || `page.${activeView}`;
  const predicted = useMemo(() => predictedNextFeature(profile, currentFeatureId), [profile, currentFeatureId]);
  const predictedFeature = predicted ? featureById(predicted.id) : null;
  const routines = useMemo(() => (Object.values(profile.routines || {}) as Array<{id:string;name:string;sequence:string[];createdAt:number;lastUsed:number}>).sort((a, b) => b.lastUsed - a.lastUsed || b.createdAt - a.createdAt), [profile]);
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
        onNavigate(command.value || "intelligence");
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: { scope: "intelligence", type: "scene", value: "try", task: command.task } }));
        }, 280);
      }
      return;
    }
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail: command }));
  }, [onNavigate]);

  useEffect(() => setProfile(loadGuideProfile(userId)), [userId]);
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
    const scan = () => setDynamic(discoverVisibleControls(activeView));
    scan();
    const id = window.setInterval(scan, 1000);
    return () => window.clearInterval(id);
  }, [open, activeView, context]);

  useEffect(() => {
    if (!open) {
      setPointMode(false);
      setPendingTourId(null);
      setPendingTourStep(0);
      setSelectedId(null);
      setSelectedDynamic(null);
      setPreview(null);
      setNotice("");
      setSettingsOpen(false);
      setRoutineDraft(null);
      setBrowseMode("forYou");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !root || !context?.collegeId || !context?.sectionId) {
      setCollectiveFriction([]);
      return;
    }
    let alive = true;
    const params = new URLSearchParams({ collegeId: String(context.collegeId), sectionId: String(context.sectionId) });
    fetch(`/api/intelligence/guide-friction?${params.toString()}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (alive) setCollectiveFriction(Array.isArray(data?.items) ? data.items.slice(0, 4) : []);
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
      if (!raw || raw.closest(".smart-guide") || raw.closest("[data-guide-ignore='true']")) return;
      const carrier = raw.closest<HTMLElement>("[data-guide-target],button,a,[role='button'],select,input");
      if (!carrier) return;
      event.preventDefault();
      event.stopPropagation();
      const explicit = carrier.getAttribute("data-guide-target") || carrier.closest<HTMLElement>("[data-guide-target]")?.getAttribute("data-guide-target") || "";
      if (explicit && featureById(explicit)) {
        setSelectedId(explicit);
        setSelectedDynamic(null);
        recordFeatureUse(userId, explicit, "help");
        markFeatureSeen(userId, explicit);
      } else {
        const title = String(carrier.getAttribute("aria-label") || carrier.getAttribute("title") || carrier.textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 72) || "هذا العنصر";
        setSelectedDynamic({ id: explicit || `point.${activeView}`, title, summary: "عنصر حي في الشاشة الحالية.", target: explicit || undefined, kind: carrier.tagName.toLowerCase() });
        setSelectedId(null);
      }
      carrier.setAttribute("data-guide-hot", "true");
      window.setTimeout(() => carrier.removeAttribute("data-guide-hot"), 2400);
      setPointMode(false);
      refreshProfile();
    };
    window.addEventListener("click", click, true);
    return () => {
      document.body.classList.remove("guide-point-mode");
      window.removeEventListener("click", click, true);
    };
  }, [pointMode, userId, activeView, refreshProfile]);

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
    if (feature.view && feature.view !== activeView) {
      setPendingTourStep(0);
      setPendingTourId(feature.id);
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
      if (feature.target) {
        const element = targetNow(feature.target);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.setAttribute("data-guide-hot", "true");
        window.setTimeout(() => element?.removeAttribute("data-guide-hot"), 2400);
      }
      return;
    }
    recordFeatureUse(userId, feature.id, "help");
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
      recordFeatureUse(userId, feature.id, "help");
      markFeatureSeen(userId, feature.id);
      setTour({ feature, steps, index: Math.min(Math.max(0, resumeAt), steps.length - 1) });
      refreshProfile();
    }, 80);
  // startTour intentionally closes over the current screen state; the id is the stable trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTourId, pendingTourStep, activeView, context?.selected?.id, context?.selected?.course, refreshProfile, userId]);

  const stopTour = () => {
    setTour(null);
    setLocated(null);
    setGuideTask(userId, undefined);
    refreshProfile();
  };

  const nextTour = () => setTour((current) => {
    if (!current) return null;
    if (current.index >= current.steps.length - 1) {
      recordFeatureUse(userId, current.feature.id, "success");
      setGuideTask(userId, undefined);
      setLocated(null);
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
    if (feature.view && feature.view !== activeView && !feature.safeAction) {
      onNavigate(feature.view);
      recordFeatureUse(userId, feature.id, "success");
      markFeatureSeen(userId, feature.id);
      return;
    }
    if (!feature.safeAction || isSensitive(feature)) {
      setNotice("هذه العملية تحتاج قرارك داخل الشاشة. يمكنني تحديد مكانها وشرح النتيجة، لكنني لن أنفذ إجراءً حساسًا نيابةً عنك.");
      startTour(feature);
      return;
    }
    setPreview({ feature, command: feature.safeAction });
  };

  const confirmPreview = () => {
    if (!preview) return;
    if (preview.feature.view && preview.feature.view !== activeView) {
      onNavigate(preview.feature.view);
      window.setTimeout(() => runCommand(preview.command), 320);
    } else runCommand(preview.command);
    recordFeatureUse(userId, preview.feature.id, "success");
    markFeatureSeen(userId, preview.feature.id);
    setGuideTask(userId, {
      id: `assist:${preview.feature.id}`,
      title: `مساعدة تنفيذية: ${preview.feature.title}`,
      featureId: preview.feature.id,
      target: preview.feature.target,
      command: preview.command,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    window.setTimeout(() => setGuideTask(userId, undefined), 2600);
    setNotice("تم تجهيز الخطوة الآمنة. أي تغيير مؤثر أو اعتماد نهائي سيبقى تحت قرارك المباشر.");
    setPreview(null);
    refreshProfile();
  };

  const simulateFeature = (feature: GuideFeature) => {
    if (feature.simulationAction) {
      runCommand(feature.simulationAction);
      setNotice("فتحت مساحة التجربة. لن يلمس هذا الاختبار الجدول الحقيقي حتى تعتمد أنت التغيير لاحقًا.");
      return;
    }
    if (activeView === "schedules") {
      runCommand({ scope: "app", type: "simulate", value: "intelligence", task: feature.id });
      setNotice("سأحوّلك إلى مساحة «جرّب» لاختبار الفكرة دون تعديل الجدول الحقيقي.");
      return;
    }
    setNotice("هذه الميزة لا تحتاج محاكاة مستقلة؛ يمكنني عرضها على الشاشة أو تجهيز خطوتها الآمنة.");
  };

  const resumeTask = () => {
    const current = profile.currentTask;
    const currentGeneric = Boolean(current?.id?.startsWith("work:page:") || current?.id === "work:schedule" || current?.id === "work:intelligence");
    const task = currentGeneric && profile.previousTask ? profile.previousTask : (current || profile.previousTask || context?.currentTask);
    if (!task) {
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
    const safeFeatures = sequence.map(featureById).filter(Boolean) as GuideFeature[];
    const commands = safeFeatures.map((feature) => feature.safeAction).filter(Boolean) as GuideCommand[];
    if (!commands.length) {
      setNotice("تعرّفت على هذا المسار كعادة لديك، لكن خطواته تحتاج قراراتك داخل الشاشة. سأستخدمه لترتيب الاقتراحات بدل تنفيذ ضغطات غير موثوقة.");
      return;
    }
    let delay = 0;
    commands.forEach((command) => {
      window.setTimeout(() => runCommand(command), delay);
      delay += 300;
    });
    setNotice("فتحت الأجزاء الآمنة من مسارك المعتاد. لم يتم تنفيذ أي تغيير على البيانات.");
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
    const knownRows: SearchRow[] = GUIDE_FEATURES
      .filter((feature) => (!feature.permission || permissions.includes(feature.permission)) && (!feature.rootOnly || root))
      .map((feature) => ({ kind: "known", feature, score: queryScore(query, feature) }));
    const dynamicRows: SearchRow[] = dynamic.map((feature) => ({ kind: "dynamic", feature, score: queryScore(query, { ...feature, keywords: [] }) }));
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
    return rows.filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
  }, [query, dynamic, permissions, root, routines, workflows, selected, context?.currentTask?.featureId, pageFeature]);

  const chooseKnown = (feature: GuideFeature) => {
    setSelectedId(feature.id);
    setSelectedDynamic(null);
    markFeatureSeen(userId, feature.id);
    refreshProfile();
  };

  const chooseDynamic = (feature: DynamicGuideFeature) => {
    setSelectedDynamic(feature);
    setSelectedId(null);
    recordFeatureUse(userId, feature.id, "help");
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

  const onboardingChoose = (kind: "build" | "review" | "reports") => {
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

  const pageTitle = context?.view === activeView ? (context?.title || pageFeature?.title || "هذه الشاشة") : (pageFeature?.title || "هذه الشاشة");
  const what = context?.view === activeView
    ? (context?.whatHappens || context?.summary || pageFeature?.summary || "أقرأ الشاشة الحالية وأقترح أقل قدر من المساعدة اللازمة.")
    : (pageFeature?.summary || "أقرأ الشاشة الحالية وأقترح أقل قدر من المساعدة اللازمة.");

  if (!open) return null;

  return (
    <>
      <aside className="smart-guide no-print" ref={drawerRef} role="dialog" aria-label="مرشد SCHEDULE" aria-modal="false" dir="rtl">
        <header className="smart-guide-hero">
          <div>
            <span className="smart-guide-kicker"><Bot aria-hidden="true" /> مرشد SCHEDULE</span>
            <h2>كيف؟</h2>
            <p>{isExpert ? "أعرف أنك متمكن في هذه المنطقة، لذلك سأبقى هادئًا ما لم تخرج العملية عن نمطك المعتاد." : what}</p>
          </div>
          <button type="button" className="smart-guide-close" onClick={onClose} aria-label="إغلاق"><X aria-hidden="true" /></button>
        </header>

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

        {!profile.onboardingDone ? (
          <section className="smart-guide-onboarding">
            <header><Compass aria-hidden="true" /><div><small>أول استخدام</small><strong>ما الذي تريد إنجازه؟</strong></div></header>
            <div>
              <button type="button" onClick={() => onboardingChoose("build")}><CalendarDays /><span><strong>أبني جدولًا</strong><small>ابدأ من مساحة الجدول</small></span></button>
              <button type="button" onClick={() => onboardingChoose("review")}><ShieldCheck /><span><strong>أراجع جدولًا</strong><small>اذهب مباشرةً للمراجعة</small></span></button>
              <button type="button" onClick={() => onboardingChoose("reports")}><BarChart3 /><span><strong>أبحث وأطلع تقارير</strong><small>اختر أقرب تقرير متاح لك</small></span></button>
            </div>
          </section>
        ) : null}

        <label className="smart-guide-search" role="search">
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسأل بطريقتك… مثل: شلون أنقل المادة؟" aria-label="اسأل المرشد" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="مسح السؤال">×</button> : null}
        </label>

        {hint ? (
          <section className={`smart-guide-hint ${hint.level === "strong" ? "strong" : ""}`}>
            <Sparkles aria-hidden="true" />
            <span><strong>{hint.title}</strong><small>{hint.detail}</small></span>
            <div><button type="button" onClick={() => { onDismissHint(); refreshProfile(); }}>حسنًا</button>{hint.key ? <button type="button" onClick={() => { silenceHint(userId, hint.key!); onDismissHint(); refreshProfile(); }}>لا تقترح هذا مجددًا</button> : null}</div>
          </section>
        ) : null}

        <div className="smart-guide-primary-actions">
          <button type="button" onClick={() => setPointMode(true)}><Target />أشر لي</button>
          <button type="button" onClick={() => { setSelectedId(null); setSelectedDynamic(null); setNotice(what); }}><BrainCircuit />ماذا يحدث الآن؟</button>
          <button type="button" onClick={() => { setSelectedId(null); setSelectedDynamic(null); setQuery(""); setNotice(""); setBrowseMode("here"); }}><Compass />ماذا يمكنني أن أفعل هنا؟</button>
          <button type="button" onClick={resumeTask}><History />أكمل من حيث توقفت</button>
        </div>
        <nav className="smart-guide-browse" aria-label="أقسام المرشد">
          <button className={browseMode === "forYou" ? "active" : ""} type="button" onClick={() => setBrowseMode("forYou")}>لك</button>
          <button className={browseMode === "here" ? "active" : ""} type="button" onClick={() => setBrowseMode("here")}>هذه الشاشة</button>
          <button className={browseMode === "new" ? "active" : ""} type="button" onClick={() => setBrowseMode("new")}>ما الجديد{allChanged.length ? <i>{Math.min(99, allChanged.length)}</i> : null}</button>
          <button className={browseMode === "all" ? "active" : ""} type="button" onClick={() => setBrowseMode("all")}>كل الميزات</button>
        </nav>

        {context?.view === activeView && context?.selected ? (
          <section className="smart-guide-selected-context">
            <div className="smart-guide-selected-visual"><MapPin /><i /><b /></div>
            <div><small>العنصر المحدد</small><strong>{context.selected.course}</strong><span>{[context.selected.room, context.selected.start].filter(Boolean).join(" · ")}</span></div>
            <div className="smart-guide-selected-actions">
              <button type="button" onClick={() => chooseKnown(featureById("schedule.action.move-room")!)}>تغيير القاعة</button>
              <button type="button" onClick={() => runCommand({ scope: "schedule", type: "openEditRow", value: String(context.selected.id) })}>تغيير الوقت</button>
              <button type="button" onClick={() => runCommand({ scope: "schedule", type: "focusRow", value: String(context.selected.id) })}>{context.selected.conflict ? "أرني التعارض" : "أرني على الجدول"}</button>
              <button type="button" onClick={() => runCommand({ scope: "schedule", type: "findAlternative", value: String(context.selected.id) })}>ابحث عن بديل</button>
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="smart-guide-notice"><Lightbulb /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="إغلاق"><X /></button></div>
        ) : null}

        {query.trim() ? (
          <section className="smart-guide-results">
            <div className="smart-guide-section-head"><div><small>فهمت سؤالك</small><strong>{specialIntent || results.length ? "الأقرب إلى مقصدك" : "لم أجد تطابقًا مباشرًا"}</strong></div></div>
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
            <header><span><Sparkles /></span><div><small>{selectedUpdated ? "تغيّرت هذه الميزة منذ آخر استخدام لك" : selectedExpert ? "إجابة مختصرة لأنك تتقنها" : selectedRecentlyHelped ? "سبق أن شرحتها لك؛ سأختصر هذه المرة" : selected.group}</small><strong>{selected.title}</strong><p>{selected.summary}</p></div></header>
            {!selectedConcise ? <div className="smart-guide-infographic" aria-hidden="true"><span><Eye /></span><i /><span><MousePointer2 /></span><i /><span><Check /></span></div> : null}
            {!selectedConcise && selected.steps?.length ? <ol className="smart-guide-steps">{selected.steps.slice(0, 4).map((step, index) => <li key={index}><b>{String(index + 1).padStart(2, "0")}</b><span>{step.text}</span></li>)}</ol> : null}
            {selectedConcise ? <div className="smart-guide-actions expert"><button type="button" onClick={() => executeSafe(selected)}><Zap />افتح مباشرةً</button><button type="button" onClick={() => startTour(selected)}><Eye />أرني المكان</button></div> : <div className="smart-guide-actions"><button type="button" onClick={() => startTour(selected)}><Eye />أرني على شاشتي</button><button type="button" onClick={() => executeSafe(selected)}><WandSparkles />أكمل عني</button><button type="button" onClick={() => simulateFeature(selected)}><ShieldCheck />جرّب دون تغيير</button></div>}
            <button className="smart-guide-back-link" type="button" onClick={() => setSelectedId(null)}><ArrowLeft />العودة</button>
          </section>
        ) : null}

        {selectedDynamic ? (
          <section className="smart-guide-focus-card">
            <header><span><MousePointer2 /></span><div><small>عنصر حي</small><strong>{selectedDynamic.title}</strong><p>{explainDynamic(selectedDynamic)}</p></div></header>
            <div className="smart-guide-actions one"><button type="button" onClick={() => {
              if (selectedDynamic.target) {
                const element = targetNow(selectedDynamic.target);
                element?.scrollIntoView({ behavior: "smooth", block: "center" });
                element?.setAttribute("data-guide-hot", "true");
                window.setTimeout(() => element?.removeAttribute("data-guide-hot"), 2400);
              } else setNotice("اكتشفت هذا العنصر تلقائيًا، لكنه لا يملك هدفًا ثابتًا بعد. استخدم «أشر لي» وسأبقى معه بصريًا دون تنفيذ الضغط.");
            }}><Eye />أرني مكانه</button></div>
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
                <div className="smart-guide-feature-grid">{known.filter(feature => !feature.id.startsWith("page.")).slice(0,12).map(feature => <button key={feature.id} type="button" onClick={() => chooseKnown(feature)}><span><Sparkles /></span><div><strong>{feature.title}</strong><small>{feature.summary}</small></div>{masteryScore(profile,feature)>=.72?<i>متقن</i>:null}</button>)}</div>
                <section className="smart-guide-section-head"><div><small>اكتشاف حي</small><strong>عناصر ظهرت في الشاشة</strong></div></section>
                <div className="smart-guide-live-controls">{dynamic.filter(item => !item.target || !featureById(item.target)).slice(0,8).map(item => <button type="button" key={item.id} onClick={() => chooseDynamic(item)}><MousePointer2 /><span><strong>{item.title}</strong><small>اكتشفها المرشد تلقائيًا</small></span></button>)}{!dynamic.filter(item => !item.target || !featureById(item.target)).length?<p>كل العناصر الظاهرة حاليًا معرّفة داخل المرشد.</p>:null}</div>
              </>
            ) : null}

            {browseMode === "new" ? (
              <>
                <section className="smart-guide-section-head"><div><small>ما الجديد لك</small><strong>{allChanged.length ? "ميزات جديدة أو متغيرة منذ آخر زيارة" : "أنت مطّلع على التحديثات المتاحة"}</strong></div></section>
                <div className="smart-guide-new-grid">
                  {allChanged.slice(0,18).map(feature => <button type="button" key={feature.id} onClick={() => chooseKnown(feature)}><Sparkles /><span><strong>{feature.title}</strong><small>{profile.mastery[feature.id]?.versionSeen ? "تغيّرت منذ آخر استخدام لك" : "أضيفت بعد آخر زيارة لك"}</small></span></button>)}
                </div>
              </>
            ) : null}

            {browseMode === "all" ? (
              <>
                <section className="smart-guide-section-head"><div><small>كل الميزات</small><strong>ضمن صلاحياتك فقط</strong></div></section>
                <div className="smart-guide-feature-grid">
                  {allAllowed.slice(0,36).map(feature => <button key={feature.id} type="button" onClick={() => chooseKnown(feature)}><span><Sparkles /></span><div><strong>{feature.title}</strong><small>{feature.group}</small></div>{masteryScore(profile,feature)>=.72?<i>متقن</i>:null}</button>)}
                  {dynamic.filter(item => !featureById(item.id)).slice(0,12).map(item => <button key={item.id} type="button" onClick={() => chooseDynamic(item)}><span><MousePointer2 /></span><div><strong>{item.title}</strong><small>مكتشفة تلقائيًا</small></div></button>)}
                </div>
              </>
            ) : null}

            {routineDraft ? <section className="smart-guide-routine-editor"><Zap /><div><small>اسم الاختصار</small><input value={routineDraft.name} onChange={event => setRoutineDraft({...routineDraft,name:event.target.value})} maxLength={48}/></div><button type="button" onClick={saveRoutineDraft}>حفظ</button><button type="button" onClick={() => setRoutineDraft(null)}>إلغاء</button></section> : null}

            {root && collectiveFriction.length && browseMode === "forYou" ? <><section className="smart-guide-section-head"><div><small>تحسين المنتج</small><strong>أكثر نقاط التعثر جماعيًا</strong></div></section><div className="smart-guide-friction">{collectiveFriction.map((item,index) => <article key={`${item.name}-${index}`}><Gauge /><span><strong>{item.name}</strong><small>{item.count.toLocaleString("ar-KW-u-nu-latn")} إشارة مجهولة الهوية</small></span><i style={{"--guide-friction":`${Math.min(100,item.count*8)}%`} as React.CSSProperties}/></article>)}</div></> : null}
          </>
        ) : null}

        <footer className="smart-guide-footer">
          <button type="button" onClick={() => setSettingsOpen((value) => !value)}><Settings2 />المساعدة الاستباقية</button>
          <small>{profile.hintMode === "off" ? "متوقفة" : profile.hintMode === "quiet" ? "قليلة" : "تلقائية"}</small>
          <em>يتعلم نمط الاستخدام على هذا الجهاز، ويستخدم أقل قدر من البيانات اللازمة للإرشاد.</em>
        </footer>
        {settingsOpen ? (
          <div className="smart-guide-settings">
            <button className={profile.hintMode === "auto" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "auto"); refreshProfile(); }}>تلقائية</button>
            <button className={profile.hintMode === "quiet" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "quiet"); refreshProfile(); }}>قليلة</button>
            <button className={profile.hintMode === "off" ? "active" : ""} type="button" onClick={() => { setHintMode(userId, "off"); refreshProfile(); }}>إيقاف</button>
          </div>
        ) : null}
      </aside>

      {pointMode ? (
        <div className="guide-point-banner no-print"><Hand /><span><strong>أشر لي</strong> اضغط أي عنصر داخل SCHEDULE؛ لن أنفذ الضغط، بل سأشرح العنصر فقط.</span><button type="button" onClick={() => setPointMode(false)}>إلغاء</button></div>
      ) : null}

      {located ? (
        <div className="guide-ghost-layer no-print" aria-live="polite">
          <div className="guide-ghost-ring" style={{ top: Math.max(4, located.rect.top - 7), left: Math.max(4, located.rect.left - 7), width: located.rect.width + 14, height: located.rect.height + 14 }} />
          <MousePointer2 className="guide-ghost-hand" style={{ top: Math.max(12, located.rect.top + Math.min(located.rect.height * 0.45, 36)), left: Math.max(12, located.rect.left + Math.min(located.rect.width * 0.55, 90)) }} />
          <div className="guide-ghost-card" style={{ top: Math.min(window.innerHeight - 170, Math.max(16, located.rect.bottom + 14)), left: Math.min(window.innerWidth - 330, Math.max(16, located.rect.left)) }}>
            <small>{located.index + 1} من {located.total}</small><strong>{located.text}</strong>
            <div><button type="button" onClick={stopTour}>إيقاف</button><button type="button" className="primary" onClick={nextTour}>{located.index + 1 >= located.total ? <><Check />تم</> : <>التالي<ChevronLeft /></>}</button></div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="guide-preview-backdrop no-print">
          <section className="guide-preview">
            <span><ShieldCheck /></span><h3>معاينة «أكمل عني»</h3>
            <p>سأنفذ فقط خطوة واجهة آمنة مرتبطة بـ«{preview.feature.title}». لن أحذف أو أنشر أو أعتمد تغييرًا حساسًا دون قرارك.</p>
            <div><button type="button" onClick={() => setPreview(null)}>إلغاء</button><button type="button" className="primary" onClick={confirmPreview}><WandSparkles />جهّزها لي</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
