import React, { useState } from "react";
import { ArrowLeftRight, CheckCircle2, ListPlus, Link2, ShieldAlert, Wand2 } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";

/**
 * ── تطبيق الصحيفة المرجعية على الكتالوج ─────────────────────────────────────────
 *
 * الصحيفة هي المرجع: ما خالفها في الكتالوج يُصحَّح (اسماً ووحداتٍ وساعات)، والناقص يُضاف في
 * قسمه المالك، ومقررات القسم تُربط بصحيفته، وتُنشأ مسوّدة قواعد لا تُعتمد. للحساب الرئيسي وحده.
 * المعاينة والتطبيق من نداء الخادم نفسه، فما تقرؤه هنا هو ما سيُكتب.
 */

interface Site {
  sectionId: number; collegeName: string; branch: string; planNote: string; planId: string | null; applied: boolean;
  updates: Array<{ code: string; before: { name: string; credit: number; hours: number }; after: { name: string; credit: number; hours: number }; identityChange: boolean; frozen?: boolean }>;
  held: Array<{ code: string; before: { name: string }; after: { name: string } }>;
  creates: Array<{ code: string; name: string }>;
  links: Array<{ code: string }>;
  skipped: Array<{ code: string; name: string; reason: string }>;
  notes: string[];
  courseCount?: number; rules: number; groups: number;
}
interface Report { referenceId: string; dryRun: boolean; sites: Site[] }

const post = async (body: unknown): Promise<Report> => {
  const response = await fetch("/api/plan-review/reference/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); }
  if (!response.ok) throw new Error(data.error || "تعذّر تطبيق الصحيفة.");
  return data;
};

export default function ReferenceApplyPanel({ referenceId, referenceName, onApplied }: { key?: React.Key; referenceId: string; referenceName: string; onApplied: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmIdentity, setConfirmIdentity] = useState(false);
  const [done, setDone] = useState(false);

  const look = async () => {
    setBusy(true); setError(""); setDone(false); setConfirmIdentity(false);
    try { setReport(await post({ referenceId, dryRun: true })); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError("");
    try { setReport(await post({ referenceId, dryRun: false, confirmIdentity })); setDone(true); onApplied(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const sites = report?.sites || [];
  const anyHeld = sites.some(site => site.held?.length);
  const totals = sites.reduce((sum, site) => ({
    updates: sum.updates + site.updates.length, creates: sum.creates + site.creates.length, links: sum.links + site.links.length, skipped: sum.skipped + site.skipped.length,
  }), { updates: 0, creates: 0, links: 0, skipped: 0 });

  return (
    <section className="rap" aria-label="تطبيق الصحيفة المرجعية">
      <header className="rap-head">
        <span className="rap-ic" aria-hidden="true"><Wand2 /></span>
        <div><b>طبّق «{referenceName}» على الكتالوج</b><small>تصحيح الأسماء والوحدات والساعات، وإضافة الناقص، وربط مقررات كل قسم بصحيفته، وبناء مسوّدة قواعد للمراجعة. تُعاين أولاً ولا يُكتب شيء قبل تأكيدك.</small></div>
        {!report ? <PrimaryButton type="button" disabled={busy} onClick={look} data-guide-ignore="معاينة تطبيق الصحيفة المرجعية على الكتالوج؛ لا يكتب شيئاً">{busy ? "جارٍ الفحص…" : "عاين ما سيتغيّر"}</PrimaryButton> : null}
      </header>
      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {report ? (
        <div className="rap-body">
          <p className="rap-totals" role="status">
            {totals.updates ? <span><ArrowLeftRight aria-hidden="true" /> تصحيح {countOf(totals.updates, AR.course)}</span> : null}
            {totals.creates ? <span><ListPlus aria-hidden="true" /> إضافة {countOf(totals.creates, AR.course)}</span> : null}
            {totals.links ? <span><Link2 aria-hidden="true" /> ربط {countOf(totals.links, AR.course)}</span> : null}
            {totals.skipped ? <span>استبعاد {countOf(totals.skipped, AR.course)}</span> : null}
            {!totals.updates && !totals.creates && !totals.links && !totals.skipped ? <span><CheckCircle2 aria-hidden="true" /> الكتالوج مطابق لهذه الصحيفة</span> : null}
          </p>
          <ul className="rap-sites">
            {sites.map(site => (
              <li key={site.sectionId} className="rap-site">
                <div className="rap-site-head"><b>{site.collegeName}</b><small>{site.branch === "012" ? "فرع البنات" : site.branch === "011" ? "فرع البنين" : "فرع غير معروف"}{site.courseCount ? ` · ${countOf(site.courseCount, AR.course)} في صحيفته` : ""}</small></div>
                {site.planNote ? <Notice type="info" inline>{site.planNote}</Notice> : null}
                <ul className="rap-lines">
                  {site.updates.length ? <li>تصحيح {countOf(site.updates.length, AR.course)}: {site.updates.slice(0, 3).map(row => `${row.before.name} ← ${row.after.name}`).join("، ")}{site.updates.length > 3 ? "…" : ""}</li> : null}
                  {site.creates.length ? <li>إضافة {countOf(site.creates.length, AR.course)} ناقصاً في كتالوج أقسامها</li> : null}
                  {site.links.length ? <li>ربط {countOf(site.links.length, AR.course)} بصحيفة القسم</li> : null}
                  {site.skipped.length ? <li title={site.skipped.map(row => `${row.name}: ${row.reason}`).join("\n")}>استبعاد {countOf(site.skipped.length, AR.course)}: {[...new Set(site.skipped.map(row => row.reason))].join("؛ ")}</li> : null}
                  {site.held?.length ? <li className="rap-held"><ShieldAlert aria-hidden="true" /> {countOf(site.held.length, AR.course)} باسمٍ مجمَّد (في صحيفةٍ انتقالية): {site.held.slice(0, 2).map(row => `${row.before.name} ← ${row.after.name}`).join("، ")}</li> : null}
                  {!site.updates.length && !site.creates.length && !site.links.length && !site.planNote ? <li>مطابق: لا شيء يتغيّر.</li> : null}
                  {site.applied ? <li className="rap-done"><CheckCircle2 aria-hidden="true" /> طُبّق · {countOf(site.rules, AR.course)} بقواعد في المسوّدة</li> : null}
                </ul>
                {site.notes.length ? <details className="rap-notes"><summary>{countOf(site.notes.length, AR.note)}</summary><ul>{site.notes.slice(0, 12).map((note, i) => <li key={i}>{note}</li>)}</ul></details> : null}
              </li>
            ))}
          </ul>
          {!done ? (
            <div className="rap-actions">
              {anyHeld ? (
                <label className="rap-confirm"><input type="checkbox" checked={confirmIdentity} onChange={e => setConfirmIdentity(e.target.checked)} /> أؤكد تغيير الأسماء المجمَّدة إلى ما في الصحيفة (الوحدات والساعات تُصحَّح في كل حال)</label>
              ) : null}
              <PrimaryButton type="button" disabled={busy} onClick={apply} data-guide-ignore="تأكيد كتابة الصحيفة المرجعية في الكتالوج">{busy ? "جارٍ الكتابة…" : "اعتمد التطبيق"}</PrimaryButton>
              <SecondaryButton type="button" disabled={busy} onClick={() => setReport(null)} data-guide-ignore="إغلاق المعاينة دون كتابة">تراجع</SecondaryButton>
            </div>
          ) : <Notice type="success" inline>تم. مسوّدة القواعد قيد المراجعة عند الأقسام، ولا شيء اعتُمد تلقائياً.</Notice>}
        </div>
      ) : null}
    </section>
  );
}
