/**
 * ── «ما الجديد؟» في مساري ──────────────────────────────────────────────────────
 *
 * الطالبُ لا جرسَ له ولا بريد: صفحةٌ يفتحها حين يشاء. فتُشتقّ إشعاراتُه من حاله لحظةَ فتحها
 * (كجرس العاملين: لا يُخزَّن شيءٌ، فلا إشعارَ يبقى بعد زوال سببه): ما يُطلب منه الآن، وما
 * صار جاهزاً له، وما قرّره قسمُه أو التسجيلُ في طلبه.
 *
 * مرتّبةٌ بما يستحقّ نظرَه أولاً: ما يُطلب منه، فما رُدّ، فما جدّ، فما تمّ.
 */
export type StudentNoticeTone = "action" | "alert" | "info" | "done";
export type StudentNoticeTarget = "setup" | "wishes" | "ticket" | "report" | "cases" | "advice";

export interface StudentNotice {
  id: string;
  tone: StudentNoticeTone;
  icon: "edit" | "ticket" | "check" | "info" | "clock" | "lock" | "spark";
  title: string;
  detail?: string;
  target: StudentNoticeTarget;
}

export interface StudentCaseCourse { courseId: number; name: string; state: "awaiting-registration" | "committee-rejected" | "registered" | "rejected" | "pending"; reasonCode?: string; note?: string; dropped?: boolean; /** موافقةُ اللجنة فتحت له شعبةً في الجدول. */ opened?: boolean }
export interface StudentNoticeInput {
  setupDone: boolean;
  phase: { mode: string; canEditWishes: boolean; canReport: boolean; line: string; nextAt?: string; nextLabel?: string };
  hasWishes: boolean;
  ticket: { stale: boolean; window: number; of: number; start?: string; end?: string; windowName?: string } | null;
  reportAnswered: boolean;
  reportCourses: number;
  cases: StudentCaseCourse[];
  /** شعبٌ فتحها القسمُ حديثاً لمقرراتٍ أرادها الطالبُ أو تعثّر فيها (من اقتراح الرادار/مركز الذكاء). */
  opened?: Array<{ courseId: number; name: string; section: string }>;
}

export const REJECT_REASON_AR: Record<string, string> = {
  "not-eligible": "لا تنطبق عليك الشروط", "not-in-plan": "ليس من خطتك الدراسية", prerequisite: "متطلّبٌ سابق لم يُستوفَ",
  duplicate: "طلبٌ مكرّر أو سبق تسجيله", other: "سببٌ آخر",
};

const order: Record<StudentNoticeTone, number> = { action: 0, alert: 1, info: 2, done: 3 };

export function buildStudentNotices(input: StudentNoticeInput): StudentNotice[] {
  const out: StudentNotice[] = [];
  const { phase } = input;
  if (!input.setupDone) {
    out.push({ id: "setup", tone: "action", icon: "edit", title: "أكمل ملفّك", detail: "اختر قسمك وصحيفتك وما أنجزته لتُبنى لك الخطط.", target: "setup" });
  }
  if (input.setupDone && phase.canEditWishes && !input.hasWishes) {
    out.push({ id: "wishes-open", tone: "action", icon: "edit", title: "اكتب رغباتك لهذا الفصل", detail: phase.nextAt ? `${phase.nextLabel || "تنتهي الرغبات"} ${phase.nextAt}` : phase.line, target: "wishes" });
  }
  if (input.ticket) {
    const t = input.ticket;
    if (t.stale) out.push({ id: "ticket-stale", tone: "info", icon: "info", title: "عدّلت ملفّك بعد آخر حساب", detail: "ستتحدّث تذكرتك في التحديث القادم.", target: "ticket" });
    out.push({
      id: `ticket-ready:${t.window}`, tone: "info", icon: "ticket", title: `تذكرتك جاهزة — نافذتك ${t.window} من ${t.of}`,
      detail: t.start ? `${t.windowName || "نافذتك"}: ${t.start}${t.end ? ` → ${t.end}` : ""}` : "يحدّد موعدَها صاحبُ القرار.", target: "ticket",
    });
  }
  if (phase.canReport && input.reportCourses > 0 && !input.reportAnswered) {
    out.push({ id: "report-open", tone: "action", icon: "check", title: "هل سجّلت؟ أخبرنا", detail: "ما سجّلته وما تعثّرت فيه — ويساعدك قسمك إن تعثّرت.", target: "report" });
  }
  if (input.reportAnswered) out.push({ id: "report-done", tone: "done", icon: "check", title: "وصل جوابك على «هل سجلت؟»", target: "report" });

  if (input.setupDone && !input.ticket) {
    out.push({ id: "advice", tone: "info", icon: "spark", title: "مقترحك الشخصي لهذا الفصل", detail: "ما تسجّله ولماذا — من صحيفتك وما يُطرح.", target: "advice" });
  }
  for (const row of input.opened || []) {
    out.push({ id: `opened:${row.courseId}`, tone: "action", icon: "ticket", title: `فُتحت شعبةٌ جديدة لـ«${row.name}»`, detail: row.section ? `الشعبة ${row.section} — جرّبها في تذكرتك.` : "جرّبها في تذكرتك.", target: "ticket" });
  }
  for (const course of input.cases) {
    if (course.dropped) continue;
    if (course.state === "committee-rejected" || course.state === "rejected") {
      const why = course.note || REJECT_REASON_AR[course.reasonCode || ""] || "";
      out.push({ id: `case:${course.courseId}:${course.state}`, tone: "alert", icon: "lock", title: course.state === "rejected" ? `ردّ التسجيلُ «${course.name}»` : `لم يوافق القسمُ على «${course.name}»`, detail: why, target: "cases" });
    } else if (course.state === "awaiting-registration") {
      out.push({ id: `case:${course.courseId}:awaiting`, tone: "info", icon: "clock", title: `وافق القسمُ على «${course.name}»`, detail: course.opened ? "وفُتحت لك شعبةٌ جديدة في الجدول؛ تظهر مواعيدها حين يعتمد القسمُ جدولَه. بانتظار التسجيل." : "بانتظار التسجيل.", target: "cases" });
    } else if (course.state === "registered") {
      out.push({ id: `case:${course.courseId}:registered`, tone: "done", icon: "check", title: `سُجّل لك «${course.name}»`, target: "cases" });
    } else {
      out.push({ id: `case:${course.courseId}:pending`, tone: "info", icon: "clock", title: `طلبُك في «${course.name}» ينتظر قرار القسم`, target: "cases" });
    }
  }
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
