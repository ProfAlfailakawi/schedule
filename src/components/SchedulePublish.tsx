import React, { useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, IdCard, Link2, QrCode, Trash2, Users, X } from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "./ui";

interface ShareLink {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  revoked?: boolean;
  views: number;
  showInstructors: boolean;
  kind?: "department" | "staff";
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

  const active = links.filter(link => !link.revoked && new Date(link.expiresAt).getTime() > Date.now());
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

      {open ? (
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
                {links.length ? (
                  links.map(link => {
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
                          {link.kind === "staff" ? null : (
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
      ) : null}
    </>
  );
}
