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
  AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Inbox, Link2, MailQuestion,
  MessageSquare, Send, ShieldAlert, ShieldCheck, X,
} from "lucide-react";
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
  const [offered, setOffered] = useState<string[]>((item.nearestTimes || []).map(slot => `${slot.day}|${slot.start}|${slot.end}`));
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
                const key = `${slot.day}|${slot.start}|${slot.end}`;
                const on = offered.includes(key);
                return (
                  <button
                    key={key} type="button" className="changes-chip"
                    data-active={on || undefined} aria-pressed={on}
                    data-guide-ignore="اختيار بديلٍ يُعرض — يُحفظ مع القرار"
                    onClick={() => toggle(key)}
                  >
                    {slot.start} – {slot.end}
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
              const [day, start, end] = key.split("|");
              return { day, start, end };
            }))}
          >
            {busy ? "يحفظ…" : "سجّل الرفض"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── بطاقةُ أستاذ ───────────────────────────────────────────────────────── */

function RequestCard({ row, currentRows, onDecide, busyKey }: {
  key?: React.Key;
  row: InboxRequest;
  currentRows: Map<number, FSchedule>;
  onDecide: (index: number, state: "fixed" | "rejected", extra?: any) => void;
  busyKey: string | null;
}) {
  const [rejecting, setRejecting] = useState<number | null>(null);

  const items = useMemo(() => (row.items || [])
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.action !== "keep")
    .sort((a, b) => (VERDICT_ORDER[a.item.verdict || "clear"] ?? 0) - (VERDICT_ORDER[b.item.verdict || "clear"] ?? 0)),
    [row.items]);

  if (!items.length) return null;

  return (
    <article className="request-card">
      <header className="request-card-head">
        <div>
          <strong>{row.instructorName}</strong>
          <small>{countOf(items.length, AR.change)}{row.submittedAt ? ` · ${arabicDate(row.submittedAt)}` : ""}</small>
        </div>
        {/* ── من وقّعه ────────────────────────────────────────────────────
            الرابطُ يصل في واتساب ويُعاد توجيهه، فضغطةُ «أرسل» وحدَها لا تُثبت
            أن صاحبه هو من أرسل. وقد صار الإرسالُ يُطابِق رقمَه المدنيَّ
            بسجلّه، فيُقال ذلك هنا برمزه — وهو ما يُطابَق به الطلبُ بعد شهرين
            إن أُنكر. وطلبٌ قديمٌ أُرسل قبل هذا لا يحمل توقيعاً، ويُقال ذلك
            صراحةً بدل أن يُفترض. */}
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
      </header>

      <div className="request-items">
        {items.map(({ item, index }) => {
          const key = `${row.id}:${index}`;
          const decided = item.decision?.state;
          const current = item.rowId == null ? undefined : currentRows.get(Number(item.rowId));
          return (
            <div key={key} className="request-item" data-verdict={item.verdict || "clear"} data-decided={decided || undefined}>
              <div className="request-item-head">
                <Badge tone={item.action === "delete" ? "danger" : item.action === "add" ? "info" : "neutral"}>
                  {ACTION_LABEL[item.action] || item.action}
                </Badge>
                <strong>{item.after?.courseName || item.before?.courseName || "—"}</strong>
                {item.before?.sectionCode ? <small>شعبة {item.before.sectionCode}</small> : null}
              </div>

              {/* سطران لا أكثر: «كان» و«طلب». وهو كلُّ ما يحتاجه القرار. */}
              <dl className="request-diff">
                {item.before ? (
                  <div><dt>كان</dt><dd>{item.before.days} · {item.before.time}{item.before.room ? ` · ${item.before.room}` : ""}</dd></div>
                ) : null}
                {item.action !== "delete" && item.after ? (
                  <div><dt>طلب</dt><dd>{item.after.days} · {item.after.time}</dd></div>
                ) : null}
              </dl>

              {item.excuse ? <p className="request-excuse"><MessageSquare aria-hidden="true" /> {item.excuse}</p> : null}

              {(item.reasons || []).length ? (
                <ul className="request-reasons">
                  {(item.reasons || []).map((reason, at) => (
                    <li key={at} data-blocking={reason.blocking || undefined}>
                      {reason.blocking ? <ShieldAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                      {reason.text}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* القاعاتُ المرشّحة تظهر هنا وهنا وحدها: القرارُ فيها للقسم،
                  والأستاذُ لم يرَ منها شيئاً. */}
              {(item.roomCandidates || []).length && item.action !== "delete" ? (
                <p className="request-rooms">
                  قاعاتٌ متاحة في هذا الوقت: {countOf(item.roomCandidates!.length, AR.room)}
                </p>
              ) : null}

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
                    disabled={busyKey === key || item.verdict === "conflict" || (item.action === "change" && !current)}
                    onClick={() => onDecide(index, "fixed", { current })}
                    title={item.verdict === "conflict" ? "لا يُثبَّت بندٌ متعارض — عالجه أو ارفضه" : undefined}
                  >
                    {busyKey === key ? "يحفظ…" : item.action === "add" ? "افتحها في الورشة" : "ثبّت"}
                  </PrimaryButton>
                  <SecondaryButton type="button" data-guide-target="requests.action.reject" onClick={() => setRejecting(index)}>
                    ارفض
                  </SecondaryButton>
                </div>
              )}

              {rejecting === index ? (
                <RejectSheet
                  item={item}
                  busy={busyKey === key}
                  onClose={() => setRejecting(null)}
                  onSubmit={(reason, note, alternatives) => {
                    onDecide(index, "rejected", { reasonCode: reason, note, alternatives });
                    setRejecting(null);
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

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
  useEffect(() => {
    /* ومن له الكلُّ لا يُختار له شيء: اختيارُ أوّلِ كليةٍ في الكتالوج يُخفي
       عنه البقيّةَ خلف قراءةٍ بدأت بلا طلبه. */
    if (collegeId || powerAdmin || !scopes.length) return;
    setCollegeId(Number(scopes[0].AdCollegeId) || 0);
    if (scopes.length === 1) setSectionId(Number(scopes[0].AdSectionId) || 0);
  }, [scopes, collegeId, powerAdmin]);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/instructor-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      setCurrentRows(new Map((data.currentRows || []).map((row: FSchedule) => [Number(row.id), row])));
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

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
    .filter(row => !needle || row.instructorName.includes(needle)),
    [rows, needle]);

  const changed = visible.filter(row => row.changedCount > 0);
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
  const decide = async (row: InboxRequest, index: number, state: "fixed" | "rejected", extra: any = {}) => {
    const key = `${row.id}:${index}`;
    setBusyKey(key);
    setError(null);
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
            collegeId: Number(row.AdCollegeId),
            sectionId: Number(row.AdSectionId),
            termId: Number(row.AdTermId),
            days: slots.map(slot => slot.day) as any,
            start: slots[0]?.start || "",
            end: slots[0]?.end || "",
          });
          onNavigate?.("schedules");
          return;
        }
      }
      await request(`/api/instructor-requests/${row.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, state, scheduleId, ...extra, current: undefined }),
      });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusyKey(null); }
  };

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    { key: "section", label: "القسم", value: sectionId, placeholder: "اختر القسم", options: sectionOptions, disabled: !collegeId },
    { key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل", options: (terms || []).map(row => ({ value: row.AdTermId, label: row.AdTermName })) },
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
        onClear={() => setAsk("")}
        selects={selects}
        onSelect={(key, value) => {
          const id = Number(value) || 0;
          if (key === "college") { setCollegeId(id); setSectionId(0); }
          else if (key === "section") setSectionId(id);
          else setTermId(id);
        }}
      />

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}

      {!collegeId || !sectionId || !termId ? (
        <EmptyState title="اختر النطاق" detail="يُعرض وارد الأساتذة لقسمٍ واحدٍ في فصلٍ واحد." />
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

          {changed.length ? (
            <div className="request-deck">
              {changed.map(row => (
                <RequestCard
                  key={row.id}
                  row={row}
                  currentRows={currentRows}
                  busyKey={busyKey}
                  onDecide={(index, state, extra) => void decide(row, index, state, extra)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={needle ? "لا نتائج" : "لا تعديلات تنتظر"}
              detail={needle ? "لا أستاذَ يطابق البحث." : "كلُّ من أجاب قَبِل جدوله كما أرسله القسم."}
            />
          )}
        </>
      )}
    </div>
  );
}
