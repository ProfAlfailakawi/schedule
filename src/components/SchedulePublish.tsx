import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Check, ClipboardList, Copy, IdCard, Link2, QrCode, Send, Trash2, Users, X } from "lucide-react";
import { reachAboutCard, unreachable, whatsappNumber } from "../utils/reachInstructor";
import type { AdInstructor } from "../types";
import { AR, countOf, oblique } from "../utils/arabicCount";
import { deadlineEndsAt } from "../utils/approvalWorkflow";
import { GhostButton, PrimaryButton, SecondaryButton } from "./ui";

interface ShareLink {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  /** بطاقة الأستاذ: آخر موعدٍ لاستقبال الطلبات. الرابط يبقى للقراءة حتى expiresAt. */
  requestsCloseAt?: string;
  revoked?: boolean;
  views: number;
  showInstructors: boolean;
  kind?: "department" | "staff" | "survey" | "request";
  /** رابطٌ شخصي: بطاقةٌ لا تُفتح إلا لهذا الأستاذ. */
  AdInstructorId?: number;
}

/** رابطٌ شخصيٌّ كما تعرضه لوحة النشر: لمن هو، ومتى أُرسل، وهل تغيّر جدوله بعده. */
interface PersonalLink {
  id: string;
  instructorId: number;
  name: string;
  expiresAt: string;
  revoked: boolean;
  views: number;
  lastSentAt: string;
  lastSeenAt: string;
  changedSinceSent: boolean;
}

/**
 * ── بابان: جدولُ القسم، وبطاقةُ الأستاذ ────────────────────────────────────
 *
 * كانت «بطاقة الأستاذ» و«رغبات الأساتذة» بابين، وهما للأستاذ شيءٌ واحد: يفتح
 * جدولَه برقمه المدني، ومن البطاقة نفسها يطلب تعديله. فصارا باباً واحداً —
 * رابطٌ واحدٌ للقسم كله، ومعه (اختيارياً) نافذةُ طلبات التعديل بتاريخ إغلاقٍ
 * يُكتب. والطلباتُ تُتابَع في «وارد الأساتذة»، والقرارُ يبقى للقسم.
 */
type Kind = "department" | "staff" | "survey";
type PublishStep = "kind" | "options" | "links";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  scopeLabel?: string;
  /** «primary» زرٌّ بارزٌ حين يكون النشرُ موضوعَ الشاشة كلها، لا أداةً في شريط. */
  appearance?: "ghost" | "primary";
}

const DAY_CHOICES = [7, 30, 90, 180];
const PUBLISH_STEPS: Array<{ id: PublishStep; label: string; hint: string }> = [
  { id: "kind", label: "نوع الرابط", hint: "للقسم أو للأساتذة أو للطلبة" },
  { id: "options", label: "الصلاحية", hint: "المدة والخصوصية" },
  { id: "links", label: "الروابط", hint: "نسخ وإدارة الرابط" },
];

/**
 * Read-only publication of the current scope. The link is a long random token,
 * expires on its own, and carries nothing an account could unlock.
 */

/**
 * Reading a reply that may not be a reply.
 *
 * When the platform rate-limits a request it answers with the plain sentence
 * "Rate exceeded." — not JSON — so parsing it threw, and the parser's own
 * complaint went straight to the screen in English: «Unexpected token 'R'…».
 * The user was shown the shape of our bug instead of the name of their problem.
 *
 * So the body is read as text first and only then parsed, and the status is
 * translated before anything else: a person who published twice in a second
 * should be told to wait a moment, in Arabic.
 */
async function readReply(response: Response, fallback: string) {
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (response.ok) return data;

  if (response.status === 429 || /rate\s*exceeded|too many/i.test(raw)) {
    throw new Error("طلبات كثيرة في وقت قصير. انتظر لحظة ثم أعد المحاولة.");
  }
  if (response.status === 401) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  if (response.status === 403) throw new Error("هذا الإجراء خارج صلاحياتك.");
  if (response.status === 404) throw new Error("العنصر المطلوب غير موجود.");
  if (response.status >= 500) throw new Error("الخدمة متوقفة مؤقتاً. حاول بعد قليل.");
  throw new Error(data?.error || fallback);
}

export default function SchedulePublish({ collegeId, sectionId, termId, scopeLabel, appearance = "ghost" }: Props) {
  const [open, setOpen] = useState(false),
    [links, setLinks] = useState<ShareLink[]>([]),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<Kind>("department"),
    [days, setDays] = useState(30),
    [showInstructors, setShowInstructors] = useState(true),
    [copied, setCopied] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [step, setStep] = useState<PublishStep>("kind"),
    [createdId, setCreatedId] = useState<string | null>(null),
    /* بابُ الرغبات لا يُقاس بالأيام بل بتاريخٍ يُكتب: الأستاذُ يقرأ «آخر موعد
       ٢٠٢٦-١٠-٠٥» ولا يقرأ «٣٠ يوماً من متى». */
    [closesAt, setClosesAt] = useState(""),
    /* ومع البطاقة تُفتح نافذةُ طلبات التعديل ما لم يُطفئها المنسّق. */
    [openRequests, setOpenRequests] = useState(true),
    [issued, setIssued] = useState<{ created: number; reissued: number; empty?: "no-rows" | "no-instructors" } | null>(null),
    [qr, setQr] = useState<{ id: string; svg: string } | null>(null),
    /* الروابطُ الشخصية: رابطٌ لكل أستاذ، يُسكّ عند التسليم ويُدار هنا. */
    [personalLinks, setPersonalLinks] = useState<PersonalLink[]>([]),
    [personalFor, setPersonalFor] = useState<Map<number, string>>(new Map());

  const scoped = Boolean(collegeId && sectionId && termId);

  const loadPersonal = async () => {
    try {
      const response = await fetch(`/api/share-personal?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const data = await readReply(response, "تعذر قراءة الروابط الشخصية");
      setPersonalLinks(Array.isArray(data) ? data : []);
    } catch { setPersonalLinks([]); }
  };

  const load = async () => {
    if (!scoped) return;
    setError(null);
    try {
      const response = await fetch(`/api/share?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const data = await readReply(response, "تعذر قراءة الروابط");
      setLinks(Array.isArray(data) ? data : []);
      await loadPersonal();
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, collegeId, sectionId, termId]);

  /* ── ولا تبقى نتيجةُ الإصدار معلّقةً على فعلٍ آخر ─────────────────────────
   * «أُصدر ١٢ رابطاً» كانت تبقى بعد إغلاق اللوحة وفتحِها على نطاقٍ آخر، أو
   * بعد إنشاء رابط قراءةٍ عادي — فتُقرأ خبراً عن الفعل الجاري وهي خبرٌ عن
   * فعلٍ مضى، ويظنّ المنسّقُ أنه أرسل لهذا القسم وقد أرسل لغيره. */
  useEffect(() => { setIssued(null); }, [open, collegeId, sectionId, termId, kind]);

  /**
   * إصدارُ روابط الرغبات.
   *
   * ليس رابطاً واحداً يُنسخ، بل رابطٌ لكل أستاذٍ في الجدول — ولذلك لا يمرّ
   * بـ`/api/share` ولا يظهر في قائمة الروابط: يُصدَر ويُتابَع في «وارد
   * الأساتذة»، ويُرسل لكلِّ أستاذٍ رابطُه من هناك.
   */
  const issueRequests = async () => {
    const response = await fetch("/api/instructor-requests/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeId, sectionId, termId, closesAt, source: "draft" }),
    });
    const data = await readReply(response, "تعذر فتح طلبات التعديل");
    if (data?.emptyTerm) {
      setIssued({ created: 0, reissued: 0, empty: data.reason === "no-instructors" ? "no-instructors" : "no-rows" });
      return;
    }
    const rows: Array<{ reissued?: boolean }> = data?.issued || [];
    /* والفرقُ يُقال: جديدٌ، ومُعادٌ صاحبُه يحمل طلبَه من قبل. فلا يظنُّ القسمُ
       أنه فتح لعشرين وقد فتح لثلاثة. */
    const reissued = rows.filter(row => row.reissued).length;
    setIssued({ created: rows.length - reissued, reissued });
  };

  /* بطاقة الأستاذ: الموعدُ يحكم استقبالَ الطلبات وحده. الرابطُ نفسه — والتقويم
     الذي يتبعه في هاتف الأستاذ — يعيش حتى نهاية الفصل، ويحسب الخادمُ ذلك من
     تاريخ الفصل لا من هذا الموعد. الاستبيانُ وحده يموت مع موعده. */
  const withRequests = kind === "staff";
  const byDate = kind === "staff" || kind === "survey";
  const linkDays = kind === "survey" && closesAt
    ? Math.max(1, Math.ceil((Date.parse(deadlineEndsAt(closesAt)) - Date.now()) / 86400000))
    : days;

  const create = async () => {
    if (byDate && !closesAt) { setError(kind === "survey" ? "اكتب آخر موعدٍ لاستقبال إجابات الطلبة." : "اكتب آخر موعدٍ لاستقبال طلبات التعديل."); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, days: linkDays, showInstructors, kind, ...(withRequests ? { requestsCloseAt: closesAt } : {}) })
      });
      const data = await readReply(response, "تعذر إنشاء الرابط");
      setLinks(current => [data, ...current]);
      setCreatedId(data.id);
      setIssued(null);
      setStep("links");
      /* البطاقةُ أُنشئت أولاً: إن تعذّر فتحُ الطلبات (جدولٌ مجمَّد مثلاً) بقي
         رابطُ الاطّلاع صالحاً، وقيل سببُ الطلبات وحدها. */
      if (withRequests) {
        try { await issueRequests(); }
        catch (e: any) { setError(`أُنشئت البطاقة، لكن طلبات التعديل لم تُفتح: ${e.message}`); }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
      await readReply(response, "تعذر إيقاف الرابط");
      setLinks(current => current.map(item => (item.id === id ? { ...item, revoked: true } : item)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /* الاستبيانُ بابُه `/q/`، وما سواه `/s/`. */
  const publicUrl = (id: string) => `${window.location.origin}/${links.find(link => link.id === id)?.kind === "survey" ? "q" : "s"}/${id}`;
  /**
   * ── التسليم ────────────────────────────────────────────────────────────
   *
   * A staff link that nobody receives is a link that does not exist. This is
   * the last mile, and it turns out the department already had everything it
   * needed for it: every instructor record carries a mobile number.
   *
   * Nothing is sent by this program. Each row opens a conversation with the
   * message already written; a person presses send. That is the property that
   * makes it safe — the system can address people, and only a human can
   * contact them.
   */
  const [deliver, setDeliver] = useState<string | null>(null);
  const [staff, setStaff] = useState<AdInstructor[]>([]);
  const [sent, setSent] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!deliver) return;
    void fetch(`/api/instructors?sectionId=${sectionId}&termId=${termId}`, { credentials: "include" })
      .then(response => (response.ok ? response.json() : []))
      .then(data => setStaff(Array.isArray(data) ? data : []))
      .catch(() => setStaff([]));
  }, [deliver, sectionId, termId]);

  /* ── لكل أستاذٍ رابطُه ──────────────────────────────────────────────────
   * رابطُ القسم مع رقمِ زميلٍ كان يفتح بطاقةَ الزميل وطلباته. فالتسليمُ يُرسل
   * لكل أستاذٍ رابطاً شخصياً لا يُفتح إلا له، يُسكّ هنا مرّةً ويُعاد استعماله. */
  useEffect(() => {
    if (!deliver || !staff.length) return;
    let cancelled = false;
    void fetch(`/api/share/${encodeURIComponent(deliver)}/personal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorIds: staff.map(person => person.AdInstructorId) }),
    })
      .then(response => readReply(response, "تعذر تجهيز الروابط الشخصية"))
      .then(data => {
        if (cancelled) return;
        setPersonalFor(new Map((data?.links || []).map((row: { instructorId: number; id: string }) => [Number(row.instructorId), row.id])));
        void loadPersonal();
      })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [deliver, staff]);

  /** يسجّل الإرسال لهذا الأستاذ (ومعه بصمةُ جدوله) — يُعرف به لاحقاً من تغيّر جدولُه. */
  const markSent = (personalId: string) => {
    void fetch(`/api/share/${encodeURIComponent(personalId)}/sent`, { method: "POST" })
      .then(() => loadPersonal())
      .catch(() => undefined);
  };
  const personalUrl = (id: string) => `${window.location.origin}/s/${id}`;
  // The QR encodes the same public link. The ~50KB encoder is lazy-loaded, so it
  // only ships to the browser when someone actually asks for a code.
  const showQr = async (id: string) => {
    if (qr?.id === id) { setQr(null); return; }
    try {
      type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };
      const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
      const code = factory(0, "M");
      code.addData(publicUrl(id));
      code.make();
      setQr({ id, svg: code.createSvgTag({ scalable: true, margin: 1 }) });
    } catch { setError("تعذّر توليد رمز QR."); }
  };

  const copy = async (id: string) => {
    const url = publicUrl(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement("input");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(id);
    window.setTimeout(() => setCopied(current => (current === id ? null : current)), 1800);
  };

  /* ── ما يُعرض في هذه القائمة ────────────────────────────────────────────
   *
   * روابطُ الطلب ليست منها، وإن كانت في المخزن نفسه: هي رابطٌ لكلِّ أستاذٍ
   * على حدة يُرسل من «وارد الأساتذة»، لا رابطٌ واحدٌ يُنسخ من هنا. وعرضُها
   * كان يعطيها أزرارَ هذه القائمة — نسخٌ ورمزٌ وتقويم — وكلُّها تبني `/s/`،
   * فينسخ المنسّقُ رابطاً يُفتح على جدول القسم كاملاً بدل نموذج صاحبه.
   *
   * وبابُ `/s/` صار يردّ رمزَ الطلب إلى بابه، فالحارسان اثنان: هنا لا تُعرض،
   * وهناك لا تُفتح. */
  const publicationLinks = links.filter(link => link.kind !== "request" && !(link.kind === "staff" && Number(link.AdInstructorId || 0) > 0));
  const livePersonal = personalLinks.filter(link => !link.revoked && Date.parse(link.expiresAt) > Date.now());
  const changedSinceSent = livePersonal.filter(link => link.changedSinceSent);
  const active = publicationLinks.filter(link => !link.revoked && new Date(link.expiresAt).getTime() > Date.now());

  const currentStep = PUBLISH_STEPS.findIndex(item => item.id === step);
  const openDialog = () => {
    setStep("kind");
    setCreatedId(null);
    setError(null);
    setOpen(true);
  };

  return (
    <>
      {appearance === "primary" ? (
        <PrimaryButton type="button" className="publish-open" data-guide-target="schedule.publish" data-guide-feature-id="schedule.publish" onClick={openDialog} disabled={!scoped} title="نشر الجدول" aria-label="نشر الجدول">
          <Link2 aria-hidden="true" />
          نشر الجدول
          {active.length ? <b className="publish-open-count">{active.length.toLocaleString("ar-KW-u-nu-latn")} فعّال</b> : null}
        </PrimaryButton>
      ) : (
        <GhostButton type="button" data-guide-target="schedule.publish" data-guide-feature-id="schedule.publish" onClick={openDialog} disabled={!scoped} title="نشر الجدول" aria-label="نشر الجدول">
          <Link2 />
          نشر
          {active.length ? <b className="tool-count">{active.length}</b> : null}
        </GhostButton>
      )}

      {/*
        The sheet is painted on the window, not inside the toolbar.

        It is a fixed, full-window dialog with a z-index of 500, and it was
        still being covered — because the toolbar it is written inside carries
        its own stacking context, and inside that context 500 means nothing
        against the cards that come after it. A dialog belongs to the document,
        so it is rendered there and stops arguing with its neighbours.
      */}
      {open ? createPortal((
        <div
          className="share-backdrop no-print"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="share-sheet visual-minimal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-publish-title"
            aria-busy={busy}
            onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}
          >
            <button className="share-close" type="button" aria-label="إغلاق" title="إغلاق" onClick={() => setOpen(false)}>
              <X />
            </button>
            <header>
              <span className="share-glyph"><Link2 aria-hidden="true" /></span>
              <div>
                <small>نشر الجدول</small>
                <h2 id="schedule-publish-title">{scopeLabel || "نشر الجدول"}</h2>
              </div>
            </header>

            {error ? <p className="share-error" role="alert">{error}</p> : null}

            <nav className="share-progress" aria-label="خطوات نشر الجدول">
              <ol className="share-steps">
                {PUBLISH_STEPS.map((item, index) => (
                  <li
                    key={item.id}
                    className={`${step === item.id ? "active" : ""} ${index < currentStep ? "complete" : ""}`.trim()}
                  >
                    <button
                      type="button"
                      onClick={() => setStep(item.id)}
                      data-guide-feature-id="schedule.publish"
                      aria-current={step === item.id ? "step" : undefined}
                      aria-controls={`publish-step-${item.id}`} title={item.label}
                    >
                      <span aria-hidden="true">{index < currentStep ? <Check /> : index + 1}</span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Two kinds of link, one sheet: the whole department's timetable,
                or a card each instructor opens with their own civil ID. */}
            <section
              id="publish-step-kind"
              className="share-step share-step-kind"
              aria-labelledby="publish-step-kind-title"
              hidden={step !== "kind"}
            >
              <header className="share-step-head">
                <small>الخطوة 1 من 3</small>
                <h3 id="publish-step-kind-title">لمن سيُنشر الجدول؟</h3>
              </header>
              <div className="share-kind" role="group" aria-label="نوع الرابط">
                <button
                  type="button"
                  className={kind === "department" ? "active" : ""}
                  onClick={() => setKind("department")}
                  data-guide-feature-id="schedule.publish"
                  aria-pressed={kind === "department"} title="جدول القسم"
                >
                  <Users aria-hidden="true" />
                  <span>جدول القسم</span>
                </button>
                {/* بطاقةُ الأستاذ هي بابُ طلب التعديل أيضاً: يفتح جدولَه برقمه
                    المدني، ومنها يطلب. فهدفُ المرشد لرغبات الأساتذة هنا. */}
                <button
                  type="button"
                  className={kind === "staff" ? "active" : ""}
                  onClick={() => setKind("staff")}
                  data-guide-target="schedule.publish.requests"
                  data-guide-feature-id="schedule.publish.requests"
                  aria-pressed={kind === "staff"} title="بطاقة الأستاذ"
                >
                  <IdCard aria-hidden="true" />
                  <span>بطاقة الأستاذ</span>
                </button>
                {/* استبيانُ الطلبة من الباب نفسه: رابطٌ ورمزُ QR يُعلَّق، وتصل
                    إجاباتُه «مركز الذكاء» و«كشف التسجيل» كما كانت. */}
                <button
                  type="button"
                  className={kind === "survey" ? "active" : ""}
                  onClick={() => setKind("survey")}
                  data-guide-ignore="اختيار نوع الرابط: استبيان الطلبة — لا يعدّل الجدول"
                  aria-pressed={kind === "survey"} title="استبيان الطلبة"
                >
                  <ClipboardList aria-hidden="true" />
                  <span>استبيان الطلبة</span>
                </button>
              </div>
              <div className="share-step-actions">
                <PrimaryButton type="button" onClick={() => setStep("options")}>
                  التالي · الصلاحية
                </PrimaryButton>
              </div>
            </section>

            <section
              id="publish-step-options"
              className="share-step share-step-options"
              aria-labelledby="publish-step-options-title"
              hidden={step !== "options"}
            >
              <header className="share-step-head">
                <small>الخطوة 2 من 3</small>
                <h3 id="publish-step-options-title">{kind === "department" ? "مدة الرابط وما سيظهر فيه" : kind === "survey" ? "آخر موعد لاستقبال إجابات الطلبة" : "آخر موعد لاستقبال الطلبات"}</h3>
                {kind === "department" ? <p>رابط قراءة عام للجدول ضمن الصلاحية المحددة.</p> : null}
              </header>
              <div className={`share-compose ${kind === "department" ? "" : "share-compose-single"}`}>
                {kind === "department" ? <div className="share-days" role="group" aria-label="مدة الصلاحية">
                  {DAY_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      className={days === choice ? "active" : ""}
                      onClick={() => setDays(choice)}
                      aria-pressed={days === choice}
                    >
                      {choice}
                      <small>يوم</small>
                    </button>
                  ))}
                </div> : null}
                {kind === "department" ? (
                  <label className="share-toggle">
                    <input type="checkbox" checked={showInstructors} onChange={event => setShowInstructors(event.target.checked)} />
                    <span>إظهار أسماء الأساتذة</span>
                  </label>
                ) : (
                  <label className="share-closes">
                    <span className="sr-only">آخر موعد لاستقبال الطلبات</span>
                    <input type="date" value={closesAt} onChange={event => setClosesAt(event.target.value)} />
                  </label>
                )}
              </div>
              {kind === "department" ? <dl className="share-choice-summary" aria-label="ملخص إعداد الرابط">
                <div><dt>النوع</dt><dd>{kind === "department" ? "جدول القسم" : "بطاقة الأستاذ"}</dd></div>
                <div><dt>الصلاحية</dt><dd>{countOf(days, AR.day)}</dd></div>
                {kind === "department"
                  ? <div><dt>الأساتذة</dt><dd>{showInstructors ? "تظهر أسماؤهم" : "مخفية أسماؤهم"}</dd></div>
                  : <div><dt>طلبات التعديل</dt><dd>{openRequests ? (closesAt ? `حتى ${new Date(`${closesAt}T12:00:00`).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })}` : "اكتب آخر موعد") : "مغلقة"}</dd></div>}
              </dl> : null}
              <div className="share-step-actions">
                <SecondaryButton type="button" onClick={() => setStep("kind")}>رجوع</SecondaryButton>
                <PrimaryButton
                  type="button"
                  data-guide-target="schedule.publish"
                  onClick={create}
                  disabled={busy || (withRequests && !closesAt)}
                >
                  <Link2 />
                  {busy ? "ينشئ الرابط…" : "إنشاء الرابط"}
                </PrimaryButton>
              </div>
            </section>

            <section
              id="publish-step-links"
              className="share-step share-step-links"
              aria-labelledby="publish-step-links-title"
              hidden={step !== "links"}
            >
              <header className="share-step-head">
                <small>الخطوة 3 من 3</small>
                <h3 id="publish-step-links-title">الروابط المنشورة</h3>
                <p>انسخ الرابط أو أضفه إلى التقويم أو أوقفه، من دون تغيير الجدول الأصلي.</p>
              </header>
              {createdId ? (
                <p className="share-created" role="status">
                  <Check aria-hidden="true" /> تم إنشاء الرابط وأصبح جاهزاً للنسخ.
                </p>
              ) : null}
              {/* طلباتُ التعديل تُفتح من البطاقة نفسها، فلا روابطَ منفصلةً تُنسخ
                  هنا. يُقال ما وقع، ويُدلُّ على موضع متابعته. */}
              {issued?.empty ? (
                <p className="share-created share-created-empty" role="status">
                  {issued.empty === "no-instructors"
                    ? "أُنشئت البطاقة، لكن لم تُفتح طلبات تعديل لأحد: لا محاضرة في جدول هذا القسم لهذا الفصل مُسندةٌ إلى أستاذ بعد."
                    : "أُنشئت البطاقة، لكن لم تُفتح طلبات تعديل لأحد: جدول هذا القسم لهذا الفصل فارغ. انسخ الجدول أو أضف محاضراته ثم افتح الطلبات."}
                </p>
              ) : issued ? (
                <p className="share-created" role="status">
                  <Check aria-hidden="true" />
                  {issued.created
                    ? `فُتحت طلبات التعديل لـ${countOf(issued.created, oblique(AR.instructor))}`
                    : "طلبات التعديل مفتوحة من قبل"}
                  {issued.reissued
                    ? ` · ${countOf(issued.reissued, AR.instructor)} يحملون طلباتهم من قبل`
                    : ""}
                  {" — يطلبون من بطاقتهم، وتتابعها في «وارد الأساتذة»."}
                </p>
              ) : null}
              <div className="share-list" role="list" aria-live="polite">
                {publicationLinks.length ? (
                  publicationLinks.map(link => {
                    const expired = new Date(link.expiresAt).getTime() <= Date.now();
                    const dead = expired || Boolean(link.revoked);
                    const status = link.revoked ? "ملغي" : expired ? "منتهٍ" : "فعال";
                    return (
                      <article
                        key={link.id}
                        role="listitem"
                        className={`${dead ? "dead" : "active"} ${createdId === link.id ? "just-created" : ""}`.trim()}
                      >
                        <div className="share-row-lead">
                          <span className={`share-link-kind kind-${link.kind === "staff" ? "staff" : link.kind === "survey" ? "survey" : "department"}`}>
                            {link.kind === "staff"
                              ? <><IdCard aria-hidden="true" /> بطاقة الأستاذ</>
                              : link.kind === "survey"
                              ? <><ClipboardList aria-hidden="true" /> استبيان الطلبة</>
                              : <><Users aria-hidden="true" /> جدول القسم</>}
                          </span>
                          <b dir="ltr" className="share-link-id">
                            /{link.kind === "survey" ? "q" : "s"}/{link.id.slice(0, 10)}…
                          </b>
                          <span>
                            <i aria-hidden="true" />
                            <strong className="share-status">{status}</strong>
                            {!dead ? (
                              <time className="share-expiry" dateTime={link.expiresAt}>
                                {link.kind === "staff" ? "صالح حتى نهاية الفصل " : "ينتهي "}{new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short" }).format(new Date(link.expiresAt))}
                              </time>
                            ) : null}
                            {!dead && link.kind === "staff" && link.requestsCloseAt ? (
                              <time className="share-expiry" dateTime={link.requestsCloseAt}>
                                {" · "}{Date.parse(link.requestsCloseAt) < Date.now() ? "أُغلقت الطلبات" : "الطلبات حتى"} {new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(link.requestsCloseAt))}
                              </time>
                            ) : null}
                            {" · "}
                            {Number(link.views || 0).toLocaleString("ar-KW-u-nu-latn")} فتحة
                          </span>
                        </div>
                        <div className="share-row-actions" aria-label={`إجراءات الرابط ${link.label || link.id.slice(0, 6)}`}>
                          <button
                            type="button"
                            className={qr?.id === link.id ? "active" : ""}
                            title="رمز QR"
                            aria-label="عرض رمز QR للرابط"
                            aria-pressed={qr?.id === link.id}
                            onClick={() => showQr(link.id)}
                            disabled={dead}
                          >
                            <QrCode />
                          </button>
                          <button
                            type="button"
                            title={copied === link.id ? "تم النسخ" : "نسخ الرابط"}
                            aria-label={copied === link.id ? "تم نسخ الرابط" : "نسخ الرابط"}
                            onClick={() => copy(link.id)}
                            disabled={dead}
                          >
                            {copied === link.id ? <Check /> : <Copy />}
                          </button>
                          {link.kind === "staff" ? (
                            <button
                              type="button"
                              title="تسليم البطاقة للأساتذة"
                              aria-label="تسليم البطاقة للأساتذة"
                              onClick={() => setDeliver(link.id)}
                              disabled={dead}
                            >
                              <Send />
                            </button>
                          ) : link.kind === "survey" ? null : (
                            <a
                              href={`/api/public/ics/${link.id}`}
                              title="إضافة إلى التقويم"
                              aria-label="إضافة الرابط إلى التقويم"
                              aria-disabled={dead}
                              tabIndex={dead ? -1 : undefined}
                              className={dead ? "muted" : ""}
                            >
                              <CalendarPlus />
                            </a>
                          )}
                          <button type="button" title="إيقاف الرابط" aria-label="إيقاف الرابط" onClick={() => revoke(link.id)} disabled={dead || busy}>
                            <Trash2 />
                          </button>
                        </div>
                        {qr?.id === link.id ? (
                          <div className="share-qr">
                            <div className="share-qr-code" role="img" aria-label={`رمز QR للرابط ${link.label || link.id.slice(0, 6)}`} dangerouslySetInnerHTML={{ __html: qr.svg }} />
                            <small>وجّه كاميرا الهاتف على الرمز لفتح الجدول المنشور.</small>
                          </div>
                        ) : null}
                        {deliver === link.id ? (
                          <div className="share-deliver">
                            <p className="share-deliver-lead">
                              كل سطر يفتح محادثة واتساب مكتوبة مسبقاً على جهازك، برابطٍ شخصي لا يُفتح إلا لصاحبه. البرنامج لا يرسل شيئاً بنفسه.
                            </p>
                            {/* «طرأ تعديل على جدولك» كانت رسالةً معرَّفةً لا يرسلها أحد: هنا من
                                تغيّر جدولُه منذ أُرسل إليه آخر مرة. */}
                            {changedSinceSent.length ? (
                              <div className="share-deliver-changed">
                                <strong>أبلغ من تغيّر جدولهم ({countOf(changedSinceSent.length, AR.instructor)})</strong>
                                <ul className="share-deliver-list">
                                  {changedSinceSent.map(entry => {
                                    const person = staff.find(item => item.AdInstructorId === entry.instructorId);
                                    const message = person ? reachAboutCard(person, personalUrl(entry.id), "changed") : null;
                                    return (
                                      <li key={entry.id}>
                                        <span className="share-deliver-name">{entry.name}</span>
                                        {message?.href ? (
                                          <a href={message.href} target="_blank" rel="noopener noreferrer"
                                            data-guide-ignore="فتح محادثة واتساب لإبلاغ الأستاذ بتغيّر جدوله — الإرسال بيد المنسّق"
                                            onClick={() => markSent(entry.id)}>
                                            <Send /> أبلغه بالتعديل
                                          </a>
                                        ) : <small className="share-deliver-wait">{message ? "لا رقم جوّال صالح" : "ليس في قائمة هذا القسم الآن"}</small>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : null}
                            {(() => {
                              const missing = unreachable(staff);
                              const reachable = staff.filter(person => whatsappNumber(person.AdInstructorMobile));
                              return (
                                <>
                                  <ul className="share-deliver-list">
                                    {reachable.map(person => {
                                      const personalId = personalFor.get(person.AdInstructorId);
                                      const message = personalId ? reachAboutCard(person, personalUrl(personalId)) : null;
                                      const done = sent.has(person.AdInstructorId);
                                      return (
                                        <li key={person.AdInstructorId} className={done ? "sent" : ""}>
                                          <span className="share-deliver-name">{person.AdInstructorName}</span>
                                          {message?.href ? (
                                            <a
                                              href={message.href}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              data-guide-ignore="فتح محادثة واتساب برابط الأستاذ الشخصي — الإرسال بيد المنسّق"
                                              onClick={() => { setSent(current => new Set(current).add(person.AdInstructorId)); markSent(personalId!); }}
                                            >
                                              {done ? <Check /> : <Send />}
                                              {done ? "فُتحت" : "افتح المحادثة"}
                                            </a>
                                          ) : <small className="share-deliver-wait">يجهّز رابطه الشخصي…</small>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {/* Quietly the most useful thing here: the department
                                      cannot know which records have no number until
                                      something tries to use them. */}
                                  {missing.length ? (
                                    <p className="share-deliver-missing">
                                      {countOf(missing.length, AR.instructor)} بلا رقم جوّال صالح:{" "}
                                      {missing.slice(0, 6).map(person => person.AdInstructorName).join(" · ")}
                                      {missing.length > 6 ? " …" : ""}
                                    </p>
                                  ) : null}
                                  {!reachable.length && !missing.length ? (
                                    <p className="share-deliver-missing">لا أساتذة في هذا النطاق بعد.</p>
                                  ) : null}
                                </>
                              );
                            })()}
                            <GhostButton type="button" onClick={() => setDeliver(null)}>إغلاق التسليم</GhostButton>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="share-empty">لا روابط بعد. ابدأ باختيار نوع الرابط.</p>
                )}
              </div>
              {personalLinks.length ? (
                <section className="share-personal" aria-label="الروابط الشخصية للأساتذة">
                  <header>
                    <strong>الروابط الشخصية ({countOf(livePersonal.length, AR.instructor)})</strong>
                    <small>لكل أستاذٍ رابطٌ لا يُفتح إلا له. أوقف رابطَ أستاذٍ بعينه دون أن يمسّ غيره.</small>
                  </header>
                  <ul>
                    {personalLinks.map(entry => {
                      const dead = entry.revoked || Date.parse(entry.expiresAt) <= Date.now();
                      const when = (value: string) => value ? new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short" }).format(new Date(value)) : "";
                      return (
                        <li key={entry.id} className={dead ? "dead" : ""}>
                          <span className="share-personal-name">{entry.name || "أستاذ"}</span>
                          <small>
                            {dead ? (entry.revoked ? "موقوف" : "منتهٍ")
                              : [entry.lastSentAt ? `أُرسل ${when(entry.lastSentAt)}` : "لم يُرسل بعد",
                                 entry.lastSeenAt ? `فتحه ${when(entry.lastSeenAt)}` : "لم يفتحه بعد",
                                 entry.changedSinceSent ? "تغيّر جدوله بعد الإرسال" : ""].filter(Boolean).join(" · ")}
                          </small>
                          {!dead ? (
                            <button type="button" className="share-personal-revoke"
                              data-guide-ignore="إيقاف الرابط الشخصي لأستاذٍ واحد إجراءٌ مستقلٌّ في قائمة روابط الأساتذة"
                              aria-label={`إيقاف الرابط الشخصي لـ${entry.name || "الأستاذ"}`} title="إيقاف رابطه"
                              disabled={busy}
                              onClick={async () => { await revoke(entry.id); await loadPersonal(); }}>
                              <Trash2 />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              <div className="share-step-actions">
                <SecondaryButton type="button" onClick={() => { setCreatedId(null); setStep("kind"); }}>
                  إنشاء رابط آخر
                </SecondaryButton>
              </div>
            </section>

            <footer>
              <SecondaryButton type="button" onClick={() => setOpen(false)}>إغلاق</SecondaryButton>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}
