/**
 * ── مركز الإشعارات ──────────────────────────────────────────────────────────
 *
 * لا يُخزَّن فيه شيء: كلُّ إشعارٍ يُشتقّ من حال الجدول نفسه لحظةَ السؤال. فلا
 * إشعارٌ يبقى بعد أن زال سببه، ولا سببٌ يقع بلا إشعار. والسؤال الذي يجيب عنه
 * لكل صاحب صفة واحد: ما الذي بقي، ومن ينتظر مَن؟
 */
import type { ScheduleApproval } from "../types";

export type NotificationTone = "action" | "waiting" | "done" | "alert";
export type NotificationView = "scheduleChanges" | "schedules" | "instructorRequests" | "reportDepartment";

export interface CenterNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  detail: string;
  view?: NotificationView;
  collegeId?: number;
  sectionId?: number;
  at?: string;
}

export interface CenterScope {
  approval: ScheduleApproval;
  collegeName: string;
  sectionName: string;
  rowCount: number;
  openRegistrarNotes: number;
  openRequests: number;
  /** طلباتُ الأساتذة المعلّقة في هذا القسم، طلباً طلباً. */
  pendingRequests?: Array<{ requestId: string; instructorName: string; count: number; at?: string }>;
  /** موعد هذا القسم: تمديده إن وُجد، وإلا موعد الفصل. */
  deadline?: { effective?: string; past?: boolean; daysLeft?: number } | null;
}

export interface CenterInput {
  role: string;
  scopes: CenterScope[];
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
const plural = (count: number, one: string, two: string, many: string) =>
  count === 1 ? one : count === 2 ? two : `${count} ${many}`;

const lastAccepted = (approval: ScheduleApproval) =>
  [...approval.rounds].filter(round => round.acceptedAt).sort((a, b) => b.number - a.number)[0];

const REGISTRAR = new Set(["registrarHead", "registrarStaff"]);
const WATCHERS = new Set(["registrarDean"]);
const DEANS = new Set(["dean", "viceDean"]);

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
        view: "scheduleChanges", at: round?.submittedAt, ...target(scope),
      });
    }
    const notYet = scopes.filter(scope => !scope.approval.rounds.length).length;
    if (notYet > 0) {
      items.push({
        id: `not-submitted:${notYet}`, tone: input.deadline?.past ? "alert" : "waiting",
        title: notYet === 1 ? "قسمٌ واحد لم يسلّم جدوله بعد" : notYet === 2 ? "قسمان لم يسلّما جدولَيهما بعد" : `${notYet} ${notYet <= 10 ? "أقسام" : "قسماً"} لم تسلّم جداولها بعد`,
        detail: input.deadline?.effective
          ? (input.deadline.past ? "انقضى موعد التسليم." : `آخر موعد للتسليم ${day(input.deadline.effective)}.`)
          : "لم يُحدَّد موعد التسليم بعد.",
        view: "reportDepartment",
      });
    }
  }

  if (role === "committeeChair" || role === "departmentHead") {
    const isHead = role === "departmentHead";
    for (const scope of scopes) {
      const { approval } = scope;
      const accepted = lastAccepted(approval);
      if (approval.status === "returned") {
        items.push({
          id: key(scope, "returned"), tone: isHead ? "waiting" : "action",
          title: `أرجع التسجيل جدول ${placeOf(scope)}`,
          detail: scope.openRegistrarNotes > 0
            ? `بقيت ${plural(scope.openRegistrarNotes, "ملاحظةٌ واحدة", "ملاحظتان", "ملاحظات")} تنتظر المعالجة أو الردّ، ثم يُعاد الإرسال.`
            : "عولجت الملاحظات — بقي إعادة الإرسال إلى التسجيل.",
          view: "schedules", ...target(scope),
        });
      } else if (approval.status === "submitted") {
        items.push({
          id: key(scope, "submitted"), tone: "waiting",
          title: `جدول ${placeOf(scope)} عند التسجيل`,
          detail: "التعديل مقفلٌ حتى يقبله التسجيل أو يُرجعه.",
          view: "schedules", ...target(scope),
        });
      } else if (approval.status === "accepted") {
        items.push({
          id: key(scope, "accepted"), tone: "done",
          title: `جدول ${placeOf(scope)} معتمد`,
          detail: "أيُّ تعديلٍ بعده يصل التسجيلَ مباشرة.",
          view: "schedules", at: accepted?.acceptedAt, ...target(scope),
        });
      } else if (approval.status === "drafting" && !accepted) {
        items.push({
          id: key(scope, "draft"), tone: isHead ? "waiting" : scope.rowCount > 0 ? "action" : "waiting",
          title: isHead ? `جدول ${placeOf(scope)} عند لجنة الجدول` : scope.rowCount > 0 ? `وقّع جدول ${placeOf(scope)}` : `ابدأ جدول ${placeOf(scope)}`,
          detail: isHead ? "يصلك للاعتماد بعد توقيع اللجنة." : scope.rowCount > 0 ? "بعد توقيعك يصل لرئيس القسم ليعتمده." : "لا مواعيد فيه بعد.",
          view: "schedules", ...target(scope),
        });
      } else if (approval.status === "committee") {
        items.push({
          id: key(scope, "committee"), tone: isHead ? "action" : "waiting",
          title: isHead ? `اعتمد جدول ${placeOf(scope)}` : `جدول ${placeOf(scope)} عند رئيس القسم`,
          detail: isHead ? "وقّعت اللجنة. اعتمادك يرسله للتسجيل مباشرة." : "بعد اعتماده يصل للتسجيل مباشرة.",
          view: "schedules", ...target(scope),
        });
      } else if (approval.status === "head") {
        items.push({
          id: key(scope, "head"), tone: "action",
          title: `أرسل جدول ${placeOf(scope)} إلى التسجيل`,
          detail: "اكتمل الاعتماد ولم يُرسل بعد.",
          view: "schedules", ...target(scope),
        });
      }
      if (isHead && approval.pendingAdditions.length && !accepted) {
        items.push({
          id: key(scope, `additions-${approval.pendingAdditions.length}`), tone: "action",
          title: `${plural(approval.pendingAdditions.length, "شعبةٌ أُضيفت", "شعبتان أُضيفتا", "شعب أُضيفت")} بعد اعتمادك`,
          detail: "وافق عليها ليُعاد الإرسال.",
          view: "schedules", ...target(scope),
        });
      }
      const due = scope.deadline;
      if (!accepted && !approval.rounds.length && due?.effective && !isHead) {
        const days = Number(due.daysLeft);
        if (due.past || (Number.isFinite(days) && days <= 7)) {
          items.push({
            id: key(scope, `deadline-${due.effective}`), tone: "alert",
            title: due.past ? "انقضى موعد تسليم الجدول" : days <= 0 ? "اليوم آخر موعد لتسليم الجدول" : `بقي ${plural(days, "يومٌ واحد", "يومان", "أيام")} على تسليم الجدول`,
            detail: due.past ? "يلزم تمديدٌ من رئيس التسجيل قبل التسليم." : `آخر موعد ${day(due.effective)}.`,
            view: "schedules", ...target(scope),
          });
        }
      }
    }
  }

  /* ── طلباتُ الأساتذة: لكل من يعمل على الجدول، أياً كانت صفته ─────────
     طلبٌ واحد لكل أستاذ باسمه، والمعرّفُ يحمل وقتَ الإرسال وعددَ البنود —
     فإن أرسل الأستاذ من جديد صار الإشعارُ «جديداً» مرّةً أخرى. */
  const byRequest = new Map<string, { name: string; count: number; at?: string; places: string[]; scope: CenterScope }>();
  for (const scope of scopes) {
    for (const entry of scope.pendingRequests || []) {
      const current = byRequest.get(entry.requestId) || { name: entry.instructorName, count: 0, at: entry.at, places: [], scope };
      current.count += entry.count;
      current.places.push(placeOf(scope));
      byRequest.set(entry.requestId, current);
    }
  }
  for (const [requestId, entry] of byRequest) {
    items.push({
      id: `request:${requestId}:${entry.count}:${entry.at || ""}`, tone: "action",
      title: `${entry.name} ${entry.count === 1 ? "طلب تعديلاً" : `طلب ${plural(entry.count, "تعديلاً", "تعديلين", "تعديلات")}`}`,
      detail: [...new Set(entry.places)].join(" · "),
      view: "instructorRequests", at: entry.at, ...target(entry.scope),
    });
  }

  if (DEANS.has(role) || role === "admin") {
    const total = scopes.length;
    const done = scopes.filter(scope => lastAccepted(scope.approval)).length;
    if (total > 0) {
      items.push({
        id: `final:${done}:${total}`, tone: done === total ? "done" : "waiting",
        title: done === total ? "كل جداول الأقسام معتمدة" : `المعتمد ${done} من ${total} جداول`,
        detail: done === total ? "الجداول النهائية جاهزة للاطّلاع." : `بقي ${total - done} لم يعتمده التسجيل بعد.`,
        view: "reportDepartment",
      });
    }
    for (const scope of scopes) {
      const accepted = lastAccepted(scope.approval);
      if (!accepted?.acceptedAt || scope.approval.status !== "accepted") continue;
      items.push({
        id: key(scope, "final"), tone: "done",
        title: `اعتُمد جدول ${placeOf(scope)}`,
        detail: scope.collegeName,
        view: "reportDepartment", at: accepted.acceptedAt, ...target(scope),
      });
    }
  }

  const rank: Record<NotificationTone, number> = { alert: 0, action: 1, waiting: 2, done: 3 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || String(b.at || "").localeCompare(String(a.at || "")));
}
