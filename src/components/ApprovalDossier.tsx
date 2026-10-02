/**
 * ── ملف الاعتماد ────────────────────────────────────────────────────────────
 *
 * ورقةٌ واحدة تجمع ما تبحث عنه لجنةُ الاعتماد في أربع شاشات: ما تغيّر منذ
 * الجدول المعتمد، وما بقي يمنع، ومن وقّع ومتى، وحالُ القسم. تُعرض معاينةً على
 * الشاشة وتُطبع A4 كما هي (PrintPortal) — الورقةُ نفسها في الموضعين.
 *
 * لا تخترع شيئاً: تقرأ سجلّ الاعتماد وتقرير التغييرات (من
 * /api/reports/schedule-changes بأساس وثيقة الهيئة) وجاهزيةَ المراجعة، وكلُّ
 * قراءةٍ موسومةٌ بنطاقها (createScopeGuard) فلا يُعرض قسمٌ تحت اسم قسمٍ آخر.
 * ما لم يصل يُكتب فيه «غير متوفر».
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CalendarClock, CalendarPlus, CalendarX, CheckCircle2, CircleDashed, FileCheck, Hourglass,
  PenLine, Printer, Send, ShieldCheck, Undo2, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PrintPortal, useDialogDismiss } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { approvalScopeKey, createScopeGuard } from "../utils/approvalScope";
import {
  buildApprovalDossier, type ApprovalDossierModel, type DossierKind, type DossierReadiness, type DossierReport, type DossierTimelineStep,
} from "../utils/approvalDossier";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  collegeName?: string;
  sectionName?: string;
  termName?: string;
  onClose: () => void;
}

const getJson = async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, { credentials: "include", signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error || "تعذّرت القراءة"));
  return body;
};

const KIND_ICON: Record<DossierKind, LucideIcon> = { added: CalendarPlus, modified: CalendarClock, removed: CalendarX };
const STEP_ICON: Record<DossierTimelineStep["kind"], LucideIcon> = {
  submitted: Send, returned: Undo2, accepted: BadgeCheck, signed: PenLine, "head-returned": Undo2,
};

const NotAvailable = () => <span className="ad-na">غير متوفر</span>;

function Ring({ percent }: { percent: number }) {
  const radius = 26, circumference = 2 * Math.PI * radius;
  return (
    <svg className="ad-ring" viewBox="0 0 64 64" role="img" aria-label={`${percent}% من الجدول لم يتغيّر`}>
      <circle className="ad-ring-track" cx="32" cy="32" r={radius} />
      <circle className="ad-ring-fill" cx="32" cy="32" r={radius} strokeDasharray={`${(percent / 100) * circumference} ${circumference}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36.5" textAnchor="middle">{percent}%</text>
    </svg>
  );
}

/** الورقة نفسها: معاينةً وطباعةً. */
export function ApprovalDossierSheet({ model }: { model: ApprovalDossierModel }) {
  const { changes, baseline, approval, blockers } = model;
  const scopeLine = [model.names.section, model.names.college, model.names.term].filter(Boolean).join(" · ");
  return (
    <article className="ad-sheet" dir="rtl" aria-label="ملف الاعتماد">
      <header className="ad-head">
        <span className="ad-head-icon" aria-hidden="true"><FileCheck /></span>
        <div className="ad-head-copy">
          <h1>ملف الاعتماد</h1>
          {scopeLine ? <p>{scopeLine}</p> : null}
        </div>
        {approval.available ? (
          <span className="ad-status" data-tone={approval.tone}>{approval.statusLabel}{approval.roundLabel ? ` · ${approval.roundLabel}` : ""}</span>
        ) : null}
      </header>

      <section className="ad-baseline" aria-label="أساس المقارنة">
        <strong>{baseline.title}</strong>
        <span>{baseline.sourceLine || <NotAvailable />}</span>
      </section>

      <section className="ad-changes" aria-label="ما تغيّر">
        {changes.available ? (
          <>
            <div className="ad-tiles">
              {changes.tiles.map(tile => {
                const Icon = KIND_ICON[tile.kind];
                return (
                  <div className="ad-tile" data-kind={tile.kind} key={tile.kind}>
                    <span className="ad-tile-icon" aria-hidden="true"><Icon /></span>
                    <b>{tile.count}</b>
                    <span className="ad-tile-label">{tile.label}</span>
                    {changes.total ? <small dir="ltr">{tile.percent}%</small> : null}
                  </div>
                );
              })}
              {changes.stablePercent !== null ? (
                <div className="ad-tile ad-tile-ring">
                  <Ring percent={changes.stablePercent} />
                  <span className="ad-tile-label">من الجدول لم يتغيّر</span>
                </div>
              ) : null}
            </div>
            {changes.total ? (
              <div className="ad-bar" role="img" aria-label="توزيع التغييرات">
                {changes.tiles.filter(tile => tile.count).map(tile => <i key={tile.kind} data-kind={tile.kind} style={{ flexBasis: `${tile.percent}%` }} />)}
              </div>
            ) : (
              <p className="ad-calm"><CheckCircle2 aria-hidden="true" /> لم يتغيّر شيء عن أساس المقارنة.</p>
            )}
          </>
        ) : (
          <p className="ad-calm"><CircleDashed aria-hidden="true" /> التغييرات: <NotAvailable /></p>
        )}
      </section>

      <div className="ad-columns">
        <section className="ad-card" aria-label="مسار الاعتماد">
          <h2><ShieldCheck aria-hidden="true" /> مسار الاعتماد</h2>
          {!approval.available ? <p className="ad-calm"><NotAvailable /></p> : (
            <>
              <div className="ad-signs">
                <span data-done={approval.signedByCommittee ? "true" : "false"}>{approval.signedByCommittee ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />} لجنة الجدول</span>
                <span data-done={approval.signedByHead ? "true" : "false"}>{approval.signedByHead ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />} رئيس القسم</span>
              </div>
              {model.timeline.length ? (
                <ol className="ad-timeline">
                  {model.timeline.map(step => {
                    const Icon = STEP_ICON[step.kind];
                    return (
                      <li key={step.id} data-kind={step.kind}>
                        <span className="ad-dot" aria-hidden="true"><Icon /></span>
                        <div>
                          <strong>{step.title}</strong>
                          <span className="ad-meta">
                            {step.by ? <bdi>{step.by}</bdi> : null}
                            {step.date ? <time dir="ltr">{step.date}</time> : null}
                          </span>
                          {step.detail ? <small>{step.detail}</small> : null}
                          {step.verifyCode ? <small>رمز التحقق: <code dir="ltr">{step.verifyCode}</code></small> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="ad-calm">لم يبدأ مسار الاعتماد بعد.</p>}
              {approval.changedSinceSignature ? <p className="ad-note">{approval.changedSinceSignature}</p> : null}
              {approval.headReturn ? <p className="ad-note">أرجعه رئيس القسم في {approval.headReturn.date}{approval.headReturn.reason ? `: ${approval.headReturn.reason}` : ""}</p> : null}
            </>
          )}
        </section>

        <section className="ad-card" aria-label="ما يمنع الاعتماد">
          <h2><AlertTriangle aria-hidden="true" /> ما يمنع الاعتماد</h2>
          {!blockers.available ? <p className="ad-calm"><NotAvailable /></p> : blockers.clear ? (
            <p className="ad-calm ad-ok"><CheckCircle2 aria-hidden="true" /> لا موانع قائمة.</p>
          ) : (
            <>
              {blockers.summary ? <p className="ad-blockers-summary">{blockers.summary}.</p> : null}
              {blockers.blocking.length ? (
                <ul className="ad-blockers">
                  {blockers.blocking.map((item, index) => <li key={`${item.title}:${index}`}><strong>{item.title}</strong>{item.detail ? <small>{item.detail}</small> : null}</li>)}
                </ul>
              ) : null}
              {blockers.blockingCount > blockers.blocking.length ? <p className="ad-more">و{countOf(blockers.blockingCount - blockers.blocking.length, AR.approvalBlocker)} آخر</p> : null}
            </>
          )}
          {blockers.warningCount ? <p className="ad-note"><Hourglass aria-hidden="true" /> {countOf(blockers.warningCount, AR.alert)} للعلم — لا تمنع الاعتماد.</p> : null}
          {approval.pendingAdditionsLabel && !blockers.summary ? <p className="ad-note">{approval.pendingAdditionsLabel}.</p> : null}
        </section>
      </div>

      {changes.available && model.groups.length ? (
        <section className="ad-list" aria-label="التغييرات بحسب المقرر">
          <h2>التغييرات بحسب المقرر</h2>
          <div className="ad-courses">
          {model.groups.map(group => (
            <div className="ad-course" key={group.key}>
              <h3>{group.code ? <code dir="ltr">{group.code}</code> : null} {group.course}</h3>
              <ul>
                {group.items.map(item => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <li key={`${item.kind}:${item.scheduleId}`} data-kind={item.kind}>
                      <span className="ad-item-icon" aria-hidden="true"><Icon /></span>
                      <div>
                        <strong>{item.section ? <>شعبة <bdi>{item.section}</bdi></> : null}{item.section && item.where ? " · " : ""}{item.where}</strong>
                        {item.lines.map((line, index) => <small key={index}>{line}</small>)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          </div>
          {model.hiddenLabel ? <p className="ad-more">{model.hiddenLabel}</p> : null}
        </section>
      ) : null}

      <footer className="ad-foot">
        <span>طُبع بتاريخ <time dir="ltr">{model.printedOn}</time></span>
        <span>يعرض ما سجّله النظام فقط؛ وما لم يتوفر مكتوبٌ «غير متوفر».</span>
      </footer>
    </article>
  );
}

export default function ApprovalDossier({ collegeId, sectionId, termId, collegeName, sectionName, termName, onClose }: Props) {
  const scopeKey = approvalScopeKey({ collegeId, sectionId, termId });
  const guardRef = useRef(createScopeGuard());
  if (guardRef.current.scope !== scopeKey) guardRef.current.setScope(scopeKey);
  const [report, setReport] = useState<{ scopeKey: string; data: DossierReport } | null>(null);
  const [readiness, setReadiness] = useState<{ scopeKey: string; data: DossierReadiness } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDialogDismiss(true, onClose);

  useEffect(() => {
    /* قراءةُ نطاقٍ سابق لا تبقى معروضةً تحت النطاق الجديد، ولو لحظة. */
    setReport(null); setReadiness(null); setError(null);
    const controller = new AbortController();
    const token = guardRef.current.begin(scopeKey);
    const query = `collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`;
    void getJson(`/api/reports/schedule-changes?${query}&baseline=authority`, controller.signal)
      .then(data => { if (guardRef.current.accepts(token)) setReport({ scopeKey, data }); })
      .catch(e => { if (e?.name !== "AbortError" && guardRef.current.accepts(token)) setError(e.message); });
    void getJson(`/api/schedules/review-readiness?${query}`, controller.signal)
      .then(data => { if (guardRef.current.accepts(token)) setReadiness({ scopeKey, data }); })
      .catch(() => { /* غيابها يُكتب «غير متوفر»، لا خطأ يقطع الورقة. */ });
    return () => controller.abort();
  }, [collegeId, sectionId, termId, scopeKey]);

  const model = useMemo(() => buildApprovalDossier({
    scope: { collegeId, sectionId, termId },
    names: { college: collegeName, section: sectionName, term: termName },
    report, readiness, printedAt: new Date(),
  }), [collegeId, sectionId, termId, collegeName, sectionName, termName, report, readiness]);

  const printIt = () => {
    const root = document.documentElement;
    root.dataset.printKind = "approval-dossier";
    const done = () => { delete root.dataset.printKind; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done, { once: true });
    window.setTimeout(() => { try { window.print(); } catch { done(); } }, 30);
    window.setTimeout(done, 4000);
  };
  const ready = model.state === "ok";

  return (
    <div className="ad-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ad-dialog" role="dialog" aria-modal="true" aria-label="ملف الاعتماد">
        <div className="ad-toolbar">
          <button type="button" className="ad-btn ad-btn-primary" disabled={!ready} onClick={printIt} data-guide-ignore="طباعة ملف الاعتماد — فعلٌ داخل نافذة المعاينة التي فُتحت من زر «ملف الاعتماد»">
            <Printer aria-hidden="true" /> طباعة
          </button>
          <button type="button" className="ad-btn" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق نافذة المعاينة — تنقّلٌ لا فعل">
            <X aria-hidden="true" /> إغلاق
          </button>
        </div>
        <div className="ad-scroll">
          {error && !ready ? <p className="ad-state" role="alert">{error}</p>
            : !ready ? <p className="ad-state" role="status">يجمع ملف الاعتماد…</p>
            : <ApprovalDossierSheet model={model} />}
        </div>
      </div>
      {ready ? <PrintPortal className="approval-dossier-print-host"><ApprovalDossierSheet model={model} /></PrintPortal> : null}
    </div>
  );
}
