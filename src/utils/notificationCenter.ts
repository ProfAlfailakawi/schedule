/**
 * ── مركز الإشعارات ──────────────────────────────────────────────────────────
 *
 * لا يُخزَّن فيه شيء: كلُّ إشعارٍ يُشتقّ من حال الجدول نفسه لحظةَ السؤال. فلا
 * إشعارٌ يبقى بعد أن زال سببه، ولا سببٌ يقع بلا إشعار. والسؤال الذي يجيب عنه
 * لكل صاحب صفة واحد: ما الذي بقي، ومن ينتظر مَن؟
 */
import type { ScheduleApproval } from "../types";
import { roleDefinition } from "./academicRoles";
import { isLate } from "./lateness";
import { AR, countOf, nounFor, oblique } from "./arabicCount";

export type NotificationTone = "action" | "waiting" | "done" | "alert";
export type NotificationView = "scheduleChanges" | "schedules" | "instructorRequests" | "reportDepartment" | "studentRegistration";

export interface CenterNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  detail: string;
  view?: NotificationView;
  collegeId?: number;
  sectionId?: number;
  at?: string;
  /** فصلُ البند — يضعه الخادم؛ الجرسُ يقرأ الجاري وفصلَ التخطيط معاً (N18). */
  termId?: number;
  termName?: string;
}

export interface CenterScope {
  approval: ScheduleApproval;
  collegeName: string;
  sectionName: string;
  rowCount: number;
  openRegistrarNotes: number;
  openRequests: number;
  /** طلباتُ الأساتذة المعلّقة في هذا القسم، طلباً طلباً. */
  pendingRequests?: Array<{ requestId: string; instructorName: string; count: number; at?: string; linked?: boolean }>;
  /**
   * طلباتُ الطلبة في كشف التسجيل، مقرّراتُ هذا القسم وحدها:
   * ما ينتظر لجنة القسم، وما وافقت عليه اللجنة وينتظر التسجيل (ويُعدّ للتسجيل
   * فقط حين يكون الجدول موقَّعاً، كما يُعرض له الكشف).
   */
  studentQueue?: { pendingCommittee: number; awaitingRegistration: number; oldestPendingAt?: string; latestApprovedAt?: string };
  /** موعد هذا القسم: تمديده إن وُجد، وإلا موعد الفصل. */
  deadline?: { effective?: string; past?: boolean; daysLeft?: number } | null;
  /** موانع الاعتماد القائمة الآن (للعميدين: قسمٌ معتمد ظهر فيه مانع — N20). */
  blockingConflicts?: number;
  /** ملاحظاتٌ أصرّ عليها التسجيل ثلاثاً أو صُعّدت (N24). */
  escalatedNotes?: number;
}

export interface CenterInput {
  role: string;
  scopes: CenterScope[];
  /** الساعةُ التي تُقاس بها مدةُ الانتظار (للاختبار). */
  now?: number;
  deadline?: { effective?: string; past?: boolean; daysLeft?: number } | null;
}

/** التاريخ بالعربية، لا بصيغة الآلة. */
const day = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
};

const place = (scope: CenterScope) => scope.sectionName || `قسم ${scope.approval.AdSectionId}`;
/* القسمُ نفسُه في كليتين (بنين وبنات) يُقال بكليّته، وإلا بدا الإشعارُ مكرّراً. */
let twins = new Set<string>();
const placeOf = (scope: CenterScope) => twins.has(place(scope)) && scope.collegeName
  ? `${place(scope)} — ${scope.collegeName.replace(/^كلية\s+/, "")}` : place(scope);

const lastAccepted = (approval: ScheduleApproval) =>
  [...approval.rounds].filter(round => round.acceptedAt).sort((a, b) => b.number - a.number)[0];

/** طلبُ تمديدٍ معلّق على سجلّ الاعتماد، يُقرأ بحذر: الحقل يضيفه مسارٌ آخر. */
export function pendingExtensionRequest(approval: ScheduleApproval): { until?: string; reason?: string; at?: string } | null {
  const ask: any = (approval as any)?.extensionRequest;
  if (!ask || typeof ask !== "object") return null;
  if (ask.resolvedAt || ask.decidedAt || (ask.status && ask.status !== "pending")) return null;
  return {
    until: typeof ask.until === "string" ? ask.until : undefined,
    reason: typeof ask.reason === "string" ? ask.reason : undefined,
    at: typeof ask.requestedAt === "string" ? ask.requestedAt : typeof ask.at === "string" ? ask.at : undefined,
  };
}

const REGISTRAR = new Set(["registrarHead", "registrarStaff"]);
const WATCHERS = new Set(["registrarDean"]);
const DEANS = new Set(["dean", "viceDean"]);

/** ما يدور حوله الإشعار — لا الشاشة؛ الشاشةُ يقرّرها `routeFor` بحسب الصفة. */
export type NotificationKind = "approval" | "returned" | "notes" | "request" | "students" | "final";

const SCHEDULE_WORKSPACE_FORM = 7;

/**
 * ── إلى أين يأخذ الإشعار؟ قرارٌ واحد ─────────────────────────────────────────
 *
 * كانت كلُّ إشعارات القسم تشير إلى ورشة الجدول («schedules») — وهي شاشةٌ لا
 * يملكها رئيس القسم (صلاحية ٧)، فيضغط الإشعار فيُردّ إلى لوحة البداية. وطلبات
 * الأساتذة تُعرض لمن لا يستطيع فتح شاشتها.
 *
 * فصار المسارُ من هنا وحده:
 *   - رئيس القسم والتسجيل: تغييرات الجدول (بابُهم للقراءة والتوقيع والملاحظات).
 *   - اللجنة: «أُرجع» إلى تغييرات الجدول (حيث الملاحظات)، والباقي إلى الورشة.
 *   - طلبات الأساتذة: لمن يملك الورشة وحده؛ لغيره لا وجهة (فلا يُعرض البند).
 */
export function routeFor(role: string, kind: NotificationKind): NotificationView | undefined {
  if (kind === "final") return "reportDepartment";
  if (kind === "students") return "studentRegistration";
  const hasWorkspace = role === "admin" || roleDefinition(role).formIds.includes(SCHEDULE_WORKSPACE_FORM);
  if (kind === "request") return hasWorkspace ? "instructorRequests" : undefined;
  if (role === "departmentHead" || REGISTRAR.has(role) || WATCHERS.has(role)) return "scheduleChanges";
  if (kind === "returned" || kind === "notes") return "scheduleChanges";
  return hasWorkspace ? "schedules" : "scheduleChanges";
}

export function buildNotifications(input: CenterInput): CenterNotification[] {
  const items: CenterNotification[] = [];
  const { role, scopes } = input;
  const names = scopes.map(place);
  twins = new Set(names.filter((name, at) => names.indexOf(name) !== at));
  const key = (scope: CenterScope, kind: string) =>
    `${kind}:${scope.approval.AdCollegeId}:${scope.approval.AdSectionId}:${scope.approval.currentRound}`;
  const target = (scope: CenterScope) => ({ collegeId: scope.approval.AdCollegeId, sectionId: scope.approval.AdSectionId });

  if (REGISTRAR.has(role) || WATCHERS.has(role)) {
    const decides = REGISTRAR.has(role);
    for (const scope of scopes) {
      const { approval } = scope;
      if (approval.status !== "submitted") continue;
      const round = approval.rounds.find(item => item.number === approval.currentRound);
      const again = approval.rounds.some(item => item.acceptedAt);
      items.push({
        id: key(scope, "waiting"), tone: decides ? "action" : "waiting",
        title: decides ? `جدول ${placeOf(scope)} ينتظر قرارك` : `جدول ${placeOf(scope)} عند التسجيل`,
        detail: `${scope.collegeName}${again ? " — تعديلٌ بعد اعتمادٍ سابق" : approval.currentRound > 1 ? ` — الجولة ${approval.currentRound}` : " — أول تسليم"}`,
        view: routeFor(role, "approval"), at: round?.submittedAt, ...target(scope),
      });
    }
    const notYetScopes = scopes.filter(scope => !scope.approval.rounds.length);
    const notYet = notYetScopes.length;
    /* التأخّر بالقاعدة الواحدة، وبموعد كل قسمٍ (تمديده إن وُجد) — لا بموعد
       الفصل وحده: قسمٌ مُدِّد له ليس متأخّراً (N21). */
    const lateCount = notYetScopes.filter(scope => isLate({
      approvalStatus: scope.approval.status, submittedRounds: scope.approval.currentRound,
      deadline: scope.deadline?.effective ?? input.deadline?.effective, now: input.now,
    })).length;
    if (notYet > 0) {
      items.push({
        /* المعرّف بالحال لا بالعدد (N22): قسمٌ يسلّم لا يصنع إشعاراً «جديداً». */
        id: `not-submitted:${lateCount > 0 ? "late" : "open"}`, tone: lateCount > 0 ? "alert" : "waiting",
        title: notYet === 1 ? "قسمٌ واحد لم يسلّم جدوله بعد" : notYet === 2 ? "قسمان لم يسلّما جدولَيهما بعد" : `${notYet} ${notYet <= 10 ? "أقسام" : "قسماً"} لم تسلّم جداولها بعد`,
        detail: lateCount > 0
          ? (lateCount === notYet ? "انقضى موعد التسليم." : `${countOf(lateCount, AR.department)} منها تجاوز موعده.`)
          : input.deadline?.effective ? `آخر موعد للتسليم ${day(input.deadline.effective)}.` : "لم يُحدَّد موعد التسليم بعد.",
        view: routeFor(role, "final"),
      });
    }
    /* ── طلبُ تمديد (N25) ─────────────────────────────────────────────────
       يكتبه مسارُ الطلب على سجلّ الاعتماد؛ يُقرأ هنا بحذر (قد لا يوجد الحقل).
       ورئيسُ التسجيل وحده يمدّد، فهو وحده يُطلب منه. */
    if (role === "registrarHead") {
      for (const scope of scopes) {
        const ask = pendingExtensionRequest(scope.approval);
        if (!ask) continue;
        items.push({
          id: key(scope, `extension-request-${ask.at || ""}`), tone: "action",
          title: `${placeOf(scope)} يطلب تمديد موعد التسليم`,
          detail: [ask.until ? `حتى ${day(ask.until)}` : "", ask.reason || ""].filter(Boolean).join(" — ") || scope.collegeName,
          view: routeFor(role, "approval"), at: ask.at, ...target(scope),
        });
      }
    }
  }

  if (role === "committeeChair" || role === "departmentHead") {
    const isHead = role === "departmentHead";
    for (const scope of scopes) {
      const { approval } = scope;
      const accepted = lastAccepted(approval);
      if (approval.status === "returned") {
        items.push({
          id: key(scope, "returned"),
          tone: isHead ? (approval.pendingAdditions.length && scope.openRegistrarNotes === 0 ? "action" : "waiting")
            : (approval.pendingAdditions.length && scope.openRegistrarNotes === 0 ? "waiting" : "action"),
          title: `أرجع التسجيل جدول ${placeOf(scope)}`,
          /* الصدق فيما بقي (N23): إضافاتٌ تنتظر إقرار رئيس القسم تمنع إعادة
             الإرسال، فلا يُقال «بقي إعادة الإرسال» واللجنة لا تملكها. */
          detail: scope.openRegistrarNotes > 0
            ? `بقيت ${countOf(scope.openRegistrarNotes, AR.note)} ${nounFor(scope.openRegistrarNotes, AR.waitFemVerb)} المعالجة أو الردّ، ثم يُعاد الإرسال.`
            : approval.pendingAdditions.length
              ? `عولجت الملاحظات — وتنتظر ${countOf(approval.pendingAdditions.length, AR.section)} أُضيفت إقرارَ رئيس القسم قبل إعادة الإرسال.`
              : "عولجت الملاحظات — بقي إعادة الإرسال إلى التسجيل.",
          view: routeFor(role, "returned"), ...target(scope),
        });
      } else if (approval.status === "submitted") {
        items.push({
          id: key(scope, "submitted"), tone: "waiting",
          title: `جدول ${placeOf(scope)} عند التسجيل`,
          detail: "التعديل مقفلٌ حتى يقبله التسجيل أو يُرجعه.",
          view: routeFor(role, "approval"), ...target(scope),
        });
      } else if (approval.status === "accepted") {
        items.push({
          id: key(scope, "accepted"), tone: "done",
          title: `جدول ${placeOf(scope)} معتمد`,
          detail: "أيُّ تعديلٍ بعده يصل التسجيلَ مباشرة.",
          view: routeFor(role, "approval"), at: accepted?.acceptedAt, ...target(scope),
        });
      } else if (approval.status === "drafting" && !accepted) {
        items.push({
          id: key(scope, "draft"), tone: isHead ? "waiting" : scope.rowCount > 0 ? "action" : "waiting",
          title: isHead ? `جدول ${placeOf(scope)} عند لجنة الجدول` : scope.rowCount > 0 ? `وقّع جدول ${placeOf(scope)}` : `ابدأ جدول ${placeOf(scope)}`,
          detail: isHead ? "يصلك للاعتماد بعد توقيع اللجنة." : scope.rowCount > 0 ? "بعد توقيعك يصل لرئيس القسم ليعتمده." : "لا مواعيد فيه بعد.",
          view: routeFor(role, "approval"), ...target(scope),
        });
      } else if (approval.status === "committee") {
        items.push({
          id: key(scope, "committee"), tone: isHead ? "action" : "waiting",
          title: isHead ? `اعتمد جدول ${placeOf(scope)}` : `جدول ${placeOf(scope)} عند رئيس القسم`,
          detail: isHead ? "وقّعت اللجنة. اعتمادك يرسله للتسجيل مباشرة." : "بعد اعتماده يصل للتسجيل مباشرة.",
          view: routeFor(role, "approval"), ...target(scope),
        });
      } else if (approval.status === "head") {
        items.push({
          id: key(scope, "head"), tone: "action",
          title: `أرسل جدول ${placeOf(scope)} إلى التسجيل`,
          detail: "اكتمل الاعتماد ولم يُرسل بعد.",
          view: routeFor(role, "approval"), ...target(scope),
        });
      }
      /* ملاحظاتُ التسجيل خارج «أُرجع» (N19): تنتظر ردّاً ولو لم يُرجَع الجدول.
         إلا والجدولُ عند التسجيل: هي مراجعتُه الجارية، والتعديلُ مقفلٌ حتى يقرّر —
         فلا يُطلب من القسم فعلٌ لا يملكه. */
      if (approval.status !== "returned" && approval.status !== "submitted" && scope.openRegistrarNotes > 0) {
        items.push({
          id: key(scope, "registrar-notes"), tone: "action",
          title: `ملاحظات التسجيل على جدول ${placeOf(scope)}`,
          detail: `${countOf(scope.openRegistrarNotes, AR.note)} — تنتظر المعالجة أو الردّ.`,
          view: routeFor(role, "notes"), ...target(scope),
        });
      }
      /* ملاحظةٌ أصرّ عليها التسجيل ثلاثاً (N24): لم تعد شأنَ اللجنة وحدها. */
      if (isHead && Number(scope.escalatedNotes || 0) > 0) {
        items.push({
          id: key(scope, "escalated-notes"), tone: "action",
          title: `التسجيل يُصرّ على ${countOf(Number(scope.escalatedNotes), oblique(AR.note))} في جدول ${placeOf(scope)}`,
          detail: "تكرّر الإصرار ثلاث مرّات — تحتاج قرارك مع اللجنة.",
          view: routeFor(role, "notes"), ...target(scope),
        });
      }
      if (isHead && approval.pendingAdditions.length && !accepted) {
        items.push({
          id: key(scope, "additions"), tone: "action",
          title: `${countOf(approval.pendingAdditions.length, AR.section)} ${nounFor(approval.pendingAdditions.length, AR.addedFemVerb)} بعد اعتمادك`,
          detail: "وافق عليها ليُعاد الإرسال.",
          view: routeFor(role, "approval"), ...target(scope),
        });
      }
      const due = scope.deadline;
      if (!accepted && !approval.rounds.length && due?.effective && !isHead) {
        const days = Number(due.daysLeft);
        if (due.past || (Number.isFinite(days) && days <= 7)) {
          items.push({
            id: key(scope, `deadline-${due.effective}`), tone: "alert",
            title: due.past ? "انقضى موعد تسليم الجدول" : days <= 0 ? "اليوم آخر موعد لتسليم الجدول" : `بقي ${countOf(days, AR.day)} على تسليم الجدول`,
            detail: due.past ? "يلزم تمديدٌ من رئيس التسجيل قبل التسليم." : `آخر موعد ${day(due.effective)}.`,
            view: routeFor(role, "approval"), ...target(scope),
          });
        }
      }
    }
  }

  /* ── طلباتُ الأساتذة: لكل من يعمل على الجدول، أياً كانت صفته ─────────
     طلبٌ واحد لكل أستاذ باسمه، والمعرّفُ يحمل وقتَ الإرسال وعددَ البنود —
     فإن أرسل الأستاذ من جديد صار الإشعارُ «جديداً» مرّةً أخرى. */
  const byRequest = new Map<string, { name: string; count: number; at?: string; places: string[]; linkedPlaces: string[]; scope: CenterScope }>();
  for (const scope of scopes) {
    for (const entry of scope.pendingRequests || []) {
      const current = byRequest.get(entry.requestId) || { name: entry.instructorName, count: 0, at: entry.at, places: [], linkedPlaces: [], scope };
      current.count += entry.count;
      current.places.push(placeOf(scope));
      if (entry.linked) { current.linkedPlaces.push(placeOf(scope)); current.scope = scope; }
      byRequest.set(entry.requestId, current);
    }
  }
  const requestView = routeFor(role, "request");
  for (const [requestId, entry] of requestView ? byRequest : new Map<string, never>()) {
    /* طلبٌ مرتبط: قسمٌ آخر لا يستطيع أن يُكمل حتى يُقرّر هذا القسمُ حذفَه. */
    const linked = entry.linkedPlaces.length > 0;
    items.push({
      id: `request:${requestId}:${entry.at || ""}${linked ? ":linked" : ""}`, tone: linked ? "alert" : "action",
      title: linked
        ? `${entry.name}: قسمٌ آخر ينتظر قرارك`
        : `${entry.name} ${entry.count === 1 ? "طلب تعديلاً" : `طلب ${countOf(entry.count, oblique(AR.edit))}`}`,
      detail: linked
        ? `${[...new Set(entry.linkedPlaces)].join(" · ")} — حذفٌ يُكمل به قسمٌ آخر طلبَه`
        : [...new Set(entry.places)].join(" · "),
      view: requestView, at: entry.at, ...target(entry.scope),
    });
  }

  /* ── كشفُ التسجيل: اللجنةُ أولاً، ثم التسجيل ─────────────────────────────
     اللجنةُ يُقال لها كم طلباً ينتظر قرارها، ويصير تنبيهاً إذا انتظر أقدمُها
     أكثر من ثلاثة أيام. والتسجيلُ يُقال له كم مقرّراً وافقت عليه اللجنة
     وينتظره. المعرّفُ يحمل العدد، فتصير الدفعةُ الجديدة إشعاراً جديداً. */
  const now = input.now ?? Date.now();
  for (const scope of scopes) {
    const queue = scope.studentQueue;
    if (!queue) continue;
    if (queue.pendingCommittee > 0 && !REGISTRAR.has(role) && !WATCHERS.has(role) && !DEANS.has(role)) {
      const waitedDays = queue.oldestPendingAt ? Math.floor((now - new Date(queue.oldestPendingAt).getTime()) / 86400000) : 0;
      const late = waitedDays > 3;
      items.push({
        id: key(scope, `students-committee-${late ? "late" : "open"}`), tone: late ? "alert" : "action",
        title: `${countOf(queue.pendingCommittee, AR.course)} في كشف التسجيل ${nounFor(queue.pendingCommittee, AR.waitVerb)} قرار اللجنة`,
        detail: late ? `${placeOf(scope)} — أقدمُها ينتظر منذ ${countOf(waitedDays, oblique(AR.day))}` : placeOf(scope),
        view: routeFor(role, "students"), at: queue.oldestPendingAt, ...target(scope),
      });
    }
    if (queue.awaitingRegistration > 0 && REGISTRAR.has(role)) {
      items.push({
        id: key(scope, `students-registration-${queue.latestApprovedAt || ""}`), tone: "action",
        title: `وافقت لجنة ${placeOf(scope)} على ${countOf(queue.awaitingRegistration, oblique(AR.course))} للتسجيل`,
        detail: "تنتظر التسجيل أو الردّ في كشف التسجيل.",
        view: routeFor(role, "students"), at: queue.latestApprovedAt, ...target(scope),
      });
    }
  }

  if (DEANS.has(role) || role === "admin") {
    const total = scopes.length;
    const done = scopes.filter(scope => lastAccepted(scope.approval)).length;
    if (total > 0) {
      items.push({
        id: `final-summary:${done === total ? "all" : "partial"}`, tone: done === total ? "done" : "waiting",
        title: done === total ? "كل جداول الأقسام معتمدة" : `المعتمد ${done} من ${countOf(total, oblique(AR.schedule))}`,
        detail: done === total ? "الجداول النهائية جاهزة للاطّلاع." : `بقي ${total - done} لم يعتمده التسجيل بعد.`,
        view: routeFor(role, "final"),
      });
    }
    /* ── ما يستحقّ التنبيه (N20) ─────────────────────────────────────────
       العميدان لا يُطلب منهما فعل، لكن يُنبَّهان: قسمٌ تجاوز موعده، وجدولٌ
       أُرجع وبقي بلا حراكٍ أكثر من ثلاثة أيام، وجدولٌ معتمد ظهر فيه مانع.
       كلٌّ يفتح الميزان على قسمه. */
    const now = input.now ?? Date.now();
    for (const scope of scopes) {
      const { approval } = scope;
      if (isLate({ approvalStatus: approval.status, submittedRounds: approval.currentRound, deadline: scope.deadline?.effective ?? input.deadline?.effective, now })) {
        items.push({
          id: key(scope, "dean-late"), tone: "alert",
          title: `جدول ${placeOf(scope)} تجاوز موعد التسليم`,
          detail: scope.rowCount > 0 ? "لم يُرسَل إلى التسجيل بعد." : "لم يبدأ القسم جدوله بعد.",
          view: routeFor(role, "final"), ...target(scope),
        });
      }
      const round = approval.rounds.find(item => item.number === approval.currentRound);
      const idleDays = approval.status === "returned" && round?.returnedAt ? Math.floor((now - new Date(round.returnedAt).getTime()) / 86_400_000) : 0;
      if (idleDays > 3) {
        items.push({
          id: key(scope, "dean-returned-idle"), tone: "alert",
          title: `جدول ${placeOf(scope)} مُرجَعٌ منذ ${countOf(idleDays, oblique(AR.day))}`,
          detail: "لم يُعِد القسم إرساله بعد.",
          view: routeFor(role, "final"), at: round?.returnedAt, ...target(scope),
        });
      }
      if (approval.status === "accepted" && Number(scope.blockingConflicts || 0) > 0) {
        items.push({
          id: key(scope, "dean-accepted-blocker"), tone: "alert",
          title: `ظهر ${countOf(Number(scope.blockingConflicts), AR.blocker)} في جدول ${placeOf(scope)} المعتمد`,
          detail: "تعارضٌ جدّ بعد الاعتماد — من جدول قسمٍ آخر غالباً.",
          view: routeFor(role, "final"), ...target(scope),
        });
      }
    }
    for (const scope of scopes) {
      const accepted = lastAccepted(scope.approval);
      if (!accepted?.acceptedAt || scope.approval.status !== "accepted") continue;
      items.push({
        id: key(scope, "final"), tone: "done",
        title: `اعتُمد جدول ${placeOf(scope)}`,
        detail: scope.collegeName,
        view: routeFor(role, "final"), at: accepted.acceptedAt, ...target(scope),
      });
    }
  }

  const rank: Record<NotificationTone, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
}
