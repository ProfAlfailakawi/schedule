import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpLeft, CalendarPlus, Check, ClipboardList, Copy, IdCard, Link2, QrCode, Send, Trash2, Users, X } from "lucide-react";
import { reachAboutCard, unreachable, whatsappNumber } from "../utils/reachInstructor";
import type { AdInstructor } from "../types";
import { GhostButton, PrimaryButton, SecondaryButton } from "./ui";

interface ShareLink {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  revoked?: boolean;
  views: number;
  showInstructors: boolean;
  kind?: "department" | "staff" | "survey";
}

type Kind = "department" | "staff";
type PublishStep = "kind" | "options" | "links";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  scopeLabel?: string;
}

const DAY_CHOICES = [7, 30, 90, 180];
const PUBLISH_STEPS: Array<{ id: PublishStep; label: string; hint: string }> = [
  { id: "kind", label: "نوع الرابط", hint: "للقسم أو للأساتذة" },
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

export default function SchedulePublish({ collegeId, sectionId, termId, scopeLabel }: Props) {
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
    [qr, setQr] = useState<{ id: string; svg: string } | null>(null);

  const scoped = Boolean(collegeId && sectionId && termId);

  const load = async () => {
    if (!scoped) return;
    setError(null);
    try {
      const response = await fetch(`/api/share?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const data = await readReply(response, "تعذر قراءة الروابط");
      setLinks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, collegeId, sectionId, termId]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, days, showInstructors, kind })
      });
      const data = await readReply(response, "تعذر إنشاء الرابط");
      setLinks(current => [data, ...current]);
      setCreatedId(data.id);
      setStep("links");
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

  const publicUrl = (id: string) => `${window.location.origin}/s/${id}`;
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

  const publicationLinks = links.filter(link => link.kind !== "survey");
  const active = publicationLinks.filter(link => !link.revoked && new Date(link.expiresAt).getTime() > Date.now());

  /**
   * Student survey is managed in Decision Center. Publishing only carries a
   * signpost to that exact scene, so there is one source of truth for issuing,
   * copying and QR management. The current scope is handed over as well.
   */
  const openStudentSurveyWorkspace = () => {
    try {
      sessionStorage.setItem("schedule-intelligence-tab", "command");
      sessionStorage.setItem("schedule-intelligence-insight", "students");
      sessionStorage.setItem("schedule-intelligence-scope", JSON.stringify({ collegeId, sectionId, termId }));
    } catch {}
    window.location.assign("/Schedule/Intelligence");
  };
  const currentStep = PUBLISH_STEPS.findIndex(item => item.id === step);
  const openDialog = () => {
    setStep("kind");
    setCreatedId(null);
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <GhostButton type="button" onClick={openDialog} disabled={!scoped} title="رابط قراءة">
        <Link2 />
        نشر
        {active.length ? <b className="tool-count">{active.length}</b> : null}
      </GhostButton>

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
            className="share-sheet"
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
              <span className="share-glyph"><QrCode /></span>
              <div>
                <small>رابط قراءة</small>
                <h2 id="schedule-publish-title">{scopeLabel || "نشر الجدول"}</h2>
              </div>
            </header>

            <button
              type="button"
              className="share-survey-shortcut"
              aria-label="افتح استبيان الطلبة في مركز الذكاء"
              onClick={openStudentSurveyWorkspace}
              disabled={!scoped}
            >
              <span className="share-survey-shortcut-icon" aria-hidden="true"><ClipboardList /></span>
              <span className="share-survey-shortcut-copy">
                <strong>استبيان الطلبة</strong>
                <small>اختصار إلى مكانه في مركز الذكاء</small>
              </span>
              <ArrowUpLeft className="share-survey-shortcut-arrow" aria-hidden="true" />
            </button>

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
                      aria-current={step === item.id ? "step" : undefined}
                      aria-controls={`publish-step-${item.id}`}
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
                <small>الخطوة ١ من ٣</small>
                <h3 id="publish-step-kind-title">لمن سيُنشر الجدول؟</h3>
                <p>اختر تجربة القراءة المناسبة؛ يمكن إدارة النوعين من المكان نفسه.</p>
              </header>
              <div className="share-kind" role="group" aria-label="نوع الرابط">
                <button
                  type="button"
                  className={kind === "department" ? "active" : ""}
                  onClick={() => setKind("department")}
                  aria-pressed={kind === "department"}
                >
                  <Users aria-hidden="true" />
                  <span>جدول القسم</span>
                  <small>يفتحه أي شخص لديه الرابط</small>
                </button>
                <button
                  type="button"
                  className={kind === "staff" ? "active" : ""}
                  onClick={() => setKind("staff")}
                  aria-pressed={kind === "staff"}
                >
                  <IdCard aria-hidden="true" />
                  <span>بطاقة الأستاذ</span>
                  <small>كل أستاذ يرى جدوله برقمه المدني</small>
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
                <small>الخطوة ٢ من ٣</small>
                <h3 id="publish-step-options-title">مدة الرابط وما سيظهر فيه</h3>
                <p>{kind === "department" ? "رابط قراءة عام للجدول ضمن الصلاحية المحددة." : "مدخل واحد آمن يفتح لكل أستاذ بطاقته فقط."}</p>
              </header>
              <div className="share-compose">
                <div className="share-days" role="group" aria-label="مدة الصلاحية">
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
                </div>
                {kind === "department" ? (
                  <label className="share-toggle">
                    <input type="checkbox" checked={showInstructors} onChange={event => setShowInstructors(event.target.checked)} />
                    <span>إظهار أسماء الأساتذة</span>
                  </label>
                ) : (
                  <p className="share-kind-note">رابط واحد يكفي القسم كله — لا حسابات ولا كلمات سر.</p>
                )}
              </div>
              <dl className="share-choice-summary" aria-label="ملخص إعداد الرابط">
                <div><dt>النوع</dt><dd>{kind === "department" ? "جدول القسم" : "بطاقات الأساتذة"}</dd></div>
                <div><dt>الصلاحية</dt><dd>{days.toLocaleString("ar-KW-u-nu-latn")} يوم</dd></div>
                {kind === "department" ? <div><dt>الأساتذة</dt><dd>{showInstructors ? "تظهر أسماؤهم" : "مخفية أسماؤهم"}</dd></div> : null}
              </dl>
              <div className="share-step-actions">
                <SecondaryButton type="button" onClick={() => setStep("kind")}>رجوع</SecondaryButton>
                <PrimaryButton type="button" onClick={create} disabled={busy}>
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
                <small>الخطوة ٣ من ٣</small>
                <h3 id="publish-step-links-title">الروابط المنشورة</h3>
                <p>انسخ الرابط أو أضفه إلى التقويم أو أوقفه، من دون تغيير الجدول الأصلي.</p>
              </header>
              {createdId ? (
                <p className="share-created" role="status">
                  <Check aria-hidden="true" /> تم إنشاء الرابط وأصبح جاهزاً للنسخ.
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
                          <b dir="ltr">
                            {link.kind === "staff" ? <IdCard aria-label="بطاقة أستاذ" /> : null}
                            /s/{link.id.slice(0, 10)}…
                          </b>
                          <span>
                            <i aria-hidden="true" />
                            <strong className="share-status">{status}</strong>
                            {!dead ? (
                              <time className="share-expiry" dateTime={link.expiresAt}>
                                ينتهي {new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short" }).format(new Date(link.expiresAt))}
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
                          ) : (
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
                              كل سطر يفتح محادثة واتساب مكتوبة مسبقاً على جهازك. البرنامج لا يرسل شيئاً بنفسه.
                            </p>
                            {(() => {
                              const missing = unreachable(staff);
                              const reachable = staff.filter(person => whatsappNumber(person.AdInstructorMobile));
                              return (
                                <>
                                  <ul className="share-deliver-list">
                                    {reachable.map(person => {
                                      const message = reachAboutCard(person, publicUrl(link.id));
                                      const done = sent.has(person.AdInstructorId);
                                      return (
                                        <li key={person.AdInstructorId} className={done ? "sent" : ""}>
                                          <span className="share-deliver-name">{person.AdInstructorName}</span>
                                          <a
                                            href={message.href || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => setSent(current => new Set(current).add(person.AdInstructorId))}
                                          >
                                            {done ? <Check /> : <Send />}
                                            {done ? "فُتحت" : "افتح المحادثة"}
                                          </a>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  {/* Quietly the most useful thing here: the department
                                      cannot know which records have no number until
                                      something tries to use them. */}
                                  {missing.length ? (
                                    <p className="share-deliver-missing">
                                      {missing.length.toLocaleString("ar-KW-u-nu-latn")} أستاذاً بلا رقم جوّال صالح:{" "}
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
