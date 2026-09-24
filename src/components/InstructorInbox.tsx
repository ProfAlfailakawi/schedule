/**
 * ── وارِدُ الأساتذة ─────────────────────────────────────────────────────────
 *
 * القسم أرسل لخمسةٍ وخمسين أستاذاً مسوّدةَ جدولهم. أجاب أربعون: اثنان وعشرون
 * قالوا «كما هو»، وثمانية عشر طلبوا تغييراً. وهذه الشاشة هي ما يُفتح بعدها.
 *
 * **ولا تعرض الجدول.** تعرض ما تحرّك وحده — سطران لكل بند، «كان» و«طلب» —
 * لأن عرضَ الجدول كاملاً يجعل المنسّقَ يبحث عن التعديل بعينه في أربعين صفّاً،
 * وهو يعرف سلفاً أنه أربعةٌ منها.
 *
 * **والترتيب هو العمل.** الأخضرُ أولاً لأنه يُثبَّت بضغطة، ثم الأصفرُ الذي
 * يحتاج قراءةً، ثم الأحمرُ الذي يحتاج قراراً. فينتهي ثمانون بالمئة من الوارد
 * في دقائق، ويذهب الانتباهُ كلُّه إلى ما يستحقّه.
 *
 * **والاثنان والعشرون الذين لم يغيّروا شيئاً سطرٌ واحدٌ مطويّ.** لا بطاقةَ
 * لهم ولا فتحَ: «تثبيت الكل» وينتهون. فتحُ اثنتين وعشرين بطاقةً لتقول كلُّ
 * واحدةٍ منها «لا جديد» تلوّثٌ بصريٌّ لا معلومة.
 *
 * **والتثبيت يمرّ بمسار الحفظ نفسه.** هذه الشاشةُ قائمةُ انتظارٍ أمام الزرّ
 * الذي يضغطه المنسّق بيده كل يوم، لا مخزنٌ موازٍ: حين يُثبَّت بندٌ يُستدعى
 * `/api/schedules` بحمولةِ الصفّ الحقيقي وقد تغيّر فيه اليومُ والوقت وحدهما —
 * فيرث التحقّقَ والتدقيقَ والنسخَ وتقريرَ التغييرات كما هي، ويظهر التعديلُ في
 * «تغييرات الجدول» تلقائياً بلا سطرٍ واحدٍ مكتوبٍ لذلك. ثم يُسجَّل القرار.
 *
 * **والرفض لا يُكتب في الجدول.** يبقى في سجلّ الطلب، يراه صاحبُه وحده مع
 * سببه والبدائل. ولا أثرَ له في تقرير التغييرات، لأن شيئاً لم يتغيّر.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Inbox, Link2, Loader2, MailQuestion,
  MessageSquare, Send, ShieldAlert, ShieldCheck, SlidersHorizontal, X,
} from "lucide-react";
import QuickCreatePopover, { type QuickDraft, type QuickSeed } from "./QuickCreatePopover";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import {
  Badge, EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface,
} from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { reachAboutCard } from "../utils/reachInstructor";
import { putHandoff } from "../utils/requestHandoff";
import { currentTermId } from "../utils/termSequence";
import type {
  AdTerm, FSchedule, InstructorRequest, InstructorRequestItem, InstructorRequestRejectReason,
} from "../types";

interface Props {
  /**
   * نطاقُ الحساب كما يرسله الخادم.
   *
   * الأسماءُ تصل في `AdCollegeName` و`AdSectionName` — وهي أسماءُ الحقول في
   * `clientScopeDetails`، لا أسماءٌ تُخمَّن. وقراءتُها باسمٍ آخر لا تُخطئ
   * بصوتٍ مسموع: تسقط إلى البديل فتظهر «كلية ٥» مكان اسم الكلية، ويبدو
   * كأن الحساب يحمل نطاقاتٍ ليست له.
   */
  scopes: Array<{ AdCollegeId: number; AdSectionId: number; AdCollegeName?: string; AdSectionName?: string }>;
  powerAdmin?: boolean;
  /** يفتح ورشة الجدول. تحتاجه الإضافةُ وحدها، ولا تفعل الشاشةُ شيئاً بدونه. */
  onNavigate?: (view: string) => void;
}

interface InboxRequest extends InstructorRequest {
  instructorName: string;
  instructorMobile: string;
  changedCount: number;
  sectionName?: string;
}

interface Totals {
  sent: number; answered: number; unchanged: number;
  changed: number; unopened: number; settled: number;
}

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: any = {};
  if (body) {
    try { data = JSON.parse(body); }
    catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); }
  }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

/** أسبابُ الرفض كما تُقرأ. قائمةٌ مغلقةٌ تجعل السببَ قابلاً للعدّ عبر الفصول. */
const REJECT_REASONS: Array<[InstructorRequestRejectReason, string]> = [
  ["room", "لا تتوفّر قاعة مناسبة"],
  ["instructor", "يتعارض مع أستاذ آخر"],
  ["regulation", "مخالفة للائحة"],
  ["cohort", "يتقاطع مع مقرّر يشترك طلبتُه"],
  ["load", "النصاب"],
  ["department", "قرار القسم"],
  ["other", "سبب آخر"],
];

const ACTION_LABEL: Record<string, string> = {
  keep: "كما هو", change: "تعديل", delete: "حذف", add: "إضافة",
};

/** أخضرُ ثم أصفرُ ثم أحمر — وهو ترتيبُ العمل لا ترتيبُ الخطورة. */
const VERDICT_ORDER: Record<string, number> = { clear: 0, exception: 1, conflict: 2 };

const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
};

/* ── ورقةُ الرفض ────────────────────────────────────────────────────────── */

function RejectSheet({ item, onClose, onSubmit, busy }: {
  item: InstructorRequestItem;
  onClose: () => void;
  onSubmit: (reason: InstructorRequestRejectReason, note: string, alternatives: any[]) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState<InstructorRequestRejectReason | "">("");
  /* البدائلُ يقترحها النظام سلفاً من أقرب الأوقات المتاحة، والمنسّقُ يوافق أو
     يحذف — لا يكتبها. وهو الفرقُ بين رفضٍ يُغلق الباب ورفضٍ يفتح آخر. */
  const slotKey = (slot: { day: string; days?: string[]; start: string; end: string }) =>
    `${(slot.days?.length ? slot.days : [slot.day]).join(",")}|${slot.start}|${slot.end}`;
  const [offered, setOffered] = useState<string[]>((item.nearestTimes || []).map(slotKey));
  const [note, setNote] = useState("");

  const toggle = (key: string) =>
    setOffered(current => current.includes(key) ? current.filter(entry => entry !== key) : [...current, key]);

  return (
    <div className="changes-extend-sheet" role="dialog" aria-modal="true" aria-label="رفض بند">
      <div className="changes-extend-card">
        <header>
          <strong>رفض «{item.after?.courseName || item.before?.courseName || "البند"}»</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يغيّر شيئاً"><X /></button>
        </header>

        <label>
          <span>السبب</span>
          <select value={reason} onChange={event => setReason(event.target.value as any)}>
            <option value="">اختر السبب</option>
            {REJECT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        {(item.nearestTimes || []).length ? (
          <div className="request-alternatives">
            <span>بدائلُ تُعرض عليه</span>
            <div className="changes-filter-chips">
              {(item.nearestTimes || []).map(slot => {
                const key = slotKey(slot);
                const on = offered.includes(key);
                return (
                  <button
                    key={key} type="button" className="changes-chip"
                    data-active={on || undefined} aria-pressed={on}
                    data-guide-ignore="اختيار بديلٍ يُعرض — يُحفظ مع القرار"
                    onClick={() => toggle(key)}
                  >
                    {(slot.days?.length ? slot.days : [slot.day]).map(day => INBOX_DAY_NAMES[day] || day).join(" · ")} · <bdi dir="ltr">{slot.start} – {slot.end}</bdi>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <label>
          <span>سطرٌ للأستاذ <small>اختياري</small></span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="القاعة محجوزة لمختبر في هذا الوقت" />
        </label>

        <div className="changes-extend-actions">
          <SecondaryButton type="button" onClick={onClose} data-guide-ignore="إلغاء — لا يغيّر شيئاً">تراجع</SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={busy || !reason}
            data-guide-target="requests.action.reject"
            onClick={() => onSubmit(reason as InstructorRequestRejectReason, note, offered.map(key => {
              const [days, start, end] = key.split("|");
              const list = days.split(",").filter(Boolean);
              return { day: list[0], days: list, start, end };
            }))}
          >
            {busy ? "يحفظ…" : "سجّل الرفض"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── الفحصُ الحيّ: سياسةُ «الجدول الدراسي» نفسُها ─────────────────────────
 *
 * حكمُ الطلب يُحسب لحظةَ فتح الوارد، والجدولُ يتحرّك بعدها. فقبل أن يُعرض زرُّ
 * «ثبّت» يُسأل الخادمُ بالسؤال نفسِه الذي يسأله نموذجُ الجدول الدراسي قبل
 * الحفظ (`check-conflicts`): الأستاذُ والقاعةُ والطلبةُ المشتركون والشعبةُ
 * المكرّرة، في كل الكليات. فما يُمنع هناك يُمنع هنا، ويُقال سببُه هنا. */

export interface LiveIssue { severity: "high" | "medium" | "low"; message: string; detail?: string; otherId?: number }

export const proposedRow = (row: InboxRequest, item: InstructorRequestItem, current?: FSchedule): any | null => {
  if (item.action === "delete" || item.action === "keep") return null;
  const slots = item.slots || [];
  if (!slots.length || !slots[0]?.start || !slots[0]?.end) return null;
  const days = new Set(slots.map(slot => slot.day));
  const base: any = item.action === "change"
    ? (current ? { ...current } : null)
    : {
        AdInstructorId: Number(row.AdInstructorId),
        AdCourseId: Number(item.after?.courseId || 0),
        AdCollegeId: Number(item.after?.collegeId || row.AdCollegeId),
        AdSectionId: Number(item.after?.sectionId || row.AdSectionId),
        AdTermId: Number(row.AdTermId),
      };
  if (!base) return null;
  return {
    ...base,
    fsunday: days.has("fsunday"), fmonday: days.has("fmonday"), ftuesday: days.has("ftuesday"),
    fwednesday: days.has("fwednesday"), fthursday: days.has("fthursday"),
    fstarttime: slots[0].start, fendtime: slots[0].end,
    excludeId: item.action === "change" ? Number(item.rowId || 0) : 0,
  };
};

function useLiveCheck(candidate: any | null, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; issues: LiveIssue[] | null }>({ loading: false, issues: null });
  const key = candidate ? JSON.stringify(candidate) : "";
  useEffect(() => {
    if (!enabled || !candidate) { setState({ loading: false, issues: null }); return; }
    const controller = new AbortController();
    setState(prev => ({ loading: true, issues: prev.issues }));
    fetch("/api/schedules/check-conflicts", {
      method: "POST", credentials: "include", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: key,
    })
      .then(response => (response.ok ? response.json() : { conflicts: [] }))
      .then(data => setState({
        loading: false,
        issues: (data.conflicts || []).map((conflict: any) => ({
          severity: conflict.severity === "high" ? "high" : conflict.severity === "medium" ? "medium" : "low",
          message: String(conflict.message || "تعارض"),
          detail: conflict.detail ? String(conflict.detail) : undefined,
          otherId: Number(conflict.rowId || conflict.otherId || 0) || undefined,
        })),
      }))
      .catch(error => { if (error?.name !== "AbortError") setState({ loading: false, issues: null }); });
    return () => controller.abort();
  }, [key, enabled]);
  return state;
}

/** حالةُ البند في كلمة: ما يراه المنسّق قبل أن يقرأ التفاصيل. */
type Readiness = "ready" | "review" | "blocked" | "checking" | "waiting";
const READINESS: Record<Readiness, string> = {
  ready: "جاهز للتثبيت", review: "يحتاج قرارك", blocked: "ممنوع", checking: "يفحص…", waiting: "بانتظار قسمٍ آخر",
};

/* ── بطاقةُ أستاذ ───────────────────────────────────────────────────────── */

function RequestCard({ row, currentRows, onDecide, busyKey, filter, rowErrors }: {
  key?: React.Key;
  row: InboxRequest;
  currentRows: Map<number, FSchedule>;
  onDecide: (index: number, state: "fixed" | "rejected", extra?: any) => void;
  busyKey: string | null;
  filter: (item: InstructorRequestItem) => boolean;
  rowErrors: Record<string, string>;
}) {
  const [rejecting, setRejecting] = useState<number | null>(null);

  const items = useMemo(() => (row.items || [])
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.action !== "keep" && !(entry.item as any).hidden && filter(entry.item))
    .sort((a, b) => (VERDICT_ORDER[a.item.verdict || "clear"] ?? 0) - (VERDICT_ORDER[b.item.verdict || "clear"] ?? 0)),
    [row.items, filter]);

  if (!items.length) return null;

  return (
    <article className="request-card">
      <header className="request-card-head">
        <div>
          <strong>{row.instructorName}</strong>
          {row.sectionName ? <span className="request-card-section">قسم {row.sectionName.replace(/^قسم\s+/, "")}</span> : null}
          <small>{countOf(items.length, AR.change)}{row.submittedAt ? ` · ${arabicDate(row.submittedAt)}` : ""}</small>
        </div>
        {/* ── من وقّعه ────────────────────────────────────────────────────
            الرابطُ يصل في واتساب ويُعاد توجيهه، فضغطةُ «أرسل» وحدَها لا تُثبت
            أن صاحبه هو من أرسل. وقد صار الإرسالُ يُطابِق رقمَه المدنيَّ
            بسجلّه، فيُقال ذلك هنا برمزه — وهو ما يُطابَق به الطلبُ بعد شهرين
            إن أُنكر. وطلبٌ قديمٌ أُرسل قبل هذا لا يحمل توقيعاً، ويُقال ذلك
            صراحةً بدل أن يُفترض. */}
        <div className="request-card-flags">
        {row.signature?.verifyCode ? (
          <span className="request-signed" title={`وقّعه صاحبه بالرقم المدني — ${arabicDate(row.signature.at)}`}>
            <ShieldCheck aria-hidden="true" />موقَّع <code>{row.signature.verifyCode}</code>
          </span>
        ) : row.submittedAt ? (
          <span className="request-signed" data-missing="true" title="أُرسل قبل أن يصير الإرسال توقيعاً">
            <ShieldAlert aria-hidden="true" />بلا توقيع
          </span>
        ) : null}
        {row.status === "settled" ? <Badge tone="success">انتهى</Badge> : null}
        {/* ── إبلاغُ الأستاذ بالقرار ──────────────────────────────────────
            حين يُقرَّر بندٌ واحدٌ على الأقل: رسالةُ واتساب جاهزة تعدّ ما ثُبّت
            وما رُفض، ومعها رابطُه نفسه ليرى التفاصيل والبدائل. */}
        {(() => {
          const decidedItems = (row.items || []).filter(item => item.action !== "keep" && !(item as any).hidden && item.decision?.state);
          if (!decidedItems.length) return null;
          const fixed = decidedItems.filter(item => item.decision?.state === "fixed").length;
          const rejected = decidedItems.length - fixed;
          const summary = [fixed ? `ثُبّت: ${countOf(fixed, AR.change)}` : "", rejected ? `رُفض: ${countOf(rejected, AR.change)}` : ""].filter(Boolean).join(" · ");
          const reach = reachAboutCard(
            { AdInstructorName: row.instructorName, AdInstructorMobile: row.instructorMobile },
            `${location.origin}/r/${row.linkId}`, "decided", summary,
          );
          return reach.href ? (
            <a className="request-notify" href={reach.href} target="_blank" rel="noreferrer noopener" title="رسالة واتساب جاهزة بالقرار ورابط الطلب">
              <Send aria-hidden="true" /> أبلغ الأستاذ
            </a>
          ) : (
            <span className="request-notify" data-blocked="true" title={reach.blocked || ""}><Send aria-hidden="true" /> لا رقم جوّال</span>
          );
        })()}
        </div>
      </header>

      {/* ── جدولٌ لا كومةُ بطاقات ─────────────────────────────────────────
          كلُّ بندٍ صفٌّ واحد بأعمدةٍ ثابتة: ما هو، وأيُّ مقرّر، وكان، والمطلوب،
          والفحص، والقرار. فيُقرأ الطلبُ كلُّه بنظرة كما يُقرأ تقريرُ
          الاستعلامات، وتلوّن الحالةُ الصفَّ كلَّه: أخضرُ مضاف، وأصفرُ معدّل،
          وأحمرُ محذوف. وعلى الهاتف ينقلب كلُّ صفٍّ بطاقةً بعناوين أعمدتها. */}
      <div className="request-table-wrap">
        <table className="request-table">
          <thead>
            <tr>
              <th scope="col">الطلب</th>
              <th scope="col">المقرر</th>
              <th scope="col">كان</th>
              <th scope="col">المطلوب</th>
              <th scope="col">الفحص</th>
              <th scope="col">القرار</th>
            </tr>
          </thead>
          <tbody>
        {items.map(({ item, index }) => (
          <RequestRow
            key={`${row.id}:${index}`}
            row={row}
            item={item}
            index={index}
            current={item.rowId == null ? undefined : currentRows.get(Number(item.rowId))}
            busy={busyKey === `${row.id}:${index}`}
            rejecting={rejecting === index}
            error={rowErrors[`${row.id}:${index}`]}
            onReject={() => setRejecting(index)}
            onCloseReject={() => setRejecting(null)}
            onDecide={onDecide}
          />
        ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ── صفُّ بند ─────────────────────────────────────────────────────────────
 * الحكمُ المحفوظ مع الطلب والفحصُ الحيّ يُقرآن معاً: ما منعه أحدُهما مُنع،
 * وما نبّه إليه أحدُهما قيل. ولا يُكرَّر السببُ نفسُه مرّتين. */
function RequestRow({ row, item, index, current, busy, rejecting, error, onReject, onCloseReject, onDecide }: {
  key?: React.Key;
  row: InboxRequest; item: InstructorRequestItem; index: number; current?: FSchedule;
  busy: boolean; rejecting: boolean; error?: string;
  onReject: () => void; onCloseReject: () => void;
  onDecide: (index: number, state: "fixed" | "rejected", extra?: any) => void;
}) {
  const decided = item.decision?.state;
  const candidate = useMemo(() => proposedRow(row, item, current), [row, item, current]);
  const live = useLiveCheck(candidate, !decided && item.action !== "delete");
  const reasons = item.reasons || [];
  const seen = new Set(reasons.map(reason => reason.text));
  /* ── ما يُفرغه الطلبُ نفسُه ─────────────────────────────────────────────
     أستاذٌ نقل محاضرةً من الثامنة وأضاف أخرى في الثامنة: في الجدول الحاليّ
     هما متعارضتان، وفي الطلب لا. فالتعارضُ مع صفٍّ ينقله أو يحذفه بندٌ شقيقٌ
     لم يُقرَّر بعد ليس مانعاً — هو ترتيب: يُثبَّت الشقيقُ أولاً ثم هذا. */
  const siblings = new Map<number, { index: number; name: string; elsewhere?: boolean }>();
  (row.items || []).forEach((other, at) => {
    if (at === index || other.decision?.state || other.rowId == null) return;
    if (other.action !== "change" && other.action !== "delete") return;
    const elsewhere = Boolean((other as any).hidden);
    siblings.set(Number(other.rowId), {
      index: at, elsewhere,
      name: elsewhere ? "محاضرته في قسمٍ آخر" : String(other.before?.courseName || other.after?.courseName || "محاضرة"),
    });
  });
  const allLive = (live.issues || []).filter(issue => !seen.has(issue.message));
  const dependsOn: Array<{ index: number; name: string; elsewhere?: boolean }> = [...new Map<number, { index: number; name: string; elsewhere?: boolean }>(allLive
    .filter(issue => issue.otherId && siblings.has(issue.otherId))
    .map(issue => [issue.otherId!, siblings.get(issue.otherId!)!] as [number, { index: number; name: string; elsewhere?: boolean }])).values()];
  /* ما يُفرغه قسمٌ آخر لا يُثبَّت من هنا: ينتظر قرارَ ذلك القسم. */
  const waitsElsewhere = dependsOn.some(entry => entry.elsewhere);
  const liveIssues = allLive.filter(issue => !(issue.otherId && siblings.has(issue.otherId)));
  const blocked = waitsElsewhere || item.verdict === "conflict" || reasons.some(reason => reason.blocking)
    || liveIssues.some(issue => issue.severity === "high") || (item.action === "change" && !current);
  const readiness: Readiness = decided ? "ready"
    : item.action === "delete" ? "ready"
    : waitsElsewhere && !liveIssues.some(issue => issue.severity === "high") && !reasons.some(reason => reason.blocking) ? "waiting"
    : blocked ? "blocked"
    : live.loading && !live.issues ? "checking"
    : (reasons.length || liveIssues.length || dependsOn.length) ? "review" : "ready";

  return (
    <>
      <tr className="request-row" data-action={item.action} data-verdict={item.verdict || "clear"} data-decided={decided || undefined} data-readiness={readiness}>
        <td data-label="الطلب">
          <span className="request-action" data-action={item.action}>{ACTION_LABEL[item.action] || item.action}</span>
        </td>
        <td data-label="المقرر">
          <strong>{item.after?.courseName || item.before?.courseName || "—"}</strong>
          {item.before?.sectionCode ? <small>شعبة {item.before.sectionCode}</small> : null}
          {item.action === "add" && item.after?.collegeName ? <small>{item.after.collegeName}</small> : null}
        </td>
        <td data-label="كان">
          {item.before && item.action !== "add" ? (
            <span className={item.action === "delete" ? "request-was-gone" : undefined}>
              {item.before.days}<br /><bdi dir="ltr">{item.before.time}</bdi>
              {item.before.room ? <small className="request-room"><bdi dir="ltr">{item.before.room}</bdi></small> : null}
            </span>
          ) : <span className="request-none">—</span>}
        </td>
        <td data-label="المطلوب">
          {item.action === "delete" ? <span className="request-none">حذف الموعد</span>
            : item.after ? <span>{item.after.days}<br /><bdi dir="ltr">{item.after.time}</bdi></span>
            : <span className="request-none">—</span>}
          {item.excuse ? <small className="request-excuse"><MessageSquare aria-hidden="true" /> {item.excuse}</small> : null}
        </td>
        <td data-label="الفحص">
          {!decided ? (
            <span className="request-readiness" data-readiness={readiness}>
              {readiness === "checking" ? <Loader2 aria-hidden="true" className="spin" />
                : readiness === "waiting" ? <Clock3 aria-hidden="true" />
                : readiness === "blocked" ? <ShieldAlert aria-hidden="true" />
                : readiness === "review" ? <AlertTriangle aria-hidden="true" />
                : <ShieldCheck aria-hidden="true" />}
              {item.action === "delete" ? "حذفٌ لا يُفحص" : READINESS[readiness]}
            </span>
          ) : null}
          {item.action !== "delete" && (reasons.length || liveIssues.length) ? (
            <ul className="request-issues">
              {reasons.map((reason, at) => (
                <li key={`r${at}`} data-severity={reason.blocking ? "high" : "medium"}>
                  {reason.blocking ? <ShieldAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                  <span>{reason.text}</span>
                </li>
              ))}
              {liveIssues.map((issue, at) => (
                <li key={`l${at}`} data-severity={issue.severity}>
                  {issue.severity === "high" ? <ShieldAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                  <span>{issue.message}{issue.detail ? <small>{issue.detail}</small> : null}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {(item as any).awaitedElsewhere && !decided ? (
            <p className="request-depends" data-tone="linked">
              <ArrowRight aria-hidden="true" />
              <span>قسمٌ آخر ينتظر هذا {item.action === "delete" ? "الحذف" : "النقل"} ليُكمل طلبَ الأستاذ — ثبّته أولاً.</span>
            </p>
          ) : null}
          {dependsOn.length && !decided ? (
            <p className="request-depends">
              <ArrowRight aria-hidden="true" />
              <span>{waitsElsewhere
                ? "يعتمد على حذف محاضرته في قسمٍ آخر — بانتظار قرار ذلك القسم."
                : <>يُفرغ هذا الوقتَ طلبُه الآخر: {dependsOn.map(entry => `«${entry.name}»`).join(" و")} — يُثبَّت ذلك أولاً تلقائياً.</>}</span>
            </p>
          ) : null}
          {item.action === "change" && !current && !decided ? (
            <p className="request-issue-note">لم يعد هذا الموعد في الجدول — ربما حُذف أو نُقل بعد الطلب.</p>
          ) : null}
          {(item.roomCandidates || []).length && item.action !== "delete" && !decided ? (
            <small className="request-rooms">قاعاتٌ متاحة في هذا الوقت: {countOf(item.roomCandidates!.length, AR.room)}</small>
          ) : null}
        </td>
        <td data-label="القرار">
          {decided ? (
            <p className="request-decided" data-state={decided}>
              {decided === "fixed" ? <><Check aria-hidden="true" /> ثُبّت</> : <><X aria-hidden="true" /> رُفض — {REJECT_REASONS.find(([value]) => value === item.decision?.reasonCode)?.[1] || "بلا سبب"}</>}
              {item.decision?.note ? <span> · {item.decision.note}</span> : null}
            </p>
          ) : (
            <div className="request-actions">
              <PrimaryButton
                type="button"
                data-guide-target="requests.action.fix"
                disabled={busy || blocked || readiness === "checking"}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onDecide(index, "fixed", { current, anchor: { x: rect.left + rect.width / 2, y: rect.bottom }, after: dependsOn.filter(entry => !entry.elsewhere).map(entry => entry.index) });
                }}
                title={waitsElsewhere ? "ينتظر قرار القسم الآخر في حذف محاضرته" : blocked ? "لا يُثبَّت بندٌ ممنوع — عالج سببه أو ارفضه" : undefined}
              >
                {busy ? "يحفظ…" : item.action === "add" ? "أضِفه الآن" : "ثبّت"}
              </PrimaryButton>
              <SecondaryButton type="button" data-guide-target="requests.action.reject" onClick={onReject}>
                ارفض
              </SecondaryButton>
            </div>
          )}
          {error ? <p className="request-row-error"><ShieldAlert aria-hidden="true" />{error}</p> : null}
        </td>
      </tr>
      {rejecting ? (
        <tr className="request-reject-row"><td colSpan={6}>
          <RejectSheet
            item={item}
            busy={busy}
            onClose={onCloseReject}
            onSubmit={(reason, note, alternatives) => {
              onDecide(index, "rejected", { reasonCode: reason, note, alternatives });
              onCloseReject();
            }}
          />
        </td></tr>
      ) : null}
    </>
  );
}

function FilterGroup({ label, value, options, onChange }: {
  label: string; value: string;
  options: Array<{ value: string; label: string; count?: number; tone?: "ok" | "warn" | "bad" }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="request-filter" role="group" aria-label={label}>
      <span className="request-filter-label">{label}</span>
      <div className="request-filter-chips">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            data-tone={option.tone}
            data-guide-ignore="تصفية الوارد — عرضٌ لا فعل"
            disabled={option.count === 0 && value !== option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <b>{option.count.toLocaleString("ar-KW-u-nu-latn")}</b> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* رسائلُ الحفظ كُتبت لنموذج «الجدول الدراسي» — «الحقول بالأحمر» لا معنى لها
   هنا حيث لا حقول. فتُقال بما يعنيه البندُ نفسُه. */
const inboxMessage = (raw: string) => {
  const text = String(raw || "");
  if (/الحقول المطلوبة|المبنى|القاعة غير/.test(text)) return "هذا الموعد مسجّلٌ في الجدول بلا مبنى أو قاعة معتمدة، فلا يُنقل قبل تحديدها. افتحه في «الجدول الدراسي» وحدّد قاعته، ثم ثبّت.";
  if (/مقفل|عند التسجيل/.test(text)) return "الجدول عند التسجيل الآن، والتعديل مقفلٌ حتى يُقبل أو يُرجَع.";
  if (/انتهى هذا الفصل/.test(text)) return text;
  return text || "تعذّر التثبيت.";
};

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

const INBOX_DAY_NAMES: Record<string, string> = {
  fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس",
};

export default function InstructorInbox({ scopes, powerAdmin = false, onNavigate }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  const [collegeId, setCollegeId] = useState(0);
  const [sectionId, setSectionId] = useState(0);
  const [rows, setRows] = useState<InboxRequest[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [currentRows, setCurrentRows] = useState<Map<number, FSchedule>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [showUnchanged, setShowUnchanged] = useState(false);
  /* ── المرشّحات ──────────────────────────────────────────────────────────
     أربعةُ أسئلةٍ يسألها المنسّق فعلاً: ما الذي ينتظرني؟ أيُّ نوع؟ ما الجاهزُ
     منه؟ وفي أيّ قسم؟ وكلٌّ منها زرٌّ واحد، لا قائمةٌ منسدلة. */
  const [stateFilter, setStateFilter] = useState<"pending" | "fixed" | "rejected" | "all">("pending");
  const [actionFilter, setActionFilter] = useState<"all" | "change" | "add" | "delete">("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | "clear" | "exception" | "conflict">("all");
  const [deptFilter, setDeptFilter] = useState(0);
  const [instructorFilter, setInstructorFilter] = useState(0);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState<{ row: InboxRequest; index: number; seed: QuickSeed } | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickClash, setQuickClash] = useState<Record<string, string | null>>({});
  /* ── ما يراه صاحبُ الصلاحية الكاملة ──────────────────────────────────────
   *
   * قوائمُ الكلية والقسم كانت تُبنى من نطاق الحساب وحدَه. وهو صوابٌ لمن له
   * نطاق، وخطأٌ لمن لا نطاقَ له لأن له الكلَّ: صاحبُ الصلاحية الكاملة كان يرى
   * الكليتين المسندتين إليه فقط، ويظنّ أن النظام لا يعرف غيرهما.
   *
   * والقاعدةُ مستقرّةٌ في الشاشات القديمة: الكتالوجُ كاملاً لمن له الكلّ،
   * ومُصفّىً بالنطاق لمن سواه. فتُقرأ هنا بالقاعدة نفسِها، لا بقاعدةٍ ثانيةٍ
   * تشبهها. */
  const [catalog, setCatalog] = useState<{
    colleges: Array<{ AdCollegeId: number; AdCollegeName: string }>;
    sections: Array<{ AdSectionId: number; AdCollegeId: number; AdSectionName: string }>;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await request("/api/terms");
        const list: AdTerm[] = Array.isArray(data) ? data : (data.terms || []);
        setTerms(list);
        setTermId(current => current || currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0));
      } catch (e: any) { setError(e.message); setTerms([]); }
    })();
  }, []);

  /* ولا يُقرأ الكتالوجُ إلا لمن يحتاجه: من له نطاقٌ يكفيه نطاقُه، ورحلتان
     إضافيتان في كل فتحةِ شاشةٍ ثمنٌ بلا مقابل. */
  useEffect(() => {
    if (!powerAdmin) { setCatalog(null); return; }
    void (async () => {
      try {
        const [colleges, sections] = await Promise.all([request("/api/colleges"), request("/api/sections")]);
        setCatalog({
          colleges: Array.isArray(colleges) ? colleges : (colleges.colleges || []),
          sections: Array.isArray(sections) ? sections : (sections.sections || []),
        });
      } catch { setCatalog(null); }
    })();
  }, [powerAdmin]);

  /* النطاقُ الافتراضيُّ نطاقُ الحساب حين يكون واحداً: من له قسمٌ واحدٌ لا
     يُسأل عن قسمه في كل فتحة. */
  /* جاء من إشعار: يفتح على قسم الطلب نفسه، لا على نطاقٍ فارغ. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("schedule:notify-focus");
      if (!raw) return;
      const focus = JSON.parse(raw);
      sessionStorage.removeItem("schedule:notify-focus");
      if (focus?.view !== "instructorRequests" || Date.now() - Number(focus.at || 0) > 60000) return;
      if (Number(focus.collegeId)) { setCollegeId(Number(focus.collegeId)); setSectionId(Number(focus.sectionId) || 0); }
    } catch { /* لا شيء */ }
  }, []);

  useEffect(() => {
    /* ومن له الكلُّ لا يُختار له شيء: اختيارُ أوّلِ كليةٍ في الكتالوج يُخفي
       عنه البقيّةَ خلف قراءةٍ بدأت بلا طلبه. */
    if (collegeId || powerAdmin || !scopes.length) return;
    setCollegeId(Number(scopes[0].AdCollegeId) || 0);
    if (scopes.length === 1) setSectionId(Number(scopes[0].AdSectionId) || 0);
  }, [scopes, collegeId, powerAdmin]);

  const load = useCallback(async () => {
    if (!collegeId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/instructor-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      setCurrentRows(new Map((data.currentRows || []).map((row: FSchedule) => [Number(row.id), row])));
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);
  /* الواردُ حيّ: طلبٌ يصل أو قرارٌ من زميلٍ يُعيد القراءةَ بهدوء، فلا يُثبِّت
     اثنان البندَ نفسه ولا ينتظر أحدٌ زرَّ تحديث. */
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let timer = 0;
    const source = new EventSource("/api/schedules/events");
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 900); };
    source.addEventListener("notify", soon);
    return () => { window.clearTimeout(timer); source.close(); };
  }, [load]);

  const collegeOptions = useMemo(() => {
    if (catalog) {
      return catalog.colleges
        .map(row => ({ value: Number(row.AdCollegeId), label: String(row.AdCollegeName || `كلية ${row.AdCollegeId}`) }))
        .filter(item => item.value)
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      const id = Number(scope.AdCollegeId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdCollegeName || `كلية ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, catalog]);

  const sectionOptions = useMemo(() => {
    if (catalog) {
      return catalog.sections
        .filter(row => !collegeId || Number(row.AdCollegeId) === collegeId)
        .map(row => ({ value: Number(row.AdSectionId), label: String(row.AdSectionName || `قسم ${row.AdSectionId}`) }))
        .filter(item => item.value)
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      if (collegeId && Number(scope.AdCollegeId) !== collegeId) continue;
      const id = Number(scope.AdSectionId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdSectionName || `قسم ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, collegeId, catalog]);

  const needle = ask.trim();
  const visible = useMemo(() => (rows || [])
    .filter(row => !needle || row.instructorName.includes(needle))
    .filter(row => !instructorFilter || Number(row.AdInstructorId) === instructorFilter),
    [rows, needle, instructorFilter]);

  /* الأساتذةُ الذين في الوارد فعلاً، ومن طلب منهم أولاً — كقائمة الأستاذ في
     «الجدول الدراسي». */
  const instructorOptions = useMemo(() => {
    const seen = new Map<number, { label: string; changed: boolean }>();
    for (const row of rows || []) {
      const id = Number(row.AdInstructorId);
      if (!id || seen.has(id)) continue;
      seen.set(id, { label: row.instructorName, changed: row.changedCount > 0 });
    }
    return [...seen]
      .sort((a, b) => Number(b[1].changed) - Number(a[1].changed) || a[1].label.localeCompare(b[1].label, "ar"))
      .map(([value, entry]) => ({ value, label: entry.changed ? `${entry.label} · طلب تعديلاً` : entry.label }));
  }, [rows]);

  const itemFilter = useCallback((item: InstructorRequestItem) => {
    const state = item.decision?.state;
    if (stateFilter === "pending" && state) return false;
    if (stateFilter === "fixed" && state !== "fixed") return false;
    if (stateFilter === "rejected" && state !== "rejected") return false;
    if (actionFilter !== "all" && item.action !== actionFilter) return false;
    if (verdictFilter !== "all" && (item.verdict || "clear") !== verdictFilter) return false;
    return true;
  }, [stateFilter, actionFilter, verdictFilter]);

  /* الأقسامُ التي في الوارد فعلاً — لا كلُّ أقسام الكلية. */
  const departments = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>();
    for (const row of rows || []) {
      if (!row.changedCount) continue;
      const id = Number(row.AdSectionId);
      const entry = seen.get(id) || { name: String(row.sectionName || `قسم ${id}`), count: 0 };
      entry.count += 1;
      seen.set(id, entry);
    }
    return [...seen].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows]);

  const counts = useMemo(() => {
    const all = (rows || []).flatMap(row => (row.items || []).filter(item => item.action !== "keep" && !(item as any).hidden));
    return {
      pending: all.filter(item => !item.decision?.state).length,
      fixed: all.filter(item => item.decision?.state === "fixed").length,
      rejected: all.filter(item => item.decision?.state === "rejected").length,
      all: all.length,
      change: all.filter(item => item.action === "change").length,
      add: all.filter(item => item.action === "add").length,
      delete: all.filter(item => item.action === "delete").length,
      clear: all.filter(item => (item.verdict || "clear") === "clear").length,
      exception: all.filter(item => item.verdict === "exception").length,
      conflict: all.filter(item => item.verdict === "conflict").length,
    };
  }, [rows]);

  const changed = visible.filter(row => row.changedCount > 0
    && (!deptFilter || Number(row.AdSectionId) === deptFilter)
    && (row.items || []).some(item => item.action !== "keep" && !(item as any).hidden && itemFilter(item)));
  const unchanged = visible.filter(row => row.status !== "sent" && row.changedCount === 0);
  const silent = visible.filter(row => !row.linkOpenedAt);

  /**
   * التثبيت.
   *
   * الخطوةُ الأولى هي الحفظُ الحقيقي عبر `/api/schedules` — بحمولةِ الصفّ كما
   * هو الآن وقد تغيّر فيه اليومُ والوقتُ وحدهما. والثانيةُ تسجيلُ القرار. ولو
   * أخفقت الأولى لم تقع الثانية: قرارٌ مسجّلٌ بلا أثرٍ في الجدول أسوأُ من
   * قرارٍ لم يُسجَّل، لأنه يقول للأستاذ «ثُبّت» ولم يُثبَّت شيء.
   */
  const decide = async (row: InboxRequest, index: number, state: "fixed" | "rejected", extra: any = {}): Promise<boolean> => {
    const key = `${row.id}:${index}`;
    /* ما يعتمد عليه هذا البند يُثبَّت قبله، بالمسار نفسه. فإن رُفض الشقيقُ وقف
       هذا عنده، وقيل السببُ على صفّ الشقيق. */
    if (state === "fixed" && Array.isArray(extra?.after) && extra.after.length) {
      for (const sibling of extra.after as number[]) {
        const ok = await decide(row, sibling, "fixed", { current: currentRows.get(Number(row.items[sibling]?.rowId)) });
        if (!ok) {
          setRowErrors(prev => ({ ...prev, [key]: "لم يُثبَّت طلبُه الآخر الذي يُفرغ هذا الوقت — انظر سببه في صفّه." }));
          return false;
        }
      }
    }
    /* الإضافةُ تُفتح بطاقةً سريعة في مكانها — كبطاقة «الجدول الدراسي» —
       بالمقرّر والأيام والوقت من طلب الأستاذ، والشعبةُ والقاعةُ قرارُ القسم. */
    if (state === "fixed" && row.items[index]?.action === "add") {
      const item = row.items[index];
      const slots = item.slots || [];
      const dayNames = slots.map(slot => INBOX_DAY_NAMES[slot.day] || slot.day).join(" · ");
      setQuickError(null);
      setQuick({
        row, index,
        seed: {
          day: (slots[0]?.day || "fsunday") as any,
          dayLabel: dayNames,
          start: slots[0]?.start || "08:00",
          end: slots[0]?.end || "08:50",
          x: Number(extra?.anchor?.x || window.innerWidth / 2),
          y: Number(extra?.anchor?.y || window.innerHeight / 3),
          instructorId: Number(row.AdInstructorId),
          room: "", hall: "",
        },
      });
      return true;
    }
    setBusyKey(key);
    setError(null);
    setRowErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    try {
      let scheduleId: number | undefined;
      if (state === "fixed") {
        const item = row.items[index];
        if (item.action === "delete" && item.rowId != null) {
          await request(`/api/schedules/${item.rowId}`, { method: "DELETE" });
          scheduleId = Number(item.rowId);
        } else if (item.action === "change" && item.rowId != null) {
          const current = currentRows.get(Number(item.rowId));
          if (!current) throw new Error("لم يعد هذا الموعد موجوداً في الجدول. حدّث الصفحة.");
          const slots = item.slots || [];
          const days = new Set(slots.map(slot => slot.day));
          const saved = await request(`/api/schedules/${item.rowId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...current,
              fsunday: days.has("fsunday"), fmonday: days.has("fmonday"), ftuesday: days.has("ftuesday"),
              fwednesday: days.has("fwednesday"), fthursday: days.has("fthursday"),
              fstarttime: slots[0]?.start || current.fstarttime,
              fendtime: slots[0]?.end || current.fendtime,
            }),
          });
          scheduleId = Number(saved?.id || item.rowId);
        } else if (item.action === "add") {
          /* ── الإضافة ───────────────────────────────────────────────────────
             تحتاج شعبةً وقاعةً ومبنى، وليس شيءٌ منها من اختيار الأستاذ — فلا
             تُثبَّت من هنا كما تُثبَّت نقلةُ موعدٍ قائم، ولا تُخترع لها قيمٌ
             افتراضيةٌ تُنتج صفّاً ناقصاً يكتشفه أحدٌ بعد شهر.

             وكانت تقف عند رسالةٍ تقول «افتحها في الورشة» — وهو طريقٌ مسدودٌ
             يترك المنسّقَ يعيد كتابةَ ما قرأه للتوّ. فصارت تحمله إليها ومعه ما
             قاله الأستاذ: المقرّر والأيام والوقت، ويبقى قرارُه هو فارغاً. */
          const slots = item.slots || [];
          putHandoff({
            requestId: row.id,
            itemIndex: index,
            instructorId: Number(row.AdInstructorId),
            instructorName: row.instructorName,
            courseId: Number(item.after?.courseId || 0),
            collegeId: Number(item.after?.collegeId || row.AdCollegeId),
            sectionId: Number(item.after?.sectionId || row.AdSectionId),
            termId: Number(row.AdTermId),
            days: slots.map(slot => slot.day) as any,
            start: slots[0]?.start || "",
            end: slots[0]?.end || "",
          });
          onNavigate?.("schedules");
          return true;
        }
      }
      await request(`/api/instructor-requests/${row.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, state, scheduleId, ...extra, current: undefined }),
      });
      await load();
      return true;
    } catch (e: any) { setRowErrors(prev => ({ ...prev, [key]: inboxMessage(e.message) })); return false; }
    finally { setBusyKey(null); }
  };

  /* ── حفظُ البطاقة السريعة ─────────────────────────────────────────────────
     الحفظُ عبر `/api/schedules` نفسه — فيرث كلَّ تحقّقه — ثم يُسجَّل القرار
     بمعرّف الصفّ الناتج. وإن رُفض الحفظ قيل السببُ على البطاقة نفسها. */
  const saveQuick = async (draft: QuickDraft) => {
    if (!quick) return;
    const { row, index } = quick;
    const item = row.items[index];
    const slots = item.slots || [];
    const days = new Set(slots.map(slot => slot.day));
    setQuickSaving(true); setQuickError(null);
    try {
      const saved = await request("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          AdCollegeId: Number(item.after?.collegeId || row.AdCollegeId),
          AdSectionId: Number(item.after?.sectionId || row.AdSectionId),
          AdTermId: Number(row.AdTermId),
          AdCourseId: Number(draft.courseId || item.after?.courseId || 0),
          SCode: draft.scode,
          AdInstructorId: Number(row.AdInstructorId),
          fsunday: days.has("fsunday"), fmonday: days.has("fmonday"), ftuesday: days.has("ftuesday"),
          fwednesday: days.has("fwednesday"), fthursday: days.has("fthursday"),
          fstarttime: draft.start, fendtime: draft.end,
          AdRoomCode: draft.room, AdRoomHall: draft.hall,
          buildingId: draft.buildingId, roomId: draft.roomId, locationStatus: draft.locationStatus,
        }),
      });
      await request(`/api/instructor-requests/${row.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, state: "fixed", scheduleId: Number(saved?.id || 0) }),
      });
      setQuick(null);
      await load();
    } catch (e: any) { setQuickError(e.message); }
    finally { setQuickSaving(false); }
  };

  /* فحصُ البطاقة: السؤالُ نفسُه للخادم بالقاعة والشعبة المختارتين. يُحفظ الجوابُ
     بمفتاح المسوّدة، فتقرؤه البطاقةُ متى وصل. */
  const quickConflictOf = (draft: QuickDraft) => {
    if (!quick) return null;
    const { row, index } = quick;
    const item = row.items[index];
    const days = new Set((item.slots || []).map(slot => slot.day));
    const body = {
      AdCollegeId: Number(item.after?.collegeId || row.AdCollegeId), AdSectionId: Number(item.after?.sectionId || row.AdSectionId),
      AdTermId: Number(row.AdTermId), AdCourseId: Number(draft.courseId || item.after?.courseId || 0), SCode: draft.scode,
      AdInstructorId: Number(row.AdInstructorId), fstarttime: draft.start, fendtime: draft.end,
      fsunday: days.has("fsunday"), fmonday: days.has("fmonday"), ftuesday: days.has("ftuesday"),
      fwednesday: days.has("fwednesday"), fthursday: days.has("fthursday"),
      AdRoomCode: draft.room, AdRoomHall: draft.hall, buildingId: draft.buildingId, roomId: draft.roomId, locationStatus: draft.locationStatus,
    };
    const key = JSON.stringify(body);
    if (key in quickClash) return quickClash[key];
    setQuickClash(prev => (key in prev ? prev : { ...prev, [key]: null }));
    void fetch("/api/schedules/check-conflicts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: key })
      .then(response => (response.ok ? response.json() : { conflicts: [] }))
      .then(data => {
        const hard = (data.conflicts || []).find((conflict: any) => conflict.severity === "high");
        const soft = (data.conflicts || [])[0];
        const pick = hard || soft;
        setQuickClash(prev => ({ ...prev, [key]: pick ? `${pick.message}${pick.detail ? ` — ${pick.detail}` : ""}` : null }));
      })
      .catch(() => undefined);
    return null;
  };

  const nextSectionFor = (courseId: number) => {
    const used = [...currentRows.values()]
      .filter(row => Number(row.AdCourseId) === Number(courseId))
      .map(row => Number(String(row.SCode || "").replace(/\D/g, "")) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return String(next).padStart(2, "0");
  };

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    { key: "section", label: "القسم", value: sectionId, placeholder: "كل أقسام الكلية", options: sectionOptions, disabled: !collegeId },
    { key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل", options: (terms || []).map(row => ({ value: row.AdTermId, label: row.AdTermName })) },
    { key: "instructor", label: "الأستاذ", value: instructorFilter, placeholder: "كل الأساتذة", options: instructorOptions, disabled: !instructorOptions.length },
  ];

  if (!terms) return <MicroLoader label="يقرأ الفصول…" />;

  return (
    <div className="content-stack changes-screen visual-minimal">
      <PageTitle
        eyebrow={<><Inbox aria-hidden="true" /> رغبات الأساتذة</>}
        subtitle="ما طلبه الأساتذة على مسوّداتهم، لا الجدول كله"
      >
        وارد الأساتذة
      </PageTitle>

      <ScopeAskBar
        idPrefix="requests-inbox"
        label="نطاق الوارد"
        ask={ask}
        onAskChange={setAsk}
        onAskSubmit={setAsk}
        askPlaceholder="اسأل: باسم الأستاذ"
        onClear={() => { setAsk(""); setInstructorFilter(0); }}
        selects={selects}
        onSelect={(key, value) => {
          const id = Number(value) || 0;
          if (key === "instructor") { setInstructorFilter(id); return; }
          setInstructorFilter(0);
          if (key === "college") { setCollegeId(id); setSectionId(0); }
          else if (key === "section") setSectionId(id);
          else setTermId(id);
        }}
      />

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}

      {!collegeId || !termId ? (
        <EmptyState title="اختر النطاق" detail="اختر الكلية والفصل، واترك القسم فارغاً لعرض وارد الكلية كاملاً." />
      ) : !rows ? (
        <MicroLoader label="يقرأ الوارد…" />
      ) : !rows.length ? (
        <EmptyState
          title="لم تُرسَل مسوّدات بعد"
          detail="تُرسل مسوّدات الجدول للأساتذة من شاشة النسخ، فيفتح كلٌّ منهم جدوله ويقول رأيه فيه."
        />
      ) : (
        <>
          {/* ثلاثةُ أرقامٍ لا أكثر. من أراد التفصيل فتح ما تحته. */}
          <Surface className="request-totals">
            <div><b>{totals?.answered ?? 0}</b><span>أجاب من {totals?.sent ?? 0}</span></div>
            <div><b>{totals?.unchanged ?? 0}</b><span>بلا تغيير</span></div>
            <div><b>{totals?.changed ?? 0}</b><span>طلبوا تغييراً</span></div>
          </Surface>

          {silent.length ? (
            <div className="request-silent">
              <MailQuestion aria-hidden="true" />
              <span>{countOf(silent.length, AR.instructor)} لم يفتحوا الرابط بعد</span>
              <div className="request-silent-links">
                {silent.slice(0, 12).map(row => {
                  const reach = reachAboutCard(
                    { AdInstructorName: row.instructorName, AdInstructorMobile: row.instructorMobile },
                    `${location.origin}/r/${row.linkId}`,
                    "reminder",
                  );
                  return reach.href ? (
                    <a key={row.id} href={reach.href} target="_blank" rel="noreferrer noopener" className="request-remind">
                      <Send aria-hidden="true" /> {row.instructorName}
                    </a>
                  ) : (
                    <span key={row.id} className="request-remind" data-blocked="true" title={reach.blocked || ""}>
                      <Link2 aria-hidden="true" /> {row.instructorName}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {unchanged.length ? (
            <button
              type="button"
              className="request-unchanged"
              aria-expanded={showUnchanged}
              data-guide-ignore="طيُّ من لم يغيّروا شيئاً — عرضٌ لا فعل"
              onClick={() => setShowUnchanged(open => !open)}
            >
              <ChevronDown aria-hidden="true" data-open={showUnchanged || undefined} />
              <Check aria-hidden="true" />
              {countOf(unchanged.length, AR.instructor)} قالوا «الجدول كما هو»
              {showUnchanged ? <em>{unchanged.map(row => row.instructorName).join(" · ")}</em> : null}
            </button>
          ) : null}

          <div className="request-filters" role="toolbar" aria-label="تصفية الوارد">
            <span className="request-filters-mark" aria-hidden="true"><SlidersHorizontal /></span>
            <FilterGroup
              label="الحالة"
              value={stateFilter}
              onChange={value => setStateFilter(value as any)}
              options={[
                { value: "pending", label: "بانتظار قرارك", count: counts.pending, tone: "warn" },
                { value: "fixed", label: "ثُبّت", count: counts.fixed, tone: "ok" },
                { value: "rejected", label: "رُفض", count: counts.rejected, tone: "bad" },
                { value: "all", label: "الكل", count: counts.all },
              ]}
            />
            <FilterGroup
              label="النوع"
              value={actionFilter}
              onChange={value => setActionFilter(value as any)}
              options={[
                { value: "all", label: "الكل" },
                { value: "change", label: "تعديل", count: counts.change },
                { value: "add", label: "إضافة", count: counts.add },
                { value: "delete", label: "حذف", count: counts.delete },
              ]}
            />
            <FilterGroup
              label="الفحص"
              value={verdictFilter}
              onChange={value => setVerdictFilter(value as any)}
              options={[
                { value: "all", label: "الكل" },
                { value: "clear", label: "متاح", count: counts.clear, tone: "ok" },
                { value: "exception", label: "استثناء", count: counts.exception, tone: "warn" },
                { value: "conflict", label: "ممنوع", count: counts.conflict, tone: "bad" },
              ]}
            />
            {departments.length > 1 && !sectionId ? (
              <FilterGroup
                label="القسم"
                value={String(deptFilter)}
                onChange={value => setDeptFilter(Number(value) || 0)}
                options={[{ value: "0", label: "كل الأقسام" }, ...departments.map(dept => ({ value: String(dept.id), label: dept.name.replace(/^قسم\s+/, ""), count: dept.count }))]}
              />
            ) : null}
            {(stateFilter !== "pending" || actionFilter !== "all" || verdictFilter !== "all" || deptFilter) ? (
              <button type="button" className="request-filters-reset" data-guide-ignore="إعادة المرشّحات — عرضٌ لا فعل" onClick={() => { setStateFilter("pending"); setActionFilter("all"); setVerdictFilter("all"); setDeptFilter(0); }}>
                <X aria-hidden="true" /> إعادة
              </button>
            ) : null}
          </div>

          {changed.length ? (
            <div className="request-deck">
              {changed.map(row => (
                <RequestCard
                  key={row.id}
                  row={row}
                  currentRows={currentRows}
                  busyKey={busyKey}
                  filter={itemFilter}
                  rowErrors={rowErrors}
                  onDecide={(index, state, extra) => void decide(row, index, state, extra)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={needle ? "لا نتائج" : stateFilter === "pending" && counts.all ? "لا شيء ينتظرك" : "لا تعديلات تنتظر"}
              detail={needle ? "لا أستاذَ يطابق البحث." : stateFilter === "pending" && counts.all ? "قرّرتَ في كل الطلبات. غيّر «الحالة» لترى ما ثُبّت أو رُفض." : "كلُّ من أجاب قَبِل جدوله كما أرسله القسم."}
            />
          )}
        </>
      )}

      {quick ? (() => {
        const item = quick.row.items[quick.index];
        return (
          <QuickCreatePopover
            seed={quick.seed}
            courses={[{ AdCourseId: Number(item.after?.courseId || 0), CourseName: String(item.after?.courseName || "مقرر"), CourseCode: "" } as any]}
            instructors={[{ AdInstructorId: Number(quick.row.AdInstructorId), AdInstructorName: quick.row.instructorName } as any]}
            collegeId={Number(item.after?.collegeId || quick.row.AdCollegeId)}
            sectionId={Number(item.after?.sectionId || quick.row.AdSectionId)}
            termId={Number(quick.row.AdTermId)}
            initialCourseId={Number(item.after?.courseId || 0)}
            durationForDay={() => {
              const [sh, sm] = quick.seed.start.split(":").map(Number), [eh, em] = quick.seed.end.split(":").map(Number);
              return (eh * 60 + em) - (sh * 60 + sm);
            }}
            conflictOf={(draft) => quickConflictOf(draft)}
            nextSectionCode={nextSectionFor}
            saving={quickSaving}
            error={quickError}
            onCancel={() => setQuick(null)}
            onExpand={() => {
              /* «تفاصيل أكثر»: الطريقُ القديم إلى النموذج الكامل، لمن أراده. */
              const slots = item.slots || [];
              putHandoff({
                requestId: quick.row.id, itemIndex: quick.index,
                instructorId: Number(quick.row.AdInstructorId), instructorName: quick.row.instructorName,
                courseId: Number(item.after?.courseId || 0),
                collegeId: Number(item.after?.collegeId || quick.row.AdCollegeId),
                sectionId: Number(item.after?.sectionId || quick.row.AdSectionId),
                termId: Number(quick.row.AdTermId),
                days: slots.map(slot => slot.day) as any, start: slots[0]?.start || "", end: slots[0]?.end || "",
              });
              setQuick(null);
              onNavigate?.("schedules");
            }}
            onCreate={(draft) => void saveQuick(draft)}
          />
        );
      })() : null}
    </div>
  );
}
