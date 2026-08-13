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

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  scopeLabel?: string;
}

const DAY_CHOICES = [7, 30, 90, 180];

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
    [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <GhostButton type="button" onClick={() => setOpen(true)} disabled={!scoped} title="رابط قراءة">
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
          <section className="share-sheet" role="dialog" aria-modal="true" aria-label="نشر رابط قراءة">
            <button className="share-close" type="button" aria-label="إغلاق" title="إغلاق" onClick={() => setOpen(false)}>
              <X />
            </button>
            <header>
              <span className="share-glyph"><QrCode /></span>
              <div>
                <small>رابط قراءة</small>
                <h2>{scopeLabel || "نشر الجدول"}</h2>
              </div>
            </header>

            {error ? <p className="share-error">{error}</p> : null}

            {/* Two kinds of link, one sheet: the whole department's timetable,
                or a card each instructor opens with their own civil ID. */}
            <div className="share-kind" role="group" aria-label="نوع الرابط">
              <button type="button" className={kind === "department" ? "active" : ""} onClick={() => setKind("department")}>
                <Users aria-hidden="true" />
                <span>جدول القسم</span>
                <small>يفتحه أي شخص لديه الرابط</small>
              </button>
              <button type="button" className={kind === "staff" ? "active" : ""} onClick={() => setKind("staff")}>
                <IdCard aria-hidden="true" />
                <span>بطاقة الأستاذ</span>
                <small>كل أستاذ يرى جدوله برقمه المدني</small>
              </button>
            </div>

            <div className="share-compose">
              <div className="share-days" role="group" aria-label="مدة الصلاحية">
                {DAY_CHOICES.map(choice => (
                  <button
                    key={choice}
                    type="button"
                    className={days === choice ? "active" : ""}
                    onClick={() => setDays(choice)}
                  >
                    {choice}
                    <small>يوم</small>
                  </button>
                ))}
              </div>
              {kind === "department" ? (
                <label className="share-toggle">
                  <input type="checkbox" checked={showInstructors} onChange={event => setShowInstructors(event.target.checked)} />
                  <span>إظهار الأساتذة</span>
                </label>
              ) : (
                <p className="share-kind-note">رابط واحد يكفي القسم كله — لا حسابات ولا كلمات سر.</p>
              )}
              <PrimaryButton type="button" onClick={create} disabled={busy}>
                <Link2 />
                رابط جديد
              </PrimaryButton>
            </div>

            <div className="share-list">
              {links.length ? (
                links.map(link => {
                  const expired = new Date(link.expiresAt).getTime() <= Date.now();
                  const dead = expired || link.revoked;
                  return (
                    <article key={link.id} className={dead ? "dead" : ""}>
                      <div className="share-row-lead">
                        <b dir="ltr">
                          {link.kind === "staff" ? <IdCard aria-label="بطاقة أستاذ" /> : null}
                          /s/{link.id.slice(0, 10)}…
                        </b>
                        <span>
                          <i aria-hidden="true" />
                          {dead ? "منتهٍ" : new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short" }).format(new Date(link.expiresAt))}
                          {" · "}
                          {Number(link.views || 0).toLocaleString("ar-KW-u-nu-latn")} فتحة
                        </span>
                      </div>
                      <div className="share-row-actions">
                        <button type="button" title="نسخ الرابط" aria-label="نسخ الرابط" onClick={() => copy(link.id)} disabled={dead}>
                          {copied === link.id ? <Check /> : <Copy />}
                        </button>
                        {link.kind === "staff" ? null : (
                          <a href={`/api/public/ics/${link.id}`} title="تقويم" aria-label="تقويم" className={dead ? "muted" : ""}>
                            <CalendarPlus />
                          </a>
                        )}
                        <button type="button" title="إيقاف" aria-label="إيقاف" onClick={() => revoke(link.id)} disabled={dead || busy}>
                          <Trash2 />
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="share-empty">لا روابط بعد</p>
              )}
            </div>

            <footer>
              <SecondaryButton type="button" onClick={() => setOpen(false)}>إغلاق</SecondaryButton>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
